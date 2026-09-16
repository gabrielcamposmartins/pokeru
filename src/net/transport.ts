import { Lobby } from '../../shared/lobby';
import type { ClientMsg, ServerMsg } from '../../shared/protocol';

export interface Transport {
  send(msg: ClientMsg): void;
  close(): void;
}

export interface TransportHandlers {
  onMessage(m: ServerMsg): void;
  onOpen?(): void;
  onClose?(reason: string): void;
}

/** Conexão com um servidor PokerSoul via WebSocket. */
export function connectWs(url: string, h: TransportHandlers): Transport {
  let closed = false;
  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch {
    queueMicrotask(() => h.onClose?.('Endereço inválido'));
    return { send() {}, close() {} };
  }
  let opened = false;
  ws.onopen = () => {
    opened = true;
    h.onOpen?.();
  };
  ws.onmessage = (e) => {
    try {
      h.onMessage(JSON.parse(String(e.data)));
    } catch (err) {
      console.error('Mensagem inválida do servidor', err);
    }
  };
  ws.onclose = () => {
    clearInterval(ping);
    if (!closed) h.onClose?.(opened ? 'Conexão perdida' : 'Não foi possível conectar ao servidor');
    closed = true;
  };
  ws.onerror = () => {};
  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
  }, 20_000);
  return {
    send(m) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    },
    close() {
      closed = true;
      clearInterval(ping);
      ws.close();
    },
  };
}

/**
 * Modo offline: o mesmo Lobby/Room do servidor roda aqui no navegador.
 * Mensagens são clonadas e entregues de forma assíncrona para imitar a rede.
 */
export function connectLocal(h: TransportHandlers): Transport {
  let closed = false;
  const lobby = new Lobby('Modo Offline');
  const conn = lobby.connect((m) => {
    const copy = JSON.parse(JSON.stringify(m)) as ServerMsg;
    queueMicrotask(() => {
      if (!closed) h.onMessage(copy);
    });
  });
  queueMicrotask(() => h.onOpen?.());
  return {
    send(m) {
      if (!closed) conn.handle(JSON.parse(JSON.stringify(m)));
    },
    close() {
      conn.close();
      closed = true;
    },
  };
}
