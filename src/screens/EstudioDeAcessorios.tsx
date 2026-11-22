import { Fragment, Suspense, lazy, useState } from 'react';
import {
  ACESSORIOS,
  DEDOS,
  LUVA_PADRAO,
  MAOS,
  MAX_ANEIS,
  MAX_PULSEIRAS,
  ORDEM_DOS_DEDOS,
  SEM_ACESSORIOS,
  TIPOS_DE_ACESSORIO,
  alternarAnel,
  bracoDoRelogio,
  cabeNoBraco,
  chaveDosAcessorios,
  comLegado,
  emUso,
  findAcessorio,
  moverNoBraco,
  porLuva,
  porNoBraco,
  pulseirasNoBraco,
  tirarDoBraco,
  vezesEmUso,
  type Acessorio,
  type Acessorios,
  type Mao,
} from '../../shared/acessorios';
import { itemKey, owns, quantasTem, seConta } from '../../shared/catalog';
import { findCharacter } from '../../shared/styles';
import { AcessorioArt } from '../render/AcessorioArt';
import { useEquipped, useProfile } from '../store/profile';
import { useOwned } from '../store/shop';
import { Section } from '../ui/controls';
import { sfx } from '../audio/sfx';

/**
 * O Estúdio dos acessórios — onde se veste o que vai nas mãos, como os outros cosméticos se equipam
 * no Estúdio.
 *
 * A lista mostra só o que é da conta, com **quantas** ela tem de cada peça (as joias se contam: veja
 * `seConta`, em shared/catalog.ts) e quantas estão em uso. O palco é a vitrine 3D das mãos do seu
 * personagem; ao lado, onde usar a peça escolhida:
 *
 *  - o anel, num dedo (o mesmo anel em mais de um dedo, se houver mais de um dele);
 *  - a pulseira e o relógio, na fila de um braço, do pulso para o cotovelo — até cinco pulseiras em
 *    cada braço e um relógio só, com pulseiras abaixo dele (junto da mão) ou acima;
 *  - a luva, nas duas mãos ou numa só;
 *  - o esmalte, em todas as unhas.
 *
 * A Galeria continua mostrando todas as peças, as que faltam também, e manda para cá quem quer vestir.
 */

const VitrineDeMaos = lazy(() => import('../mesa3d/VitrineDeMaos'));
type FocoDaVitrine = import('../mesa3d/VitrineDeMaos').FocoDaVitrine;

const LADO = { E: 'esquerdo', D: 'direito' } as const;
const chave = (id: string): string => itemKey('acessorio', id);
const nomeDe = (id: string): string => findAcessorio(id)?.nome ?? id;

/**
 * Os acessórios com a peça escolhida "experimentada": se ela ainda não está em uso, entra onde
 * costuma ir — o anel no anelar esquerdo, a pulseira e o relógio no braço esquerdo (no direito, se o
 * esquerdo estiver cheio), o esmalte e a luva no lugar dos de agora —, para a vitrine mostrá-la
 * mesmo antes de equipar (e mesmo sem tê-la, na Galeria).
 */
export function experimentando(meus: Acessorios, a: Acessorio): Acessorios {
  if (emUso(meus, a.id)) return meus;
  if (a.tipo === 'anel') return alternarAnel(meus, a.id, 'E', 2);
  if (a.tipo === 'pulseira' || a.tipo === 'relogio') return porNoBraco(meus, a.id, cabeNoBraco(meus, a.id, 'E') ? 'E' : 'D');
  return a.tipo === 'esmalte' ? comLegado({ ...meus, esmalte: a.id }) : porLuva(meus, a.id, ['E', 'D']);
}

/** Para onde a câmera da vitrine olha, para ver a peça de perto: os dedos da mão do anel, o pulso do braço dela, as unhas. A luva se vê de longe. */
export function focoDa(vestidos: Acessorios, a: Acessorio): FocoDaVitrine {
  if (a.tipo === 'luva') return null;
  if (a.tipo === 'anel') {
    const posto = vestidos.aneis.find((x) => x.id === a.id);
    return { mao: posto?.mao ?? 'E', onde: 'dedos', dedo: posto?.dedo ?? 2 };
  }
  if (a.tipo === 'esmalte') return { mao: 'E', onde: 'dedos' };
  return { mao: !vestidos.bracos.E.includes(a.id) && vestidos.bracos.D.includes(a.id) ? 'D' : 'E', onde: 'pulso' };
}

/**
 * Põe o anel num dedo — ou o tira, se ele já está ali. Com todos os dele em uso, o último que foi
 * posto muda para este dedo: quem tem um anel só o leva de um dedo para o outro com um clique.
 */
function anelNoDedo(meus: Acessorios, id: string, mao: Mao, dedo: number, tem: number): Acessorios {
  const posto = meus.aneis.find((x) => x.mao === mao && x.dedo === dedo);
  if (posto?.id === id) return alternarAnel(meus, id, mao, dedo);
  let base = meus;
  if (vezesEmUso(meus, id) >= tem) {
    const k = meus.aneis.map((x) => x.id).lastIndexOf(id);
    base = comLegado({ ...meus, aneis: meus.aneis.filter((_, j) => j !== k) });
  }
  return alternarAnel(base, id, mao, dedo);
}

/** A luva só nestas mãos: nelas entra esta; a outra mão, se estava com esta mesma, fica nua (se estava com outra, fica com a outra). */
function luvaSoEm(meus: Acessorios, id: string, maos: readonly Mao[]): Acessorios {
  const luvas = { ...meus.luvas };
  for (const m of ['E', 'D'] as const) {
    if (maos.includes(m)) luvas[m] = id;
    else if (luvas[m] === id) luvas[m] = LUVA_PADRAO;
  }
  return comLegado({ ...meus, luvas });
}

/** O anel: em que dedo (um por dedo, até `MAX_ANEIS`). */
function OndeOAnel({ a, meus, tem, por }: { a: Acessorio; meus: Acessorios; tem: number; por: (n: Acessorios) => void }) {
  const usados = vezesEmUso(meus, a.id);
  return (
    <div className="equipar">
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
                onClick={() => por(anelNoDedo(meus, a.id, mao.id, dedo, tem))}
              >
                {DEDOS[dedo]}
              </button>
            );
          })}
        </div>
      ))}
      <div className="muted small">
        {meus.aneis.length} de {MAX_ANEIS} anéis em uso.{' '}
        {tem > 1 ? `Você tem ${tem} deste: ${usados} em uso. ` : ''}
        Clicar de novo no dedo tira o anel{usados >= tem ? '; clicar noutro dedo o muda de lugar' : ''}.
      </div>
    </div>
  );
}

/** A pulseira e o relógio: a fila de cada braço, do cotovelo (em cima) ao pulso (embaixo), e o botão de pôr a peça escolhida. */
function OndeNoBraco({ a, meus, tem, por, ver }: { a: Acessorio; meus: Acessorios; tem: number; por: (n: Acessorios) => void; ver: (id: string) => void }) {
  const usados = vezesEmUso(meus, a.id);
  const relogio = a.tipo === 'relogio';
  const ondeORelogio = bracoDoRelogio(meus);
  const relogioPosto = ondeORelogio ? meus.bracos[ondeORelogio].find((id) => findAcessorio(id)?.tipo === 'relogio') : undefined;
  /** Por que não dá para pôr neste braço (null: dá). */
  const impede = (mao: Mao): string | null => {
    if (relogio) return ondeORelogio === mao && relogioPosto === a.id ? 'Ele já está neste braço' : null;
    if (!cabeNoBraco(meus, a.id, mao)) return `Cinco pulseiras: o braço ${LADO[mao]} está cheio`;
    if (usados >= tem) return tem === 1 ? 'Você tem uma só, e ela já está em uso' : `Você tem ${tem}, e todas já estão em uso`;
    return null;
  };
  const rotulo = (mao: Mao): string => {
    if (!relogio) return '+ Pôr neste braço';
    if (relogioPosto === a.id) return ondeORelogio === mao ? '✓ Neste braço' : 'Passar para este braço';
    return relogioPosto ? 'Trocar o relógio' : '+ Pôr neste braço';
  };
  return (
    <div className="equipar">
      <div className="bracos">
        {MAOS.map((mao) => {
          const fila = meus.bracos[mao.id];
          const motivo = impede(mao.id);
          return (
            <div key={mao.id} className="braco">
              <div className="equipar-titulo">Braço {LADO[mao.id]}</div>
              <div className="muted small">
                {pulseirasNoBraco(meus, mao.id)} de {MAX_PULSEIRAS} pulseiras{ondeORelogio === mao.id ? ' e o relógio' : ''}
              </div>
              <div className="braco-ponta">cotovelo</div>
              <ol className="braco-fila">
                {fila.length ? (
                  fila
                    .map((id, i) => ({ id, i }))
                    .reverse()
                    .map(({ id, i }) => {
                      const p = findAcessorio(id);
                      if (!p) return null;
                      return (
                        <li key={i} className={`braco-peca ${id === a.id ? 'esta' : ''} ${p.tipo === 'relogio' ? 'relogio' : ''}`}>
                          <AcessorioArt a={p} size={30} />
                          <button className="braco-nome" onClick={() => ver(id)} title="Ver esta peça">
                            {p.nome}
                          </button>
                          <button className="braco-mover" disabled={i === fila.length - 1} onClick={() => por(moverNoBraco(meus, mao.id, i, 1))} title="Subir o braço">
                            ▲
                          </button>
                          <button className="braco-mover" disabled={i === 0} onClick={() => por(moverNoBraco(meus, mao.id, i, -1))} title="Descer para o pulso">
                            ▼
                          </button>
                          <button className="braco-mover tirar" onClick={() => por(tirarDoBraco(meus, mao.id, i))} title="Tirar">
                            ✕
                          </button>
                        </li>
                      );
                    })
                ) : (
                  <li className="braco-vazio">nada</li>
                )}
              </ol>
              <div className="braco-ponta">mão</div>
              <button className="equipar-botao" disabled={!!motivo} title={motivo ?? undefined} onClick={() => por(porNoBraco(meus, a.id, mao.id))}>
                {rotulo(mao.id)}
              </button>
            </div>
          );
        })}
      </div>
      <div className="muted small">
        Do pulso para o cotovelo: até {MAX_PULSEIRAS} pulseiras em cada braço e um relógio só. As pulseiras podem ir abaixo do relógio, junto da
        mão, ou acima dele — ▲ e ▼ mudam a ordem.
        {!relogio && tem > 1 ? ` Você tem ${tem} desta: ${usados} em uso.` : ''}
      </div>
    </div>
  );
}

/** A luva: nas duas mãos, ou numa só. A de mãos nuas tira a luva da mão escolhida. */
function OndeALuva({ a, meus, por }: { a: Acessorio; meus: Acessorios; por: (n: Acessorios) => void }) {
  const nua = a.id === LUVA_PADRAO;
  const onde = (['E', 'D'] as const).filter((m) => meus.luvas[m] === a.id);
  const opcoes: { maos: Mao[]; label: string }[] = nua
    ? [
        { maos: ['E', 'D'], label: 'As duas mãos nuas' },
        { maos: ['E'], label: 'Só a esquerda nua' },
        { maos: ['D'], label: 'Só a direita nua' },
      ]
    : [
        { maos: ['E', 'D'], label: 'Nas duas mãos' },
        { maos: ['E'], label: 'Só na esquerda' },
        { maos: ['D'], label: 'Só na direita' },
      ];
  return (
    <div className="equipar">
      <div className="equipar-linha">
        {opcoes.map((o) => {
          const on = o.maos.length === onde.length && o.maos.every((m) => onde.includes(m));
          return (
            <button key={o.label} className={`equipar-botao ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => por(nua ? porLuva(meus, a.id, o.maos) : luvaSoEm(meus, a.id, o.maos))}>
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="muted small">
        Mão esquerda: {nomeDe(meus.luvas.E)} · mão direita: {nomeDe(meus.luvas.D)}
      </div>
    </div>
  );
}

export function AcessoriosStudio({ inicial }: { /** A peça que abre escolhida (a Galeria manda para cá). */ inicial?: string }) {
  const meus = useProfile((s) => s.acessorios);
  const setAcessorios = useProfile((s) => s.setAcessorios);
  const personagem = findCharacter(useProfile((s) => s.character)).id;
  const mesa = useEquipped('table');
  const owned = useOwned();
  const minhas = ACESSORIOS.filter((a) => owns(owned, chave(a.id)));
  const faltam = ACESSORIOS.length - minhas.length;
  const [sel, setSel] = useState<string>(() => (inicial && minhas.some((a) => a.id === inicial) ? inicial : (minhas.find((a) => emUso(meus, a.id)) ?? minhas[0])?.id ?? ''));
  const [perto, setPerto] = useState(true);
  const atual = minhas.find((a) => a.id === sel) ?? minhas[0];
  if (!atual) return null;
  const vestidos = experimentando(meus, atual);
  const provando = !emUso(meus, atual.id);
  const tem = quantasTem(owned, chave(atual.id));
  const usados = vezesEmUso(meus, atual.id);
  const por = (novo: Acessorios) => {
    sfx.click();
    setAcessorios(novo);
  };
  const ver = (id: string) => {
    sfx.hover();
    setSel(id);
  };
  const quantas = (a: Acessorio): string | null => {
    const n = quantasTem(owned, chave(a.id));
    return n === Infinity ? null : `×${n}`;
  };
  const semNada = chaveDosAcessorios(meus) === chaveDosAcessorios(SEM_ACESSORIOS);

  let onde: React.ReactNode;
  if (atual.tipo === 'anel') onde = <OndeOAnel a={atual} meus={meus} tem={tem} por={por} />;
  else if (atual.tipo === 'pulseira' || atual.tipo === 'relogio') onde = <OndeNoBraco a={atual} meus={meus} tem={tem} por={por} ver={ver} />;
  else if (atual.tipo === 'luva') onde = <OndeALuva a={atual} meus={meus} por={por} />;
  else
    onde = (
      <div className="equipar">
        <button className={`equipar-botao largo ${meus.esmalte === atual.id ? 'on' : ''}`} aria-pressed={meus.esmalte === atual.id} disabled={meus.esmalte === atual.id} onClick={() => por(comLegado({ ...meus, esmalte: atual.id }))}>
          {meus.esmalte === atual.id ? '✓ Em uso' : 'Usar este esmalte'}
        </button>
      </div>
    );

  return (
    <div className="studio-body">
      <div className="panel style-list">
        {TIPOS_DE_ACESSORIO.map((t) => {
          const doTipo = minhas.filter((a) => a.tipo === t.id);
          if (!doTipo.length) return null;
          return (
            <Fragment key={t.id}>
              <h4 className="estudio-grupo">{t.nome}</h4>
              {doTipo.map((a) => {
                const n = vezesEmUso(meus, a.id);
                const q = quantas(a);
                return (
                  <button key={a.id} className={`style-item ${a.id === atual.id ? 'on' : ''}`} onClick={() => ver(a.id)}>
                    <span className="thumb">
                      <AcessorioArt a={a} size={46} />
                    </span>
                    <span className="style-name">
                      {a.nome}
                      <span className="badges">
                        {q && (
                          <span className="badge qtd" title="Quantas você tem">
                            {q}
                          </span>
                        )}
                        {n > 0 && <span className="badge eq">{n > 1 ? `${n} em uso` : 'Em uso'}</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </Fragment>
          );
        })}
        {faltam > 0 && (
          <div className="field-hint style-locked">
            {faltam === 1 ? 'Mais 1 acessório sai' : `Mais ${faltam} acessórios saem`} das roletas (<b>Loja → Tickets</b>) ou se compram na <b>Loja → Acessórios</b>. Aqui aparece o
            que é seu.
          </div>
        )}
      </div>
      <div className="panel preview-area">
        <div className="preview-head">
          <h2 className="title-deco theme-title">{atual.nome}</h2>
          <div className="row gap">
            <button className="btn btn-ghost small" disabled={semNada} onClick={() => por(SEM_ACESSORIOS)} title="Tira os anéis, as pulseiras, o relógio e as luvas, e volta à unha natural">
              Tirar tudo
            </button>
          </div>
        </div>
        <div className="preview-stage estudio-maos">
          <Suspense fallback={<AcessorioArt a={atual} size={220} />}>
            <VitrineDeMaos personagem={personagem} acessorios={vestidos} mesa={mesa} foco={perto ? focoDa(vestidos, atual) : null} />
          </Suspense>
          {atual.tipo !== 'luva' && (
            <button className="vitrine-zoom" onClick={() => setPerto(!perto)} title={perto ? 'Ver as duas mãos' : 'Ver a peça de perto'}>
              {perto ? '⤢ As duas mãos' : '⌕ De perto'}
            </button>
          )}
        </div>
        <div className="preset-note">
          {provando ? 'Prova: a vitrine mostra a peça onde ela costuma ir. Ao lado, escolha onde usá-la.' : 'É assim que as suas mãos aparecem na mesa — para todo mundo.'}
        </div>
      </div>
      <div className="panel editor">
        <Section title="Onde usar">{onde}</Section>
        <Section title="Sobre">
          <p className="theme-desc">{atual.sobre}</p>
          <p className="field-hint">
            {tem === Infinity
              ? 'Vem com o jogo.'
              : seConta(chave(atual.id))
                ? `Você tem ${tem} — ${usados ? `${usados} em uso` : 'nenhuma em uso'}. Cada uma que você ganha (na roleta, na loja ou numa aposta) é mais uma peça.`
                : 'É sua.'}
          </p>
        </Section>
      </div>
    </div>
  );
}
