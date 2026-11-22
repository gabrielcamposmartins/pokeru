/**
 * O trabalho pesado da mesa 3D, feito fora da página e em paralelo (um ajudante por modelo): modelar
 * o corpo e costurar a roupa de cada personagem levam segundos cada um — um de cada vez, a tela de
 * carregamento ficaria quase um minuto no ar, e travada. É o mesmo de src/dev/mesaTrabalho.ts (a
 * página de apoio da mesa), aqui do lado do jogo.
 *
 * Mensagens que chegam:
 *   { tipo: 'corpo', q }            modela o corpo e pesa a pele
 *   { tipo: 'roupa', traje, luva?, q }  costura as peças de um traje (o que acompanha o corpo), com a luva dele ou a do estilo dado (uma para cada mão, se forem diferentes)
 *   { tipo: 'coberto', pos, unha }  diz que vértices do corpo a roupa costurada antes cobre
 */
import { gerarPersonagem, type Qualidade } from '../personagem/corpo';
import { montarEsqueleto, pesar } from '../personagem/esqueleto';
import { TRAJES, cobertoPor, costurarPecas, pecasDoTraje, type LuvasDoTraje, type Peca } from '../personagem/roupa';

type Pedido = { tipo: 'corpo'; q: Qualidade } | { tipo: 'roupa'; traje: string; luva?: LuvasDoTraje; q: Qualidade } | { tipo: 'coberto'; pos: Float32Array; unha: Float32Array };

const trabalho = self as unknown as { onmessage: ((e: MessageEvent<Pedido>) => void) | null; postMessage(msg: unknown, transfer?: Transferable[]): void };
const esqueleto = montarEsqueleto();
/** As peças do traje costurado por último (para dizer depois o que elas cobrem). */
let pecas: Peca[] = [];

trabalho.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.tipo === 'corpo') {
      const malha = gerarPersonagem(m.q);
      const pesos = pesar(malha, esqueleto);
      trabalho.postMessage({ tipo: 'corpo', malha, pesos }, [malha.pos.buffer, malha.nor.buffer, malha.ar.buffer, malha.unha.buffer, malha.idx.buffer, pesos.indices.buffer, pesos.pesos.buffer, pesos.rosado.buffer]);
    } else if (m.tipo === 'roupa') {
      const traje = TRAJES.find((t) => t.id === m.traje);
      if (!traje) throw new Error(`traje desconhecido: ${m.traje}`);
      pecas = pecasDoTraje(traje, m.luva);
      const r = costurarPecas(pecas, esqueleto, m.q);
      const { malha } = r;
      trabalho.postMessage({ tipo: 'roupa', traje: m.traje, roupa: r }, [malha.pos.buffer, malha.nor.buffer, malha.ar.buffer, malha.unha.buffer, malha.idx.buffer, malha.cor.buffer, malha.cor2.buffer, malha.enfeite.buffer, r.indices.buffer, r.pesos.buffer]);
    } else {
      const coberto = cobertoPor(pecas, m);
      trabalho.postMessage({ tipo: 'coberto', coberto }, [coberto.buffer]);
    }
  } catch (err) {
    // a página espera uma resposta: o erro volta como resposta (senão a promessa ficaria pendurada)
    trabalho.postMessage({ tipo: 'erro', mensagem: (err as Error).message ?? String(err) });
  }
};
