import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:https';
import { connect } from 'node:tls';
import { WebSocketServer } from 'ws';
import { TlsError, clientUrl, loadTls } from './tls';

/**
 * TLS do servidor. Duas coisas são testadas: a leitura do par de chaves (incluindo os jeitos de
 * configurar errado) e o aperto de mão de verdade — um servidor de mentira com o certificado
 * autoassinado, e um cliente que só aceita a conexão por causa **daquele** certificado.
 */

const dirs: string[] = [];
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pokeru-tls-'));
  dirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('carregar o certificado', () => {
  it('sem nenhuma variável, é HTTP puro (o certo atrás de um proxy)', () => {
    expect(loadTls({})).toBeNull();
    expect(loadTls({ TLS_CERT_PATH: '', TLS_KEY_PATH: '  ' })).toBeNull();
  });

  it('só metade configurada é erro, não descuido', () => {
    expect(() => loadTls({ TLS_CERT_PATH: '/certs/cert.pem' })).toThrow(TlsError);
    expect(() => loadTls({ TLS_CERT_PATH: '/certs/cert.pem' })).toThrow(/falta TLS_KEY_PATH/);
    expect(() => loadTls({ TLS_KEY_PATH: '/certs/chave.pem' })).toThrow(/falta TLS_CERT_PATH/);
  });

  it('arquivo que não existe reclama com o caminho, em vez de subir sem TLS', () => {
    expect(() => loadTls({ TLS_CERT_PATH: '/nao/existe/cert.pem', TLS_KEY_PATH: '/nao/existe/chave.pem' })).toThrow(/não foi possível ler/);
  });

  it('arquivo vazio também é erro', () => {
    const read = () => Buffer.alloc(0);
    expect(() => loadTls({ TLS_CERT_PATH: 'c.pem', TLS_KEY_PATH: 'k.pem' }, read as never)).toThrow(TlsError);
  });

  it('com os dois, devolve o par e de onde ele veio', () => {
    const read = ((path: string) => Buffer.from(`conteúdo de ${path}`)) as never;
    const pair = loadTls({ TLS_CERT_PATH: '/certs/cert.pem', TLS_KEY_PATH: '/certs/chave.pem' }, read)!;
    expect(pair.certPath).toBe('/certs/cert.pem');
    expect(pair.keyPath).toBe('/certs/chave.pem');
    expect(pair.cert.toString()).toContain('cert.pem');
  });

  it('o endereço que o cliente usa segue o TLS', () => {
    expect(clientUrl(false, 3001)).toBe('ws://localhost:3001');
    expect(clientUrl(true, 3001)).toBe('wss://localhost:3001');
    expect(clientUrl(true, 443, 'poker.exemplo.com')).toBe('wss://poker.exemplo.com:443');
  });
});

/**
 * O certificado do `npm run cert`, gerado de verdade pelo openssl. Se o openssl não existir na
 * máquina, o bloco é pulado em vez de falhar — a geração é ferramenta, não código nosso.
 */
const openssl = (() => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!openssl)('certificado autoassinado de verdade', () => {
  let dir: string;
  let cert: Buffer;
  let key: Buffer;

  beforeAll(() => {
    dir = tmp();
    execFileSync('node', ['scripts/cert.mjs', '127.0.0.1', '--dir', dir], { stdio: 'ignore' });
    cert = readFileSync(join(dir, 'cert.pem'));
    key = readFileSync(join(dir, 'chave.pem'));
  });

  it('o script gera o par que o servidor espera', () => {
    const pair = loadTls({ TLS_CERT_PATH: join(dir, 'cert.pem'), TLS_KEY_PATH: join(dir, 'chave.pem') })!;
    expect(pair.cert.toString()).toContain('BEGIN CERTIFICATE');
    expect(pair.key.toString()).toContain('PRIVATE KEY');
  });

  it('o certificado leva o endereço no subjectAltName — é por ele que o cliente aceita', () => {
    const texto = execFileSync('openssl', ['x509', '-in', join(dir, 'cert.pem'), '-noout', '-text']).toString();
    expect(texto).toContain('Subject Alternative Name');
    expect(texto).toContain('IP Address:127.0.0.1');
  });

  it('um cliente que confia só nesse certificado fecha o aperto de mão', async () => {
    const server = createServer({ cert, key }, (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, tls: 'on' }));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const port = (server.address() as { port: number }).port;

    try {
      // `ca: cert` é o que uma máquina faz ao instalar o certificado na store de confiança
      const autorizado = await new Promise<boolean>((resolve, reject) => {
        const socket = connect({ host: '127.0.0.1', port, ca: cert }, () => {
          const ok = socket.authorized;
          socket.end();
          resolve(ok);
        });
        socket.on('error', reject);
      });
      expect(autorizado).toBe(true);

      // e sem confiar nele, a conexão é recusada — é o que o navegador faz antes de aceitar
      const erro = await new Promise<Error>((resolve) => {
        const socket = connect({ host: '127.0.0.1', port }, () => {
          socket.end();
          resolve(new Error('conectou sem confiar no certificado'));
        });
        socket.on('error', resolve);
      });
      expect(erro.message).toMatch(/self.signed|unable to verify/i);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });

  it('a mesa roda por wss no mesmo servidor e na mesma porta', async () => {
    const server = createServer({ cert, key });
    const wss = new WebSocketServer({ server });
    wss.on('connection', (ws) => {
      ws.on('message', (data) => ws.send(`eco:${data}`));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const port = (server.address() as { port: number }).port;

    try {
      const { WebSocket } = await import('ws');
      const eco = await new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(`wss://127.0.0.1:${port}`, { ca: cert });
        ws.on('open', () => ws.send('oi'));
        ws.on('message', (d) => {
          resolve(String(d));
          ws.close();
        });
        ws.on('error', reject);
      });
      expect(eco).toBe('eco:oi');
    } finally {
      wss.close();
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
});
