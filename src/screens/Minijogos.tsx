import { useEffect, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { ScreenHeader } from '../ui/controls';
import { sfx } from '../audio/sfx';
import { fmt } from '../util/format';
import { Petals } from './MainMenu';
import { WalletBar } from '../ui/Wallet';
import { DefsDasJoias, JogoJoias, JoiaSvg } from '../minijogos/JogoJoias';
import { JogoBolhas } from '../minijogos/JogoBolhas';
import { PALETA } from '../minijogos/bolhas';
import { lerRecorde, type Minijogo } from '../minijogos/recorde';
import { useMinijogos, useRestantesHoje } from '../store/minijogos';
import { PREMIO_POR_NIVEL } from '../../shared/minijogos';

/**
 * Os minijogos: uma lista de jogos rápidos para passar o tempo entre uma mesa e outra.
 *
 * Os dois são de níveis, e cada nível passado rende fichas e padocoins — quem confere e paga é o
 * servidor, com um teto por dia (shared/minijogos.ts). O recorde de pontos fica neste computador.
 * A lista abre o jogo na mesma tela, e "Voltar" do jogo volta para a lista (não para o menu).
 */
const JOGOS: { id: Minijogo; nome: string; sub: string; texto: string }[] = [
  {
    id: 'joias',
    nome: 'Joias',
    sub: 'Troque e alinhe três',
    texto: 'Troque joias vizinhas para alinhar três ou mais da mesma cor. Cada nível pede pontos e joias de uma cor, com jogadas contadas.',
  },
  {
    id: 'bolhas',
    nome: 'Bolhas',
    sub: 'Mire, atire, estoure',
    texto: 'Atire bolhas para juntar três da mesma cor. Limpe a grade para passar de nível antes que ela chegue lá embaixo.',
  },
];

/** A capa das Joias: uma grade pequena de pedras, com uma linha de três brilhando. */
function CapaJoias() {
  const grade = [
    [0, 1, 2, 3, 4],
    [3, 2, 2, 2, 1],
    [4, 0, 5, 1, 0],
  ];
  return (
    <div className="mj-capa joias">
      <DefsDasJoias />
      {grade.map((l, r) => (
        <div key={r} className="mj-capa-linha">
          {l.map((cor, c) => (
            <span key={c} className={r === 1 && c >= 1 && c <= 3 ? 'brilha' : ''}>
              <JoiaSvg cor={cor} size={40} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A capa das Bolhas: um cacho de bolhas no alto e a bolha da vez embaixo. */
function CapaBolhas() {
  const cacho = [
    [0, 1, 2, 3, 4, 1],
    [2, 2, 4, 0, 3],
    [3, 4, 1, 1, 2, 0],
  ];
  return (
    <div className="mj-capa bolhas">
      {cacho.map((l, r) => (
        <div key={r} className="mj-capa-linha" style={{ marginLeft: r % 2 ? 18 : 0 }}>
          {l.map((cor, c) => (
            <i key={c} style={{ '--b': PALETA[cor] } as CSSProperties} />
          ))}
        </div>
      ))}
      <i className="mj-capa-tiro" style={{ '--b': PALETA[4] } as CSSProperties} />
    </div>
  );
}

export function MinijogosScreen({ onBack, inicial = null }: { onBack: () => void; inicial?: Minijogo | null }) {
  const [jogando, setJogando] = useState<Minijogo | null>(inicial);
  const jogo = JOGOS.find((j) => j.id === jogando);
  const zerarSessao = useMinijogos((s) => s.zerarSessao);
  const restantes = useRestantesHoje();
  // o que a sessão rendeu conta a partir de quando a tela abriu
  useEffect(() => zerarSessao(), [zerarSessao]);

  return (
    <div className="screen tela-cheia mj-screen">
      <div className="menu-bg" />
      {/* as pétalas do menu (ou o que cai em cada tema) continuam caindo durante os jogos */}
      <Petals />
      <ScreenHeader title={jogo ? jogo.nome : 'Minijogos'} onBack={jogo ? () => setJogando(null) : onBack}>
        <WalletBar />
      </ScreenHeader>
      {jogo?.id === 'joias' ? (
        <JogoJoias onSair={() => setJogando(null)} />
      ) : jogo?.id === 'bolhas' ? (
        <JogoBolhas onSair={() => setJogando(null)} />
      ) : (
        <div className="mj-lista">
          <p className="mj-lista-premio">
            Cada nível passado vale <b>{PREMIO_POR_NIVEL.fichas} fichas</b> e <b>{PREMIO_POR_NIVEL.pado} padocoins</b>
            {restantes !== null && <> · ainda rendem hoje: <b>{restantes}</b> níveis</>}
          </p>
          {JOGOS.map((j, i) => {
            const recorde = lerRecorde(j.id);
            return (
              <motion.button
                key={j.id}
                className={`panel mj-cartao ${j.id}`}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.08 + i * 0.08, type: 'spring', stiffness: 160, damping: 18 }}
                whileHover={{ y: -6 }}
                onMouseEnter={() => sfx.hover()}
                onClick={() => {
                  sfx.click();
                  setJogando(j.id);
                }}
              >
                {j.id === 'joias' ? <CapaJoias /> : <CapaBolhas />}
                <span className="mj-cartao-nome">{j.nome}</span>
                <span className="mj-cartao-sub">{j.sub}</span>
                <span className="mj-cartao-texto">{j.texto}</span>
                <span className="mj-cartao-rodape">
                  <span className="muted small">{recorde ? `Recorde: ${fmt(recorde)}` : 'Ainda sem recorde'}</span>
                  <span className="btn btn-gold small">Jogar</span>
                </span>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
