import { TitlePanel } from '../game/Titles';
import { MinhaPersonalidade } from '../game/Personality';
import { useCharacter, useProfile } from '../store/profile';
import { useSession } from '../store/session';
import { useMyStats } from '../store/titles';
import { levelInfo } from '../../shared/achievements';
import { PARTIDAS_NO_HISTORICO, personalidadeDe, tracoDominante, ultimasPartidas, type ResumoDaPartida } from '../../shared/personality';
import { findCharacter } from '../../shared/styles';
import { prettyFriendCode } from '../../shared/friends';
import { ScreenHeader, Section, Field } from '../ui/controls';
import { CharacterPortrait } from '../render/CharacterArt';
import { PortraitFrame, findFrame } from '../render/PortraitFrame';
import { LevelNumber } from '../render/Level';
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
      <span className="hist-char" style={{ background: `linear-gradient(160deg, ${char.bg}, ${char.bg2})` }} title={`Jogou com ${char.name}`}>
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
 * São as mesmas que alimentam o gráfico, e é de propósito: ver a lista logo abaixo da mancha
 * explica de onde ela saiu. Cinco linhas — mais que isso vira extrato de banco.
 */
function Historico() {
  const play = useSession((s) => s.account?.play);
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
 * O perfil: quem a pessoa é no jogo.
 *
 * Saiu de dentro de Configurações porque não é configuração nenhuma. Ajuste é o que a pessoa mexe
 * uma vez e esquece; isto é o que ela **volta** para ver — o nível que subiu, o gráfico
 * entortando, o título novo. Misturados, o perfil ficava escondido embaixo de um controle de
 * volume.
 *
 * Abre pela foto no menu, que é onde a mão já ia. Personagem tem botão próprio lá embaixo e conta
 * ficou em Configurações, onde moram as coisas que se resolvem uma vez.
 */
export function ProfileScreen({ onBack }: { onBack: () => void }) {
  const p = useProfile();
  const code = useSession((s) => s.account?.code);
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
            {/* o retrato do perfil é a sua foto: leva a moldura que você escolheu */}
            <div className="char-info-portrait com-moldura" style={{ background: `linear-gradient(160deg, ${character.bg}, ${character.bg2})` }}>
              <CharacterPortrait st={character} size={96} />
              <PortraitFrame frame={findFrame(p.frame)} size={96} />
            </div>
            <div className="profile-cab-meta">
              <Field label="Nome">
                <input className="input" value={p.name} maxLength={16} onChange={(e) => p.setName(e.target.value)} />
              </Field>
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
          <Section title="Títulos e conquistas">
            <TitlePanel />
          </Section>
        </div>
        <div className="panel pad">
          <Section title="Como você joga">
            <MinhaPersonalidade />
          </Section>
          <Section title="Últimas partidas">
            <Historico />
          </Section>
        </div>
      </div>
    </div>
  );
}
