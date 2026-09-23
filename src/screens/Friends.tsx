import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MAX_PARTY, prettyFriendCode, type FriendInfo } from '../../shared/friends';
import { findCharacter } from '../../shared/styles';
import { botTier } from '../../shared/protocol';
import {
  aceitarAmizade,
  chamarParaGrupo,
  desfazerAmizade,
  jogarEmGrupo,
  pedirAmigos,
  pedirAmizade,
  recusarAmizade,
  sairDoGrupo,
  useFriends,
  useSouLider,
} from '../store/friends';
import { useSession } from '../store/session';
import { CharacterPortrait } from '../render/CharacterArt';
import { TitleGlow } from '../render/Title';
import { ScreenHeader, Section } from '../ui/controls';
import { sfx } from '../audio/sfx';
import { Petals } from './MainMenu';

/**
 * Amigos e grupo.
 *
 * Duas colunas: à esquerda quem já é amigo (online em cima, que é quem importa agora) e a caixa de
 * pedidos; à direita o grupo, com os três jeitos de jogar junto.
 *
 * **A amizade é por código.** O nome muda — é editável no perfil —, então pedir amizade "pelo
 * nick" daria na pessoa errada uma hora ou outra. Cada conta tem seis caracteres estáveis, feitos
 * para serem ditados (sem 0/O nem 1/I), e é isso que se troca.
 */

/** A bolinha de status. Verde é agora; cinza é depois. */
function Status({ f }: { f: FriendInfo }) {
  const cor = f.online ? (f.playing ? 'jogando' : 'online') : 'off';
  const label = f.online ? (f.playing ? 'Em partida' : 'Online') : 'Offline';
  return (
    <span className={`status-dot ${cor}`} title={label} aria-label={label}>
      <i />
    </span>
  );
}

/** Uma linha da lista de amigos. */
function LinhaAmigo({ f }: { f: FriendInfo }) {
  const char = findCharacter(f.character);
  const party = useFriends((s) => s.party);
  const souLider = useSouLider();
  const eu = useSession((s) => s.account?.id);
  const noGrupo = !!party?.members.some((m) => m.id === f.id);
  const grupoCheio = (party?.members.length ?? 1) >= MAX_PARTY;
  // convidar é do líder; sem grupo, qualquer um pode começar um chamando alguém
  const podeChamar = f.online && !noGrupo && !grupoCheio && (!party || (souLider && party.leader === eu));
  const [confirmar, setConfirmar] = useState(false);
  return (
    <div className={`amigo ${f.online ? 'on' : ''}`}>
      <span className="amigo-face" style={{ background: `linear-gradient(160deg, ${char.bg}, ${char.bg2})` }}>
        <CharacterPortrait st={char} size={38} />
      </span>
      <span className="amigo-meta">
        <b>
          <Status f={f} />
          {f.name}
        </b>
        <small>
          {f.title ? <TitleGlow title={f.title} /> : <span className="muted">nível {f.level}</span>}
          <i className="amigo-code">{prettyFriendCode(f.code)}</i>
        </small>
      </span>
      <span className="amigo-acoes">
        {podeChamar && (
          <button
            className="btn btn-pink small"
            onClick={() => {
              sfx.click();
              chamarParaGrupo(f.id);
            }}
          >
            Chamar
          </button>
        )}
        {noGrupo && <span className="badge eq">No grupo</span>}
        {confirmar ? (
          <>
            <button
              className="btn btn-danger small"
              onClick={() => {
                sfx.click();
                desfazerAmizade(f.id);
                setConfirmar(false);
              }}
            >
              Confirmar
            </button>
            <button className="btn btn-ghost small" onClick={() => setConfirmar(false)}>
              Não
            </button>
          </>
        ) : (
          <button className="btn btn-ghost small" title="Desfazer amizade" onClick={() => setConfirmar(true)}>
            ✕
          </button>
        )}
      </span>
    </div>
  );
}

/** A caixa de pedidos: os que chegaram (com resposta) e os que saíram (com cancelar). */
function Pedidos() {
  const incoming = useFriends((s) => s.incoming);
  const outgoing = useFriends((s) => s.outgoing);
  if (!incoming.length && !outgoing.length) return null;
  return (
    <Section title={`Pedidos (${incoming.length})`}>
      <div className="pedidos">
        {incoming.map((f) => (
          <div key={f.id} className="pedido">
            <b>{f.name}</b>
            <small className="muted">quer ser seu amigo · {prettyFriendCode(f.code)}</small>
            <span className="row gap">
              <button
                className="btn btn-gold small"
                onClick={() => {
                  sfx.win();
                  aceitarAmizade(f.id);
                }}
              >
                Aceitar
              </button>
              <button
                className="btn btn-ghost small"
                onClick={() => {
                  sfx.click();
                  recusarAmizade(f.id);
                }}
              >
                Recusar
              </button>
            </span>
          </div>
        ))}
        {outgoing.map((f) => (
          <div key={f.id} className="pedido saiu">
            <b>{f.name}</b>
            <small className="muted">esperando resposta</small>
            <button
              className="btn btn-ghost small"
              onClick={() => {
                sfx.click();
                recusarAmizade(f.id);
              }}
            >
              Cancelar
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** O meu código, para ditar a quem eu quiser. */
function MeuCodigo() {
  const code = useSession((s) => s.account?.code);
  const [copiado, setCopiado] = useState(false);
  if (!code) return null;
  return (
    <div className="meu-codigo">
      <span className="field-label">Seu código</span>
      <button
        className="codigo"
        title="Copiar"
        onClick={() => {
          sfx.click();
          void navigator.clipboard?.writeText(prettyFriendCode(code)).then(
            () => setCopiado(true),
            () => setCopiado(false),
          );
        }}
      >
        {prettyFriendCode(code)}
        <i>{copiado ? '✓ copiado' : '⧉ copiar'}</i>
      </button>
    </div>
  );
}

/** Adicionar por código. */
function Adicionar() {
  const [code, setCode] = useState('');
  const pronto = code.replace(/[^a-zA-Z0-9]/g, '').length === 6;
  return (
    <form
      className="row gap add-amigo"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pronto) return;
        sfx.click();
        pedirAmizade(code);
        setCode('');
      }}
    >
      <input
        className="input"
        value={code}
        maxLength={7}
        placeholder="ABC-234"
        aria-label="Código do amigo"
        onChange={(e) => setCode(e.target.value.toUpperCase())}
      />
      <button className="btn btn-gold" type="submit" disabled={!pronto}>
        Pedir amizade
      </button>
    </form>
  );
}

/**
 * O grupo: quem está, e os três jeitos de jogar junto.
 *
 * Só o líder começa a partida. Em Custom não há botão de começar aqui: a mesa é criada na tela
 * Custom, e o grupo vai puxado com quem a criou — um jeito a menos de montar mesa, e a tela que já
 * existia continua sendo a única que monta.
 */
function Grupo({ onCustom }: { onCustom?: () => void }) {
  const party = useFriends((s) => s.party);
  const souLider = useSouLider();
  const temDiscord = useSession((s) => !!s.account?.discord);
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('easy');
  if (!party) {
    return (
      <p className="muted small">
        Sem grupo. Chame um amigo que esteja online e vocês jogam a fila, uma mesa Custom ou uma partida contra bots juntos — até {MAX_PARTY}{' '}
        pessoas.
      </p>
    );
  }
  const tier = botTier(difficulty);
  return (
    <div className="grupo">
      <div className="grupo-gente">
        {party.members.map((m) => {
          const char = findCharacter(m.character);
          return (
            <div key={m.id} className={`grupo-um ${m.leader ? 'lider' : ''}`}>
              <span className="amigo-face" style={{ background: `linear-gradient(160deg, ${char.bg}, ${char.bg2})` }}>
                <CharacterPortrait st={char} size={44} />
              </span>
              <b>{m.name}</b>
              <small className="muted">{m.leader ? '★ líder' : `nível ${m.level}`}</small>
            </div>
          );
        })}
        {Array.from({ length: MAX_PARTY - party.members.length }, (_, i) => (
          <div key={`vazio-${i}`} className="grupo-um vazio">
            <span className="amigo-face" />
            <small className="muted">livre</small>
          </div>
        ))}
      </div>

      {souLider ? (
        <div className="grupo-acoes">
          <div className="grupo-bots">
            <span className="field-label">Contra bots</span>
            <div className="row gap">
              {(['easy', 'normal', 'hard'] as const).map((d) => (
                <button key={d} className={`btn small ${d === difficulty ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setDifficulty(d)}>
                  {botTier(d).label}
                </button>
              ))}
            </div>
            <small className="muted">
              Mesa de {tier.mesa.chips.stack.toLocaleString('pt-BR')} fichas; os bots completam o que sobrar da mesa.
            </small>
          </div>
          <div className="row gap wrap">
            <button
              className="btn btn-gold"
              onClick={() => {
                sfx.click();
                jogarEmGrupo('bots', difficulty, 'chips');
              }}
            >
              ♠ Jogar contra bots
            </button>
            <button
              className="btn btn-pink"
              onClick={() => {
                sfx.click();
                jogarEmGrupo('queue', undefined, 'chips');
              }}
            >
              ♥ Entrar na fila juntos
            </button>
            {temDiscord && (
              <button
                className="btn btn-ghost"
                title="A mesma mesa, valendo padocoins"
                onClick={() => {
                  sfx.click();
                  jogarEmGrupo('bots', difficulty, 'pado');
                }}
              >
                Contra bots em padocoins
              </button>
            )}
            {onCustom && (
              <button
                className="btn btn-ghost"
                title="Monte a mesa em Custom: o grupo entra com você"
                onClick={() => {
                  sfx.click();
                  onCustom();
                }}
              >
                ♦ Montar mesa Custom
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="muted small">Quem começa a partida é o líder do grupo.</p>
      )}

      <button
        className="btn btn-ghost small"
        onClick={() => {
          sfx.click();
          sairDoGrupo();
        }}
      >
        Sair do grupo
      </button>
    </div>
  );
}

/** O convite de grupo que chegou: aparece por cima, porque ele tem pressa. */
export function ConviteDeGrupo() {
  const convite = useFriends((s) => s.convite);
  const setConvite = useFriends((s) => s.setConvite);
  if (!convite) return null;
  return (
    <motion.div className="convite" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <span>
        <b>{convite.name}</b> te chamou para o grupo
      </span>
      <span className="row gap">
        <button
          className="btn btn-gold small"
          onClick={() => {
            sfx.win();
            useSession.getState().send({ type: 'partyAccept', party: convite.party });
            setConvite(null);
          }}
        >
          Entrar
        </button>
        <button
          className="btn btn-ghost small"
          onClick={() => {
            sfx.click();
            useSession.getState().send({ type: 'partyDecline', party: convite.party });
            setConvite(null);
          }}
        >
          Agora não
        </button>
      </span>
    </motion.div>
  );
}

export function FriendsScreen({ onBack, onCustom }: { onBack: () => void; onCustom?: () => void }) {
  const friends = useFriends((s) => s.friends);
  const temConta = useSession((s) => !!s.account);
  // a lista chega sozinha ao conectar; pedir de novo cobre quem abriu a tela depois de uma queda
  useEffect(() => {
    if (temConta) pedirAmigos();
  }, [temConta]);
  const online = friends.filter((f) => f.online).length;
  return (
    <div className="screen">
      <div className="menu-bg" />
      <Petals />
      <ScreenHeader title="Amigos" onBack={onBack} />
      <div className="friends-grid">
        <div className="panel pad">
          {temConta ? (
            <>
              <MeuCodigo />
              <Section title="Adicionar por código">
                <Adicionar />
                <small className="muted">O código não muda quando você troca de nome — o nome, sim.</small>
              </Section>
              <Pedidos />
              <Section title={`Amigos (${online} online de ${friends.length})`}>
                {friends.length === 0 ? (
                  <p className="muted small">Ninguém ainda. Passe o seu código para quem você joga.</p>
                ) : (
                  <div className="amigos">
                    {friends.map((f) => (
                      <LinhaAmigo key={f.id} f={f} />
                    ))}
                  </div>
                )}
              </Section>
            </>
          ) : (
            <p className="muted small">Amigos ficam na conta do servidor. Entre numa conta para ter lista e grupo.</p>
          )}
        </div>
        <div className="panel pad">
          <Section title="Grupo">
            <Grupo onCustom={onCustom} />
          </Section>
        </div>
      </div>
    </div>
  );
}
