import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fmt } from '../util/format';
import { PREMIO_POR_NIVEL, type Minijogo } from '../../shared/minijogos';
import { PAUSA_MAX_MS } from '../../shared/pausa';
import { useMinijogos } from '../store/minijogos';
import { useSession } from '../store/session';
import { ChipSvg } from '../render/Chip';
import { PadoCoinSvg } from '../render/PadoCoin';

/**
 * As peças de tela comuns aos minijogos: o espaço do tabuleiro, os painéis e os quadros de nível
 * concluído e de fim de partida.
 *
 * O layout é de três colunas que vão do cabeçalho ao pé da tela — missões e destaques à esquerda,
 * tabuleiro no meio, placar e prêmios à direita. O tabuleiro se mede pelo espaço que sobrou no
 * meio (`useCaixa`), não pela janela: assim ele ocupa toda a altura que tem, em qualquer tamanho.
 * Os painéis são de números e ícones grandes de propósito: é o que se lê de relance jogando.
 */

/** A largura mínima de cada painel lateral: o tabuleiro fica com o resto, até a altura inteira. */
export const PAINEL_MIN = 244;
/** O espaço que as duas colunas laterais e os vãos tiram da largura do jogo. */
export const RESERVA_LATERAL = PAINEL_MIN * 2 + 2 * 18;

/** Um nível já passado nesta partida (a lista do painel da direita). */
export interface NivelFeito {
  nivel: number;
  estrelas: number;
  pontos: number;
}

/** O tamanho do elemento, acompanhando a janela. */
export function useCaixa(ref: RefObject<HTMLElement | null>): { w: number; h: number } {
  const [caixa, setCaixa] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setCaixa({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return caixa;
}

export type NomeIcone = 'jogadas' | 'combo' | 'raio' | 'alvo' | 'queda' | 'fogo' | 'trofeu' | 'estrela' | 'joias' | 'bolha' | 'relogio' | 'pausa';

/**
 * Ícones desenhados aqui mesmo, em SVG, na cor do texto. Emoji não serve: cada sistema desenha o
 * seu, e o ⚡ do Windows é um adesivo amarelo que não combina com tema nenhum.
 */
export function Icone({ nome, size = 28 }: { nome: NomeIcone; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true } as const;
  switch (nome) {
    case 'jogadas':
      return (
        <svg {...p}>
          <path d="M12 4a8 8 0 0 1 7.4 5H22l-3.5 4.5L15 9h2.2A6 6 0 1 0 18 14.6l1.8.9A8 8 0 1 1 12 4z" />
        </svg>
      );
    case 'combo':
      return (
        <svg {...p}>
          <path d="M12 1.5l2.4 6.1 6.6.4-5.1 4.2 1.7 6.4L12 15l-5.6 3.6 1.7-6.4L3 8l6.6-.4z" />
          <circle cx="20" cy="19" r="2" />
          <circle cx="4" cy="20" r="1.4" />
        </svg>
      );
    case 'raio':
      return (
        <svg {...p}>
          <path d="M13.5 1L4 13.5h6.5L9 23l10-13h-6.8z" />
        </svg>
      );
    case 'alvo':
      return (
        <svg {...p}>
          <path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" fillRule="evenodd" />
        </svg>
      );
    case 'queda':
      return (
        <svg {...p}>
          <circle cx="7" cy="5" r="3" />
          <circle cx="17" cy="5" r="3" />
          <path d="M12 9v8.5l3-3 1.4 1.4L12 20.3l-4.4-4.4L9 14.5l3 3V9z" />
        </svg>
      );
    case 'fogo':
      return (
        <svg {...p}>
          <path d="M12 1.5c1 4-3.5 6-3.5 10.5a3.5 3.5 0 0 0 2 3.2c-.4-2 1.1-3.4 2.5-4.7.4 2.3 3.5 3 3.5 5.5a3.5 3.5 0 0 1-1.2 2.6A7 7 0 0 0 19 12.5C19 7.5 14.5 6 12 1.5zM12 23a7 7 0 0 1-7-7c0-2.5 1.2-4.4 2.6-6-.2 3 1 5 3 6.2-.6 1.6.3 3.4 1.8 4.3-.1.9-.2 1.6-.4 2.5z" />
        </svg>
      );
    case 'trofeu':
      return (
        <svg {...p}>
          <path d="M6 2h12v2h4v3a5 5 0 0 1-5 5h-.3A6 6 0 0 1 13 15.9V19h4v3H7v-3h4v-3.1A6 6 0 0 1 7.3 12H7a5 5 0 0 1-5-5V4h4zm0 4H4v1a3 3 0 0 0 2 2.8zm12 0v3.8A3 3 0 0 0 20 7V6z" />
        </svg>
      );
    case 'estrela':
      return (
        <svg {...p}>
          <path d="M12 1.8l3.1 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.6l-6.4 3.6 1.5-7.1-5.4-4.9 7.2-.8z" />
        </svg>
      );
    case 'joias':
      return (
        <svg {...p}>
          <path d="M6 3h12l4 6-10 12L2 9zm1.2 2L4.7 8.5h4.1L10.2 5zm6.6 0l1.4 3.5h4.1L16.8 5zm-1.8.4L10.6 8.5h2.8zM5 10.5l5.6 6.8-2-6.8zm5.7 0L12 16l1.3-5.5zm4.7 0l-2 6.8 5.6-6.8z" />
        </svg>
      );
    case 'relogio':
      return (
        <svg {...p}>
          <path d="M9 1h6v2H9zm3 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 2.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6zM11 8h2v4.6l3.2 1.9-1 1.7L11 13.7zm7.4-4.8l1.4-1.4 2.2 2.2-1.4 1.4z" fillRule="evenodd" />
        </svg>
      );
    case 'pausa':
      return (
        <svg {...p}>
          <rect x="5" y="3" width="5" height="18" rx="1.5" />
          <rect x="14" y="3" width="5" height="18" rx="1.5" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9.5" opacity="0.9" />
          <ellipse cx="9" cy="8.5" rx="3.2" ry="2" fill="#fff" opacity="0.55" transform="rotate(-30 9 8.5)" />
        </svg>
      );
  }
}

/** Fichas e padocoins com as moedas de verdade (as mesmas da barra do menu). */
function Moedas({ fichas, pado, tam = 22 }: { fichas: number; pado: number; tam?: number }) {
  return (
    <span className="mj-moedas">
      <span className="mj-moeda fichas">
        <ChipSvg value={100} size={tam} />+{fmt(fichas)} <small>fichas</small>
      </span>
      {pado > 0 && (
        <span className="mj-moeda pado">
          <PadoCoinSvg size={tam} />+{fmt(pado)} <small>padocoins</small>
        </span>
      )}
    </span>
  );
}

/** O que o nível rendeu, quando a resposta do servidor chegar. */
export function PremioDoNivel({ jogo, nivel }: { jogo: Minijogo; nivel: number }) {
  const ultimo = useMinijogos((s) => s.ultimo);
  const meu = ultimo && ultimo.jogo === jogo && ultimo.nivel === nivel ? ultimo : null;
  if (!meu) return <div className="mj-premio esperando">Conferindo o prêmio…</div>;
  if (meu.motivo) return <div className="mj-premio sem">{meu.motivo}</div>;
  return (
    <motion.div className="mj-premio" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 16 }}>
      <Moedas fichas={meu.fichas} pado={meu.pado} tam={30} />
    </motion.div>
  );
}

/** A medalha do nível, no alto do painel da esquerda. */
export function NivelMedalha({ nivel }: { nivel: number }) {
  return (
    <div className="mj-medalha">
      <small>Nível</small>
      <motion.b key={nivel} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 14 }}>
        {nivel}
      </motion.b>
    </div>
  );
}

/**
 * Um número em destaque: ícone grande, o valor grande e uma linha pequena embaixo.
 * `pulso` muda quando o número merece festa (um combo novo, por exemplo) — o quadro pisca.
 */
export function Destaque({
  icone,
  rotulo,
  valor,
  sub,
  alerta,
  pulso,
}: {
  icone: NomeIcone | ReactNode;
  rotulo: string;
  valor: ReactNode;
  sub?: ReactNode;
  alerta?: boolean;
  pulso?: number | string;
}) {
  return (
    <motion.div
      key={pulso}
      className={`mj-destaque ${alerta ? 'alerta' : ''}`}
      initial={pulso ? { scale: 1.12 } : false}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 14 }}
    >
      <span className="mj-destaque-icone">{typeof icone === 'string' ? <Icone nome={icone as NomeIcone} size={30} /> : icone}</span>
      <small>{rotulo}</small>
      <b>{valor}</b>
      {sub && <span className="mj-destaque-sub">{sub}</span>}
    </motion.div>
  );
}

/** As três estrelas do nível, grandes, acendendo conforme o jogo. */
export function EstrelasDoNivel({ n }: { n: number }) {
  return (
    <div className="mj-estrelas-nivel">
      {[0, 1, 2].map((i) => (
        <motion.span key={`${i}-${i < n}`} className={i < n ? 'on' : ''} initial={i < n ? { scale: 0.3, rotate: -60 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }}>
          <Icone nome="estrela" size={40} />
        </motion.span>
      ))}
    </div>
  );
}

/**
 * O painel da direita: os pontos, o recorde, as estrelas do nível e os prêmios — quanto vale um
 * nível, o que a sessão já rendeu e quantos níveis ainda pagam hoje.
 */
export function PainelPlacar({
  total,
  recorde,
  estrelas,
  estrelasRotulo,
  historico,
  legenda,
  children,
}: {
  total: number;
  recorde: number;
  /** null = o jogo não mostra estrelas agora. */
  estrelas: number | null;
  estrelasRotulo?: string;
  historico: NivelFeito[];
  /** A legenda das peças especiais do jogo (fica aqui, onde sobra altura). */
  legenda?: ReactNode;
  children?: ReactNode;
}) {
  const sessao = useMinijogos((s) => s.sessao);
  const comConta = useSession((s) => s.status === 'connected' && !!s.account);
  const bateu = total > 0 && total >= recorde;
  return (
    <aside className="panel mj-lado mj-lado-dir">
      <div className="mj-placar">
        <small>Pontos</small>
        <b>{fmt(total)}</b>
      </div>
      <div className={`mj-recorde-grande ${bateu ? 'bateu' : ''}`}>
        <Icone nome="trofeu" size={34} />
        <span>
          <small>{bateu ? 'Novo recorde!' : 'Recorde'}</small>
          <b>{fmt(Math.max(recorde, total))}</b>
        </span>
      </div>
      {estrelas !== null && (
        <div className="mj-bloco">
          <small>{estrelasRotulo ?? 'Estrelas do nível'}</small>
          <EstrelasDoNivel n={estrelas} />
        </div>
      )}
      <div className="mj-caixa-premios">
        <small>Prêmio por nível</small>
        <div className="mj-premio-nivel">
          <span>
            <ChipSvg value={100} size={40} />
            <b>+{PREMIO_POR_NIVEL.fichas}</b>
          </span>
          <span>
            <PadoCoinSvg size={40} />
            <b>+{PREMIO_POR_NIVEL.pado}</b>
          </span>
        </div>
        <div className="mj-ganhos">
          <small>Ganho nesta sessão</small>
          <span>
            <ChipSvg value={100} size={22} />
            <b>{fmt(sessao.fichas)}</b>
            <PadoCoinSvg size={22} />
            <b>{fmt(sessao.pado)}</b>
          </span>
        </div>
        {!comConta && <div className="mj-sem-conta">Entre com uma conta para receber os prêmios.</div>}
      </div>
      {legenda}
      <div className="mj-bloco mj-historico">
        <small>Níveis desta partida</small>
        {historico.length === 0 ? (
          <span className="mj-historico-vazio">Cada nível passado aparece aqui, com as estrelas e os pontos.</span>
        ) : (
          <ol>
            {[...historico].reverse().slice(0, 8).map((h) => (
              <motion.li key={h.nivel} initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
                <span className="mj-historico-n">{h.nivel}</span>
                <span className="mj-historico-estrelas">
                  {[0, 1, 2].map((i) => (
                    <i key={i} className={i < h.estrelas ? 'on' : ''}>
                      <Icone nome="estrela" size={16} />
                    </i>
                  ))}
                </span>
                <b>{fmt(h.pontos)}</b>
              </motion.li>
            ))}
          </ol>
        )}
      </div>
      <div className="mj-lado-pe">{children}</div>
    </aside>
  );
}

/** Uma missão do nível: ícone grande, o número grande e a barra de quanto falta. */
export function Objetivo({ icone, texto, feito, alvo }: { icone: ReactNode; texto: string; feito: number; alvo: number }) {
  const ok = feito >= alvo;
  return (
    <div className={`mj-objetivo ${ok ? 'ok' : ''}`}>
      <span className="mj-objetivo-icone">{icone}</span>
      <span className="mj-objetivo-corpo">
        <span className="mj-objetivo-texto">{texto}</span>
        <span className="mj-objetivo-num">
          {ok ? (
            <motion.b initial={{ scale: 1.8 }} animate={{ scale: 1 }}>
              ✓ Feito
            </motion.b>
          ) : (
            <>
              <b>{fmt(Math.min(feito, alvo))}</b> / {fmt(alvo)}
            </>
          )}
        </span>
        <span className="mj-objetivo-barra">
          <i style={{ width: `${Math.min(1, alvo ? feito / alvo : 1) * 100}%` }} />
        </span>
      </span>
    </div>
  );
}

/** A faixa grande de "Nível N" que aparece e some no começo de cada nível. */
export function FaixaDoNivel({ nivel }: { nivel: number }) {
  const [ver, setVer] = useState(true);
  useEffect(() => {
    setVer(true);
    const id = setTimeout(() => setVer(false), 1300);
    return () => clearTimeout(id);
  }, [nivel]);
  return (
    <AnimatePresence>
      {ver && (
        <motion.div key={nivel} className="mj-faixa" initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.3 }}>
          <span>Nível {nivel}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** O quadro entre um nível e outro. */
export function QuadroNivel({
  jogo,
  nivel,
  estrelas,
  linhas,
  onProximo,
}: {
  jogo: Minijogo;
  nivel: number;
  /** null = o jogo não dá estrelas. */
  estrelas: number | null;
  linhas: { rotulo: string; valor: string }[];
  onProximo: () => void;
}) {
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => botao.current?.focus(), []);
  return (
    <motion.div className="mj-fim-fundo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="panel mj-fim" initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}>
        <h2 className="title-deco">Nível {nivel} concluído!</h2>
        {estrelas !== null && <Estrelas n={estrelas} />}
        <div className="mj-fim-linhas">
          {linhas.map((l) => (
            <div key={l.rotulo}>
              <span>{l.rotulo}</span>
              <b>{l.valor}</b>
            </div>
          ))}
        </div>
        <PremioDoNivel jogo={jogo} nivel={nivel} />
        <div className="row gap center" style={{ marginTop: 16 }}>
          <button ref={botao} className="btn btn-gold" onClick={onProximo}>
            Nível {nivel + 1} ›
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** O fim da partida: onde parou, os pontos e o recorde. */
export function QuadroFim({
  titulo,
  total,
  nivel,
  novoRecorde,
  onDeNovo,
  onSair,
}: {
  titulo: string;
  total: number;
  nivel: number;
  novoRecorde: boolean;
  onDeNovo: () => void;
  onSair: () => void;
}) {
  const sessao = useMinijogos((s) => s.sessao);
  return (
    <motion.div className="mj-fim-fundo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="panel mj-fim" initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}>
        <h2 className="title-deco">{titulo}</h2>
        <div className="mj-fim-pontos">{fmt(total)} pontos</div>
        <div className="muted">Chegou ao nível {nivel}</div>
        {novoRecorde && <div className="mj-fim-recorde">Novo recorde!</div>}
        {sessao.niveis > 0 && (
          <div className="mj-fim-sessao">
            <Moedas fichas={sessao.fichas} pado={sessao.pado} />
          </div>
        )}
        <div className="row gap center" style={{ marginTop: 16 }}>
          <button className="btn btn-gold" onClick={onDeNovo}>
            Jogar de novo
          </button>
          <button className="btn btn-ghost" onClick={onSair}>
            Outros minijogos
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Estrelas({ n }: { n: number }) {
  return (
    <div className="mj-fim-estrelas">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={i < n ? 'on' : ''}
          initial={{ scale: 0, rotate: -40 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.25 + i * 0.22, type: 'spring', stiffness: 260, damping: 14 }}
        >
          ★
        </motion.span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ o relógio e a pausa

/** Segundos como relógio: `1:05`. */
export function mmss(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * O tempo que sobra no nível, no painel da esquerda. Acende em alerta nos últimos dez segundos — e
 * pisca a cada segundo nos últimos cinco, para ser visto de canto de olho.
 */
export function RelogioDoNivel({ segundos, total }: { segundos: number; total: number }) {
  const s = Math.max(0, Math.ceil(segundos));
  return (
    <Destaque
      icone="relogio"
      rotulo="Tempo"
      valor={mmss(s)}
      sub={`de ${mmss(total)}`}
      alerta={s <= 10}
      pulso={s <= 5 && s > 0 ? `t${s}` : undefined}
    />
  );
}

/**
 * A pausa de um minijogo.
 *
 * Pausa pelo botão, pela tecla P ou Esc, e sozinha quando a janela some (trocar de aba, minimizar):
 * o relógio do nível não pode correr com ninguém olhando. `ativo` diz se há o que pausar — fora de
 * um nível em andamento (no quadro entre níveis, no fim), a pausa não liga.
 *
 * Pausado por `PAUSA_MAX_MS`, o jogo recomeça: `onExpirar` roda (o jogo grava o recorde e volta ao
 * nível 1) e a tela de pausa fica, avisando o que aconteceu.
 */
export function usePausa({ ativo, onExpirar }: { ativo: boolean; onExpirar: () => void }) {
  const [pausado, setPausado] = useState(false);
  const [expirou, setExpirou] = useState(false);
  const expirar = useRef(onExpirar);
  expirar.current = onExpirar;
  const ativoRef = useRef(ativo);
  ativoRef.current = ativo;

  const pausar = () => {
    if (!ativoRef.current) return;
    setExpirou(false);
    setPausado(true);
  };
  const continuar = () => {
    setPausado(false);
    setExpirou(false);
  };

  // fora de um nível em andamento não há pausa
  useEffect(() => {
    if (!ativo && !expirou) setPausado(false);
  }, [ativo, expirou]);

  // o prazo: duas horas pausado e a partida recomeça
  useEffect(() => {
    if (!pausado || expirou) return;
    const id = setTimeout(() => {
      expirar.current();
      setExpirou(true);
    }, PAUSA_MAX_MS);
    return () => clearTimeout(id);
  }, [pausado, expirou]);

  // a janela sumiu: pausa
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) pausar();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // P ou Esc: alterna
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key.toLowerCase() !== 'p') return;
      if (pausado) continuar();
      else if (ativoRef.current) pausar();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pausado]);

  return { pausado, expirou, pausar, continuar };
}

/** O botão de pausar, no pé do painel da direita. */
export function BotaoPausa({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button className="btn btn-ghost small mj-pausar" onClick={onClick} disabled={disabled} title="Pausar (P ou Esc)">
      <Icone nome="pausa" size={14} /> Pausar
    </button>
  );
}

/**
 * A tela de pausa, por cima do tabuleiro — e escondendo ele: pausar não pode virar tempo extra para
 * estudar a jogada com o relógio parado.
 */
export function TelaDePausa({ expirou, onContinuar }: { expirou: boolean; onContinuar: () => void }) {
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => botao.current?.focus(), []);
  return (
    <motion.div className="mj-pausa" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="panel mj-pausa-quadro">
        <Icone nome="pausa" size={44} />
        <h2 className="title-deco">{expirou ? 'A partida recomeçou' : 'Pausado'}</h2>
        <p className="muted small">
          {expirou
            ? 'Ficou duas horas em pausa: a partida voltou ao nível 1. O recorde continua guardado.'
            : 'O relógio do nível está parado. Depois de duas horas em pausa, a partida recomeça do nível 1.'}
        </p>
        <button ref={botao} className="btn btn-gold" onClick={onContinuar}>
          {expirou ? 'Começar' : 'Continuar'}
        </button>
      </div>
    </motion.div>
  );
}
