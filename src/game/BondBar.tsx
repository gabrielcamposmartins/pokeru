import { useEffect, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { findCharacter, type CharacterStyle } from '../../shared/styles';
import { useBond, useBondLevel, useBondStats, unlockReward, type BondStats, type BondUnlock } from '../store/bond';
import { HEARTS, REWARD_KIND_LABEL, bondLevel, rewardsOf, type BondLevel, type BondReward } from './bond';
import { CharacterPortrait } from '../render/CharacterArt';
import { sfx } from '../audio/sfx';

/**
 * A barra de vínculo: cinco corações que enchem conforme você joga com o personagem.
 * O modelo (pontos, corações e recompensas) está em src/game/bond.ts.
 */

const HEART_PATH =
  'M12 20.6C12 20.6 3 14.9 3 9.3C3 6.4 5.2 4.2 7.9 4.2C9.8 4.2 11.2 5.2 12 6.6C12.8 5.2 14.2 4.2 16.1 4.2C18.8 4.2 21 6.4 21 9.3C21 14.9 12 20.6 12 20.6Z';

/**
 * Um coração: cheio, vazio ou preenchido em parte (`fill` de 0 a 1).
 * As classes de estado ficam no espaço "bond-" de propósito: `full`/`empty` soltas
 * bateriam nos utilitários do global.css (`.empty` tem padding).
 */
function Heart({ fill, size, id }: { fill: number; size: number; id: string }) {
  const p = Math.max(0, Math.min(1, fill));
  return (
    <svg className={`bond-heart ${p >= 1 ? 'bond-full' : p > 0 ? 'bond-part' : 'bond-void'}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {p > 0 && (
        <defs>
          <clipPath id={id}>
            <rect x="0" y="0" width={24 * p} height="24" />
          </clipPath>
        </defs>
      )}
      <path className="bond-heart-bg" d={HEART_PATH} />
      {p > 0 && <path className="bond-heart-fill" d={HEART_PATH} clipPath={`url(#${id})`} />}
      <path className="bond-heart-line" d={HEART_PATH} />
    </svg>
  );
}

export function BondHearts({ hearts, progress, size = 22, className }: { hearts: number; progress: number; size?: number; className?: string }) {
  const uid = useId();
  return (
    <span className={`bond-hearts ${className ?? ''}`}>
      {Array.from({ length: HEARTS }, (_, i) => (
        <Heart key={i} id={`${uid}-${i}`} size={size} fill={i < hearts ? 1 : i === hearts ? progress : 0} />
      ))}
    </span>
  );
}

/** Corações + barra do coração em andamento. `compact` mostra só os corações e o total. */
export function BondBarView({ lv, size = 22, compact }: { lv: BondLevel; size?: number; compact?: boolean }) {
  return (
    <div className={`bond-bar ${compact ? 'compact' : ''}`}>
      <BondHearts hearts={lv.hearts} progress={lv.progress} size={size} />
      {!compact && (
        <div className="bond-track">
          <motion.div className="bond-fill" initial={false} animate={{ width: `${lv.progress * 100}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
        </div>
      )}
      <span className="bond-count">
        {lv.max ? 'Vínculo completo' : compact ? `${lv.intoHeart}/${lv.heartCost}` : `${lv.intoHeart} / ${lv.heartCost} para o ${lv.hearts + 1}º coração`}
      </span>
    </div>
  );
}

/** A barra do vínculo com um personagem (lê o progresso salvo). */
export function BondBar({ char, size, compact }: { char: CharacterStyle; size?: number; compact?: boolean }) {
  return <BondBarView lv={useBondLevel(char.id)} size={size} compact={compact} />;
}

/** Uma recompensa da escada. */
export function BondRewardRow({ r, unlocked, next }: { r: BondReward; unlocked: boolean; next?: boolean }) {
  return (
    <div className={`bond-reward ${unlocked ? 'on' : ''} ${next ? 'next' : ''} ${r.soon ? 'soon' : ''}`}>
      <span className="bond-reward-heart">
        <Heart fill={unlocked ? 1 : 0} size={26} id={`rw-${r.id}`} />
        <i>{r.heart}</i>
      </span>
      <span className="bond-reward-info">
        <b>
          <span className="bond-reward-ico">{r.icon}</span>
          {r.name}
          <span className="badges">
            <span className="badge">{REWARD_KIND_LABEL[r.kind]}</span>
            {r.soon && <span className="badge soon">Em breve</span>}
            {unlocked && !r.soon && <span className="badge eq">Recebida</span>}
          </span>
        </b>
        <small>{r.description}</small>
      </span>
    </div>
  );
}

/** A escada das cinco recompensas do personagem. */
export function BondRewards({ char, hearts }: { char: CharacterStyle; hearts: number }) {
  return (
    <div className="bond-rewards">
      {rewardsOf(char).map((r) => (
        <BondRewardRow key={r.id} r={r} unlocked={r.heart <= hearts} next={r.heart === hearts + 1} />
      ))}
    </div>
  );
}

/** Painel completo: corações, números da convivência e as recompensas. */
export function BondPanelView({ char, st }: { char: CharacterStyle; st: BondStats }) {
  const lv = bondLevel(st.points);
  return (
    <div className="bond-panel">
      <div className="bond-head">
        <BondBarView lv={lv} />
        <span className="bond-total">
          {st.points} <small>pts</small>
        </span>
      </div>
      <div className="bond-stats">
        <span>
          <b>{st.wins}</b>
          <small>vitórias</small>
        </span>
        <span>
          <b>{st.losses}</b>
          <small>derrotas</small>
        </span>
        <span>
          <b>{st.hands}</b>
          <small>mãos</small>
        </span>
        <span>
          <b>{st.matches}</b>
          <small>partidas</small>
        </span>
      </div>
      <p className="field-hint">
        {lv.max
          ? `Vínculo completo com ${char.name}: todas as recompensas recebidas.`
          : `Ganhar rende mais, mas perder ao lado de ${char.name} também aproxima. Faltam ${lv.toNext} pontos para o ${lv.hearts + 1}º coração.`}
      </p>
      <BondRewards char={char} hearts={lv.hearts} />
    </div>
  );
}

/** O painel de vínculo de um personagem (lê o progresso salvo). */
export function BondPanel({ char }: { char: CharacterStyle }) {
  return <BondPanelView char={char} st={useBondStats(char.id)} />;
}

/** Pontos de vínculo ganhos na partida (mostrado no placar final). */
export function BondGain({ char }: { char: CharacterStyle }) {
  const gain = useBond((s) => s.gain[char.id] ?? 0);
  const lv = useBondLevel(char.id);
  if (!gain) return null;
  return (
    <div className="bond-gain">
      <span className="bond-gain-face" style={{ background: `linear-gradient(160deg, ${char.bg}, ${char.bg2})` }}>
        <CharacterPortrait st={char} size={34} />
      </span>
      <span className="bond-gain-text">
        <b>+{gain} de vínculo com {char.name}</b>
        <BondHearts hearts={lv.hearts} progress={lv.progress} size={15} />
      </span>
    </div>
  );
}

/**
 * Anúncio do coração completo: um cartão no alto da tela com a recompensa recebida.
 * Não bloqueia a mesa — sai sozinho depois de alguns segundos ou no clique.
 */
export function BondUnlockCard({ u, onDone }: { u: BondUnlock; onDone: () => void }) {
  const char = findCharacter(u.char);
  const reward = unlockReward(u);
  useEffect(() => {
    sfx.win();
    const t = setTimeout(onDone, 6000);
    return () => clearTimeout(t);
  }, [u.id, onDone]);
  return (
    <motion.div
      className="bond-unlock"
      initial={{ y: -40, opacity: 0, scale: 0.9 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: -30, opacity: 0, transition: { duration: 0.25 } }}
      transition={{ type: 'spring', stiffness: 220, damping: 20 }}
      onClick={onDone}
      role="button"
    >
      <span className="bond-unlock-face" style={{ background: `linear-gradient(160deg, ${char.bg}, ${char.bg2})` }}>
        <CharacterPortrait st={char} size={64} />
        <motion.i className="bond-unlock-burst" animate={{ scale: [0.6, 1.25, 1], opacity: [0, 1, 0.85] }} transition={{ duration: 0.7 }}>
          ♥
        </motion.i>
      </span>
      <span className="bond-unlock-text">
        <small>
          {u.heart}º coração com {char.name}
        </small>
        <b>{reward ? reward.name : 'Recompensa de vínculo'}</b>
        <span className="bond-unlock-desc">{reward?.soon ? 'Chega numa atualização: o coração já está guardado.' : (reward?.description ?? '')}</span>
        <BondHearts hearts={u.heart} progress={0} size={16} />
      </span>
    </motion.div>
  );
}

/** Fila dos anúncios de vínculo (um de cada vez). */
export function BondUnlockScreen() {
  const pending = useBond((s) => s.pending);
  const ack = useBond((s) => s.ack);
  const u = pending[0];
  return <AnimatePresence>{u && <BondUnlockCard key={u.id} u={u} onDone={ack} />}</AnimatePresence>;
}
