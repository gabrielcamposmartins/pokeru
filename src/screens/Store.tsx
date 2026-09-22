import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RANKS, SUITS, rankLabel, type Card, type Suit } from '../../shared/cards';
import {
  KIND_LABELS,
  findGift,
  findItem,
  isFree,
  itemsOfKind,
  owns,
  padoPrice,
  type CatalogItem,
  type Currency,
  type GiftSpec,
  type ItemKind,
} from '../../shared/catalog';
import { RARIDADES, ROULETTES, dropsOf, findRoulette, ticketPrice, type Drop, type Roulette } from '../../shared/roulette';
import { BOND_RECIPES } from '../../shared/bond';
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
import { buyItem, pedeSaldo, spinRoulette, useCanShop, useGifts, useOwned, usePado } from '../store/shop';
import { useRoleta } from '../store/roleta';
import { Sparks } from '../render/Sparks';
import { useChips } from '../ui/Wallet';
import { ScreenHeader } from '../ui/controls';
import { fmt } from '../util/format';
import { sfx } from '../audio/sfx';
import { Petals } from './MainMenu';

/**
 * A loja.
 *
 * Três abas, três coisas à venda: **presentes** (que o vínculo com os personagens consome),
 * **tickets** (de onde vêm os cosméticos) e a **aparência da interface**. O resto do catálogo é
 * coleção e mora na Galeria, com botão próprio no menu (src/screens/Gallery.tsx).
 *
 * Presente é compra miúda e repetida, então a aba é uma prateleira de cartõezinhos. Ticket e
 * aparência são decisão, e poucas: as abas viram **carrossel**, uma peça grande por vez.
 *
 * Vitrine só: o preço vem do catálogo compartilhado (shared/catalog.ts, o mesmo que o servidor usa
 * para cobrar), o sorteio é do servidor (shared/roulette.ts) e toda compra é um pedido que ele
 * aceita ou recusa. Se esta tela pintar algo errado, o servidor recusa — não há como comprar daqui.
 *
 * Duas moedas: fichas sempre, e **padocoins só para quem tem o Discord vinculado** — sem vínculo
 * a moeda não existe para a conta, então o botão dela nem aparece.
 */

/** As abas da loja. */
type Aba = 'gift' | 'ticket' | 'ui';

const ABAS: { key: Aba; label: string }[] = [
  { key: 'gift', label: 'Presentes' },
  { key: 'ticket', label: 'Tickets' },
  { key: 'ui', label: 'Aparências' },
];

/** O símbolo do naipe nos botões de escolher a carta (a carta em si desenha o seu próprio). */
const SUIT_CHAR: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

/** O presente como uma etiqueta de papel: o símbolo grande sobre a cor do laço. */
function GiftArt({ gift, size = 74 }: { gift: GiftSpec; size?: number }) {
  return (
    <div className="gift-art" style={{ fontSize: size * 0.62, width: size, height: size }}>
      <span>{gift.icon}</span>
    </div>
  );
}

/** Quem pede este presente: a lista de personagens que têm o presente em alguma receita. */
function quemGosta(id: string): string[] {
  return Object.entries(BOND_RECIPES)
    .filter(([, receitas]) => receitas.some((r) => id in r))
    .map(([char]) => findCharacter(char).name);
}

/** Uma miniatura do que se está comprando. Cada tipo mostra a própria peça, não um ícone. */
export function Preview({ item }: { item: CatalogItem }) {
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
    case 'gift': {
      const g = findGift(item.id);
      return <div className="shop-art">{g ? <GiftArt gift={g} size={66} /> : null}</div>;
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
export function Grande({ item }: { item: CatalogItem }) {
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
    case 'gift': {
      const g = findGift(item.id);
      if (!g) return null;
      const gosta = quemGosta(g.id);
      return (
        <div className="shop-grande">
          <GiftArt gift={g} size={260} />
          <p className="shop-sobre">
            {gosta.length ? <>Pedido por <b>{gosta.join(', ')}</b> em algum coração do vínculo.</> : 'Ninguém pede este presente no vínculo — ainda.'}
          </p>
        </div>
      );
    }
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
      <ul className="shop-tema-lista">
        {t.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </div>
  );
}

/** O nome que o jogador lê (os efeitos têm nome próprio no catálogo do cliente). */
export function labelOf(item: CatalogItem): string {
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
  estoque,
  semCompra,
  grande,
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
  /**
   * Quantos o jogador tem, para item **contável** (presente).
   *
   * Presente não é posse: comprar de novo aumenta o estoque. Com isto definido, o cartão mostra
   * quantos há em vez de "✓ Seu", e os botões de compra continuam valendo sempre.
   */
  estoque?: number;
  /**
   * Cartão sem os botões de preço.
   *
   * A prateleira de presentes usa isto: oito cartõezinhos com quatro botões dourados cada viram
   * uma parede de preço. Quem compra é o palco, com um botão grande. O tamanho do cartão é
   * preservado pelo CSS (`.shop-card.k-gift`), para a grade não dançar.
   */
  semCompra?: boolean;
  /** Botões de compra em tamanho grande, lado a lado — é assim que eles ficam no palco. */
  grande?: boolean;
}) {
  const [asked, setAsked] = useState<Currency | null>(null);
  const precoChips = item.chips;
  const precoPado = padoPrice(item.chips);

  const buy = (currency: Currency) => {
    sfx.click();
    setAsked(currency);
    (onBuy ?? buyItem)(item.key, currency);
  };

  /*
    * Sem botão de preço dentro, o **cartão inteiro** é o clique que leva o item ao palco — é a
    * área que a pessoa tenta clicar. Com botões dentro (a vitrine antiga, e os testes), o cartão
    * continua sendo uma caixa e só a arte leva ao palco: botão dentro de botão não é clicável.
    */
  const Raiz = onVer && semCompra ? 'button' : 'div';
  return (
    <Raiz
      className={`shop-card k-${item.kind} ${owned ? 'owned' : ''} ${semArte ? 'nua' : ''} ${selecionado ? 'on' : ''} ${Raiz === 'button' ? 'clicavel' : ''}`}
      onClick={
        Raiz === 'button'
          ? () => {
              sfx.hover();
              onVer?.();
            }
          : undefined
      }
      aria-pressed={Raiz === 'button' ? selecionado : undefined}
    >
      {/* a arte leva o item ao palco; a compra continua nos botões, para ninguém comprar sem
          querer ao espiar */}
      {!semArte && Raiz === 'div' && (
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
      {!semArte && Raiz === 'button' && <Preview item={item} />}
      {!semArte && <div className="shop-name">{labelOf(item)}</div>}
      {estoque !== undefined && <div className={`shop-estoque ${estoque ? '' : 'zero'}`}>você tem {estoque}</div>}
      {semCompra ? null : owned && estoque === undefined ? (
        <div className="shop-owned">{isFree(item.key) ? 'Já vem com o jogo' : '✓ Seu'}</div>
      ) : (
        <div className={`shop-buy ${grande ? 'grande' : ''}`}>
          <button
            className={`btn btn-gold ${grande ? 'big' : 'small wide'}`}
            disabled={!canShop || chips < precoChips || !!asked}
            onClick={() => buy('chips')}
          >
            <ChipSvg value={100} size={grande ? 22 : 16} /> {fmt(precoChips)}
          </button>
          {/* a moeda do Discord só existe para quem vinculou */}
          {pado !== null && (
            <button
              className={`btn btn-pado ${grande ? 'big' : 'small wide'}`}
              disabled={!canShop || pado < precoPado || !!asked}
              onClick={() => buy('pado')}
            >
              <PadoCoinSvg size={grande ? 22 : 16} /> {fmt(precoPado)}
            </button>
          )}
          {chips < precoChips && pado === null && <div className="shop-short">faltam {fmt(precoChips - chips)} fichas</div>}
        </div>
      )}
    </Raiz>
  );
}

/** O palco: o item escolhido em tamanho grande, com o nome e o preço embaixo. */
function Palco({
  item,
  owned,
  chips,
  pado,
  canShop,
  estoque,
}: {
  item: CatalogItem;
  owned: boolean;
  chips: number;
  pado: number | null;
  canShop: boolean;
  estoque?: number;
}) {
  return (
    <motion.div key={item.key} className="panel shop-stage" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      <h2 className="title-deco">{labelOf(item)}</h2>
      <div className="shop-stage-art">
        <Grande item={item} />
      </div>
      <ItemCard item={item} owned={owned} chips={chips} pado={pado} canShop={canShop} estoque={estoque} semArte grande />
    </motion.div>
  );
}

/** Chance em porcentagem, com uma casa quando é pequena. */
export function pct(chance: number): string {
  const v = chance * 100;
  return `${v < 10 ? v.toFixed(1) : Math.round(v)}%`;
}

/**
 * Os prêmios por **raridade**, do melhor para o mais comum, com a chance somada do grupo.
 *
 * Era por categoria, e a lista abria com 46% de presentes — o que a pessoa procura primeiro é o
 * prêmio grande. A ordem agora é a da escada de raridade (shared/roulette.ts), que `dropsOf` já
 * usa para ordenar os itens.
 */
function grupos(drops: Drop[]): { r: (typeof RARIDADES)[number]; lista: Drop[]; chance: number }[] {
  return RARIDADES.map((r) => {
    const lista = drops.filter((d) => d.raridade === r.id);
    return { r, lista, chance: lista.reduce((t, d) => t + d.chance, 0) };
  }).filter((g) => g.lista.length > 0);
}

/**
 * O carrossel das abas de decisão.
 *
 * Ticket e aparência são poucos e grandes: em vez de uma grade com espaço sobrando, uma peça por
 * vez, do tamanho de um cartaz, com seta de cada lado e um ponto por item. Quem escolhe aqui é o
 * mesmo `verKey` da prateleira — o carrossel é um seletor, não uma tela à parte.
 */
function Carrossel({ total, i, onIr, children }: { total: number; i: number; onIr: (n: number) => void; children: React.ReactNode }) {
  const ir = (n: number) => {
    sfx.hover();
    onIr((n + total) % total);
  };
  return (
    <div className="carrossel">
      {total > 1 && (
        <button className="carrossel-seta" onClick={() => ir(i - 1)} aria-label="Anterior">
          ‹
        </button>
      )}
      <motion.div key={i} className="carrossel-palco" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}>
        {children}
      </motion.div>
      {total > 1 && (
        <button className="carrossel-seta" onClick={() => ir(i + 1)} aria-label="Próximo">
          ›
        </button>
      )}
      {total > 1 && (
        <div className="carrossel-pontos">
          {Array.from({ length: total }, (_, n) => (
            <button key={n} className={`carrossel-ponto ${n === i ? 'on' : ''}`} onClick={() => ir(n)} aria-label={`Item ${n + 1}`} aria-current={n === i} />
          ))}
        </div>
      )}
    </div>
  );
}

/** O ticket em tamanho de cartaz: a peça do carrossel da aba de tickets. */
function TicketCartaz({ r }: { r: Roulette }) {
  return (
    <div className="cartaz">
      <div className="cartaz-art">
        <div className="ticket-art grandao">
          <span className="ticket-glifo">{r.gender === 'f' ? '✿' : '龍'}</span>
          <span className="ticket-linha">TICKET</span>
        </div>
      </div>
      <h3>{r.name}</h3>
      <p className="shop-sobre">{r.about}</p>
    </div>
  );
}

/** A aparência em tamanho de cartaz: a peça do carrossel da aba de aparências. */
function TemaCartaz({ item }: { item: CatalogItem }) {
  const t = UI_THEMES.find((x) => x.id === item.id) ?? UI_THEMES[0];
  return (
    <div className="cartaz">
      <div className="cartaz-art">
        <div className="tema-cartaz" style={{ background: t.swatch.bg, fontFamily: t.swatch.font }}>
          <span className="tema-cartaz-painel" style={{ background: t.swatch.panel, borderColor: t.swatch.accent, color: t.swatch.text }}>
            <b style={{ color: t.swatch.accent }}>Aa</b>
            <i>{t.swatch.glyph}</i>
          </span>
        </div>
      </div>
      <h3>{t.name}</h3>
      <p className="shop-sobre">{t.description}</p>
    </div>
  );
}

/**
 * O palco de uma roleta: a tabela de prêmios com as chances, e o botão de girar.
 *
 * As chances vêm de `dropsOf` — a mesma tabela que o servidor usa para sortear. O que está escrito
 * aqui é o que vale lá.
 */
function PalcoRoleta({ r, chips, pado, canShop }: { r: Roulette; chips: number; pado: number | null; canShop: boolean }) {
  const drops = dropsOf(r);
  const precoChips = ticketPrice(r, 'chips');
  const precoPado = ticketPrice(r, 'pado');
  const girando = useRoleta((st) => st.status !== 'idle');
  return (
    <motion.div key={r.id} className="panel shop-stage" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      <h2 className="title-deco">{r.name}</h2>
      <div className="shop-stage-art roleta-stage">
        <div className="premios">
          <div className="premios-cab">
            <span>Prêmios possíveis</span>
            <span className="muted small">chance</span>
          </div>
          <div className="premios-rolo">
            {/* por categoria, com a chance do grupo no cabeçalho: a fatia de cada tipo é o que se
                decide olhando, e o item dentro dela é o detalhe */}
            {grupos(drops).map(({ r, lista, chance }) => (
              <div key={r.id} className={`premios-grupo r-${r.id}`}>
                <div className="premios-grupo-cab">
                  <span>{r.label}</span>
                  <b>{pct(chance)}</b>
                </div>
                <ul>
                  {lista.map((d) => (
                    <li key={d.key}>
                      <i className="premio-mini">
                        <Preview item={findItem(d.key)!} />
                      </i>
                      <span className="premio-nome">{labelOf(findItem(d.key)!)}</span>
                      <span className="muted small">{KIND_LABELS[d.kind]}</span>
                      <b>{pct(d.chance)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* girar é a decisão desta aba: os botões são grandes e lado a lado, como a compra no palco */}
      <div className="shop-buy grande">
        <button className="btn btn-gold big" disabled={!canShop || girando || chips < precoChips} onClick={() => spinRoulette(r.id, 'chips')}>
          <ChipSvg value={100} size={22} /> {fmt(precoChips)}
        </button>
        {pado !== null && (
          <button className="btn btn-pado big" disabled={!canShop || girando || pado < precoPado} onClick={() => spinRoulette(r.id, 'pado')}>
            <PadoCoinSvg size={22} /> {fmt(precoPado)}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export function StoreScreen({
  onBack,
  initial = 'gift',
  verInicial,
}: {
  onBack: () => void;
  initial?: Aba;
  /** Abre um item já em tamanho grande (o preview do jogo usa isto para tirar a foto da tela). */
  verInicial?: string;
}) {
  const [aba, setAba] = useState<Aba>(initial);
  const [verKey, setVerKey] = useState<string | null>(verInicial ?? null);
  const ownedList = useOwned();
  const gifts = useGifts();
  const chips = useChips();
  const pado = usePado();
  const canShop = useCanShop();
  const status = useSession((s) => s.status);

  // a vitrine em padocoins depende do saldo, que o servidor só relê a pedido
  useEffect(() => {
    pedeSaldo();
  }, []);

  const items = aba === 'ticket' ? [] : itemsOfKind(aba);
  // o palco nunca fica vazio: sem escolha (ou com uma escolha de outra aba) ele mostra o primeiro
  const vendo = items.find((i) => i.key === verKey) ?? items[0];
  const roleta = aba === 'ticket' ? (findRoulette(verKey ?? '') ?? ROULETTES[0]) : null;
  // a posição do carrossel sai da escolha: é o mesmo estado, visto de outro jeito
  const iCarrossel = aba === 'ticket' ? Math.max(0, ROULETTES.findIndex((r) => r.id === roleta?.id)) : Math.max(0, items.findIndex((x) => x.key === vendo?.key));
  const conta = (k: ItemKind) => {
    const pagos = itemsOfKind(k).filter((i) => !isFree(i.key));
    return { meus: pagos.filter((i) => owns(ownedList, i.key)).length, total: pagos.length };
  };
  const presentes = Object.values(gifts).reduce((t, n) => t + n, 0);

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
          {presentes} presente{presentes === 1 ? '' : 's'} · {conta('ui').meus} de {conta('ui').total} aparências
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

      {/* a navegação da loja fica em cima: são três abas, e a largura toda é da vitrine */}
      <nav className="shop-abas">
        {ABAS.map((a) => (
          <button
            key={a.key}
            className={`shop-aba ${a.key === aba ? 'on' : ''}`}
            onClick={() => {
              sfx.hover();
              setAba(a.key);
            }}
          >
            <span>{a.label}</span>
            {a.key === 'gift' && <b className="shop-tab-conta">{presentes}</b>}
            {a.key === 'ui' && (
              <b className="shop-tab-conta">
                {conta('ui').meus}/{conta('ui').total}
              </b>
            )}
          </button>
        ))}
      </nav>

      <div className={`shop-body ${aba === 'gift' ? 'prateleira' : 'vitrine'}`}>
        {aba === 'gift' ? (
          <motion.div key={aba} className="shop-grid" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            {items.map((item) => (
              <ItemCard
                key={item.key}
                item={item}
                owned={owns(ownedList, item.key)}
                chips={chips}
                pado={pado}
                canShop={canShop}
                estoque={gifts[item.id] ?? 0}
                selecionado={item.key === vendo?.key}
                onVer={() => setVerKey(item.key)}
                semCompra
              />
            ))}
          </motion.div>
        ) : aba === 'ticket' ? (
          <Carrossel total={ROULETTES.length} i={iCarrossel} onIr={(n) => setVerKey(ROULETTES[n].id)}>
            <TicketCartaz r={ROULETTES[iCarrossel]} />
          </Carrossel>
        ) : (
          <Carrossel total={items.length} i={iCarrossel} onIr={(n) => setVerKey(items[n].key)}>
            <TemaCartaz item={items[iCarrossel]} />
          </Carrossel>
        )}

        {roleta ? (
          <PalcoRoleta r={roleta} chips={chips} pado={pado} canShop={canShop} />
        ) : (
          vendo && (
            <Palco
              item={vendo}
              owned={owns(ownedList, vendo.key)}
              chips={chips}
              pado={pado}
              canShop={canShop}
              estoque={vendo.kind === 'gift' ? (gifts[vendo.id] ?? 0) : undefined}
            />
          )
        )}
      </div>
      <RoletaCena />
    </div>
  );
}

/**
 * O prêmio, em uma peça só.
 *
 * A cena do giro não quer a pré-visualização inteira do palco — leque, demonstração de virar,
 * tabela de valores. Quer **a peça**, grande e centrada, do tamanho de uma carta na mão. Por isso
 * não reaproveita `Grande`: o palco é para decidir, esta arte é para comemorar.
 */
function PremioArte({ item }: { item: CatalogItem }) {
  switch (item.kind) {
    case 'character': {
      const c = findCharacter(item.id);
      return (
        <div className="shop-big shop-big-char">
          <CharacterFull st={c} height="100%" />
        </div>
      );
    }
    case 'gift': {
      const g = findGift(item.id);
      return g ? <GiftArt gift={g} size={190} /> : null;
    }
    case 'back':
      return <CardBackSvg style={BACK_PRESETS.find((x) => x.id === item.id) ?? BACK_PRESETS[0]} width={200} />;
    case 'face':
      return <CardFaceSvg card={{ r: 14, s: 's' }} style={FACE_PRESETS.find((x) => x.id === item.id) ?? FACE_PRESETS[0]} width={200} />;
    case 'chip':
      return <ChipSvg value={100} size={190} style={CHIP_PRESETS.find((x) => x.id === item.id) ?? CHIP_PRESETS[0]} />;
    case 'winfx':
      return <CardView card={{ r: 14, s: 's' }} width={200} highlight winFx={findWinFx(item.id)} />;
    case 'table':
    case 'ui':
      // mesa e interface não cabem numa peça: o quadro do palco já é a imagem certa deles
      return <Grande item={item} />;
  }
}

/**
 * A cena do giro: a tela some, o ticket gira e vira o prêmio.
 *
 * Cobre a loja inteira de propósito — o pedido era que a interface se esconda. O prêmio que
 * aparece aqui é o que o **servidor** mandou (`spun`): esta cena não sorteia nada, ela só espera e
 * revela. Enquanto espera, o ticket gira; o piso de tempo está em src/store/roleta.ts.
 *
 * Fechar volta para a loja. Repetido aparece com as fichas que ele valeu, para o ticket nunca
 * parecer perdido.
 */
function RoletaCena() {
  const { status, roulette, premio, fechar } = useRoleta();
  if (status === 'idle') return null;
  const r = findRoulette(roulette ?? '');
  const item = premio ? findItem(premio.key) : null;
  return (
    <div className="giro-cena" onClick={status === 'revelado' ? fechar : undefined}>
      <div className="giro-fundo" />
      {status === 'girando' ? (
        <div className="giro-meio">
          <motion.div
            className="ticket-art grande girando"
            animate={{ rotateY: 360 }}
            transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}
            style={{ transformPerspective: 900 }}
          >
            <span className="ticket-glifo">{r?.gender === 'f' ? '✿' : '龍'}</span>
            <span className="ticket-linha">TICKET</span>
          </motion.div>
          <div className="giro-linha">sorteando…</div>
        </div>
      ) : (
        item && (
          <motion.div className="giro-meio" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
            <Sparks color={premio?.dup ? '#b3a9d6' : 'var(--gold)'} count={14} rise={90} spread={140} size={5} />
            <div className="giro-premio">
              <PremioArte item={item} />
            </div>
            <h2 className="title-deco">{labelOf(item)}</h2>
            <div className="giro-linha">
              {premio?.dup ? (
                <>
                  você já tinha — virou <b>{fmt(premio.refund)}</b> fichas
                </>
              ) : (
                <>{KIND_LABELS[item.kind]} · é seu!</>
              )}
            </div>
            <button className="btn btn-gold" onClick={fechar}>
              Fechar
            </button>
          </motion.div>
        )
      )}
    </div>
  );
}
