import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useMyStats, useMyTitle } from '../store/titles';
import { levelInfo, playerLevel } from '../../shared/achievements';
import { LevelNumber, levelColor } from '../render/Level';
import { Sparks } from '../render/Sparks';
import { TitleGlow } from '../render/Title';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import type { BotDifficulty, Currency } from '../../shared/protocol';
import { useCharacter, useEquipped, useProfile } from '../store/profile';
import { useSession } from '../store/session';
import { CharacterFull, CharacterPortrait } from '../render/CharacterArt';
import { CardFaceSvg } from '../render/CardArt';
import { BondBar } from '../game/BondBar';
import { HandGuideButton } from '../game/HandGuide';
import { Segmented } from '../ui/controls';
import { WalletBar, useChips } from '../ui/Wallet';
import { sfx } from '../audio/sfx';
import { APP_VERSION } from '../util/version';
import { BOT_MATCH, BOT_TIERS, QUEUE_STAKES, botTier, tierUnlocked } from '../../shared/protocol';
import { PadoCoinSvg } from '../render/PadoCoin';
import { ChipSvg } from '../render/Chip';
import { usePado } from '../store/shop';
import { usePedidos } from '../store/friends';
import { fmt } from '../util/format';
import { useUiTheme } from '../ui/themes';
import type { Screen } from '../App';

const DEFAULT_LINES = ['Vamos jogar?', 'Boa sorte na mesa!', 'Hoje é dia de all-in!'];

export function Petals() {
  return (
    <div className="petals" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => (
        <span
          key={i}
          className={`petal ${i % 3 === 0 ? 'suit' : ''}`}
          style={{
            left: `${(i * 53) % 100}%`,
            animationDelay: `${(i * 1.7) % 12}s`,
            animationDuration: `${10 + (i % 5) * 2.5}s`,
            fontSize: `${12 + (i % 4) * 6}px`,
          }}
        >
          {i % 3 === 0 ? ['♠', '♥', '♦', '♣'][i % 4] : ''}
        </span>
      ))}
    </div>
  );
}

/** Personagem grande e interativo (clique para ouvir uma fala). */
export function CharacterStageView({ heightVh = 92, className }: { heightVh?: number; className?: string }) {
  const st = useCharacter();
  // a placa mostra o titulo do JOGADOR (conquista), nao do personagem
  const myTitle = useMyTitle();
  const [talk, setTalk] = useState<string | null>(null);
  const hop = useAnimationControls();
  const [h, setH] = useState(() => (window.innerHeight * heightVh) / 100);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const fit = () => setH((window.innerHeight * heightVh) / 100);
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [heightVh]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const lines = st.lines.length ? st.lines : DEFAULT_LINES;
  const onClick = () => {
    sfx.pop();
    let next = lines[Math.floor(Math.random() * lines.length)];
    if (lines.length > 1) while (next === talk) next = lines[Math.floor(Math.random() * lines.length)];
    setTalk(next);
    void hop.start({ y: [0, -18, 0], transition: { duration: 0.42 } });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTalk(null), 3200);
  };
  return (
    <div className={`char-stage ${className ?? ''}`}>
      <div className="char-glow" style={{ background: `radial-gradient(ellipse at 50% 55%, ${st.bg}88, transparent 65%)` }} />
      <motion.div key={st.id} className="char-figure" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <motion.div animate={hop}>
          <CharacterFull st={st} height={h} animate onClick={onClick} className="clickable" />
        </motion.div>
      </motion.div>
      <AnimatePresence>
        {talk && (
          <motion.div className="speech" initial={{ opacity: 0, scale: 0.6, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }}>
            {talk}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="char-nameplate">
        <small>{myTitle || 'Jogador(a)'}</small>
        <b>{st.name}</b>
        <BondBar char={st} size={16} compact />
      </div>
    </div>
  );
}

/**
 * Contra bots: duas escolhas, e só.
 *
 * A mesa é sempre a mesma — três oponentes, Hold'em, dez rodadas, 25s por jogada (BOT_MATCH) — e
 * quem a monta é o servidor. O que sobra para escolher é a **moeda** (só quem tem Discord vê
 * padocoin) e o **degrau**, que muda a mesa inteira: a pilha, os blinds e o prêmio.
 *
 * O formulário antigo tinha doze campos na porta de entrada do jogo. A pessoa escolhia formato,
 * variante, blinds e ritmo antes de saber o que qualquer um deles fazia; quem quer decidir isso
 * tem Custom.
 */
function BotMatchModal({ onClose }: { onClose: () => void }) {
  const pedirPartida = useSession((s) => s.botMatch);
  const pending = useSession((s) => s.botsPending);
  const temConta = useSession((s) => !!s.account);
  const temDiscord = useSession((s) => !!s.account?.discord);
  const chips = useChips();
  const pado = usePado();
  const nivel = playerLevel(useMyStats());
  const [difficulty, setDifficulty] = useState<BotDifficulty>('easy');
  const [currency, setCurrency] = useState<Currency>('chips');
  const moeda: Currency = temDiscord ? currency : 'chips';
  const tier = botTier(difficulty);
  const mesa = tier.mesa;
  const saldo = moeda === 'pado' ? (pado ?? 0) : chips;
  /*
   * A mesa do recomeço.
   *
   * Quebrar não pode trancar o jogo: no fácil em fichas, quem não tem o buy-in senta de graça e
   * joga para voltar. É a mesma regra do servidor (veja `recomeco` em shared/protocol.ts) — aqui
   * ela só troca o texto do botão, para a pessoa entender o que está recebendo.
   */
  const paga = temConta && saldo < mesa.stack;
  const recomeco = paga && difficulty === 'easy' && moeda === 'chips';
  const travado = paga && !recomeco;
  return (
    <div className="modal-back" onClick={onClose}>
      <motion.div className="modal panel quick-modal" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="title-deco">Contra Bots</h2>
        <p className="muted">
          Três oponentes, Texas Hold'em, <b>{BOT_MATCH.rounds} rodadas</b> e {BOT_MATCH.turnTime}s por jogada. Vale de verdade: o buy-in sai do
          seu saldo e só volta se você <b>terminar a partida</b>.
        </p>
        <div className="form-stack">
          {temDiscord && (
            <Segmented
              label="Moeda"
              value={currency}
              onChange={setCurrency}
              options={[
                { value: 'chips' as Currency, label: 'Fichas' },
                { value: 'pado' as Currency, label: 'Padocoins' },
              ]}
            />
          )}
          <Segmented
            label="Dificuldade"
            value={difficulty}
            onChange={setDifficulty}
            options={BOT_TIERS.map((t) => ({
              value: t.id,
              label: t.label,
              disabled: temConta && !tierUnlocked(t.id, nivel),
              title: temConta && !tierUnlocked(t.id, nivel) ? `Abre no nível ${t.level}` : undefined,
            }))}
          />
          {/* a mesa do degrau escolhido, por extenso: é o que muda entre um e outro */}
          <div className="mesa-fixa">
            <span>
              Mesa do <b>{tier.label}</b>: <b>{fmt(mesa.stack)}</b> {moeda === 'pado' ? 'padocoins' : 'fichas'} e blinds{' '}
              <b>
                {mesa.smallBlind}/{mesa.bigBlind}
              </b>
              .
            </span>
            {temDiscord && (
              <span>
                Terminar rende <b>{tier.bonus.fim}</b> padocoins; terminar em 1º, <b>{tier.bonus.vitoria}</b>.
              </span>
            )}
            {temConta && !tierUnlocked('hard', nivel) && (
              <span className="muted">
                Você está no nível {nivel}. {tierUnlocked('normal', nivel) ? 'Difícil abre no 20.' : 'Normal abre no 5, Difícil no 20.'}
              </span>
            )}
          </div>
        </div>
        <div className="row gap center" style={{ marginTop: 18 }}>
          <button
            className="btn btn-gold big"
            disabled={pending || travado}
            onClick={() => {
              sfx.click();
              pedirPartida(difficulty, moeda);
            }}
          >
            {pending
              ? 'Sentando à mesa…'
              : travado
                ? `Faltam ${fmt(mesa.stack - saldo)} ${moeda === 'pado' ? 'padocoins' : 'fichas'}`
                : recomeco
                  ? '♠ Recomeçar — esta é de graça'
                  : temConta
                    ? `♠ Sentar por ${fmt(mesa.stack)}`
                    : '♠ Sentar à mesa'}
          </button>
          <button className="btn btn-ghost" disabled={pending} onClick={onClose}>
            Cancelar
          </button>
        </div>
        {recomeco && <p className="muted small" style={{ textAlign: 'center', marginTop: 10 }}>Sem fichas para o buy-in: esta mesa é o recomeço, e sai de graça.</p>}
      </motion.div>
    </div>
  );
}

/**
 * Fila rápida: escolhe só a moeda e entra.
 *
 * O resto é do servidor — ele procura uma mesa da fila que já exista e, se não houver, abre uma com
 * três bots que vão saindo conforme gente chega. A mesa é cash: você joga com o que é seu até zerar.
 *
 * Padocoins só aparecem para quem tem o Discord vinculado; na mesa eles são as fichas normais.
 */
function QueueModal({ onClose }: { onClose: () => void }) {
  const quickMatch = useSession((s) => s.quickMatch);
  const queueing = useSession((s) => s.queueing);
  const chips = useChips();
  const pado = usePado();
  const stakes = QUEUE_STAKES;

  const entrar = (moeda: 'chips' | 'pado') => {
    sfx.click();
    quickMatch(moeda);
  };

  return (
    <div className="modal-back" onClick={queueing ? undefined : onClose}>
      <motion.div className="modal panel queue-modal" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="title-deco">PvP Queue</h2>
        <p className="muted">
          O servidor acha uma mesa com gente — ou abre uma com bots, que saem conforme jogadores chegam. Cash, com rebuy: você joga com o que é seu
          até zerar.
        </p>

        {queueing ? (
          <div className="queue-wait">
            <span className="queue-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            Procurando mesa…
          </div>
        ) : (
          <div className="queue-opts">
            <button className="queue-opt" disabled={chips < stakes.chips.buyIn} onClick={() => entrar('chips')}>
              <span className="queue-opt-coin">
                <ChipSvg value={100} size={34} />
              </span>
              <span className="queue-opt-main">
                <b>Fichas</b>
                <small>
                  Buy-in {fmt(stakes.chips.buyIn)} · blinds {stakes.chips.smallBlind}/{stakes.chips.bigBlind}
                </small>
              </span>
              {chips < stakes.chips.buyIn && <span className="queue-opt-no">saldo insuficiente</span>}
            </button>

            {pado !== null ? (
              <button className="queue-opt" disabled={pado < stakes.pado.buyIn} onClick={() => entrar('pado')}>
                <span className="queue-opt-coin">
                  <PadoCoinSvg size={34} />
                </span>
                <span className="queue-opt-main">
                  <b>Padocoins</b>
                  <small>
                    Buy-in {fmt(stakes.pado.buyIn)} · blinds {stakes.pado.smallBlind}/{stakes.pado.bigBlind}
                  </small>
                </span>
                {pado < stakes.pado.buyIn && <span className="queue-opt-no">padocoins insuficientes</span>}
              </button>
            ) : (
              <div className="field-hint queue-hint">
                Vincule seu Discord em <b>Ajustes → Conta</b> para jogar valendo <b>padocoins</b>.
              </div>
            )}
          </div>
        )}

        <div className="row gap center" style={{ marginTop: 16 }}>
          <button className="btn btn-ghost" disabled={queueing} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function TopBar({ go }: { go: (s: Screen) => void }) {
  const name = useProfile((s) => s.name);
  const muted = useProfile((s) => s.settings.muted);
  const updateSettings = useProfile((s) => s.updateSettings);
  const st = useCharacter();
  const stats = useMyStats();
  const title = useMyTitle();
  const temConta = useSession((s) => !!s.account);
  const lv = levelInfo(stats);
  return (
    <div className="top-bar">
      {/*
        * A pílula do jogador **é** a barra de experiência: ela começa transparente e vai enchendo
        * da esquerda para a direita, como líquido numa garrafa deitada. Por isso a porcentagem é
        * uma variável de CSS aqui — o preenchimento é o fundo dela, não um risco embaixo do nome.
        *
        * O nome não se edita daqui: quem troca é o Perfil, que abre clicando na foto. Um campo de
        * texto no meio do menu convidava a apagar o nome sem querer, e dava um cursor piscando
        * onde devia haver uma etiqueta.
        */}
      <div
        className="player-chip"
        style={{ '--xp': `${Math.round(lv.progress * 100)}%`, '--xp-cor': levelColor(lv.level) } as CSSProperties}
        title={`${lv.into} / ${lv.need} de experiência para o nível ${lv.level + 1}`}
      >
        {/* a foto abre o perfil: trocar de personagem tem botão próprio lá embaixo */}
        <button className="player-portrait" style={{ background: `linear-gradient(160deg, ${st.bg}, ${st.bg2})` }} onClick={() => go('profile')} title="Ver perfil">
          <CharacterPortrait st={st} size={54} />
        </button>
        {/* as bolhas sobem dentro do líquido: o recorte para no nível, como numa bebida gaseificada */}
        <span className="player-bolhas" aria-hidden>
          <Sparks color={levelColor(lv.level)} count={14} size={6} rise={42} spread={300} speed={4.2} />
        </span>
        <div className="player-meta">
          <span className="player-name">{name}</span>
          {title ? <TitleGlow title={title} className="player-title" /> : <i className="player-sem-titulo">{temConta ? 'sem título' : 'sem conta'}</i>}
        </div>
        <LevelNumber level={lv.level} size={22} className="player-nivel" />
      </div>
      <WalletBar />
      <div className="top-actions">
        <HandGuideButton />
        <button className="round-icon" title={muted ? 'Ativar som' : 'Silenciar'} onClick={() => updateSettings({ muted: !muted })}>
          {muted ? '🔇' : '🔊'}
        </button>
        <button className="round-icon" title="Configurações" onClick={() => go('settings')}>
          ⚙
        </button>
      </div>
    </div>
  );
}

function ModeCard({ title, sub, glyph, cls, onClick, delay }: { title: string; sub: string; glyph: string; cls: string; onClick: () => void; delay: number }) {
  const face = useEquipped('face');
  return (
    <motion.button
      className={`mode-card ${cls}`}
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay, type: 'spring', stiffness: 150, damping: 18 }}
      whileHover={{ y: -8 }}
      onMouseEnter={() => sfx.hover()}
      onClick={() => {
        sfx.click();
        onClick();
      }}
    >
      <span className="mode-glyph">{glyph}</span>
      <span className="mode-cards-deco">
        <span style={{ transform: 'rotate(-14deg) translateX(-26px)' }}>
          <CardFaceSvg card={{ r: 14, s: glyph === '♥' ? 'h' : 's' }} style={face} width={64} />
        </span>
        <span style={{ transform: 'rotate(10deg) translateX(22px)' }}>
          <CardFaceSvg card={{ r: 13, s: glyph === '♥' ? 'h' : 's' }} style={face} width={64} />
        </span>
      </span>
      <span className="mode-title">{title}</span>
      <span className="mode-sub">{sub}</span>
      <span className="mode-shine" />
    </motion.button>
  );
}

export function MainMenu({ go, openQueue = false }: { go: (s: Screen) => void; openQueue?: boolean }) {
  const [quick, setQuick] = useState(false);
  // `openQueue` existe para a página de pré-visualização poder abrir a fila (veja src/dev/preview.tsx)
  const [queue, setQueue] = useState(openQueue);
  const queueing = useSession((s) => s.queueing);
  const pedidos = usePedidos();
  const { menu } = useUiTheme();
  const icons: { key: Screen; icon: string; label: string }[] = [
    { key: 'friends', icon: '☻', label: 'Amigos' },
    { key: 'characters', icon: menu.icons.characters, label: 'Personagens' },
    { key: 'store', icon: '🛍', label: 'Loja' },
    { key: 'gallery', icon: '🖼', label: 'Galeria' },
    { key: 'studio', icon: menu.icons.studio, label: 'Estúdio' },
    { key: 'settings', icon: menu.icons.settings, label: 'Ajustes' },
  ];
  return (
    <div className="menu-screen mj-menu">
      <div className="menu-bg" />
      <div className="menu-rays" />
      <Petals />
      <CharacterStageView className="menu-char" />
      <TopBar go={go} />
      <motion.div className="menu-logo" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
        <span className="logo-main">
          P<span className="logo-spade">♠</span>ke<span className="logo-accent">ru</span>
        </span>
        {menu.flourish && (
          <span className="logo-flourish" aria-hidden>
            <i />
            {menu.flourish}
            <i />
          </span>
        )}
        <span className="logo-sub">{menu.subtitle}</span>
        {menu.motto && <span className="logo-est">{menu.motto}</span>}
      </motion.div>
      <div className="mode-area">
        <div className="mode-cards">
          <ModeCard title="PvP Queue" sub="Mesa com gente, na hora" glyph="⚡" cls="gold" onClick={() => setQueue(true)} delay={0.12} />
          <ModeCard title="Contra Bots" sub="No servidor, valendo fichas" glyph="♠" cls="blue" onClick={() => setQuick(true)} delay={0.2} />
          <ModeCard title="Custom" sub="Escolher ou criar a mesa" glyph="♥" cls="pink" onClick={() => go('online')} delay={0.28} />
        </div>
        <div className="bottom-icons">
          {icons.map((it, i) => (
            <motion.button
              key={it.key}
              className="icon-btn"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.35 + i * 0.06 }}
              onMouseEnter={() => sfx.hover()}
              onClick={() => {
                sfx.click();
                go(it.key);
              }}
            >
              <span className="icon-circle">
                {it.icon}
                {/* a bolinha dos pedidos: quem chamou você espera resposta, e isso não pode ficar escondido */}
                {it.key === 'friends' && pedidos > 0 && <i className="icon-badge">{pedidos}</i>}
              </span>
              <span className="icon-label">{it.label}</span>
            </motion.button>
          ))}
        </div>
      </div>
      <div className="version">v{APP_VERSION}</div>
      {quick && <BotMatchModal onClose={() => setQuick(false)} />}
      {(queue || queueing) && <QueueModal onClose={() => setQueue(false)} />}
    </div>
  );
}
