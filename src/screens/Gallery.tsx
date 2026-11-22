import { Fragment, Suspense, lazy, useState } from 'react';
import { motion } from 'framer-motion';
import { GALERIA, KIND_LABELS, estaAVenda, isFree, itemsOfKind, owns, padoPrice, quantasTem, rarityLabel, rarityOf, seConta, type CatalogItem, type ItemKind } from '../../shared/catalog';
import { ROULETTES, dropsOf, refundOf } from '../../shared/roulette';
import { TIPOS_DE_ACESSORIO, emUso, findAcessorio, vezesEmUso, type Acessorio } from '../../shared/acessorios';
import { findCharacter } from '../../shared/styles';
import { AcessorioArt } from '../render/AcessorioArt';
import { useEquipped, useProfile } from '../store/profile';
import { ChipSvg } from '../render/Chip';
import { PadoCoinSvg } from '../render/PadoCoin';
import { useOwned, usePado } from '../store/shop';
import { useChips } from '../ui/Wallet';
import { ScreenHeader } from '../ui/controls';
import { fmt } from '../util/format';
import { sfx } from '../audio/sfx';
import { Grande, Preview, labelOf, pct } from './Store';
import { Petals } from './MainMenu';
import { experimentando, focoDa } from './EstudioDeAcessorios';

/**
 * A Galeria — a coleção do jogador.
 *
 * Nasceu dentro da loja e saiu de lá quando a loja virou vitrine de presentes e tickets: aqui não
 * se compra nada. Mostra o que é seu, o que falta, cada peça de perto e **de onde ela sai** — a
 * roleta e a chance, e, para os acessórios que a loja vende, que ela se compra lá e por quanto. É a
 * tela que responde "o que ainda me falta e onde consigo".
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
/** A vitrine 3D das mãos (carregada à parte: o three.js só desce quando alguém abre os acessórios). */
const VitrineDeMaos = lazy(() => import('../mesa3d/VitrineDeMaos'));

/** As mãos do jogador com a peça: a vitrine 3D, com o desenho da peça enquanto ela não chega. */
function MaosComAPeca({ a }: { a: Acessorio }) {
  const meus = useProfile((s) => s.acessorios);
  const personagem = findCharacter(useProfile((s) => s.character)).id;
  const mesa = useEquipped('table');
  const vestidos = experimentando(meus, a);
  // A câmera chega perto de onde a peça está: os dedos da mão que tem o anel, o pulso que tem a
  // pulseira ou o relógio, as unhas (o esmalte). A luva se vê nas duas mãos, de longe.
  const [perto, setPerto] = useState(true);
  const foco = perto ? focoDa(vestidos, a) : null;
  return (
    <div className="shop-grande shop-maos">
      <Suspense fallback={<AcessorioArt a={a} size={220} />}>
        <VitrineDeMaos personagem={personagem} acessorios={vestidos} mesa={mesa} foco={foco} />
      </Suspense>
      {a.tipo !== 'luva' && (
        <button className="vitrine-zoom" onClick={() => setPerto(!perto)} title={perto ? 'Ver as duas mãos' : 'Ver a peça de perto'}>
          {perto ? '⤢ As duas mãos' : '⌕ De perto'}
        </button>
      )}
      <p className="shop-sobre">{a.sobre}</p>
    </div>
  );
}

/**
 * Usar um acessório: vai-se ao **Estúdio**, como com os outros cosméticos — é lá que se escolhe o dedo,
 * o braço e a mão. A Galeria diz quantas a pessoa tem e quantas estão em uso, e leva até lá.
 */
function UsarAcessorio({ a, owned, noEstudio }: { a: Acessorio; owned: boolean; noEstudio?: (id: string) => void }) {
  const meus = useProfile((s) => s.acessorios);
  const ownedList = useOwned();
  if (!owned) return <div className="equipar muted small">Você ainda não tem esta peça: a vitrine mostra como ela fica.</div>;
  const key = `acessorio:${a.id}`;
  const tem = quantasTem(ownedList, key);
  const usados = vezesEmUso(meus, a.id);
  return (
    <div className="equipar">
      {seConta(key) && (
        <div className="equipar-titulo">
          Você tem {tem} · {usados ? `${usados} em uso` : 'nenhuma em uso'}
        </div>
      )}
      {noEstudio ? (
        <button
          className="equipar-botao largo"
          onClick={() => {
            sfx.click();
            noEstudio(a.id);
          }}
        >
          {usados ? 'Mudar no Estúdio' : 'Usar no Estúdio'} →
        </button>
      ) : (
        <div className="muted small">Para usar, abra o Estúdio → Acessórios.</div>
      )}
    </div>
  );
}

function GaleriaCard({ item, owned, selecionado, onVer, emUso: usando, quantas }: { item: CatalogItem; owned: boolean; selecionado: boolean; onVer: () => void; emUso?: boolean; /** Quantas a conta tem (das joias, que se contam). */ quantas?: number }) {
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
      {/* (o que falta e a loja vende diz onde está: é a diferença entre "tente a sorte" e "vá buscar") */}
      <div className={owned ? 'shop-owned' : 'shop-falta'}>
        {usando ? '● Em uso' : owned ? (isFree(item.key) ? 'Já vem com o jogo' : '✓ Seu') : estaAVenda(item.key) ? 'Falta · na loja' : 'Falta'}
        {owned && quantas !== undefined && quantas > 1 ? ` · ×${quantas}` : ''}
      </div>
    </button>
  );
}

/**
 * De onde sai uma peça.
 *
 * A galeria não vende: mostra. Então o que o palco precisa dizer é em qual roleta aquilo cai e com
 * que chance — e, se já for do jogador, que não há mais o que procurar.
 *
 * Os acessórios que a loja vende (`estaAVenda`) têm dois caminhos, e o palco diz os dois: **compra-se
 * na loja**, pelo preço do degrau, e também sai da roleta. O que não se vende diz que é só de roleta —
 * para ninguém ir procurar na prateleira um anel de safira que nunca vai estar lá.
 */
export function DeOndeVem({ item, owned, pado = null }: { item: CatalogItem; owned: boolean; pado?: number | null }) {
  const fontes = ROULETTES.map((r) => ({ r, drop: dropsOf(r).find((d) => d.key === item.key) })).filter((f) => f.drop);
  const naLoja = estaAVenda(item.key);
  return (
    <div className="shop-vem">
      {owned && !(seConta(item.key) && naLoja) ? (
        <div className="shop-owned">{isFree(item.key) ? 'Já vem com o jogo' : '✓ Seu'}</div>
      ) : (
        <>
          {naLoja && (
            <div className="shop-vem-linha loja">
              <span>Compra-se na Loja</span>
              <b>
                <ChipSvg value={100} size={15} /> {fmt(item.chips)}
                {pado !== null && (
                  <>
                    {' '}
                    · <PadoCoinSvg size={15} /> {fmt(padoPrice(item.chips))}
                  </>
                )}
              </b>
            </div>
          )}
          {fontes.map(({ r, drop }) => (
            <div key={r.id} className="shop-vem-linha">
              <span>{r.name}</span>
              <b>{pct(drop!.chance)}</b>
            </div>
          ))}
          {fontes.length ? (
            <div className="muted small">
              {naLoja ? 'Também sai de roleta.' : 'Não se compra: só sai de roleta.'}{' '}
              {seConta(item.key) ? 'Repetida é mais uma peça: dá para usar as duas.' : `Repetido vira ${fmt(refundOf(item.key))} fichas.`}
            </div>
          ) : (
            !naLoja && <div className="muted small">Não sai de roleta.</div>
          )}
        </>
      )}
    </div>
  );
}

export function GalleryScreen({
  onBack,
  initial = 'character',
  verInicial,
  noEstudio,
}: {
  onBack: () => void;
  initial?: ItemKind;
  verInicial?: string;
  /** Abre o Estúdio na aba dos acessórios, com esta peça escolhida (é lá que ela se veste). */
  noEstudio?: (id: string) => void;
}) {
  const [kind, setKind] = useState<ItemKind>(initial);
  const [verKey, setVerKey] = useState<string | null>(verInicial ?? null);
  const ownedList = useOwned();
  const chips = useChips();
  const pado = usePado();
  const meusAcessorios = useProfile((s) => s.acessorios);

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
          {/* os acessórios vêm separados por tipo (anéis, pulseiras, relógios, esmaltes, luvas); o resto, numa prateleira só */}
          {(kind === 'acessorio' ? TIPOS_DE_ACESSORIO : [null]).map((grupo) => (
            <Fragment key={grupo?.id ?? 'todos'}>
              {grupo && <h3 className="shop-grupo">{grupo.nome}</h3>}
              {items
                .filter((item) => !grupo || findAcessorio(item.id)?.tipo === grupo.id)
                .map((item) => (
                  <GaleriaCard
                    key={item.key}
                    item={item}
                    owned={owns(ownedList, item.key)}
                    selecionado={item.key === vendo?.key}
                    onVer={() => setVerKey(item.key)}
                    emUso={item.kind === 'acessorio' && emUso(meusAcessorios, item.id)}
                    quantas={seConta(item.key) ? quantasTem(ownedList, item.key) : undefined}
                  />
                ))}
            </Fragment>
          ))}
        </motion.div>

        {vendo && (
          <motion.div key={vendo.key} className="panel shop-stage" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            <h2 className="title-deco">{labelOf(vendo)}</h2>
            <div className="shop-stage-art">
              {/* o acessório aparece onde é usado: nas mãos do seu personagem, na mesa */}
              {vendo.kind === 'acessorio' && findAcessorio(vendo.id) ? <MaosComAPeca a={findAcessorio(vendo.id)!} /> : <Grande item={vendo} />}
              <Carimbo item={vendo} grande />
            </div>
            {vendo.kind === 'acessorio' && findAcessorio(vendo.id) && <UsarAcessorio a={findAcessorio(vendo.id)!} owned={owns(ownedList, vendo.key)} noEstudio={noEstudio} />}
            <DeOndeVem item={vendo} owned={owns(ownedList, vendo.key)} pado={pado} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
