import { memo, useId, type ReactNode } from 'react';
import { AURA_IDS, AURA_SLOT, DEFAULT_AURA, sanitizeAuras, type AuraId, type AuraSlot } from '../../shared/styles';
import { cleanId } from '../util/color';
import { SuitGlyph, starPath } from './suits';
import { ondaDe } from './flame';

/* =====================================================================
 * Auras — o que arde, gira ou se abre em volta do personagem.
 *
 * O menu sempre teve um brilho discreto atrás da ilustração. Ele continua aqui, com nome
 * (`brilho`) e de graça; as outras auras são peças de coleção que saem das roletas.
 *
 * Cada aura é uma entrada em AURAS: nome, cores, a **forma** e os parâmetros dela. Uma forma
 * atende várias auras — os quatro círculos escritos mudam só a escrita e a cor, as três asas mudam
 * o material sobre a mesma silhueta —, que é o que permite ter dezessete auras sem dezessete
 * desenhos diferentes.
 *
 * Dá para usar **várias ao mesmo tempo**, uma por lugar (a regra está em AURA_SLOT, em
 * shared/styles.ts): um círculo, uma auréola, um par de asas, um fogo no chão…
 *
 * Para criar uma aura nova:
 *   1. acrescente o id em AURA_IDS e o lugar dela em AURA_SLOT (shared/styles.ts);
 *   2. acrescente a entrada aqui, com nome, descrição, cores, forma e recorte da vitrine;
 *   3. se a forma for nova, escreva o desenho dela neste arquivo.
 * O teste em aura.test.ts garante que todo id tenha entrada.
 *
 * ## O espaço do desenho
 *
 * Tudo é desenhado num quadrado `0 0 100 100` que tem a **altura do personagem**: o alto da
 * cabeça fica por volta de y=1, o rosto em 7, os ombros em 30, a cintura em 50 e os pés em 98. O
 * corpo ocupa mais ou menos x de 33 a 67, então o que passa disso é o que aparece de fora da
 * silhueta — e é justamente o que se vê.
 *
 * ## Os dois planos
 *
 * Uma aura é desenhada em **dois** SVGs: um atrás da ilustração e outro na frente dela. Quase tudo
 * mora atrás; na frente fica só o que precisa passar pela frente do corpo para ter volume — a
 * metade de perto da órbita, a metade de baixo da auréola deitada, as línguas de fogo baixas
 * diante dos pés, as luzes do fogo-fátuo que passam pela frente. Sem a frente, uma órbita vira um anel pintado
 * na parede atrás da pessoa; com ela, as figuras dão a volta **em** alguém.
 * ===================================================================== */

/** A forma de uma aura. Cada uma é um desenho neste arquivo. */
export type AuraShape = 'brilho' | 'poeira' | 'circulo' | 'aureola' | 'orbita' | 'espadas' | 'labaredas' | 'fatuo' | 'asas';

/** Atrás da ilustração, ou na frente dela (veja "Os dois planos", acima). */
export type Plano = 'tras' | 'frente';

/** A escrita de um círculo mágico. */
export interface AuraTexto {
  /** A frase que corre pelo aro. Ela é esticada para fechar a volta exata. */
  linha: string;
  /** A família da letra (as fontes que o jogo carrega em src/main.tsx). */
  fonte: string;
  tamanho: number;
  peso: number;
  /** A estrela do meio: quantas pontas, e o raio de dentro em relação ao de fora. */
  estrela: [pontas: number, razao: number];
  /** Os oito sinais do anel do meio, na mesma escrita do aro. */
  glifos: string[];
}

export interface Aura {
  id: AuraId;
  name: string;
  /** Uma linha sobre ela, do jeito que o Estúdio e a Galeria mostram. */
  description: string;
  /**
   * Duas cores: a de fora (o corpo da aura) e a de dentro (o realce).
   *
   * O brilho e a Poeira de Luz são a exceção — eles se pintam com a cor do **personagem**, e é
   * por isso que sempre combinaram com quem está na frente deles.
   */
  colors: [string, string];
  /** Uma terceira cor, para o que precisa de sombra própria: a camada de fora do fogo. */
  sombra?: string;
  shape: AuraShape;
  /** O lugar que ela ocupa (vem de AURA_SLOT, em shared/styles.ts). */
  slot: AuraSlot;
  texto?: AuraTexto;
  aureola?: 'anel' | 'raios' | 'espinhos';
  figura?: 'naipe' | 'shuriken';
  asa?: 'anjo' | 'morcego' | 'dragao';
  /** Labaredas: o quanto elas sobem (1 = a altura do personagem inteiro). */
  altura?: number;
  /**
   * O recorte da vitrine: `[x, y, lado]` de um quadrado dentro do desenho.
   *
   * Sem ninguém na frente, uma auréola é um anelzinho perdido no alto de uma caixa vazia. O recorte
   * enquadra a peça — a auréola de perto, as asas inteiras, o fogo pela base.
   */
  vitrine: [number, number, number];
}

/** Como cada lugar se chama na tela. */
export const SLOT_LABEL: Record<AuraSlot, string> = {
  luz: 'Luz',
  circulo: 'Círculo',
  leque: 'Arsenal',
  asas: 'Asas',
  chao: 'Chão',
  cabeca: 'Cabeça',
  orbita: 'Órbita',
};

// ------------------------------------------------------------------ geometria

const n = (v: number) => v.toFixed(2);

/** Números pseudoaleatórios estáveis: a mesma aura cai sempre com as mesmas faíscas no mesmo lugar. */
function rnd(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Um ponto em coordenadas polares, com o ângulo em graus e zero apontando para a direita. */
function pt(cx: number, cy: number, r: number, graus: number): [number, number] {
  const a = (graus * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** O ponto a uma fração `t` do caminho entre dois pontos. */
const lerp = ([ax, ay]: [number, number], [bx, by]: [number, number], t: number): [number, number] => [ax + (bx - ax) * t, ay + (by - ay) * t];

/** Um anel para a letra correr por cima: começa à esquerda e sobe pela direita, no sentido horário. */
function aro(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)} a ${n(r)} ${n(r)} 0 1 1 ${n(r * 2)} 0 a ${n(r)} ${n(r)} 0 1 1 ${n(-r * 2)} 0`;
}

/** Uma elipse como caminho, começando na ponta da direita e descendo primeiro (a metade de perto). */
function elipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${n(cx + rx)} ${n(cy)} A ${n(rx)} ${n(ry)} 0 1 1 ${n(cx - rx)} ${n(cy)} A ${n(rx)} ${n(ry)} 0 1 1 ${n(cx + rx)} ${n(cy)}`;
}

/** Um polígono regular de `lados` lados em volta da origem, com uma ponta para cima. */
function poligono(lados: number, r: number): string {
  return (
    Array.from({ length: lados }, (_, i) => {
      const [x, y] = pt(0, 0, r, -90 + (360 / lados) * i);
      return `${i ? 'L' : 'M'}${n(x)} ${n(y)}`;
    }).join(' ') + ' Z'
  );
}

/** Uma rotação SMIL sem fim em volta de (cx, cy). Negativo em `volta` gira ao contrário. */
function Gira({ cx = 0, cy = 0, s, volta = 360 }: { cx?: number; cy?: number; s: number; volta?: number }) {
  return <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${cy}`} to={`${volta} ${cx} ${cy}`} dur={`${s}s`} repeatCount="indefinite" />;
}

/**
 * Metade de um desenho: a de longe (acima de `y`) no plano de trás, a de perto no da frente.
 *
 * É o que dá volume ao que é deitado — a auréola e o trilho da órbita. O mesmo
 * desenho entra nos dois planos, e cada plano recorta a sua metade.
 */
function Metade({ id, y, plano, children }: { id: string; y: number; plano: Plano; children: ReactNode }) {
  const cid = `${id}-${plano}`;
  return (
    <>
      <defs>
        <clipPath id={cid}>
          {plano === 'tras' ? <rect x={-100} y={-100} width={300} height={100 + y} /> : <rect x={-100} y={y} width={300} height={300} />}
        </clipPath>
      </defs>
      <g clipPath={`url(#${cid})`}>{children}</g>
    </>
  );
}

/**
 * Faíscas subindo e sumindo — a poeira de luz, as brasas, as cinzas.
 *
 * Cada uma nasce num ponto sorteado da área, sobe `sobe` unidades derivando para o lado, acende no
 * primeiro terço do caminho e apaga no fim. Os tempos são sorteados também: faísca que sobe em coro
 * lê como chuva ao contrário.
 */
function Faiscas({
  semente,
  quantas,
  cor,
  area: [x0, x1, y0, y1],
  sobe,
  dur,
  raio,
  deriva = 0,
}: {
  semente: number;
  quantas: number;
  cor: string;
  area: [number, number, number, number];
  sobe: number;
  dur: number;
  raio: number;
  deriva?: number;
}) {
  const r = rnd(semente);
  return (
    <g>
      {Array.from({ length: quantas }, (_, i) => {
        const x = x0 + r() * (x1 - x0);
        const y = y0 + r() * (y1 - y0);
        const d = dur * (0.7 + r() * 0.6);
        const tempo = `${d.toFixed(2)}s`;
        const inicio = `-${(r() * d).toFixed(2)}s`;
        const dx = (r() - 0.5) * deriva;
        return (
          <circle key={i} cx={n(x)} cy={n(y)} r={n(raio * (0.6 + r() * 0.8))} fill={cor} opacity={0}>
            <animate attributeName="cy" values={`${n(y)};${n(y - sobe)}`} dur={tempo} begin={inicio} repeatCount="indefinite" />
            {dx !== 0 && <animate attributeName="cx" values={`${n(x)};${n(x + dx)}`} dur={tempo} begin={inicio} repeatCount="indefinite" />}
            <animate attributeName="opacity" values="0;1;0" keyTimes="0;0.3;1" dur={tempo} begin={inicio} repeatCount="indefinite" />
          </circle>
        );
      })}
    </g>
  );
}

/** Uma cintilação: a estrelinha de quatro pontas que acende e apaga num lugar só. */
function Centelha({ x, y, r, cor, atraso }: { x: number; y: number; r: number; cor: string; atraso: number }) {
  return (
    <g transform={`translate(${n(x)} ${n(y)})`}>
      <path d={starPath(r, r * 0.22, 4)} fill={cor}>
        <animateTransform attributeName="transform" type="scale" values="0.2;1;0.2" dur="2.4s" begin={`-${atraso}s`} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;0" dur="2.4s" begin={`-${atraso}s`} repeatCount="indefinite" />
      </path>
    </g>
  );
}

/**
 * Uma língua de fogo em três temperaturas, com a silhueta da carta em chamas (src/render/flame.ts).
 *
 * As três camadas usam a **mesma** fase e o mesmo tempo: sobem e voltam juntas, como as
 * temperaturas de uma chama só. Separadas, cada uma pendia para um lado.
 */
function Lingua({ x, y0, h, w, fase, tempo, cores }: { x: number; y0: number; h: number; w: number; fase: number; tempo: number; cores: [string, string, string] }) {
  const camadas = [
    { cor: cores[0], hh: h, ww: w * 1.12, blur: 1.5, op: 0.6 },
    { cor: cores[1], hh: h * 0.8, ww: w * 0.84, blur: 0.8, op: 0.86 },
    { cor: cores[2], hh: h * 0.5, ww: w * 0.5, blur: 0.4, op: 0.95 },
  ];
  return (
    <g>
      {camadas.map((c, i) => {
        const q = ondaDe(x, y0, c.hh, c.ww, c.hh * 0.13, fase);
        return (
          <path key={i} fill={c.cor} opacity={c.op} style={{ filter: `blur(${c.blur}px)` }} d={q.slice(0, q.indexOf(';'))}>
            <animate attributeName="d" values={q} dur={`${tempo}s`} calcMode="linear" repeatCount="indefinite" />
          </path>
        );
      })}
    </g>
  );
}

// ------------------------------------------------------------------ luz

/**
 * O brilho de sempre, exatamente como o menu o desenhava: uma mancha de luz **parada** na cor do
 * personagem, mais forte na altura do peito e sumindo antes da borda.
 *
 * É o `radial-gradient` que o antigo `.char-glow` tinha, passado para cá sem enfeite nenhum — nem
 * respiração, nem partícula. Ele vem com o jogo; quem quer a luz viva tem a Poeira de Luz.
 */
function Brilho({ cor, uid, plano }: { cor: string; uid: string; plano: Plano }) {
  if (plano === 'frente') return null;
  return (
    <g>
      <defs>
        <radialGradient id={`brilho${uid}`}>
          <stop offset="0" stopColor={cor} stopOpacity="0.53" />
          <stop offset="1" stopColor={cor} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx={50} cy={55} rx={50} ry={50} fill={`url(#brilho${uid})`} />
    </g>
  );
}

/**
 * A Poeira de Luz: o brilho vivo.
 *
 * A mesma cor do personagem, mas a luz respira, tem um miolo mais claro na altura do peito — é o
 * que faz parecer que ela vem de dentro — e poeira de luz subindo devagar.
 */
function PoeiraDeLuz({ cor, uid, plano }: { cor: string; uid: string; plano: Plano }) {
  if (plano === 'frente') return null;
  return (
    <g>
      <defs>
        <radialGradient id={`poeira${uid}`}>
          <stop offset="0" stopColor={cor} stopOpacity="0.62" />
          <stop offset="0.5" stopColor={cor} stopOpacity="0.26" />
          <stop offset="1" stopColor={cor} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`miolo${uid}`}>
          <stop offset="0" stopColor="#fffaf0" stopOpacity="0.4" />
          <stop offset="1" stopColor="#fffaf0" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse className="aura-respira" cx={50} cy={52} rx={48} ry={47} fill={`url(#poeira${uid})`} />
      <ellipse className="aura-respira-lenta" cx={50} cy={38} rx={20} ry={24} fill={`url(#miolo${uid})`} />
      <Faiscas semente={11} quantas={16} cor="#fff6e0" area={[20, 80, 45, 98]} sobe={42} dur={7} raio={0.55} deriva={7} />
    </g>
  );
}

// ------------------------------------------------------------------ círculo

/**
 * O círculo mágico: quatro aros, a escrita correndo, um anel de sinais e a estrela no meio.
 *
 * Cada anel gira no seu tempo e alguns ao contrário: o aro escrito devagar num sentido, os sinais
 * no outro, a estrela quase parada. Duas coisas girando juntas lêem como um disco só; em sentidos
 * opostos, lêem como engrenagens de um mecanismo, que é o que um selo é.
 *
 * A frase é **esticada** para fechar a volta exata (`textLength`), então a última letra encosta na
 * primeira em qualquer escrita — em latim são quarenta letras, em japonês trinta ideogramas.
 *
 * O círculo fica só de pé, atrás do corpo. Ele já teve um reflexo deitado no chão, debaixo dos
 * pés; saiu, e o círculo não desenha nada no plano da frente.
 */
function Circulo({ a, uid, plano }: { a: Aura; uid: string; plano: Plano }) {
  if (plano === 'frente') return null;
  const [fora, dentro] = a.colors;
  const t = a.texto!;
  const [pontas, razao] = t.estrela;
  const marcas = Array.from({ length: 60 }, (_, i) => {
    const [x1, y1] = pt(50, 50, 41, i * 6);
    const [x2, y2] = pt(50, 50, i % 5 === 0 ? 37.9 : 39.4, i * 6);
    return `M${n(x1)} ${n(y1)} L${n(x2)} ${n(y2)}`;
  }).join(' ');
  // o `color` não pinta nada aqui: é o que o halo do CSS lê como `currentColor`
  return (
    <g className="aura-circulo" style={{ color: fora }}>
      <defs>
        <path id={`aro${uid}`} d={aro(50, 50, 35)} />
        <radialGradient id={`disco${uid}`}>
          <stop offset="0" stopColor={dentro} stopOpacity="0.16" />
          <stop offset="0.6" stopColor={fora} stopOpacity="0.06" />
          <stop offset="0.93" stopColor={fora} stopOpacity="0.2" />
          <stop offset="1" stopColor={fora} stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* o disco aceso por dentro, fraco: o selo é luz, não arame */}
      <circle cx={50} cy={50} r={43} fill={`url(#disco${uid})`} />
      <circle cx={50} cy={50} r={41} fill="none" stroke={fora} strokeWidth={1.1} />
      <circle cx={50} cy={50} r={39.4} fill="none" stroke={fora} strokeWidth={0.35} opacity={0.7} />
      <path d={marcas} stroke={fora} strokeWidth={0.45} opacity={0.75} />
      <g>
        <text
          fontFamily={t.fonte}
          fontSize={t.tamanho}
          fontWeight={t.peso}
          fill={fora}
          dominantBaseline="middle"
          textLength={n(2 * Math.PI * 35 * 0.99)}
          lengthAdjust="spacing"
        >
          <textPath href={`#aro${uid}`}>{t.linha}</textPath>
        </text>
        <Gira cx={50} cy={50} s={70} />
      </g>
      <circle cx={50} cy={50} r={31.6} fill="none" stroke={fora} strokeWidth={0.6} opacity={0.85} />
      {/* o anel dos sinais, girando ao contrário */}
      <g>
        <circle cx={50} cy={50} r={27} fill="none" stroke={dentro} strokeWidth={0.3} opacity={0.5} />
        {t.glifos.map((g, i) => {
          const [x, y] = pt(50, 50, 27, -90 + i * 45);
          return (
            <g key={i}>
              <circle cx={n(x)} cy={n(y)} r={3.5} fill={fora} fillOpacity={0.16} stroke={dentro} strokeWidth={0.45} />
              <text x={n(x)} y={n(y)} fontFamily={t.fonte} fontSize={3.7} fontWeight={t.peso} fill={dentro} textAnchor="middle" dominantBaseline="central">
                {g}
                <animate attributeName="opacity" values="0.4;1;0.4" dur="3.2s" begin={`-${(i * 0.4).toFixed(1)}s`} repeatCount="indefinite" />
              </text>
            </g>
          );
        })}
        <Gira cx={50} cy={50} s={100} volta={-360} />
      </g>
      <circle cx={50} cy={50} r={23.4} fill="none" stroke={dentro} strokeWidth={0.5} opacity={0.75} />
      {/* a estrela inscrita no polígono das pontas, e o miolo */}
      <g transform="translate(50 50)">
        <g>
          <path d={poligono(pontas, 23.4)} fill="none" stroke={dentro} strokeWidth={0.35} opacity={0.5} />
          <path d={starPath(23.4, 23.4 * razao, pontas)} fill="none" stroke={dentro} strokeWidth={0.6} opacity={0.85} strokeLinejoin="round" />
          <Gira s={140} />
        </g>
        <circle r={9.5} fill="none" stroke={fora} strokeWidth={0.5} opacity={0.85} />
        <path className="aura-respira" d={starPath(6.2, 6.2 * razao, pontas)} fill={dentro} opacity={0.6} />
      </g>
    </g>
  );
}

// ------------------------------------------------------------------ cabeça

/**
 * A auréola deitada: o anel flutuando **sobre** a cabeça, em perspectiva.
 *
 * A metade de trás do anel fica atrás do cabelo e a de frente passa na frente dele — é o que faz o
 * anel parecer pairar em volta da cabeça em vez de estar colado na parede. Um cone de luz fraco
 * desce dele até o rosto.
 */
function AureolaAnel({ a, uid, plano }: { a: Aura; uid: string; plano: Plano }) {
  const [fora, dentro] = a.colors;
  const cy = -1;
  const anel = (
    <g>
      <ellipse cx={50} cy={cy} rx={12.5} ry={3.4} fill="none" stroke={dentro} strokeWidth={3.6} opacity={0.24} style={{ filter: 'blur(1px)' }} />
      <ellipse cx={50} cy={cy} rx={12.5} ry={3.4} fill="none" stroke={fora} strokeWidth={1.9} />
      <ellipse cx={50} cy={cy - 0.25} rx={12.5} ry={3.3} fill="none" stroke="#fffdf2" strokeWidth={0.5} opacity={0.9} />
    </g>
  );
  // as cintilações ficam no anel: as de perto no plano da frente, as de longe no de trás
  const brilhos = (plano === 'frente' ? [35, 105, 160] : [215, 300]).map((g, i) => {
    const [x, y] = [50 + 12.5 * Math.cos((g * Math.PI) / 180), cy + 3.4 * Math.sin((g * Math.PI) / 180)];
    return <Centelha key={g} x={x} y={y} r={2.2} cor="#ffffff" atraso={i * 0.8 + (plano === 'frente' ? 0 : 0.4)} />;
  });
  return (
    <g>
      {plano === 'tras' && (
        <>
          <defs>
            <linearGradient id={`cone${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={dentro} stopOpacity="0.4" />
              <stop offset="1" stopColor={dentro} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="aura-brilha" d={`M38 ${cy} L62 ${cy} L68 17 L32 17 Z`} fill={`url(#cone${uid})`} />
        </>
      )}
      <g className="aura-flutua">
        <Metade id={`anel${uid}`} y={cy} plano={plano}>
          {anel}
        </Metade>
        {brilhos}
      </g>
    </g>
  );
}

/**
 * O nimbo radiante: o disco de santo de vitral **atrás** da cabeça.
 *
 * Três coisas giram em tempos diferentes — os raios, a coroa de contas pontilhada e, mais devagar,
 * o próprio disco que respira —, e os raios alternam comprido e curto, como no ouro das igrejas.
 */
function AureolaRaios({ a, uid, plano }: { a: Aura; uid: string; plano: Plano }) {
  if (plano === 'frente') return null;
  const [fora, dentro] = a.colors;
  const [cx, cy] = [50, 8];
  const raios = Array.from({ length: 24 }, (_, i) => {
    const g = i * 15;
    const [ax, ay] = pt(cx, cy, 13.4, g - 1.7);
    const [bx, by] = pt(cx, cy, i % 2 ? 20.5 : 26.5, g);
    const [qx, qy] = pt(cx, cy, 13.4, g + 1.7);
    return `M${n(ax)} ${n(ay)} L${n(bx)} ${n(by)} L${n(qx)} ${n(qy)} Z`;
  }).join(' ');
  return (
    <g>
      <defs>
        {/* branco no miolo e dourado na borda: fraco, o disco lia como um prato cinza atrás da cabeça */}
        <radialGradient id={`nimbo${uid}`}>
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.5" stopColor={dentro} stopOpacity="0.75" />
          <stop offset="0.82" stopColor={fora} stopOpacity="0.5" />
          <stop offset="1" stopColor={fora} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={19} fill={dentro} opacity={0.3} style={{ filter: 'blur(2px)' }} />
      <circle className="aura-brilha" cx={cx} cy={cy} r={15.5} fill={`url(#nimbo${uid})`} />
      <g>
        <path d={raios} fill={dentro} opacity={0.55} />
        <Gira cx={cx} cy={cy} s={50} />
      </g>
      <circle cx={cx} cy={cy} r={13.2} fill="none" stroke={fora} strokeWidth={1.6} />
      <circle cx={cx} cy={cy} r={10.8} fill="none" stroke={dentro} strokeWidth={0.45} opacity={0.75} />
      {Array.from({ length: 12 }, (_, i) => {
        const [x, y] = pt(cx, cy, 13.2, i * 30);
        return <circle key={i} cx={n(x)} cy={n(y)} r={0.75} fill="#fffdf0" />;
      })}
      <g>
        <circle cx={cx} cy={cy} r={17} fill="none" stroke={dentro} strokeWidth={0.55} strokeDasharray="0.01 2.2" strokeLinecap="round" opacity={0.85} />
        <Gira cx={cx} cy={cy} s={80} volta={-360} />
      </g>
    </g>
  );
}

/**
 * A coroa de espinhos de quem trocou de lado.
 *
 * Os espinhos são **curvos** e varridos para o mesmo lado, como garras — reto, o anel lia como
 * sol. Uma segunda fileira, curta, aponta para dentro e gira ao contrário; do alto do anel sobem
 * chamas roxas pequenas, e cinzas.
 */
function AureolaNegra({ a, uid, plano }: { a: Aura; uid: string; plano: Plano }) {
  if (plano === 'frente') return null;
  const [fora, dentro] = a.colors;
  const [cx, cy] = [50, 6.5];
  const escuro = '#140820';
  const espinho = (r0: number, r1: number, g: number, curva: number): string => {
    const [ax, ay] = pt(cx, cy, r0, g - 4.5);
    const [bx, by] = pt(cx, cy, r0, g + 4.5);
    const [tx, ty] = pt(cx, cy, r1, g + curva);
    const [c1x, c1y] = pt(cx, cy, (r0 + r1) / 2, g - 1 + curva * 0.2);
    const [c2x, c2y] = pt(cx, cy, (r0 + r1) / 2, g + 5 + curva * 0.4);
    return `M${n(ax)} ${n(ay)} Q${n(c1x)} ${n(c1y)} ${n(tx)} ${n(ty)} Q${n(c2x)} ${n(c2y)} ${n(bx)} ${n(by)} Z`;
  };
  const fora14 = Array.from({ length: 14 }, (_, i) => espinho(10.5, i % 2 ? 17.5 : 21, (360 / 14) * i, 8)).join(' ');
  const dentro10 = Array.from({ length: 10 }, (_, i) => espinho(9, 6.2, 36 * i, -6)).join(' ');
  return (
    <g>
      <defs>
        <radialGradient id={`fumo${uid}`}>
          <stop offset="0" stopColor={fora} stopOpacity="0.7" />
          <stop offset="0.6" stopColor={fora} stopOpacity="0.28" />
          <stop offset="1" stopColor={fora} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="aura-respira" cx={cx} cy={cy} r={22} fill={`url(#fumo${uid})`} />
      <circle cx={cx} cy={cy} r={11} fill="none" stroke={dentro} strokeWidth={4.2} opacity={0.26} style={{ filter: 'blur(1.2px)' }} />
      <g>
        <path d={fora14} fill={escuro} stroke={dentro} strokeWidth={0.35} strokeLinejoin="round" />
        <Gira cx={cx} cy={cy} s={70} />
      </g>
      <circle cx={cx} cy={cy} r={11} fill="none" stroke={escuro} strokeWidth={3.2} />
      <circle cx={cx} cy={cy} r={11} fill="none" stroke={dentro} strokeWidth={0.6} opacity={0.9} />
      <g>
        <path d={dentro10} fill={fora} stroke={dentro} strokeWidth={0.25} opacity={0.9} />
        <Gira cx={cx} cy={cy} s={90} volta={-360} />
      </g>
      {/* as chaminhas roxas que sobem do alto do anel */}
      {[-8, -4, 0, 4, 8].map((dx, i) => {
        const y0 = cy - Math.sqrt(11 * 11 - dx * dx) + 0.5;
        const h = 5 + ((i * 7) % 4);
        const q = ondaDe(50 + dx, y0, h, 1.2, h * 0.16, i * 1.2);
        return (
          <path key={dx} fill={dentro} opacity={0.8} style={{ filter: 'blur(0.4px)' }} d={q.slice(0, q.indexOf(';'))}>
            <animate attributeName="d" values={q} dur={`${1.4 + i * 0.13}s`} calcMode="linear" repeatCount="indefinite" />
          </path>
        );
      })}
      <Faiscas semente={41} quantas={9} cor={dentro} area={[38, 62, -4, 8]} sobe={14} dur={2.6} raio={0.4} deriva={5} />
    </g>
  );
}

// ------------------------------------------------------------------ órbita

/** O trilho da órbita: deitado em volta da cintura, visto de cima para baixo. */
const ORB = { cx: 50, cy: 46, rx: 37, ry: 7.5 };

/** Um naipe brilhante, balançando. */
function Naipe({ suit, cor }: { suit: 's' | 'h' | 'd' | 'c'; cor: string }) {
  return (
    <g>
      <SuitGlyph suit={suit} size={9} color={cor} />
      {/* o miolo branco: é o que faz a figura brilhar em vez de só ter cor */}
      <g opacity={0.5}>
        <SuitGlyph suit={suit} size={4.6} y={-0.4} color="#ffffff" />
      </g>
      <animateTransform attributeName="transform" type="rotate" values="-14;14;-14" dur="2.6s" repeatCount="indefinite" />
    </g>
  );
}

/**
 * Uma shuriken de quatro lâminas curvas.
 *
 * Cada lâmina tem o fio da frente reto e o de trás em curva — a silhueta de catavento que se
 * reconhece de longe —, o furo no meio e um disco fantasma em volta, que é o borrão do giro.
 */
function Shuriken({ uid, dentro }: { uid: string; dentro: string }) {
  const R = 5;
  const r = 1.5;
  let d = '';
  for (let k = 0; k < 4; k++) {
    const g = k * 90;
    const [vx, vy] = pt(0, 0, r, g - 45);
    const [cx, cy] = pt(0, 0, R * 0.58, g - 30);
    const [tx, ty] = pt(0, 0, R, g);
    const [wx, wy] = pt(0, 0, r, g + 45);
    d += `${k ? 'L' : 'M'}${n(vx)} ${n(vy)} Q${n(cx)} ${n(cy)} ${n(tx)} ${n(ty)} L${n(wx)} ${n(wy)} `;
  }
  return (
    <g>
      <circle r={R} fill={dentro} opacity={0.14} />
      <g>
        <path d={`${d}Z`} fill={`url(#metal${uid})`} stroke="#1c2330" strokeWidth={0.25} strokeLinejoin="round" />
        <circle r={1.05} fill="#0d1118" />
        <circle r={1.05} fill="none" stroke={dentro} strokeWidth={0.25} />
        <Gira s={0.7} />
      </g>
    </g>
  );
}

/**
 * Figuras dando a volta no personagem, **em** volta dele.
 *
 * O trilho é uma elipse deitada na altura da cintura. Cada figura anda por ela (`animateMotion`),
 * cresce quando vem para perto e encolhe quando vai para longe (`scale`), e existe duas vezes: uma
 * cópia no plano de trás, visível na metade de longe da volta, e outra no plano da frente, visível
 * na metade de perto. As duas andam no mesmo relógio, então quem olha vê uma figura só passando
 * por trás e pela frente do corpo.
 *
 * Elas giram **com** a órbita, sem ficar em pé: carrossel, e não satélites.
 */
function Orbita({ a, uid, plano }: { a: Aura; uid: string; plano: Plano }) {
  const [fora, dentro] = a.colors;
  const naipe = a.figura === 'naipe';
  const quantas = naipe ? 4 : 5;
  const T = naipe ? 10 : 6.5;
  const caminho = elipse(ORB.cx, ORB.cy, ORB.rx, ORB.ry);
  // a profundidade ao longo da volta: começa na ponta da direita e desce (vem para perto) primeiro
  const Q = 8;
  const seno = (i: number) => Math.sin((i / Q) * Math.PI * 2);
  const escalas = Array.from({ length: Q + 1 }, (_, i) => {
    const s = (0.72 + 0.4 * ((seno(i) + 1) / 2)).toFixed(3);
    return `${s} ${s}`;
  }).join(';');
  const luz = Array.from({ length: Q + 1 }, (_, i) => (0.5 + 0.5 * ((seno(i) + 1) / 2)).toFixed(3)).join(';');
  const NAIPES = ['s', 'h', 'c', 'd'] as const;
  return (
    <g style={{ filter: `drop-shadow(0 0 1.4px ${dentro})` }}>
      {!naipe && (
        <defs>
          <linearGradient id={`metal${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f4f8ff" />
            <stop offset="0.45" stopColor={fora} />
            <stop offset="1" stopColor="#566175" />
          </linearGradient>
        </defs>
      )}
      <Metade id={`trilho${uid}`} y={ORB.cy} plano={plano}>
        <ellipse
          cx={ORB.cx}
          cy={ORB.cy}
          rx={ORB.rx}
          ry={ORB.ry}
          fill="none"
          stroke={dentro}
          strokeWidth={0.35}
          strokeDasharray="0.6 1.6"
          opacity={plano === 'frente' ? 0.5 : 0.3}
        />
      </Metade>
      {Array.from({ length: quantas }, (_, i) => {
        const tempo = `${T}s`;
        const inicio = `-${((i / quantas) * T).toFixed(2)}s`;
        const suit = NAIPES[i % 4];
        return (
          <g key={i} opacity={0}>
            <animate
              attributeName="opacity"
              values={plano === 'frente' ? '1;0' : '0;1'}
              keyTimes="0;0.5"
              calcMode="discrete"
              dur={tempo}
              begin={inicio}
              repeatCount="indefinite"
            />
            <animateMotion path={caminho} dur={tempo} begin={inicio} repeatCount="indefinite" />
            <g>
              <animateTransform attributeName="transform" type="scale" values={escalas} dur={tempo} begin={inicio} repeatCount="indefinite" />
              <animate attributeName="opacity" values={luz} dur={tempo} begin={inicio} repeatCount="indefinite" />
              {naipe ? <Naipe suit={suit} cor={suit === 'h' || suit === 'd' ? dentro : fora} /> : <Shuriken uid={uid} dentro={dentro} />}
            </g>
          </g>
        );
      })}
    </g>
  );
}

// ------------------------------------------------------------------ arsenal

/**
 * A silhueta de uma espada de pé, com o punho na origem — lâmina, guarda, cabo e pomo num contorno
 * só, sem desenho por dentro.
 *
 * É silhueta de propósito: a aura é a **forma** da espada acesa, como uma sombra de luz, e não uma
 * espada de verdade pendurada atrás de alguém. Com aço, pedra e empunhadura enrolada, ela virava
 * objeto e brigava com a ilustração.
 */
function silhuetaDeEspada(comp: number): string {
  const base = -6.2;
  const ponta = base - comp;
  return (
    `M-1.5 ${base} L-1.5 ${n(ponta + 5)} L0 ${n(ponta)} L1.5 ${n(ponta + 5)} L1.5 ${base}` +
    ` L6.5 ${base} L6.5 -4.6 L1.1 -4.6 L1.1 0.2` +
    ` A 1.7 1.7 0 1 1 -1.1 0.2` +
    ` L-1.1 -4.6 L-6.5 -4.6 L-6.5 ${base} Z`
  );
}

/**
 * Seis silhuetas de espada abertas em leque atrás do personagem, pairando.
 *
 * O leque sai de um ponto atrás da cintura: as de fora são mais curtas e as do meio passam da
 * altura dos ombros. Cada espada é duas vezes a mesma silhueta — um borrão da cor de dentro por
 * baixo, que é o brilho, e a forma lisa da cor de fora por cima. Cada uma sobe e desce no seu
 * tempo, como se estivesse suspensa por um fio, e o leque inteiro acende e apaga devagar.
 */
function Espadas({ a, plano }: { a: Aura; plano: Plano }) {
  if (plano === 'frente') return null;
  const [fora, dentro] = a.colors;
  const leque = [
    { g: -60, comp: 26 },
    { g: -38, comp: 31 },
    { g: -15, comp: 36 },
    { g: 15, comp: 36 },
    { g: 38, comp: 31 },
    { g: 60, comp: 26 },
  ];
  return (
    <g className="aura-brilha">
      {leque.map((e, i) => {
        const d = silhuetaDeEspada(e.comp);
        return (
          <g key={e.g} transform={`translate(50 72) rotate(${e.g}) translate(0 -17)`}>
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0;0 -1.6;0 0"
                dur={`${(3 + i * 0.37).toFixed(2)}s`}
                calcMode="spline"
                keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
                repeatCount="indefinite"
              />
              <path d={d} fill={dentro} opacity={0.7} style={{ filter: 'blur(1.6px)' }} />
              <path d={d} fill={fora} opacity={0.94} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

// ------------------------------------------------------------------ chão

/**
 * Labaredas subindo do chão: sete línguas atrás, as das pontas mais altas, e quatro baixinhas na
 * frente dos pés.
 *
 * As mais altas nas pontas desenham o contorno do personagem em vez de virar uma fogueira atrás
 * dele; as baixas da frente põem a pessoa **dentro** do fogo. Cada língua tem as três temperaturas
 * da carta em chamas, e as brasas sobem por cima de tudo.
 */
function Labaredas({ a, uid, plano }: { a: Aura; uid: string; plano: Plano }) {
  const [fora, dentro] = a.colors;
  const cores: [string, string, string] = [a.sombra ?? '#b81c06', fora, dentro];
  if (plano === 'frente') {
    return (
      <g>
        {[
          { x: 27, h: 10, w: 3.6, f: 0.4 },
          { x: 42, h: 7, w: 3, f: 1.9 },
          { x: 58, h: 8, w: 3.2, f: 3.1 },
          { x: 73, h: 11, w: 3.8, f: 4.6 },
        ].map((l) => (
          <Lingua key={l.x} x={l.x} y0={101} h={l.h} w={l.w} fase={l.f} tempo={1.5 + l.f * 0.08} cores={cores} />
        ))}
      </g>
    );
  }
  const alt = (a.altura ?? 0.66) * 100;
  const linguas = [
    { x: 9, h: 0.62, w: 5.5, f: 0.2 },
    { x: 19, h: 0.92, w: 7.5, f: 1.1 },
    { x: 31, h: 0.7, w: 6.5, f: 2.3 },
    { x: 50, h: 0.58, w: 8, f: 3.4 },
    { x: 69, h: 0.72, w: 6.5, f: 4.4 },
    { x: 81, h: 0.95, w: 7.5, f: 5.3 },
    { x: 91, h: 0.6, w: 5.5, f: 6.1 },
  ];
  return (
    <g>
      <defs>
        <radialGradient id={`brasa${uid}`} cx="50%" cy="100%" r="62%">
          <stop offset="0" stopColor={dentro} stopOpacity="0.5" />
          <stop offset="0.45" stopColor={fora} stopOpacity="0.24" />
          <stop offset="1" stopColor={fora} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx={50} cy={99} rx={50} ry={30} fill={`url(#brasa${uid})`} />
      {linguas.map((l) => (
        <Lingua key={l.x} x={l.x} y0={101} h={alt * l.h} w={l.w} fase={l.f} tempo={1.9 + (l.f % 3) * 0.2} cores={cores} />
      ))}
      <Faiscas semente={3} quantas={18} cor={dentro} area={[8, 92, 55, 96]} sobe={50} dur={2.8} raio={0.5} deriva={10} />
    </g>
  );
}

/**
 * Um fogo-fátuo: a bolinha de luz fria com a chama em cima, vagando numa volta pequena.
 *
 * Desenhado na origem; quem o põe no lugar é o `animateMotion`, que o faz passear por uma elipse
 * pequena em volta do ponto dele — sem pressa, cada um no seu tempo.
 */
function Fatuo({ x, y, s, i, fora, dentro }: { x: number; y: number; s: number; i: number; fora: string; dentro: string }) {
  const volta = elipse(x, y, 3 + (i % 3), 4 + (i % 2) * 2);
  const cauda = ondaDe(0, 0.8, 7, 1.7, 0.9, i);
  const miolo = ondaDe(0, 0.8, 4, 1, 0.5, i + 1);
  return (
    <g>
      <animateMotion path={volta} dur={`${(6 + i * 0.9).toFixed(1)}s`} begin={`-${(i * 1.3).toFixed(1)}s`} repeatCount="indefinite" />
      <g transform={`scale(${s})`}>
        <animate attributeName="opacity" values="0.65;1;0.75;1;0.65" dur="2.3s" begin={`-${(i * 0.5).toFixed(1)}s`} repeatCount="indefinite" />
        <circle r={4.4} fill={fora} opacity={0.32} style={{ filter: 'blur(1.6px)' }} />
        <path fill={fora} opacity={0.8} style={{ filter: 'blur(0.5px)' }} d={cauda.slice(0, cauda.indexOf(';'))}>
          <animate attributeName="d" values={cauda} dur="1.3s" calcMode="linear" repeatCount="indefinite" />
        </path>
        <path fill={dentro} d={miolo.slice(0, miolo.indexOf(';'))}>
          <animate attributeName="d" values={miolo} dur="1.1s" calcMode="linear" repeatCount="indefinite" />
        </path>
        <circle r={1.25} fill="#f2ffff" />
      </g>
    </g>
  );
}

/**
 * Fogo-fátuo: chamas azuis baixas no chão e luzes frias vagando em volta do corpo.
 *
 * É o que o separa das Labaredas, que são a mesma chama em outra cor: aqui o fogo mais **vaga** do
 * que queima. Seis luzes flutuam atrás e duas passam pela frente, perto das bordas, para não cobrir
 * o rosto de ninguém.
 */
function FogoFatuo({ a, uid, plano }: { a: Aura; uid: string; plano: Plano }) {
  const [fora, dentro] = a.colors;
  const cores: [string, string, string] = [a.sombra ?? '#0b1f7a', fora, dentro];
  const luzes =
    plano === 'tras'
      ? [
          { x: 14, y: 70, s: 1 },
          { x: 24, y: 32, s: 0.8 },
          { x: 83, y: 58, s: 1.1 },
          { x: 77, y: 22, s: 0.75 },
          { x: 88, y: 84, s: 0.9 },
          { x: 10, y: 46, s: 0.7 },
        ]
      : [
          { x: 19, y: 88, s: 0.9 },
          { x: 85, y: 38, s: 0.8 },
        ];
  const alt = (a.altura ?? 0.4) * 100;
  return (
    <g>
      {plano === 'tras' && (
        <>
          <defs>
            <radialGradient id={`frio${uid}`} cx="50%" cy="100%" r="62%">
              <stop offset="0" stopColor={dentro} stopOpacity="0.4" />
              <stop offset="1" stopColor={fora} stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx={50} cy={99} rx={48} ry={24} fill={`url(#frio${uid})`} />
          {[
            { x: 16, h: 0.8, f: 0.5 },
            { x: 30, h: 0.55, f: 2.1 },
            { x: 70, h: 0.6, f: 3.3 },
            { x: 84, h: 0.85, f: 4.8 },
          ].map((l) => (
            <Lingua key={l.x} x={l.x} y0={101} h={alt * l.h} w={4.6} fase={l.f} tempo={2.2} cores={cores} />
          ))}
        </>
      )}
      {luzes.map((l, i) => (
        <Fatuo key={i} x={l.x} y={l.y} s={l.s} i={i + (plano === 'frente' ? 6 : 0)} fora={fora} dentro={dentro} />
      ))}
    </g>
  );
}

// ------------------------------------------------------------------ asas

/**
 * Uma pena: sai da raiz (`ox`, `oy`) e termina numa ponta arredondada.
 *
 * A borda de um lado é cheia e a do outro quase reta, como numa rêmige de verdade — a assimetria é
 * o que faz o olho ler pena em vez de folha.
 */
function pena(graus: number, comp: number, larg: number, ox = 0, oy = 0): string {
  const a = (graus * Math.PI) / 180;
  const [dx, dy] = [Math.cos(a), Math.sin(a)];
  const [nx, ny] = [-Math.sin(a), Math.cos(a)];
  const p = (t: number, off: number) => `${n(ox + dx * comp * t + nx * off)} ${n(oy + dy * comp * t + ny * off)}`;
  return (
    `M${n(ox)} ${n(oy)} C${p(0.3, larg)} ${p(0.78, larg * 1.05)} ${p(1, larg * 0.25)}` +
    ` Q${p(1.05, -larg * 0.05)} ${p(0.97, -larg * 0.45)}` +
    ` C${p(0.7, -larg * 0.55)} ${p(0.25, -larg * 0.3)} ${n(ox)} ${n(oy)} Z`
  );
}

/** Uma pena da raiz até a ponta dadas. */
function penaEntre([rx, ry]: [number, number], [tx, ty]: [number, number], larg: number): string {
  return pena((Math.atan2(ty - ry, tx - rx) * 180) / Math.PI, Math.hypot(tx - rx, ty - ry), larg, rx, ry);
}

/*
 * A forma da asa — a mesma para as três.
 *
 * É a asa erguida do desenho clássico: o **braço** sai do ombro, sobe quase reto, faz a curva do
 * ombro e varre para fora até a ponta, no alto; as penas longas pendem dele abrindo em leque para
 * baixo, as de perto da ponta apontando para fora e as de perto do corpo apontando para o chão.
 *
 * Duas curvas descrevem isso, na asa da direita com o ombro na origem:
 *   - `braco(t)`, a borda de cima, do ombro (t=0) até a ponta (t=1);
 *   - `contorno(s)`, a borda de fora, da ponta no alto (s=0) até embaixo, junto do corpo (s=1).
 * Uma **costela** liga um ponto do braço a um ponto do contorno; tudo o que a asa tem — rêmiges,
 * secundárias, coberteiras, dedos de couro — é posto ao longo das costelas, a uma fração do
 * caminho. É por isso que as três asas têm a mesma silhueta.
 */
/*
 * As medidas saíram da asa de referência (a de traço, erguida): com a raiz da asa na origem, a
 * ponta fica no alto e para fora — é o ponto mais largo da asa —, e o contorno desce em diagonal
 * até o ponto mais baixo, que fica perto do corpo e pouco abaixo do ombro. A asa mora quase toda
 * **acima** do ombro; a primeira versão descia até o quadril e parecia uma concha.
 */
const BRACO: [number, number][] = [
  [0, 0],
  [3, -14],
  [16, -22],
  [44, -32],
];

const CONTORNO: [number, number][] = [
  [44, -32],
  [42.5, -21],
  [40, -11],
  [35, -2.5],
  [25, 7.5],
  [15, 12],
  [4, 9],
];

/** O braço: uma cúbica do ombro até a ponta. */
function braco(t: number): [number, number] {
  const [p0, p1, p2, p3] = BRACO;
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [k[0] * p0[0] + k[1] * p1[0] + k[2] * p2[0] + k[3] * p3[0], k[0] * p0[1] + k[1] * p1[1] + k[2] * p2[1] + k[3] * p3[1]];
}

/** O contorno de fora: uma curva macia (Catmull-Rom) pelos pontos de CONTORNO. */
function contorno(s: number): [number, number] {
  const P = CONTORNO;
  const m = P.length - 1;
  const x = Math.min(Math.max(s, 0), 1) * m;
  const i = Math.min(Math.floor(x), m - 1);
  const u = x - i;
  const [a, b, c, d] = [P[Math.max(i - 1, 0)], P[i], P[i + 1], P[Math.min(i + 2, m)]];
  const cr = (p0: number, p1: number, p2: number, p3: number) =>
    0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
  return [cr(a[0], b[0], c[0], d[0]), cr(a[1], b[1], c[1], d[1])];
}

/**
 * Um ponto na costela `s`, a uma fração `f` do braço (0) ao contorno (1).
 *
 * A costela de cima sai do braço perto da ponta e a de baixo sai do começo dele, junto do ombro:
 * o braço entre t=0,72 e a ponta fica por cima das primeiras penas, e é isso que desenha o bico.
 */
function naCostela(s: number, f: number): [number, number] {
  return lerp(braco(0.72 - 0.5 * s), contorno(s), f);
}

/**
 * A silhueta cheia, que fica por baixo de tudo para não haver buraco entre as penas.
 *
 * Ela para antes do contorno (a 80% de cada costela): as pontas das rêmiges ficam soltas, cada uma
 * com o seu arredondado, como na referência. Até o contorno, a borda de fora virava uma linha
 * lisa e a asa inteira parecia uma peça só.
 */
function silhuetaDaAsa(): string {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) pts.push(braco(i / 12));
  for (let i = 0; i <= 20; i++) pts.push(naCostela(i / 20, 0.8));
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join(' ') + ' Z';
}

/** A borda de ataque: o braço até a ponta, o traço mais grosso da asa. */
function bordaDaAsa(): string {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 16; i++) pts.push(braco(i / 16));
  pts.push(contorno(0));
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join(' ');
}

/**
 * A asa de anjo, no feitio da asa clássica erguida.
 *
 * De baixo para cima: a silhueta cheia (para não haver buraco entre as penas), as **rêmiges**
 * longas abrindo em leque até o contorno, as **secundárias** por cima delas, e quatro fileiras de
 * **coberteiras** — penas curtas e redondas que, uma sobrepondo a outra, formam as escamas junto do
 * braço. Por último o braço, em traço mais grosso. As coberteiras só cobrem a metade de dentro,
 * perto do ombro: na ponta a asa é só pena longa, como no desenho.
 */
function AsaDeAnjo({ uid }: { uid: string }) {
  const traco = '#b3c0d9';
  // rêmiges estreitas: largas, elas se fundiam numa borda lisa em vez de mostrar pena por pena
  const P = 12;
  const primarias = Array.from({ length: P }, (_, i) => {
    const s = 1 - i / (P - 1);
    return penaEntre(naCostela(s, 0.3), naCostela(s, 1.03), 2.3);
  });
  const S = 10;
  const secundarias = Array.from({ length: S }, (_, i) => {
    const s = 1 - (i + 0.5) / S;
    return penaEntre(naCostela(s, 0.16), naCostela(s, 0.62), 2.6);
  });
  // da fileira mais baixa para a mais alta: a de cima cobre a de baixo, como telhas
  const fileiras = [
    { f: 0.34, q: 11, comp: 0.14, larg: 2.3, s0: 0.3 },
    { f: 0.24, q: 11, comp: 0.13, larg: 2.2, s0: 0.36 },
    { f: 0.14, q: 10, comp: 0.12, larg: 2, s0: 0.44 },
    { f: 0.05, q: 9, comp: 0.11, larg: 1.8, s0: 0.52 },
  ];
  return (
    <g>
      <path d={silhuetaDaAsa()} fill={`url(#pluma${uid})`} />
      {primarias.map((d, i) => (
        <path key={`p${i}`} d={d} fill={`url(#pluma${uid})`} stroke={traco} strokeWidth={0.3} strokeLinejoin="round" />
      ))}
      {secundarias.map((d, i) => (
        <path key={`s${i}`} d={d} fill={`url(#pluma${uid})`} stroke={traco} strokeWidth={0.28} strokeLinejoin="round" />
      ))}
      {fileiras.map((r, fi) =>
        Array.from({ length: r.q }, (_, i) => {
          const s = 1 - ((1 - r.s0) * i) / (r.q - 1);
          return (
            <path
              key={`c${fi}-${i}`}
              d={penaEntre(naCostela(s, r.f), naCostela(s, r.f + r.comp), r.larg)}
              fill={`url(#pluma${uid})`}
              stroke={traco}
              strokeWidth={0.26}
              strokeLinejoin="round"
            />
          );
        }),
      )}
      <path d={bordaDaAsa()} fill="none" stroke={traco} strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/**
 * A asa de couro — de morcego ou de dragão —, com a mesma silhueta da asa de penas.
 *
 * O braço sobe do ombro e dobra no **pulso**; do pulso saem os dedos, cada um até um ponto do
 * contorno de fora — o primeiro até a ponta, no alto, e os outros abrindo para baixo. A membrana
 * vai do ombro pelo braço, estica até a ponta de cada dedo e fica pendurada entre um e outro em
 * festões que afundam na direção do pulso; o último festão desce até junto do corpo.
 *
 * O dragão acrescenta os espinhos na borda do braço, uma garra na ponta de cada dedo e as veias
 * acesas, pulsando como brasa.
 */
function AsaDeCouro({ tipo, uid, fora, dentro }: { tipo: 'morcego' | 'dragao'; uid: string; fora: string; dentro: string }) {
  const dragao = tipo === 'dragao';
  const tPulso = 0.62;
  const pulso = braco(tPulso);
  const dedosS = [0, 0.3, 0.56, 0.8];
  const pontas = dedosS.map(contorno);
  const fim = contorno(1);
  const bracoPts = Array.from({ length: 9 }, (_, i) => braco((tPulso * i) / 8));
  const bracoD = bracoPts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join(' ');

  let d = `${bracoD} L${n(pontas[0][0])} ${n(pontas[0][1])}`;
  const festoes: [number, number][] = [];
  for (let i = 1; i <= pontas.length; i++) {
    const de = pontas[i - 1];
    const ate = i < pontas.length ? pontas[i] : fim;
    const c = lerp(lerp(de, ate, 0.5), pulso, 0.3);
    festoes.push(c);
    d += ` Q${n(c[0])} ${n(c[1])} ${n(ate[0])} ${n(ate[1])}`;
  }
  d += ' L0 0 Z';

  const dedos = pontas
    .map((p) => {
      const meio = lerp(pulso, p, 0.5);
      return `M${n(pulso[0])} ${n(pulso[1])} Q${n(meio[0] + 0.8)} ${n(meio[1] - 0.8)} ${n(p[0])} ${n(p[1])}`;
    })
    .join(' ');
  // as veias finas: do dedo para dentro do couro, na direção do festão seguinte
  const veias = pontas
    .map((p, i) => {
      const de = lerp(pulso, p, 0.35);
      const prox = i + 1 < pontas.length ? pontas[i + 1] : fim;
      const meio = lerp(pulso, prox, 0.55);
      const ate = lerp(pulso, festoes[i], 0.85);
      return `M${n(de[0])} ${n(de[1])} Q${n(meio[0])} ${n(meio[1])} ${n(ate[0])} ${n(ate[1])}`;
    })
    .join(' ');
  const juntas = pontas.map((p) => lerp(pulso, p, 0.45));
  // a direção do braço num ponto, para os espinhos saírem para cima dele
  const rumo = (t: number) => {
    const [ax, ay] = braco(Math.max(t - 0.02, 0));
    const [bx, by] = braco(t + 0.02);
    return (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  };
  const espinhos = dragao
    ? [0.14, 0.26, 0.38, 0.5]
        .map((t, i) => {
          const b = braco(t);
          const g = rumo(t);
          const [ax, ay] = pt(b[0], b[1], 1.1, g + 180);
          const [bx, by] = pt(b[0], b[1], 1.1, g);
          const [tx, ty] = pt(b[0], b[1], 2.6 + i * 0.35, g - 110);
          return `M${n(ax)} ${n(ay)} L${n(tx)} ${n(ty)} L${n(bx)} ${n(by)} Z`;
        })
        .join(' ')
    : '';
  const garras = dragao
    ? pontas
        .map((p) => {
          const g = (Math.atan2(p[1] - pulso[1], p[0] - pulso[0]) * 180) / Math.PI;
          const [ax, ay] = pt(p[0], p[1], 0.8, g - 90);
          const [bx, by] = pt(p[0], p[1], 0.8, g + 90);
          const [tx, ty] = pt(p[0], p[1], 3.4, g + 18);
          const [cx, cy] = pt(p[0], p[1], 2.6, g - 12);
          return `M${n(ax)} ${n(ay)} Q${n(cx)} ${n(cy)} ${n(tx)} ${n(ty)} L${n(bx)} ${n(by)} Z`;
        })
        .join(' ')
    : '';
  // o polegar: a garra do pulso, virada para cima
  const gPulso = rumo(tPulso);
  const [px, py] = pt(pulso[0], pulso[1], dragao ? 4.4 : 3.2, gPulso - 70);
  const [pcx, pcy] = pt(pulso[0], pulso[1], dragao ? 3.6 : 2.6, gPulso - 30);
  const polegar = `M${n(pulso[0] - 0.9)} ${n(pulso[1] + 0.4)} Q${n(pcx)} ${n(pcy)} ${n(px)} ${n(py)} L${n(pulso[0] + 0.9)} ${n(pulso[1] - 0.4)} Z`;
  const osso = dragao ? '#ffcf8a' : dentro;
  return (
    <g>
      <defs>
        <radialGradient id={`couro${uid}`} gradientUnits="userSpaceOnUse" cx={n(pulso[0])} cy={n(pulso[1])} r={dragao ? 56 : 52}>
          <stop offset="0" stopColor={fora} stopOpacity="0.97" />
          <stop offset="0.7" stopColor={fora} stopOpacity="0.9" />
          <stop offset="1" stopColor={dentro} stopOpacity={dragao ? '0.85' : '0.7'} />
        </radialGradient>
      </defs>
      <path d={d} fill={`url(#couro${uid})`} stroke={dentro} strokeWidth={0.7} strokeLinejoin="round" />
      <path className={dragao ? 'aura-brilha' : undefined} d={veias} fill="none" stroke={dentro} strokeWidth={dragao ? 0.4 : 0.25} opacity={dragao ? 0.75 : 0.35} />
      {espinhos && <path d={espinhos} fill={osso} />}
      <path d={bracoD} fill="none" stroke={osso} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <path d={dedos} fill="none" stroke={osso} strokeWidth={1} strokeLinecap="round" />
      {juntas.map(([x, y], i) => (
        <circle key={i} cx={n(x)} cy={n(y)} r={0.6} fill={osso} />
      ))}
      <circle cx={n(pulso[0])} cy={n(pulso[1])} r={1.3} fill={osso} />
      <path d={polegar} fill={dragao ? '#fff0d6' : osso} />
      {garras && <path d={garras} fill="#fff0d6" />}
    </g>
  );
}

/** Penas soltas caindo das asas de anjo, girando devagar. */
function PenasCaindo({ uid }: { uid: string }) {
  return (
    <g>
      {[
        { x: 14, y: 34, t: 7.5, d: 0 },
        { x: 88, y: 28, t: 8.4, d: 3.1 },
        { x: 22, y: 16, t: 9.2, d: 5.6 },
      ].map((p, i) => (
        <g key={i} opacity={0}>
          <animateMotion path={`M${p.x} ${p.y} q 5 12 0 24 q -5 12 0 24`} dur={`${p.t}s`} begin={`-${p.d}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.15;0.7;1" dur={`${p.t}s`} begin={`-${p.d}s`} repeatCount="indefinite" />
          <g>
            <path d={pena(-90, 6, 1.6)} fill={`url(#pluma${uid})`} stroke="#b3c0d9" strokeWidth={0.15} />
            <animateTransform attributeName="transform" type="rotate" values="-40;40;-40" dur="2.8s" repeatCount="indefinite" />
          </g>
        </g>
      ))}
    </g>
  );
}

/**
 * As duas asas, batendo dos ombros.
 *
 * A batida é uma rotação em torno do ombro, e as duas asas batem **juntas** — o espelho é da forma,
 * não do tempo. Cada tipo tem o seu tamanho e o seu compasso: o anjo devagar, o morcego depressa e
 * menor, o dragão maior, pesado e fundo. A asa sobe mais do que desce: é o gesto de quem abre as
 * asas, e não o de quem voa.
 */
function Asas({ a, uid, plano }: { a: Aura; uid: string; plano: Plano }) {
  if (plano === 'frente') return null;
  const [fora, dentro] = a.colors;
  const tipo = a.asa ?? 'anjo';
  const passo = tipo === 'anjo' ? 3.6 : tipo === 'dragao' ? 3.2 : 2.4;
  const abre = tipo === 'anjo' ? 6 : tipo === 'dragao' ? 8 : 11;
  // o tamanho cabe no menu: maior que isto, as pontas entravam por baixo da pílula do jogador
  const tamanho = tipo === 'anjo' ? 0.92 : tipo === 'dragao' ? 1 : 0.88;
  return (
    <g>
      <defs>
        <radialGradient id={`pluma${uid}`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r="52">
          <stop offset="0" stopColor={dentro} />
          <stop offset="0.35" stopColor="#fff8ec" />
          <stop offset="1" stopColor={fora} />
        </radialGradient>
      </defs>
      {/* a luz atrás das asas: sem ela, penas brancas somem contra um fundo claro */}
      <ellipse cx={50} cy={16} rx={46} ry={20} fill={dentro} opacity={tipo === 'anjo' ? 0.16 : 0.1} style={{ filter: 'blur(3px)' }} />
      {[1, -1].map((lado) => (
        <g key={lado} transform={`translate(${50 + lado * 5} 30) scale(${lado * tamanho} ${tamanho})`}>
          <g>
            <animateTransform
              attributeName="transform"
              type="rotate"
              values={`${-abre};${(abre * 0.6).toFixed(1)};${-abre}`}
              dur={`${passo}s`}
              calcMode="spline"
              keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
              repeatCount="indefinite"
            />
            {tipo === 'anjo' ? <AsaDeAnjo uid={uid} /> : <AsaDeCouro tipo={tipo} uid={`${uid}${lado > 0 ? 'd' : 'e'}`} fora={fora} dentro={dentro} />}
          </g>
        </g>
      ))}
      {tipo === 'anjo' && <PenasCaindo uid={uid} />}
      {tipo === 'dragao' && <Faiscas semente={59} quantas={14} cor={dentro} area={[8, 92, 0, 55]} sobe={22} dur={3.2} raio={0.45} deriva={8} />}
    </g>
  );
}

// ------------------------------------------------------------------ o catálogo

type Spec = Omit<Aura, 'slot'>;

function aura(spec: Spec): Aura {
  return { ...spec, slot: AURA_SLOT[spec.id] };
}

function circulo(id: AuraId, name: string, description: string, colors: [string, string], texto: AuraTexto): Aura {
  return aura({ id, name, description, colors, shape: 'circulo', texto, vitrine: [5, 5, 90] });
}

/**
 * As dezessete auras.
 *
 * A ordem é a da vitrine: o brilho de graça na frente, e depois subindo — círculos, auréolas,
 * órbitas, espadas, fogo e, no fim, as asas.
 */
export const AURAS: Aura[] = [
  aura({
    id: 'brilho',
    name: 'Brilho',
    description: 'A luz discreta e parada que o menu sempre teve atrás do personagem. Pega a cor de quem está na frente.',
    colors: ['#ffffff', '#ffffff'],
    shape: 'brilho',
    vitrine: [0, 0, 100],
  }),
  aura({
    id: 'poeira-de-luz',
    name: 'Poeira de Luz',
    description: 'O brilho vivo: a luz respira, acende um miolo mais claro na altura do peito e solta poeira de luz subindo devagar. Também pega a cor do personagem.',
    colors: ['#ffffff', '#ffffff'],
    shape: 'poeira',
    vitrine: [0, 0, 100],
  }),
  circulo(
    'circulo-arcano',
    'Círculo Arcano',
    'Um selo de alquimista em latim: o aro escrito gira para um lado, o anel de letras para o outro e o pentagrama devagar no meio.',
    ['#e8c86a', '#fff0c2'],
    {
      linha: 'SOLVE · ET · COAGVLA · ALEA · IACTA · EST · FORTVNA · AVDACES · IVVAT · ',
      fonte: '"Cinzel Decorative", "Cinzel", serif',
      tamanho: 5,
      peso: 700,
      estrela: [5, 0.382],
      glifos: ['F', 'O', 'R', 'T', 'V', 'N', 'A', 'E'],
    },
  ),
  circulo(
    'circulo-oracular',
    'Círculo Oracular',
    'O conselho de Delfos em grego, na letra de manuscrito. No anel do meio, oito letras do alfabeto grego; no centro, uma estrela de sete pontas.',
    ['#7fe8cf', '#dcfff6'],
    {
      linha: 'ΓΝΩΘΙ ΣΕΑΥΤΟΝ · ΜΗΔΕΝ ΑΓΑΝ · ΤΥΧΗ ΚΑΙ ΤΕΧΝΗ · ΕΓΓΥΑ ΠΑΡΑ ΑΤΗ · ',
      fonte: '"Cormorant Garamond", "M PLUS Rounded 1c", serif',
      tamanho: 5.8,
      peso: 700,
      estrela: [7, 0.3],
      glifos: ['Α', 'Β', 'Γ', 'Δ', 'Θ', 'Λ', 'Σ', 'Ω'],
    },
  ),
  circulo(
    'selo-onmyoji',
    'Selo do Onmyōji',
    'Kanji e kana num selo de exorcista. O anel do meio traz os cinco elementos, o yin e o yang e o céu; no centro, o pentagrama de Seimei.',
    ['#ff6f9a', '#ffe0ea'],
    {
      linha: '天地無双・一擲千金・運命は我が手に・急急如律令・勝負は時の運・',
      fonte: '"M PLUS Rounded 1c", sans-serif',
      tamanho: 5.6,
      peso: 800,
      estrela: [5, 0.382],
      glifos: ['木', '火', '土', '金', '水', '陰', '陽', '天'],
    },
  ),
  circulo(
    'circulo-boreal',
    'Círculo Boreal',
    'Cirílico em letra de gelo, azul de aurora. A estrela do meio tem seis pontas, como um floco de neve.',
    ['#8fc4ff', '#eef7ff'],
    {
      linha: 'СУДЬБА · И · УДАЧА · ИДУТ · РЯДОМ · ВЕЧНАЯ · ЗИМА · СЕВЕРНОЕ · СИЯНИЕ · ',
      fonte: '"M PLUS Rounded 1c", sans-serif',
      tamanho: 5.2,
      peso: 700,
      estrela: [6, 0.577],
      glifos: ['Ж', 'Ф', 'Щ', 'Ю', 'Я', 'Д', 'Л', 'Б'],
    },
  ),
  aura({
    id: 'aureola',
    name: 'Auréola',
    description: 'O anel dourado flutuando sobre a cabeça, deitado em perspectiva: a metade de trás passa atrás do cabelo, a da frente na frente, e um cone de luz desce até o rosto.',
    colors: ['#ffcf4a', '#fff4cf'],
    shape: 'aureola',
    aureola: 'anel',
    vitrine: [26, -18, 48],
  }),
  aura({
    id: 'aureola-radiante',
    name: 'Auréola Radiante',
    description: 'O nimbo de santo de vitral atrás da cabeça: disco aceso, vinte e quatro raios alternando comprido e curto e uma coroa de contas girando ao contrário.',
    colors: ['#ffd76a', '#fff6dc'],
    shape: 'aureola',
    aureola: 'raios',
    vitrine: [22, -20, 56],
  }),
  aura({
    id: 'aureola-negra',
    name: 'Auréola Negra',
    description: 'A coroa de espinhos de quem trocou de lado: espinhos curvos como garras, uma fileira apontando para dentro, chamas roxas no alto e fumaça em volta.',
    colors: ['#3b1452', '#d49bff'],
    shape: 'aureola',
    aureola: 'espinhos',
    vitrine: [24, -20, 52],
  }),
  aura({
    id: 'naipes',
    name: 'Naipes em Órbita',
    description: 'Os quatro naipes dando a volta na sua cintura — passam por trás de você e voltam pela frente, crescendo quando chegam perto.',
    colors: ['#f4f2ff', '#ff5d7d'],
    shape: 'orbita',
    figura: 'naipe',
    vitrine: [8, 4, 84],
  }),
  aura({
    id: 'shurikens',
    name: 'Shurikens',
    description: 'Cinco lâminas de catavento girando em volta de você, cada uma rodando no próprio eixo. Passam por trás e pela frente do corpo.',
    colors: ['#cfd9e6', '#8be6ff'],
    shape: 'orbita',
    figura: 'shuriken',
    vitrine: [8, 4, 84],
  }),
  aura({
    id: 'espadas',
    name: 'Espadas Suspensas',
    description: 'Seis silhuetas de espada acesas, abertas em leque atrás de você e pairando cada uma no seu tempo.',
    colors: ['#e2f2ff', '#5aa8ff'],
    shape: 'espadas',
    vitrine: [2, 4, 96],
  }),
  aura({
    id: 'labaredas',
    name: 'Labaredas',
    description: 'Sete línguas de fogo subindo do chão atrás de você e quatro baixinhas na frente dos pés — a mesma chama da carta em chamas, com brasas subindo.',
    colors: ['#ff6a1e', '#ffd257'],
    sombra: '#b81c06',
    shape: 'labaredas',
    altura: 0.66,
    vitrine: [4, 14, 92],
  }),
  aura({
    id: 'fogo-fatuo',
    name: 'Fogo-Fátuo',
    description: 'Fogo frio: chamas azuis baixas no chão e oito luzes vagando em volta do corpo, duas delas passando pela frente.',
    colors: ['#2f7bff', '#aef4ff'],
    sombra: '#0b1f7a',
    shape: 'fatuo',
    altura: 0.4,
    vitrine: [0, 12, 100],
  }),
  aura({
    id: 'asas-anjo',
    name: 'Asas de Anjo',
    description: 'A asa clássica erguida: penas longas abrindo em leque e fileiras de penas em escama junto do braço, batendo devagar. De vez em quando uma pena se solta e cai.',
    colors: ['#ffffff', '#f3dca4'],
    shape: 'asas',
    asa: 'anjo',
    vitrine: [-6, -36, 112],
  }),
  aura({
    id: 'asas-morcego',
    name: 'Asas de Morcego',
    description: 'A mesma asa erguida, em couro: quatro dedos saindo do pulso, festões pendurados entre as pontas, veias finas e a garra do polegar. Batem depressa.',
    colors: ['#4a2570', '#c490ff'],
    shape: 'asas',
    asa: 'morcego',
    vitrine: [-6, -36, 112],
  }),
  aura({
    id: 'asas-dragao',
    name: 'Asas de Dragão',
    description: 'A maior de todas: a asa erguida em membrana de brasa, com veias acesas, espinhos na borda do braço, uma garra na ponta de cada dedo e fagulhas no ar. Batem pesado.',
    colors: ['#7a1408', '#ffa040'],
    shape: 'asas',
    asa: 'dragao',
    vitrine: [-9, -40, 118],
  }),
];

export function findAura(id: string | null | undefined): Aura {
  return AURAS.find((a) => a.id === id) ?? AURAS.find((a) => a.id === DEFAULT_AURA)!;
}

/** Ids sem entrada no catálogo (deveria ser sempre vazio — veja aura.test.ts). */
export const MISSING_AURAS = AURA_IDS.filter((id) => !AURAS.some((a) => a.id === id));

/** O desenho de uma aura num plano. */
function Desenho({ a, uid, plano, tint }: { a: Aura; uid: string; plano: Plano; tint: string }) {
  switch (a.shape) {
    case 'brilho':
      return <Brilho cor={tint} uid={uid} plano={plano} />;
    case 'poeira':
      return <PoeiraDeLuz cor={tint} uid={uid} plano={plano} />;
    case 'circulo':
      return <Circulo a={a} uid={uid} plano={plano} />;
    case 'aureola':
      return a.aureola === 'raios' ? (
        <AureolaRaios a={a} uid={uid} plano={plano} />
      ) : a.aureola === 'espinhos' ? (
        <AureolaNegra a={a} uid={uid} plano={plano} />
      ) : (
        <AureolaAnel a={a} uid={uid} plano={plano} />
      );
    case 'orbita':
      return <Orbita a={a} uid={uid} plano={plano} />;
    case 'espadas':
      return <Espadas a={a} plano={plano} />;
    case 'labaredas':
      return <Labaredas a={a} uid={uid} plano={plano} />;
    case 'fatuo':
      return <FogoFatuo a={a} uid={uid} plano={plano} />;
    case 'asas':
      return <Asas a={a} uid={uid} plano={plano} />;
  }
}

/**
 * Uma aura sozinha numa caixa — é assim que a loja, a Galeria e a lista do Estúdio a mostram.
 *
 * Só a aura: sem manequim e sem personagem. Os dois planos entram no mesmo desenho (não há ninguém
 * para ficar entre eles), e o recorte da própria aura (`vitrine`) enquadra a peça.
 */
export function AuraAmostra({ aura: a, className }: { aura: Aura; className?: string }) {
  const uid = cleanId(useId());
  const [x, y, lado] = a.vitrine;
  return (
    <div className={`aura-amostra ${className ?? ''}`}>
      <svg className="aura-amostra-svg" viewBox={`${x} ${y} ${lado} ${lado}`} preserveAspectRatio="xMidYMid meet" aria-hidden focusable="false">
        <Desenho a={a} uid={`${uid}t`} plano="tras" tint="#ffcf9a" />
        <Desenho a={a} uid={`${uid}f`} plano="frente" tint="#ffcf9a" />
      </svg>
    </div>
  );
}

/**
 * As auras de alguém, num dos dois planos em volta da ilustração.
 *
 * Quem usa põe **duas**: uma com `plano="tras"` antes da ilustração e outra com `plano="frente"`
 * depois dela, as duas na mesma caixa. O SVG é um quadrado com a altura de quem está na frente
 * (veja o cabeçalho do arquivo); o `.char-aura` do CSS cuida disso.
 *
 * `auras` é a lista de ids, e passa pela regra de sempre (`sanitizeAuras`): o que não existe some,
 * a segunda de um mesmo lugar some, e elas se empilham da mais funda para a mais rasa.
 *
 * `tint` é a cor do personagem, e serve só para a aura `brilho` — que é a que se pinta de quem
 * está na frente dela. As outras trazem a própria cor.
 */
export const CharacterAura = memo(function CharacterAura({
  auras,
  tint = '#ffffff',
  plano = 'tras',
  className,
}: {
  /** Pode faltar: um servidor de antes das auras não manda o campo, e aí não há aura nenhuma. */
  auras: readonly string[] | undefined;
  tint?: string;
  plano?: Plano;
  className?: string;
}) {
  const uid = cleanId(useId());
  const lista = sanitizeAuras([...(auras ?? [])]).map(findAura);
  if (!lista.length) return null;
  return (
    <svg className={`char-aura ${plano} ${className ?? ''}`} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden focusable="false">
      {lista.map((a, i) => (
        <Desenho key={a.id} a={a} uid={`${uid}${i}`} plano={plano} tint={tint} />
      ))}
    </svg>
  );
});
