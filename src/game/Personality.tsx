import { useMemo } from 'react';
import {
  PARTIDAS_LEMBRADAS,
  TRACOS,
  personalidadeDasPartidas,
  personalidadeDoPersonagem,
  tagsDe,
  tracoDominante,
  type Personalidade,
  type ResumoDaPartida,
} from '../../shared/personality';
import { useSession } from '../store/session';

/**
 * O jeito de jogar, desenhado.
 *
 * Seis eixos, um por traço, e cada um com a sua cor: em vez de um polígono só, o gráfico é uma
 * flor de seis pétalas, e a pétala que mais avança é o traço que mais aparece na mesa. Dá para ler
 * a pessoa de longe, sem encostar em número nenhum — que é exatamente como se lê alguém numa mesa.
 *
 * A medida vem de shared/personality.ts, das últimas dez partidas, e é feita no servidor. Aqui só
 * se desenha.
 */

/** Raio do desenho em coordenadas internas. O tamanho real sai do `viewBox`. */
const R = 100;
/** Sobra para os rótulos caberem em volta. */
const M = 46;
const C = R + M;

/** O ponto do eixo `i` a uma distância `v` (0 a 1) do centro. */
function ponto(i: number, v: number, raio = R): [number, number] {
  const a = (-90 + i * (360 / TRACOS.length)) * (Math.PI / 180);
  return [C + Math.cos(a) * raio * v, C + Math.sin(a) * raio * v];
}

const caminho = (pts: [number, number][]): string => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + 'Z';

/** O hexágono de uma das linhas de fundo. */
const anel = (v: number): string => caminho(TRACOS.map((_, i) => ponto(i, v)));

export function RadarPersonalidade({ p, size = 260, animado = true }: { p: Personalidade; size?: number; animado?: boolean }) {
  const vertices = TRACOS.map((t, i) => ponto(i, Math.max(0.04, p[t.id])));
  return (
    <svg className={`radar ${animado ? 'vivo' : ''}`} viewBox={`0 0 ${C * 2} ${C * 2}`} width={size} height={size} role="img" aria-label="Gráfico da personalidade">
      {/* o fundo: os anéis e os raios, apagados o bastante para não disputar com as pétalas */}
      <g className="radar-grade">
        {[0.25, 0.5, 0.75, 1].map((v) => (
          <path key={v} d={anel(v)} />
        ))}
        {TRACOS.map((t, i) => {
          const [x, y] = ponto(i, 1);
          return <line key={t.id} x1={C} y1={C} x2={x} y2={y} />;
        })}
      </g>

      {/*
       * As pétalas.
       *
       * Cada traço ocupa a sua fatia e cresce com o próprio número. Somadas, elas são o polígono
       * de sempre; separadas, cada uma tem dono e cor — é o que faz o gráfico ser lido como "essa
       * pessoa blefa" em vez de "essa pessoa tem uma área de 0,43".
       */}
      {TRACOS.map((t, i) => {
        const v = Math.max(0.04, p[t.id]);
        // meio eixo para cada lado: a pétala ocupa a fatia do traço e encosta na do vizinho
        const a = ponto(i - 0.5, v);
        const b = ponto(i + 0.5, v);
        return (
          <path
            key={t.id}
            className="radar-petala"
            d={caminho([[C, C], a, ponto(i, v * 1.06), b])}
            style={{ fill: t.cor, ['--atraso' as string]: `${i * 0.07}s` }}
          />
        );
      })}

      {/* o contorno clássico por cima: é ele que deixa comparar dois gráficos de relance */}
      <path className="radar-linha" d={caminho(vertices)} />
      {TRACOS.map((t, i) => {
        const [x, y] = vertices[i];
        return <circle key={t.id} className="radar-ponto" cx={x} cy={y} r={4} style={{ fill: t.cor }} />;
      })}

      {/* os rótulos, na cor do traço */}
      {TRACOS.map((t, i) => {
        const [x, y] = ponto(i, 1.28);
        return (
          <text key={t.id} className="radar-label" x={x} y={y} style={{ fill: t.cor }}>
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
  );
}

/** As etiquetas de uma personalidade. Sem nenhuma em destaque, diz isso em vez de ficar vazio. */
export function TagsPersonalidade({ p, vazio = 'Equilibrado' }: { p: Personalidade; vazio?: string }) {
  const tags = tagsDe(p);
  const dom = tracoDominante(p);
  if (!tags.length) {
    return (
      <div className="tracos">
        <span className="traco" style={{ ['--cor' as string]: dom.cor }} title={`Nenhum traço se destaca ainda — o mais alto é ${dom.label.toLowerCase()}`}>
          {vazio}
        </span>
      </div>
    );
  }
  return (
    <div className="tracos">
      {tags.map((t) => (
        <span key={t.id} className="traco" style={{ ['--cor' as string]: t.cor }} title={t.hint}>
          {t.tag}
        </span>
      ))}
    </div>
  );
}

/** A personalidade de um personagem (a que o bot dele joga). */
export function PersonalidadeDoPersonagem({ id, size = 200 }: { id: string; size?: number }) {
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
export function MinhaPersonalidade({ size = 260 }: { size?: number }) {
  const play = useSession((s) => s.account?.play);
  const partidas: ResumoDaPartida[] = useMemo(() => play ?? [], [play]);
  const p = useMemo(() => personalidadeDasPartidas(partidas), [partidas]);
  const maos = partidas.reduce((t, r) => t + r.maos, 0);
  if (!play) {
    return <p className="muted small">Entre numa conta do servidor para o jogo ler o seu jeito de jogar.</p>;
  }
  return (
    <div className="personalidade">
      {partidas.length === 0 ? (
        <p className="muted small">Ainda não há partidas suficientes. Jogue algumas e o gráfico se desenha sozinho.</p>
      ) : null}
      <RadarPersonalidade p={p} size={size} />
      <TagsPersonalidade p={p} />
      <small className="muted">
        {partidas.length === 0
          ? `Das suas últimas ${PARTIDAS_LEMBRADAS} partidas.`
          : `Das ${partidas.length === 1 ? 'suas últimas' : `suas últimas ${partidas.length}`} partida${partidas.length === 1 ? '' : 's'} — ${maos} ${maos === 1 ? 'mão' : 'mãos'}. O gráfico acompanha: mude o jogo e ele muda.`}
      </small>
    </div>
  );
}
