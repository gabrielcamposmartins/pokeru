import { describe, expect, it, vi } from 'vitest';
import { Lobby } from './lobby';
import { DEFAULT_SETTINGS, type RoomSummary, type ServerMsg } from './protocol';
import { CHARACTER_PRESETS, BACK_PRESETS, DEFAULT_WIN_FX } from './styles';

/**
 * A lista de salas é o que o jogador escolhe (endereço ele não escolhe). Aqui se testa o que a
 * lista mostra: as salas abertas no servidor, com ou sem senha, e nunca as partidas contra bots.
 */

const cosmetics = { back: BACK_PRESETS[0], character: CHARACTER_PRESETS[0], winFx: DEFAULT_WIN_FX };

/** Um cliente ligado no lobby, guardando o que recebeu. */
function client(lobby: Lobby, name: string) {
  const got: ServerMsg[] = [];
  const conn = lobby.connect((m) => void got.push(m));
  conn.handle({ type: 'hello', name, avatar: { color: '#fff', icon: '♠' }, cosmetics });
  const last = <T extends ServerMsg['type']>(type: T) => [...got].reverse().find((m) => m.type === type) as Extract<ServerMsg, { type: T }> | undefined;
  return {
    conn,
    got,
    /** A lista de salas mais recente que este cliente recebeu. */
    rooms: (): RoomSummary[] => {
      conn.handle({ type: 'listRooms' });
      return last('rooms')?.rooms ?? [];
    },
    errors: () => got.filter((m) => m.type === 'error').map((m) => (m as { message: string }).message),
    room: () => last('room')?.room,
  };
}

const settings = (over: Partial<typeof DEFAULT_SETTINGS>) => ({ ...DEFAULT_SETTINGS, ...over });

describe('lista de salas do servidor', () => {
  it('mostra as salas abertas, com nome, ocupação e senha', () => {
    const lobby = new Lobby('Pokeru Teste');
    const ana = client(lobby, 'Ana');
    ana.conn.handle({ type: 'createRoom', settings: settings({ name: 'Mesa da Ana', maxPlayers: 4 }) });

    const bruno = client(lobby, 'Bruno');
    const list = bruno.rooms();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Mesa da Ana', players: 1, maxPlayers: 4, status: 'waiting', hasPassword: false });
  });

  it('sala com senha aparece marcada, e só entra quem sabe a senha', () => {
    const lobby = new Lobby();
    const ana = client(lobby, 'Ana');
    ana.conn.handle({ type: 'createRoom', settings: settings({ name: 'Mesa fechada', password: 'abacate' }) });

    const bruno = client(lobby, 'Bruno');
    const [sala] = bruno.rooms();
    // a senha nunca vai no fio: o que a lista diz é que existe uma
    expect(sala.hasPassword).toBe(true);
    expect(JSON.stringify(sala)).not.toContain('abacate');

    bruno.conn.handle({ type: 'joinRoom', roomId: sala.id });
    expect(bruno.errors()).toContain('Senha incorreta');
    expect(bruno.room()).toBeUndefined();

    bruno.conn.handle({ type: 'joinRoom', roomId: sala.id, password: 'abacate' });
    expect(bruno.room()?.members.map((m) => m.name)).toEqual(['Ana', 'Bruno']);
  });

  it('a partida contra bots fica fora da lista (listed: false)', () => {
    const lobby = new Lobby();
    const ana = client(lobby, 'Ana');
    ana.conn.handle({ type: 'createRoom', settings: settings({ name: 'Treino contra bots', listed: false }) });
    // a sala existe e a Ana está nela
    expect(ana.room()?.settings.listed).toBe(false);
    expect(lobby.rooms.size).toBe(1);

    const bruno = client(lobby, 'Bruno');
    expect(bruno.rooms()).toEqual([]);
  });

  it('a lista chega sozinha quando uma sala abre ou fecha', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby();
    const bruno = client(lobby, 'Bruno');
    const before = bruno.got.filter((m) => m.type === 'rooms').length;

    const ana = client(lobby, 'Ana');
    ana.conn.handle({ type: 'createRoom', settings: settings({ name: 'Mesa nova' }) });
    await vi.advanceTimersByTimeAsync(400);

    const pushed = bruno.got.filter((m) => m.type === 'rooms');
    expect(pushed.length).toBeGreaterThan(before);
    expect((pushed[pushed.length - 1] as { rooms: RoomSummary[] }).rooms[0].name).toBe('Mesa nova');
    vi.useRealTimers();
  });
});
