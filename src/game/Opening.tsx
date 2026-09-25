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
import type { Opening, OpeningPlayer } from '../../shared/protocol';
import { CartaoJogador } from './CartaoJogador';
import { useProfile } from '../store/profile';
import { Petals } from '../screens/MainMenu';
import { useSession } from '../store/session';
import { useTable } from '../store/table';

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
  // as minhas auras saem do perfil (a troca mais recente vale na hora); as dos outros, do servidor
  const minhas = useProfile((s) => s.auras);
  const dados = isMe ? { ...p, auras: minhas } : p;
  return <CartaoJogador p={dados} eu={isMe} pronto={p.ready} animar={p.ready} delay={delay} />;
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
