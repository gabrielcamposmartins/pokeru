import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { sfx } from '../audio/sfx';
import { fmt } from '../util/format';
import {
  ALTURA,
  ALTURA_LINHA,
  ATIRADOR,
  BOMBA,
  CURINGA,
  ESTOURO_DA_BOMBA,
  LARGURA,
  LINHA_LIMITE,
  PALETA,
  PONTOS_POR_SEGUNDO,
  R,
  SEQUENCIA_DO_CURINGA,
  alvoDaMira,
  anguloPara,
  atirar,
  avancar,
  centro,
  colunasDa,
  contarCor,
  corDe,
  coresNaGrade,
  criar,
  empurrar,
  estrelasBolhas,
  limpa,
  mira,
  nivelBolhas,
  pousar,
  temMira,
  tipoDe,
  ultimaLinha,
  type NivelBolhas,
  type Voo,
} from './bolhas';
import { gravarRecorde, lerRecorde, mandarRecorde } from './recorde';
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

/** Onde fica a próxima bolha (clicar nela troca com a atual). */
const PROXIMA = { x: ATIRADOR.x - 96, y: ATIRADOR.y + 10 };
/** Onde ficam os tiros que faltam até a grade descer. */
const PIPS = { x: ATIRADOR.x + 66, y: ATIRADOR.y + 10 };
/** A linha que as bolhas não podem cruzar (o alto da linha proibida). */
const Y_LIMITE = LINHA_LIMITE * ALTURA_LINHA;
/** A cor dos cacos de pedra. */
const COR_PEDRA = '#8f94a3';

type Fase = 'jogando' | 'concluido' | 'fim';

interface Particula {
  tipo: 'anel' | 'caco' | 'queda' | 'texto' | 'raio' | 'onda';
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** A cor (texto CSS) dos anéis e cacos; o valor da bolha nas quedas. */
  cor: string;
  valor?: number;
  t: number;
  /** Tamanho do caco. */
  tam?: number;
  texto?: string;
}

/** A cor de desenho de uma bolha qualquer (a pedra é cinza; a bomba, escura; o curinga, branco). */
function corCss(v: number): string {
  const k = corDe(v);
  if (k != null) return PALETA[k];
  if (v === BOMBA) return '#3b3550';
  if (v === CURINGA) return '#ffffff';
  return COR_PEDRA;
}

// ------------------------------------------------------------------ o desenho das bolhas

/** Mistura duas cores `#rrggbb` (t = 0 é a primeira, 1 é a segunda). */
function misturar(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((x, i) => Math.round(x + (pb[i] - x) * t)).join(',')})`;
}

/**
 * O símbolo de cada cor, bem de leve dentro da bolha: coração, estrela, triângulo, losango, anel,
 * quadrado, lua e cruz. Não é enfeite — é o que deixa jogar quem confunde vermelho com verde.
 */
function simbolo(g: CanvasRenderingContext2D, qual: number, s: number) {
  g.beginPath();
  switch (qual) {
    case 0: // coração
      g.moveTo(0, s * 0.85);
      g.bezierCurveTo(-s * 1.3, 0, -s * 0.7, -s * 1.05, 0, -s * 0.35);
      g.bezierCurveTo(s * 0.7, -s * 1.05, s * 1.3, 0, 0, s * 0.85);
      break;
    case 1: // estrela
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? s * 0.45 : s;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      break;
    case 2: // triângulo
      g.moveTo(0, -s);
      g.lineTo(s * 0.95, s * 0.7);
      g.lineTo(-s * 0.95, s * 0.7);
      break;
    case 3: // losango
      g.moveTo(0, -s);
      g.lineTo(s * 0.75, 0);
      g.lineTo(0, s);
      g.lineTo(-s * 0.75, 0);
      break;
    case 4: // anel
      g.arc(0, 0, s * 0.8, 0, Math.PI * 2);
      g.moveTo(s * 0.42, 0);
      g.arc(0, 0, s * 0.42, 0, Math.PI * 2, true);
      break;
    case 5: // quadrado
      g.rect(-s * 0.72, -s * 0.72, s * 1.44, s * 1.44);
      break;
    case 6: // lua
      g.arc(0, 0, s * 0.85, Math.PI * 0.35, Math.PI * 1.65);
      g.arc(s * 0.38, 0, s * 0.62, Math.PI * 1.45, Math.PI * 0.55, true);
      break;
    default: {
      // cruz
      const a = s * 0.3;
      const b = s * 0.85;
      g.moveTo(-a, -b);
      g.lineTo(a, -b);
      g.lineTo(a, -a);
      g.lineTo(b, -a);
      g.lineTo(b, a);
      g.lineTo(a, a);
      g.lineTo(a, b);
      g.lineTo(-a, b);
      g.lineTo(-a, a);
      g.lineTo(-b, a);
      g.lineTo(-b, -a);
      g.lineTo(-a, -a);
    }
  }
  g.closePath();
  g.fill('evenodd');
}

/** Um canvas quadrado de `px` pixels, com a origem no meio. */
function tela(px: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D; r: number } {
  const c = document.createElement('canvas');
  c.width = c.height = Math.max(8, Math.ceil(px));
  const g = c.getContext('2d')!;
  const r = c.width / 2;
  g.translate(r, r);
  return { c, g, r };
}

/** O corpo de vidro de uma bolha: degradê, borda, a luz que volta do chão e os dois brilhos. */
function corpo(g: CanvasRenderingContext2D, r: number, base: string, desenhoDentro?: () => void) {
  const grad = g.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.04, 0, 0, r);
  grad.addColorStop(0, misturar(base, '#ffffff', 0.7));
  grad.addColorStop(0.32, misturar(base, '#ffffff', 0.12));
  grad.addColorStop(0.78, base);
  grad.addColorStop(1, misturar(base, '#000000', 0.5));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, r * 0.95, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = misturar(base, '#000000', 0.55);
  g.globalAlpha = 0.55;
  g.lineWidth = r * 0.06;
  g.stroke();
  g.globalAlpha = 0.32;
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  g.lineWidth = r * 0.1;
  g.beginPath();
  g.arc(0, 0, r * 0.76, Math.PI * 0.22, Math.PI * 0.78);
  g.stroke();
  g.globalAlpha = 1;
  desenhoDentro?.();
  const brilho = g.createRadialGradient(-r * 0.3, -r * 0.46, 0, -r * 0.3, -r * 0.46, r * 0.48);
  brilho.addColorStop(0, 'rgba(255,255,255,0.9)');
  brilho.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = brilho;
  g.beginPath();
  g.ellipse(-r * 0.3, -r * 0.46, r * 0.46, r * 0.28, -0.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.arc(-r * 0.5, -r * 0.2, r * 0.07, 0, Math.PI * 2);
  g.fill();
}

/**
 * Uma bolha de cor pronta, num canvas à parte, no tamanho de pixels em que vai ser desenhada.
 * Desenhar isto 150 vezes por quadro sairia caro; copiar a imagem pronta, não.
 */
function spriteCor(k: number, px: number): HTMLCanvasElement {
  const { c, g, r } = tela(px);
  corpo(g, r, PALETA[k], () => {
    g.globalAlpha = 0.2;
    g.fillStyle = '#ffffff';
    simbolo(g, k, r * 0.36);
    g.globalAlpha = 1;
  });
  return c;
}

/** A pedra: cinza, fosca, com rachaduras — ela não é de vidro, e precisa parecer que não estoura. */
function spritePedra(px: number): HTMLCanvasElement {
  const { c, g, r } = tela(px);
  const grad = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, 0, 0, r);
  grad.addColorStop(0, '#d5d8e0');
  grad.addColorStop(0.55, '#8f94a3');
  grad.addColorStop(1, '#4a4e5a');
  g.fillStyle = grad;
  g.beginPath();
  // um contorno de pedra, com lascas
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const rr = r * (0.86 + ((i * 37) % 7) / 70);
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(30, 32, 40, 0.7)';
  g.lineWidth = r * 0.07;
  g.stroke();
  g.lineWidth = r * 0.06;
  g.beginPath();
  g.moveTo(-r * 0.45, -r * 0.2);
  g.lineTo(-r * 0.1, r * 0.05);
  g.lineTo(-r * 0.2, r * 0.45);
  g.moveTo(-r * 0.1, r * 0.05);
  g.lineTo(r * 0.4, -r * 0.1);
  g.stroke();
  return c;
}

/** A bomba: escura, com o pavio aceso em cima. */
function spriteBomba(px: number): HTMLCanvasElement {
  const { c, g, r } = tela(px);
  corpo(g, r, '#3b3550', () => {
    g.strokeStyle = '#ffd35a';
    g.lineWidth = r * 0.12;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(r * 0.1, -r * 0.55);
    g.quadraticCurveTo(r * 0.45, -r * 0.95, r * 0.7, -r * 0.7);
    g.stroke();
    g.fillStyle = '#ff7a1a';
    g.beginPath();
    g.arc(r * 0.7, -r * 0.7, r * 0.17, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff3b0';
    g.beginPath();
    g.arc(r * 0.7, -r * 0.7, r * 0.08, 0, Math.PI * 2);
    g.fill();
  });
  return c;
}

/** O curinga: o arco-íris inteiro, girando em fatias. */
function spriteCuringa(px: number): HTMLCanvasElement {
  const { c, g, r } = tela(px);
  for (let i = 0; i < PALETA.length; i++) {
    g.fillStyle = PALETA[i];
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, r * 0.95, (i / PALETA.length) * Math.PI * 2, ((i + 1) / PALETA.length) * Math.PI * 2);
    g.closePath();
    g.fill();
  }
  corpo(g, r, '#ffffff', undefined);
  // o corpo de vidro por cima deixou tudo branco: as fatias voltam, translúcidas, por cima dele
  g.globalAlpha = 0.62;
  for (let i = 0; i < PALETA.length; i++) {
    g.fillStyle = PALETA[i];
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, r * 0.88, (i / PALETA.length) * Math.PI * 2, ((i + 1) / PALETA.length) * Math.PI * 2);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(0, 0, r * 0.28, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** O selo que vai por cima de uma bolha de cor: o raio ou a estrela, em branco forte. */
function spriteSelo(tipo: 'raio' | 'estrela', px: number): HTMLCanvasElement {
  const { c, g, r } = tela(px);
  g.fillStyle = '#ffffff';
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = r * 0.07;
  g.lineJoin = 'round';
  g.beginPath();
  if (tipo === 'raio') {
    const s = r * 0.62;
    g.moveTo(s * 0.15, -s);
    g.lineTo(-s * 0.55, s * 0.12);
    g.lineTo(-s * 0.02, s * 0.12);
    g.lineTo(-s * 0.2, s);
    g.lineTo(s * 0.55, -s * 0.18);
    g.lineTo(s * 0.02, -s * 0.18);
  } else {
    const s = r * 0.62;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? s * 0.45 : s;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.fillStyle = '#fff2a0';
  }
  g.closePath();
  g.stroke();
  g.fill();
  return c;
}

interface Sprites {
  cor: HTMLCanvasElement[];
  pedra: HTMLCanvasElement;
  bomba: HTMLCanvasElement;
  curinga: HTMLCanvasElement;
  raio: HTMLCanvasElement;
  estrela: HTMLCanvasElement;
}

function fazerSprites(px: number): Sprites {
  return {
    cor: PALETA.map((_, i) => spriteCor(i, px)),
    pedra: spritePedra(px),
    bomba: spriteBomba(px),
    curinga: spriteCuringa(px),
    raio: spriteSelo('raio', px),
    estrela: spriteSelo('estrela', px),
  };
}

/** Uma cor de tema lida do CSS (a moldura e o lançador acompanham o tema da interface). */
function corDoTema(el: Element, nome: string, padrao: string): string {
  const v = getComputedStyle(el).getPropertyValue(nome).trim();
  return /^#|^rgb/.test(v) ? v : padrao;
}

/** As especiais, para a legenda do painel (só as que o nível já tem). */
function legendaDo(nivel: NivelBolhas): { id: string; nome: string; texto: string }[] {
  const out: { id: string; nome: string; texto: string }[] = [];
  if (nivel.chances.raio) out.push({ id: 'raio', nome: 'Raio', texto: 'estoura a linha inteira' });
  if (nivel.chances.estrela) out.push({ id: 'estrela', nome: 'Estrela', texto: 'o estouro vale o dobro' });
  if (nivel.chances.pedra) out.push({ id: 'pedra', nome: 'Pedra', texto: 'não estoura: só cai' });
  out.push({ id: 'bomba', nome: 'Bomba', texto: `explode tudo em volta (tire ${ESTOURO_DA_BOMBA} de uma vez)` });
  out.push({ id: 'curinga', nome: 'Curinga', texto: `vira a melhor cor (${SEQUENCIA_DO_CURINGA} estouros seguidos)` });
  return out;
}

// ------------------------------------------------------------------ o jogo

/** `nivelInicial` é para a página de preview abrir um nível alto; o jogo de verdade começa no 1. */
export function JogoBolhas({ onSair, nivelInicial = 1 }: { onSair: () => void; nivelInicial?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const caixa = useCaixa(raiz);
  // a escala do tabuleiro: a altura inteira do jogo manda (descontando a moldura); a largura só
  // limita quando os painéis já estão no mínimo
  const escala = Math.max(0.6, Math.min((caixa.w - RESERVA_LATERAL - 32) / LARGURA, (caixa.h - 26) / ALTURA) || 1);
  const [historico, setHistorico] = useState<NivelFeito[]>([]);
  const escalaRef = useRef(escala);
  escalaRef.current = escala;

  const avisarNivel = useMinijogos((s) => s.avisarNivel);
  const primeiro = useRef<NivelBolhas>(nivelBolhas(nivelInicial));
  // o estado do jogo mora em refs: o laço de desenho lê e escreve 60 vezes por segundo
  const jogo = useRef({
    nivel: primeiro.current,
    grade: criar(primeiro.current.linhas, primeiro.current.cores, Math.random, primeiro.current.chances),
    atual: 0,
    proxima: 0,
    angulo: Math.PI / 2,
    voo: null as Voo | null,
    trilha: [] as { x: number; y: number }[],
    particulas: [] as Particula[],
    erros: 0,
    total: 0,
    tiros: 0,
    bolhasNoInicio: 0,
    removidas: 0,
    fase: 'jogando' as Fase,
    /** Segundos que faltam no nível. */
    tempo: primeiro.current.tempo,
    pausado: false,
    /** As especiais ganhas jogando, esperando a vez de virar a próxima bolha. */
    ganhas: [] as number[],
    /** Os números da partida para os destaques. */
    sequencia: 0,
    melhorSequencia: 0,
    maiorEstouro: 0,
    derrubadas: 0,
    especiais: 0,
    /** O total quando o nível começou (os pontos do nível são a diferença). */
    totalNoInicio: 0,
  });
  const [hud, setHud] = useState({
    total: 0,
    nivel: 1,
    fase: 'jogando' as Fase,
    tiros: 0,
    removidas: 0,
    restantes: 0,
    erros: 0,
    estrelas: 0,
    bonus: 0,
    bonusTempo: 0,
    sequencia: 0,
    melhorSequencia: 0,
    maiorEstouro: 0,
    derrubadas: 0,
    especiais: 0,
    tempo: primeiro.current.tempo,
    motivo: '' as '' | 'tempo' | 'linha',
  });
  const [recorde, setRecorde] = useState(() => lerRecorde('bolhas'));
  const [novoRecorde, setNovoRecorde] = useState(false);

  const pausa = usePausa({
    ativo: hud.fase === 'jogando',
    onExpirar: () => {
      // duas horas pausado: a partida recomeça (o que ela fez até aqui conta para o recorde)
      const j = jogo.current;
      gravarRecorde('bolhas', j.total, j.nivel.n);
      if (j.total > recorde) setRecorde(j.total);
      montar(1, true);
    },
  });
  jogo.current.pausado = pausa.pausado;

  /** A próxima bolha: uma especial ganha, se houver; senão a sorte do nível; senão uma cor que serve. */
  const sortear = (): number => {
    const j = jogo.current;
    if (j.ganhas.length) return j.ganhas.shift()!;
    const x = Math.random();
    if (x < j.nivel.sorteio.bomba) return BOMBA;
    if (x < j.nivel.sorteio.bomba + j.nivel.sorteio.curinga) return CURINGA;
    const cores = coresNaGrade(j.grade);
    const lista = cores.length ? cores : Array.from({ length: j.nivel.cores }, (_, i) => i);
    return lista[Math.floor(Math.random() * lista.length)];
  };

  /** A bolha serve na grade de agora? (as especiais sempre servem; uma cor, só se ainda houver dela) */
  const serve = (v: number) => corDe(v) == null || coresNaGrade(jogo.current.grade).includes(corDe(v)!);

  const atualizarHud = (extra: Partial<typeof hud> = {}) => {
    const j = jogo.current;
    setHud((h) => ({
      ...h,
      total: j.total,
      nivel: j.nivel.n,
      fase: j.fase,
      tiros: j.tiros,
      removidas: j.removidas,
      restantes: contarCor(j.grade),
      erros: j.erros,
      sequencia: j.sequencia,
      melhorSequencia: j.melhorSequencia,
      maiorEstouro: j.maiorEstouro,
      derrubadas: j.derrubadas,
      especiais: j.especiais,
      tempo: j.tempo,
      ...extra,
    }));
  };

  /** Monta o nível `n` (o total continua, a não ser que `zerar`). */
  const montar = (n: number, zerar: boolean) => {
    const j = jogo.current;
    const nv = nivelBolhas(n);
    j.nivel = nv;
    j.grade = criar(nv.linhas, nv.cores, Math.random, nv.chances);
    j.voo = null;
    j.trilha = [];
    j.particulas = [];
    j.erros = 0;
    j.tiros = 0;
    j.removidas = 0;
    j.bolhasNoInicio = contarCor(j.grade);
    j.fase = 'jogando';
    j.tempo = nv.tempo;
    j.ganhas = [];
    j.totalNoInicio = j.total;
    if (zerar) {
      j.total = 0;
      j.sequencia = 0;
      j.melhorSequencia = 0;
      j.maiorEstouro = 0;
      j.derrubadas = 0;
      j.especiais = 0;
      j.totalNoInicio = 0;
      setHistorico([]);
      setNovoRecorde(false);
    }
    j.atual = sortear();
    j.proxima = sortear();
    sfx.deal();
    atualizarHud({ bonus: 0, bonusTempo: 0, estrelas: 0, motivo: '' });
  };

  useEffect(() => {
    const j = jogo.current;
    j.bolhasNoInicio = contarCor(j.grade);
    j.atual = sortear();
    j.proxima = sortear();
    atualizarHud();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // o laço: anda o voo, o relógio e as partículas, e desenha
  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    let antes = performance.now();
    let sprites: Sprites | null = null;
    let escalaDosSprites = 0;
    // lido já no primeiro quadro e depois a cada segundo (o tema pode mudar com o jogo aberto)
    let tema = { ouro: '#f2c14e', fonte: 'sans-serif', lidoEm: -Infinity };
    let segundoMostrado = Math.ceil(jogo.current.tempo);

    const meio = (casas: { r: number; c: number }[]) => {
      const j = jogo.current;
      return casas.reduce(
        (s, q) => {
          const p = centro(j.grade, q.r, q.c);
          return { x: s.x + p.x / casas.length, y: s.y + p.y / casas.length };
        },
        { x: 0, y: 0 },
      );
    };

    const pousou = (casa: { r: number; c: number }) => {
      const j = jogo.current;
      const atirada = j.atual;
      const res = pousar(j.grade, casa, atirada);
      j.grade = res.grade;
      res.estouradas.forEach((q, i) => {
        const p = centro(j.grade, q.r, q.c);
        const c = corCss(res.valores[i]);
        j.particulas.push({ tipo: 'anel', x: p.x, y: p.y, vx: 0, vy: 0, cor: c, t: 0 });
        for (let k = 0; k < 5; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = 110 + Math.random() * 170;
          j.particulas.push({ tipo: 'caco', x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, cor: c, t: 0, tam: 2.2 + Math.random() * 2.6 });
        }
      });
      for (const r of res.raios) {
        const y = centro(j.grade, r, 0).y;
        j.particulas.push({ tipo: 'raio', x: LARGURA / 2, y, vx: 0, vy: 0, cor: '#ffffff', t: 0 });
      }
      if (res.explodiu) {
        const p = centro(j.grade, casa.r, casa.c);
        j.particulas.push({ tipo: 'onda', x: p.x, y: p.y, vx: 0, vy: 0, cor: '#ffb347', t: 0 });
      }
      for (const q of res.caidas) {
        const p = centro(j.grade, q.casa.r, q.casa.c);
        j.particulas.push({ tipo: 'queda', x: p.x, y: p.y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 160, cor: corCss(q.cor), valor: q.cor, t: 0 });
      }
      if (res.estouradas.length) {
        const todas = [...res.estouradas, ...res.caidas.map((c) => c.casa)];
        const m = meio(todas);
        const texto = res.multiplicador > 1 ? `+${fmt(res.pontos)} ×${res.multiplicador}` : `+${fmt(res.pontos)}`;
        j.particulas.push({ tipo: 'texto', x: m.x, y: m.y, vx: 0, vy: 0, cor: '#ffffff', t: 0, texto });
        j.erros = 0;
        j.total += res.pontos;
        // a missão conta as bolhas de cor (as pedras não estão na conta do "limpe a grade")
        j.removidas += res.valores.filter((v) => corDe(v) != null).length + res.caidas.filter((q) => corDe(q.cor) != null).length;
        j.sequencia++;
        j.melhorSequencia = Math.max(j.melhorSequencia, j.sequencia);
        j.maiorEstouro = Math.max(j.maiorEstouro, todas.length);
        j.derrubadas += res.caidas.length;
        if (res.explodiu || res.raios.length || res.multiplicador > 1 || tipoDe(atirada) === 'curinga') j.especiais++;
        // o que se ganha jogando bem: a sequência dá o curinga, o estouro grande dá a bomba
        if (j.sequencia % SEQUENCIA_DO_CURINGA === 0) j.ganhas.push(CURINGA);
        if (todas.length >= ESTOURO_DA_BOMBA) j.ganhas.push(BOMBA);
        if (res.explodiu) sfx.fx('flame');
        if (res.raios.length) sfx.fx('zap');
        sfx.estourar(res.estouradas.length);
        if (res.caidas.length) sfx.cair(res.caidas.length);
      } else {
        j.sequencia = 0;
        sfx.gruda();
        if (++j.erros >= j.nivel.errosAteDescer) {
          j.erros = 0;
          j.grade = empurrar(j.grade, j.nivel.cores, Math.random, j.nivel.chances);
          sfx.descer();
        }
      }
      if (limpa(j.grade)) {
        // as pedras que sobraram presas desmoronam junto
        j.grade.linhas.forEach((l, r) =>
          l.forEach((v, c) => {
            if (v == null) return;
            const p = centro(j.grade, r, c);
            j.particulas.push({ tipo: 'queda', x: p.x, y: p.y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 120, cor: COR_PEDRA, valor: v, t: 0 });
          }),
        );
        j.grade = { linhas: [], par: j.grade.par };
        // limpou a grade: bônus de nível e do tempo que sobrou, e o servidor decide o prêmio
        const bonus = 500 * j.nivel.n;
        const bonusTempo = Math.ceil(j.tempo) * PONTOS_POR_SEGUNDO;
        j.total += bonus + bonusTempo;
        j.fase = 'concluido';
        sfx.win();
        avisarNivel('bolhas', j.nivel.n);
        mandarRecorde('bolhas', j.total, j.nivel.n);
        const estrelas = estrelasBolhas(j.bolhasNoInicio, j.tiros);
        const feito = { nivel: j.nivel.n, estrelas, pontos: j.total - j.totalNoInicio };
        setHistorico((h) => [...h, feito]);
        atualizarHud({ bonus, bonusTempo, estrelas });
        return;
      }
      if (ultimaLinha(j.grade) >= LINHA_LIMITE) {
        j.fase = 'fim';
        sfx.lose();
        atualizarHud({ motivo: 'linha' });
        return;
      }
      j.atual = j.proxima;
      // a bolha da vez sempre tem uma cor que ainda está na grade
      if (!serve(j.atual)) j.atual = sortear();
      j.proxima = sortear();
      if (!serve(j.proxima)) j.proxima = sortear();
      atualizarHud();
    };

    const bolha = (v: number, x: number, y: number, raio = R, alpha = 1) => {
      if (!sprites) return;
      ctx.globalAlpha = alpha;
      const t = tipoDe(v);
      const img = t === 'pedra' ? sprites.pedra : t === 'bomba' ? sprites.bomba : t === 'curinga' ? sprites.curinga : sprites.cor[corDe(v) ?? 0];
      ctx.drawImage(img, x - raio, y - raio, raio * 2, raio * 2);
      if (t === 'raio' || t === 'estrela') {
        const selo = t === 'raio' ? sprites.raio : sprites.estrela;
        ctx.drawImage(selo, x - raio, y - raio, raio * 2, raio * 2);
      }
      ctx.globalAlpha = 1;
    };

    const quadro = (agora: number) => {
      const dt = Math.min(1 / 30, (agora - antes) / 1000);
      antes = agora;
      const j = jogo.current;

      // o canvas no tamanho de pixels da tela (nítido em qualquer escala)
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const k = escalaRef.current;
      const w = Math.round(LARGURA * k * dpr);
      const h = Math.round(ALTURA * k * dpr);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      if (escalaDosSprites !== k * dpr) {
        escalaDosSprites = k * dpr;
        sprites = fazerSprites(2 * R * k * dpr);
      }
      if (agora - tema.lidoEm > 1000) tema = { ouro: corDoTema(cv, '--gold', '#f2c14e'), fonte: getComputedStyle(cv).fontFamily, lidoEm: agora };

      // pausado, nada anda: nem o voo, nem o relógio, nem as partículas
      if (!j.pausado) {
        if (j.fase === 'jogando') {
          j.tempo = Math.max(0, j.tempo - dt);
          const s = Math.ceil(j.tempo);
          if (s !== segundoMostrado) {
            segundoMostrado = s;
            if (s <= 5 && s > 0) sfx.tick();
            if (j.tempo <= 0 && !j.voo) {
              j.fase = 'fim';
              sfx.lose();
              atualizarHud({ motivo: 'tempo' });
            } else setHud((hh) => ({ ...hh, tempo: j.tempo }));
          }
        }
        if (j.voo) {
          j.trilha.push({ x: j.voo.x, y: j.voo.y });
          if (j.trilha.length > 5) j.trilha.shift();
          const r = avancar(j.grade, j.voo, dt);
          j.voo = r.voo;
          if (r.parou) {
            j.voo = null;
            j.trilha = [];
            pousou(r.parou);
            // o tempo acabou com a bolha no ar: ela pousa, e então acaba (se não tiver limpado)
            if (j.fase === 'jogando' && j.tempo <= 0) {
              j.fase = 'fim';
              sfx.lose();
              atualizarHud({ motivo: 'tempo' });
            }
          }
        }
        for (const p of j.particulas) {
          p.t += dt;
          if (p.tipo === 'queda' || p.tipo === 'caco') {
            p.vy += (p.tipo === 'queda' ? 1400 : 700) * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
          }
        }
        j.particulas = j.particulas.filter((p) =>
          p.tipo === 'anel'
            ? p.t < 0.35
            : p.tipo === 'caco'
              ? p.t < 0.55
              : p.tipo === 'texto'
                ? p.t < 0.9
                : p.tipo === 'raio'
                  ? p.t < 0.4
                  : p.tipo === 'onda'
                    ? p.t < 0.5
                    : p.y < ALTURA + R,
        );
      }

      ctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
      ctx.clearRect(0, 0, LARGURA, ALTURA);

      // as casas da colmeia, fundas no tabuleiro (como as casas das Joias)
      for (let r = 0; r < LINHA_LIMITE; r++)
        for (let c = 0; c < colunasDa(j.grade, r); c++) {
          const p = centro(j.grade, r, c);
          ctx.beginPath();
          ctx.arc(p.x, p.y, R * 0.86, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

      // o teto
      const teto = ctx.createLinearGradient(0, 0, 0, 6);
      teto.addColorStop(0, tema.ouro);
      teto.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = teto;
      ctx.fillRect(0, 0, LARGURA, 6);
      ctx.globalAlpha = 1;

      // a faixa do atirador, embaixo da linha
      ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
      ctx.fillRect(0, Y_LIMITE, LARGURA, ALTURA - Y_LIMITE);

      // a linha: acende e pulsa quando as bolhas chegam perto
      const perigo = ultimaLinha(j.grade) >= LINHA_LIMITE - 3;
      ctx.save();
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = perigo ? 2.5 : 1.5;
      ctx.strokeStyle = perigo ? `rgba(255, 70, 90, ${0.55 + 0.4 * Math.sin(agora / 140)})` : 'rgba(255, 255, 255, 0.22)';
      if (perigo) {
        ctx.shadowColor = '#ff4459';
        ctx.shadowBlur = 10;
      }
      ctx.beginPath();
      ctx.moveTo(0, Y_LIMITE);
      ctx.lineTo(LARGURA, Y_LIMITE);
      ctx.stroke();
      ctx.restore();

      // a grade
      j.grade.linhas.forEach((l, r) =>
        l.forEach((v, c) => {
          if (v == null) return;
          const p = centro(j.grade, r, c);
          bolha(v, p.x, p.y);
        }),
      );

      // a mira (só no primeiro nível): pontinhos até a primeira batida e a bolha-fantasma onde o tiro para
      if (!j.voo && j.fase === 'jogando' && temMira(j.nivel.n)) {
        const pts = mira(j.grade, j.angulo);
        let caminho = 0;
        for (let i = 1; i < pts.length; i++) caminho += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        ctx.fillStyle = corCss(j.atual) === '#ffffff' ? tema.ouro : corCss(j.atual);
        let resto = 12;
        let andado = 0;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          let s = resto;
          for (; s < d; s += 15) {
            const f = s / d;
            ctx.globalAlpha = Math.max(0.12, 0.9 - (0.75 * (andado + s)) / caminho);
            ctx.beginPath();
            ctx.arc(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, 3.2, 0, Math.PI * 2);
            ctx.fill();
          }
          resto = s - d;
          andado += d;
        }
        ctx.globalAlpha = 1;
        const alvo = alvoDaMira(j.grade, j.angulo);
        if (alvo) {
          const p = centro(j.grade, alvo.r, alvo.c);
          bolha(j.atual, p.x, p.y, R, 0.3);
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, R - 1, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // as partículas
      for (const p of j.particulas) {
        if (p.tipo === 'anel') {
          const f = p.t / 0.35;
          ctx.globalAlpha = 1 - f;
          ctx.strokeStyle = p.cor;
          ctx.lineWidth = 3 * (1 - f) + 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, R * (0.8 + f * 0.9), 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.tipo === 'caco') {
          ctx.globalAlpha = 1 - p.t / 0.55;
          ctx.fillStyle = p.cor;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.tam ?? 3, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.tipo === 'queda') {
          bolha(p.valor ?? 0, p.x, p.y, R, Math.max(0, 1 - Math.max(0, p.t - 0.35) * 2.2));
        } else if (p.tipo === 'raio') {
          // o raio: uma faixa de luz que atravessa a linha e some
          const f = p.t / 0.4;
          ctx.save();
          ctx.globalAlpha = 1 - f;
          ctx.shadowColor = '#bfe6ff';
          ctx.shadowBlur = 18;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, p.y - R * 0.35 * (1 - f * 0.6), LARGURA, R * 0.7 * (1 - f * 0.6));
          ctx.restore();
        } else if (p.tipo === 'onda') {
          // a bomba: um anel grosso que cresce até o alcance da explosão
          const f = p.t / 0.5;
          ctx.globalAlpha = 1 - f;
          ctx.strokeStyle = p.cor;
          ctx.lineWidth = 10 * (1 - f) + 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, R * (1 + f * 4.2), 0, Math.PI * 2);
          ctx.stroke();
        } else {
          const f = p.t / 0.9;
          ctx.globalAlpha = f < 0.7 ? 1 : 1 - (f - 0.7) / 0.3;
          ctx.font = `800 ${16 + 4 * Math.min(1, f * 4)}px ${tema.fonte}`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.strokeText(p.texto ?? '', p.x, p.y - f * 38);
          ctx.fillStyle = '#fff';
          ctx.fillText(p.texto ?? '', p.x, p.y - f * 38);
        }
        ctx.globalAlpha = 1;
      }

      // a bolha em voo, com um rastro curto
      if (j.voo) {
        j.trilha.forEach((q, i) => bolha(j.atual, q.x, q.y, R * (0.55 + i * 0.08), 0.08 + i * 0.06));
        bolha(j.atual, j.voo.x, j.voo.y);
      }

      // o lançador: a base com aro na cor do tema, a seta da mira e a bolha da vez
      ctx.save();
      ctx.translate(ATIRADOR.x, ATIRADOR.y);
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = tema.ouro;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (j.fase === 'jogando') {
        ctx.rotate(-j.angulo);
        ctx.fillStyle = tema.ouro;
        ctx.shadowColor = tema.ouro;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(R * 2.45, 0);
        ctx.lineTo(R * 1.55, -R * 0.42);
        ctx.lineTo(R * 1.72, 0);
        ctx.lineTo(R * 1.55, R * 0.42);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      if (!j.voo && j.fase === 'jogando') bolha(j.atual, ATIRADOR.x, ATIRADOR.y, R * 1.12);

      // a próxima bolha, na sua casinha
      ctx.beginPath();
      ctx.arc(PROXIMA.x, PROXIMA.y, R * 1.02, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (j.fase === 'jogando') bolha(j.proxima, PROXIMA.x, PROXIMA.y, R * 0.78);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
      ctx.font = `700 9.5px ${tema.fonte}`;
      ctx.textAlign = 'center';
      ctx.fillText('PRÓXIMA ⇄', PROXIMA.x, PROXIMA.y + R + 14);

      // quantos tiros sem estourar faltam até a grade descer
      const n = j.nivel.errosAteDescer;
      for (let i = 0; i < n; i++) {
        const cheio = i < n - j.erros;
        ctx.beginPath();
        ctx.arc(PIPS.x + i * 14, PIPS.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = cheio ? (n - j.erros <= 1 ? '#ff4459' : 'rgba(255, 255, 255, 0.85)') : 'rgba(255, 255, 255, 0.14)';
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
      ctx.textAlign = 'left';
      ctx.fillText('ATÉ DESCER', PIPS.x - 4, PIPS.y + R + 4);

      raf = requestAnimationFrame(quadro);
    };
    raf = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // acabou: guarda o recorde
  useEffect(() => {
    if (hud.fase !== 'fim') return;
    // vai sempre: a conta pode ter um recorde menor que o deste aparelho
    gravarRecorde('bolhas', hud.total, hud.nivel);
    if (hud.total > recorde) {
      setRecorde(hud.total);
      setNovoRecorde(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hud.fase]);

  const ponto = (e: { clientX: number; clientY: number }) => {
    const box = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - box.left) / box.width) * LARGURA, y: ((e.clientY - box.top) / box.height) * ALTURA };
  };
  const trocar = () => {
    const j = jogo.current;
    if (j.fase !== 'jogando' || j.voo || j.pausado) return;
    [j.atual, j.proxima] = [j.proxima, j.atual];
    sfx.hover();
  };
  const disparar = () => {
    const j = jogo.current;
    if (j.voo || j.fase !== 'jogando' || j.pausado || j.tempo <= 0) return;
    j.voo = atirar(j.angulo);
    j.tiros++;
    sfx.tiro();
  };

  // teclado: setas miram, espaço atira, X troca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const j = jogo.current;
      if (j.pausado) return;
      if (e.key === 'ArrowLeft') j.angulo = Math.min(Math.PI - 0.14, j.angulo + 0.04);
      else if (e.key === 'ArrowRight') j.angulo = Math.max(0.14, j.angulo - 0.04);
      else if (e.key === ' ') disparar();
      else if (e.key.toLowerCase() === 'x') trocar();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nivel = jogo.current.nivel;
  return (
    <div className="mj-jogo mj-bolhas" ref={raiz}>
      <aside className="panel mj-lado">
        <NivelMedalha nivel={hud.nivel} />
        <div className="mj-objetivos">
          <small>Missão do nível</small>
          <Objetivo icone={<Icone nome="bolha" size={38} />} texto="Limpe a grade" feito={hud.removidas} alvo={hud.removidas + hud.restantes} />
        </div>
        <div className="mj-destaques">
          <RelogioDoNivel segundos={hud.tempo} total={nivel.tempo} />
          <Destaque icone="alvo" rotulo="Tiros" valor={hud.tiros} sub={`${nivel.errosAteDescer - hud.erros} erros até descer`} alerta={nivel.errosAteDescer - hud.erros <= 1} />
          <Destaque
            icone="fogo"
            rotulo="Sequência"
            valor={hud.sequencia > 1 ? `×${hud.sequencia}` : hud.sequencia}
            sub={`melhor: ${hud.melhorSequencia}`}
            pulso={hud.sequencia > 1 ? hud.sequencia : undefined}
          />
          <Destaque icone="combo" rotulo="Maior estouro" valor={hud.maiorEstouro} sub={`${hud.derrubadas} derrubadas`} pulso={hud.maiorEstouro} />
        </div>
        <div className="mj-cores-nivel">
          <small>Cores neste nível</small>
          <span>
            {PALETA.slice(0, nivel.cores).map((c) => (
              <i key={c} style={{ background: c }} />
            ))}
          </span>
        </div>
        <p className="muted small mj-ajuda">
          Três ou mais da mesma cor estouram; o que ficar pendurado cai junto. Setas miram, espaço atira, X troca, P pausa.
          {temMira(nivel.n) ? ' A mira pontilhada só aparece neste primeiro nível.' : ''}
        </p>
      </aside>

      <div className="mj-centro">
        <div className="mj-moldura">
          <div className="mj-tabuleiro bolhas" style={{ width: LARGURA * escala, height: ALTURA * escala }}>
            <canvas
              ref={canvas}
              className="mj-canvas"
              style={{ width: LARGURA * escala, height: ALTURA * escala }}
              onPointerMove={(e) => {
                if (jogo.current.pausado) return;
                const p = ponto(e);
                jogo.current.angulo = anguloPara(p.x, p.y);
              }}
              onPointerDown={(e) => {
                if (jogo.current.pausado) return;
                const p = ponto(e);
                if (Math.hypot(p.x - PROXIMA.x, p.y - PROXIMA.y) < R * 1.4) trocar();
                else {
                  jogo.current.angulo = anguloPara(p.x, p.y);
                  disparar();
                }
              }}
            />
            {hud.fase === 'jogando' && <FaixaDoNivel nivel={hud.nivel} />}
            <AnimatePresence>{pausa.pausado && <TelaDePausa key="pausa" expirou={pausa.expirou} onContinuar={pausa.continuar} />}</AnimatePresence>
          </div>
        </div>
      </div>

      <PainelPlacar
        total={hud.total}
        recorde={recorde}
        estrelas={hud.fase === 'jogando' ? estrelasBolhas(jogo.current.bolhasNoInicio, hud.tiros) : null}
        estrelasRotulo="Estrelas (pelos tiros)"
        historico={historico}
        legenda={
        <div className="mj-legenda">
          <small>Bolhas especiais</small>
          {legendaDo(nivel).map((e) => (
            <span key={e.id} className="mj-legenda-item">
              <i className={`mj-esp ${e.id}`} />
              <b>{e.nome}</b> {e.texto}
            </span>
          ))}
        </div>
        }
      >
        <div className="mj-botoes">
          <BotaoPausa onClick={pausa.pausar} disabled={hud.fase !== 'jogando' || pausa.pausado} />
          <button className="btn btn-ghost small" onClick={() => montar(1, true)}>
            ↻ Recomeçar do nível 1
          </button>
        </div>
      </PainelPlacar>

      <AnimatePresence>
        {hud.fase === 'concluido' && (
          <QuadroNivel
            key={`n${hud.nivel}`}
            jogo="bolhas"
            nivel={hud.nivel}
            estrelas={hud.estrelas}
            linhas={[
              { rotulo: 'Tiros', valor: String(hud.tiros) },
              { rotulo: 'Bônus do nível', valor: `+${fmt(hud.bonus)}` },
              { rotulo: 'Tempo que sobrou', valor: `+${fmt(hud.bonusTempo)}` },
              { rotulo: 'Total da partida', valor: fmt(hud.total) },
            ]}
            onProximo={() => montar(hud.nivel + 1, false)}
          />
        )}
        {hud.fase === 'fim' && (
          <QuadroFim
            key="fim"
            titulo={hud.motivo === 'tempo' ? 'O tempo acabou' : 'As bolhas chegaram'}
            total={hud.total}
            nivel={hud.nivel}
            novoRecorde={novoRecorde}
            onDeNovo={() => montar(1, true)}
            onSair={onSair}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
