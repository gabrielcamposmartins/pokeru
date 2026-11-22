import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type Ref, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { DEDOS, findAcessorio, type Acessorios } from '../../shared/acessorios';
import { TEMPO_DA_OFERTA, apostaveis, valorDaAposta } from '../../shared/aposta';
import { rarityLabel, rarityOf } from '../../shared/catalog';
import type { ItemNaMesa, TableView } from '../../shared/protocol';
import { sfx } from '../audio/sfx';
import { AcessorioArt } from '../render/AcessorioArt';
import { useSession } from '../store/session';
import { useTable } from '../store/table';
import { fmt } from '../util/format';
import { STAGE_H } from './layout';

/**
 * Apostar um acessório (shared/aposta.ts): o menu da partida com o que o jogador está usando, a
 * pergunta de quando as fichas acabam, e as peças que estão em cima da mesa.
 *
 * O valor de cada peça é o da mesa (em big blinds, pela raridade), então o menu o calcula daqui
 * mesmo; quem confere se a peça é do jogador e se a aposta cabe é o servidor.
 *
 * O menu é uma **bandeja de cartões** que abre em cima do painel de ação — é ali que se decide a
 * aposta, e a peça é uma quarta resposta ao lado de desistir, pagar e aumentar. Apostar leva dois
 * passos: escolher o cartão (a bandeja diz, grande, o que a aposta faz agora) e confirmar. Era um
 * botão "Apostar" por linha, e um clique errado punha um relógio lendário na mesa.
 */

function Peca({ id, size = 46 }: { id: string; size?: number }) {
  const a = findAcessorio(id);
  return a ? <AcessorioArt a={a} size={size} /> : null;
}

const nomeDe = (id: string): string => findAcessorio(id)?.nome ?? id;
const raridadeDe = (id: string): string => rarityOf(`acessorio:${id}`);
const rotuloDaRaridade = (id: string): string => rarityLabel(rarityOf(`acessorio:${id}`));
/** O valor em big blinds: é a medida da mesa, e a que se compara com o tamanho das apostas. */
const emBlinds = (valor: number, bigBlind: number): number => Math.round(valor / Math.max(1, bigBlind));
const pecas = (n: number): string => `${n} ${n === 1 ? 'peça' : 'peças'}`;

const LADO = { E: 'esquerdo', D: 'direito' } as const;

/** Onde o jogador está usando a peça: em que braço, em que dedo. É de lá que ela sai para a mesa. */
export function ondeEsta(a: Acessorios | undefined, id: string): string {
  if (!a) return '';
  const vezes = (m: 'E' | 'D') => a.bracos[m].filter((x) => x === id).length;
  const [e, d] = [vezes('E'), vezes('D')];
  if (e && d) return e + d === 2 ? 'Nos dois pulsos' : `${e + d} nos dois braços`;
  if (e || d) return (e || d) > 1 ? `${e || d} no braço ${LADO[e ? 'E' : 'D']}` : `Pulso ${LADO[e ? 'E' : 'D']}`;
  const dedos = a.aneis.filter((x) => x.id === id);
  if (!dedos.length) return '';
  if (dedos.length > 2) return `Em ${dedos.length} dedos`;
  return dedos.map((x) => `${DEDOS[x.dedo] ?? 'Dedo'} ${LADO[x.mao]}`).join(' e ');
}

/** O que apostar a peça faz agora, em duas linhas: a de cima é a que se lê de longe. */
export interface EfeitoDaAposta {
  titulo: string;
  detalhe: string;
  /** A aposta não cabe agora (a peça vale mais do que há para pagar, e não dá para aumentar). */
  barrada?: boolean;
}

/**
 * O que apostar a peça faz agora: pagar a aposta que há, ou abrir/aumentar uma. É a mesma conta de
 * `Hand.stake` (shared/engine.ts): o valor entra no lugar de fichas, e as fichas só completam o que
 * a peça não cobre.
 */
export function efeitoDaAposta(view: TableView, valor: number): EfeitoDaAposta | null {
  const eu = view.mySeat !== null ? view.seats[view.mySeat] : null;
  if (!eu) return null;
  const falta = Math.max(0, view.currentBet - eu.bet);
  const ficam = 'Suas fichas ficam na pilha.';
  if (falta <= 0) {
    const titulo = view.currentBet > 0 ? `Aumenta para ${fmt(eu.bet + valor)}` : `Aposta ${fmt(valor)}`;
    return { titulo, detalhe: `Quem quiser continuar paga em fichas. ${ficam}` };
  }
  if (valor === falta) return { titulo: `Paga os ${fmt(falta)}`, detalhe: `A peça cobre a aposta inteira. ${ficam}` };
  if (valor > falta) {
    // (o motor só deixa a peça passar da aposta quando o aumento está aberto: o servidor não diz isso
    //  direto, mas `canRaise` só é falso com fichas de sobra quando não está)
    const haQuemResponda = view.seats.some((s, i) => !!s && i !== view.mySeat && s.inHand && !s.folded && !s.allIn);
    const podeAumentar = !!view.legal?.canRaise || (eu.stack <= falta && haQuemResponda);
    if (!podeAumentar) {
      return { titulo: 'Não dá para apostar esta peça agora', detalhe: `Ela vale ${fmt(valor)}, mais do que os ${fmt(falta)} da aposta, e nesta rodada não dá para aumentar.`, barrada: true };
    }
    return { titulo: `Paga ${fmt(falta)} e aumenta para ${fmt(eu.bet + valor)}`, detalhe: `Quem quiser continuar paga a diferença em fichas. ${ficam}` };
  }
  const resto = Math.min(eu.stack, falta - valor);
  const titulo = `Paga ${fmt(valor)} dos ${fmt(falta)}`;
  if (resto >= eu.stack) return { titulo, detalhe: `Mais ${fmt(resto)} em fichas — todas as que você tem: você fica all-in.` };
  return { titulo, detalhe: `Mais ${fmt(resto)} em fichas, para completar a aposta.` };
}

/**
 * O cartão de uma peça: o desenho, o nome, a raridade (na cor dela), onde está sendo usada e quanto
 * vale nesta mesa, em fichas e em big blinds. É o mesmo na bandeja da partida e na pergunta de
 * quando as fichas acabam.
 */
function Cartao({ id, valor, bigBlind, onde, compacto }: { id: string; valor: number; bigBlind: number; onde: string; compacto?: boolean }) {
  return (
    <>
      <span className="arte">
        <Peca id={id} size={compacto ? 52 : 70} />
      </span>
      <b className="nome">
        <span>{nomeDe(id)}</span>
      </b>
      <span className="raridade">{rotuloDaRaridade(id)}</span>
      <span className="onde">{onde}</span>
      <span className="valor">
        <b>{fmt(valor)}</b>
        <small title="big blinds">{emBlinds(valor, bigBlind)} BB</small>
      </span>
    </>
  );
}

/**
 * Onde a bandeja se prende: o palco, a que altura (a partir de baixo), se o painel da vez está lá, e
 * quanto ela tem de recuar da direita para não entrar embaixo da coluna de botões da tela.
 */
interface Doca {
  palco: HTMLElement | null;
  base: number;
  daVez: boolean;
  recuo: number;
}
const SEM_PALCO: Doca = { palco: null, base: 22, daVez: false, recuo: 0 };
/** O respiro entre o painel de ação e a bandeja (em unidades do palco). */
const FOLGA = 10;
/** A margem direita do painel de ação no palco (`.action-panel`): a bandeja se alinha com ele. */
const MARGEM = 26;

/**
 * A bandeja mora **dentro do palco**, em cima do painel de ação (`.action-panel`, ou as pré-ações
 * de fora da vez): assim ela cresce e encolhe com ele em qualquer janela, e fica ao alcance dos
 * botões de pagar e aumentar. O botão que a abre está na coluna da tela, fora do palco — então ela
 * vai para lá por um portal, e a altura do painel é medida (ele muda de tamanho: com ou sem a caixa
 * do aumento, as pré-ações, nada).
 *
 * A coluna de botões é presa à tela, por cima do palco: numa janela 16:9 ela cobre a beirada direita
 * dele, e o canto da bandeja (com o botão de fechar) ia parar embaixo dela. Mede-se o quanto a
 * coluna entra no palco, e a bandeja recua isso.
 */
function useDoca(botao: RefObject<HTMLElement | null>, ativo: boolean): Doca {
  const [doca, setDoca] = useState<Doca>(SEM_PALCO);
  const medir = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const palco = ativo ? (botao.current?.closest('.game-screen')?.querySelector<HTMLElement>('.stage') ?? null) : null;
    if (!palco) {
      setDoca(SEM_PALCO);
      return;
    }
    let visto: HTMLElement | null = null;
    const olho = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => medir.current?.());
    medir.current = () => {
      const painel = palco.querySelector<HTMLElement>(':scope > .action-panel, :scope > .pre-actions');
      if (painel !== visto) {
        if (visto) olho?.unobserve(visto);
        if (painel) olho?.observe(painel);
        visto = painel;
      }
      const base = painel ? Math.round(palco.offsetHeight - painel.offsetTop + FOLGA) : SEM_PALCO.base;
      const daVez = !!painel?.classList.contains('action-panel');
      const r = palco.getBoundingClientRect();
      const escala = r.width / (palco.offsetWidth || 1) || 1;
      const coluna = botao.current?.getBoundingClientRect();
      const invade = coluna ? (r.right - coluna.left) / escala : 0;
      const recuo = invade > MARGEM ? Math.round(invade + 8 - MARGEM) : 0;
      setDoca((d) => (d.palco === palco && d.base === base && d.daVez === daVez && d.recuo === recuo ? d : { palco, base, daVez, recuo }));
    };
    medir.current();
    // o painel de ação aparece e some sem a mesa mudar (quem acabou de agir): o palco avisa
    const filhos = new MutationObserver(() => medir.current?.());
    filhos.observe(palco, { childList: true });
    const janela = () => medir.current?.();
    window.addEventListener('resize', janela);
    return () => {
      medir.current = null;
      olho?.disconnect();
      filhos.disconnect();
      window.removeEventListener('resize', janela);
    };
  }, [ativo, botao]);

  // a cada estado novo da mesa o painel pode ter trocado de forma (a mesma caixa, outra classe)
  useLayoutEffect(() => medir.current?.());
  return doca;
}

/** O que a mesa diz das peças de quem joga: o que ele está usando, o que pode apostar agora e por quanto. */
function lerMesa(view: TableView | null) {
  const eu = view && view.mySeat !== null ? view.seats[view.mySeat] : null;
  const usando = apostaveis(eu?.cosmetics.acessorios);
  const naMesa = view?.itens ?? [];
  // na minha vez o servidor diz o que posso apostar (ele confere a posse) e por quanto; fora dela, o que estou usando
  const doServidor = new Map((view?.apostaveis ?? []).map((p) => [p.id, p.valor]));
  // (na vez de apostar a lista do servidor é a que vale, mesmo vazia: aí nada se oferece)
  const daVez = !!view && view.toAct === view.mySeat && !!view.legal?.canStake && !!view.apostaveis;
  const pode = (id: string): boolean => (daVez || doServidor.size ? doServidor.has(id) : true);
  const valorDe = (id: string): number => doServidor.get(id) ?? valorDaAposta(id, view?.bigBlind ?? 0);
  return { eu, usando, naMesa, pode, valorDe, quantas: usando.filter(pode).length };
}

/** A vez é minha, e nela dá para apostar uma peça? */
const vezDeApostar = (view: TableView | null): boolean => !!view && view.toAct === view.mySeat && !!view.legal?.canStake;

interface BandejaProps {
  view: TableView;
  /** É a minha vez e dá para apostar (fora disso os cartões ficam apagados). */
  naVez: boolean;
  /** A peça escolhida, esperando a confirmação. */
  escolhida: string | null;
  aoEscolher(id: string): void;
  aoCancelar(): void;
  aoApostar(id: string): void;
  aoFechar(): void;
  id?: string;
  style?: CSSProperties;
  refDaBandeja?: Ref<HTMLDivElement>;
  refDoCorpo?: Ref<HTMLDivElement>;
}

/**
 * A bandeja: os cartões do que estou usando, o que se diz embaixo deles (a espera de fora da vez, a
 * dica, ou o efeito da peça escolhida com a confirmação) e o que já está em cima da mesa.
 *
 * Ela só desenha — quem guarda a escolha e manda a aposta é o `BotaoDeAcessorios`. (Assim os testes
 * a desenham com uma mesa qualquer, sem a partida em volta.)
 */
export function BandejaDeAcessorios({ view, naVez, escolhida, aoEscolher, aoCancelar, aoApostar, aoFechar, id, style, refDaBandeja, refDoCorpo }: BandejaProps) {
  const { eu, usando, naMesa, pode, valorDe } = lerMesa(view);
  if (!eu) return null;
  const oQueFaz = escolhida ? efeitoDaAposta(view, valorDe(escolhida)) : null;
  /** Por que não dá para apostar agora (fora da vez, ou numa vez em que a peça não entra). */
  const espera =
    view.toAct === view.mySeat && view.legal && !view.legal.canStake
      ? 'Agora não dá para apostar uma peça: não há aposta a pagar, e o aumento não está aberto.'
      : eu.allIn
        ? 'Você já está all-in nesta mão.'
        : 'Dá para apostar na sua vez.';
  /** Mais de uma fileira de cartões: eles encolhem, para as duas fileiras e a confirmação caberem sem rolar. */
  const muitas = usando.length > 4;
  return (
    <div ref={refDaBandeja} id={id} className="menu-acessorios panel" role="dialog" aria-label="Apostar um acessório" tabIndex={-1} style={style}>
      <header>
        <b>
          <span aria-hidden="true">💍</span> Apostar um acessório
        </b>
        <button type="button" className="fechar" aria-label="Fechar" title="Fechar (Esc)" onClick={aoFechar}>
          ✕
        </button>
      </header>
      <div className="corpo" ref={refDoCorpo}>
        <p className="sobre">A peça entra na aposta no lugar de fichas: fica na mesa e vai para quem ganhar a mão.</p>
        {usando.length > 0 ? (
          <ul className={`pecas ${naVez ? '' : 'fora-da-vez'} ${escolhida ? 'tem-escolha' : ''} ${muitas ? 'muitas' : ''}`} aria-label="O que você está usando">
            {usando.map((peca) => {
              const trancada = !naVez || !pode(peca);
              return (
                <li key={peca}>
                  {/* (apagado, e não `disabled`: o cartão continua alcançável pelo teclado e lido em voz alta — o valor da peça interessa fora da vez também) */}
                  <button
                    type="button"
                    className={`cartao-peca r-${raridadeDe(peca)}`}
                    aria-pressed={escolhida === peca}
                    aria-disabled={trancada}
                    title={trancada ? espera : `Escolher ${nomeDe(peca)}`}
                    onClick={() => !trancada && aoEscolher(peca)}
                  >
                    <Cartao id={peca} valor={valorDe(peca)} bigBlind={view.bigBlind} onde={ondeEsta(eu.cosmetics.acessorios, peca)} compacto={muitas} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="aviso">Você não está usando mais nada que dê para apostar.</p>
        )}
        <div className="estado" aria-live="polite">
          {usando.length > 0 && !naVez && <p className="aviso">{espera}</p>}
          {naVez && !escolhida && <p className="aviso dica">Escolha uma peça para ver o que ela faz na aposta.</p>}
          {escolhida && oQueFaz && (
            <div className={`confirma r-${raridadeDe(escolhida)} ${oQueFaz.barrada ? 'barrada' : ''}`}>
              <span className="rotulo">Apostar {nomeDe(escolhida)} agora</span>
              <strong className="efeito">{oQueFaz.titulo}</strong>
              <span className="detalhe">{oQueFaz.detalhe}</span>
              {!oQueFaz.barrada && (
                <p className="risco">
                  <span aria-hidden="true">⚠</span> Se perder a mão, a peça fica com quem ganhou.
                </p>
              )}
              <div className="acoes">
                <button type="button" className="btn btn-ghost small cancelar" onClick={aoCancelar}>
                  Cancelar
                </button>
                {!oQueFaz.barrada && (
                  <button type="button" className="btn btn-gold apostar" onClick={() => aoApostar(escolhida)}>
                    <span>Apostar {nomeDe(escolhida)}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        {naMesa.length > 0 && (
          <section className="na-mesa" aria-label="Peças na mesa">
            <h4>Na mesa</h4>
            <ul>
              {naMesa.map((i) => (
                <li key={`${i.seat}:${i.id}`} className={`r-${raridadeDe(i.id)}`}>
                  <span className="arte">
                    <Peca id={i.id} size={30} />
                  </span>
                  <span className="nome">
                    <b>{nomeDe(i.id)}</b>
                    <small>{i.seat === view.mySeat ? 'sua' : `de ${view.seats[i.seat]?.name ?? 'alguém'}`}</small>
                  </span>
                  <span className="valor">{fmt(i.valor)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * O botão da coluna da direita e a bandeja que ele abre, com os acessórios que o jogador está
 * usando: quanto cada um vale nesta mesa e — na vez dele — o que apostá-lo faz, e a confirmação.
 */
export function BotaoDeAcessorios({ className }: { className?: string }) {
  const view = useTable((s) => s.display);
  const send = useSession((s) => s.send);
  const [aberto, setAberto] = useState(false);
  const [escolha, setEscolha] = useState<string | null>(null);
  const [enviado, setEnviado] = useState('');
  const botao = useRef<HTMLButtonElement>(null);
  const bandeja = useRef<HTMLDivElement>(null);
  const corpo = useRef<HTMLDivElement>(null);
  const idDaBandeja = useId();

  const { eu, usando, naMesa, pode, quantas } = lerMesa(view);
  const chaveDaVez = view ? `${view.handNo}:${view.street}:${view.currentBet}:${view.toAct}` : '';
  const minhaVez = vezDeApostar(view) && enviado !== chaveDaVez;
  const visivel = !!view && !!eu && view.status === 'playing' && (usando.length > 0 || naMesa.some((i) => i.seat === view.mySeat));
  const doca = useDoca(botao, visivel);
  // a escolha só vale na vez em que foi feita, e enquanto a peça continua apostável
  const escolhida = minhaVez && escolha && usando.includes(escolha) && pode(escolha) ? escolha : null;

  const fechar = () => {
    setAberto(false);
    setEscolha(null);
  };

  // a vez mudou (ou a aposta): o que a peça faria já é outra coisa, e a escolha cai
  useEffect(() => setEscolha(null), [chaveDaVez]);

  // Esc fecha, e um clique fora também — inclusive nos botões de ação: quem pagou em fichas já decidiu
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node | null;
      if (alvo && (bandeja.current?.contains(alvo) || botao.current?.contains(alvo))) return;
      setAberto(false);
      setEscolha(null);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setAberto(false);
      setEscolha(null);
      botao.current?.focus();
    };
    document.addEventListener('pointerdown', fora, true);
    document.addEventListener('keydown', tecla, true);
    return () => {
      document.removeEventListener('pointerdown', fora, true);
      document.removeEventListener('keydown', tecla, true);
    };
  }, [aberto]);

  // ao abrir, o foco vai para a bandeja (para o primeiro cartão que dá para escolher): o teclado continua de lá
  useEffect(() => {
    if (!aberto) return;
    const alvo = bandeja.current?.querySelector<HTMLElement>('.cartao-peca:not([aria-disabled="true"])') ?? bandeja.current;
    alvo?.focus({ preventScroll: true });
  }, [aberto]);

  // com muitas peças o miolo rola: a confirmação que acabou de aparecer tem de estar à vista
  useEffect(() => {
    const c = corpo.current;
    const caixa = escolhida ? c?.querySelector<HTMLElement>('.confirma') : null;
    if (!c || !caixa) return;
    const fim = caixa.offsetTop + caixa.offsetHeight + 6 - c.clientHeight;
    if (c.scrollTop < fim) c.scrollTop = fim;
  }, [escolhida]);

  // (numa mesa em que acessório não vale como aposta — quem a criou decide —, o menu nem aparece)
  if (!view || !visivel || view.apostaDeItens === false) return null;

  const rotulo = minhaVez ? `Apostar um acessório: é a sua vez (${pecas(quantas)})` : `Seus acessórios (${pecas(quantas)} para apostar)`;

  const conteudo = (
    <div className={`doca-acessorios ${doca.palco ? '' : 'solta'}`} style={doca.palco ? { bottom: doca.base } : undefined}>
      {/* na vez, a chamada fica junto dos botões de ação: é ali que se lembra de que a peça também paga */}
      {!aberto && minhaVez && doca.daVez && quantas > 0 && (
        <button
          type="button"
          className="aba-acessorios"
          aria-haspopup="dialog"
          aria-expanded={false}
          onClick={() => {
            sfx.click();
            setAberto(true);
          }}
        >
          <span aria-hidden="true">💍</span>
          Apostar um acessório
          <span className="conta" aria-label={pecas(quantas)}>
            {quantas}
          </span>
        </button>
      )}
      {aberto && (
        <BandejaDeAcessorios
          view={view}
          naVez={minhaVez}
          escolhida={escolhida}
          aoEscolher={(id) => {
            sfx.click();
            setEscolha(id);
          }}
          aoCancelar={() => setEscolha(null)}
          aoApostar={(id) => {
            sfx.click();
            setEnviado(chaveDaVez);
            fechar();
            send({ type: 'apostarItem', item: id });
          }}
          aoFechar={fechar}
          id={idDaBandeja}
          style={doca.palco ? { maxHeight: STAGE_H - doca.base - 14, marginRight: doca.recuo } : undefined}
          refDaBandeja={bandeja}
          refDoCorpo={corpo}
        />
      )}
    </div>
  );

  return (
    <>
      <button
        ref={botao}
        className={`${className ?? ''} bt-acessorios ${minhaVez ? 'na-vez' : ''}`}
        title={rotulo}
        aria-label={rotulo}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? idDaBandeja : undefined}
        onClick={() => {
          sfx.click();
          if (aberto) fechar();
          else setAberto(true);
        }}
      >
        <span aria-hidden="true">💍</span>
        {quantas > 0 && (
          <span className="conta" aria-hidden="true">
            {quantas}
          </span>
        )}
      </button>
      {doca.palco ? createPortal(conteudo, doca.palco) : conteudo}
    </>
  );
}

interface PerguntaProps {
  itens: { id: string; valor: number }[];
  bigBlind: number;
  /** O que estou usando, para dizer de onde a peça sai. */
  maos: Acessorios | undefined;
  /** Quanto tempo ainda há para responder (ms). */
  faltaMs: number;
  aoResponder(item: string | null): void;
}

/** A pergunta de quando as fichas acabam, só o desenho (quem responde ao servidor é a `OfertaDeAcessorio`). */
export function PerguntaDeAcessorio({ itens, bigBlind, maos, faltaMs, aoResponder }: PerguntaProps) {
  const idDoTitulo = useId();
  const idDoTexto = useId();
  const resta = Math.ceil(Math.max(0, faltaMs) / 1000);
  return (
    <div className="modal-back oferta-fundo">
      <div className="modal panel oferta-acessorio" role="dialog" aria-modal="true" aria-labelledby={idDoTitulo} aria-describedby={idDoTexto}>
        <h3 id={idDoTitulo}>Suas fichas acabaram</h3>
        <p className="muted" id={idDoTexto}>
          Quer apostar um acessório para continuar? Você entra na próxima mão <b>all-in</b> com ele: quem quiser ver paga o valor da peça em fichas.
        </p>
        <ul className="pecas">
          {itens.map(({ id, valor }) => (
            <li key={id}>
              <button type="button" className={`cartao-peca escolha r-${raridadeDe(id)}`} onClick={() => aoResponder(id)}>
                <Cartao id={id} valor={valor} bigBlind={bigBlind} onde={ondeEsta(maos, id)} />
                <span className="chamada">Apostar esta</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="risco">
          <span aria-hidden="true">⚠</span> Se ganhar, a peça volta e as fichas são suas; se perder, ela fica com quem ganhou.
        </p>
        {/* o relógio da pergunta: a barra esvazia junto com os segundos do botão */}
        <div className={`tempo ${resta <= 5 ? 'acabando' : ''}`} aria-hidden="true">
          <i style={{ width: `${Math.max(0, Math.min(100, (faltaMs / TEMPO_DA_OFERTA) * 100))}%` }} />
        </div>
        <div className="row gap center">
          <button type="button" className="btn btn-ghost recusar" onClick={() => aoResponder(null)}>
            Não, obrigado ({resta}s)
          </button>
        </div>
        <small className="muted nota">Sem resposta, você sai da partida.</small>
      </div>
    </div>
  );
}

/**
 * A pergunta de quando as fichas acabam: apostar um acessório para continuar? Quem aposta entra na
 * próxima mão all-in com a peça; quem não quer (ou deixa o tempo passar) é eliminado, como sempre.
 *
 * Aqui a resposta é um clique só no cartão: a pergunta inteira já é a confirmação, e o relógio corre.
 */
export function OfertaDeAcessorio() {
  const oferta = useTable((s) => s.display?.oferta ?? null);
  const bigBlind = useTable((s) => s.display?.bigBlind ?? 0);
  const maos = useTable((s) => {
    const v = s.display;
    return v && v.mySeat !== null ? v.seats[v.mySeat]?.cosmetics.acessorios : undefined;
  });
  const ate = useTable((s) => s.ofertaAte);
  const send = useSession((s) => s.send);
  const [agora, setAgora] = useState(() => Date.now());
  const [respondido, setRespondido] = useState(false);

  useEffect(() => {
    if (!oferta) {
      setRespondido(false);
      return;
    }
    const t = setInterval(() => setAgora(Date.now()), 250);
    return () => clearInterval(t);
  }, [oferta]);

  if (!oferta || respondido || !oferta.itens.length) return null;
  return (
    <PerguntaDeAcessorio
      itens={oferta.itens}
      bigBlind={bigBlind}
      maos={maos}
      faltaMs={Math.max(0, (ate ?? agora) - agora)}
      aoResponder={(item) => {
        sfx.click();
        setRespondido(true);
        send({ type: 'entrarComItem', item });
      }}
    />
  );
}

/** As peças que estão em cima da mesa, junto do pote: o desenho de cada uma, de quem é e quanto vale. */
export function ItensNaMesa({ itens, nomes }: { itens: ItemNaMesa[]; nomes: (seat: number) => string }) {
  if (!itens.length) return null;
  return (
    <div className="itens-na-mesa" role="list" aria-label="Acessórios apostados">
      {itens.map((i) => {
        const texto = `${nomeDe(i.id)} de ${nomes(i.seat)} — vale ${fmt(i.valor)}`;
        return (
          <span key={`${i.seat}:${i.id}`} role="listitem" className={`item r-${raridadeDe(i.id)}`} title={texto} aria-label={texto}>
            <Peca id={i.id} size={40} />
            <small>{fmt(i.valor)}</small>
          </span>
        );
      })}
    </div>
  );
}
