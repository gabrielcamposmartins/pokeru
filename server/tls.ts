import { readFileSync } from 'node:fs';

/**
 * TLS do servidor.
 *
 * Duas coisas dependem disso, e as duas são sérias: a **senha** do jogador passa pelo gateway de
 * contas (`/auth/login`), e o **token** da sessão viaja em toda conexão de mesa. Sem TLS, os dois
 * andam em claro na rede — a documentação do GBOT diz para nunca chamar `/login` por HTTP puro, e
 * isso vale para o caminho inteiro.
 *
 * Aqui o servidor termina o TLS ele mesmo, com um par de arquivos PEM:
 *
 *     TLS_CERT_PATH=/certs/cert.pem
 *     TLS_KEY_PATH=/certs/chave.pem
 *
 * Um certificado **autoassinado** serve (veja `npm run cert`), mas ele não é confiável por
 * ninguém por padrão: cada máquina que joga precisa aceitar o certificado uma vez, ou tê-lo na
 * store de confiança. É o preço de não ter um domínio e uma CA pública — e é bem menor que o de
 * mandar senha em claro.
 *
 * Atrás de um proxy que já termine o TLS (nginx, Caddy, um load balancer), deixe estas variáveis
 * vazias: aí o servidor fala HTTP puro com o proxy, na rede interna, e quem tem o certificado é o
 * proxy.
 */

export interface TlsPair {
  key: Buffer;
  cert: Buffer;
  /** De onde veio o par (para o log dizer o que carregou). */
  certPath: string;
  keyPath: string;
}

export class TlsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TlsError';
  }
}

export interface TlsEnv {
  TLS_CERT_PATH?: string;
  TLS_KEY_PATH?: string;
}

/**
 * Lê o par de chaves do ambiente. `null` = sem TLS (HTTP puro), que é o certo atrás de um proxy.
 *
 * Meio configurado é erro, não descuido: só um dos dois caminhos significa que alguém quis TLS e
 * errou o nome da variável. Nesse caso o servidor precisa reclamar em vez de subir em claro
 * quietinho, achando que está protegido.
 */
export function loadTls(env: TlsEnv = process.env, read = readFileSync): TlsPair | null {
  const certPath = env.TLS_CERT_PATH?.trim() ?? '';
  const keyPath = env.TLS_KEY_PATH?.trim() ?? '';
  if (!certPath && !keyPath) return null;
  if (!certPath || !keyPath) {
    throw new TlsError(
      `TLS pela metade: ${certPath ? 'falta TLS_KEY_PATH' : 'falta TLS_CERT_PATH'}. ` +
        'Defina os dois (veja `npm run cert`) ou nenhum dos dois (atrás de um proxy com TLS).',
    );
  }
  try {
    const cert = read(certPath);
    const key = read(keyPath);
    if (!cert.length || !key.length) throw new Error('arquivo vazio');
    return { cert: Buffer.from(cert), key: Buffer.from(key), certPath, keyPath };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new TlsError(`não foi possível ler o certificado (${certPath}) ou a chave (${keyPath}): ${why}`);
  }
}

/** O endereço que o cliente usa, para o log dizer o que a pessoa deve digitar. */
export const clientUrl = (tls: boolean, port: number, host = 'localhost'): string => `${tls ? 'wss' : 'ws'}://${host}:${port}`;
