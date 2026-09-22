import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RANKS, SUITS, rankLabel, type Card, type Suit } from '../../shared/cards';
import { CATALOG, KIND_LABELS, isFree, itemsOfKind, owns, padoPrice, type CatalogItem, type Currency, type ItemKind } from '../../shared/catalog';
import {
  BACK_PRESETS,
  CHIP_PRESETS,
  CHIP_VALUES,
  FACE_PRESETS,
  TABLE_PRESETS,
  findCharacter,
  type CardFaceStyle,
  type ChipStyle,
} from '../../shared/styles';
import { UI_THEMES, useThemePreview, type UiTheme } from '../ui/themes';
import { CardBackSvg, CardFaceSvg, CardView } from '../render/CardArt';
import { CharacterFull, CharacterPortrait } from '../render/CharacterArt';
import { ChipStack, ChipSvg } from '../render/Chip';
import { BackPreview, FacePreview, TablePreview, ThemeSample } from '../render/StylePreview';
import { PadoCoinSvg } from '../render/PadoCoin';
import { findWinFx } from '../render/cardfx';
import { useProfile } from '../store/profile';
import { useSession } from '../store/session';
import { buyItem, pedeSaldo, useCanShop, useOwned, usePado } from '../store/shop';
import { useChips } from '../ui/Wallet';
import { ScreenHeader } from '../ui/controls';
import { fmt } from '../util/format';
import { sfx } from '../audio/sfx';
import { Petals } from './MainMenu';

/**
 * A loja.
 *
 * Vitrine só: o preço vem do catálogo compartilhado (shared/catalog.ts, o mesmo que o servidor usa
 * para cobrar) e a compra é um pedido ao servidor, que confere saldo e posse antes de mexer em
 * nada. Se esta tela pintar algo errado, o servidor recusa — não há como comprar daqui.
 *
 * Duas moedas: fichas sempre, e **padocoins só para quem tem o Discord vinculado** — sem vínculo
 * a moeda não existe para a conta, então o botão dela nem aparece.
 */

const ORDER: ItemKind[] = ['character', 'winfx', 'back', 'face', 'chip', 'table', 'ui'];

/** O símbolo do naipe nos botões de escolher a carta (a carta em si desenha o seu próprio). */
const SUIT_CHAR: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

/** Uma miniatura do que se está comprando. Cada tipo mostra a própria peça, não um ícone. */
function Preview({ item }: { item: CatalogItem }) {
  switch (item.kind) {
    case 'character': {
      const c = findCharacter(item.id);
      return (
        <div className="shop-art char-info-portrait" style={{ background: `linear-gradient(160deg, ${c.bg}, ${c.bg2})` }}>
          <CharacterPortrait st={c} size={104} />
        </div>
      );
    }
    case 'winfx':
      // o efeito de verdade, rodando na carta — é o que a pessoa está comprando
      return (
        <div className="shop-art">
          <CardView card={{ r: 14, s: 's' }} width={64} highlight winFx={findWinFx(item.id)} />
        </div>
      );
    case 'face': {
      const st = FACE_PRESETS.find((s) => s.id === item.id) ?? FACE_PRESETS[0];
      return (
        <div className="shop-art">
          <CardFaceSvg card={{ r: 12, s: 'h' }} style={st} width={64} />
        </div>
      );
    }
    case 'back': {
      const st = BACK_PRESETS.find((s) => s.id === item.id) ?? BACK_PRESETS[0];
      return (
        <div className="shop-art">
          <CardBackSvg style={st} width={64} />
        </div>
      );
    }
    case 'chip': {
      const st = CHIP_PRESETS.find((s) => s.id === item.id) ?? CHIP_PRESETS[0];
      return (
        <div className="shop-art">
          <ChipSvg value={100} size={74} style={st} />
        </div>
      );
    }
    case 'table': {
      const st = TABLE_PRESETS.find((s) => s.id === item.id) ?? TABLE_PRESETS[0];
      return (
        <div
          className="shop-art shop-felt"
          style={{ background: `radial-gradient(ellipse at 50% 35%, ${st.feltLight}, ${st.felt})`, borderColor: st.rail, boxShadow: `inset 0 0 0 3px ${st.railAccent}` }}
        >
          <span style={{ color: st.logoColor }}>{st.logoText || '♠'}</span>
        </div>
      );
    }
    case 'ui': {
      const t = UI_THEMES.find((u) => u.id === item.id) ?? UI_THEMES[0];
      return (
        <div className="shop-art shop-ui" style={{ background: t.swatch.bg }}>
          <span style={{ background: t.swatch.panel, color: t.swatch.accent, fontFamily: t.swatch.font }}>{t.swatch.glyph}</span>
        </div>
      );
    }
  }
}

/**
 * O item escolhido, em tamanho grande — a metade direita da loja.
 *
 * A miniatura do cartão serve para achar o item na prateleira; esta é para **decidir**, então cada
 * tipo aparece no contexto em que vale: a mesa é a mesa de verdade (mesmo feltro, mesmo plano
 * inclinado do jogo), a aparência da interface é a tela inteira mudando, e as peças com que se
 * joga respondem ao mouse. O desenho é o mesmo que o Estúdio usa — vem de render/StylePreview —
 * para que o que se compra aqui seja exatamente o que se vê lá.
 */
function Grande({ item }: { item: CatalogItem }) {
  switch (item.kind) {
    case 'character':
      // fundo comum, escuro e discreto: a cor de cada personagem brigava com a arte e mudava o
      // peso de um cartão para o outro. A arte acompanha a altura da caixa.
      return (
        <div className="shop-big shop-big-char">
          <CharacterFull st={findCharacter(item.id)} height="100%" />
        </div>
      );
    case 'winfx':
      return (
        <div className="shop-big shop-big-fx">
          <CardView card={{ r: 14, s: 's' }} width={260} highlight winFx={findWinFx(item.id)} />
        </div>
      );
    case 'face':
      return <CartasGrande st={FACE_PRESETS.find((x) => x.id === item.id) ?? FACE_PRESETS[0]} />;
    case 'back':
      return <BackPreview st={BACK_PRESETS.find((x) => x.id === item.id) ?? BACK_PRESETS[0]} width={180} />;
    case 'chip':
      return <FichasGrande st={CHIP_PRESETS.find((x) => x.id === item.id) ?? CHIP_PRESETS[0]} />;
    case 'table':
      return <TablePreview st={TABLE_PRESETS.find((x) => x.id === item.id) ?? TABLE_PRESETS[0]} />;
    case 'ui':
      return <TemaGrande t={UI_THEMES.find((x) => x.id === item.id) ?? UI_THEMES[0]} />;
  }
}

/** As cartas do baralho escolhido, e uma que a pessoa monta: valor e naipe, para ver qualquer uma. */
function CartasGrande({ st }: { st: CardFaceStyle }) {
  const [card, setCard] = useState<Card>({ r: 14, s: 's' });
  return (
    <div className="shop-grande">
      <FacePreview st={st} width={84} />
      <div className="shop-escolha">
        <CardFaceSvg card={card} style={st} width={132} />
        <div className="shop-escolha-ctl">
          <div className="shop-linha valores">
            {RANKS.map((r) => (
              <button key={r} className={`shop-mini ${r === card.r ? 'on' : ''}`} onClick={() => setCard((c) => ({ ...c, r }))}>
                {rankLabel(r)}
              </button>
            ))}
          </div>
          <div className="shop-linha">
            {SUITS.map((naipe) => (
              <button
                key={naipe}
                className={`shop-mini naipe ${naipe === card.s ? 'on' : ''}`}
                // o naipe no papel da carta: em espadas escuras, o símbolo sumiria no fundo da tela
                style={{ color: st.suitColors[naipe], background: st.bg }}
                onClick={() => setCard((c) => ({ ...c, s: naipe }))}
              >
                {SUIT_CHAR[naipe]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** As fichas do conjunto, e uma aposta que a pessoa empilha clicando — é assim que elas aparecem na mesa. */
function FichasGrande({ st }: { st: ChipStyle }) {
  const [aposta, setAposta] = useState(0);
  return (
    <div className="shop-grande">
      <div className="chip-row">
        {CHIP_VALUES.map((v, i) => (
          <motion.button
            key={v}
            className="shop-ficha"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.03, type: 'spring' }}
            whileHover={{ y: -8, rotate: 20 }}
            onClick={() => {
              sfx.click();
              setAposta((a) => a + v);
            }}
            title={`apostar ${fmt(v)}`}
          >
            <ChipSvg value={v} size={62} style={st} />
          </motion.button>
        ))}
      </div>
      <div className="shop-aposta">
        <div className="shop-aposta-pilha">
          {aposta > 0 ? <ChipStack amount={aposta} size={54} style={st} /> : <span className="muted small">Clique nas fichas para montar uma aposta</span>}
        </div>
        {aposta > 0 && (
          <button className="btn btn-ghost small" onClick={() => setAposta(0)}>
            Limpar {fmt(aposta)}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A aparência da interface: a loja inteira passa a usar o tema enquanto ele está escolhido.
 *
 * É o único item que não cabe num quadro — ele muda fonte, painel, botão e moldura de tudo. Como
 * no Estúdio, a pré-visualização é global e some ao sair; o tema de verdade só entra no perfil
 * depois de comprado e equipado.
 */
function TemaGrande({ t }: { t: UiTheme }) {
  const setPreview = useThemePreview((s) => s.setPreview);
  const atual = useProfile((s) => s.settings.uiTheme);
  useEffect(() => {
    setPreview(t.id === atual ? null : t.id);
    return () => setPreview(null);
  }, [t.id, atual, setPreview]);
  return (
    <div className="shop-grande">
      <ThemeSample />
      <p className="shop-sobre">{t.description}</p>
      <ul className="shop-tema-lista">
        {t.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </div>
  );
}

/** O nome que o jogador lê (os efeitos têm nome próprio no catálogo do cliente). */
function labelOf(item: CatalogItem): string {
  return item.kind === 'winfx' ? findWinFx(item.id).name : item.name;
}

/** O cartão de um item. Sem estado de loja: recebe tudo por prop, e é o que os testes desenham. */
export function ItemCard({
  item,
  owned,
  chips,
  pado,
  canShop,
  onBuy,
  onVer,
  selecionado,
  semArte,
}: {
  item: CatalogItem;
  owned: boolean;
  chips: number;
  /** Saldo de padocoins, ou null quando a conta não tem Discord (a moeda não existe). */
  pado: number | null;
  canShop: boolean;
  onBuy?: (key: string, currency: Currency) => void;
  /** Mostrar o item no palco, em tamanho grande. Sem isto o cartão continua funcionando sozinho. */
  onVer?: () => void;
  /** É este que o palco está mostrando. */
  selecionado?: boolean;
  /** Só a linha de preço: dentro do preview, a arte e o nome já estão na tela. */
  semArte?: boolean;
}) {
  const [asked, setAsked] = useState<Currency | null>(null);
  const precoChips = item.chips;
  const precoPado = padoPrice(item.chips);

  const buy = (currency: Currency) => {
    sfx.click();
    setAsked(currency);
    (onBuy ?? buyItem)(item.key, currency);
  };

  return (
    <div className={`shop-card ${owned ? 'owned' : ''} ${semArte ? 'nua' : ''} ${selecionado ? 'on' : ''}`}>
      {/* a arte leva o item ao palco; a compra continua nos botões, para ninguém comprar sem
          querer ao espiar */}
      {!semArte && (
      <button
        className="shop-ver"
        onClick={() => {
          sfx.hover();
          onVer?.();
        }}
        title="ver de perto"
        aria-pressed={selecionado}
      >
        <Preview item={item} />
      </button>
      )}
      {!semArte && <div className="shop-name">{labelOf(item)}</div>}
      {owned ? (
        <div className="shop-owned">{isFree(item.key) ? 'Já vem com o jogo' : '✓ Seu'}</div>
      ) : (
        <div className="shop-buy">
          <button className="btn btn-gold small wide" disabled={!canShop || chips < precoChips || !!asked} onClick={() => buy('chips')}>
            <ChipSvg value={100} size={16} /> {fmt(precoChips)}
          </button>
          {/* a moeda do Discord só existe para quem vinculou */}
          {pado !== null && (
            <button className="btn btn-pado small wide" disabled={!canShop || pado < precoPado || !!asked} onClick={() => buy('pado')}>
              <PadoCoinSvg size={16} /> {fmt(precoPado)}
            </button>
          )}
          {chips < precoChips && pado === null && <div className="shop-short">faltam {fmt(precoChips - chips)} fichas</div>}
        </div>
      )}
    </div>
  );
}

/** O palco: o item escolhido em tamanho grande, com o nome e o preço embaixo. */
function Palco({ item, owned, chips, pado, canShop }: { item: CatalogItem; owned: boolean; chips: number; pado: number | null; canShop: boolean }) {
  return (
    <motion.div key={item.key} className="panel shop-stage" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      <h2 className="title-deco">{labelOf(item)}</h2>
      <div className="shop-stage-art">
        <Grande item={item} />
      </div>
      <ItemCard item={item} owned={owned} chips={chips} pado={pado} canShop={canShop} semArte />
    </motion.div>
  );
}

export function StoreScreen({
  onBack,
  initial = 'character',
  verInicial,
}: {
  onBack: () => void;
  initial?: ItemKind;
  /** Abre um item já em tamanho grande (o preview do jogo usa isto para tirar a foto da tela). */
  verInicial?: string;
}) {
  const [kind, setKind] = useState<ItemKind>(initial);
  const [verKey, setVerKey] = useState<string | null>(verInicial ?? null);
  const ownedList = useOwned();
  const chips = useChips();
  const pado = usePado();
  const canShop = useCanShop();
  const status = useSession((s) => s.status);

  // a vitrine em padocoins depende do saldo, que o servidor só relê a pedido
  useEffect(() => {
    pedeSaldo();
  }, []);

  const items = itemsOfKind(kind);
  // o palco nunca fica vazio: sem escolha (ou com uma escolha de outra aba) ele mostra o primeiro
  const vendo = items.find((i) => i.key === verKey) ?? items[0];
  // quanto de cada tipo já é seu (o que vem com o jogo não conta, como no total do topo)
  const contas = Object.fromEntries(
    ORDER.map((k) => {
      const pagos = itemsOfKind(k).filter((i) => !isFree(i.key));
      return [k, { meus: pagos.filter((i) => owns(ownedList, i.key)).length, total: pagos.length }];
    }),
  ) as Record<ItemKind, { meus: number; total: number }>;
  const total = CATALOG.filter((i) => !isFree(i.key)).length;
  const meus = CATALOG.filter((i) => !isFree(i.key) && owns(ownedList, i.key)).length;

  return (
    <div className="screen shop-screen">
      <div className="menu-bg" />
      <Petals />
      {/* carteira e contagem na linha do título: a altura que sobra é toda do palco */}
      <ScreenHeader title="Loja" onBack={onBack}>
        <span className="shop-coin">
          <ChipSvg value={100} size={22} /> {fmt(chips)}
        </span>
        {pado !== null && (
          <span className="shop-coin">
            <PadoCoinSvg size={22} /> {fmt(pado)}
          </span>
        )}
        <span className="muted small">
          {meus} de {total} itens
        </span>
      </ScreenHeader>

      {!canShop && (
        <div className="shop-warn">
          {status === 'connecting'
            ? 'Conectando ao servidor…'
            : 'A loja fica no servidor: entre numa conta para comprar. Sem conta dá para jogar, mas o que se compra precisa de um lugar para ficar guardado.'}
        </div>
      )}
      {canShop && pado === null && (
        <div className="shop-hint">
          Tem <b>padocoins</b> no Discord? Vincule sua conta em <b>Ajustes → Conta</b> para gastá-los aqui — a conta do jogo e o Discord são separados até você ligar os dois.
        </div>
      )}

      <div className="shop-body">
        {/* a navegação fica na lateral: a largura da tela é para a prateleira e o palco */}
        <nav className="shop-tabs">
          {ORDER.map((k) => (
            <button
              key={k}
              className={`shop-tab ${k === kind ? 'on' : ''}`}
              onClick={() => {
                sfx.hover();
                setKind(k);
              }}
            >
              <span>{KIND_LABELS[k]}</span>
              <b className="shop-tab-conta">
                {contas[k].meus}/{contas[k].total}
              </b>
            </button>
          ))}
        </nav>
        <motion.div key={kind} className="shop-grid" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          {items.map((item) => (
            <ItemCard
              key={item.key}
              item={item}
              owned={owns(ownedList, item.key)}
              chips={chips}
              pado={pado}
              canShop={canShop}
              selecionado={item.key === vendo?.key}
              onVer={() => setVerKey(item.key)}
            />
          ))}
        </motion.div>
        {vendo && <Palco item={vendo} owned={owns(ownedList, vendo.key)} chips={chips} pado={pado} canShop={canShop} />}
      </div>
    </div>
  );
}
