/**
 * Abertura da partida — a tela que o jogador lê como "preparando a mesa".
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

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Opening, OpeningPlayer } from '../../shared/protocol';
import { CardView } from '../render/CardArt';
import { CharacterFull } from '../render/CharacterArt';
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
  const cls = ['pm-card', p.ready && 'ready', isMe && 'me'].filter(Boolean).join(' ');
  return (
    <motion.div className={cls} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.35 }}>
      {/* decoração de fundo do card: PENDENTE — entra atrás do personagem, por trás de tudo aqui */}
      <div className="pm-deco" aria-hidden />

      <div className="pm-art">
        <CharacterFull st={p.character} height={250} animate={p.ready} />
      </div>

      {p.title && <div className="pm-title">{p.title}</div>}

      <div className="pm-pair" aria-hidden>
        <CardView card={null} faceUp={false} width={34} back={p.back} className="pm-pair-back" />
        <CardView card={MOSTRA} width={34} face={p.face} className="pm-pair-face" />
      </div>

      <div className="pm-plate">
        <span className="pm-level">{p.isBot ? 'BOT' : `Nv. ${p.level}`}</span>
        <b className="pm-name">{p.name}</b>
      </div>

      {p.ready ? (
        <div className="pm-ribbon" aria-label="pronto">
          <span>PRONTO</span>
        </div>
      ) : (
        <div className="pm-loading" aria-label="carregando">
          <i />
          <i />
          <i />
        </div>
      )}
    </motion.div>
  );
}

export function OpeningView({ opening, mySeat = null, mesa }: { opening: Opening; mySeat?: number | null; mesa?: string }) {
  const [passo, setPasso] = useState(0);

  // os três pontinhos do "preparando a mesa"
  useEffect(() => {
    const t = setInterval(() => setPasso((n) => (n + 1) % 4), 420);
    return () => clearInterval(t);
  }, []);

  const faltam = opening.players.filter((p) => !p.ready).length;

  return (
    <div className="screen pm-screen">
      <div className="pm-head">
        <h1 className="title-deco">Preparando a mesa{'.'.repeat(passo)}</h1>
        <p className="muted">
          {mesa ?? 'Mesa do servidor'}
          {faltam > 0 ? ` · esperando ${faltam} ${faltam === 1 ? 'jogador' : 'jogadores'}` : ' · todos prontos!'}
        </p>
      </div>

      <div className="pm-row">
        {opening.players.map((p, i) => (
          <PlayerCard key={p.seat} p={p} isMe={p.seat === mySeat} delay={i * 0.07} />
        ))}
      </div>

      {/* a barra corre até o tempo limite do servidor: passado ele, a partida começa de todo jeito */}
      <div className="pm-bar">
        <div className="pm-bar-fill" style={{ animationDuration: `${opening.waitMs}ms` }} />
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

  // carrega a arte de quem está na mesa e só então diz que estamos prontos
  useEffect(() => {
    if (avisou.current || !opening) return;
    avisou.current = true;
    let vivo = true;
    const urls = [...new Set(opening.players.flatMap((p) => [p.character.full, p.character.portrait]))].filter(Boolean);
    void Promise.all(urls.map((u) => carrega(u, 5_000))).then(() => {
      if (vivo) send({ type: 'ready' });
    });
    return () => {
      vivo = false;
    };
    // de propósito só na montagem: a lista muda a cada confirmação, e recarregar não faria sentido
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!opening) return null;

  const mySeat = room?.members.find((m) => m.id === playerId)?.seat ?? null;
  const mesa = room ? `${room.settings.name} · blinds ${room.settings.smallBlind}/${room.settings.bigBlind}` : undefined;
  return <OpeningView opening={opening} mySeat={mySeat} mesa={mesa} />;
}
