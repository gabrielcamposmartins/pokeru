import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client, InStatement } from '@libsql/client';
import { createClient } from '@libsql/client/web';
import { ContasNoBanco } from './banco';
import { Accounts } from './accounts';
import type { AccountProfile } from '../shared/accounts';

/**
 * As contas no banco de dados.
 *
 * O que se protege aqui é o que importa numa troca de armazenamento: a primeira subida traz as
 * contas do arquivo antigo **inteiras**; o que muda é gravado (e só o que muda); uma queda do banco
 * não perde nada; e um reinício do servidor volta com tudo como estava.
 *
 * Duas camadas: um banco de mentira em memória (roda sempre, inclusive no CI) e, quando
 * `POKERU_DB_TESTE_URL` aponta para um libSQL de verdade, o mesmo roteiro contra ele.
 */

const dirs: string[] = [];
function pasta(): string {
  const d = mkdtempSync(join(tmpdir(), 'pokeru-banco-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const profile = (name = 'Gabi'): AccountProfile =>
  ({ name, avatar: { color: '#fff', icon: '♠' }, cosmetics: { character: { id: 'marina' } } }) as unknown as AccountProfile;

/**
 * Um libSQL de mentira: guarda `pokeru_contas` num Map e entende só as frases que o armazém usa.
 * `falhar` faz a próxima gravação dar erro (o banco caindo no meio).
 */
function bancoDeMentira() {
  const linhas = new Map<string, { dados: string; nome: unknown; codigo: unknown }>();
  const estado = { falhar: 0, gravacoes: 0, linhasGravadas: 0 };
  const rodar = (st: InStatement) => {
    const sql = typeof st === 'string' ? st : st.sql;
    const args = (typeof st === 'string' ? [] : (st.args as unknown[])) ?? [];
    if (/^\s*CREATE/i.test(sql)) return { rows: [] };
    if (/SELECT COUNT/i.test(sql)) return { rows: [{ n: linhas.size }] };
    if (/SELECT id, dados/i.test(sql)) return { rows: [...linhas].map(([id, l]) => ({ id, dados: l.dados })) };
    if (/^\s*INSERT/i.test(sql)) {
      linhas.set(String(args[0]), { dados: String(args[1]), nome: args[2], codigo: args[5] });
      estado.linhasGravadas++;
      return { rows: [] };
    }
    if (/^\s*DELETE/i.test(sql)) {
      linhas.delete(String(args[0]));
      return { rows: [] };
    }
    throw new Error(`frase inesperada: ${sql}`);
  };
  const db = {
    async execute(st: InStatement) {
      return rodar(st);
    },
    async batch(sts: InStatement[]) {
      if (estado.falhar > 0) {
        estado.falhar--;
        throw new Error('banco fora do ar');
      }
      // transação: ou vai tudo, ou nada
      const antes = new Map(linhas);
      try {
        const r = sts.map(rodar);
        estado.gravacoes++;
        return r;
      } catch (e) {
        linhas.clear();
        for (const [k, v] of antes) linhas.set(k, v);
        throw e;
      }
    },
    close() {},
  } as unknown as Client;
  return { db, linhas, estado };
}

/** Espera a fila de gravações do armazém esvaziar. */
const esvaziar = () => new Promise((r) => setTimeout(r, 20));

describe('contas no banco (banco de mentira)', () => {
  it('a primeira subida importa o accounts.json inteiro e guarda o arquivo como cópia', async () => {
    const d = pasta();
    const arquivo = join(d, 'accounts.json');
    const contas = {
      'a-1': { id: 'a-1', name: 'Gabs', user: 'gabs', code: 'K7M2PQ', sub: '42', discord: { id: '343', username: 'gabss2' }, stats: { hands: 142 }, bond: { tobi: { points: 60 } } },
      'a-2': { id: 'a-2', name: 'Edu', code: 'RJ4K7P', stats: { hands: 14 } },
    };
    writeFileSync(arquivo, JSON.stringify({ version: 1, accounts: contas }));
    const { db, linhas } = bancoDeMentira();

    const store = await ContasNoBanco.abrir({ db, importarDe: arquivo });
    // tudo veio, campo por campo
    expect(store.get().accounts).toEqual(contas);
    expect(linhas.size).toBe(2);
    expect(JSON.parse(linhas.get('a-1')!.dados)).toEqual(contas['a-1']);
    // as colunas soltas saem do registro
    expect(linhas.get('a-1')!.nome).toBe('Gabs');
    expect(linhas.get('a-1')!.codigo).toBe('K7M2PQ');
    // o arquivo vira cópia e não é importado de novo
    expect(existsSync(arquivo)).toBe(false);
    expect(existsSync(`${arquivo}.importado`)).toBe(true);
  });

  it('com contas no banco, o arquivo antigo não é importado (nem mexido)', async () => {
    const d = pasta();
    const arquivo = join(d, 'accounts.json');
    writeFileSync(arquivo, JSON.stringify({ version: 1, accounts: { 'a-velha': { id: 'a-velha' } } }));
    const { db, linhas } = bancoDeMentira();
    linhas.set('a-1', { dados: JSON.stringify({ id: 'a-1', name: 'Gabs' }), nome: 'Gabs', codigo: null });

    const store = await ContasNoBanco.abrir({ db, importarDe: arquivo });
    expect(Object.keys(store.get().accounts)).toEqual(['a-1']);
    expect(existsSync(arquivo)).toBe(true);
  });

  it('grava só as contas que mudaram', async () => {
    const { db, linhas, estado } = bancoDeMentira();
    linhas.set('a-1', { dados: JSON.stringify({ id: 'a-1', money: 10 }), nome: null, codigo: null });
    linhas.set('a-2', { dados: JSON.stringify({ id: 'a-2', money: 20 }), nome: null, codigo: null });
    const store = await ContasNoBanco.abrir({ db, espera: 5 });

    (store.get().accounts['a-2'] as { money: number }).money = 99;
    store.touch();
    await new Promise((r) => setTimeout(r, 30));
    expect(estado.linhasGravadas).toBe(1);
    expect(JSON.parse(linhas.get('a-2')!.dados).money).toBe(99);

    // nada mudou: nada vai
    store.touch();
    await new Promise((r) => setTimeout(r, 30));
    expect(estado.linhasGravadas).toBe(1);
  });

  it('com o banco fora do ar, nada se perde: a gravação é tentada de novo até passar', async () => {
    const { db, linhas, estado } = bancoDeMentira();
    const store = await ContasNoBanco.abrir({ db, espera: 5 });
    estado.falhar = 2;
    store.get().accounts['a-9'] = { id: 'a-9', name: 'Nova' };
    store.touch();
    await new Promise((r) => setTimeout(r, 80));
    expect(linhas.has('a-9')).toBe(true);
  });

  it('fechar espera a última gravação', async () => {
    const { db, linhas } = bancoDeMentira();
    const store = await ContasNoBanco.abrir({ db, espera: 60_000 });
    store.get().accounts['a-7'] = { id: 'a-7' };
    store.touch();
    await store.close();
    expect(linhas.has('a-7')).toBe(true);
  });

  it('com as contas de verdade: o que se joga sobrevive a um reinício do servidor', async () => {
    const { db } = bancoDeMentira();
    const primeiro = new Accounts({ store: await ContasNoBanco.abrir({ db }), startingMoney: 5000 });
    const a = primeiro.login(undefined, profile('Gabi'))!;
    primeiro.charge(a.id, 1500);
    primeiro.bond(a.id, 'tobi', 'win');
    await primeiro.close();

    // servidor reiniciado: memória zerada, mesmo banco
    const segundo = new Accounts({ store: await ContasNoBanco.abrir({ db }) });
    const volta = segundo.login({ id: a.id, token: a.token! }, profile('Gabi'))!;
    expect(volta.id).toBe(a.id);
    expect(volta.money).toBe(3500);
    expect(volta.bond.tobi.wins).toBe(1);
    expect(volta.code).toBe(a.code);
    await segundo.close();
    await esvaziar();
  });
});

/*
 * O mesmo roteiro contra um libSQL de verdade (o da VM usa a mesma imagem):
 *   docker run -d -p 18080:8080 ghcr.io/tursodatabase/libsql-server
 *   POKERU_DB_TESTE_URL=http://127.0.0.1:18080 npx vitest run server/banco.test.ts
 */
const URL_DE_TESTE = process.env.POKERU_DB_TESTE_URL;

describe.skipIf(!URL_DE_TESTE)('contas no banco (libSQL de verdade)', () => {
  const abrirDb = async () => {
    const db = createClient({ url: URL_DE_TESTE! });
    return db;
  };

  it('importa, grava, reinicia e volta com tudo — pela rede, no mesmo servidor da VM', async () => {
    const limpar = await abrirDb();
    await limpar.execute('DROP TABLE IF EXISTS pokeru_contas');
    limpar.close();

    const d = pasta();
    const arquivo = join(d, 'accounts.json');
    const contas = {
      'a-1': { id: 'a-1', name: 'Gabs 🐲', user: 'gabs', code: 'K7M2PQ', sub: '42', discord: { id: '343', username: 'gabss2' }, stats: { hands: 142 }, owned: ['aura:poeira-de-luz'], token: 'x', money: 1250, bond: {}, since: '2026-09-21', seen: '2026-09-25' },
    };
    writeFileSync(arquivo, JSON.stringify({ version: 1, accounts: contas }));

    const primeiro = new Accounts({ store: await ContasNoBanco.abrir({ db: await abrirDb(), importarDe: arquivo }) });
    expect(primeiro.info('a-1')!.name).toBe('Gabs 🐲');
    expect(primeiro.info('a-1')!.discord?.username).toBe('gabss2');
    const nova = primeiro.login(undefined, profile('Nova'))!;
    primeiro.charge(nova.id, 100);
    await primeiro.close();

    const segundo = new Accounts({ store: await ContasNoBanco.abrir({ db: await abrirDb(), importarDe: arquivo }) });
    expect(segundo.count).toBe(2);
    expect(segundo.info('a-1')!.stats.hands).toBe(142);
    const volta = segundo.login({ id: nova.id, token: nova.token! }, profile('Nova'))!;
    expect(volta.money).toBe(nova.money - 100);
    await segundo.close();

    // as colunas soltas estão lá para consultar
    const db = await abrirDb();
    const r = await db.execute({ sql: 'SELECT nome, usuario, codigo, discord FROM pokeru_contas WHERE id = ?', args: ['a-1'] });
    expect(r.rows[0]).toMatchObject({ nome: 'Gabs 🐲', usuario: 'gabs', codigo: 'K7M2PQ', discord: '343' });
    db.close();
  });
});
