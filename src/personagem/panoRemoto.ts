/**
 * O pano solto de um personagem simulado fora da linha principal, num ajudante (panoTrabalho.ts).
 *
 * Um passo do pano custa de 5 a 25 ms por personagem (são milhares de pontos, em passos miúdos):
 * na linha principal, uma mesa de seis não cabia num quadro, e a saída era dar a vez a um personagem
 * de cada vez — o pano de cada um andava poucas vezes por segundo, em passos compridos, e ficava
 * para trás do braço. Aqui cada personagem tem o ajudante dele: o pano anda a cada quadro, com o
 * tempo de verdade, e a linha principal só copia os pontos que chegam.
 *
 * Os panos daqui (`Pano`, feitos na linha principal) são só o desenho: a geometria que vai para a
 * cena. O que chega do ajudante tem um quadro de atraso; os pontos presos ao corpo são trazidos para
 * onde os ossos estão agora (`repregar`), para a costura não se soltar do braço.
 */
import type { Boneco } from './boneco';
import type { MesaDoPano, Pano } from './pano';
import type { PedidoDePano, RespostaDoPano } from './panoTrabalho';

/** Dá para simular fora? (Sem Web Worker — os testes — o pano anda na linha principal, como antes.) */
export function podeSimularFora(): boolean {
  return typeof Worker !== 'undefined' && typeof window !== 'undefined';
}

/**
 * O passo mais comprido que se pede de uma vez (segundos). O tempo que passar disso não é simulado: o
 * pano atravessa-o levado pelos ossos (o `salto` de `Pano.passo`), em vez de ver o braço andar, num
 * passo, o caminho de um tempo bem maior.
 */
const PASSO_MAXIMO = 1 / 15;

export class PanosRemotos {
  private readonly ajudante: Worker;
  private esperando = false;
  private acumulado = 0;
  /** O pano já assentou na primeira pose (e pode aparecer). */
  assentado = false;
  /** O ajudante quebrou: quem usa volta a simular na linha principal. */
  falhou = false;
  /** Quanto custou o último passo, no ajudante (ms; para conferir de fora). */
  custo = 0;

  constructor(
    private readonly boneco: Boneco,
    traje: string,
    private readonly panos: Pano[],
  ) {
    this.ajudante = new Worker(new URL('./panoTrabalho.ts', import.meta.url), { type: 'module' });
    this.ajudante.onmessage = (e: MessageEvent<RespostaDoPano>) => this.chegou(e.data);
    this.ajudante.onerror = () => {
      this.falhou = true;
    };
    this.pedir({ tipo: 'vestir', traje });
  }

  private pedir(m: PedidoDePano, soltos: Transferable[] = []) {
    this.ajudante.postMessage(m, soltos);
  }

  /** As matrizes dos ossos no mundo, como estão agora. */
  private ossos(): Float32Array {
    const o = this.boneco.ossos;
    const m = new Float32Array(o.length * 16);
    for (let i = 0; i < o.length; i++) m.set(o[i].matrixWorld.elements, i * 16);
    return m;
  }

  /**
   * Pede um passo de `dt` segundos, com os ossos como estão agora. Se o ajudante ainda está no passo
   * anterior, o tempo fica guardado para o próximo pedido. Devolve se pediu.
   */
  passo(dt: number, mesa: MesaDoPano | null): boolean {
    this.acumulado += dt;
    if (this.esperando || this.falhou) return false;
    const ossos = this.ossos();
    this.esperando = true;
    const dtDoPasso = Math.min(this.acumulado, PASSO_MAXIMO);
    this.pedir({ tipo: 'passo', ossos, dt: dtDoPasso, salto: this.acumulado > 0 ? 1 - dtDoPasso / this.acumulado : 0, mesa }, [ossos.buffer]);
    this.acumulado = 0;
    return true;
  }

  /** Pede que o pano recomece de onde os ossos estão e assente ali (tantos passos de 1/60 s). */
  assentar(mesa: MesaDoPano | null, passos: number): boolean {
    if (this.esperando || this.falhou) return false;
    const ossos = this.ossos();
    this.esperando = true;
    this.acumulado = 0;
    this.pedir({ tipo: 'passo', ossos, dt: 0, mesa, recolocar: true, assentar: passos }, [ossos.buffer]);
    return true;
  }

  private chegou(m: RespostaDoPano) {
    if (m.tipo !== 'passo') return;
    this.esperando = false;
    this.custo = m.ms;
    m.pos.forEach((pos, i) => this.panos[i]?.receber(pos, m.nor[i]));
    if (m.assentou) this.assentado = true;
  }

  /** A costura acompanha os ossos de agora (a cada quadro, antes de desenhar). */
  repregar() {
    for (const p of this.panos) p.repregar();
  }

  destruir() {
    this.ajudante.terminate();
  }
}
