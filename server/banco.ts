import { existsSync, readFileSync, renameSync } from 'node:fs';
import type { Client, InStatement } from '@libsql/client';
import type { Armazem } from './store';

/**
 * As contas no banco de dados (o libSQL da VM, o mesmo do bot do Discord).
 *
 * O servidor continua trabalhando com as contas **em memória** — é o que faz uma mão não esperar
 * por disco nem por rede. O banco é onde elas ficam: cada conta é uma linha de `pokeru_contas`,
 * com o registro inteiro em JSON (`dados`) e algumas colunas soltas para dar para consultar e
 * administrar (nome, usuário, código de amigo, Discord, última vez vista).
 *
 * A gravação segue o jeito do arquivo: as mudanças são agrupadas por uns segundos e vão numa
 * transação só, e só as contas que **mudaram** desde a última gravação são escritas. Se o banco
 * cair no meio, nada se perde da memória: a gravação é tentada de novo até passar.
 *
 * As tabelas levam o prefixo `pokeru_`: o banco é compartilhado com o bot, e as dele (`accounts`,
 * `users`, `inventory`…) não são tocadas.
 */

/** O formato que as contas têm em memória (o mesmo do arquivo antigo). */
export interface ArquivoDeContas {
  version: number;
  accounts: Record<string, object>;
}

/** As colunas soltas de uma conta, tiradas do registro (a fonte da verdade é `dados`). */
function colunas(doc: Record<string, unknown>) {
  const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const discord = doc.discord as { id?: unknown } | undefined;
  return {
    nome: texto(doc.name),
    usuario: texto(doc.user),
    sub: texto(doc.sub),
    codigo: texto(doc.code),
    discord: texto(discord?.id),
    visto: texto(doc.seen),
  };
}

const ESQUEMA: InStatement[] = [
  `CREATE TABLE IF NOT EXISTS pokeru_contas (
    id TEXT PRIMARY KEY,
    dados TEXT NOT NULL,
    nome TEXT,
    usuario TEXT,
    sub TEXT,
    codigo TEXT,
    discord TEXT,
    visto TEXT,
    atualizado TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS pokeru_contas_sub ON pokeru_contas (sub)',
  'CREATE INDEX IF NOT EXISTS pokeru_contas_codigo ON pokeru_contas (codigo)',
  'CREATE INDEX IF NOT EXISTS pokeru_contas_usuario ON pokeru_contas (usuario)',
];

const UPSERT = `INSERT INTO pokeru_contas (id, dados, nome, usuario, sub, codigo, discord, visto, atualizado)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (id) DO UPDATE SET dados = excluded.dados, nome = excluded.nome, usuario = excluded.usuario,
    sub = excluded.sub, codigo = excluded.codigo, discord = excluded.discord, visto = excluded.visto,
    atualizado = excluded.atualizado`;

function gravar(id: string, json: string, doc: Record<string, unknown>): InStatement {
  const c = colunas(doc);
  return { sql: UPSERT, args: [id, json, c.nome, c.usuario, c.sub, c.codigo, c.discord, c.visto, new Date().toISOString()] };
}

/** Quantas linhas por transação na importação (o arquivo pode ter muitas contas). */
const LOTE = 200;

export interface OpcoesDoBanco {
  db: Client;
  /**
   * O `accounts.json` antigo: se o banco ainda não tem conta nenhuma, as dele entram de uma vez, e
   * o arquivo é renomeado para `.importado` (fica de cópia, e não entra de novo por engano).
   */
  importarDe?: string;
  /** Quanto tempo esperar antes de gravar (ms). */
  espera?: number;
}

export class ContasNoBanco implements Armazem<ArquivoDeContas> {
  readonly onde = 'banco (pokeru_contas)';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sujo = false;
  /** O JSON de cada conta como está gravado no banco — é por ele que se sabe o que mudou. */
  private salvo = new Map<string, string>();
  /** As gravações andam em fila: uma nunca atropela a outra. */
  private fila: Promise<void> = Promise.resolve();
  private fechado = false;

  private constructor(
    private readonly db: Client,
    private data: ArquivoDeContas,
    private readonly espera: number,
  ) {}

  /**
   * Abre o banco: cria as tabelas (se faltarem), importa o arquivo antigo (na primeira vez) e lê
   * todas as contas para a memória. Falha se o banco não responder — o servidor não deve subir
   * vazio e deixar a pessoa entrar sem a conta dela.
   */
  static async abrir(o: OpcoesDoBanco): Promise<ContasNoBanco> {
    await o.db.batch(ESQUEMA, 'write');
    const antes = await o.db.execute('SELECT COUNT(*) AS n FROM pokeru_contas');
    if (Number(antes.rows[0]?.n ?? 0) === 0 && o.importarDe && existsSync(o.importarDe)) {
      await ContasNoBanco.importar(o.db, o.importarDe);
    }
    const r = await o.db.execute('SELECT id, dados FROM pokeru_contas');
    const data: ArquivoDeContas = { version: 1, accounts: {} };
    const store = new ContasNoBanco(o.db, data, o.espera ?? 2000);
    for (const row of r.rows) {
      const id = String(row.id);
      const json = String(row.dados);
      try {
        data.accounts[id] = JSON.parse(json) as object;
        store.salvo.set(id, json);
      } catch {
        // uma linha estragada não derruba as outras: fica no banco, de fora da memória
        console.error(`[dados] conta ${id} com registro ilegível no banco; ficou de fora`);
      }
    }
    return store;
  }

  /** Traz as contas do `accounts.json` antigo para o banco, numa transação por lote. */
  private static async importar(db: Client, arquivo: string): Promise<void> {
    const texto = readFileSync(arquivo, 'utf8');
    const antigo = JSON.parse(texto) as Partial<ArquivoDeContas>;
    const contas = Object.entries(antigo.accounts ?? {});
    for (let i = 0; i < contas.length; i += LOTE) {
      const lote = contas.slice(i, i + LOTE).map(([id, doc]) => gravar(id, JSON.stringify(doc), doc as Record<string, unknown>));
      await db.batch(lote, 'write');
    }
    const n = await db.execute('SELECT COUNT(*) AS n FROM pokeru_contas');
    if (Number(n.rows[0]?.n ?? 0) !== contas.length) {
      throw new Error(`importação incompleta: ${n.rows[0]?.n} de ${contas.length} contas no banco`);
    }
    const copia = `${arquivo}.importado`;
    renameSync(arquivo, copia);
    console.log(`[dados] ${contas.length} contas importadas de ${arquivo} para o banco (o arquivo ficou em ${copia})`);
  }

  get(): ArquivoDeContas {
    return this.data;
  }

  /** Marca que mudou: a gravação sai em bloco, alguns segundos depois. */
  touch(): void {
    this.sujo = true;
    if (this.timer || this.fechado) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.espera);
    this.timer.unref?.();
  }

  /**
   * Grava agora o que mudou (sem esperar o banco responder: a gravação entra na fila).
   *
   * O que vai é uma foto tirada **neste instante**. Uma conta que mudar enquanto a gravação corre
   * fica diferente da foto, e a próxima gravação a leva.
   */
  flush(): void {
    if (!this.sujo) return;
    this.sujo = false;
    const escrever: { id: string; json: string; doc: Record<string, unknown> }[] = [];
    for (const [id, doc] of Object.entries(this.data.accounts)) {
      const json = JSON.stringify(doc);
      if (this.salvo.get(id) !== json) escrever.push({ id, json, doc: doc as Record<string, unknown> });
    }
    const apagar = [...this.salvo.keys()].filter((id) => !(id in this.data.accounts));
    if (!escrever.length && !apagar.length) return;

    const stmts: InStatement[] = [
      ...escrever.map((e) => gravar(e.id, e.json, e.doc)),
      ...apagar.map((id) => ({ sql: 'DELETE FROM pokeru_contas WHERE id = ?', args: [id] })),
    ];
    this.fila = this.fila
      .then(() => this.db.batch(stmts, 'write'))
      .then(
        () => {
          for (const e of escrever) this.salvo.set(e.id, e.json);
          for (const id of apagar) this.salvo.delete(id);
        },
        (err: unknown) => {
          // nada se perde: a memória continua com tudo, e a próxima rodada tenta de novo
          console.error(`[dados] falha ao gravar ${stmts.length} conta(s) no banco — tento de novo:`, err instanceof Error ? err.message : err);
          this.sujo = true;
          if (!this.fechado) this.touch();
        },
      );
  }

  /** Espera as gravações pendentes (é o que o desligamento chama). */
  async close(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.flush();
    this.fechado = true;
    await this.fila;
    // última tentativa, se a da fila falhou
    if (this.sujo) {
      this.sujo = true;
      this.fechado = false;
      this.flush();
      this.fechado = true;
      await this.fila;
    }
    this.db.close();
  }
}
