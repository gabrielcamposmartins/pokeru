import { useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { CHARACTER_PRESETS } from '../../shared/styles';
import { itemKey, ownsItem, priceOf } from '../../shared/catalog';
import { HEARTS } from '../game/bond';
import { useProfile } from '../store/profile';
import { useSession } from '../store/session';
import { CharacterFull, CharacterPortrait } from '../render/CharacterArt';
import { BondBar, BondHearts } from '../game/BondBar';
import { BondPage } from '../game/BondPage';
import { useBondLevel } from '../store/bond';
import { useOwned } from '../store/shop';
import { fmt } from '../util/format';
import { ScreenHeader } from '../ui/controls';
import { sfx } from '../audio/sfx';
import { Petals } from './MainMenu';

/** Corações do vínculo no cantinho de cada retrato da galeria. */
function CardHearts({ id }: { id: string }) {
  const lv = useBondLevel(id);
  if (!lv.hearts && lv.progress <= 0) return null;
  return (
    <span className="char-card-bond">
      <BondHearts hearts={lv.hearts} progress={lv.progress} size={13} />
    </span>
  );
}

/** Cadeado no canto do retrato de quem ainda não é do jogador. */
function CardLock({ id }: { id: string }) {
  const owned = useOwned();
  return ownsItem(owned, 'character', id) ? null : <span className="char-card-lock">🔒</span>;
}

/** Galeria de personagens (estilo tela de personagens do Mahjong Soul). */
export function CharactersScreen({ onBack, onStore }: { onBack: () => void; onStore?: () => void }) {
  const profile = useProfile();
  const owned = useOwned();
  const toast = useSession((s) => s.toast);
  const [sel, setSel] = useState(profile.character);
  const [bondOpen, setBondOpen] = useState(false);
  const [talk, setTalk] = useState<string | null>(null);
  const hop = useAnimationControls();
  const current = CHARACTER_PRESETS.find((c) => c.id === sel) ?? CHARACTER_PRESETS[0];
  const chosen = profile.character === current.id;
  // personagem é item de loja: só entra na mesa quem é do jogador (o servidor confere de novo)
  const mine = ownsItem(owned, 'character', current.id);
  const preco = priceOf(itemKey('character', current.id), 'chips') ?? 0;
  const bond = useBondLevel(current.id);

  const say = () => {
    setTalk(current.lines[Math.floor(Math.random() * current.lines.length)]);
    sfx.pop();
    void hop.start({ y: [0, -16, 0], transition: { duration: 0.4 } });
    setTimeout(() => setTalk(null), 2800);
  };

  return (
    <div className="screen chars-screen">
      <div className="menu-bg" />
      <Petals />
      <ScreenHeader title="Personagens" onBack={onBack} />
      <div className="chars-body">
        <div className="chars-stage">
          <div className="char-glow" style={{ background: `radial-gradient(ellipse at 50% 55%, ${current.bg}99, transparent 65%)` }} />
          <motion.div key={current.id} className="char-figure" initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
            <motion.div animate={hop}>
              <CharacterFull st={current} height={Math.min(780, window.innerHeight * 0.8)} animate onClick={say} className="clickable" />
            </motion.div>
          </motion.div>
          {talk && (
            <motion.div className="speech" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}>
              {talk}
            </motion.div>
          )}
          <div className="char-nameplate">
            <b>{current.name}</b>
          </div>
        </div>
        <div className="panel chars-side">
          <div className="char-info">
            <div className="row gap">
              <div className="char-info-portrait" style={{ background: `linear-gradient(160deg, ${current.bg}, ${current.bg2})` }}>
                <CharacterPortrait st={current} size={84} />
              </div>
              <div>
                <h2 className="title-deco" style={{ margin: 0 }}>
                  {current.name}
                </h2>
                <BondBar char={current} size={18} compact />
                {chosen && (
                  <div className="badges" style={{ marginTop: 6 }}>
                    <span className="badge eq">Em uso</span>
                  </div>
                )}
              </div>
            </div>
            <div className="row gap wrap" style={{ marginTop: 14 }}>
              {mine ? (
                <button
                  className="btn btn-gold"
                  disabled={chosen}
                  onClick={() => {
                    profile.setCharacter(current.id);
                    sfx.win();
                    toast(`${current.name} agora te acompanha na mesa!`);
                  }}
                >
                  {chosen ? '✓ Em uso' : 'Usar este personagem'}
                </button>
              ) : (
                <button
                  className="btn btn-gold"
                  onClick={() => {
                    sfx.click();
                    if (onStore) onStore();
                    else toast('Abra a Loja para desbloquear este personagem.');
                  }}
                >
                  🔒 {fmt(preco)} fichas · na Loja
                </button>
              )}
              <button
                className="btn btn-pink"
                onClick={() => {
                  sfx.click();
                  setBondOpen(true);
                }}
              >
                ♥ Vínculo · {bond.hearts}/{HEARTS}
              </button>
            </div>
          </div>
          <div className="char-grid">
            {CHARACTER_PRESETS.map((c) => (
              <button
                key={c.id}
                className={`char-card ${c.id === current.id ? 'on' : ''}`}
                onClick={() => {
                  sfx.click();
                  setSel(c.id);
                }}
                style={{ background: `linear-gradient(160deg, ${c.bg}, ${c.bg2})` }}
              >
                <CharacterPortrait st={c} size={120} />
                <span className="char-card-name">{c.name}</span>
                <CardHearts id={c.id} />
                <CardLock id={c.id} />
                {profile.character === c.id && <span className="char-card-eq">✓</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
      {bondOpen && <BondPage char={current} onClose={() => setBondOpen(false)} />}
    </div>
  );
}
