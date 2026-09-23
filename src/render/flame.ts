/* =====================================================================
 * A silhueta de uma labareda.
 *
 * Mora sozinha porque duas coisas queimam no jogo com o mesmo fogo: a carta do efeito de vitória
 * "Fogo" (src/render/cardfx.tsx) e a aura de labaredas que fica atrás do personagem
 * (src/render/aura.tsx). Uma chama desenhada duas vezes viraria duas chamas diferentes na primeira
 * vez que alguém mexesse numa delas.
 *
 * Aqui só há geometria: quem escolhe cor, tamanho, desfoque e ritmo é quem chama.
 * ===================================================================== */

/** Quantos pontos desenham cada lado da labareda. Mais que isto não se vê; menos, vira serrote. */
export const PONTOS = 26;

/** A altura em que a labareda é mais larga. */
const BARRIGA = 0.36;

/**
 * A meia-largura da labareda na altura `t` (0 no pé, 1 na ponta).
 *
 * Do pé até a barriga o contorno é um **arco**: a largura abre depressa em cima do pé e chega à
 * barriga já plana, que é o que dá o lado redondo. Reta — e era —, a barriga lia como um triângulo
 * com o canto lixado.
 *
 * Da barriga para cima ela cai com expoente maior que 1: segura a largura pelo meio do corpo e
 * afina de vez só perto do fim. É de propósito que a ponta **não** acompanhe a barriga: fosse ela
 * redonda também, a labareda viraria uma gota, e o que faz o olho ler fogo é o bico.
 */
export function meiaLargura(t: number, w: number): number {
  if (t <= BARRIGA) {
    const u = (BARRIGA - t) / BARRIGA;
    return (0.76 + 0.3 * Math.sqrt(1 - u * u)) * w;
  }
  return 1.06 * Math.pow(1 - (t - BARRIGA) / (1 - BARRIGA), 1.35) * w;
}

/**
 * Uma labareda ondulada — a cobrinha.
 *
 * O contorno não é uma forma rígida que balança: ele é **construído altura por altura**, e em cada
 * altura o eixo do corpo anda para o lado segundo uma senoide. Uma onda inteira ao longo do corpo
 * é o que desenha o S; e a amplitude cresce com a altura (`t^1.7`), então o pé fica plantado no
 * chão e quem viaja é a ponta.
 *
 * `fase` é o instante da onda. Rodando a fase, a mesma crista percorre o corpo e a ponta é jogada
 * para a direita, para a esquerda e de volta — que é o movimento de uma chama parada queimando, e
 * não o de uma chama sendo entortada por inteiro. Quem escolhe o sentido é `ondaDe`.
 */
export function labareda(cx: number, y0: number, h: number, w: number, amp: number, fase: number): string {
  const n = (v: number) => v.toFixed(1);
  const eixo = (t: number) => cx + amp * Math.pow(t, 1.7) * Math.sin(Math.PI * 2 * (t * 1.15) + fase);
  const alt = (t: number) => y0 - h * t;
  const meia = (t: number) => meiaLargura(t, w);

  let d = `M${n(eixo(0) - meia(0))} ${n(y0)}`;
  // sobe pela esquerda até o bico (em t = 1 a largura é zero: o bico é um ponto só)
  for (let i = 1; i <= PONTOS; i++) {
    const t = i / PONTOS;
    d += ` L${n(eixo(t) - meia(t))} ${n(alt(t))}`;
  }
  // e desce pela direita
  for (let i = PONTOS - 1; i >= 0; i--) {
    const t = i / PONTOS;
    d += ` L${n(eixo(t) + meia(t))} ${n(alt(t))}`;
  }
  // o pé fecha numa barriga, não numa reta
  d += ` C${n(eixo(0) + meia(0) * 0.5)} ${n(y0 + h * 0.05)} ${n(eixo(0) - meia(0) * 0.5)} ${n(y0 + h * 0.05)} ${n(eixo(0) - meia(0))} ${n(y0)} Z`;
  return d;
}

/** Quantos instantes da onda entram na volta. Oito já interpola liso, e a volta fecha no primeiro. */
export const QUADROS = 8;

/**
 * Os desenhos de uma volta inteira da onda, para o `<animate>` percorrer.
 *
 * A fase anda **para trás**, e é isso que faz a crista subir do pé para a ponta. Descendo, a chama
 * parecia escorrer; subindo, ela parece ser empurrada pelo calor, que é para onde o fogo vai.
 */
export function ondaDe(cx: number, y0: number, h: number, w: number, amp: number, faseInicial: number): string {
  return Array.from({ length: QUADROS + 1 }, (_, i) => labareda(cx, y0, h, w, amp, faseInicial - (i / QUADROS) * Math.PI * 2)).join(';');
}
