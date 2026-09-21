import { useState } from 'react';
import { motion } from 'framer-motion';
import { CATALOG, KIND_LABELS, isFree, itemsOfKind, owns, padoPrice, type CatalogItem, type Currency, type ItemKind } from '../../shared/catalog';
import { BACK_PRESETS, CHIP_PRESETS, FACE_PRESETS, TABLE_PRESETS, findCharacter } from '../../shared/styles';
import { UI_THEMES } from '../ui/themes';
import { CardBackSvg, CardFaceSvg, CardView } from '../render/CardArt';
import { CharacterPortrait } from '../render/CharacterArt';
import { ChipSvg } from '../render/Chip';
import { PadoCoinSvg } from '../render/PadoCoin';
import { findWinFx } from '../render/cardfx';
import { useSession } from '../store/session';
import { buyItem, useCanShop, useOwned, usePado } from '../store/shop';
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
}: {
  item: CatalogItem;
  owned: boolean;
  chips: number;
  /** Saldo de padocoins, ou null quando a conta não tem Discord (a moeda não existe). */
  pado: number | null;
  canShop: boolean;
  onBuy?: (key: string, currency: Currency) => void;
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
    <div className={`shop-card ${owned ? 'owned' : ''}`}>
      <Preview item={item} />
      <div className="shop-name">{labelOf(item)}</div>
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

export function StoreScreen({ onBack, initial = 'character' }: { onBack: () => void; initial?: ItemKind }) {
  const [kind, setKind] = useState<ItemKind>(initial);
  const ownedList = useOwned();
  const chips = useChips();
  const pado = usePado();
  const canShop = useCanShop();
  const status = useSession((s) => s.status);

  const items = itemsOfKind(kind);
  const total = CATALOG.filter((i) => !isFree(i.key)).length;
  const meus = CATALOG.filter((i) => !isFree(i.key) && owns(ownedList, i.key)).length;

  return (
    <div className="screen shop-screen">
      <div className="menu-bg" />
      <Petals />
      <ScreenHeader title="Loja" onBack={onBack} />
      <div className="shop-top">
        <div className="shop-wallet">
          <span className="shop-coin">
            <ChipSvg value={100} size={22} /> {fmt(chips)}
          </span>
          {pado !== null && (
            <span className="shop-coin">
              <PadoCoinSvg size={22} /> {fmt(pado)}
            </span>
          )}
        </div>
        <div className="muted small">
          {meus} de {total} itens
        </div>
      </div>

      {!canShop && (
        <div className="shop-warn">
          {status === 'connecting'
            ? 'Conectando ao servidor…'
            : 'A loja fica no servidor: entre numa conta para comprar. Sem conta dá para jogar, mas o que se compra precisa de um lugar para ficar guardado.'}
        </div>
      )}
      {canShop && pado === null && (
        <div className="shop-hint">
          Vincule seu Discord em <b>Ajustes → Conta</b> para pagar com <b>padocoins</b>.
        </div>
      )}

      <div className="shop-tabs">
        {ORDER.map((k) => (
          <button
            key={k}
            className={`shop-tab ${k === kind ? 'on' : ''}`}
            onClick={() => {
              sfx.hover();
              setKind(k);
            }}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <motion.div key={kind} className="shop-grid" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {items.map((item) => (
          <ItemCard key={item.key} item={item} owned={owns(ownedList, item.key)} chips={chips} pado={pado} canShop={canShop} />
        ))}
      </motion.div>
    </div>
  );
}
