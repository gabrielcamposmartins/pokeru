import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ScreenHeader } from '../ui/controls';
import { sfx } from '../audio/sfx';
import { fmt } from '../util/format';
import { Petals } from './MainMenu';
import { FotoComMoldura } from '../game/CartaoJogador';
import { findCharacter } from '../../shared/styles';
import { ID_GERAL, QUADROS, type LinhaRanking, type QuadroRanking } from '../../shared/ranking';
import { useRanking } from '../store/ranking';
import { useSession } from '../store/session';
import { Icone } from '../minijogos/ui';
import { ChipSvg } from '../render/Chip';

/**
 * O ranking: uma aba geral e uma por jogo (poker e cada minijogo).
 *
 * As abas saem da resposta do servidor, na ordem dele (shared/ranking.ts): um quadro novo lá vira
 * uma aba aqui sem mexer nesta tela. O que é desta tela é só o ícone de cada aba — e um quadro
 * sem ícone próprio ganha o genérico.
 */

/** O ícone de cada quadro (o que não estiver aqui usa o troféu). */
const ICONE: Record<string, ReactNode> = {
  [ID_GERAL]: <Icone nome="trofeu" size={22} />,
  poker: <span className="rk-naipe">♠</span>,
  ganhos: <ChipSvg value={100} size={22} />,
  joias: <Icone nome="joias" size={22} />,
  bolhas: <Icone nome="bolha" size={22} />,
};
const iconeDe = (id: string) => ICONE[id] ?? <Icone nome="estrela" size={22} />;

/** O nome curto de cada quadro, para as peças do geral. */
const NOME_DO_QUADRO = Object.fromEntries(QUADROS.map((q) => [q.id, q.nome]));

/** Há quanto tempo o ranking foi montado, em palavras. */
function haQuanto(iso: string, agora: number): string {
  const s = Math.max(0, Math.round((agora - Date.parse(iso)) / 1000));
  if (s < 10) return 'agora mesmo';
  if (s < 60) return `há ${s} s`;
  return `há ${Math.floor(s / 60)} min`;
}

function Foto({ l, size }: { l: LinhaRanking; size: number }) {
  return <FotoComMoldura character={findCharacter(l.character)} frame={l.frame} size={size} />;
}

/** As peças do geral: quanto cada quadro deu a essa pessoa. */
function Partes({ partes }: { partes?: Record<string, number> }) {
  if (!partes) return null;
  return (
    <span className="rk-partes">
      {Object.entries(partes).map(([id, p]) => (
        <span key={id} className="rk-parte" title={`${NOME_DO_QUADRO[id] ?? id}: ${fmt(p)} pontos`}>
          {iconeDe(id)}
          {fmt(p)}
        </span>
      ))}
    </span>
  );
}

/** O pódio dos três primeiros: o primeiro no meio, mais alto. */
function Podio({ q, euId }: { q: QuadroRanking; euId: string | null }) {
  const [p1, p2, p3] = q.linhas;
  const lugar = (l: LinhaRanking | undefined, n: 1 | 2 | 3) =>
    l ? (
      <motion.div
        key={l.id + n}
        className={`rk-podio-lugar p${n} ${l.id === euId ? 'eu' : ''}`}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: n === 1 ? 0.05 : n === 2 ? 0.15 : 0.25, type: 'spring', stiffness: 170, damping: 18 }}
      >
        <span className="rk-coroa">{n === 1 ? <Icone nome="trofeu" size={30} /> : `${l.pos}º`}</span>
        <Foto l={l} size={n === 1 ? 128 : 100} />
        <span className="rk-podio-nome">{l.name}</span>
        <b className="rk-podio-valor">{fmt(l.valor)}</b>
        <small>{q.unidade}</small>
        <span className="rk-degrau">{l.pos}</span>
      </motion.div>
    ) : (
      <div className={`rk-podio-lugar p${n} vazio`}>
        <span className="rk-degrau">{n}</span>
      </div>
    );
  return (
    <div className="rk-podio">
      {lugar(p2, 2)}
      {lugar(p1, 1)}
      {lugar(p3, 3)}
    </div>
  );
}

function Linha({ l, q, eu }: { l: LinhaRanking; q: QuadroRanking; eu: boolean }) {
  return (
    <li className={`rk-linha ${eu ? 'eu' : ''} ${l.pos <= 3 ? `top${l.pos}` : ''}`}>
      <span className="rk-pos">{l.pos}</span>
      <Foto l={l} size={46} />
      <span className="rk-quem">
        <b>
          {l.name}
          {eu && <i className="rk-voce">você</i>}
        </b>
        {l.detalhe && <small>{l.detalhe}</small>}
        <Partes partes={l.partes} />
      </span>
      <span className="rk-valor">
        <b>{fmt(l.valor)}</b>
        <small>{q.unidade}</small>
      </span>
    </li>
  );
}

export function RankingScreen({ onBack, inicial = ID_GERAL }: { onBack: () => void; inicial?: string }) {
  const { ranking, carregando, pedir } = useRanking();
  const conectado = useSession((s) => s.status === 'connected');
  const euId = useSession((s) => s.account?.id ?? null);
  const [aba, setAba] = useState(inicial);
  const [agora, setAgora] = useState(() => Date.now());

  // pede ao abrir (e de novo quando a conexão volta), e o "há quanto tempo" anda sozinho
  useEffect(() => {
    if (conectado) pedir();
  }, [conectado, pedir]);
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const q = ranking?.quadros.find((x) => x.id === aba) ?? ranking?.quadros[0] ?? null;
  const euNaLista = !!q?.eu && q.linhas.some((l) => l.id === q.eu!.id);

  return (
    <div className="screen tela-cheia rk-screen">
      <div className="menu-bg" />
      <Petals />
      <ScreenHeader title="Ranking" onBack={onBack}>
        {ranking && <span className="rk-quando">Atualizado {haQuanto(ranking.em, agora)}</span>}
        <button
          className="btn btn-ghost small"
          disabled={!conectado || carregando}
          onClick={() => {
            sfx.click();
            pedir();
          }}
        >
          {carregando ? 'Atualizando…' : '↻ Atualizar'}
        </button>
      </ScreenHeader>

      {!conectado ? (
        <div className="panel rk-aviso">O ranking vem do servidor. Conecte-se para ver quem está na frente.</div>
      ) : !ranking ? (
        <div className="panel rk-aviso">Carregando o ranking…</div>
      ) : (
        <>
          <div className="rk-abas" role="tablist">
            {ranking.quadros.map((x) => (
              <button
                key={x.id}
                role="tab"
                aria-selected={x.id === q?.id}
                className={`rk-aba ${x.id === q?.id ? 'on' : ''}`}
                onClick={() => {
                  sfx.click();
                  setAba(x.id);
                }}
              >
                {iconeDe(x.id)}
                {x.nome}
                {x.eu && <small>{x.eu.pos}º</small>}
              </button>
            ))}
          </div>

          {q && (
            <AnimatePresence mode="wait">
              <motion.div key={q.id} className="rk-corpo" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <div className="panel rk-lado">
                  <h2 className="title-deco rk-titulo">
                    {iconeDe(q.id)} {q.nome}
                  </h2>
                  <p className="rk-explica">
                    {q.id === ID_GERAL
                      ? 'Junta todos os quadros: cada um vale até 1.000 pontos, e você leva a fração do líder de cada quadro.'
                      : q.id === 'poker'
                        ? 'Partidas de poker ganhas em primeiro lugar.'
                        : q.id === 'ganhos'
                          ? 'Tudo o que cada um já ganhou em fichas: o lucro nas mesas, os bônus e os prêmios dos minijogos. Os padocoins aparecem embaixo, para quem tem Discord.'
                        : `O maior total numa partida de ${q.nome}.`}
                  </p>
                  {q.linhas.length ? <Podio q={q} euId={euId} /> : <div className="rk-vazio">Ninguém pontuou neste quadro ainda. Que tal ser o primeiro?</div>}
                  {q.eu && (
                    <div className="rk-minha">
                      <small>Sua posição</small>
                      <b>{q.eu.pos}º</b>
                      <span>
                        {fmt(q.eu.valor)} {q.unidade}
                      </span>
                    </div>
                  )}
                </div>
                <div className="panel rk-lista">
                  <ol>
                    {q.linhas.map((l) => (
                      <Linha key={l.id} l={l} q={q} eu={l.id === euId} />
                    ))}
                  </ol>
                  {q.eu && !euNaLista && (
                    <ol className="rk-lista-eu">
                      <Linha l={q.eu} q={q} eu />
                    </ol>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </>
      )}
    </div>
  );
}
