import { useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { EscolhaDeTitulo, ListaDeConquistas } from '../game/Titles';
import { MinhaPersonalidade, PersonalidadeDe } from '../game/Personality';
import { CartaoJogador, FotoComMoldura, useMeuCartao } from '../game/CartaoJogador';
import { useCharacter, useProfile } from '../store/profile';
import { useSession } from '../store/session';
import { achievementRows, useAchievements, useMyStats } from '../store/titles';
import { useFriends } from '../store/friends';
import { levelInfo } from '../../shared/achievements';
import { PARTIDAS_NO_HISTORICO, personalidadeDe, tracoDominante, ultimasPartidas, type ResumoDaPartida } from '../../shared/personality';
import { findCharacter } from '../../shared/styles';
import { prettyFriendCode } from '../../shared/friends';
import { ScreenHeader, Section } from '../ui/controls';
import { CharacterPortrait } from '../render/CharacterArt';
import { LevelNumber } from '../render/Level';
import { TitleGlow } from '../render/Title';
import { sfx } from '../audio/sfx';
import { Petals } from './MainMenu';

/**
 * "Hoje", "ontem", "há três dias".
 *
 * A data exata de uma partida não serve para nada — ninguém procura o que jogou em 14 de março.
 * O que a pessoa quer saber é se aquilo foi agora ou faz tempo.
 */
function quando(at: string): string {
  const dias = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
  if (!Number.isFinite(dias) || dias < 0) return '';
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 7) return `há ${dias} dias`;
  if (dias < 30) return `há ${Math.floor(dias / 7)} semana${dias < 14 ? '' : 's'}`;
  return `há ${Math.floor(dias / 30)} mês${dias < 60 ? '' : 'es'}`;
}

const fichas = (n: number): string => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('pt-BR')}`;

/** Uma linha do histórico. */
function LinhaDaPartida({ r }: { r: ResumoDaPartida }) {
  const char = findCharacter(r.personagem);
  const traco = tracoDominante(personalidadeDe(r));
  const venceu = r.lugar === 1;
  return (
    <div className={`hist-linha ${venceu ? 'venceu' : ''}`}>
      <span className="hist-lugar">{r.lugar > 0 ? <b>{r.lugar}º</b> : <i>saiu</i>}</span>
      <span
        className="hist-char"
        style={{
          background: `linear-gradient(160deg, ${char.bg}, ${char.bg2})`,
        }}
        title={`Jogou com ${char.name}`}
      >
        <CharacterPortrait st={char} size={34} />
      </span>
      <span className="hist-info">
        <b>
          {r.lugar > 0 && r.jogadores > 0 ? `${r.lugar}º de ${r.jogadores}` : 'Levantou da mesa'}
          {venceu && <em>★</em>}
        </b>
        <small>
          {r.maos} {r.maos === 1 ? 'mão' : 'mãos'} · {quando(r.at)}
        </small>
      </span>
      {/* o traço daquela noite: é o que mostra que o gráfico não é um retrato parado */}
      <span className="hist-traco" style={{ ['--cor' as string]: traco.cor }} title={traco.hint}>
        {traco.tag}
      </span>
      <span className={`hist-saldo ${r.saldo > 0 ? 'ganhou' : r.saldo < 0 ? 'perdeu' : ''}`}>{r.saldo === 0 ? '—' : fichas(r.saldo)}</span>
    </div>
  );
}

/**
 * As últimas partidas.
 *
 * São as mesmas que alimentam o gráfico, e é de propósito: ver a lista ao lado da mancha explica
 * de onde ela saiu.
 */
function Historico({ play }: { play: ResumoDaPartida[] | undefined }) {
  if (!play) return <p className="muted small">O histórico fica na conta do servidor.</p>;
  const lista = ultimasPartidas(play, PARTIDAS_NO_HISTORICO);
  if (!lista.length) return <p className="muted small">Nenhuma partida ainda. A primeira aparece aqui assim que acabar.</p>;
  return (
    <div className="hist">
      {lista.map((r) => (
        <LinhaDaPartida key={r.at} r={r} />
      ))}
    </div>
  );
}

/**
 * O nome, como se lê — e, ao clicar, o campo para trocar.
 *
 * Um campo de texto sempre aberto no cabeçalho do perfil parecia formulário, e convidava a apagar
 * o nome sem querer. Agora o nome é um rótulo grande; clicar nele (ou no lápis) abre um campo
 * estreito no mesmo lugar, e Enter, Esc ou clicar fora fecham. O nome só muda enquanto se digita,
 * como antes: é o mesmo `setName` do perfil.
 */
function NomeEditavel({ nome, onChange }: { nome: string; onChange: (v: string) => void }) {
  const [editando, setEditando] = useState(false);
  const antes = useRef(nome);
  if (editando) {
    return (
      <input
        className="input profile-nome-input"
        autoFocus
        value={nome}
        maxLength={16}
        aria-label="Nome"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          // nome em branco não fica: volta o que era
          if (!nome.trim()) onChange(antes.current);
          setEditando(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            onChange(antes.current);
            setEditando(false);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className="profile-nome"
      title="Trocar o nome"
      onClick={() => {
        sfx.click();
        antes.current = nome;
        setEditando(true);
      }}
    >
      {nome}
      <i aria-hidden>✎</i>
    </button>
  );
}

type Aba = 'historico' | 'conquistas';

/**
 * As abas do perfil: o histórico de partidas e as conquistas, nesta ordem.
 *
 * Um container só, onde antes ficavam as conquistas: as duas listas crescem, e empilhadas
 * empurravam uma a outra para fora da tela.
 */
function AbasDoPerfil({ play, conquistas }: { play: ResumoDaPartida[] | undefined; conquistas: ReactNode }) {
  const [aba, setAba] = useState<Aba>('historico');
  const abas: { id: Aba; label: string }[] = [
    { id: 'historico', label: 'Histórico de partidas' },
    { id: 'conquistas', label: 'Conquistas' },
  ];
  return (
    <div className="perfil-abas">
      {/* as mesmas abas da loja */}
      <nav className="shop-abas perfil-abas-nav" role="tablist">
        {abas.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            className={`shop-aba ${aba === a.id ? 'on' : ''}`}
            onClick={() => {
              sfx.click();
              setAba(a.id);
            }}
          >
            {a.label}
          </button>
        ))}
      </nav>
      <div className="perfil-abas-corpo" role="tabpanel">
        {aba === 'historico' ? <Historico play={play} /> : conquistas}
      </div>
    </div>
  );
}

/**
 * O perfil: quem a pessoa é no jogo.
 *
 * Saiu de dentro de Configurações porque não é configuração nenhuma. Ajuste é o que a pessoa mexe
 * uma vez e esquece; isto é o que ela **volta** para ver — o nível que subiu, o gráfico
 * entortando, o título novo.
 *
 * Um painel só, com duas colunas: a identidade (o card, a foto com moldura, o nome) e as abas de
 * histórico e conquistas de um lado; o gráfico de como a pessoa joga do outro.
 */
export function ProfileScreen({ onBack }: { onBack: () => void }) {
  const p = useProfile();
  const code = useSession((s) => s.account?.code);
  const play = useSession((s) => s.account?.play);
  const character = useCharacter();
  const cartao = useMeuCartao();
  const lv = levelInfo(useMyStats());
  const conquistas = useAchievements();
  return (
    <div className="screen tela-cheia">
      <div className="menu-bg" />
      <Petals />
      <ScreenHeader title="Perfil" onBack={onBack} />
      <div className="panel painel-duplo profile-duplo">
        <div className="painel-col">
          <div className="profile-topo">
            {/* o mesmo card da tela de carregamento: é assim que os outros te veem na mesa */}
            <CartaoJogador p={cartao} eu className="cartao-perfil" />
            {/*
             * O cabeçalho é a identidade: retrato, nome e nível grandes.
             *
             * O mesmo número da tela de carregamento, na mesma cor da dezena — quem chegou ao 30
             * reconhece o verde antes de ler o algarismo.
             */}
            <div className="profile-lado">
              <div className="profile-cab">
                {/* o retrato do perfil é a sua foto: leva a moldura que você escolheu */}
                <FotoComMoldura character={character} frame={p.frame} size={96} />
                <div className="profile-cab-meta">
                  <NomeEditavel nome={p.name} onChange={p.setName} />
                  <span className="profile-com">
                    com <b>{character.name}</b>
                  </span>
                  {/* o código de amigo mora aqui porque é identidade, não configuração — e é o que se dita */}
                  {code && (
                    <span className="profile-codigo">
                      código de amigo <b>{prettyFriendCode(code)}</b>
                    </span>
                  )}
                </div>
                <div className="profile-nivel">
                  <LevelNumber level={lv.level} size={54} />
                  <small className="muted">
                    {lv.into} / {lv.need} xp
                  </small>
                </div>
              </div>
              {/* o título em uso fica ao lado do card, embaixo do nome: é parte de como a pessoa aparece na mesa */}
              <EscolhaDeTitulo />
            </div>
          </div>
          <AbasDoPerfil play={play} conquistas={<ListaDeConquistas rows={conquistas} />} />
        </div>
        <div className="painel-col">
          <Section title="Como você joga">
            <MinhaPersonalidade />
          </Section>
        </div>
      </div>
    </div>
  );
}

/**
 * O perfil de um amigo, por cima de qualquer tela.
 *
 * Abre pela lista de amigos, pelo grupo e pela sala. É o mesmo perfil — o card, a foto com a
 * moldura, o histórico, as conquistas e o gráfico —, só que para ler: nada ali se edita.
 */
export function PerfilAmigo() {
  const perfilDe = useFriends((s) => s.perfilDe);
  const perfil = useFriends((s) => s.perfil);
  const fechar = () => {
    sfx.click();
    useFriends.getState().fecharPerfil();
  };
  if (!perfilDe) return null;
  const c = perfil?.cartao;
  const lv = perfil ? levelInfo(perfil.stats) : null;
  return (
    <div className="modal-back" onClick={fechar}>
      <motion.div
        className="modal panel perfil-amigo"
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="bond-page-close" onClick={fechar} aria-label="Fechar">
          ✕
        </button>
        {!perfil || !c || !lv ? (
          <div className="perfil-amigo-carregando">
            <span className="queue-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            Abrindo o perfil…
          </div>
        ) : (
          <div className="perfil-amigo-grid">
            <div className="perfil-amigo-col">
              <div className="profile-topo">
                <CartaoJogador p={c} className="cartao-perfil" />
                <div className="profile-cab">
                  <FotoComMoldura character={c.character} frame={c.frame} size={96} />
                  <div className="profile-cab-meta">
                    <h2 className="perfil-amigo-nome">{c.name}</h2>
                    {c.title && <TitleGlow title={c.title} />}
                    <span className="profile-com">
                      com <b>{c.character.name}</b> ·{' '}
                      <span className={perfil.online ? 'perfil-on' : 'muted'}>{perfil.online ? (perfil.playing ? 'em partida' : 'online') : 'offline'}</span>
                    </span>
                    <span className="profile-codigo">
                      código de amigo <b>{prettyFriendCode(perfil.code)}</b>
                    </span>
                  </div>
                  <div className="profile-nivel">
                    <LevelNumber level={lv.level} size={54} />
                  </div>
                </div>
              </div>
              <AbasDoPerfil play={perfil.play} conquistas={<ListaDeConquistas rows={achievementRows(perfil.stats)} />} />
            </div>
            <div className="perfil-amigo-col">
              <Section title={`Como ${c.name} joga`}>
                <PersonalidadeDe play={perfil.play} size={300} dono={c.name} />
              </Section>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
