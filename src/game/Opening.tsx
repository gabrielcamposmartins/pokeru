/**
 * Abertura da partida — a tela de carregamento antes da primeira mão.
 *
 * O carregamento é verdadeiro: enquanto ela está no ar, o servidor **não reparte cartas**. A mesa
 * já está montada (assentos, buy-in cobrado, botão sorteado) e espera a confirmação de cada
 * jogador; esta tela manda a nossa assim que a arte de todo mundo terminou de baixar, e cai fora
 * quando a primeira mão chega. Se alguém travar, o servidor começa sozinho no tempo limite —
 * ninguém fica preso na sala de espera de outro.
 *
 * E é aqui que cada um aparece do jeito que se montou: personagem, título, nível e o par de
 * cartas com a frente e o verso que escolheu. Uma partida com gente começa com todos se vendo.
 *
 * `OpeningView` é a tela sem loja nenhuma (é o que o preview e os testes desenham); o
 * `OpeningScreen` é ela ligada na sessão, que é quem sabe quem sou eu e manda o "pronto".
 */

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { Opening, OpeningPlayer } from '../../shared/protocol';
import { CardView } from '../render/CardArt';
import { CharacterFull } from '../render/CharacterArt';
import { CharacterAura } from '../render/aura';
import { useProfile } from '../store/profile';
import { LevelNumber } from '../render/Level';
import { TitleGlow } from '../render/Title';
import { Petals } from '../screens/MainMenu';
import { useSession } from '../store/session';
import { useTable } from '../store/table';

/** A carta virada para cima no par do card — a mesma para todos; o que muda é a frente de cada um. */
const MOSTRA = { r: 14, s: 's' as const };

/** Espera a imagem chegar (ou desistir): o carregamento não pode ficar preso num arquivo que falhou. */
function carrega(url: string, ms: number): Promise<void> {
  return new Promise((pronto) => {
    const img = new Image();
    const fim = setTimeout(pronto, ms);
    const acabou = () => {
      clearTimeout(fim);
      pronto();
    };
    img.onload = acabou;
    img.onerror = acabou;
    img.src = url;
  });
}

function PlayerCard({ p, isMe, delay }: { p: OpeningPlayer; isMe: boolean; delay: number }) {
  const cls = ['pm-slot', p.ready && 'ready', isMe && 'me'].filter(Boolean).join(' ');
  // as minhas auras saem do perfil (a troca mais recente vale na hora); as dos outros, do servidor
  const minhas = useProfile((s) => s.auras);
  const auras = isMe ? minhas : p.auras;
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
            <CharacterFull st={p.character} height="100%" animate={p.ready} />
            <CharacterAura auras={auras} tint={p.character.bg} plano="frente" />
          </div>
        </div>

        <span className="pm-level">{p.isBot ? <span className="pm-bot">BOT</span> : <LevelNumber level={p.level} size="clamp(20px, 2.9vh, 32px)" />}</span>

        {/* a inclinação vai no invólucro: a carta em si é um motion.div, e o framer-motion
            escreve o transform dela inline — o do CSS seria ignorado */}
        <div className="pm-pair" aria-hidden>
          <span className="pm-pair-back">
            <CardView card={null} faceUp={false} width={40} back={p.back} />
          </span>
          <span className="pm-pair-face">
            <CardView card={MOSTRA} width={40} face={p.face} />
          </span>
        </div>

        {p.ready ? (
          <div className="pm-stamp" aria-label="pronto">
            <span>PRONTO</span>
          </div>
        ) : (
          <div className="pm-loading" aria-label="carregando">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>

      <span className="pm-foot">{p.title && <TitleGlow title={p.title} />}</span>
    </motion.div>
  );
}

export function OpeningView({ opening, mySeat = null }: { opening: Opening; mySeat?: number | null }) {
  const meio = Math.ceil(opening.players.length / 2);
  const linhas = [opening.players.slice(0, meio), opening.players.slice(meio)];

  return (
    <div className="screen pm-screen">
      {/* mesmo fundo da tela inicial (e o que cai nela é do tema: pétalas no sakura,
          ornamentos no vitoriano) */}
      <div className="menu-bg" />
      <Petals />

      {/* sempre duas linhas: a mesa fica com a mesma cara com dois ou com seis, e ninguém precisa
          caçar o próprio card numa fileira que muda de tamanho. Sobrando um, ele fica em cima. */}
      <div className="pm-rows">
        {linhas.map((linha, n) => (
          <div className="pm-row" key={n}>
            {linha.map((p, i) => (
              <PlayerCard key={p.seat} p={p} isMe={p.seat === mySeat} delay={(n === 0 ? i : meio + i) * 0.07} />
            ))}
          </div>
        ))}
      </div>

      {/* a barra corre pelo tempo mínimo da tela, que é o que acontece quando ninguém trava; se
          alguém demorar, ela fica cheia esperando — quem conta a espera são os cards */}
      <div className="pm-bar">
        <div className="pm-bar-fill" style={{ animationDuration: `${opening.minMs || opening.waitMs}ms` }} />
      </div>
    </div>
  );
}

export function OpeningScreen() {
  const opening = useTable((s) => s.opening);
  const room = useSession((s) => s.room);
  const playerId = useSession((s) => s.playerId);
  const send = useSession((s) => s.send);
  const avisou = useRef(false);

  /**
   * Carrega a arte de quem está na mesa e só então diz que estamos prontos.
   *
   * O guarda é **no envio**, não no começo do carregamento: em StrictMode o React monta, desmonta e
   * monta de novo, e marcar na entrada fazia a segunda montagem desistir enquanto a primeira já
   * tinha sido cancelada — resultado, o `ready` não saía e a mesa só começava no tempo limite.
   * Mandar duas vezes não é problema (o servidor ignora repetição); não mandar, é.
   */
  useEffect(() => {
    if (!opening) return;
    const urls = [...new Set(opening.players.flatMap((p) => [p.character.full, p.character.portrait]))].filter(Boolean);
    void Promise.all(urls.map((u) => carrega(u, 5_000))).then(() => {
      if (avisou.current) return;
      avisou.current = true;
      send({ type: 'ready' });
    });
    // de propósito só na montagem: a lista muda a cada confirmação, e recarregar não faria sentido
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!opening) return null;

  const mySeat = room?.members.find((m) => m.id === playerId)?.seat ?? null;
  return <OpeningView opening={opening} mySeat={mySeat} />;
}
