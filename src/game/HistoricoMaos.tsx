import { useEffect, useState } from 'react';
import { CardView } from '../render/CardArt';
import { findCharacter } from '../../shared/styles';
import { CharacterPortrait } from '../render/CharacterArt';
import type { MaoDaPartida } from '../../shared/historico';
import { useMaos, chaveDaPartida } from '../store/maos';
import { useSession } from '../store/session';
import { fmt } from '../util/format';
import { sfx } from '../audio/sfx';

/**
 * O histórico das mãos de uma partida (shared/historico.ts): na partida em andamento, pelo botão
 * do canto da mesa; depois, clicando na partida no histórico do perfil.
 *
 * A mais nova primeiro, cada uma fechada numa linha (o número, o pote e quanto você levou ou
 * deixou) que abre o resto: a mesa, as suas cartas e o que cada um fez.
 */

const sinal = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');

function Cartas({ cartas, w = 38 }: { cartas: MaoDaPartida['mesa']; w?: number }) {
  if (!cartas.length) return <span className="hm-sem">—</span>;
  return (
    <span className="hm-cartas">
      {cartas.map((c, i) => (
        <CardView key={`${c.r}${c.s}${i}`} card={c} width={w} />
      ))}
    </span>
  );
}

function LinhaDaMao({ mao, aberta, onAlternar }: { mao: MaoDaPartida; aberta: boolean; onAlternar: () => void }) {
  const eu = mao.jogadores.find((j) => j.seat === mao.meuAssento);
  const vencedores = mao.jogadores.filter((j) => j.venceu);
  return (
    <li className={`hm-mao ${aberta ? 'aberta' : ''} ${eu ? (eu.resultado > 0 ? 'ganhou' : eu.resultado < 0 ? 'perdeu' : '') : ''}`}>
      <button className="hm-cabeca" onClick={onAlternar} aria-expanded={aberta}>
        <b className="hm-n">Mão {mao.n}</b>
        <span className="hm-pote">Pote {fmt(mao.pote)}</span>
        <span className="hm-quem">{vencedores.map((v) => v.nome).join(', ') || '—'}</span>
        {eu && <span className={`hm-saldo ${eu.resultado > 0 ? 'pos' : eu.resultado < 0 ? 'neg' : ''}`}>{sinal(eu.resultado)}</span>}
        <span className="hm-seta">{aberta ? '▴' : '▾'}</span>
      </button>
      {aberta && (
        <div className="hm-corpo">
          <div className="hm-topo">
            <div>
              <small>Mesa</small>
              <Cartas cartas={mao.mesa} />
            </div>
            {mao.minhas && (
              <div>
                <small>Suas cartas</small>
                <Cartas cartas={mao.minhas} />
              </div>
            )}
          </div>
          <table className="hm-tabela">
            <thead>
              <tr>
                <th>Jogador</th>
                <th>Mostrou</th>
                <th className="num">Apostou</th>
                <th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {mao.jogadores.map((j) => {
                const char = findCharacter(j.personagem);
                return (
                  <tr key={j.seat} className={j.seat === mao.meuAssento ? 'eu' : ''}>
                    <td>
                      <span className="hm-jogador">
                        <span className="hm-retrato" style={{ background: `linear-gradient(160deg, ${char.bg}, ${char.bg2})` }}>
                          <CharacterPortrait st={char} size={26} />
                        </span>
                        <span>
                          {j.nome}
                          {j.bot && <small className="hm-bot">bot</small>}
                          <span className="hm-marcas">
                            {j.venceu && <i className="hm-marca venceu">venceu</i>}
                            {j.desistiu && <i className="hm-marca">desistiu</i>}
                            {j.allIn && <i className="hm-marca allin">all-in</i>}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td>
                      {j.cartas ? (
                        <span className="hm-mostrou">
                          <Cartas cartas={j.cartas} w={30} />
                          {j.mao && <small>{j.mao}</small>}
                        </span>
                      ) : (
                        <span className="hm-sem">—</span>
                      )}
                    </td>
                    <td className="num">{fmt(j.apostou)}</td>
                    <td className={`num ${j.resultado > 0 ? 'pos' : j.resultado < 0 ? 'neg' : ''}`}>{sinal(j.resultado)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

/** A lista de mãos (a mais nova em cima, já aberta). */
export function ListaDeMaos({ maos }: { maos: MaoDaPartida[] }) {
  const ordem = [...maos].reverse();
  const [aberta, setAberta] = useState<number | null>(ordem[0]?.n ?? null);
  if (!maos.length) return <p className="muted hm-vazio">Nenhuma mão terminou ainda. Cada mão aparece aqui assim que acaba.</p>;
  return (
    <ol className="hm-lista">
      {ordem.map((m) => (
        <LinhaDaMao
          key={m.n}
          mao={m}
          aberta={aberta === m.n}
          onAlternar={() => {
            sfx.click();
            setAberta(aberta === m.n ? null : m.n);
          }}
        />
      ))}
    </ol>
  );
}

/** A janela do histórico, por cima da tela. */
export function JanelaDeMaos({ titulo, children, onClose }: { titulo: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel hm-janela" onClick={(e) => e.stopPropagation()}>
        <div className="hm-janela-topo">
          <h3>{titulo}</h3>
          <button className="btn btn-ghost small" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="hm-janela-corpo">{children}</div>
      </div>
    </div>
  );
}

/** O botão do canto da mesa: abre as mãos da partida em andamento. */
export function BotaoHistoricoMaos({ className }: { className?: string }) {
  const [aberto, setAberto] = useState(false);
  const maos = useMaos((s) => s.daMesa);
  return (
    <>
      <button
        className={className}
        title="Histórico das mãos desta partida"
        aria-label="Histórico das mãos"
        onClick={() => {
          sfx.click();
          setAberto(true);
        }}
      >
        📜
      </button>
      {aberto && (
        <JanelaDeMaos titulo={`Mãos desta partida (${maos.length})`} onClose={() => setAberto(false)}>
          <ListaDeMaos maos={maos} />
        </JanelaDeMaos>
      )}
    </>
  );
}

/**
 * As mãos de uma partida do perfil: pede ao servidor na primeira vez que abre, e mostra a lista
 * quando chega. Partidas de antes do histórico não têm mãos guardadas.
 */
export function MaosDaPartidaDoPerfil({ conta, at, titulo, onClose }: { conta: string; at: string; titulo: string; onClose: () => void }) {
  const estado = useMaos((s) => s.daPartida[chaveDaPartida(conta, at)]);
  const send = useSession((s) => s.send);
  const conectado = useSession((s) => s.status === 'connected');
  useEffect(() => {
    if (estado !== undefined || !conectado) return;
    useMaos.getState().pedindo(conta, at);
    send({ type: 'maosDaPartida', conta, at });
  }, [estado, conectado, conta, at, send]);
  return (
    <JanelaDeMaos titulo={titulo} onClose={onClose}>
      {!conectado ? (
        <p className="muted hm-vazio">Conecte-se ao servidor para ver as mãos desta partida.</p>
      ) : estado === undefined || estado === 'carregando' ? (
        <p className="muted hm-vazio">Buscando as mãos…</p>
      ) : estado === null || !estado.length ? (
        <p className="muted hm-vazio">Esta partida é de antes do histórico de mãos: só as próximas guardam cada mão.</p>
      ) : (
        <ListaDeMaos maos={estado} />
      )}
    </JanelaDeMaos>
  );
}
