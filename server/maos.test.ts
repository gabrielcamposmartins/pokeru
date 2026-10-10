import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AccountProfile } from '../shared/accounts';
import type { MaoDaPartida } from '../shared/historico';
import { resumoVazio } from '../shared/personality';
import { PARTIDAS_LEMBRADAS } from '../shared/personality';
import { Lobby } from '../shared/lobby';
import type { ServerMsg } from '../shared/protocol';
import { Accounts } from './accounts';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function contas(): Accounts {
  const dir = mkdtempSync(join(tmpdir(), 'pokeru-'));
  dirs.push(dir);
  return new Accounts({ file: join(dir, 'accounts.json') });
}

const perfil = (name: string): AccountProfile =>
  ({ name, avatar: { color: '#fff', icon: '♠' }, cosmetics: { character: { id: 'marina' } } }) as unknown as AccountProfile;

const mao = (n: number): MaoDaPartida => ({
  n,
  mesa: [],
  pote: 100,
  meuAssento: 0,
  minhas: [
    { r: 14, s: 's' },
    { r: 13, s: 's' },
  ],
  jogadores: [
    { seat: 0, nome: 'Ana', bot: false, personagem: 'marina', apostou: 50, resultado: 50, desistiu: false, venceu: true, allIn: false },
    { seat: 1, nome: 'Bot', bot: true, personagem: 'tobi', apostou: 50, resultado: -50, desistiu: true, venceu: false, allIn: false },
  ],
});

const partida = (at: string) => ({ ...resumoVazio(), maos: 3, at, lugar: 1, jogadores: 2, saldo: 50, personagem: 'marina' });

describe('as mãos guardadas na conta', () => {
  it('cada partida guarda as suas mãos, e a que sai da janela leva as dela', () => {
    const acc = contas();
    const a = acc.login(undefined, perfil('Ana'))!;
    const ats = Array.from({ length: PARTIDAS_LEMBRADAS + 1 }, (_, i) => new Date(2026, 0, 1, 0, i).toISOString());
    for (const at of ats) acc.play(a.id, partida(at), [mao(1), mao(2)]);
    expect(acc.maosDe(a.id, ats.at(-1)!)).toHaveLength(2);
    // a primeira saiu da janela de partidas: as mãos dela também
    expect(acc.maosDe(a.id, ats[0])).toBeNull();
    // e as mãos não vão na foto da conta (que é mandada a cada mudança)
    expect(JSON.stringify(acc.info(a.id))).not.toContain('minhas');
    acc.close();
  });

  it('pelo perfil: o dono vê as cartas dele; o amigo vê só o que foi mostrado; o estranho não vê', () => {
    const acc = contas();
    const lobby = new Lobby('teste', acc);
    const msgs: Record<string, ServerMsg[]> = { ana: [], beto: [], caio: [] };
    const ids: Record<string, string> = {};
    const conn = (quem: string) => {
      const c = lobby.connect((m) => {
        msgs[quem].push(m);
        if (m.type === 'account') ids[quem] = m.account.id;
      });
      c.handle({ type: 'hello', name: quem, avatar: {}, cosmetics: {} });
      return c;
    };
    const ana = conn('ana');
    const beto = conn('beto');
    const caio = conn('caio');
    const at = new Date().toISOString();
    acc.play(ids.ana, partida(at), [mao(1)]);
    // Ana e Beto são amigos; Caio não
    beto.handle({ type: 'friendAdd', code: acc.info(ids.ana)!.code });
    ana.handle({ type: 'friendAccept', id: ids.beto });

    const resposta = (quem: string) => [...msgs[quem]].reverse().find((m) => m.type === 'maosDaPartida') as Extract<ServerMsg, { type: 'maosDaPartida' }> | undefined;
    ana.handle({ type: 'maosDaPartida', conta: ids.ana, at });
    expect(resposta('ana')?.maos?.[0].minhas).toHaveLength(2);
    beto.handle({ type: 'maosDaPartida', conta: ids.ana, at });
    expect(resposta('beto')?.maos?.[0].minhas).toBeUndefined();
    expect(resposta('beto')?.maos?.[0].jogadores).toHaveLength(2);
    caio.handle({ type: 'maosDaPartida', conta: ids.ana, at });
    expect(resposta('caio')).toBeUndefined();
    // partida sem registro (de antes do histórico)
    ana.handle({ type: 'maosDaPartida', conta: ids.ana, at: '2020-01-01T00:00:00.000Z' });
    expect(resposta('ana')?.maos).toBeNull();
    acc.close();
  });
});
