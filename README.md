# ♠ Pokeru

Poker 2D multiplayer inspirado na apresentação de **Mahjong Soul**: na mesa aparecem apenas
**cartas e fichas**, animadas em 2D (SVG). Dois jogos — **Texas Hold'em No-Limit** e
**poker de 5 cartas (draw)** — em três formatos de partida (cash, Sit & Go e normal, com
rodadas fixas). Aplicação web empacotada como app desktop com **Tauri v2**.

## Como rodar

```bash
npm install

# Navegador (desenvolvimento)
npm run dev            # http://localhost:1420

# App desktop Tauri (abre a janela nativa; roda o Vite automaticamente)
npm run app

# Servidor multiplayer (WebSocket) — porta 3001 por padrão
npm run server         # PORT=4000 npm run server para trocar a porta

# Servidor pronto para hospedar (JavaScript compilado, roda com node puro)
npm run server:build && npm run server:start

# Testes do motor, da sala e do servidor
npm test

# Instalador do app desktop (veja "Instalador do cliente")
npm run app:build
```

### Jogando online

1. Em um computador da rede (ou num servidor), rode `npm run server`.
2. No app, vá em **Jogar Online**, informe `ws://IP-DO-HOST:3001` e conecte.
3. Crie uma sala (escolha o **jogo** e o **formato**), adicione bots se quiser e compartilhe o **código** da sala.

A **Partida Rápida** roda tudo offline, no próprio app, contra bots (fácil / normal / difícil).

### O nome mudou

O jogo se chamava **PokerSoul** e agora é **Pokeru**. O que já estava salvo continua valendo: na
primeira vez que a versão nova abre, o perfil, os estilos e o vínculo são copiados das chaves
antigas (`pokersoul-profile`, `pokersoul-bond`) para as novas (`pokeru-*`) — as antigas ficam onde
estão, então voltar para uma versão anterior também funciona (`src/util/storage.ts`).

Dois detalhes que **não** migram sozinhos: o app desktop tem um identificador novo
(`com.pokeru.app`), então o instalador do Pokeru instala **ao lado** do PokerSoul e não enxerga os
dados dele (o navegador, sim); e os ids internos de estilos e temas (`table-soul`, `back-sakura`,
`default`…) ficaram como estavam de propósito, para os perfis salvos continuarem apontando para as
mesmas peças. Só os **nomes visíveis** mudaram: o tema padrão virou *Sakura*, e os estilos *Roxo
Soul* e *Pastel Soul* viraram *Roxo Sakura* e *Pastel Sakura*.

## Servidor em Rust (em andamento)

O servidor está sendo reescrito em **Rust**, com as progressões (fichas, vínculo, estatísticas)
num banco **Turso/libSQL**. O de Node (`server/`) continua sendo o que roda até o novo alcançar
paridade — nada quebra no meio do caminho.

As regras do poker passam a existir em dois lugares: em Rust no servidor e em TypeScript no
cliente (que precisa delas para a Partida Rápida offline). Para as duas não divergirem em
silêncio, **os testes vieram junto no porte**: os casos de `shared/engine.test.ts` estão
traduzidos em `server-rs/src/engine_tests.rs`, incluindo os de conservação de fichas em 200 mãos
de Hold'em e 120 de poker de 5 cartas. Se uma regra sair diferente, um deles quebra.

```bash
cd server-rs
cargo test     # regras do jogo
cargo run      # executável (ainda sem rede)
```

| Fatia | Situação |
|---|---|
| Baralho, avaliador (nomes em português e cartas do jogo) | pronto |
| Motor: Hold'em, poker de 5 cartas, potes laterais, eventos | pronto |
| Bots (equidade Monte Carlo e a troca do draw) | a fazer |
| Sala e lobby (fila com ritmo, vezes, views por jogador) | a fazer |
| Contas e progressão no Turso | a fazer |
| WebSocket + HTTP, Docker, virada do Node para o Rust | a fazer |

O banco é escolhido por variável de ambiente: em desenvolvimento um arquivo local
(`DATABASE_URL=file:./data/pokeru.db`), em produção a instância do Turso
(`DATABASE_URL=libsql://…` e `DATABASE_TOKEN=…`).

## Hospedar o servidor

O servidor guarda as **contas dos jogadores** — saldo, vínculo com os personagens e números — e
hospeda as mesas. Ele é autossuficiente: JavaScript compilado, `node` e o pacote `ws`.

```bash
npm run server:build          # compila server/ + shared/ para dist-server/
DATA_DIR=./data npm run server:start
```

| Variável | Padrão | O que faz |
|---|---|---|
| `PORT` | `3001` | porta HTTP/WebSocket |
| `SERVER_NAME` | `Pokeru Server` | nome que aparece no cliente |
| `DATA_DIR` | `./data` | pasta dos dados (`accounts.json`) |
| `POKERU_ACCOUNTS` | `1` | `0` desliga as contas: mesas livres, nada salvo |
| `STARTING_MONEY` | `10000` | saldo de uma conta nova |
| `FAUCET` | `2000` | recarga de cortesia de quem zera (`0` desliga) |
| `MAX_ACCOUNTS` | `1000` | teto de contas guardadas; passando dele, quem chega joga só em mesas livres |
| `ADMIN_TOKEN` | — | libera `/admin` (sem ele, as rotas respondem 403) |

Rotas HTTP: `/health` (estado do servidor, bom para monitorar) e, com `ADMIN_TOKEN`,
`/admin/accounts` (lista) e `/admin/gift?id=a-…&amount=1000` (fichas de presente). Passe o token
no cabeçalho `X-Admin-Token` ou em `?token=`.

### Contas, saldo e vínculo

- **Identidade sem senha:** na primeira conexão o servidor cria a conta e devolve um **token**
  aleatório; o cliente guarda o token por endereço de servidor e o manda no `hello` para voltar
  como ele mesmo. O servidor nunca vê (nem pede) uma senha.
- **Saldo:** sentar numa mesa com buy-in **desconta** do saldo e as fichas da mesa são esse
  buy-in; sair (ou o fim da partida) **devolve** o que sobrou. No cash, a recompra custa outro
  buy-in — sem saldo, o jogador sai da partida. Mesas com buy-in `0` são livres: fichas de
  brinquedo, ninguém paga nada.
- **Vínculo:** num servidor com contas, quem pontua é o **servidor** (as mesmas regras de
  `shared/bond.ts`), e o cliente mostra o que vier de lá — inclusive os corações que fecharam.
  Offline, o vínculo continua salvo no próprio cliente.
- **Desligar com cuidado:** no `SIGTERM`/`SIGINT` o servidor devolve as fichas de quem está
  sentado e grava os dados antes de sair (é o que o Docker manda ao parar o contêiner).
- Os dados ficam num JSON só (`accounts.json`), gravado de forma atômica e em bloco. Dá para
  copiar, versionar e ler com os olhos; se o arquivo estiver corrompido, o servidor guarda uma
  cópia `.broken-…` e sobe vazio em vez de não subir.

**O que este servidor não é:** não há senha, e-mail nem confirmação de identidade — quem tem o
token é o dono da conta. Isso é de propósito (é um servidor de jogo entre amigos, e as fichas não
valem dinheiro de verdade), mas quer dizer que qualquer um que alcance a porta cria uma conta e
recebe o saldo inicial. Para uma mesa fechada, deixe o servidor numa rede privada (ou atrás de um
proxy com autenticação), use senha nas salas e ajuste `MAX_ACCOUNTS`.

### Imagem no Artifact Registry (GCP)

A imagem do servidor é publicada automaticamente pela action
`.github/workflows/server-image.yml`: quando algo de `server/`, `shared/` ou do `Dockerfile` muda
na **main** (ou a pedido, em *Actions → Run workflow*), ela constrói e empurra para

```
us-central1-docker.pkg.dev/gen-lang-client-0425635607/pokeru/server
```

com três etiquetas: o `sha` curto do commit (a imagem exata), `vX.Y.Z` (a versão do
`package.json`) e `latest`. A região é a mesma da VM do Turso (`us-central1`), então o pull de lá
é rápido e sem custo de saída.

**Autenticação sem chave:** a action troca o token OIDC do próprio job por credenciais do GCP
(Workload Identity Federation). Não há segredo guardado no GitHub, e o provedor só aceita
tokens vindos deste repositório.

Na VM, para rodar a imagem publicada:

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
docker pull us-central1-docker.pkg.dev/gen-lang-client-0425635607/pokeru/server:latest
docker run -d -p 3001:3001 -v pokeru-data:/data   us-central1-docker.pkg.dev/gen-lang-client-0425635607/pokeru/server:latest
```

O que existe no GCP para isso funcionar (tudo no projeto `gen-lang-client-0425635607`):

| Recurso | Nome |
|---|---|
| Artifact Registry (docker, us-central1) | `pokeru` |
| Conta de serviço (escreve no registry) | `github-pokeru@gen-lang-client-0425635607.iam.gserviceaccount.com` |
| Pool de identidade | `github` |
| Provedor OIDC (preso a este repositório) | `pokeru` |

### Docker

Duas imagens: o **servidor de jogo** (`Dockerfile`) e o **servidor web do cliente**
(`Dockerfile.client`, nginx servindo a interface). O `docker-compose.yml` sobe as duas:

```bash
docker compose up -d --build
# cliente: http://localhost:8080 · servidor: ws://localhost:3001
```

- O endereço do servidor de jogo é escolhido **na hora de subir** o cliente, não no build:
  `POKERU_SERVER_URL=ws://192.168.0.10:3001`. O entrypoint escreve `/config.js` e o app usa
  como padrão (o jogador ainda pode digitar outro). Use o endereço que o **navegador** dos
  jogadores alcança — `localhost` só serve para quem abre no próprio host.
- Os dados do servidor ficam no volume `pokeru-data` (montado em `/data`).
- Atrás de um proxy com TLS, use `wss://…` no `POKERU_SERVER_URL` e encaminhe o WebSocket
  (`Upgrade`/`Connection`) para a porta 3001.
- As duas imagens rodam sem privilégios e trazem `HEALTHCHECK`.

### Instalador do cliente

`npm run app:build` (Tauri v2) gera o instalador da plataforma em
`src-tauri/target/release/bundle/`:

| Sistema | Saída |
|---|---|
| Windows | `nsis/Pokeru_<versão>_x64-setup.exe` (instala para o usuário, sem pedir administrador) e `msi/Pokeru_<versão>_x64_en-US.msi` |
| macOS | `dmg/Pokeru_<versão>_x64.dmg` e `macos/Pokeru.app` |
| Linux | `deb/`, `rpm/` e `appimage/` |

### Atualização automática

A partir da 0.2.0 o app desktop **se atualiza sozinho**: ao abrir, ele lê o `latest.json` da última
release no GitHub, compara com a versão que está rodando e, se houver uma mais nova, baixa,
instala e reinicia (um aviso com a barra de progresso aparece no canto). Sem internet ou sem
release, o jogo abre normalmente — a falha é só um aviso que some sozinho. Dá para desligar em
**Configurações → Jogo → Atualizar o app sozinho ao abrir**.

O pacote precisa estar **assinado**, senão o atualizador recusa. A chave pública fica em
`src-tauri/tauri.conf.json` (`plugins.updater.pubkey`) e a privada **fora do repositório**, em
`~/.tauri/pokeru-updater.key` — sem ela não dá para publicar atualizações, então guarde uma cópia
(num gerenciador de senhas, ou como segredo do repositório se um dia o build for automatizado).

### Publicar uma versão

A publicação é automática: **criar uma tag `vX.Y.Z` na main** dispara a action
(`.github/workflows/release.yml`), que compila o app assinado, cria a release e sobe o instalador,
o `.sig` e o `latest.json`.

```bash
npm run version:set 0.2.1     # troca a versão nos três arquivos (e nos locks)
git commit -am "Versao 0.2.1" && git push origin main
git tag v0.2.1 && git push origin v0.2.1
```

Antes da primeira publicação, configure os dois segredos em **Settings → Secrets and variables →
Actions**:

| Segredo | Conteúdo |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | o arquivo `~/.tauri/pokeru-updater.key` inteiro |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | a senha da chave (vazio se ela não tiver) |

A action confere, antes de compilar, se a chave está configurada, se a tag aponta para um commit da
**main** e se os três arquivos de versão batem com a tag — e roda `typecheck` e os testes, para não
publicar algo quebrado. Ela também aceita ser rodada à mão em *Actions → Release → Run workflow*
(escolhendo a tag), útil para repetir uma publicação que falhou.

Hoje ela gera só o instalador de **Windows**; o fim do arquivo explica como transformar o job numa
matriz com macOS e Linux.

**Publicando na mão** (sem a action), o caminho continua valendo:

```bash
TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/pokeru-updater.key) TAURI_SIGNING_PRIVATE_KEY_PASSWORD= npm run app:build
npm run release:json    # monta o latest.json a partir do instalador e do .sig
# e suba os três arquivos numa release com a tag vX.Y.Z
```

O `latest.json` precisa estar na **última** release (é o endereço `releases/latest/download/…` que
o app consulta), e a tag tem de bater com a versão. Quem está na 0.1.0 não se atualiza sozinho (a
versão é anterior ao atualizador): é instalar a 0.2.0 na mão uma vez.

### Branches

| Branch | Para quê |
|---|---|
| `main` | o que está publicado; tag aqui = release automática |
| `develop` | o trabalho do dia a dia — **sem action nenhuma**, nada roda e nada é publicado |

O fluxo é trabalhar na `develop` (ou em branches a partir dela), juntar na `main` quando estiver
pronto e, só então, criar a tag. Como a action só escuta tags `v*.*.*`, empurrar para a `develop`
nunca dispara nada; e se uma tag for criada fora da main, a action para com um erro explicando.

Para distribuir um instalador **já apontando** para o seu servidor, defina o endereço no build:

```bash
VITE_SERVER_URL=wss://poker.seudominio.com npm run app:build
```

A ordem de escolha do endereço no cliente é: o que o jogador digitou (fica salvo no perfil), o
`config.js` do servidor web, a variável `VITE_SERVER_URL` do build e, por último, o **servidor
oficial** — o IP fixo da VM, embutido em `DEFAULT_SERVER_URL` (`src/store/profile.ts`). É por isso
que o app instalado já abre com o endereço preenchido.

Para desenvolver contra um servidor local, rode com `VITE_SERVER_URL=ws://localhost:3001 npm run
dev` (ou troque o endereço em **Configurações → Rede**, que ele fica salvo no perfil).

## Estrutura

```
shared/            Código comum ao servidor e ao cliente
  cards.ts         Baralho, embaralhamento (crypto)
  evaluator.ts     Avaliador de mãos (melhor 5 de 7) com nomes em português
  engine.ts        Mão de poker: Hold'em e 5 cartas (draw), blinds, min-raise, all-in curto, side pots, showdown
  bot.ts           IA (equidade Monte Carlo + pot odds + blefe por dificuldade; e a troca no draw)
  room.ts          Sala: assentos, fila de eventos com ritmo, timers, bots, rebuy/eliminação
  lobby.ts         Conexões e salas (independe de transporte)
  protocol.ts      Mensagens cliente ⇄ servidor e visões da mesa
  styles.ts        Tipos, presets e sanitização dos estilos cosméticos
server/
  index.ts         Servidor WebSocket (Node) que liga sockets ao Lobby, /health e /admin
  accounts.ts      Contas: saldo, vínculo e números, com token de volta
  store.ts         Arquivo JSON com gravação atômica e em bloco
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

As falas são sempre as **comuns**; as **próprias** do personagem tocam no all-in e na vitória — e nos
momentos que o [vínculo](#vínculo-com-os-personagens) liberar.

| Momento | Fala |
|---|---|
| check / bet / call / raise / fold | chamada comum: チェック, ベット, コール, レイズ (リレイズ num aumento sobre aumento), フォールド |
| all-in | fala própria `allin` (se ainda não tiver áudio, a comum オールイン) |
| showdown | quem abre as cartas primeiro diz a comum オープン — com o 1º coração de vínculo, a sua fala própria `showdown` |
| vitória | o vencedor anuncia a mão (ワンペア … ロイヤルストレートフラッシュ) e diz a própria `win` ou `big_win` |
| derrota na mão disputada | nada — com o 3º coração, a fala própria `lose` |
| sua vez | nada — com o 4º coração, a fala própria `turn` |

As falas liberadas pelo vínculo valem só para o **seu** personagem (os outros jogadores têm o vínculo
deles, na máquina deles). As demais falas próprias dos `.jsonc` (`join`, `bust`, `rebuy`, `blinds_up`,
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

### Fichas jogadas na mesa

As fichas apostadas nao sao "postas" no lugar: sao atiradas.

- **Arremesso** (`Director.toss` + `chipFlight` em `Flyers.tsx`): cada aposta sorteia duracao, altura do
  arco, giro no ar e a quicada ao pousar — a pilha sobe, gira um pouco, bate na mesa e assenta. O all-in
  usa forca maior (arco mais alto, mais giro e quicada). A recolha para o pote tambem varia.
- **Onde caem** (`betSpot`, em `layout.ts`): o ponto da aposta ganha um desvio pequeno, estavel por
  assento e rua (`hash01`/`jitter` em `src/util/rand.ts`). Como o desvio e estavel, a pilha parada fica
  exatamente onde as fichas cairam — o diretor e a mesa calculam o mesmo ponto.
- **Pilhas tortas** (`ChipStack`/`ChipColumnSvg`): cada ficha sai um tantinho do prumo e as colunas nao
  assentam todas na mesma linha, com uma semente (`seed`) — parecem empilhadas a mao, e a mesma pilha
  desenha sempre igual.

Para ver: `/preview.html?cena=mesa` (pilhas na mesa) e `/preview.html?cena=voo&motion=1` (o voo).

### Volume das cartas e das fichas

Nada de 3D de verdade: o volume e desenhado.

- **Cartas** (`.cardv`, em `global.css`): atras da carta fica uma copia dela deslocada para baixo, na cor
  do papel visto de lado (o miolo na frente, a margem no verso), com um fio escuro na quina — e isso da a
  espessura. Por cima, um verniz: luz numa quina e sombra na oposta. A cor, o raio dos cantos e a
  espessura saem do proprio estilo da carta, em variaveis CSS (`--ce`, `--cr`, `--ct`), entao qualquer
  estilo criado no Estudio ganha o volume junto. No plano inclinado da mesa, o deslocamento aparece
  virado para a camera, como uma carta deitada.
- **Fichas** (`ChipColumnSvg`): cada ficha e um cilindro — a lateral usa um degrade que escurece nas
  quinas e clareia no meio, as listras da borda ficam mais apagadas nas beiradas, ha um friso de luz na
  quina de cima de cada ficha e uma sombra de contato embaixo da pilha, para assentar no feltro.

Para conferir sem jogar: `/preview.html?cena=solids` (de perto) e `/preview.html?cena=mesa` (na mesa).

### Como as animações funcionam

O servidor emite cada evento da mão (`blinds`, `deal`, `action`, `collect`, `street`, `showdown`, `win`…)
junto com o estado resultante, e espaça os eventos no tempo. No cliente, o **diretor**
(`src/game/director.ts`) encena cada evento — as fichas saem da placa do jogador para a aposta, as
cartas saem do dealer e, ao desistir, voam para o descarte, o bordo vira na mesa e o pote voa para o
vencedor — e só então aplica o estado. Se houver atraso, as animações aceleram sozinhas.

## Jogos e formatos de partida

Cada mesa combina **um jogo** (as regras da mão) com **um formato** (como a partida começa e acaba).
As duas escolhas aparecem na **Partida Rápida** (contra bots) e ao **criar uma sala online**.

| Jogo | Como funciona |
|---|---|
| **Texas Hold'em** | duas cartas na mão, cinco na mesa; ruas pré-flop, flop, turn e river |
| **Poker de 5 cartas** | cinco cartas na mão e **nenhuma** na mesa: aposta, **troca de cartas** e aposta final |

| Formato | Como funciona |
|---|---|
| **Cash** | sem fim; quem quebra faz **rebuy** automático e qualquer um entra no meio |
| **Sit & Go** | eliminação, blinds dobrando a cada N mãos, até sobrar um |
| **Normal** | **número fixo de rodadas** (4, 8, 12 ou 20 — o padrão é 8) e o placar no fim |

No **modo normal** os blinds não sobem, quem quebra é eliminado (sem rebuy) e ninguém entra no meio
da partida. A mesa mostra **Rodada 3/8** no topo e no console central, o chat avisa a cada rodada
(e na última), e no fim entra a [tela de placar](#fim-da-partida-placar) com a classificação por
fichas. Se sobrar só um jogador antes da última rodada, a partida acaba ali. O número de rodadas é
`rounds` em `RoomSettings` (1 a 100).

### Poker de 5 cartas (draw)

A mão tem duas rodadas de apostas com a **troca** entre elas, e vale pelas cinco cartas do jogador:

1. **Apostas** (`predraw`) — blinds e apostas como no Hold'em (o motor é o mesmo).
2. **Troca** (`draw`) — na sua vez, **clique nas suas cartas** para marcá-las e confirme em
   **Trocar N** (ou **Manter as cinco**; `Enter` também confirma). Dá para trocar de nenhuma a
   cinco cartas; as novas entram no lugar das velhas. Se o baralho acabar, os descartes voltam
   embaralhados — nunca uma carta que está na mão de alguém.
3. **Apostas finais** (`postdraw`) e showdown.

Quantas cartas cada um trocou é informação pública: aparece na placa do jogador (*trocou 2*,
*manteve*) e no histórico. Os bots mantêm mão feita (sequência ou melhor), ficam com trinca, dois
pares, par e projetos de quatro cartas para flush ou sequência, e no resto seguram as cartas altas
(`botDraw` em `shared/bot.ts`); a equidade deles vem de `estimateEquity5`, que compara a mão fechada
com mãos aleatórias de cinco cartas.

No motor (`shared/engine.ts`), `variant` escolhe o jogo, `phase` diz se a vez é de apostar ou de
trocar (`act` e `draw` são os dois caminhos) e `Hand.draw(seat, indices)` faz a troca. Na rede a vez
de trocar chega como o evento `drawTurn` e o pedido do jogador como `{ type: 'draw', discards }`.

A mão de cinco cartas é um leque mais junto e mais estreito que o de duas (`myHandLayout` em
`src/game/layout.ts`): as pontas têm de caber entre a sua placa e o painel de ações, senão a interface
cobre as cartas. Cada carta fica por cima da anterior, então o canto com o valor continua visível; a
dica da mão vai para cima das cartas e o contador da sua vez desvia para a esquerda.

Para conferir sem jogar: `/preview.html?cena=draw5` (mesa de cinco cartas na hora da troca, com o
painel de apostas — o mais largo — para medir os espaços; `&rects=<seletores>` imprime as caixas).

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
`/preview.html?cena=result` (também `result-board`, `result-long`, `result-pays`, `match`, `match-6`, `match-me6`, `solids`, `mesa`, `voo`,
`bond`, `bond-aviso`, `personagens`, `draw5`, e `&ui=victorian`, `&rects=1` para medir as caixas —
`&rects=<seletores>` mede outras). Ela não entra no build do app.

Os dados vêm do evento `win` (potes, vencedores, `best` de cada mão) e são montados em
`Director.roundResult`; a faixa diagonal do fundo usa a mesma função `cutinBand` do tema de UI.

**Quem pagou quem** sai exato, inclusive com potes laterais: `computePots` (em `shared/engine.ts`) agora
devolve também quanto **cada** jogador colocou em cada pote, e isso viaja no evento `win` (`PotResult.paid`).
No cliente, `paymentsTo(pots, seat)` soma, para cada perdedor, as fichas dele que foram para aquele
vencedor — em pote dividido conta só a fração que ele levou, e um co-vencedor não aparece como pagador.
Os dois estão cobertos por testes (`shared/engine.test.ts` e `src/game/payments.test.ts`).

## Fim da partida (placar)

Quando a partida acaba (Sit & Go ou as rodadas do modo normal) ou quando **você** sai da mesa, entra a tela de placar
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

## Vínculo com os personagens

Jogar com um personagem aproxima você dele. Cada mão rende **pontos de vínculo** e a barra tem **cinco
corações**; a cada coração completo o personagem entrega uma **recompensa** dele.

| Momento | Pontos |
|---|---|
| mão ganha | 10 (18 quando a mão feita é sequência ou melhor) |
| mão disputada e perdida | 4 |
| mão em que você desistiu | 1 |
| partida terminada | 20 (40 se você ficou em 1º) |

Ganhar rende mais, mas **perder também conta**: quem senta e joga junto acumula. Os corações custam
`60 · 140 · 260 · 440 · 700` pontos (`HEART_COST`), o que dá cerca de uma dúzia de partidas para o
vínculo completo. Sair da mesa fecha a partida e entrega o bônus dela.

Quem guarda o progresso depende de onde se joga: **offline** fica na máquina (`pokeru-bond`, como
o perfil); num **servidor com contas** quem manda é o servidor. As regras ficam em `shared/`
justamente para os dois lados contarem igual; o catálogo de recompensas é do cliente
(`src/game/bond.ts`).

**Fichas e vínculo são do servidor** quando há sessão com conta:

- o servidor pontua o vínculo no fim de cada mão e da partida, e cobra/devolve as fichas nas mesas
  a dinheiro — o cliente não calcula nada disso, só recebe a foto da conta e mostra;
- o vínculo da mão vai para o personagem com que ela **começou**, e o bônus da partida para o
  personagem com que você **sentou** — trocar de personagem no meio não muda o dono dos pontos;
- na sessão online, o vínculo que aparece (e o que ele libera: vozes, emotes) é só o que veio do
  servidor. O progresso local existe em paralelo, para o jogo offline, e volta a aparecer quando
  você desconecta — mexer no armazenamento do navegador não libera nada numa partida online;
- o saldo mostrado fora do servidor é o **último conhecido** (aparece apagado): é uma lembrança
  para a barra não abrir vazia, e o valor de verdade chega ao conectar.

**Onde aparece:** em **Personagens**, o botão **♥ Vínculo · N/5** abre a *página de vínculo* do
personagem (a galeria mostra os corações de cada retrato e a ficha traz a barra curta); o menu principal
traz a barra curta na placa do personagem; o placar final mostra quanto a partida rendeu; e o coração que
fecha aparece na hora, num cartão no alto da tela que sai sozinho — sem travar a mesa.

### A página de vínculo

Aberta pelo botão, em `src/game/BondPage.tsx`. Traz, lado a lado:

- **Missões** (`BOND_MISSIONS`): o que rende pontos, com o valor de cada uma e o quanto você já fez com
  aquele personagem (vitórias, derrotas, desistências, partidas), mais o resumo de mãos e partidas.
- **Recompensas**: as cinco, com o conteúdo à mostra. Nas de voz, o momento em que ela toca, a fala em
  japonês, a tradução, o nome do arquivo de áudio, a chamada comum que ela substitui e o botão **♪ Ouvir**
  (desligado enquanto o coração não fecha, quando o áudio não existe ou quando as vozes estão desligadas —
  o motivo aparece embaixo). As que ainda não existem dizem que chegam numa atualização.

O texto e a tradução das falas saem de `src/audio/falas.ts`, que lê os `.jsonc` **como texto** (`?raw`) —
a tradução de cada fala vive no comentário da linha.

**As recompensas de cada coração** (escada padrão, igual para todos os personagens):

| Coração | Recompensa |
|---|---|
| 1º | **Voz de mão completa**: no showdown, o personagem abre as cartas com a fala dele em vez da chamada comum |
| 2º | **Emote exclusivo** (em breve) |
| 3º | **Voz de derrota** |
| 4º | **Voz na sua vez** |
| 5º | **Skin alternativa** (em breve) |

Para conferir sem jogar: `/preview.html?cena=bond` (a página), `/preview.html?cena=bond-aviso` (o cartão
do coração completo) e `/preview.html?cena=personagens` (a tela de Personagens inteira).

### Acrescentar uma recompensa

O catálogo está em `src/game/bond.ts`: `DEFAULT_LADDER` é a escada usada por todos e `BOND_LADDERS` guarda
escadas próprias por personagem (id → degraus). Um degrau diz o coração, o tipo, o nome/descrição (texto ou
função que recebe o personagem) e **o que libera**:

```ts
{ heart: 3, kind: 'voice', icon: '♪', voice: 'lose', name: 'Voz de derrota', description: (c) => `…` }
```

- `voice: 'lose'` — uma fala própria do personagem (momento em `FALA_SLOTS`, `src/audio/voice.ts`). Lembre
  de incluir o momento em `FALAS_USADAS` (e no `PROPRIAS_USADAS` de `scripts/audios-faltando.mjs`) para o
  áudio dela ser cobrado, e em `FALA_MOMENTO` (`src/audio/falas.ts`) para o rótulo na página.
- `replaces: 'show'` — a chamada comum que a fala própria substitui, quando for o caso: a página mostra as
  duas, para ficar claro o que muda.
- `emotes: ['🔥']` — emotes novos; precisam estar em `EMOTES` (`shared/protocol.ts`), e o menu de emotes
  esconde os emotes de vínculo até o coração fechar.
- `skin: { kind, id }` — um estilo (preset de `shared/styles.ts`).
- `soon: true` — recompensa ainda não implementada: fecha o coração, aparece como "em breve" e não libera nada.

Quem consome são o diretor (vozes, via `voiceUnlocked`), o menu de emotes e a lista de estilos — todos só
perguntam se a recompensa está liberada. O progresso salvo está em `src/store/bond.ts`; a barra, o placar e
o aviso do coração em `src/game/BondBar.tsx`; a página em `src/game/BondPage.tsx`.

## Efeitos das cartas vencedoras

No showdown, as cartas que **fazem o jogo** do vencedor ganham uma **moldura animada** e um efeito por
cima — na mesa e nas cartas do vencedor. Só elas: num par de setes, os dois setes; em dois pares, as
quatro; na trinca, as três; na quadra, as quatro (o acompanhante fica de fora). Sequência, flush,
full house e straight flush usam as cinco. O resto da mão aparece apagado, sem efeito.

Quem decide é o avaliador: `evaluateHand` devolve `best` (as cinco melhores) e `core` (só as que
fazem o jogo, em `coreCards`); o `core` viaja no resultado do pote e vira o `highlight` da mesa. Cada jogador escolhe o seu em **Estúdio → Efeitos**, e o efeito viaja
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
| Sakura (padrão) | o original: noite roxa, dourado e rosa, pétalas de sakura, fonte arredondada |
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
- **Exportar/Importar** usa JSON (`{"pokeru":1,"kind":"back","style":{…}}`), para trocar estilos com amigos.
- O **verso das cartas** é enviado aos outros jogadores (sem imagens personalizadas);
  frente das cartas, fichas e mesa são preferências visuais só suas.
