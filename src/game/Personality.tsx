import { useMemo, useState } from 'react';
import {
  PARTIDAS_LEMBRADAS,
  TRACOS,
  personalidadeDasPartidas,
  personalidadeDoPersonagem,
  tagsDe,
  tracoDominante,
  type Personalidade,
  type ResumoDaPartida,
  type Traco,
  type TracoSpec,
} from '../../shared/personality';
import { useSession } from '../store/session';

/**
 * O jeito de jogar, desenhado.
 *
 * Um radar de seis eixos, como manda a convenção: quem já viu um destes sabe ler este sem
 * explicação, e a mancha torta se compara de relance com a de outra pessoa.
 *
 * O **traço** é que é de desenho animado: canto arredondado, contorno grosso escuro, ponta
 * gorda na cor do eixo. Um radar fino e cinzento parece relatório, e ninguém volta a um
 * relatório. A leitura não perde nada — a distância do centro continua sendo o número.
 *
 * A medida vem de shared/personality.ts, das últimas dez partidas, e é feita no servidor. Aqui só
 * se desenha.
 */

/** Raio do desenho em coordenadas internas. O tamanho real sai do `viewBox`. */
const R = 100;
/** Sobra para os rótulos e o contorno grosso caberem em volta. */
const M = 44;
const C = R + M;

/** O ponto do eixo `i` a uma distância `v` (0 a 1) do centro. */
function ponto(i: number, v: number, raio = R): [number, number] {
  const a = (-90 + i * (360 / TRACOS.length)) * (Math.PI / 180);
  return [C + Math.cos(a) * raio * v, C + Math.sin(a) * raio * v];
}

const n1 = (v: number) => v.toFixed(1);
/**
 * O polígono do radar, com os cantos arredondados.
 *
 * É o radar de sempre — um ponto por eixo, ligados —, mas o canto vivo é o que faz um gráfico
 * parecer planilha. Cada vértice vira uma curva curta, e o contorno grosso por cima arremata: a
 * leitura não muda em nada, o desenho muda inteiro.
 */
function poligonoMole(pts: [number, number][], raio = 13): string {
  const n = pts.length;
  const entre = (a: [number, number], b: [number, number], d: number): [number, number] => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(dx, dy) || 1;
    const t = Math.min(d, len / 2) / len;
    return [a[0] + dx * t, a[1] + dy * t];
  };
  let d = '';
  for (let i = 0; i < n; i++) {
    const v = pts[i];
    const a = entre(v, pts[(i - 1 + n) % n], raio);
    const b = entre(v, pts[(i + 1) % n], raio);
    d += `${i ? 'L' : 'M'}${n1(a[0])} ${n1(a[1])} Q${n1(v[0])} ${n1(v[1])} ${n1(b[0])} ${n1(b[1])} `;
  }
  return d + 'Z';
}

/** Onde os rótulos ficam, em raios. Perto o bastante para a flor não parecer pequena no meio deles. */
const R_LABEL = 1.2;

/** O que a tooltip mostra: o traço, o número e a explicação. */
interface Alvo {
  t: TracoSpec;
  /** Posição da ponta em porcentagem da caixa (a tooltip mora fora do SVG). */
  x: number;
  y: number;
}

export function RadarPersonalidade({
  p,
  size = 340,
  animado = true,
  dicas = true,
}: {
  p: Personalidade;
  size?: number;
  animado?: boolean;
  /** Mostrar a explicação de cada traço ao passar o mouse. */
  dicas?: boolean;
}) {
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  // o piso deixa o polígono com forma mesmo quando todos os traços são baixos
  const valor = (id: Traco) => Math.max(0.12, Math.min(1, p[id]));
  const vertices = TRACOS.map((t, i) => ponto(i, valor(t.id)));

  const mirar = (t: TracoSpec, i: number) => {
    if (!dicas) return;
    const [x, y] = ponto(i, Math.max(0.5, valor(t.id)));
    setAlvo({ t, x: (x / (C * 2)) * 100, y: (y / (C * 2)) * 100 });
  };

  return (
    <div className="radar-caixa" style={{ width: size, height: size }} onMouseLeave={() => setAlvo(null)}>
      <svg
        className={`radar ${animado ? 'vivo' : ''}`}
        viewBox={`0 0 ${C * 2} ${C * 2}`}
        width={size}
        height={size}
        role="img"
        aria-label="Gráfico da personalidade"
      >
        {/* o fundo: os anéis e os raios, apagados o bastante para não disputar com a mancha */}
        <g className="radar-grade">
          {[0.34, 0.67, 1].map((v) => (
            <path key={v} d={poligonoMole(TRACOS.map((_, i) => ponto(i, v)))} />
          ))}
          {TRACOS.map((t, i) => {
            const [x, y] = ponto(i, 1);
            return <line key={t.id} x1={C} y1={C} x2={x} y2={y} />;
          })}
        </g>

        {/*
         * A mancha.
         *
         * Um polígono só, como manda o radar, mas de desenho animado: canto arredondado, contorno
         * grosso escuro e preenchimento cheio. A cor de cada traço volta nos vértices e nos
         * rótulos, que é onde ela informa alguma coisa — no meio da mancha ela só faria sujeira.
         */}
        <g className="radar-mancha">
          <defs>
            <radialGradient id="radar-tinta" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffe9a8" stopOpacity="0.62" />
              <stop offset="60%" stopColor="#ff9ecb" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#a87bff" stopOpacity="0.44" />
            </radialGradient>
          </defs>
          <path className="radar-area" d={poligonoMole(vertices)} />
        </g>

        {/* as pontas: a cor do traço, e a área de mira do mouse */}
        {TRACOS.map((t, i) => {
          const [x, y] = vertices[i];
          const aceso = alvo?.t.id === t.id;
          return (
            <g key={t.id} className={`radar-ponta ${aceso ? 'on' : ''}`} onMouseEnter={() => mirar(t, i)}>
              <circle className="radar-alvo" cx={x} cy={y} r={18} />
              <circle className="radar-ponto" cx={x} cy={y} r={7} style={{ fill: t.cor, ['--atraso' as string]: `${i * 0.07}s` }} />
            </g>
          );
        })}

        {/* os rótulos, na cor do traço e com contorno para se soltarem do fundo */}
        {TRACOS.map((t, i) => {
          const [x, y] = ponto(i, R_LABEL);
          const aceso = alvo?.t.id === t.id;
          return (
            <text
              key={t.id}
              className={`radar-label ${aceso ? 'on' : ''}`}
              x={x}
              y={y}
              style={{ fill: t.cor }}
              onMouseEnter={() => mirar(t, i)}
            >
              <tspan x={x} dy={-2}>
                {t.label}
              </tspan>
              <tspan className="radar-num" x={x} dy={17}>
                {Math.round(p[t.id] * 100)}
              </tspan>
            </text>
          );
        })}
      </svg>

      {/* a explicação do traço, ancorada na ponta */}
      {alvo && (
        /* a dica foge do rótulo: nas pontas de cima ela desce, nas de baixo ela sobe */
        <div
          className={`radar-dica ${alvo.y < 50 ? 'desce' : ''}`}
          style={{ left: `${alvo.x}%`, top: `${alvo.y}%`, ['--cor' as string]: alvo.t.cor }}
          role="tooltip"
        >
          <b>
            {alvo.t.tag}
            <i>{Math.round(p[alvo.t.id] * 100)}</i>
          </b>
          <small>{alvo.t.hint}</small>
        </div>
      )}
    </div>
  );
}

/**
 * As etiquetas de uma personalidade, no bloco delas.
 *
 * Ficam separadas do gráfico de propósito: o gráfico é a medida, e a etiqueta é a conclusão. Sem
 * nenhuma em destaque, diz isso em vez de ficar vazio.
 */
export function TagsPersonalidade({ p, vazio = 'Equilibrado', titulo }: { p: Personalidade; vazio?: string; titulo?: string }) {
  const tags = tagsDe(p);
  const dom = tracoDominante(p);
  const lista: { chave: string; texto: string; cor: string; dica: string }[] = tags.length
    ? tags.map((t) => ({ chave: t.id, texto: t.tag, cor: t.cor, dica: t.hint }))
    : [{ chave: 'nenhum', texto: vazio, cor: dom.cor, dica: `Nenhum traço se destaca ainda — o mais alto é ${dom.label.toLowerCase()}.` }];
  return (
    <div className="tracos-bloco">
      {titulo && <span className="tracos-titulo">{titulo}</span>}
      <div className="tracos">
        {lista.map((t) => (
          <span key={t.chave} className="traco" style={{ ['--cor' as string]: t.cor }} title={t.dica}>
            {t.texto}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A personalidade de um personagem (a que o bot dele joga). */
export function PersonalidadeDoPersonagem({ id, size = 220 }: { id: string; size?: number }) {
  const p = personalidadeDoPersonagem(id);
  return (
    <div className="personalidade">
      <RadarPersonalidade p={p} size={size} />
      <TagsPersonalidade p={p} vazio="Imprevisível" />
    </div>
  );
}

/**
 * A personalidade do jogador, no perfil.
 *
 * Sem conta no servidor não há o que mostrar: a contagem é feita na mesa hospedada, ação por ação,
 * e inventá-la aqui seria desenhar um gráfico do nada.
 */
export function MinhaPersonalidade({ size = 380 }: { size?: number }) {
  const play = useSession((s) => s.account?.play);
  const partidas: ResumoDaPartida[] = useMemo(() => play ?? [], [play]);
  const p = useMemo(() => personalidadeDasPartidas(partidas), [partidas]);
  const maos = partidas.reduce((t, r) => t + r.maos, 0);
  if (!play) {
    return <p className="muted small">Entre numa conta do servidor para o jogo ler o seu jeito de jogar.</p>;
  }
  return (
    <div className="personalidade">
      <RadarPersonalidade p={p} size={size} />
      {partidas.length === 0 ? (
        <p className="muted small" style={{ textAlign: 'center' }}>
          Ainda não há partidas para ler. Jogue algumas e o gráfico entorta sozinho.
        </p>
      ) : (
        <>
          <TagsPersonalidade p={p} titulo="O que dizem de você na mesa" />
          <small className="muted personalidade-pe">
            Das suas últimas {partidas.length} partida{partidas.length === 1 ? '' : 's'} — {maos} {maos === 1 ? 'mão' : 'mãos'}. Só as{' '}
            {PARTIDAS_LEMBRADAS} últimas contam: mude o jogo e o gráfico muda junto.
          </small>
        </>
      )}
    </div>
  );
}
