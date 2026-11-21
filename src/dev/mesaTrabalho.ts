/**
 * O trabalho pesado da página da mesa (mesa.html), feito fora da página, em paralelo: modelar o
 * corpo e costurar a roupa de cada personagem levam segundos cada um; um de cada vez seria quase um
 * minuto.
 *
 * Mensagens que chegam:
 *   { tipo: 'corpo', q }          modela o corpo e pesa a pele
 *   { tipo: 'roupa', traje, q }   costura as peças de um traje (o que acompanha o corpo)
 *   { tipo: 'coberto', pos, unha } diz que vértices do corpo a roupa costurada antes cobre
 */
import { gerarPersonagem, type Qualidade } from '../personagem/corpo';
import { montarEsqueleto, pesar } from '../personagem/esqueleto';
import { TRAJES, cobertoPor, costurarPecas, type Peca } from '../personagem/roupa';

type Pedido = { tipo: 'corpo'; q: Qualidade } | { tipo: 'roupa'; traje: string; q: Qualidade } | { tipo: 'coberto'; pos: Float32Array; unha: Float32Array };

const trabalho = self as unknown as { onmessage: ((e: MessageEvent<Pedido>) => void) | null; postMessage(msg: unknown, transfer?: Transferable[]): void };
const esqueleto = montarEsqueleto();
/** As peças do traje costurado por último (para dizer depois o que elas cobrem). */
let pecas: Peca[] = [];

trabalho.onmessage = (e) => {
  const m = e.data;
  if (m.tipo === 'corpo') {
    const malha = gerarPersonagem(m.q);
    const pesos = pesar(malha, esqueleto);
    trabalho.postMessage({ tipo: 'corpo', malha, pesos }, [malha.pos.buffer, malha.nor.buffer, malha.ar.buffer, malha.unha.buffer, malha.idx.buffer, pesos.indices.buffer, pesos.pesos.buffer, pesos.rosado.buffer]);
  } else if (m.tipo === 'roupa') {
    const traje = TRAJES.find((t) => t.id === m.traje);
    if (!traje) throw new Error(`traje desconhecido: ${m.traje}`);
    pecas = traje.pecas();
    const r = costurarPecas(pecas, esqueleto, m.q);
    const { malha } = r;
    trabalho.postMessage({ tipo: 'roupa', traje: m.traje, roupa: r }, [malha.pos.buffer, malha.nor.buffer, malha.ar.buffer, malha.unha.buffer, malha.idx.buffer, malha.cor.buffer, malha.cor2.buffer, malha.enfeite.buffer, r.indices.buffer, r.pesos.buffer]);
  } else {
    const coberto = cobertoPor(pecas, m);
    trabalho.postMessage({ tipo: 'coberto', coberto }, [coberto.buffer]);
  }
};
