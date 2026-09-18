# ♠ PokerSoul

Poker (Texas Hold'em No-Limit) 2D multiplayer inspirado na apresentação de **Mahjong Soul**:
na mesa aparecem apenas **cartas e fichas**, animadas em 2D (SVG).
Aplicação web empacotada como app desktop com **Tauri v2**.

## Como rodar

```bash
npm install

# Navegador (desenvolvimento)
npm run dev            # http://localhost:1420

# App desktop Tauri (abre a janela nativa; roda o Vite automaticamente)
npm run app

# Servidor multiplayer (WebSocket) — porta 3001 por padrão
npm run server         # PORT=4000 npm run server para trocar a porta

# Testes do motor e da sala
npm test

# Instalador do app desktop
npm run app:build
```

### Jogando online

1. Em um computador da rede (ou num servidor), rode `npm run server`.
2. No app, vá em **Jogar Online**, informe `ws://IP-DO-HOST:3001` e conecte.
3. Crie uma sala (cash com rebuy ou Sit & Go), adicione bots se quiser e compartilhe o **código** da sala.

A **Partida Rápida** roda tudo offline, no próprio app, contra bots (fácil / normal / difícil).

## Estrutura

```
shared/            Código comum ao servidor e ao cliente
  cards.ts         Baralho, embaralhamento (crypto)
  evaluator.ts     Avaliador de mãos (melhor 5 de 7) com nomes em português
  engine.ts        Mão de Hold'em: blinds, apostas, min-raise, all-in curto, side pots, showdown
  bot.ts           IA (equidade Monte Carlo + pot odds + blefe por dificuldade)
  room.ts          Sala: assentos, fila de eventos com ritmo, timers, bots, rebuy/eliminação
  lobby.ts         Conexões e salas (independe de transporte)
  protocol.ts      Mensagens cliente ⇄ servidor e visões da mesa
  styles.ts        Tipos, presets e sanitização dos estilos cosméticos
server/index.ts    Servidor WebSocket (Node) que liga sockets ao Lobby
src/
  game/            Mesa: layout, diretor de animações, placas, painel de ações
  render/          Arte SVG: cartas (frente/verso), fichas, mesa, personagens
  screens/         Menu, Partida Rápida, Online, Sala, Estúdio, Configurações
  store/           Estado (zustand): perfil/estilos persistidos, sessão, mesa
  net/transport.ts WebSocket ou Lobby local (modo offline)
src-tauri/         Casca desktop Tauri v2 (Rust)
```

### Personagens (skins com corpo inteiro + retrato)

Como no Mahjong Soul, cada jogador escolhe um **personagem**: **Marina**, **Ren**, **Tobi** ou
**Yukina**. Cada um tem a **ilustração de corpo inteiro** (menu principal, tela de Personagens,
cut-ins de all-in/mão grande) e o **retrato**, que aparece **na mesa** durante a partida.

- As ilustrações originais ficam em `assets/characters/`; `npm run prepare:characters` remove o fundo
  branco e gera `public/characters/<id>/full.png` e `portrait.png` (veja `public/characters/README.md`
  para adicionar novos personagens).
- Na rede o personagem viaja só pelo id — todos veem sempre a arte oficial.
- Os bots levam o nome do personagem e evitam repetir os que já estão na mesa.

### Arquivos .jsonc (JSON com comentários)

As falas ficam em um arquivo por personagem, em `assets/characters/falas/<personagem>.jsonc`
(ex.: `marina.jsonc`), com comentários `//` (e `/* */`) que são ignorados. Basta importar:
`import marina from '../assets/characters/falas/marina.jsonc'`.

As **falas comuns** a todos os personagens ficam em `assets/characters/falas/comum.jsonc`
(`"personagem": "Todos"`): as chamadas de jogada (チェック, ベット, コール, レイズ, オールイン, フォールド…) e os
nomes das mãos (ワンペア … ロイヤルストレートフラッシュ), como as chamadas do Mahjong Soul. O texto é o mesmo;
cada personagem as fala com a própria voz.

**Áudios das falas** (`.wav`), em `assets/characters/falas/`:

```
<personagem>/<NNN>_<fala>.wav          falas próprias (NNN = posição em <personagem>.jsonc)
<personagem>/comum/<NNN>_<fala>.wav    falas comuns na voz do personagem (NNN = posição em comum.jsonc)
```

- `npm run audios:organizar` move as falas comuns geradas na raiz (`<NNN>_<Personagem>_<fala>.wav`, como a
  ferramenta de voz entrega) para `<personagem>/comum/`, reconhecendo personagem e fala pelo nome.
- `npm run audios:faltando` confere quais ainda não foram gerados (ou estão vazios/mudos) e grava a lista em
  `assets/characters/falas/audios-faltando.json` — JSON estrito no schema `{ personagem, falas }`, uma
  entrada por voz, pronto para a ferramenta de voz.

**No jogo** (`src/audio/voice.ts`, disparado pelo diretor), uma voz de cada vez:

As falas são sempre as **comuns**; as **próprias** do personagem só tocam no all-in e na vitória.

| Momento | Fala |
|---|---|
| check / bet / call / raise / fold | chamada comum: チェック, ベット, コール, レイズ (リレイズ num aumento sobre aumento), フォールド |
| all-in | fala própria `allin` (se ainda não tiver áudio, a comum オールイン) |
| showdown | quem abre as cartas primeiro diz a comum オープン |
| vitória | o vencedor anuncia a mão (ワンペア … ロイヤルストレートフラッシュ) e diz a própria `win` ou `big_win` |

As outras falas próprias dos `.jsonc` (`join`, `turn`, `showdown`, `lose`, `bust`, `rebuy`, `blinds_up`,
`idle` e as das jogadas) ficam guardadas, mas não tocam no jogo. Enquanto a fala do all-in toca, os outros
jogadores ficam quietos (as vozes deles que chegarem nesse meio-tempo são descartadas); chamadas comuns não
calam ninguém, e os anúncios (showdown, vitória) apenas esperam a fala terminar. Áudios que ainda não
existem são pulados. Volume e liga/desliga das vozes ficam em **Configurações → Áudio**.

- **Node**: carregue o hook `server/jsonc-register.mjs` (os scripts `npm run server` já fazem isso):
  `node --import ./server/jsonc-register.mjs app.mjs`.
- **App (Vite/Tauri) e testes (Vitest)**: o plugin em `vite.config.ts` cuida disso.
- Para ler manualmente: `parseJsonc(texto)` em `shared/jsonc.ts`.
- Os `.json` da mesma pasta (ex.: `marina.json`) têm os **mesmos comentários** e são sincronizados a
  partir dos `.jsonc` por `npm run build:falas` (edite os `.jsonc` e rode o comando de novo). O Node
  (com o hook) e o Vite também aceitam comentários neles; ferramentas que exigem JSON estrito (ex.: a
  opção "JSON array") vão rejeitá-los com `Unexpected token '/'`.

### Mesa semi-3D

A mesa segue a apresentação do Mahjong Soul: a câmera vê o **plano da mesa inclinado**
(`perspective + rotateX`, ver `src/game/layout.ts`). Tudo que fica "deitado" — feltro, cartas do bordo
e dos oponentes, botão do dealer — é desenhado dentro desse plano; o que fica "em pé" —
pilhas de fichas (desenhadas em 3/4), placas dos jogadores, anúncios de jogada e **a sua mão, grande
na parte de baixo da tela** — é posicionado no palco pela função `project()`, que usa a mesma
matemática do CSS. No centro há um **console** com o pote, a rua e luzes nas bordas apontando para
quem está na vez.

### Como as animações funcionam

O servidor emite cada evento da mão (`blinds`, `deal`, `action`, `collect`, `street`, `showdown`, `win`…)
junto com o estado resultante, e espaça os eventos no tempo. No cliente, o **diretor**
(`src/game/director.ts`) encena cada evento — as fichas saem da placa do jogador para a aposta, as
cartas saem do dealer e, ao desistir, voam para o descarte, o bordo vira na mesa e o pote voa para o
vencedor — e só então aplica o estado. Se houver atraso, as animações aceleram sozinhas.

## Fim do round (showdown)

Quando a mão vai a showdown, entra uma tela de resultado no estilo das telas de vitória de Mahjong Soul
(`src/game/RoundResult.tsx`):

Uma tarja diagonal na cor do personagem cruza a tela (o fundo escuro sobra nos cantos, como na
referência) e o conteúdo se distribui assim:

- **à esquerda**, o personagem do vencedor em corpo inteiro, com a placa de nome e o título embaixo;
- **em cima**, as cartas da mão feita, separadas em **Mão** (as do jogador) e **Mesa**, com o efeito de
  vitória dele nas cartas que entraram na mão (as que sobraram ficam apagadas);
- **no meio**, o nome da mão em letra grande e, se o pote foi dividido, com quem;
- **embaixo à esquerda**, **quem pagou**: cada jogador que deixou fichas com o vencedor, com retrato,
  nome e o valor;
- **embaixo à direita**, o total ganho (`+1.240`), as fichas dele depois de receber e, quando há potes
  laterais, a quebra por pote;
- **botão Continuar** no canto, com contagem: a tela sai sozinha em 5s, no clique, ou quando a mão
  seguinte começa.

Para mexer no layout sem jogar uma mão, o servidor de desenvolvimento serve uma página de apoio:
`/preview.html?cena=result` (também `result-board`, `result-long`, `result-pays`, `match`, `match-6`, `match-me6`, e
`&ui=victorian`, `&rects=1` para medir as caixas). Ela não entra no build do app.

Os dados vêm do evento `win` (potes, vencedores, `best` de cada mão) e são montados em
`Director.roundResult`; a faixa diagonal do fundo usa a mesma função `cutinBand` do tema de UI.

**Quem pagou quem** sai exato, inclusive com potes laterais: `computePots` (em `shared/engine.ts`) agora
devolve também quanto **cada** jogador colocou em cada pote, e isso viaja no evento `win` (`PotResult.paid`).
No cliente, `paymentsTo(pots, seat)` soma, para cada perdedor, as fichas dele que foram para aquele
vencedor — em pote dividido conta só a fração que ele levou, e um co-vencedor não aparece como pagador.
Os dois estão cobertos por testes (`shared/engine.test.ts` e `src/game/payments.test.ts`).

## Fim da partida (placar)

Quando a partida acaba (Sit & Go) ou quando **você** sai da mesa, entra a tela de placar
(`src/game/MatchEnd.tsx`) — ela é individual: cada jogador vê a sua no próprio cliente.

- **à esquerda**, o personagem de **quem ficou em primeiro**;
- **à direita**, as posições em placas inclinadas: lugar, retrato, nome, fichas e o resultado em
  relação às fichas iniciais. A do primeiro é destacada e avança para a esquerda; a sua leva o selo
  **Você**;
- **embaixo**, mesa, modo e quantas mãos foram jogadas;
- **botões**: `Confirmar` (sai da tela; se você estava saindo da mesa, é aí que a saída acontece),
  mais `Jogar de novo` (só para o anfitrião) e `Sair da mesa` no fim da partida.

**Paginação** (`pagesOf`, coberta por testes): são páginas de quatro (1º–4º, 5º–8º…). Se você ficou
fora dos quatro primeiros, a primeira página mostra 1º, 2º, 3º e **a sua linha no quarto lugar, com a
sua posição real** — assim não é preciso paginar para se achar; as páginas seguintes continuam a
partir do 3º.

## Partida contra bots: pular a mao e sair

- **Pular a mao**: numa mesa com um humano so (Partida Rapida, ou sala online com bots), depois de
  desistir aparece **Pular mao** no canto. O cliente pede `skipHand` e a sala corre o resto da mao sem
  as pausas das animacoes (`Room.skipHand` liga o modo `rushing`: eventos quase sem espera e bots
  decidindo na hora). A mao **e jogada de verdade** e quem ganhou continua sendo anunciado (o aviso de
  vitoria e a linha no historico); so a tela de resultado do round e o audio das falas ficam de fora.
  O pedido e recusado se voce ainda esta na mao ou se ha outro humano na mesa.
- **Sair**: ao confirmar a saida, a partida **acaba ali**. O cliente congela a mesa
  (`director.freeze()`: o que ainda chegar e ignorado) e, no modo offline, a sala local e fechada na
  hora — bots e temporizadores param. O placar aparece sobre a mesa parada e a saida em si acontece no
  **Confirmar**.

## Efeitos das cartas vencedoras

No showdown, as cartas que formam a mão vencedora ganham uma **moldura animada** e um efeito por cima —
na mesa e nas cartas do vencedor. Cada jogador escolhe o seu em **Estúdio → Efeitos**, e o efeito viaja
pela rede: você vê o efeito de quem ganhou (as cartas da mesa usam o seu, se você ganhou).

| Efeito | O que faz |
|---|---|
| Brilho Dourado / Azul / Rosé / Esmeralda / Violeta | moldura pulsando com faíscas, em cores diferentes |
| Prisma | moldura tracejada correndo, trocando de cor |
| Relâmpago | descargas saltam pelas bordas e a carta pisca |
| Fogo | chamas lambem a carta e brasas sobem |
| Gelo | geada nas bordas e cristais nos cantos |
| Luz Sagrada | feixes de luz giram atrás da carta |
| Sombra | fumaça arroxeada engole a carta |

Cada efeito também tem um som (sino, descarga, labareda, congelamento, coral, sopro), tocado na vitória.

**Para criar um efeito novo** (catálogo em `src/render/cardfx.tsx`):

1. acrescente o id em `WIN_FX_IDS` (`shared/styles.ts`) — é o que viaja na rede e é sanitizado;
2. acrescente a entrada em `WIN_FX` com nome, descrição, as duas cores, o tipo de moldura
   (`pulse`, `march`, `flicker`), o som e, se quiser, uma função `layers` que desenha as camadas
   (SVG onde a carta ocupa 0..100 x 0..140, podendo transbordar);
3. se a camada for nova, escreva as animações dela em `src/styles/cardfx.css`.

O efeito aparece sozinho no Estúdio; o teste `src/render/cardfx.test.ts` cobra que todo id tenha entrada.
Efeitos "só de cor" saem de uma linha: a função `glow(id, nome, descrição, cores)`.

## Aparência da interface (temas de UI)

No **Estúdio → UI** você escolhe a aparência da interface. Ao clicar num tema, a tela inteira já mostra a
pré-visualização; **Usar esta aparência** grava a escolha no perfil (sair sem aplicar volta à atual).
**Equipar estilos do tema** equipa as cartas, fichas, mesa e efeito de vitória que combinam com ele — a aparência sozinha não
troca seus estilos.

| Tema | Visual |
|---|---|
| Soul (padrão) | o original: noite roxa, dourado e rosa, pétalas de sakura, fonte arredondada |
| Vitoriano | salão aristocrático: mogno, bordô, verde-garrafa, latão e marfim; papel de parede adamascado, painéis de couro com cantoneiras, retratos em moldura dourada, tachas na mesa, cut-in em faixa de veludo; sineta, relógio de pêndulo e cravo |

Como funciona (`src/ui/themes.ts`):

- O App põe o id do tema em `<html data-ui="…">`. O tema padrão é o `global.css`; cada outro tema tem um CSS
  próprio com as regras dentro de `:root[data-ui='<id>'] { … }` (ex.: `src/styles/victorian.css`).
- O que não dá para fazer só com CSS fica no registro `UI_THEMES`: textos e ícones do menu, cores desenhadas
  em SVG (console do pote, borda da mesa), fundo do cut-in, conjunto de sons e os estilos que combinam.
- **Para adicionar um tema**: crie o CSS com o escopo `:root[data-ui='<id>']`, importe-o em `src/main.tsx` e
  acrescente uma entrada em `UI_THEMES`. Ele aparece sozinho no Estúdio.

Estilos criados para o tema vitoriano (disponíveis com qualquer aparência): cartas *Vitoriana* (fonte
*Clássica*), versos *Brasão Bordô* e *Salão Esmeralda*, fichas *Marfim e Latão*, mesas *Salão Vitoriano* e
*Veludo Bordô*, o padrão **Damasco** (verso e mesa) e o emblema **flor-de-lis**.

## Estúdio de estilos

Em **Estúdio** você cria e edita, com pré-visualização ao vivo:

| Categoria | O que dá para mudar |
|---|---|
| Frente das cartas | papel e degradê, borda, moldura, cores dos 4 naipes, fonte, tamanho do índice, centro (tradicional / naipe grande / minimalista), figuras (brasão / letra) |
| Verso das cartas | cores, 10 padrões (sakura, estrelas, treliça, escamas…), escala/opacidade, borda, emblema (naipes, lua, coroa, flor, texto) e **imagem própria** |
| Fichas | cores de cada um dos 8 valores, desenho da borda, centro, valor e brilho |
| Mesa | feltro, estampa, borda e friso, logotipo e cores do ambiente |

- Presets não são alterados: editar um preset cria automaticamente uma cópia sua.
- **🎲 Aleatório** gera variações harmônicas.
- **Exportar/Importar** usa JSON (`{"pokersoul":1,"kind":"back","style":{…}}`), para trocar estilos com amigos.
- O **verso das cartas** é enviado aos outros jogadores (sem imagens personalizadas);
  frente das cartas, fichas e mesa são preferências visuais só suas.
