import { useId, useMemo, useState } from 'react';
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
 * Seis eixos, um por traço, e cada um com a sua cor: o polígono de sempre, mas repartido em
 * fatias, e a fatia que mais avança é o traço que mais aparece na mesa. Dá para ler a pessoa de
 * longe, sem encostar em número nenhum — que é como se lê alguém numa mesa de verdade.
 *
 * O traço é grosso de propósito: linha fina de gráfico de planilha some no fundo laqueado, e o
 * desenho tem de aguentar ser visto de longe.
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
const caminho = (pts: [number, number][]): string => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n1(x)} ${n1(y)}`).join(' ') + 'Z';

/** O hexágono de uma das linhas de fundo. */
const anel = (v: number): string => caminho(TRACOS.map((_, i) => ponto(i, v)));

/** Onde os rótulos ficam, em raios. */
const R_LABEL = 1.28;

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
  // os degradês são por instância: dois gráficos na mesma tela têm vértices diferentes, e um id
  // repetido faria o segundo pintar as linhas com as coordenadas do primeiro
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const valor = (id: Traco) => Math.max(0.04, Math.min(1, p[id]));
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
        {/*
         * Cada linha na cor de quem ela liga.
         *
         * O contorno não é um caminho só: são seis pedaços, cada um pintado com um degradê que sai
         * da cor de um traço e chega na do vizinho. Assim a volta inteira é uma só e mesmo assim
         * cada trecho pertence a alguém — uma linha branca por cima de fatias coloridas apagava
         * justamente a informação que as fatias dão.
         */}
        <defs>
          {TRACOS.map((t, i) => {
            const [x1, y1] = vertices[i];
            const [x2, y2] = vertices[(i + 1) % TRACOS.length];
            return (
              <linearGradient key={t.id} id={`rl-${uid}-${i}`} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
                <stop offset="0%" stopColor={t.cor} />
                <stop offset="100%" stopColor={TRACOS[(i + 1) % TRACOS.length].cor} />
              </linearGradient>
            );
          })}
        </defs>

        {/* o fundo: os anéis e os raios, apagados o bastante para não disputar com as fatias */}
        <g className="radar-grade">
          {[0.25, 0.5, 0.75, 1].map((v) => (
            <path key={v} d={anel(v)} />
          ))}
          {TRACOS.map((t, i) => {
            const [x, y] = ponto(i, 1);
            // o raio também é do traço: fraco, mas da cor certa
            return <line key={t.id} x1={C} y1={C} x2={x} y2={y} style={{ stroke: t.cor }} />;
          })}
        </g>

        {/*
         * As fatias.
         *
         * Cada traço ocupa a sua e cresce com o próprio número. Somadas, elas são o polígono de
         * sempre; separadas, cada uma tem dono e cor — é o que faz o gráfico ser lido como "essa
         * pessoa blefa" em vez de "essa pessoa tem uma área de 0,43".
         */}
        {TRACOS.map((t, i) => {
          const v = valor(t.id);
          // meio eixo para cada lado: a fatia ocupa o pedaço do traço e encosta na do vizinho
          const a = ponto(i - 0.5, v);
          const b = ponto(i + 0.5, v);
          const aceso = alvo?.t.id === t.id;
          return (
            <path
              key={t.id}
              className={`radar-petala ${aceso ? 'on' : ''}`}
              d={caminho([[C, C], a, ponto(i, v * 1.06), b])}
              style={{ fill: t.cor, ['--atraso' as string]: `${i * 0.07}s` }}
              onMouseEnter={() => mirar(t, i)}
            />
          );
        })}

        {/* o contorno clássico por cima: é ele que deixa comparar dois gráficos de relance */}
        {TRACOS.map((t, i) => {
          const [x1, y1] = vertices[i];
          const [x2, y2] = vertices[(i + 1) % TRACOS.length];
          return <path key={t.id} className="radar-linha" d={`M${n1(x1)} ${n1(y1)} L${n1(x2)} ${n1(y2)}`} stroke={`url(#rl-${uid}-${i})`} />;
        })}
        {TRACOS.map((t, i) => {
          const [x, y] = vertices[i];
          return <circle key={t.id} className="radar-ponto" cx={x} cy={y} r={5} style={{ fill: t.cor }} />;
        })}

        {/* os rótulos, na cor do traço */}
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
              <tspan x={x} dy={0}>
                {t.label}
              </tspan>
              <tspan className="radar-num" x={x} dy={15}>
                {Math.round(p[t.id] * 100)}
              </tspan>
            </text>
          );
        })}
      </svg>

      {/* a explicação do traço, ancorada na fatia */}
      {alvo && (
        /* a dica foge do rótulo: nas fatias de cima ela desce, nas de baixo ela sobe */
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
