import { Fragment, Suspense, lazy, useState } from 'react';
import { motion } from 'framer-motion';
import { GALERIA, KIND_LABELS, estaAVenda, isFree, itemsOfKind, owns, padoPrice, rarityLabel, rarityOf, type CatalogItem, type ItemKind } from '../../shared/catalog';
import { ROULETTES, dropsOf, refundOf } from '../../shared/roulette';
import { DEDOS, MAOS, MAX_ANEIS, ORDEM_DOS_DEDOS, TIPOS_DE_ACESSORIO, alternarAnel, alternarPulso, emUso, findAcessorio, type Acessorio, type Acessorios } from '../../shared/acessorios';
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
type FocoDaVitrine = import('../mesa3d/VitrineDeMaos').FocoDaVitrine;

/**
 * Os acessórios com a peça escolhida "experimentada": se ela ainda não está em uso, entra onde
 * costuma ir — o anel no anelar esquerdo, a pulseira e o relógio no pulso esquerdo, o esmalte e a
 * luva no lugar dos de agora —, para a vitrine mostrá-la mesmo antes de equipar (e mesmo sem tê-la).
 */
function experimentando(meus: Acessorios, a: Acessorio): Acessorios {
  if (emUso(meus, a.id)) return meus;
  if (a.tipo === 'anel') return alternarAnel(meus, a.id, 'E', 2);
  if (a.tipo === 'pulseira' || a.tipo === 'relogio') return alternarPulso(meus, a.id, 'E');
  return a.tipo === 'esmalte' ? { ...meus, esmalte: a.id } : { ...meus, luva: a.id };
}

/** As mãos do jogador com a peça: a vitrine 3D, com o desenho da peça enquanto ela não chega. */
function MaosComAPeca({ a }: { a: Acessorio }) {
  const meus = useProfile((s) => s.acessorios);
  const personagem = findCharacter(useProfile((s) => s.character)).id;
  const mesa = useEquipped('table');
  const vestidos = experimentando(meus, a);
  // A câmera chega perto de onde a peça está: os dedos da mão que tem o anel, o pulso que tem a
  // pulseira ou o relógio, as unhas (o esmalte). A luva se vê nas duas mãos, de longe.
  const [perto, setPerto] = useState(true);
  const foco: FocoDaVitrine =
    !perto || a.tipo === 'luva'
      ? null
      : a.tipo === 'anel'
        ? { mao: vestidos.aneis.find((x) => x.id === a.id)?.mao ?? 'E', onde: 'dedos', dedo: vestidos.aneis.find((x) => x.id === a.id)?.dedo ?? 2 }
        : a.tipo === 'esmalte'
          ? { mao: 'E', onde: 'dedos' }
          : { mao: vestidos.pulsos.D === a.id && vestidos.pulsos.E !== a.id ? 'D' : 'E', onde: 'pulso' };
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
 * Equipar um acessório — a Galeria só mostra as outras peças, mas estas se vestem aqui mesmo: é
 * onde a pessoa as vê nas mãos.
 *
 * O anel pede um dedo (um por dedo, até `MAX_ANEIS`), a pulseira e o relógio pedem um pulso (um em
 * cada), e o esmalte e a luva são um só de cada vez — escolher outro troca. Só se equipa o que é
 * da conta; o resto dá para ver na vitrine, e a lista abaixo diz de onde sai.
 */
function EquiparAcessorio({ a, owned }: { a: Acessorio; owned: boolean }) {
  const meus = useProfile((s) => s.acessorios);
  const setAcessorios = useProfile((s) => s.setAcessorios);
  const por = (novo: Acessorios) => {
    sfx.click();
    setAcessorios(novo);
  };
  if (!owned) return <div className="equipar muted small">Você ainda não tem esta peça: a vitrine mostra como ela fica.</div>;
  if (a.tipo === 'anel') {
    return (
      <div className="equipar">
        <div className="equipar-titulo">Em que dedo?</div>
        {MAOS.map((mao) => (
          <div key={mao.id} className="equipar-linha">
            <span className="equipar-mao">{mao.nome}</span>
            {/* (na tela, a mão esquerda tem o polegar do lado de dentro: a ordem dos botões é a dos dedos vistos de cima) */}
            {(mao.id === 'E' ? [...ORDEM_DOS_DEDOS].reverse() : ORDEM_DOS_DEDOS).map((dedo) => {
              const posto = meus.aneis.find((x) => x.mao === mao.id && x.dedo === dedo);
              const outro = posto && posto.id !== a.id ? findAcessorio(posto.id) : undefined;
              return (
                <button
                  key={dedo}
                  className={`equipar-botao ${posto?.id === a.id ? 'on' : ''} ${outro ? 'ocupado' : ''}`}
                  title={outro ? `${DEDOS[dedo]}: tem ${outro.nome} (clicar troca)` : DEDOS[dedo]}
                  aria-pressed={posto?.id === a.id}
                  onClick={() => por(alternarAnel(meus, a.id, mao.id, dedo))}
                >
                  {DEDOS[dedo]}
                </button>
              );
            })}
          </div>
        ))}
        <div className="muted small">
          {meus.aneis.length} de {MAX_ANEIS} anéis em uso. Clicar de novo no dedo tira o anel.
        </div>
      </div>
    );
  }
  if (a.tipo === 'pulseira' || a.tipo === 'relogio') {
    return (
      <div className="equipar">
        <div className="equipar-titulo">Em que pulso?</div>
        <div className="equipar-linha">
          {MAOS.map((mao) => {
            const la = meus.pulsos[mao.id];
            const outro = la && la !== a.id ? findAcessorio(la) : undefined;
            return (
              <button
                key={mao.id}
                className={`equipar-botao largo ${la === a.id ? 'on' : ''} ${outro ? 'ocupado' : ''}`}
                title={outro ? `Tem ${outro.nome} (clicar troca)` : undefined}
                aria-pressed={la === a.id}
                onClick={() => por(alternarPulso(meus, a.id, mao.id))}
              >
                {mao.id === 'E' ? 'Pulso esquerdo' : 'Pulso direito'}
              </button>
            );
          })}
        </div>
        <div className="muted small">Um em cada pulso. Clicar de novo tira.</div>
      </div>
    );
  }
  const usando = a.tipo === 'esmalte' ? meus.esmalte === a.id : meus.luva === a.id;
  return (
    <div className="equipar">
      <button className={`equipar-botao largo ${usando ? 'on' : ''}`} aria-pressed={usando} disabled={usando} onClick={() => por(a.tipo === 'esmalte' ? { ...meus, esmalte: a.id } : { ...meus, luva: a.id })}>
        {usando ? '✓ Em uso' : a.tipo === 'esmalte' ? 'Usar este esmalte' : 'Usar esta luva'}
      </button>
    </div>
  );
}

function GaleriaCard({ item, owned, selecionado, onVer, emUso: usando }: { item: CatalogItem; owned: boolean; selecionado: boolean; onVer: () => void; emUso?: boolean }) {
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
      <div className={owned ? 'shop-owned' : 'shop-falta'}>{usando ? '● Em uso' : owned ? (isFree(item.key) ? 'Já vem com o jogo' : '✓ Seu') : estaAVenda(item.key) ? 'Falta · na loja' : 'Falta'}</div>
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
      {owned ? (
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
              {naLoja ? 'Também sai de roleta.' : 'Não se compra: só sai de roleta.'} Repetido vira {fmt(refundOf(item.key))} fichas.
            </div>
          ) : (
            !naLoja && <div className="muted small">Não sai de roleta.</div>
          )}
        </>
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
            {vendo.kind === 'acessorio' && findAcessorio(vendo.id) && <EquiparAcessorio a={findAcessorio(vendo.id)!} owned={owns(ownedList, vendo.key)} />}
            <DeOndeVem item={vendo} owned={owns(ownedList, vendo.key)} pado={pado} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
