import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { sfx } from '../audio/sfx';
import { fmt } from '../util/format';
import {
  BONUS_POR_JOGADA,
  CORES,
  SEGUNDOS_DO_RELOGIO,
  LADO,
  cumpriu,
  dica,
  embaralhar,
  estrelasDoNivel,
  jogar,
  nivelJoias,
  temJogada,
  vizinhas,
  criar,
  type Especial,
  type NivelJoias,
  type Pos,
  type Tabuleiro,
} from './joias';
import { lerRecorde, gravarRecorde, mandarRecorde } from './recorde';
import {
  BotaoPausa,
  Destaque,
  FaixaDoNivel,
  Icone,
  NivelMedalha,
  Objetivo,
  PainelPlacar,
  QuadroFim,
  QuadroNivel,
  RESERVA_LATERAL,
  RelogioDoNivel,
  TelaDePausa,
  useCaixa,
  usePausa,
  type NivelFeito,
} from './ui';
import { useMinijogos } from '../store/minijogos';

/**
 * As joias, como no gênero: rubi, esmeralda, topázio, safira, ametista e âmbar — cada uma com o
 * seu corte, para dar para jogar sem depender só da cor.
 */
const JOIAS: { nome: string; claro: string; cor: string; escuro: string; forma: [number, number][] }[] = [
  // rubi: o escudo, largo em cima e com a ponta para baixo
  { nome: 'Rubi', claro: '#ff9aa4', cor: '#e8182f', escuro: '#7a0512', forma: [[14, 22], [30, 10], [70, 10], [86, 22], [50, 92]] },
  // esmeralda: o losango
  { nome: 'Esmeralda', claro: '#9dffb4', cor: '#17c247', escuro: '#05601e', forma: [[50, 6], [94, 50], [50, 94], [6, 50]] },
  // topázio: o quadrado de cantos cortados
  { nome: 'Topázio', claro: '#fff1a0', cor: '#f5b40f', escuro: '#8a5200', forma: [[28, 8], [72, 8], [92, 28], [92, 72], [72, 92], [28, 92], [8, 72], [8, 28]] },
  // safira: o triângulo
  { nome: 'Safira', claro: '#a8e4ff', cor: '#1f86f2', escuro: '#0a2f8a', forma: [[50, 6], [95, 88], [5, 88]] },
  // ametista: o hexágono em pé
  { nome: 'Ametista', claro: '#e7b8ff', cor: '#9b32e8', escuro: '#43096e', forma: [[50, 5], [89, 27], [89, 73], [50, 95], [11, 73], [11, 27]] },
  // âmbar: o redondo lapidado
  {
    nome: 'Âmbar',
    claro: '#ffd0a0',
    cor: '#ff7b1c',
    escuro: '#8a3200',
    forma: Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      return [50 + Math.cos(a) * 44, 50 + Math.sin(a) * 44] as [number, number];
    }),
  },
];

/** Os gradientes das joias, uma vez só na página (as ids do SVG valem para o documento inteiro). */
export function DefsDasJoias() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {JOIAS.map((j, i) => (
          <linearGradient key={i} id={`mj-joia-${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={j.claro} />
            <stop offset="0.45" stopColor={j.cor} />
            <stop offset="1" stopColor={j.escuro} />
          </linearGradient>
        ))}
        <radialGradient id="mj-estrela" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.35" stopColor="#ffe36b" />
          <stop offset="0.7" stopColor="#ff5fd2" />
          <stop offset="1" stopColor="#5b2bd6" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/**
 * Uma joia lapidada: o contorno, a mesa (o mesmo contorno menor, no centro) e as facetas entre os
 * dois, alternando claro e escuro — é o que dá o brilho de pedra sem precisar de imagem.
 */
export function JoiaSvg({ cor, especial, size }: { cor: number; especial?: Especial; size: number }) {
  if (especial === 'estrela') {
    const pontas = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 20 : 44;
      return `${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`;
    }).join(' ');
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} className="mj-joia estrela">
        <circle cx="50" cy="50" r="40" fill="url(#mj-estrela)" opacity="0.55" />
        <polygon points={pontas} fill="url(#mj-estrela)" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="42" cy="38" r="6" fill="#fff" opacity="0.9" />
      </svg>
    );
  }
  const j = JOIAS[cor];
  const mesa = j.forma.map(([x, y]) => [50 + (x - 50) * 0.5, 48 + (y - 50) * 0.5] as [number, number]);
  const pts = (p: [number, number][]) => p.map(([x, y]) => `${x},${y}`).join(' ');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="mj-joia">
      <polygon points={pts(j.forma)} fill={`url(#mj-joia-${cor})`} stroke={j.escuro} strokeWidth="2" strokeLinejoin="round" />
      {j.forma.map((p, i) => {
        const q = j.forma[(i + 1) % j.forma.length];
        const faceta: [number, number][] = [p, q, mesa[(i + 1) % mesa.length], mesa[i]];
        return <polygon key={i} points={pts(faceta)} fill={i % 2 ? '#000' : '#fff'} opacity={i % 2 ? 0.16 : 0.2} />;
      })}
      <polygon points={pts(mesa)} fill={j.claro} opacity="0.55" />
      <ellipse cx="38" cy="30" rx="9" ry="5" fill="#fff" opacity="0.75" transform="rotate(-25 38 30)" />
      {(especial === 'linha-h' || especial === 'linha-v' || especial === 'cruz') && (
        <g className={`mj-listras ${especial}`}>
          {[-14, 0, 14].map((d) =>
            especial === 'linha-h' ? (
              <rect key={d} x="10" y={46 + d} width="80" height="5" rx="2.5" fill="#fff" opacity="0.85" />
            ) : especial === 'linha-v' ? (
              <rect key={d} x={47 + d} y="10" width="5" height="80" rx="2.5" fill="#fff" opacity="0.85" />
            ) : null,
          )}
          {especial === 'cruz' && (
            <>
              <rect x="8" y="44" width="84" height="12" rx="6" fill="#fff" opacity="0.9" />
              <rect x="44" y="8" width="12" height="84" rx="6" fill="#fff" opacity="0.9" />
              <circle cx="50" cy="50" r="10" fill={j.cor} stroke="#fff" strokeWidth="3" />
            </>
          )}
        </g>
      )}
      {especial === 'bomba' && (
        <g className="mj-bomba">
          {/* a bomba: o miolo escuro com o anel aceso e o pavio */}
          <circle cx="50" cy="54" r="21" fill="#1b1430" stroke="#fff" strokeWidth="3.5" />
          <circle cx="44" cy="48" r="5" fill="#fff" opacity="0.5" />
          <path d="M60 36 Q70 22 80 26" fill="none" stroke="#ffd35a" strokeWidth="4" strokeLinecap="round" />
          <circle className="mj-pavio" cx="80" cy="26" r="6" fill="#ff8a1f" />
        </g>
      )}
      {especial === 'relogio' && (
        <g className="mj-relogio">
          <circle cx="70" cy="70" r="20" fill="#fff" stroke="#1b1430" strokeWidth="3" />
          <path d="M70 58 V70 L78 75" fill="none" stroke="#1b1430" strokeWidth="4" strokeLinecap="round" />
        </g>
      )}
      {especial === 'x2' && (
        <g className="mj-x2">
          <rect x="50" y="56" width="42" height="30" rx="10" fill="#fff" stroke="#1b1430" strokeWidth="3" />
          <text x="71" y="78" textAnchor="middle" fontSize="22" fontWeight="900" fill="#1b1430" fontFamily="sans-serif">
            ×2
          </text>
        </g>
      )}
    </svg>
  );
}

/** O nome das joias no plural, para as missões ("Junte 12 âmbares"). */
const PLURAL = ['rubis', 'esmeraldas', 'topázios', 'safiras', 'ametistas', 'âmbares'];

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pontos por segundo que sobra quando o nível é cumprido. */
const PONTOS_POR_SEGUNDO = 20;

interface Aviso {
  id: number;
  x: number;
  y: number;
  texto: string;
  grande?: boolean;
}

let avisoId = 0;

type Fase = 'jogando' | 'concluido' | 'fim';

/** `nivelInicial` é para a página de preview abrir um nível alto; o jogo de verdade começa no 1. */
export function JogoJoias({ onSair, nivelInicial = 1 }: { onSair: () => void; nivelInicial?: number }) {
  const raiz = useRef<HTMLDivElement>(null);
  const caixa = useCaixa(raiz);
  // a casa: a altura inteira do jogo manda; a largura só limita quando os painéis já estão no mínimo
  // (descontando a moldura e a barra das estrelas)
  const S = Math.max(34, Math.min(116, Math.floor(Math.min((caixa.w - RESERVA_LATERAL - 70) / LADO, (caixa.h - 28) / LADO)) || 60));
  const [historico, setHistorico] = useState<NivelFeito[]>([]);

  const [nivel, setNivel] = useState<NivelJoias>(() => nivelJoias(nivelInicial));
  const [t, setT] = useState<Tabuleiro>(() => criar(Math.random, nivelJoias(nivelInicial).cores));
  const [sel, setSel] = useState<Pos | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [fase, setFase] = useState<Fase>('jogando');
  const [pontosNivel, setPontosNivel] = useState(0);
  const [total, setTotal] = useState(0);
  const [jogadas, setJogadas] = useState(() => nivelJoias(nivelInicial).jogadas);
  const [juntadas, setJuntadas] = useState<number[]>(() => new Array(CORES).fill(0));
  const [bonus, setBonus] = useState(0);
  /** Os números da partida para os destaques: combos, a maior jogada e as joias juntadas. */
  const [marcas, setMarcas] = useState({ ultimoCombo: 0, melhorCombo: 0, maiorJogada: 0, joias: 0 });
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [piscar, setPiscar] = useState<[Pos, Pos] | null>(null);
  const [recorde, setRecorde] = useState(() => lerRecorde('joias'));
  const [novoRecorde, setNovoRecorde] = useState(false);
  /** Segundos que faltam no nível (a tela mostra arredondado para cima). */
  const [tempo, setTempo] = useState(() => nivelJoias(nivelInicial).tempo);
  const tempoRef = useRef(tempo);
  const [bonusTempo, setBonusTempo] = useState(0);
  const [motivo, setMotivo] = useState<'' | 'tempo' | 'jogadas'>('');
  const avisarNivel = useMinijogos((s) => s.avisarNivel);
  const vivo = useRef(true);
  // no modo estrito o React monta, desmonta e monta de novo: a marca volta a valer a cada montagem
  useEffect(() => {
    vivo.current = true;
    return () => void (vivo.current = false);
  }, []);

  const avisar = useCallback((a: Omit<Aviso, 'id'>) => {
    const id = ++avisoId;
    // o aviso grande (combo, embaralhando) é um de cada vez: o novo toma o lugar do anterior
    setAvisos((l) => [...(a.grande ? l.filter((x) => !x.grande) : l), { ...a, id }]);
    setTimeout(() => vivo.current && setAvisos((l) => l.filter((x) => x.id !== id)), 1100);
  }, []);

  // parado por uns segundos: a dica pisca uma troca que vale
  useEffect(() => {
    setPiscar(null);
    if (ocupado || fase !== 'jogando') return;
    const id = setTimeout(() => setPiscar(dica(t)), 6000);
    return () => clearTimeout(id);
  }, [t, ocupado, fase]);

  const acabou = (totalFinal: number, por: 'tempo' | 'jogadas' = 'jogadas') => {
    setMotivo(por);
    setFase('fim');
    sfx.lose();
    // vai sempre: a conta pode ter um recorde menor que o deste aparelho
    gravarRecorde('joias', totalFinal, nivel.n);
    if (totalFinal > recorde) {
      setRecorde(totalFinal);
      setNovoRecorde(true);
    }
  };

  const pausa = usePausa({
    ativo: fase === 'jogando',
    onExpirar: () => {
      // duas horas pausado: a partida recomeça (o que ela fez até aqui conta para o recorde)
      gravarRecorde('joias', totalRef.current, nivel.n);
      if (totalRef.current > recorde) setRecorde(totalRef.current);
      montar(1, true);
    },
  });

  // o total de agora, para o relógio e a pausa (que rodam fora do fluxo de uma jogada)
  const totalRef = useRef(total);
  totalRef.current = total;

  // o relógio: corre só enquanto se pensa (parado nas cascatas, na pausa e fora do nível)
  const correndo = fase === 'jogando' && !ocupado && !pausa.pausado;
  useEffect(() => {
    if (!correndo) return;
    let antes = performance.now();
    const id = setInterval(() => {
      const agora = performance.now();
      const antesS = Math.ceil(tempoRef.current);
      tempoRef.current = Math.max(0, tempoRef.current - (agora - antes) / 1000);
      antes = agora;
      const s = Math.ceil(tempoRef.current);
      if (s === antesS) return;
      setTempo(tempoRef.current);
      if (s <= 5 && s > 0) sfx.tick();
      if (tempoRef.current <= 0) {
        setSel(null);
        acabou(totalRef.current, 'tempo');
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correndo]);

  const tentar = async (a: Pos, b: Pos) => {
    if (ocupado || fase !== 'jogando' || jogadas <= 0 || pausa.pausado || tempoRef.current <= 0 || !vizinhas(a, b)) return;
    setOcupado(true);
    setSel(null);
    const antes = t;
    const trocado = antes.map((l) => l.slice());
    [trocado[a.r][a.c], trocado[b.r][b.c]] = [trocado[b.r][b.c], trocado[a.r][a.c]];
    setT(trocado);
    sfx.troca();
    await esperar(190);
    if (!vivo.current) return;
    const j = jogar(antes, a, b, Math.random, nivel.cores, nivel.chances);
    if (!j.valida) {
      // não alinhou nada: volta cada uma para o seu lugar
      sfx.invalida();
      setT(antes);
      await esperar(200);
      if (vivo.current) setOcupado(false);
      return;
    }
    const restam = jogadas - 1;
    setJogadas(restam);
    const daJogada = j.passos.reduce((n, p) => n + p.pontos, 0);
    const comboDaJogada = j.passos[j.passos.length - 1].combo;
    const joiasDaJogada = j.passos.reduce((n, p) => n + p.limpas.length, 0);
    setMarcas((m) => ({
      ultimoCombo: comboDaJogada,
      melhorCombo: Math.max(m.melhorCombo, comboDaJogada),
      maiorJogada: Math.max(m.maiorJogada, daJogada),
      joias: m.joias + joiasDaJogada,
    }));
    let pts = pontosNivel;
    let tot = total;
    let jun = juntadas;
    for (const p of j.passos) {
      setT(p.comBuracos);
      pts += p.pontos;
      tot += p.pontos;
      jun = jun.map((n, i) => n + p.porCor[i]);
      setPontosNivel(pts);
      setTotal(tot);
      setJuntadas(jun);
      const meio = p.limpas.reduce((m, q) => ({ r: m.r + q.r / p.limpas.length, c: m.c + q.c / p.limpas.length }), { r: 0, c: 0 });
      avisar({ x: (meio.c + 0.5) * S, y: (meio.r + 0.5) * S, texto: `+${fmt(p.pontos)}` });
      if (p.combo > 1) {
        avisar({ x: (LADO / 2) * S, y: (LADO / 2) * S, texto: p.combo >= 4 ? `Incrível! ×${p.combo}` : `Combo ×${p.combo}`, grande: true });
      }
      if (p.segundos) {
        // o relógio devolve tempo ao nível
        tempoRef.current += p.segundos;
        setTempo(tempoRef.current);
        avisar({ x: (meio.c + 0.5) * S, y: (meio.r + 0.5) * S - S * 0.6, texto: `+${p.segundos}s` });
        sfx.fx('chime');
      }
      if (p.multiplicador > 1) avisar({ x: (LADO / 2) * S, y: (LADO / 2) * S - S, texto: `Pontos ×${p.multiplicador}`, grande: true });
      if (p.detonadas.includes('bomba')) sfx.fx('flame');
      if (p.detonadas.includes('cruz') || p.detonadas.includes('linha-h') || p.detonadas.includes('linha-v')) sfx.fx('zap');
      sfx.joias(p.combo, p.limpas.length);
      await esperar(250);
      if (!vivo.current) return;
      setT(p.depois);
      await esperar(310);
      if (!vivo.current) return;
    }

    if (cumpriu(nivel, pts, jun)) {
      // passou: as jogadas que sobraram viram pontos, e o servidor decide o prêmio
      const extra = restam * BONUS_POR_JOGADA;
      // o tempo que sobrou também vale (não conta para as estrelas, que são da meta)
      const doTempo = Math.ceil(tempoRef.current) * PONTOS_POR_SEGUNDO;
      setBonus(extra);
      setBonusTempo(doTempo);
      setPontosNivel(pts + extra);
      setHistorico((h) => [...h, { nivel: nivel.n, estrelas: estrelasDoNivel(nivel, pts + extra), pontos: pts + extra + doTempo }]);
      setTotal(tot + extra + doTempo);
      if (extra) avisar({ x: (LADO / 2) * S, y: (LADO / 2) * S, texto: `Jogadas que sobraram +${fmt(extra)}`, grande: true });
      sfx.win();
      avisarNivel('joias', nivel.n);
      mandarRecorde('joias', tot + extra + doTempo, nivel.n);
      await esperar(extra ? 900 : 400);
      if (!vivo.current) return;
      setFase('concluido');
      setOcupado(false);
      return;
    }
    if (restam <= 0) {
      acabou(tot);
      setOcupado(false);
      return;
    }
    if (tempoRef.current <= 0) {
      acabou(tot, 'tempo');
      setOcupado(false);
      return;
    }
    if (!temJogada(j.final)) {
      avisar({ x: (LADO / 2) * S, y: (LADO / 2) * S, texto: 'Sem jogadas — embaralhando', grande: true });
      await esperar(700);
      if (!vivo.current) return;
      setT(embaralhar(j.final, Math.random, nivel.cores));
      sfx.embaralhar();
      await esperar(400);
    }
    if (vivo.current) setOcupado(false);
  };

  // arrastar troca na direção do arrasto; clicar escolhe e clicar numa vizinha troca
  const inicio = useRef<{ p: Pos; x: number; y: number } | null>(null);
  const casaDe = (e: ReactPointerEvent<HTMLDivElement>): Pos | null => {
    const box = e.currentTarget.getBoundingClientRect();
    const c = Math.floor((e.clientX - box.left) / S);
    const r = Math.floor((e.clientY - box.top) / S);
    return r >= 0 && r < LADO && c >= 0 && c < LADO ? { r, c } : null;
  };
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = casaDe(e);
    if (!p || ocupado || fase !== 'jogando' || pausa.pausado) return;
    inicio.current = { p, x: e.clientX, y: e.clientY };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const i = inicio.current;
    if (!i) return;
    const dx = e.clientX - i.x;
    const dy = e.clientY - i.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < S * 0.35) return;
    inicio.current = null;
    const alvo = Math.abs(dx) > Math.abs(dy) ? { r: i.p.r, c: i.p.c + Math.sign(dx) } : { r: i.p.r + Math.sign(dy), c: i.p.c };
    void tentar(i.p, alvo);
  };
  const onUp = () => {
    const i = inicio.current;
    inicio.current = null;
    if (!i) return;
    if (sel && vizinhas(sel, i.p)) void tentar(sel, i.p);
    else if (sel && sel.r === i.p.r && sel.c === i.p.c) setSel(null);
    else {
      sfx.hover();
      setSel(i.p);
    }
  };

  /** Monta o nível `n` (o total da partida continua, a não ser que `zerar`). */
  const montar = (n: number, zerar: boolean) => {
    const nv = nivelJoias(n);
    sfx.deal();
    setNivel(nv);
    setT(criar(Math.random, nv.cores));
    setPontosNivel(0);
    setJogadas(nv.jogadas);
    setJuntadas(new Array(CORES).fill(0));
    setBonus(0);
    setBonusTempo(0);
    setMotivo('');
    tempoRef.current = nv.tempo;
    setTempo(nv.tempo);
    setSel(null);
    setFase('jogando');
    if (zerar) {
      setTotal(0);
      setNovoRecorde(false);
      setMarcas({ ultimoCombo: 0, melhorCombo: 0, maiorJogada: 0, joias: 0 });
      setHistorico([]);
    }
  };

  const estrelas = estrelasDoNivel(nivel, pontosNivel);
  const progresso = Math.min(1, pontosNivel / (nivel.meta * 1.6));
  const piscando = (r: number, c: number) => piscar?.some((q) => q.r === r && q.c === c);

  return (
    <div className="mj-jogo mj-joias" ref={raiz}>
      <DefsDasJoias />
      <aside className="panel mj-lado">
        <NivelMedalha nivel={nivel.n} />
        <div className="mj-objetivos">
          <small>Missões do nível</small>
          <Objetivo icone={<Icone nome="estrela" size={34} />} texto="Faça pontos" feito={pontosNivel} alvo={nivel.meta} />
          {nivel.coletar.map((c) => (
            <Objetivo key={c.cor} icone={<JoiaSvg cor={c.cor} size={40} />} texto={`Junte ${PLURAL[c.cor]}`} feito={juntadas[c.cor]} alvo={c.qtd} />
          ))}
        </div>
        <div className="mj-destaques">
          <RelogioDoNivel segundos={tempo} total={nivel.tempo} />
          <Destaque icone="jogadas" rotulo="Jogadas" valor={jogadas} sub={`de ${nivel.jogadas}`} alerta={jogadas <= 5} />
          <Destaque
            icone="combo"
            rotulo="Melhor combo"
            valor={marcas.melhorCombo > 1 ? `×${marcas.melhorCombo}` : '—'}
            sub={marcas.ultimoCombo > 1 ? `última: ×${marcas.ultimoCombo}` : 'cascatas em sequência'}
            pulso={marcas.melhorCombo}
          />
          <Destaque icone="raio" rotulo="Maior jogada" valor={fmt(marcas.maiorJogada)} sub="pontos de uma vez" pulso={marcas.maiorJogada} />
        </div>
        {nivel.coletar.length <= 1 && (
          <p className="muted small mj-ajuda">
            Arraste uma joia para a vizinha. O relógio para enquanto as joias caem; jogadas e segundos que sobram viram pontos. P pausa.
          </p>
        )}
      </aside>

      <div className="mj-centro">
        <div className="mj-moldura">
          {/* a barra das estrelas do nível, ao lado do tabuleiro: enche com os pontos */}
          <div className="mj-barra" style={{ height: S * LADO }}>
            <i style={{ height: `${progresso * 100}%` }} />
            {[1, 1.3, 1.6].map((k, i) => (
              <span key={k} className={`mj-barra-marca ${i < estrelas ? 'on' : ''}`} style={{ bottom: `${(k / 1.6) * 100}%` }}>
                ★
              </span>
            ))}
          </div>
          <div
            className="mj-tabuleiro"
            style={{ width: S * LADO, height: S * LADO, '--casa': `${S}px` } as CSSProperties}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={() => (inicio.current = null)}
          >
            {sel && <div className="mj-sel" style={{ left: sel.c * S, top: sel.r * S, width: S, height: S }} />}
            <AnimatePresence>
              {t.flatMap((linha, r) =>
                linha.map((g, c) =>
                  g ? (
                    <motion.div
                      key={g.id}
                      className={`mj-casa ${piscando(r, c) ? 'dica' : ''}`}
                      style={{ width: S, height: S }}
                      initial={g.nasce ? { x: c * S, y: (r - g.nasce) * S, opacity: 1 } : false}
                      animate={{ x: c * S, y: r * S, scale: 1, opacity: 1 }}
                      exit={{ scale: 0.2, opacity: 0, rotate: 30, transition: { duration: 0.22 } }}
                      transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.8 }}
                    >
                      <JoiaSvg cor={g.cor} especial={g.especial} size={S * 0.86} />
                    </motion.div>
                  ) : null,
                ),
              )}
            </AnimatePresence>
            <AnimatePresence>
              {avisos.map((a) => (
                <motion.div
                  key={a.id}
                  className={`mj-aviso ${a.grande ? 'grande' : ''}`}
                  style={{ left: a.x, top: a.y }}
                  initial={{ opacity: 0, y: 0, scale: 0.6 }}
                  animate={{ opacity: 1, y: -34, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45 }}
                >
                  {a.texto}
                </motion.div>
              ))}
            </AnimatePresence>
            {fase === 'jogando' && <FaixaDoNivel nivel={nivel.n} />}
            <AnimatePresence>{pausa.pausado && <TelaDePausa key="pausa" expirou={pausa.expirou} onContinuar={pausa.continuar} />}</AnimatePresence>
          </div>
        </div>
      </div>

      <PainelPlacar
        total={total}
        recorde={recorde}
        estrelas={estrelas}
        historico={historico}
        legenda={
          <div className="mj-legenda compacta">
            <small>Joias especiais</small>
            <span className="mj-legenda-grade">
              <span className="mj-legenda-item" title="4 em linha: leva a linha (ou a coluna)">
                <JoiaSvg cor={3} especial="linha-h" size={22} />
                <b>4 em linha</b>
              </span>
              <span className="mj-legenda-item" title="L ou T: uma bomba que explode as oito vizinhas">
                <JoiaSvg cor={0} especial="bomba" size={22} />
                <b>L ou T</b>
              </span>
              <span className="mj-legenda-item" title="L ou T de 6: uma cruz que leva a linha e a coluna">
                <JoiaSvg cor={1} especial="cruz" size={22} />
                <b>L ou T de 6</b>
              </span>
              <span className="mj-legenda-item" title="5 em linha: uma estrela que leva todas de uma cor">
                <JoiaSvg cor={0} especial="estrela" size={22} />
                <b>5 em linha</b>
              </span>
              {nivel.chances.relogio > 0 && (
                <span className="mj-legenda-item" title={`Relógio: devolve ${SEGUNDOS_DO_RELOGIO} segundos quando some`}>
                  <JoiaSvg cor={2} especial="relogio" size={22} />
                  <b>+{SEGUNDOS_DO_RELOGIO}s</b>
                </span>
              )}
              {nivel.chances.x2 > 0 && (
                <span className="mj-legenda-item" title="×2: dobra os pontos do passo em que some">
                  <JoiaSvg cor={4} especial="x2" size={22} />
                  <b>pontos ×2</b>
                </span>
              )}
            </span>
          </div>
        }
      >
        <div className="mj-botoes">
          <BotaoPausa onClick={pausa.pausar} disabled={fase !== 'jogando' || pausa.pausado} />
          <button className="btn btn-ghost small" onClick={() => montar(1, true)} disabled={ocupado}>
            ↻ Recomeçar do nível 1
          </button>
        </div>
      </PainelPlacar>

      <AnimatePresence>
        {fase === 'concluido' && (
          <QuadroNivel
            key={`n${nivel.n}`}
            jogo="joias"
            nivel={nivel.n}
            estrelas={estrelas}
            linhas={[
              { rotulo: 'Pontos no nível', valor: fmt(pontosNivel - bonus) },
              ...(bonus ? [{ rotulo: 'Jogadas que sobraram', valor: `+${fmt(bonus)}` }] : []),
              ...(bonusTempo ? [{ rotulo: 'Tempo que sobrou', valor: `+${fmt(bonusTempo)}` }] : []),
              { rotulo: 'Total da partida', valor: fmt(total) },
            ]}
            onProximo={() => montar(nivel.n + 1, false)}
          />
        )}
        {fase === 'fim' && (
          <QuadroFim key="fim" titulo={motivo === 'tempo' ? 'O tempo acabou' : 'Acabaram as jogadas'} total={total} nivel={nivel.n} novoRecorde={novoRecorde} onDeNovo={() => montar(1, true)} onSair={onSair} />
        )}
      </AnimatePresence>
    </div>
  );
}
