import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Onde as contas moram: um arquivo JSON (`JsonStore`) ou o banco de dados (`ContasNoBanco`, em
 * server/banco.ts). As duas guardam o objeto inteiro em memória e gravam agrupado; quem usa não
 * precisa saber qual das duas está por baixo.
 */
export interface Armazem<T> {
  /** Onde fica (para o log de subida). */
  readonly onde: string;
  get(): T;
  /** Marca que mudou: a gravação sai em bloco, alguns segundos depois. */
  touch(): void;
  /** Grava agora (o banco põe na fila e não espera). */
  flush(): void;
  /** Grava o que falta e fecha (o banco espera a gravação terminar). */
  close(): void | Promise<void>;
}

/**
 * Guarda um objeto num arquivo JSON, do jeito simples que um servidor caseiro precisa:
 *
 * - a gravação é **atômica** (escreve num `.tmp` e renomeia), então uma queda no meio não corrompe;
 * - as gravações são **agrupadas** (poucos segundos), para não bater no disco a cada mão;
 * - `flush()` grava na hora — é o que o servidor chama ao receber SIGTERM/SIGINT.
 *
 * Sem banco de dados de propósito: o arquivo fica num volume e dá para copiar, versionar e ler.
 */
export class JsonStore<T> implements Armazem<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(
    readonly file: string,
    private data: T,
    /** Quanto tempo esperar antes de gravar (ms). */
    private readonly delay = 2000,
  ) {
    mkdirSync(dirname(file), { recursive: true });
    try {
      const text = readFileSync(file, 'utf8');
      const parsed = JSON.parse(text) as T;
      if (parsed && typeof parsed === 'object') this.data = parsed;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'ENOENT') {
        // arquivo quebrado: guarda uma cópia e começa do zero, para o servidor subir de todo jeito
        const backup = `${file}.broken-${Date.now()}`;
        try {
          renameSync(file, backup);
          console.error(`[dados] ${file} ilegível (${e.message}); guardei em ${backup} e comecei vazio`);
        } catch {
          console.error(`[dados] ${file} ilegível (${e.message}); comecei vazio`);
        }
      }
    }
  }

  get onde(): string {
    return this.file;
  }

  get(): T {
    return this.data;
  }

  /** Marca que mudou: a gravação sai em bloco, alguns segundos depois. */
  touch(): void {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.delay);
    // o timer não deve segurar o processo vivo
    this.timer.unref?.();
  }

  /** Grava agora (se houver mudança). */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const tmp = `${this.file}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(this.data, null, 1) + '\n', 'utf8');
      renameSync(tmp, this.file);
    } catch (err) {
      this.dirty = true;
      console.error('[dados] falha ao gravar', this.file, err);
    }
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.flush();
  }
}

/** Caminho do arquivo de dados dentro do diretório configurado (`DATA_DIR`). */
export function dataFile(name: string): string {
  return join(process.env.DATA_DIR || './data', name);
}
