import { motion } from 'framer-motion';
import type { CharacterStyle } from '../../shared/styles';
import { FALA_MOMENTO, comumText, falaText } from '../audio/falas';
import { say, voiceUrl } from '../audio/voice';
import { sfx } from '../audio/sfx';
import { useProfile } from '../store/profile';
import { useBondStats } from '../store/bond';
import { giveGift, useCanShop, useGifts, useBondUnlocked } from '../store/shop';
import { GIFTS, itemKey, rarityLabel, rarityOf } from '../../shared/catalog';
import { bondBlocked, giftFits, giftPoints, giftRarityFor, gostaDe, questDone, questsFor } from '../../shared/bond';
import { CharacterPortrait } from '../render/CharacterArt';
import { BondBarView, BondHearts, Heart } from './BondBar';
import {
  BOND_COUNTERS,
  BOND_MISSIONS,
  BOND_POINTS,
  HEARTS,
  HEART_COST,
  type HeartQuest,
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
 * **A tranca das missões.** Jogar enche o coração; quem o abre é a missão do personagem
 * (shared/bond.ts). Por isso `unlocked` é separado dos pontos: a barra pode estar cheia e a
 * recompensa ainda não ter saído. Quando ninguém informa `unlocked` — jogo local, sem conta —,
 * ele vale os corações dos pontos e a escada antiga continua igual.
 *
 * **Os presentes** não abrem nada: enchem a barra. Cada coração exige um degrau de raridade mais
 * alto, então a prateleira de presentes aqui mostra o que **serve agora** e o que já ficou pequeno.
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

// ------------------------------------------------------------------ a tranca e os presentes

/** A missão que abre o próximo coração, com o quanto já foi feito. */
function QuestLine({ st, q }: { st: BondStats; q: HeartQuest }) {
  const tem = st[q.counter] ?? 0;
  const ok = questDone(st, q);
  const label = BOND_COUNTERS.find((c) => c.key === q.counter)?.label ?? q.counter;
  return (
    <span className={`bond-quest ${ok ? 'ok' : 'falta'}`}>
      <i>{ok ? '✓' : '○'}</i>
      <span>{label}</span>
      <b>
        {Math.min(tem, q.need)}/{q.need}
      </b>
    </span>
  );
}

/**
 * O coração cheio esperando a missão.
 *
 * Aparece só quando a barra bateu no teto: até lá a missão é só uma linha da lista, e pô-la em
 * destaque o tempo todo transformaria o vínculo numa lista de tarefas.
 */
function QuestGate({ char, heart, st }: { char: CharacterStyle; heart: number; st: BondStats }) {
  const quests = questsFor(heart);
  if (!quests.length) return null;
  return (
    <section className="bond-gate">
      <div className="bond-gate-cab">
        <Heart fill={1} size={20} id={`gate-${char.id}`} />
        <b>
          O {heart}º coração está cheio — falta cumprir a missão de {char.name}
        </b>
      </div>
      <div className="bond-gate-lista">
        {quests.map((q) => (
          <QuestLine key={q.counter} st={st} q={q} />
        ))}
      </div>
      <div className="bond-gate-pe">
        <small className="muted">Presentes não abrem coração: eles enchem a barra. Quem abre é jogar.</small>
      </div>
    </section>
  );
}

/**
 * A prateleira de presentes.
 *
 * Mostra o estoque com o que cada presente rende **para este personagem** — o predileto dele vem
 * com o bônus já embutido no número, porque ninguém deveria precisar fazer a conta — e apaga o
 * que já ficou pequeno para o coração atual.
 */
function GiftShelf({
  char,
  unlocked,
  gifts,
  cheio,
  onGive,
}: {
  char: CharacterStyle;
  unlocked: number;
  gifts: Readonly<Record<string, number>>;
  /** A barra bateu no teto: presente não entra mais até a missão fechar. */
  cheio: boolean;
  onGive?: (id: string) => void;
}) {
  const minima = giftRarityFor(unlocked);
  const tem = GIFTS.filter((g) => (gifts[g.id] ?? 0) > 0);
  return (
    <section className="bond-presentes">
      <div className="bond-presentes-cab">
        <b>Presentes</b>
        <small className="muted">
          Do {unlocked + 1}º coração em diante, {char.name} só aceita <b>{rarityLabel(minima).toLowerCase()}</b> ou melhor.
        </small>
      </div>
      {tem.length === 0 ? (
        <p className="bond-presentes-vazio">Sem presentes no estoque. Eles estão na Loja → Presentes, e também caem nos tickets.</p>
      ) : (
        <div className="bond-presentes-lista">
          {tem.map((g) => {
            const serve = giftFits(g.id, unlocked);
            const pontos = giftPoints(char.id, g.id);
            const favorito = gostaDe(char.id, g.id);
            const r = rarityOf(itemKey('gift', g.id));
            return (
              <button
                key={g.id}
                className={`bond-presente r-${r} ${serve && !cheio ? '' : 'off'}`}
                disabled={!serve || cheio || !onGive}
                title={
                  cheio
                    ? 'A barra está cheia: cumpra a missão deste coração'
                    : serve
                      ? `+${pontos} de vínculo${favorito ? ` — ${char.name} gosta especialmente` : ''}`
                      : `${rarityLabel(r)} é pouco para este coração`
                }
                onClick={() => onGive?.(g.id)}
              >
                <i className="bond-presente-ico">{g.icon}</i>
                <span className="bond-presente-nome">
                  {g.name}
                  {favorito && <em title={`${char.name} gosta especialmente`}>♥</em>}
                </span>
                <span className="bond-presente-pts">{serve ? `+${pontos}` : rarityLabel(r)}</span>
                <span className="bond-presente-qtd">×{gifts[g.id]}</span>
              </button>
            );
          })}
        </div>
      )}
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
  onGive,
}: {
  char: CharacterStyle;
  st: BondStats;
  onClose?: () => void;
  /** Corações abertos pelas missões. Ausente = vale o que os pontos dizem (jogo local). */
  unlocked?: number;
  gifts?: Readonly<Record<string, number>>;
  onGive?: (gift: string) => void;
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
              ? `A barra chegou ao fim do ${abertos + 1}º coração e para aí até a missão fechar. Presente enche a barra; quem abre o coração é jogar.`
              : `Ganhar rende mais, mas perder ao lado de ${char.name} também aproxima. Faltam ${lv.toNext} pontos para o ${abertos + 1}º coração${next ? ` — ${next.name}` : ''}.`}
        </p>

        {travado && <QuestGate char={char} heart={abertos + 1} st={st} />}
        {unlocked !== undefined && <GiftShelf char={char} unlocked={abertos} gifts={gifts} cheio={travado} onGive={onGive} />}

        <div className="bond-page-body">
          <section className="bond-page-col">
            <h3>Missões</h3>
            {abertos < HEARTS && (
              <div className="bond-proximo">
                <b>Para abrir o {abertos + 1}º coração</b>
                <div className="bond-gate-lista">
                  {questsFor(abertos + 1).map((q) => (
                    <QuestLine key={q.counter} st={st} q={q} />
                  ))}
                </div>
              </div>
            )}
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
      onGive={(gift) => {
        sfx.click();
        giveGift(char.id, gift);
      }}
      onClose={() => {
        sfx.click();
        onClose();
      }}
    />
  );
}
