import { useState } from 'react';
import { motion } from 'framer-motion';
import { GALERIA, KIND_LABELS, isFree, itemsOfKind, owns, rarityLabel, rarityOf, type CatalogItem, type ItemKind } from '../../shared/catalog';
import { ROULETTES, dropsOf, refundOf } from '../../shared/roulette';
import { ChipSvg } from '../render/Chip';
import { PadoCoinSvg } from '../render/PadoCoin';
import { useOwned, usePado } from '../store/shop';
import { useChips } from '../ui/Wallet';
import { ScreenHeader } from '../ui/controls';
import { fmt } from '../util/format';
import { sfx } from '../audio/sfx';
import { Grande, Preview, labelOf, pct } from './Store';
import { Petals } from './MainMenu';

/**
 * A Galeria — a coleção do jogador.
 *
 * Nasceu dentro da loja e saiu de lá quando a loja virou vitrine de presentes e tickets: aqui não
 * se compra nada. Mostra o que é seu, o que falta, cada peça de perto e **de onde ela sai** — a
 * roleta e a chance. É a tela que responde "o que ainda me falta e onde consigo".
 *
 * O layout é o da loja antiga, que serve bem para isto: tipos na coluna da esquerda, prateleira no
 * meio, a peça grande à direita.
 */

/**
 * O carimbo de raridade.
 *
 * Vem por cima da peça, na diagonal, como tinta de carimbo sobre papel: a raridade é um selo que
 * alguém bateu ali, não um rótulo de prateleira. **Cada degrau tem letra própria** — a lendária em
 * capitulares decorativas, a épica em itálico de revista, a rara em romanas gravadas, a incomum em
 * itálico fino, a comum na letra do jogo — porque quem joga reconhece o degrau pela forma da
 * palavra antes de ler a palavra.
 */
export function Carimbo({ item, grande }: { item: CatalogItem; grande?: boolean }) {
  const r = rarityOf(item.key);
  return (
    <span className={`carimbo r-${r} ${grande ? 'grande' : ''}`} aria-label={`Raridade: ${rarityLabel(r)}`}>
      {rarityLabel(r)}
    </span>
  );
}

/**
 * O cartão de uma peça: a arte, o nome e se é sua. Sem preço — isto não se compra.
 *
 * O cartão **todo** é o clique: aqui não há nada para apertar dentro dele, e a área que a pessoa
 * mira é a peça inteira, não só a figurinha.
 */
function GaleriaCard({ item, owned, selecionado, onVer }: { item: CatalogItem; owned: boolean; selecionado: boolean; onVer: () => void }) {
  return (
    <button
      className={`shop-card clicavel galeria ${owned ? 'owned' : 'falta'} ${selecionado ? 'on' : ''}`}
      onClick={() => {
        sfx.hover();
        onVer();
      }}
      title="ver de perto"
      aria-pressed={selecionado}
    >
      <Preview item={item} />
      <Carimbo item={item} />
      <div className="shop-name">{labelOf(item)}</div>
      <div className={owned ? 'shop-owned' : 'shop-falta'}>{owned ? (isFree(item.key) ? 'Já vem com o jogo' : '✓ Seu') : 'Falta'}</div>
    </button>
  );
}

/**
 * De onde sai uma peça.
 *
 * A galeria não vende: mostra. Então o que o palco precisa dizer é em qual roleta aquilo cai e com
 * que chance — e, se já for do jogador, que não há mais o que procurar.
 */
export function DeOndeVem({ item, owned }: { item: CatalogItem; owned: boolean }) {
  const fontes = ROULETTES.map((r) => ({ r, drop: dropsOf(r).find((d) => d.key === item.key) })).filter((f) => f.drop);
  return (
    <div className="shop-vem">
      {owned ? (
        <div className="shop-owned">{isFree(item.key) ? 'Já vem com o jogo' : '✓ Seu'}</div>
      ) : fontes.length ? (
        <>
          {fontes.map(({ r, drop }) => (
            <div key={r.id} className="shop-vem-linha">
              <span>{r.name}</span>
              <b>{pct(drop!.chance)}</b>
            </div>
          ))}
          <div className="muted small">Repetido vira {fmt(refundOf(item.key))} fichas.</div>
        </>
      ) : (
        <div className="muted small">Não sai de roleta.</div>
      )}
    </div>
  );
}

export function GalleryScreen({ onBack, initial = 'character', verInicial }: { onBack: () => void; initial?: ItemKind; verInicial?: string }) {
  const [kind, setKind] = useState<ItemKind>(initial);
  const [verKey, setVerKey] = useState<string | null>(verInicial ?? null);
  const ownedList = useOwned();
  const chips = useChips();
  const pado = usePado();

  const items = itemsOfKind(kind);
  // o palco nunca fica vazio: sem escolha (ou com uma escolha de outro tipo) ele mostra o primeiro
  const vendo = items.find((i) => i.key === verKey) ?? items[0];
  const conta = (k: ItemKind) => {
    const pagos = itemsOfKind(k).filter((i) => !isFree(i.key));
    return { meus: pagos.filter((i) => owns(ownedList, i.key)).length, total: pagos.length };
  };
  const colecao = GALERIA.map(conta).reduce((t, c) => ({ meus: t.meus + c.meus, total: t.total + c.total }), { meus: 0, total: 0 });

  return (
    <div className="screen shop-screen">
      <div className="menu-bg" />
      <Petals />
      <ScreenHeader title="Galeria" onBack={onBack}>
        <span className="shop-coin">
          <ChipSvg value={100} size={22} /> {fmt(chips)}
        </span>
        {pado !== null && (
          <span className="shop-coin">
            <PadoCoinSvg size={22} /> {fmt(pado)}
          </span>
        )}
        <span className="muted small">
          {colecao.meus} de {colecao.total} peças
        </span>
      </ScreenHeader>

      <div className="shop-body">
        <nav className="shop-tabs">
          {GALERIA.map((k) => {
            const c = conta(k);
            return (
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
                  {c.meus}/{c.total}
                </b>
              </button>
            );
          })}
        </nav>

        <motion.div key={kind} className="shop-grid" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          {items.map((item) => (
            <GaleriaCard
              key={item.key}
              item={item}
              owned={owns(ownedList, item.key)}
              selecionado={item.key === vendo?.key}
              onVer={() => setVerKey(item.key)}
            />
          ))}
        </motion.div>

        {vendo && (
          <motion.div key={vendo.key} className="panel shop-stage" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            <h2 className="title-deco">{labelOf(vendo)}</h2>
            <div className="shop-stage-art">
              <Grande item={vendo} />
              <Carimbo item={vendo} grande />
            </div>
            <DeOndeVem item={vendo} owned={owns(ownedList, vendo.key)} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
