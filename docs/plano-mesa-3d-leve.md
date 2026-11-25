# Plano: mesa 3D leve (navegadores sem JIT e aparelhos fracos)

Escrito em 24/11/2026, na versão 0.9.22. Nada daqui está implementado.

## Por quê

A mesa 3D depende de JavaScript pesado: os personagens são modelados por código ao abrir a
partida, e posados, vestidos e desenhados a cada quadro. Num navegador que roda o V8 sem os
compiladores (`--jitless`), como o chromium-nx2 no Switch 2, o jogo funciona, mas fica lento
demais para jogar. O mesmo vale, em menor grau, para qualquer aparelho fraco.

Hoje a única saída é a mesa 2D (`?mesa=2d` no endereço, ou sozinha quando não há WebGL — veja
`src/mesa3d/modo.ts`). Ela não é afetada pela falta de JIT, mas não tem personagens, mãos, luvas
nem acessórios na mesa.

## O que foi medido

Mesa offline com 5 bots (6 personagens), pacote de produção, no Chrome do laptop de
desenvolvimento (GeForce RTX 5070), com e sem `--js-flags=--jitless`.

| | Com JIT | Sem JIT |
|---|---|---|
| Mesa 3D: personagens prontos | 16 s | 154 s |
| Mesa 3D: quadros por segundo | 154 | 46 |
| Mesa 2D: quadros por segundo | 149 | 152 |

Perfil de CPU da linha principal, sem JIT, pacote sem minificar (32 ms por quadro, com o custo
do próprio perfil):

| Parte do quadro | Tempo | Fatia |
|---|---|---|
| three.js mandando desenhar (231 chamadas; as sombras são 4,6 ms disso) | 13,8 ms | 43% |
| Posar as mãos (`posarPose`: animação, braço, dedos) | 5,8 ms | 18% |
| Pano na linha principal (`quadroDoPano`, `repregar`) | 3,6 ms | 11% |
| Bots pensando (em picos) | 1,0 ms | 3% |
| Resto (matrizes das peças, física, interface) | 8,0 ms | 25% |

Outras medidas da mesma cena:

- 7,2 milhões de triângulos por quadro, contando a passada das sombras (4,75 milhões na cena).
- 72 malhas, 231 chamadas de desenho por quadro.
- A espera para abrir é a modelagem dos corpos e das roupas, não as animações.

O que **não** foi medido: nada no Switch 2. A CPU dele é bem mais fraca por núcleo que a do
laptop, e a GPU também. A estimativa (não medida) para a mesa 3D de hoje, lá, é de alguns
minutos para abrir e de 10 a 20 quadros por segundo.

## As três frentes, na ordem do que rende mais

### 1. Guardar os modelos prontos

**O problema.** Corpo e roupas são modelados em Web Workers a cada vez que o jogo abre
(`src/mesa3d/modelos.ts`, `src/mesa3d/trabalho.ts`). O que fica pronto só é guardado na memória
(`corpoFeito`, `roupasFeitas`), e some ao fechar a página. Sem JIT são 154 s de espera, toda vez.

**O que fazer.**

- Guardar no IndexedDB o corpo e cada roupa modelada (a malha e os pesos são arrays tipados, que
  o IndexedDB guarda direto).
- A chave é a que já existe (o personagem vestido, com as luvas: `chaveDaRoupa`), mais a
  qualidade da malha e uma marca da versão da modelagem, para uma versão nova do jogo não usar
  um modelo velho. A marca pode ser a versão do aplicativo.
- Ao pedir um modelo: primeiro a memória, depois o IndexedDB, só então o ajudante.
- Apagar as entradas de versões antigas ao abrir.

**O ganho.** Da segunda partida em diante com os mesmos personagens e luvas, a espera da
modelagem some. A primeira vez continua lenta.

**A conferir antes.**

- O tamanho de cada roupa guardada. Pelos triângulos da cena, são dezenas de megabytes por mesa;
  se passar do que o navegador deixa guardar, a frente 2 (malha mais grossa) vem antes.
- Se o IndexedDB persiste no chromium-nx2 entre uma abertura e outra.
- Uma opção mais forte, se o tamanho permitir: gerar os modelos no build e servi-los como
  arquivos. Aí nem a primeira vez espera, mas cada combinação de luvas é outro arquivo.

### 2. Modo leve de desenho

**O problema.** Mandar desenhar é a maior fatia do quadro (43%), e a cena tem triângulos demais
para uma GPU fraca.

**O que fazer.** Um modo "leve", com três mudanças independentes:

- **Malha mais grossa.** `QUALIDADE_DO_JOGO` (`src/mesa3d/modelos.ts`) hoje é
  `{ corpo: 0.0045, mao: 0.0016 }`. Uma segunda qualidade, mais grossa, corta os triângulos e
  também o tempo de modelar. O limite é o que as mãos e as luvas aguentam sem perder a forma.
- **Sem sombras de verdade.** Desligar o `shadowMap` (`src/mesa3d/cena.ts`,
  `src/mesa3d/sombras.ts`) tira uma passada inteira de desenho. As fichas e as cartas já têm a
  sombra de contato, um borrão debaixo delas (`sombraDasFichas`, `sombraDasCartas`); as mãos
  precisariam de uma parecida, porque é a sombra de verdade que mostra a que altura a mão está.
- **Menos chamadas de desenho.** Cada peça de roupa é uma malha própria presa a um osso
  (`src/mesa3d/ator.ts`). Juntar as peças de mesmo material numa malha só diminui as chamadas e
  a troca de programas (`setProgram` é 6,2 ms do quadro).

**Como se escolhe o modo.** Uma opção nas configurações (3D completa, 3D leve, 2D), e a troca
sozinha quando os primeiros segundos da mesa ficam abaixo de um mínimo de quadros.

**O ganho.** Ataca os 43% do desenho, os triângulos na GPU e o tempo de modelar. É a frente com
mais efeito no quadro, e a mais trabalhosa.

**O risco.** É visual: a malha grossa e a falta de sombra aparecem. Cada mudança precisa de foto
de antes e depois, das mãos de perto.

### 3. Poses gravadas a 30 por segundo

**O problema.** A cada quadro, cada personagem recalcula a pose: a trilha da animação, o braço, a
subida da mão até não entrar na mesa, os 21 números dos dedos (`posarPose` e `posarNaMesa`, em
`src/personagem/animacoes.ts`). São 18% do quadro.

**O que fazer.**

- Ao preparar os clipes (`src/mesa3d/clipes.ts`), ou no build, gravar de cada animação a rotação
  de cada osso 30 vezes por segundo.
- Na partida, ler os dois quadros vizinhos e interpolar, em vez de posar.
- Guardar junto os objetos de cada instante (as fichas e as cartas do clipe).

**O que não se grava direto.**

- A entrega de cartas e os gestos do baralho, que dependem dos lugares da mesa: gravar por
  número de lugares, ou continuar calculando só esses.
- O relaxo sorteado dos dedos: gravar algumas variantes.
- As passagens entre animações (`entrePoses`): misturar as poses gravadas. A mão perde a correção
  que a impede de entrar na mesa durante a passagem; conferir com o conferidor de animações.

**O ganho.** O quadro fica uns 20% mais leve. Sozinha, esta frente não torna a mesa jogável num
aparelho sem JIT; vale depois das outras duas.

## O que ficou de fora, e por quê

- **Gravar as mãos como vídeo ou imagens.** Tiraria todo o 3D, mas são 13 trajes × 6 lugares ×
  umas 25 animações (perto de 2.000 vídeos), multiplicados por cada luva e acessório de pulso,
  por mão. Acabaria com a personalização na mesa. E o vídeo acelerado do chromium-nx é H.264,
  que não tem transparência.
- **Mesa 2D como modo oficial.** Já funciona e não sofre sem JIT. Falta só a opção nas
  configurações (hoje é pelo endereço). É o caminho mais curto para jogar no Switch 2, e pode
  ser feito antes de tudo isto.

## Como medir de novo

- Abrir o pacote de produção num Chrome com `--js-flags=--jitless` e comparar com o normal: o
  tempo até os personagens ficarem prontos (`window.mesa3d.atores`, cada um com `pronto`) e os
  quadros por segundo (contando `requestAnimationFrame`).
- Para o perfil por função, gerar o pacote com `build.minify: false` e usar o perfil de CPU do
  Chrome.
- Os triângulos e as chamadas de desenho saem de `window.mesa3d.renderer.info.render`.
- Cada frente deve ser medida antes e depois, sem JIT, na mesma mesa (offline, 5 bots).
- No fim, medir no aparelho de verdade: os números do laptop só servem para comparar uma versão
  com a outra.
