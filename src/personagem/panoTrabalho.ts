/**
 * O ajudante do pano (um Web Worker): simula o pano solto de um personagem fora da linha principal.
 *
 * Quem desenha (veja panoRemoto.ts) manda, a cada quadro em que o pano precisa andar, onde os ossos
 * estão — as matrizes deles no mundo — e quanto tempo passou; daqui voltam os pontos e as normais de
 * cada pano do traje. O boneco daqui não é posado: só recebe as matrizes, que é tudo o que o pano lê.
 */
import { Boneco } from './boneco';
import { montarEsqueleto } from './esqueleto';
import { Pano, type MesaDoPano } from './pano';
import { TRAJES } from './roupa';

export type PedidoDePano =
  | { tipo: 'vestir'; traje: string }
  | {
      tipo: 'passo';
      /** As matrizes dos ossos no mundo, uma atrás da outra (16 números cada), na ordem do esqueleto. */
      ossos: Float32Array;
      dt: number;
      mesa: MesaDoPano | null;
      /** Recomeça de onde os ossos estão (a primeira pose, ou depois de um pulo). */
      recolocar?: boolean;
      /** Em vez de um passo de `dt`, deixa o pano assentar: tantos passos de 1/60 s, e para. */
      assentar?: number;
    };

export interface RespostaDoPano {
  tipo: 'passo';
  pos: Float32Array[];
  nor: Float32Array[];
  /** Foi um assentamento (o pano está pronto para aparecer). */
  assentou: boolean;
  /** Quanto custou, em milissegundos. */
  ms: number;
}

let boneco: Boneco | null = null;
let panos: Pano[] = [];

const responder = (m: RespostaDoPano, soltos: Transferable[]) => (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void }).postMessage(m, soltos);

self.onmessage = (e: MessageEvent<PedidoDePano>) => {
  const m = e.data;
  if (m.tipo === 'vestir') {
    boneco = new Boneco(montarEsqueleto());
    const b = boneco;
    panos = (TRAJES.find((t) => t.id === m.traje)?.panos?.() ?? []).map((def) => new Pano(b, def));
    return;
  }
  if (!boneco) return;
  const t0 = performance.now();
  boneco.ossos.forEach((o, i) => o.matrixWorld.fromArray(m.ossos, i * 16));
  for (const p of panos) {
    if (m.recolocar) p.recolocar();
    if (m.assentar) p.assentar(m.mesa, m.assentar);
    else p.passo(m.dt, m.mesa);
    p.atualizar();
  }
  const pos = panos.map((p) => p.pos.slice());
  const nor = panos.map((p) => p.normais.slice());
  responder({ tipo: 'passo', pos, nor, assentou: !!m.assentar, ms: performance.now() - t0 }, [...pos, ...nor].map((a) => a.buffer));
};
