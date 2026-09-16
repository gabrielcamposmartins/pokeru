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

## Tema vitoriano (branch `tema-vitoriano`)

Versão da interface com ar de salão aristocrático do século XIX:

- **Visual**: `src/styles/victorian.css`, carregado depois de `global.css`, troca a paleta (mogno, bordô,
  verde-garrafa, latão e marfim) e o acabamento de tudo: papel de parede adamascado com lambri de madeira,
  painéis de couro com cantoneiras de latão, botões como placas gravadas, retratos em moldura dourada,
  faixa de veludo nos cut-ins e poeira dourada à luz de velas no menu.
- **Tipografia**: Cormorant Garamond (texto), Cinzel e Cinzel Decorative (títulos) e Playfair Display (números).
- **Estilos**: presets novos, equipados por padrão (uma migração do perfil os equipa uma vez): cartas
  *Vitoriana*, versos *Brasão Bordô* e *Salão Esmeralda*, fichas *Marfim e Latão* e mesas *Salão Vitoriano* e
  *Veludo Bordô*. Há também o padrão **Damasco** (verso e mesa) e o emblema **flor-de-lis**. A mesa ganhou
  tachas de latão na borda.
- **Sons**: clique de madeira, sineta de balcão na sua vez, tique-taque de relógio no fim do tempo e arpejo
  de cravo na vitória.

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
