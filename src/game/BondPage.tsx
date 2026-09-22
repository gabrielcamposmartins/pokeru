import { motion } from 'framer-motion';
import type { CharacterStyle } from '../../shared/styles';
import { FALA_MOMENTO, comumText, falaText } from '../audio/falas';
import { say, voiceUrl } from '../audio/voice';
import { sfx } from '../audio/sfx';
import { useProfile } from '../store/profile';
import { useBondStats } from '../store/bond';
import { offerGifts, useCanShop, useGifts, useBondUnlocked } from '../store/shop';
import { findGift } from '../../shared/catalog';
import { bondBlocked, hasGifts, nextRecipe } from '../../shared/bond';
import { CharacterPortrait } from '../render/CharacterArt';
import { BondBarView, BondHearts, Heart } from './BondBar';
import {
  BOND_COUNTERS,
  BOND_MISSIONS,
  BOND_POINTS,
  HEARTS,
  HEART_COST,
  REWARD_KIND_LABEL,
  bondLevel,
  rewardsOf,
  type BondReward,
  type BondStats,
} from './bond';

/**
 * A página de vínculo de um personagem, aberta pelo botão na tela de Personagens.
 *
 * Mostra onde o vínculo está, as missões (o que rende pontos) e as cinco recompensas com
 * o conteúdo delas à mostra: a fala liberada com texto, tradução e o áudio para ouvir.
 *
 * **A tranca dos presentes.** Jogar enche o coração; quem o abre é uma combinação de presentes
 * (shared/bond.ts). Por isso `unlocked` é separado dos pontos: a barra pode estar cheia e a
 * recompensa ainda não ter saído. Quando ninguém informa `unlocked` — jogo local, sem conta, onde
 * não há loja nem presentes —, ele vale os corações dos pontos e a escada antiga continua igual.
 */

// ------------------------------------------------------------------ missões

function Missions({ st }: { st: BondStats }) {
  // duas missões podem alimentar o mesmo contador (mão grande/vitória): o número aparece só na primeira
  const shown = new Set<string>();
  return (
    <div className="bond-missions">
      {BOND_MISSIONS.map((m) => {
        const first = !shown.has(m.counter);
        shown.add(m.counter);
        return (
          <div key={m.ev} className="bond-mission">
            <span className="bond-mission-pts">+{BOND_POINTS[m.ev]}</span>
            <span className="bond-mission-info">
              <b>{m.label}</b>
              <small>{m.hint}</small>
            </span>
            {first && (
              <span className="bond-mission-count">
                {st[m.counter]}
                <small>{BOND_COUNTERS.find((c) => c.key === m.counter)?.label}</small>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ recompensas

/** Nome do arquivo de áudio como ele está na pasta (a url vem com os acentos escapados). */
function fileOf(url: string): string {
  const name = url.split('/').pop() ?? '';
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/** A fala liberada: momento, texto, tradução e o áudio (quando já existe). */
function VoiceReward({ char, r, unlocked }: { char: CharacterStyle; r: BondReward; unlocked: boolean }) {
  const slot = r.voice!;
  const fala = falaText(char.id, slot);
  const url = voiceUrl(char.id, 'fala', slot);
  const comum = r.replaces ? comumText(r.replaces) : undefined;
  const comumUrl = r.replaces ? voiceUrl(char.id, 'comum', r.replaces) : undefined;
  const voicesOn = useProfile((s) => s.settings.voices && !s.settings.muted);
  const canHear = unlocked && !!url && voicesOn;
  const why = !url ? 'O áudio dessa fala ainda não foi gravado' : !unlocked ? `Complete o ${r.heart}º coração para ouvir` : !voicesOn ? 'As vozes estão desligadas (Configurações → Áudio)' : '';
  return (
    <div className="bond-audio">
      <div className="bond-audio-row">
        <span className="bond-audio-moment">♪ {FALA_MOMENTO[slot]}</span>
        <button className="btn btn-ghost small" disabled={!canHear} title={why} onClick={() => say(url)}>
          ♪ Ouvir
        </button>
      </div>
      <b className="bond-audio-line">{fala?.text ?? '—'}</b>
      {fala?.pt && <span className="bond-audio-pt">“{fala.pt}”</span>}
      <small className="bond-audio-file">
        {url ? `Áudio: ${fileOf(url)}` : 'Áudio ainda não gravado — a fala fica guardada no texto'}
      </small>
      {comum && (
        <div className="bond-audio-swap">
          <small>No lugar da chamada comum:</small>
          <span className="bond-audio-comum">
            {comum.text} <i>“{comum.pt}”</i>
          </span>
          <button className="btn btn-ghost small" disabled={!comumUrl || !voicesOn} onClick={() => say(comumUrl)}>
            ♪
          </button>
        </div>
      )}
      {why && <small className="bond-audio-why">{why}</small>}
    </div>
  );
}

function EmoteReward({ r }: { r: BondReward }) {
  if (!r.emotes?.length) return <div className="bond-soon">O emote chega numa atualização. O coração fica guardado e ele aparece aqui quando existir.</div>;
  return (
    <div className="bond-emotes">
      {r.emotes.map((e) => (
        <span key={e} className="bond-emote">
          {e}
        </span>
      ))}
    </div>
  );
}

function SkinReward({ r }: { r: BondReward }) {
  if (!r.skin) return <div className="bond-soon">A skin chega numa atualização. O coração fica guardado e ela aparece aqui quando existir.</div>;
  return (
    <div className="bond-skin">
      {REWARD_KIND_LABEL.skin}: <b>{r.skin.id}</b> ({r.skin.kind})
    </div>
  );
}

function RewardCard({ char, r, hearts }: { char: CharacterStyle; r: BondReward; hearts: number }) {
  const unlocked = r.heart <= hearts;
  const next = r.heart === hearts + 1;
  return (
    <motion.div
      className={`bond-reward ${unlocked ? 'on' : ''} ${next ? 'next' : ''} ${r.soon ? 'soon' : ''}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * r.heart, duration: 0.25 }}
    >
      <div className="bond-reward-top">
        <span className="bond-reward-heart">
          <Heart fill={unlocked ? 1 : 0} size={30} id={`rw-${r.id}`} />
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
              {next && !unlocked && <span className="badge mine">Próxima</span>}
            </span>
          </b>
          <small>{r.description}</small>
        </span>
      </div>
      {r.kind === 'voice' && r.voice ? <VoiceReward char={char} r={r} unlocked={unlocked} /> : r.kind === 'emote' ? <EmoteReward r={r} /> : <SkinReward r={r} />}
    </motion.div>
  );
}

// ------------------------------------------------------------------ a tranca dos presentes

/**
 * O coração cheio esperando presentes.
 *
 * Mostra a receita com o que há e o que falta (`3/4`), e o botão que entrega. Quem confere de
 * verdade é o servidor: este botão só pede.
 */
function GiftGate({
  char,
  heart,
  gifts,
  onOffer,
}: {
  char: CharacterStyle;
  /** Coração que os presentes vão abrir (1 a HEARTS). */
  heart: number;
  gifts: Readonly<Record<string, number>>;
  onOffer?: () => void;
}) {
  const need = nextRecipe(char.id, heart - 1);
  if (!need) return null;
  const pode = hasGifts(gifts, need);
  return (
    <section className="bond-gate">
      <div className="bond-gate-cab">
        <Heart fill={1} size={20} id={`gate-${char.id}`} />
        <b>
          O {heart}º coração está cheio — {char.name} abre com presentes
        </b>
      </div>
      <div className="bond-gate-lista">
        {Object.entries(need).map(([id, qty]) => {
          const g = findGift(id);
          const tem = gifts[id] ?? 0;
          return (
            <span key={id} className={`bond-gate-item ${tem >= qty ? 'ok' : 'falta'}`}>
              <i>{g?.icon ?? '🎁'}</i>
              <span>{g?.name ?? id}</span>
              <b>
                {Math.min(tem, qty)}/{qty}
              </b>
            </span>
          );
        })}
      </div>
      <div className="bond-gate-pe">
        <button className="btn btn-gold small" disabled={!pode || !onOffer} onClick={onOffer}>
          Oferecer presentes
        </button>
        {!pode && <small className="muted">O que falta está na Loja → Presentes.</small>}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ página

export function BondPageView({
  char,
  st,
  onClose,
  unlocked,
  gifts = {},
  onOffer,
}: {
  char: CharacterStyle;
  st: BondStats;
  onClose?: () => void;
  /** Corações abertos com presentes. Ausente = vale o que os pontos dizem (jogo local). */
  unlocked?: number;
  gifts?: Readonly<Record<string, number>>;
  onOffer?: () => void;
}) {
  const lv = bondLevel(st.points);
  const abertos = unlocked ?? lv.hearts;
  const travado = unlocked !== undefined && bondBlocked(st.points, unlocked);
  /*
   * A barra do coração trancado.
   *
   * `bondLevel` conta o coração cheio como completo — para os pontos ele está. Mas aqui ele é o
   * coração **em andamento, no limite**: a barra mostra 60/60 do 1º em vez de 0/140 do 2º, senão a
   * página diria que o jogador está num coração que ainda não abriu.
   */
  const lvVis = travado
    ? { ...lv, hearts: abertos, intoHeart: HEART_COST[abertos], heartCost: HEART_COST[abertos], toNext: 0, progress: 1, max: false }
    : lv;
  const rewards = rewardsOf(char);
  const next = rewards.find((r) => r.heart === abertos + 1);
  return (
    <div className="bond-page">
      <div className="bond-page-back" onClick={onClose} />
      <motion.div className="panel bond-page-in" initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25 }}>
        <div className="bond-page-head">
          <span className="char-info-portrait" style={{ background: `linear-gradient(160deg, ${char.bg}, ${char.bg2})` }}>
            <CharacterPortrait st={char} size={84} />
          </span>
          <div className="bond-page-title">
            <h2 className="title-deco" style={{ margin: 0 }}>
              Vínculo com {char.name}
            </h2>
            <BondBarView lv={lvVis} />
          </div>
          <div className="bond-page-side">
            <span className="bond-total">
              {st.points} <small>pts</small>
            </span>
            <span className="bond-page-hearts">
              <BondHearts hearts={abertos} progress={lvVis.progress} size={18} />
              <small>
                {abertos} de {HEARTS} corações{travado ? ' · 1 trancado' : ''}
              </small>
            </span>
          </div>
          {onClose && (
            <button className="bond-page-close" onClick={onClose} aria-label="Fechar">
              ✕
            </button>
          )}
        </div>

        <p className="bond-page-lead">
          {abertos >= HEARTS
            ? `Vínculo completo: ${char.name} já entregou todas as recompensas.`
            : travado
              ? `A barra chegou ao fim do ${abertos + 1}º coração. Daqui em diante é presente: jogar não abre o que só um presente abre.`
              : `Ganhar rende mais, mas perder ao lado de ${char.name} também aproxima. Faltam ${lv.toNext} pontos para o ${abertos + 1}º coração${next ? ` — ${next.name}` : ''}.`}
        </p>

        {travado && <GiftGate char={char} heart={abertos + 1} gifts={gifts} onOffer={onOffer} />}

        <div className="bond-page-body">
          <section className="bond-page-col">
            <h3>Missões</h3>
            <Missions st={st} />
            <p className="bond-page-sum">
              <b>{st.hands}</b> mãos e <b>{st.matches}</b> partidas ao lado de {char.name}.
            </p>
          </section>
          <section className="bond-page-col rewards">
            <h3>Recompensas</h3>
            <div className="bond-rewards">
              {rewards.map((r) => (
                <RewardCard key={r.id} char={char} r={r} hearts={abertos} />
              ))}
            </div>
          </section>
        </div>
      </motion.div>
    </div>
  );
}

/** A página de vínculo do personagem (lê o progresso salvo). */
export function BondPage({ char, onClose }: { char: CharacterStyle; onClose: () => void }) {
  const st = useBondStats(char.id);
  const gifts = useGifts();
  const unlocked = useBondUnlocked(char.id);
  // sem conta no servidor não há presentes nem loja: a escada antiga vale, e a tranca não aparece
  const comConta = useCanShop();
  return (
    <BondPageView
      char={char}
      st={st}
      unlocked={comConta ? unlocked : undefined}
      gifts={gifts}
      onOffer={() => {
        sfx.click();
        offerGifts(char.id);
      }}
      onClose={() => {
        sfx.click();
        onClose();
      }}
    />
  );
}
