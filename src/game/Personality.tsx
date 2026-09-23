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
 * Seis pétalas, uma por traço, cada uma na sua cor: em vez de um polígono técnico, o gráfico é uma
 * flor torta, e a pétala que mais avança é o traço que mais aparece na mesa. Dá para ler a pessoa
 * de longe, sem encostar em número nenhum — que é como se lê alguém numa mesa de verdade.
 *
 * O desenho é de propósito **cartunesco**: contorno grosso, cor cheia, ponta arredondada. Um radar
 * fino e cinzento parece um relatório, e ninguém volta a um relatório; uma flor a pessoa mostra
 * para o amigo. A leitura não perde nada com isso — a distância do centro continua sendo o número.
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

/**
 * Uma pétala: sai do centro, incha para os lados e fecha na ponta.
 *
 * São duas curvas com o controle puxado para fora do eixo — é o que dá a barriga. A ponta não é um
 * bico: o contorno arredondado do traço arremata, e o resultado parece desenhado à mão em vez de
 * calculado.
 */
function petala(i: number, v: number): string {
  const [cx, cy] = [C, C];
  const [tx, ty] = ponto(i, v);
  const [ax, ay] = ponto(i - 0.58, v * 1.02);
  const [bx, by] = ponto(i + 0.58, v * 1.02);
  return `M${n1(cx)} ${n1(cy)} Q${n1(ax)} ${n1(ay)} ${n1(tx)} ${n1(ty)} Q${n1(bx)} ${n1(by)} ${n1(cx)} ${n1(cy)}Z`;
}

/** Onde os rótulos ficam, em raios. Perto o bastante para a flor não parecer pequena no meio deles. */
const R_LABEL = 1.17;

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
  // o piso deixa um toco visível do traço que a pessoa não tem: pétala nenhuma é um buraco no desenho
  const valor = (id: Traco) => Math.max(0.16, Math.min(1, p[id]));

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
        {/* o fundo: os anéis e os raios, apagados o bastante para não disputar com as pétalas */}
        <g className="radar-grade">
          {[0.34, 0.67, 1].map((v) => (
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
         * Cada traço ocupa a sua fatia e cresce com o próprio número. É o que faz o gráfico ser
         * lido como "essa pessoa blefa" em vez de "essa pessoa tem uma área de 0,43".
         */}
        <g className="radar-flor">
          {TRACOS.map((t, i) => {
            const v = valor(t.id);
            const aceso = alvo?.t.id === t.id;
            return (
              <g key={t.id} className={`radar-petala-g ${aceso ? 'on' : ''} ${alvo && !aceso ? 'apagada' : ''}`}>
                <path
                  className="radar-petala"
                  d={petala(i, v)}
                  style={{ fill: t.cor, ['--atraso' as string]: `${i * 0.08}s` }}
                  onMouseEnter={() => mirar(t, i)}
                />
                {/* o brilhinho de dentro: a pétala deixa de ser um recorte de papel colorido */}
                <path className="radar-brilho" d={petala(i, v * 0.52)} aria-hidden />
              </g>
            );
          })}
        </g>

        {/* o miolo da flor, que esconde as seis pontas se encontrando no centro */}
        <circle className="radar-miolo" cx={C} cy={C} r={9} />

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

      {/* a explicação do traço, ancorada na ponta da pétala */}
      {alvo && (
        /* a dica foge do rótulo: nas pétalas de cima ela desce, nas de baixo ela sobe */
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
          Ainda não há partidas para ler. Jogue algumas e a flor entorta sozinha.
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
