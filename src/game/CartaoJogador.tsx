/**
 * O card de um jogador — o da tela de abertura da partida.
 *
 * Personagem com as auras dentro de uma carta, o nível no canto, o par de cartas com a frente e o
 * verso que a pessoa usa apoiado na beirada, o nome em cima e o título embaixo. É como cada um se
 * mostra: na abertura, no grupo, na sala Custom e no perfil. Um componente só, para as quatro
 * telas não virarem quatro jeitos de desenhar a mesma pessoa.
 *
 * O tamanho vem de fora, pela variável `--cartao-w` (a abertura acompanha a altura da janela; as
 * outras telas usam uma largura fixa).
 */

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { AuraId, CardBackStyle, CardFaceStyle, CharacterStyle } from '../../shared/styles';
import { BACK_PRESETS, FACE_PRESETS, findCharacter } from '../../shared/styles';
import type { MemberInfo } from '../../shared/protocol';
import type { PartyMember } from '../../shared/friends';
import { playerLevel } from '../../shared/achievements';
import { useCharacter, useEquipped, useProfile } from '../store/profile';
import { useSession } from '../store/session';
import { useMyStats, useMyTitle } from '../store/titles';
import { CardView } from '../render/CardArt';
import { CharacterFull, CharacterPortrait } from '../render/CharacterArt';
import { PortraitFrame, findFrame } from '../render/PortraitFrame';
import { CharacterAura } from '../render/aura';
import { LevelNumber } from '../render/Level';
import { TitleGlow } from '../render/Title';

/** A carta virada para cima no par do card — a mesma para todos; o que muda é a frente de cada um. */
const MOSTRA = { r: 14, s: 's' as const };

/** O que o card desenha. */
export interface CartaoDados {
  name: string;
  /** Nível do jogador (0 = sem conta: o número não aparece). */
  level: number;
  title: string | null;
  character: CharacterStyle;
  auras?: readonly AuraId[];
  face?: CardFaceStyle;
  back?: CardBackStyle;
  isBot?: boolean;
}

export function CartaoJogador({
  p,
  eu = false,
  pronto,
  delay = 0,
  animar = true,
  canto,
  children,
  className,
}: {
  p: CartaoDados;
  /** É o meu card (o nome sai dourado). */
  eu?: boolean;
  /**
   * Só na abertura: `true` carimba PRONTO, `false` mostra os pontinhos e apaga o card. Ausente,
   * o card é só o card.
   */
  pronto?: boolean;
  delay?: number;
  /** O personagem respira (a abertura liga só depois do pronto). */
  animar?: boolean;
  /** Uma etiqueta no alto, à esquerda do card (líder, anfitrião, "você"). */
  canto?: ReactNode;
  /** O que vai embaixo do título: botões, avisos. */
  children?: ReactNode;
  className?: string;
}) {
  const cls = ['pm-slot', pronto === false && 'esperando', pronto && 'ready', eu && 'me', className].filter(Boolean).join(' ');
  // bot não tem aura (veja o sorteio dos bots em shared/room.ts)
  const auras = p.isBot ? [] : (p.auras ?? []);
  return (
    <motion.div className={cls} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.35 }}>
      {/* nome e título ficam fora do card: dentro dele é lugar do personagem */}
      <b className="pm-name">{p.name}</b>

      <div className="pm-card">
        {/* decoração de fundo do card: PENDENTE — entra atrás do personagem, por trás de tudo aqui */}
        <div className="pm-deco" aria-hidden />

        {/*
          * A arte com as auras em volta, numa caixa do tamanho da figura: a aura mede cabeça, ombro
          * e pé pela altura da caixa. O card corta o que passa da borda — as asas abertas ficam
          * enquadradas, como numa carta.
          */}
        <div className="pm-art">
          <div className="char-palco">
            <CharacterAura auras={auras} tint={p.character.bg} />
            <CharacterFull st={p.character} height="100%" animate={animar} />
            <CharacterAura auras={auras} tint={p.character.bg} plano="frente" />
          </div>
        </div>

        <span className="pm-level">
          {p.isBot ? <span className="pm-bot">BOT</span> : p.level > 0 && <LevelNumber level={p.level} size="clamp(20px, 2.9vh, 32px)" />}
        </span>
        {canto && <span className="pm-canto">{canto}</span>}

        {/* a inclinação vai no invólucro: a carta em si é um motion.div, e o framer-motion
            escreve o transform dela inline — o do CSS seria ignorado */}
        <div className="pm-pair" aria-hidden>
          <span className="pm-pair-back">
            <CardView card={null} faceUp={false} width={40} back={p.back ?? BACK_PRESETS[0]} />
          </span>
          <span className="pm-pair-face">
            <CardView card={MOSTRA} width={40} face={p.face ?? FACE_PRESETS[0]} />
          </span>
        </div>

        {pronto === true && (
          <div className="pm-stamp" aria-label="pronto">
            <span>PRONTO</span>
          </div>
        )}
        {pronto === false && (
          <div className="pm-loading" aria-label="carregando">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>

      <span className="pm-foot">{p.title && <TitleGlow title={p.title} />}</span>
      {children && <div className="pm-extra">{children}</div>}
    </motion.div>
  );
}

/** Um lugar vazio com o mesmo tamanho de um card (grupo com vaga, cadeira livre na sala). */
export function CartaoVazio({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="pm-slot vazio">
      <b className="pm-name muted">{label}</b>
      <div className="pm-card pm-card-vazio">
        <span className="pm-vazio-sinal" aria-hidden>
          ?
        </span>
      </div>
      <span className="pm-foot" />
      {children && <div className="pm-extra">{children}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ de onde vêm os dados

/** O meu card, montado do perfil: a troca feita agora aparece na hora. */
export function useMeuCartao(): CartaoDados {
  const name = useProfile((s) => s.name);
  const auras = useProfile((s) => s.auras);
  const character = useCharacter();
  const face = useEquipped('face');
  const back = useEquipped('back');
  const title = useMyTitle();
  const temConta = useSession((s) => !!s.account);
  const level = playerLevel(useMyStats());
  return { name, auras, character, face, back, title, level: temConta ? level : 0 };
}

/** O card de quem está numa sala (a sala de espera da Custom). */
export function cartaoDoMembro(m: MemberInfo): CartaoDados {
  return { name: m.name, level: m.level ?? 0, title: m.title, character: m.character, auras: m.auras, face: m.face, back: m.back, isBot: m.isBot };
}

/** O card de alguém do grupo. Um servidor de antes dos cards manda só o personagem e o nível. */
export function cartaoDoGrupo(m: PartyMember): CartaoDados {
  if (m.cartao) return m.cartao;
  return { name: m.name, level: m.level, title: null, character: findCharacter(m.character) };
}

/** A foto do jogador com a moldura dele — a do menu, do grupo e do perfil. */
export function FotoComMoldura({ character, frame, size, className }: { character: CharacterStyle; frame: string | null | undefined; size: number; className?: string }) {
  return (
    <span
      className={`foto-moldura com-moldura ${className ?? ''}`}
      style={{ background: `linear-gradient(160deg, ${character.bg}, ${character.bg2})`, width: size, height: size }}
    >
      <CharacterPortrait st={character} size={size} />
      <PortraitFrame frame={findFrame(frame)} size={size} />
    </span>
  );
}
