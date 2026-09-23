import { TitlePanel } from '../game/Titles';
import { MinhaPersonalidade } from '../game/Personality';
import { useCharacter, useProfile } from '../store/profile';
import { useMyStats } from '../store/titles';
import { levelInfo } from '../../shared/achievements';
import { ScreenHeader, Section, Field } from '../ui/controls';
import { CharacterPortrait } from '../render/CharacterArt';
import { LevelNumber } from '../render/Level';
import { Petals } from './MainMenu';

/**
 * O perfil: quem a pessoa é no jogo.
 *
 * Saiu de dentro de Configurações porque não é configuração nenhuma. Ajuste é o que a pessoa mexe
 * uma vez e esquece; isto é o que ela **volta** para ver — o nível que subiu, a flor entortando, o
 * título novo. Misturados, o perfil ficava escondido embaixo de um controle de volume.
 *
 * Abre pela foto no menu, que é onde a mão já ia. Personagem tem botão próprio lá embaixo e conta
 * ficou em Configurações, onde moram as coisas que se resolvem uma vez.
 */
export function ProfileScreen({ onBack }: { onBack: () => void }) {
  const p = useProfile();
  const character = useCharacter();
  const stats = useMyStats();
  const lv = levelInfo(stats);
  return (
    <div className="screen">
      <div className="menu-bg" />
      <Petals />
      <ScreenHeader title="Perfil" onBack={onBack} />
      <div className="profile-grid">
        <div className="panel pad">
          {/*
            * O cabeçalho é a identidade: retrato, nome e nível grandes.
            *
            * O mesmo número da tela de carregamento, na mesma cor da dezena — quem chegou ao 30
            * reconhece o verde antes de ler o algarismo.
            */}
          <div className="profile-cab">
            <div className="char-info-portrait" style={{ background: `linear-gradient(160deg, ${character.bg}, ${character.bg2})` }}>
              <CharacterPortrait st={character} size={96} />
            </div>
            <div className="profile-cab-meta">
              <Field label="Nome">
                <input className="input" value={p.name} maxLength={16} onChange={(e) => p.setName(e.target.value)} />
              </Field>
              <span className="profile-com">
                com <b>{character.name}</b>
              </span>
            </div>
            <div className="profile-nivel">
              <LevelNumber level={lv.level} size={54} />
              <small className="muted">
                {lv.into} / {lv.need} xp
              </small>
            </div>
          </div>
          <Section title="Títulos e conquistas">
            <TitlePanel />
          </Section>
        </div>
        <div className="panel pad">
          <Section title="Como você joga">
            <MinhaPersonalidade />
          </Section>
        </div>
      </div>
    </div>
  );
}
