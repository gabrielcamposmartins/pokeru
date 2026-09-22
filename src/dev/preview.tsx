/**
 * Página de apoio para desenvolvimento (não entra no app): abre /preview.html?cena=…
 * e desenha uma cena do palco parada, para conferir o layout sem jogar uma mão.
 *
 *   /preview.html?cena=result          fim de round (showdown)
 *   /preview.html?cena=match           fim de partida (4 jogadores)
 *   /preview.html?cena=match-6         fim de partida com 6 (duas páginas)
 *   /preview.html?cena=match-me6       você em 6º (1º, 2º, 3º e você no 4º lugar da lista)
 *   /preview.html?cena=result-board    mão feita só com o bordo (5 cartas na mesa)
 *   /preview.html?cena=result-long     nome de mão comprido e pote dividido
 *   /preview.html?cena=result-pays     mesa cheia: cinco jogadores pagaram o vencedor
 *   /preview.html?cena=solids          cartas e fichas de perto (volume)
 *   /preview.html?cena=mesa            a mesa parada (cartas deitadas no plano e fichas em pe)
 *   /preview.html?cena=placa           as placas da mesa: com titulo, com titulo comprido e sem
 *   /preview.html?cena=abertura        a abertura da partida (a "tela de carregamento" com os cards)
 *   /preview.html?cena=voo&motion=1    voo das fichas (arco, giro e quicada)
 *   /preview.html?cena=draw5           mesa do poker de 5 cartas na hora da troca (mão marcada)
 *   /preview.html?cena=bond            a página de vínculo (missões e recompensas com as falas)
 *   /preview.html?cena=bond-aviso      o cartão do coração completo e a barra curta
 *   /preview.html?cena=bond-tranca     o coração cheio e trancado, pedindo a combinação de presentes
 *   /preview.html?cena=personagens     a tela de personagens inteira (ocupa a janela, sem palco)
 *   /preview.html?cena=login           a tela de entrada (usuário, senha e "lembrar-me")
 *   /preview.html?cena=login-erro      a mesma tela com "lembrar" marcado e um erro do serviço
 *   /preview.html?cena=config          as configurações (sem conta)
 *   /preview.html?cena=config-logado   as configurações com uma conta logada
 *   /preview.html?cena=salas           a lista de salas do servidor (uma delas com senha)
 *   /preview.html?cena=menu            o menu principal
 *   /preview.html?cena=menu-sentando   o menu com Contra Bots montando a mesa no servidor
 *   /preview.html?cena=fila            o menu com a fila rápida aberta (fichas e padocoins)
 *   /preview.html?cena=fila-esperando  a fila procurando mesa
 *   /preview.html?cena=loja&aba=winfx  a loja (com conta, saldo nas duas moedas); aba= o tipo mostrado
 *   /preview.html?cena=loja&aba=gift   os presentes à venda (a aba que abre por padrão)
 *   /preview.html?cena=loja&aba=ticket&ver=flores  a aba de tickets (carrossel, prêmios e chances)
 *   /preview.html?cena=loja&aba=ui     a aba de aparências (carrossel e a amostra do tema)
 *   /preview.html?cena=galeria&aba=back  a Galeria: a coleção, com o carimbo de raridade
 *   /preview.html?cena=giro            a cena do giro revelando um prêmio (&premio=, &dup=1)
 *   /preview.html?cena=girando         o ticket girando, antes da resposta do servidor
 *   /preview.html?cena=galeria&ver=character:yukina  a Galeria com a peça já aberta no palco
 *   /preview.html?cena=loja-sem-pado   a loja sem Discord vinculado (só fichas)
 *   /preview.html?cena=conta           as configurações com a conta e o vínculo do Discord
 *   /preview.html?cena=titulos         as configurações com os títulos e o progresso das conquistas
 *   /preview.html?cena=estudio&aba=ui  o Estúdio (aba= face|back|chip|table|fx|ui)
 *   &nivel=45                          o nível do jogador no menu (muda a cor da barra de xp)
 *   &motion=1                          liga as animacoes; &ui=victorian usa o tema vitoriano
 */
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import '@fontsource/m-plus-rounded-1c/400.css';
import '@fontsource/m-plus-rounded-1c/500.css';
import '@fontsource/m-plus-rounded-1c/700.css';
import '@fontsource/m-plus-rounded-1c/800.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/cinzel-decorative/700.css';
import '@fontsource/cinzel-decorative/900.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/600-italic.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/cormorant-garamond/700-italic.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/800.css';
import '@fontsource/playfair-display/900.css';
import '@fontsource/playfair-display/900-italic.css';
import '../styles/global.css';
import '../styles/cardfx.css';
import '../styles/victorian.css';
import { BACK_PRESETS, CHARACTER_PRESETS, CHIP_PRESETS, FACE_PRESETS, TABLE_PRESETS, findCharacter } from '../../shared/styles';
import type { Opening, SeatView } from '../../shared/protocol';
import { CARD_W, STAGE_H, STAGE_W, betSpot, boardSlot, holeCardPos, myHandLayout, planeStyle, project, seatLayout } from '../game/layout';
import { CardView } from '../render/CardArt';
import { ChipStack } from '../render/Chip';
import { TableFelt } from '../render/TableFelt';
import { FlyersLayer } from '../game/Flyers';
import { Nameplate } from '../game/Nameplate';
import { BondBarView, BondUnlockCard } from '../game/BondBar';
import { BondPageView } from '../game/BondPage';
import { HEART_COST, bondLevel } from '../game/bond';
import { EMPTY_BOND, useBond } from '../store/bond';
import { MatchEndPanel, type MatchRow } from '../game/MatchEnd';
import { CharactersScreen } from '../screens/Characters';
import { LoginScreen } from '../screens/Login';
import { SettingsScreen } from '../screens/Settings';
import { OnlineLobby } from '../screens/OnlineLobby';
import { MainMenu } from '../screens/MainMenu';
import { OpeningView } from '../game/Opening';
import { StoreScreen } from '../screens/Store';
import { GalleryScreen } from '../screens/Gallery';
import { Studio } from '../screens/Studio';
import { xpForLevel } from '../../shared/achievements';
import { useProfile } from '../store/profile';
import { useRoleta } from '../store/roleta';
import { useUiTheme } from '../ui/themes';
import { useSession } from '../store/session';
import { useAuth } from '../store/auth';
import { RoundResultPanel } from '../game/RoundResult';
import { nextId, useTable, type RoundResult } from '../store/table';

const q = new URLSearchParams(location.search);
const uiInicial = q.get('ui') ?? 'default';
document.documentElement.dataset.ui = uiInicial;
useProfile.setState((s) => ({ settings: { ...s.settings, uiTheme: uiInicial } }));

/**
 * Segue a aparência escolhida, como o App faz.
 *
 * Sem isto, a pré-visualização de tema da Loja (que muda a tela inteira) não apareceria aqui:
 * o `?ui=` do endereço só pinta a primeira vez.
 */
function TemaVivo() {
  const theme = useUiTheme();
  useEffect(() => {
    document.documentElement.dataset.ui = theme.id;
  }, [theme]);
  return null;
}

const hole = [
  { r: 14, s: 's' as const },
  { r: 14, s: 'c' as const },
];
const board = [
  { r: 14, s: 'd' as const },
  { r: 9, s: 'c' as const },
  { r: 9, s: 'h' as const },
];
const fullBoard = [
  { r: 10, s: 'h' as const },
  { r: 11, s: 'h' as const },
  { r: 12, s: 'h' as const },
  { r: 13, s: 'h' as const },
  { r: 14, s: 'h' as const },
];

const base: RoundResult = {
  id: 1,
  seat: 0,
  name: 'Jogador',
  title: 'Tubarão',
  character: CHARACTER_PRESETS[0],
  hole,
  board,
  best: [...hole, ...board],
  // full house: as cinco cartas fazem o jogo
  core: [...hole, ...board],
  handName: 'Full House, Áses com Noves',
  pots: [{ label: 'Pote principal', amount: 1240 }],
  payers: [
    { name: 'Ren', character: CHARACTER_PRESETS[1], amount: 620 },
    { name: 'Tobi', character: CHARACTER_PRESETS[2], amount: 380 },
    { name: 'Yukina', character: CHARACTER_PRESETS[3], amount: 240 },
  ],
  won: 1240,
  stack: 3240,
  split: [],
  winFx: 'fire',
};

const SCENES: Record<string, RoundResult> = {
  result: base,
  'result-pays': {
    ...base,
    winFx: 'lightning',
    payers: ['Ren', 'Tobi', 'Yukina', 'Marina 2', 'Ren 2'].map((name, i) => ({
      name,
      character: CHARACTER_PRESETS[(i + 1) % CHARACTER_PRESETS.length],
      amount: 620 - i * 110,
    })),
    won: 2100,
    stack: 5100,
  },
  'result-board': { ...base, hole, board: fullBoard, best: fullBoard, core: fullBoard, handName: 'Royal Straight Flush', winFx: 'holy', character: CHARACTER_PRESETS[3] },
  'result-long': {
    ...base,
    handName: 'Dois Pares, Áses e Noves',
    // dois pares: o quinto (o rei) aparece apagado, sem efeito
    board: [{ r: 13, s: 'd' as const }, board[1], board[2]],
    best: [hole[0], hole[1], { r: 13, s: 'd' as const }, board[1], board[2]],
    core: [hole[0], hole[1], board[1], board[2]],
    pots: [
      { label: 'Pote principal', amount: 1240 },
      { label: 'Pote 2', amount: 320 },
      { label: 'Pote 3', amount: 80 },
    ],
    won: 1640,
    stack: 12480,
    payers: [
      { name: 'Tobi', character: CHARACTER_PRESETS[2], amount: 820 },
      { name: 'Yukina', character: CHARACTER_PRESETS[3], amount: 500 },
      { name: 'Marina 2', character: CHARACTER_PRESETS[0], amount: 320 },
    ],
    split: ['Ren', 'Yukina 2'],
    winFx: 'ice',
    character: CHARACTER_PRESETS[1],
  },
};

const NAMES = ['Jogador', 'Ren', 'Yukina', 'Tobi', 'Marina 2', 'Ren 2'];

/** Placar de exemplo: `n` jogadores, você em `mePlace`. */
function rows(n: number, mePlace: number): MatchRow[] {
  return Array.from({ length: n }, (_, i) => {
    const p = i + 1;
    const stack = 6400 - i * 1100;
    return {
      place: p,
      name: p === mePlace ? 'Jogador' : NAMES[(i + 1) % NAMES.length],
      character: CHARACTER_PRESETS[i % CHARACTER_PRESETS.length],
      stack: Math.max(0, stack),
      delta: Math.max(0, stack) - 2000,
      isMe: p === mePlace,
      isBot: p !== mePlace,
    };
  });
}

const MATCHES: Record<string, MatchRow[]> = {
  match: rows(4, 1),
  'match-6': rows(6, 2),
  'match-me6': rows(6, 6),
};

/**
 * Voo das fichas (com ?motion=1): o arremesso de verdade, para conferir que os quadros-chave
 * do framer rodam. Com &rects=1 a página imprime onde cada pilha parou.
 */
function Voo() {
  const t = useTable.getState();
  if (t.flyers.length === 0) {
    t.addFlyer({ id: nextId(), kind: 'chips', space: 'screen', from: { x: 300, y: 700 }, to: { x: 700, y: 420 }, dur: 900, amount: 480, arc: 26, spin: 12, bounce: 8 });
    t.addFlyer({ id: nextId(), kind: 'chips', space: 'screen', from: { x: 1300, y: 700 }, to: { x: 900, y: 420 }, dur: 900, amount: 120 });
    // uma carta, para comparar com o voo das cartas (que não tem quicada)
    t.addFlyer({ id: nextId(), kind: 'card', space: 'screen', from: { x: 800, y: 760 }, to: { x: 800, y: 300 }, dur: 900, width: 80, card: { r: 14, s: 's' }, faceUp: true });
  }
  return <FlyersLayer space="screen" />;
}

/** A mesa parada: cartas deitadas no plano inclinado, fichas em pé e a minha mão. */
function Mesa() {
  const table = TABLE_PRESETS[0];
  const geo = seatLayout(6, 0, true);
  const bets = [1, 2, 4].map((seat) => ({ seat, amount: 120 * seat }));
  return (
    <div className="table-stage">
      <div className="floor-plane" style={planeStyle(3200, 2200, 1600, 1100)} />
      <div className="table-plane" style={planeStyle()}>
        <TableFelt st={table} showSlots={false} />
        {fullBoard.map((c, i) => {
          const p = boardSlot(i);
          return (
            <div key={i} className="board-card" style={{ left: p.x - CARD_W / 2, top: p.y - (CARD_W * 1.4) / 2 }}>
              <CardView card={c} width={CARD_W} />
            </div>
          );
        })}
        {[1, 4].map((seat) => {
          const g = geo[seat];
          const hp = holeCardPos(g, 0);
          return (
            <div key={seat} className="hole-card" style={{ left: hp.p.x - g.cardW / 2, top: hp.p.y - (g.cardW * 1.4) / 2, transform: `rotate(${hp.rot}deg)` }}>
              <CardView card={null} faceUp={false} width={g.cardW} />
            </div>
          );
        })}
      </div>
      {bets.map(({ seat, amount }) => {
        const p = project(betSpot(geo[seat].bet, seat, 'flop'));
        return (
          <div key={seat} className="seat-bet" style={{ left: p.x, top: p.y, transform: `scale(${p.s})` }}>
            <div className="seat-bet-inner">
              <ChipStack amount={amount} size={32} maxCols={3} seed={seat * 13 + 1} />
            </div>
          </div>
        );
      })}
      <div className="my-hand">
        {hole.map((c, i) => {
          const two = myHandLayout(2);
          const k = i - 0.5;
          return (
            <div key={i} className="my-card" style={{ left: k * two.step - two.width / 2, transform: `rotate(${k * two.tilt * 2}deg)` }}>
              <CardView card={c} width={two.width} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * As placas da mesa, para conferir o título do jogador: um com título, um com título comprido
 * (para ver onde ele corta) e um bot, que não tem título nenhum.
 */
function Placas() {
  const geo = seatLayout(6, 0, true);
  const seat = (i: number, over: Partial<SeatView> = {}): SeatView => ({
    seat: i,
    id: `p${i}`,
    name: 'Jogador',
    isBot: false,
    avatar: { color: '#7c5cff', icon: '♠' },
    cosmetics: {
      face: FACE_PRESETS[0],
      back: BACK_PRESETS[0],
      chip: CHIP_PRESETS[0],
      table: TABLE_PRESETS[0],
      character: CHARACTER_PRESETS[i % CHARACTER_PRESETS.length],
      winFx: 'gold',
    },
    title: null,
    stack: 3240,
    bet: 0,
    inHand: true,
    folded: false,
    allIn: false,
    cards: [],
    lastAction: null,
    connected: true,
    busted: false,
    ...over,
  });
  const placas: SeatView[] = [
    seat(0, { name: 'Você', title: 'Tubarão' }),
    seat(2, { name: 'Marina', title: 'Lenda do Showdown' }),
    seat(4, { name: 'Bot Ren', isBot: true }),
  ];
  return (
    <div className="table-stage">
      <div className="table-plane" style={planeStyle()}>
        <TableFelt st={TABLE_PRESETS[0]} showSlots={false} />
      </div>
      {placas.map((p, i) => (
        <Nameplate key={p.seat} seat={p} geo={geo[p.seat]} acting={i === 1} isMe={i === 0} winner={false} badge={i === 0 ? 'D' : null} />
      ))}
    </div>
  );
}

/**
 * Mesa do poker de 5 cartas na hora da troca: cinco cartas na minha mão (duas marcadas),
 * cinco viradas na frente de cada oponente e nenhuma carta no meio.
 */
function Draw5() {
  const table = TABLE_PRESETS[0];
  const geo = seatLayout(6, 0, true);
  const hand = [
    { r: 14, s: 's' as const },
    { r: 14, s: 'd' as const },
    { r: 9, s: 'c' as const },
    { r: 5, s: 'h' as const },
    { r: 2, s: 'd' as const },
  ];
  const marked = [2, 4];
  const five = myHandLayout(5);
  return (
    <div className="table-stage">
      <div className="floor-plane" style={planeStyle(3200, 2200, 1600, 1100)} />
      <div className="table-plane" style={planeStyle()}>
        <TableFelt st={table} showSlots={false} />
        {[1, 2, 3, 4, 5].map((seat) => {
          const g = geo[seat];
          return Array.from({ length: 5 }, (_, i) => {
            const hp = holeCardPos(g, i, 5);
            return (
              <div key={`${seat}-${i}`} className="hole-card" style={{ left: hp.p.x - g.cardW / 2, top: hp.p.y - (g.cardW * 1.4) / 2, transform: `rotate(${hp.rot}deg)` }}>
                <CardView card={null} faceUp={false} width={g.cardW} />
              </div>
            );
          });
        })}
      </div>
      <div className="my-hand five picking">
        {hand.map((c, i) => {
          const k = i - 2;
          const on = marked.includes(i);
          return (
            <div
              key={i}
              className={`my-card clickable ${on ? 'marked' : ''}`}
              style={{ left: k * five.step - five.width / 2, zIndex: i, transform: `translateY(${on ? -40 : 0}px) rotate(${k * five.tilt}deg)` }}
            >
              <CardView card={c} width={five.width} />
              {on && <span className="my-card-mark">✕ trocar</span>}
            </div>
          );
        })}
      </div>
      <div className="hand-hint" style={{ left: five.hint.x, top: five.hint.y }}>
        Dois Pares, Áses e Noves
      </div>
      {/* o painel de apostas é o mais largo: é com ele que as cartas não podem se encavalar */}
      <div className="action-panel">
        <div className="raise-box">
          <div className="raise-presets">
            {['Mín', '½ Pote', '¾ Pote', 'Pote', 'All-in'].map((l) => (
              <button key={l} className="chip-btn">
                {l}
              </button>
            ))}
          </div>
          <div className="raise-row">
            <button className="round-btn">−</button>
            <input className="raise-slider" type="range" min={0} max={10} defaultValue={5} readOnly />
            <button className="round-btn">+</button>
            <input className="raise-input" type="number" defaultValue={240} readOnly />
          </div>
        </div>
        <div className="act-row">
          <button className="act-btn fold">Desistir</button>
          <button className="act-btn call">Pagar 120</button>
          <button className="act-btn raise">Aumentar 240</button>
        </div>
      </div>
      <div className="my-countdown wide">
        <span className="my-countdown-label">TEMPO</span>
        <span className="countdown countdown-big">
          <span className="countdown-num">12</span>
        </span>
      </div>
      <div className="plate seat-card is-me" style={{ left: geo[0].plate.x, top: geo[0].plate.y }}>
        <div className="seat-info">
          <div className="seat-name">Jogador</div>
          <div className="seat-stack">3.240</div>
        </div>
      </div>
    </div>
  );
}

const bondStats = { ...EMPTY_BOND, points: HEART_COST[0] + HEART_COST[1] * 0.45, wins: 23, losses: 31, folds: 62, hands: 116, matches: 7 };

/** A página de vínculo, com as missões e as recompensas abertas. */
function Vinculo() {
  return <BondPageView char={CHARACTER_PRESETS[0]} st={bondStats} onClose={() => {}} />;
}

/**
 * A página com o coração cheio e trancado.
 *
 * Yukina, primeiro coração no limite: a barra não anda mais, e o que abre é um ramo de sakura. O
 * estoque tem um dos dois presentes de propósito, para a foto mostrar o que falta.
 */
function VinculoTranca() {
  const yukina = findCharacter('yukina');
  return (
    <BondPageView
      char={yukina}
      st={{ ...EMPTY_BOND, points: HEART_COST[0], wins: 9, losses: 6, folds: 11, hands: 26, matches: 3 }}
      unlocked={0}
      gifts={{ cha: 2 }}
      onOffer={() => {}}
      onClose={() => {}}
    />
  );
}

/** O aviso do coração completo e a barra curta da placa do personagem. */
function VinculoAviso() {
  const char = CHARACTER_PRESETS[0];
  return (
    <div className="preview-bond">
      <div className="char-nameplate" style={{ position: 'relative', left: 0, bottom: 0 }}>
        <b>{char.name}</b>
        <BondBarView lv={bondLevel(bondStats.points)} size={16} compact />
      </div>
      <BondUnlockCard u={{ id: 1, char: char.id, heart: 2 }} onDone={() => {}} />
    </div>
  );
}

/** Cartas e fichas de perto, para conferir o volume. */
function Solids() {
  return (
    <div className="preview-solids">
      <div className="row gap" style={{ gap: 34, alignItems: 'flex-end' }}>
        <CardView card={{ r: 14, s: 's' }} width={230} />
        <CardView card={{ r: 12, s: 'h' }} width={230} />
        <CardView card={null} faceUp={false} width={230} />
        <CardView card={{ r: 7, s: 'd' }} width={140} />
        <CardView card={{ r: 3, s: 'c' }} width={88} />
      </div>
      <div className="row gap" style={{ alignItems: 'flex-end', gap: 56 }}>
        <ChipStack amount={25} size={110} />
        <ChipStack amount={180} size={110} />
        <ChipStack amount={1250} size={78} />
        <ChipStack amount={26_600} size={48} />
        <ChipStack amount={640} size={32} />
      </div>
    </div>
  );
}

const cena = q.get('cena') ?? 'result';
// a tela de personagens lê o vínculo salvo: semeia um progresso para os corações aparecerem
if (cena === 'personagens') {
  for (const [char, wins] of [['marina', 9], ['ren', 3], ['tobi', 24]] as const) {
    for (let i = 0; i < wins; i++) useBond.getState().award(char, 'win');
  }
}
// a tela de entrada com erro: o estado vem da loja, como viria de um login recusado
if (cena === 'login-erro') useAuth.setState({ remember: true, user: 'marina', error: 'Usuário ou senha incorretos.' });
if (cena === 'config-logado') useAuth.setState({ status: 'logged', user: 'marina', token: 'jwt.exemplo', remember: true });
// o menu com a Partida Rápida esperando o servidor montar a mesa
if (cena === 'menu-sentando') useSession.setState({ mode: 'online', status: 'connecting', botsPending: true });
if (cena === 'fila-esperando') useSession.setState({ status: 'connected', queueing: true });
/**
 * A cena do giro, parada para a foto.
 *
 * No jogo quem põe a cena nesse estado é a resposta do servidor; aqui o endereço faz o papel dela,
 * porque tirar foto de uma animação exige poder pausá-la em cada momento.
 */
if (cena === 'girando') useRoleta.setState({ status: 'girando', roulette: q.get('roleta') ?? 'flores', premio: null });
if (cena === 'giro') {
  useRoleta.setState({
    status: 'revelado',
    roulette: q.get('roleta') ?? 'flores',
    premio: { key: q.get('premio') ?? 'character:yukina', dup: q.has('dup'), refund: q.has('dup') ? 4500 : 0 },
  });
}

/**
 * Contadores que dão exatamente o nível pedido, com a barra pela metade.
 *
 * O nível sai da experiência, e a experiência sai dos contadores — então para ver a barra de xp em
 * outra cor (ela muda a cada dezena) basta inflar as mãos jogadas, que valem 1 de xp cada. É o que
 * `?nivel=` faz: 23 é ciano, 45 é lilás, 88 é ouro.
 */
function statsDoNivel(nivel: number) {
  const n = Math.max(1, Math.min(100, Math.round(nivel)));
  const alvo = Math.round(xpForLevel(n) + (xpForLevel(n + 1) - xpForLevel(n)) * 0.45);
  // os outros contadores são fixos (e valem xp também); as mãos completam o que falta para o alvo
  const outros = { wins: 62, matches: 11, matchWins: 2 };
  const gastos = outros.wins * 3 + outros.matches * 10 + outros.matchWins * 25;
  return { ...outros, hands: Math.max(0, alvo - gastos), folds: 74, allIns: 9, bigWins: 3, showdowns: 41 };
}

// a loja: finge uma conta no servidor, com itens e as duas moedas
if (cena === 'loja' || cena === 'galeria' || cena === 'menu' || cena === 'loja-sem-pado' || cena === 'giro' || cena === 'girando' || cena === 'conta' || cena === 'titulos' || cena === 'fila' || cena === 'fila-esperando') {
  const comPado = cena !== 'loja-sem-pado';
  useAuth.setState({ status: 'logged', user: 'gabi', token: 'jwt.exemplo', discord: comPado ? '343954786300854276' : null, remember: true, serviceReady: true });
  useSession.setState({
    mode: 'online',
    status: 'connected',
    serverName: 'Pokeru Oficial',
    account: {
      id: 'a-1',
      name: 'Gabi',
      user: 'gabi',
      money: 18_400,
      inPlay: 0,
      pado: comPado ? 2785 : null,
      // presentes no estoque e um coração já destrancado: é o que as telas novas precisam mostrar
      gifts: { flor: 3, cha: 1, leque: 1, fone: 2, bolo: 2, joia: 1 },
      bondUnlocked: { yukina: 1 },
      discord: comPado ? { id: '343954786300854276', username: 'berlineta.', nickname: 'Mogleo' } : null,
      owned: ['character:ren', 'winfx:fire', 'back:back-crimson'],
      bond: {},
      // contadores de verdade: sem eles a lista de conquistas fica toda em zero e a tela não dá para conferir
      stats: statsDoNivel(Number(q.get('nivel') ?? 23)),
      title: 'Colecionador de Potes',
      since: '2026-03-04T12:00:00.000Z',
    },
  });
}
// a abertura: cinco na mesa (um bot e um que ainda nao confirmou), com titulo, nivel e o par de cartas
const ABERTURA: Opening = {
  waitMs: 12_000,
  minMs: 5_000,
  players: [
    { seat: 0, name: 'Você', isBot: false, title: 'Colecionador de Potes', level: 7, ready: true },
    { seat: 1, name: 'Marina', isBot: false, title: 'Lenda do Showdown', level: 23, ready: true },
    { seat: 2, name: 'dokidoki_tt', isBot: false, title: null, level: 3, ready: false },
    { seat: 3, name: 'Bot Ren', isBot: true, title: null, level: 0, ready: true },
    { seat: 4, name: 'berlineta', isBot: false, title: 'Sem Medo', level: 12, ready: true },
    { seat: 5, name: 'Bot Yukina', isBot: true, title: null, level: 0, ready: true },
  ].map((q, i) => ({
    ...q,
    character: CHARACTER_PRESETS[i % CHARACTER_PRESETS.length],
    face: FACE_PRESETS[i % FACE_PRESETS.length],
    back: BACK_PRESETS[i % BACK_PRESETS.length],
  })),
};

// a lista de salas: finge um servidor conectado, para a tela não tentar ligar de verdade
if (cena === 'salas') {
  useSession.setState({
    mode: 'online',
    status: 'connected',
    serverName: 'Pokeru Oficial',
    rooms: [
      { id: 'k3f7a', name: 'Fila Rápida', players: 4, maxPlayers: 6, status: 'playing', blinds: '10/20', mode: 'cash', variant: 'holdem', buyIn: 2000, currency: 'chips', bots: 2, hasPassword: false },
      { id: 'p8d1x', name: 'Fila · Padocoins', players: 3, maxPlayers: 6, status: 'playing', blinds: '2/4', mode: 'cash', variant: 'holdem', buyIn: 200, currency: 'pado', bots: 1, hasPassword: false },
      { id: 'q9x2b', name: 'Só entre amigos', players: 2, maxPlayers: 4, status: 'waiting', blinds: '25/50', mode: 'normal', variant: 'draw5', buyIn: 0, currency: 'chips', bots: 0, hasPassword: true },
      { id: 'm1p5c', name: 'Torneio da noite', players: 6, maxPlayers: 6, status: 'playing', blinds: '50/100', mode: 'sitgo', variant: 'holdem', buyIn: 2500, currency: 'chips', bots: 0, hasPassword: false },
      { id: 'z7t4d', name: 'Mesa livre', players: 1, maxPlayers: 6, status: 'waiting', blinds: '10/20', mode: 'cash', variant: 'holdem', buyIn: 0, currency: 'chips', bots: 0, hasPassword: false },
    ],
    account: { id: 'a1', money: 12_400, inPlay: 0, since: '2026-03-04T12:00:00.000Z', bond: {}, hands: 0, wins: 0 } as never,
  });
}
const matchRows = MATCHES[cena];
const scene = SCENES[cena] ?? base;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion={q.has('motion') ? 'never' : 'always'}>
      <TemaVivo />
      {cena === 'abertura' ? (
        <OpeningView opening={ABERTURA} mySeat={0} />
      ) : cena === 'personagens' ? (
        <CharactersScreen onBack={() => {}} />
      ) : cena === 'login' || cena === 'login-erro' ? (
        <LoginScreen />
      ) : cena === 'config' || cena === 'config-logado' || cena === 'conta' || cena === 'titulos' ? (
        <SettingsScreen onBack={() => {}} onCharacters={() => {}} />
      ) : cena === 'salas' ? (
        <OnlineLobby onBack={() => {}} />
      ) : cena === 'menu' || cena === 'menu-sentando' || cena === 'fila' || cena === 'fila-esperando' ? (
        <MainMenu go={() => {}} openQueue={cena === 'fila'} />
      ) : cena === 'estudio' ? (
        <Studio onBack={() => {}} />
      ) : cena === 'galeria' ? (
        <GalleryScreen onBack={() => {}} initial={(q.get('aba') as never) ?? undefined} verInicial={q.get('ver') ?? undefined} />
      ) : cena === 'loja' || cena === 'loja-sem-pado' || cena === 'giro' || cena === 'girando' ? (
        <StoreScreen onBack={() => {}} initial={(q.get('aba') as never) ?? undefined} verInicial={q.get('ver') ?? undefined} />
      ) : (
      <div className="game-screen">
        <div className="stage-wrap">
          <div className="stage" style={{ width: STAGE_W, height: STAGE_H, background: 'radial-gradient(ellipse at 50% 40%, #3a1418 0%, #0e0506 75%)' }}>
            {cena === 'voo' ? (
              <Voo />
            ) : cena === 'mesa' ? (
              <Mesa />
            ) : cena === 'placa' ? (
              <Placas />
            ) : cena === 'draw5' ? (
              <Draw5 />
            ) : cena === 'bond' ? (
              <Vinculo />
            ) : cena === 'bond-tranca' ? (
              <VinculoTranca />
            ) : cena === 'bond-aviso' ? (
              <VinculoAviso />
            ) : cena === 'solids' ? (
              <Solids />
            ) : matchRows ? (
              <MatchEndPanel m={{ id: 1, kind: 'over' }} rows={matchRows} info="Treino Offline · Sit & Go · 18 mãos" />
            ) : (
              <RoundResultPanel r={scene} />
            )}
          </div>
        </div>
      </div>
      )}
    </MotionConfig>
  </StrictMode>,
);

// medição das caixas (para depurar o layout): /preview.html?cena=…&rects=1
// &rects=<seletores separados por vírgula> mede outras caixas (todas as que casarem)
if (q.has('rects')) {
  setTimeout(() => {
    const asked = (q.get('rects') ?? '').split(',').filter((s) => s && s !== '1');
    const pick = asked.length ? asked : ['.stage', '.round-result', '.rr-info', '.rr-cards', '.rr-hand', '.rr-bottom', '.rr-char', '.rr-total', '.flyer', '.flyer + .flyer', '.flyer + .flyer + .flyer'];
    const out = pick.flatMap((sel) => {
      const els = [...document.querySelectorAll(sel)];
      if (!els.length) return [`${sel}: —`];
      return els.map((el, i) => {
        const r = el.getBoundingClientRect();
        return `${sel}${els.length > 1 ? `[${i}]` : ''}: x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.width)} h=${Math.round(r.height)}`;
      });
    });
    const pre = document.createElement('pre');
    pre.id = 'rects';
    pre.textContent = out.join('\n');
    document.body.appendChild(pre);
  }, 800);
}
