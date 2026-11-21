/**
 * Os cosméticos na mesa 3D: o verso das cartas, as fichas e o feltro saem dos mesmos estilos
 * (shared/styles.ts) que a mesa 2D desenha — e, onde dá, do mesmo desenho.
 *
 * O verso da carta e a face da ficha são os componentes SVG de sempre (src/render/CardArt.tsx e
 * src/render/Chip.tsx), transformados em imagem e postos como textura: um verso criado no Estúdio
 * aparece na carta 3D igual ao que aparece na carta 2D. O feltro é pintado num canvas com as cores,
 * a estampa (o mesmo `<pattern>` da mesa 2D), a moldura e o logotipo do estilo da mesa.
 *
 * Tudo fica guardado por estilo: trocar de dealer troca de material, não refaz a textura.
 */
import * as THREE from 'three';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { boardSlot, CARD_W } from '../game/layout';
import { CardBackArt, CardFaceArt } from '../render/CardArt';
import { ChipFace } from '../render/Chip';
import { ESTAMPA_DO_FELTRO, FeltPattern } from '../render/TableFelt';
import type { Card } from '../../shared/cards';
import type { CardBackStyle, CardFaceStyle, ChipStyle, TableStyle } from '../../shared/styles';
import { shade } from '../util/color';
import { MEIO, METRO_POR_PX, RAIO, TRILHO, planoParaMundo } from './geometria';

/** Uma chave curta para um estilo (o mesmo estilo dá a mesma chave). */
export function chaveDoEstilo(st: object): string {
  const s = JSON.stringify(st);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${(st as { id?: string }).id ?? ''}:${s.length}:${(h >>> 0).toString(36)}`;
}

/** Um elemento SVG do React como texto de arquivo SVG (com o xmlns que a imagem exige). */
function svgDe(el: ReactElement): string {
  return renderToStaticMarkup(el).replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
}

function carregarSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((pronto, falhou) => {
    const img = new Image();
    img.onload = () => pronto(img);
    img.onerror = () => falhou(new Error('svg não carregou'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

/**
 * Uma textura feita de um SVG: nasce na cor de fundo dada (para não aparecer branca no primeiro
 * quadro) e recebe o desenho quando a imagem termina de carregar.
 */
function texturaDeSvg(svg: string, l: number, a: number, fundo: string, transparente = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = l;
  canvas.height = a;
  const ctx = canvas.getContext('2d')!;
  if (!transparente) {
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, l, a);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  carregarSvg(svg).then(
    (img) => {
      ctx.clearRect(0, 0, l, a);
      ctx.drawImage(img, 0, 0, l, a);
      tex.needsUpdate = true;
    },
    () => {},
  );
  return tex;
}

// ─────────────────────────────── as cartas ───────────────────────────────

const papel = new THREE.MeshStandardMaterial({ color: 0xf6f1ea, roughness: 0.6 });
const versos = new Map<string, THREE.MeshStandardMaterial>();
const frentes = new Map<string, THREE.MeshStandardMaterial>();

/** O material do verso de uma carta: o desenho do estilo (com os cantos arredondados vazados). */
export function materialDoVerso(st: CardBackStyle): THREE.MeshStandardMaterial {
  const k = chaveDoEstilo(st);
  let m = versos.get(k);
  if (!m) {
    const svg = svgDe(createElement('svg', { viewBox: '0 0 250 350', width: 256, height: 358 }, createElement(CardBackArt, { style: st })));
    m = new THREE.MeshStandardMaterial({ map: texturaDeSvg(svg, 256, 358, st.base, true), roughness: 0.55, alphaTest: 0.5 });
    versos.set(k, m);
  }
  return m;
}

/** A frente de uma carta fechada (só aparece de relance, quando alguém a levanta para espiar): a cor do papel do estilo. */
export function materialDaFrente(st: CardFaceStyle): THREE.MeshStandardMaterial {
  let m = frentes.get(st.bg);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: st.bg, roughness: 0.55 });
    frentes.set(st.bg, m);
  }
  return m;
}

/**
 * Os seis materiais de uma carta (a caixa fina): as beiradas de papel, o verso em cima (+y, para
 * cima quando a carta está de costas) e a frente embaixo.
 */
export function materiaisDaCarta(verso: CardBackStyle, frente: CardFaceStyle): THREE.Material[] {
  return [papel, papel, materialDoVerso(verso), materialDaFrente(frente), papel, papel];
}

const abertas = new Map<string, THREE.MeshBasicMaterial>();

/**
 * Os materiais de uma carta que o dealer abre: o verso em cima e, embaixo, a face de verdade — o
 * mesmo desenho da carta 2D que a substitui quando ela pousa (e, como ela, sem a luz da cena: as
 * cores são as do desenho, para a troca de uma pela outra não aparecer).
 */
export function materiaisDaCartaAberta(carta: Card, verso: CardBackStyle, frente: CardFaceStyle): THREE.Material[] {
  const k = `${chaveDoEstilo(frente)}#${carta.r}${carta.s}`;
  let m = abertas.get(k);
  if (!m) {
    const svg = svgDe(createElement('svg', { viewBox: '0 0 250 350', width: 256, height: 358 }, createElement(CardFaceArt, { card: carta, style: frente })));
    m = new THREE.MeshBasicMaterial({ map: texturaDeSvg(svg, 256, 358, frente.bg, true), alphaTest: 0.5 });
    abertas.set(k, m);
  }
  return [papel, papel, materialDoVerso(verso), m, papel, papel];
}

/** O baralho: o verso em cima, papel em volta. */
export function materiaisDoBaralho(verso: CardBackStyle): THREE.Material[] {
  return [papel, papel, materialDoVerso(verso), papel, papel, papel];
}

// ─────────────────────────────── as fichas ───────────────────────────────

const fichas = new Map<string, THREE.Material[]>();

/**
 * A lateral da ficha: a cor do valor com os blocos, listras ou bolinhas da borda, dando a volta —
 * no mesmo ângulo em que a face os desenha (src/render/Chip.tsx), para o bloco que desce pela quina
 * continuar na lateral.
 */
function texturaDaLateral(st: ChipStyle, ti: number): THREE.CanvasTexture {
  const tier = st.tiers[ti] ?? st.tiers[0];
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = tier.base;
  ctx.fillRect(0, 0, 256, 16);
  const n = st.edgeCount;
  const seg = 256 / n;
  ctx.fillStyle = tier.edge;
  for (let i = 0; i < n; i++) {
    const x = i * seg;
    if (st.edgePattern === 'blocks') ctx.fillRect(x, 2, seg * 0.42, 12);
    else if (st.edgePattern === 'stripes') {
      ctx.fillRect(x, 0, seg * 0.14, 16);
      ctx.fillRect(x + seg * 0.7, 0, seg * 0.14, 16);
    } else if (st.edgePattern === 'dots') {
      // (a bolinha fica no começo do gomo, como na face: a primeira se divide entre as duas pontas da volta)
      for (const cx of i === 0 ? [0, 256] : [x]) {
        ctx.beginPath();
        ctx.arc(cx, 8, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // a quina de cima e a de baixo, um pouco mais escuras: as fichas da pilha se separam
  ctx.fillStyle = shade(tier.base, -0.45);
  ctx.fillRect(0, 0, 256, 1);
  ctx.fillRect(0, 15, 256, 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Os três materiais de uma ficha de um valor (a lateral, o topo e o fundo), no estilo dado. */
export function materiaisDaFicha(st: ChipStyle, ti: number): THREE.Material[] {
  const k = `${chaveDoEstilo(st)}#${ti}`;
  let m = fichas.get(k);
  if (!m) {
    const tier = st.tiers[ti] ?? st.tiers[0];
    const svg = svgDe(createElement('svg', { viewBox: '-50 -50 100 100', width: 256, height: 256 }, createElement(ChipFace, { ti, st })));
    // (lisa o bastante para o relevo — o degrau do miolo, a quina — pegar um fio de brilho da luz)
    const face = new THREE.MeshStandardMaterial({ map: texturaDeSvg(svg, 256, 256, tier.base), roughness: 0.36 });
    const lateral = new THREE.MeshStandardMaterial({ map: texturaDaLateral(st, ti), roughness: 0.42 });
    m = [lateral, face, face];
    fichas.set(k, m);
  }
  return m;
}

// ─────────────────────────────── o feltro ───────────────────────────────

/** O feltro vai até a beirada de couro: meia largura e meio comprimento (metros). */
export const FELTRO = { meioX: MEIO + RAIO - TRILHO, meioZ: RAIO - TRILHO };
/** Quantos pixels do canvas do feltro há num metro. */
const PX_DO_FELTRO = 2048 / (2 * FELTRO.meioX);
/**
 * As estampas foram desenhadas para o feltro 2D (uns 1340 px de largura no plano antigo): no 3D
 * elas ficam na mesma proporção do feltro, não do pixel.
 */
const ESCALA_DA_ESTAMPA = 2048 / 1336;

/** O contorno do estádio no canvas do feltro, recuado `dentro` metros da beirada do feltro. */
function caminhoDoEstadio(ctx: CanvasRenderingContext2D, dentro = 0) {
  ctx.beginPath();
  tracarEstadio(ctx, dentro);
}
/** O mesmo contorno, acrescentado ao caminho em curso (para somar contornos: uma faixa é o de fora menos o de dentro). */
function tracarEstadio(ctx: CanvasRenderingContext2D, dentro = 0) {
  const r = (FELTRO.meioZ - dentro) * PX_DO_FELTRO;
  const cx = FELTRO.meioX * PX_DO_FELTRO;
  const cy = FELTRO.meioZ * PX_DO_FELTRO;
  const m = MEIO * PX_DO_FELTRO;
  ctx.moveTo(cx - m, cy - r);
  ctx.lineTo(cx + m, cy - r);
  ctx.arc(cx + m, cy, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(cx - m, cy + r);
  ctx.arc(cx - m, cy, r, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.closePath();
}

/** Um ponto do tampo (metros) no canvas do feltro. */
const noFeltro = (x: number, z: number) => ({ x: (x + FELTRO.meioX) * PX_DO_FELTRO, y: (z + FELTRO.meioZ) * PX_DO_FELTRO });

const feltros = new Map<string, THREE.CanvasTexture>();
/** O canvas de apoio em que a estampa é recortada (um só, reaproveitado). */
let soEstampa: HTMLCanvasElement | null = null;

/**
 * A textura do feltro: o degradê do estilo (mais claro no meio), a estampa, a sombra perto da
 * beirada, a moldura na cor de destaque, a linha das apostas, os lugares das cinco cartas da mesa e
 * o logotipo.
 */
export function texturaDoFeltro(st: TableStyle): THREE.CanvasTexture {
  const k = chaveDoEstilo(st);
  const ja = feltros.get(k);
  if (ja) return ja;
  const L = 2048;
  const A = Math.round(2 * FELTRO.meioZ * PX_DO_FELTRO);
  const canvas = document.createElement('canvas');
  canvas.width = L;
  canvas.height = A;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  let estampa: HTMLImageElement | null = null;

  const pintar = () => {
    ctx.save();
    ctx.clearRect(0, 0, L, A);
    caminhoDoEstadio(ctx);
    ctx.clip();
    // o degradê: claro no meio, o feltro, e escuro perto da beirada
    ctx.save();
    ctx.translate(L / 2, A * 0.48);
    ctx.scale(1, (A / L) * 1.25);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L * 0.6);
    g.addColorStop(0, st.feltLight);
    g.addColorStop(0.62, st.felt);
    g.addColorStop(1, shade(st.felt, -0.38));
    ctx.fillStyle = g;
    ctx.fillRect(-L, -L, 2 * L, 2 * L);
    ctx.restore();
    if (estampa) {
      // A estampa só nos pontos-chave (veja ESTAMPA_DO_FELTRO): uma faixa rente à beirada e um medalhão
      // no centro, atrás do pote e das cartas da mesa; o resto do feltro fica liso.
      const faixa = ESTAMPA_DO_FELTRO.faixa * METRO_POR_PX;
      const m = ESTAMPA_DO_FELTRO.medalhao;
      const w = planoParaMundo({ x: m.x, y: m.y });
      const meio = noFeltro(w.x, w.z);
      const [rx, ry] = [m.rx * METRO_POR_PX * PX_DO_FELTRO, m.ry * METRO_POR_PX * PX_DO_FELTRO];
      const so = (soEstampa ??= document.createElement('canvas'));
      so.width = L;
      so.height = A;
      const c2 = so.getContext('2d')!;
      c2.drawImage(estampa, 0, 0, L, A);
      c2.globalCompositeOperation = 'destination-in';
      c2.beginPath();
      tracarEstadio(c2, 0);
      tracarEstadio(c2, faixa);
      c2.moveTo(meio.x + rx, meio.y);
      c2.ellipse(meio.x, meio.y, rx, ry, 0, 0, Math.PI * 2);
      c2.fill('evenodd');
      ctx.globalAlpha = st.pattern === 'damask' ? ESTAMPA_DO_FELTRO.forcaDoDamasco : ESTAMPA_DO_FELTRO.forca;
      ctx.drawImage(so, 0, 0);
      // um filete fecha a faixa por dentro, e dois cercam o medalhão
      ctx.strokeStyle = ESTAMPA_DO_FELTRO.cor;
      ctx.globalAlpha = ESTAMPA_DO_FELTRO.filete;
      ctx.lineWidth = 0.002 * PX_DO_FELTRO;
      caminhoDoEstadio(ctx, faixa);
      ctx.stroke();
      ctx.globalAlpha = ESTAMPA_DO_FELTRO.filete;
      ctx.lineWidth = 0.0022 * PX_DO_FELTRO;
      ctx.beginPath();
      ctx.ellipse(meio.x, meio.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = ESTAMPA_DO_FELTRO.filete * 0.55;
      ctx.lineWidth = 0.0012 * PX_DO_FELTRO;
      ctx.beginPath();
      ctx.ellipse(meio.x, meio.y, rx + 0.011 * PX_DO_FELTRO, ry + 0.011 * PX_DO_FELTRO, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // a sombra rente à beirada
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 0.03 * PX_DO_FELTRO;
    caminhoDoEstadio(ctx);
    ctx.stroke();
    // a linha das apostas, tracejada, na cor da estampa
    ctx.strokeStyle = st.patternColor;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 0.004 * PX_DO_FELTRO;
    ctx.setLineDash([0.004 * PX_DO_FELTRO, 0.016 * PX_DO_FELTRO]);
    ctx.lineCap = 'round';
    caminhoDoEstadio(ctx, 0.2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // os lugares das cinco cartas da mesa (onde as cartas abertas 2D pousam)
    for (let i = 0; i < 5; i++) {
      const w = planoParaMundo(boardSlot(i));
      const c = noFeltro(w.x, w.z);
      const lw = CARD_W * METRO_POR_PX * PX_DO_FELTRO;
      const lh = lw * 1.4;
      ctx.beginPath();
      ctx.roundRect(c.x - lw / 2, c.y - lh / 2, lw, lh, lw * 0.1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // o logotipo, do lado de lá (de pé para quem joga)
    if (st.logoText) {
      const p = noFeltro(0, -0.3);
      ctx.font = `700 ${Math.round(0.05 * PX_DO_FELTRO)}px Cinzel, serif`;
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.round(0.016 * PX_DO_FELTRO)}px`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = st.logoColor;
      ctx.fillText(st.logoText, p.x, p.y);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // a moldura na cor de destaque, por cima de tudo, logo dentro da beirada de couro
    ctx.strokeStyle = st.railAccent;
    ctx.lineWidth = 0.009 * PX_DO_FELTRO;
    caminhoDoEstadio(ctx, 0.008);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 2;
    caminhoDoEstadio(ctx, 0.0035);
    ctx.stroke();
    tex.needsUpdate = true;
  };
  pintar();

  // a estampa (o mesmo `<pattern>` da mesa 2D) e a fonte do logotipo chegam depois: pinta de novo
  const esperas: Promise<unknown>[] = [];
  if (st.pattern !== 'none') {
    const vw = Math.round(L / ESCALA_DA_ESTAMPA);
    const vh = Math.round(A / ESCALA_DA_ESTAMPA);
    const svg = svgDe(
      createElement(
        'svg',
        { viewBox: `0 0 ${vw} ${vh}`, width: L, height: A },
        // (a estampa é da cor do feltro, um pouco mais escura: preto, bem transparente — veja ESTAMPA_DO_FELTRO)
        createElement('defs', null, createElement(FeltPattern, { id: 'p', pattern: st.pattern, color: ESTAMPA_DO_FELTRO.cor })),
        createElement('rect', { width: vw, height: vh, fill: 'url(#p)' }),
      ),
    );
    esperas.push(carregarSvg(svg).then((img) => (estampa = img), () => {}));
  }
  if (typeof document !== 'undefined' && document.fonts?.load) esperas.push(document.fonts.load(`700 50px Cinzel`).catch(() => {}));
  if (esperas.length) void Promise.all(esperas).then(pintar);
  feltros.set(k, tex);
  return tex;
}

// ─────────────────────────────── o botão do dealer ───────────────────────────────

let botao: THREE.Material[] | null = null;

/** O botão do dealer: um disco branco com o "D", como o 2D. */
export function materiaisDoBotao(): THREE.Material[] {
  if (botao) return botao;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(54, 50, 6, 64, 64, 64);
  g.addColorStop(0, '#fffdf3');
  g.addColorStop(1, '#e8dcb6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#c9a13b';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#2a2140';
  ctx.font = '900 70px Cinzel, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('D', 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const topo = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 });
  const lado = new THREE.MeshStandardMaterial({ color: 0xc9a13b, roughness: 0.4, metalness: 0.3 });
  botao = [lado, topo, topo];
  return botao;
}
