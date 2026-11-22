/**
 * Os modelos 3D dos personagens: o corpo (um só, dividido por todos) e a roupa de cada um.
 *
 * Não há arquivo de modelo: tudo é gerado por código (src/personagem), e isso leva segundos — uns
 * 3,5 s o corpo e de 3 a 6 s cada roupa. Por isso a geração corre em ajudantes (Web Workers,
 * src/mesa3d/trabalho.ts), todos ao mesmo tempo, e começa na **tela de carregamento** da partida
 * (src/game/Opening.tsx), que só diz ao servidor que está pronta quando os personagens da mesa
 * estão modelados. O que já foi feito fica guardado: a segunda partida abre sem esperar, e quem
 * senta no meio da partida (a fila troca bot por gente) é modelado na hora, em segundo plano.
 *
 * Também ficam prontas aqui as animações (src/mesa3d/clipes.ts), que são calculadas na página.
 *
 * Este arquivo não carrega o three.js nem a modelagem (só tipos): a tela de carregamento o importa
 * no pacote principal; o resto vem com o ajudante e com a mesa.
 */
import { create } from 'zustand';
import type { Qualidade } from '../personagem/corpo';
import type { Malha } from '../personagem/malha';
import type { EstiloDeLuva, LuvasDoTraje, Roupa } from '../personagem/roupa';
import { LUVA_PADRAO, findAcessorio, type Mao } from '../../shared/acessorios';

/**
 * A malha da mesa: mais grossa que a da página do personagem (a câmera fica longe), a mesma da
 * página da mesa (src/dev/mesa.ts).
 */
export const QUALIDADE_DO_JOGO: Qualidade = { corpo: 0.0045, mao: 0.0016 };

/** Os trajes que existem (os de `TRAJES` em src/personagem/roupa.ts; o teste confere). */
export const TRAJES_DO_JOGO = ['alistair', 'marina', 'ren', 'tobi', 'violetta', 'yukina', 'abel', 'agnes', 'goro', 'hina', 'zuzu', 'nobu', 'saeko'] as const;
/** Personagem sem traje próprio (um que entrar no jogo antes da roupa dele) veste o do Tobi, o padrão. */
const TRAJE_PADRAO = 'tobi';

/** O traje de um personagem do jogo (o id dele em `CHARACTER_PRESETS`, vestido ou não — veja `vestido`). */
export function trajeDe(personagem: string): string {
  const [id] = partes(personagem);
  return (TRAJES_DO_JOGO as readonly string[]).includes(id) ? id : TRAJE_PADRAO;
}

/**
 * Um personagem "vestido": o id dele e, depois de um `+`, o estilo de luva que o jogador escolheu
 * (shared/acessorios.ts) — quando não é o do traje. Com uma luva diferente em cada mão, as duas vão
 * separadas por vírgula, a da esquerda primeiro (`ren+luva-renda,luva-nenhuma`). É com este nome que
 * se pede e se guarda a roupa: a mesma personagem com outra luva é outra roupa a costurar.
 *
 * `luvas` é a luva das duas mãos (o jeito de antes) ou a de cada uma.
 */
export function vestido(personagem: string, luvas?: string | Partial<Record<Mao, string>>): string {
  const valida = (id: string | undefined) => (id && findAcessorio(id)?.tipo === 'luva' ? id : LUVA_PADRAO);
  const E = valida(typeof luvas === 'object' ? luvas.E : luvas);
  const D = valida(typeof luvas === 'object' ? luvas.D : luvas);
  // (sem dizer a luva — ou dizendo a de quem não escolheu nenhuma —, é o personagem de mãos nuas)
  if (E === D) return E === LUVA_PADRAO ? personagem : `${personagem}+${E}`;
  return `${personagem}+${E},${D}`;
}
const partes = (v: string): [string, string | undefined] => {
  const i = v.indexOf('+');
  return i < 0 ? [v, undefined] : [v.slice(0, i), v.slice(i + 1)];
};
/** As luvas de cada mão, no nome de um personagem vestido (o que vem depois do `+`). */
function luvasDe(parte: string | undefined): Record<Mao, string> {
  const [E = LUVA_PADRAO, D = E] = (parte ?? '').split(',').filter(Boolean);
  return { E, D };
}

export interface Corpo {
  malha: Malha;
  pesos: { indices: Uint16Array; pesos: Float32Array; rosado: Float32Array };
}

/** O andamento, para a tela de carregamento contar. */
interface Andamento {
  corpo: 'nada' | 'fazendo' | 'pronto' | 'falhou';
  roupas: Record<string, 'fazendo' | 'pronta' | 'falhou'>;
  clipes: 'nada' | 'fazendo' | 'prontos' | 'falhou';
}
export const useModelos = create<Andamento>()(() => ({ corpo: 'nada', roupas: {}, clipes: 'nada' }));

let corpo: Promise<Corpo> | null = null;
let corpoFeito: Corpo | null = null;
const roupas = new Map<string, Promise<Roupa>>();
const roupasFeitas = new Map<string, Roupa>();

/** Dá para modelar aqui? (Sem Web Worker — os testes, um navegador antigo — a mesa fica sem personagens.) */
export function podeModelar(): boolean {
  return typeof Worker !== 'undefined' && typeof window !== 'undefined';
}

function novoAjudante(): Worker {
  return new Worker(new URL('./trabalho.ts', import.meta.url), { type: 'module' });
}

/** Pede um trabalho a um ajudante e espera a resposta. */
function pedir<T>(ajudante: Worker, msg: unknown): Promise<T> {
  return new Promise((pronto, falhou) => {
    ajudante.onmessage = (e) => {
      const r = e.data as { tipo?: string; mensagem?: string };
      if (r?.tipo === 'erro') falhou(new Error(r.mensagem));
      else pronto(e.data as T);
    };
    ajudante.onerror = (e) => falhou(new Error(e.message || 'o ajudante da modelagem falhou'));
    ajudante.postMessage(msg);
  });
}

/** O corpo (começa a modelar na primeira vez que é pedido). */
export function prepararCorpo(): Promise<Corpo> {
  if (corpo) return corpo;
  const ajudante = novoAjudante();
  // (a promessa fica guardada antes de avisar o andamento: quem ouve o aviso pode pedir o corpo de novo)
  corpo = pedir<Corpo>(ajudante, { tipo: 'corpo', q: QUALIDADE_DO_JOGO }).then(
    (r) => {
      ajudante.terminate();
      corpoFeito = { malha: r.malha, pesos: r.pesos };
      useModelos.setState({ corpo: 'pronto' });
      return corpoFeito;
    },
    (err) => {
      ajudante.terminate();
      corpo = null;
      useModelos.setState({ corpo: 'falhou' });
      throw err;
    },
  );
  useModelos.setState({ corpo: 'fazendo' });
  return corpo;
}

/** A chave da roupa de um personagem vestido: a do traje de mãos nuas, ou a do traje com a luva escolhida. */
function chaveDaRoupa(v: string): string {
  return vestido(trajeDe(v), luvasDe(partes(v)[1]));
}

/** O estilo de luva de um acessório; sem dizer qual, o de quem não escolheu (as mãos nuas). undefined: a luva do traje, como ele é. */
export function estiloDaLuva(luva: string = LUVA_PADRAO): EstiloDeLuva | undefined {
  const a = findAcessorio(luva) ?? findAcessorio(LUVA_PADRAO);
  if (!a || a.tipo !== 'luva' || a.feitio === 'traje') return undefined;
  return { feitio: a.feitio, cor: a.cor, cor2: a.cor2, cor3: a.cor3 };
}

/** As luvas da roupa de um personagem vestido: a mesma nas duas mãos, ou uma para cada (veja `pecasDoTraje`). */
function luvasDaRoupa(parte: string | undefined): LuvasDoTraje {
  const { E, D } = luvasDe(parte);
  if (E === D) return estiloDaLuva(E);
  return { E: estiloDaLuva(E) ?? 'traje', D: estiloDaLuva(D) ?? 'traje' };
}

/** A roupa de um personagem (vestido ou não — veja `vestido`), costurada e já sabendo que parte do corpo cobre. */
export function prepararRoupa(personagem: string): Promise<Roupa> {
  const id = chaveDaRoupa(personagem);
  const luva = partes(personagem)[1];
  const ja = roupas.get(id);
  if (ja) return ja;
  const marcar = (estado: 'fazendo' | 'pronta' | 'falhou') => useModelos.setState((s) => ({ roupas: { ...s.roupas, [id]: estado } }));
  const doCorpo = prepararCorpo();
  const ajudante = novoAjudante();
  const p = (async () => {
    try {
      const r = await pedir<{ roupa: Omit<Roupa, 'coberto'> }>(ajudante, { tipo: 'roupa', traje: trajeDe(personagem), luva: luvasDaRoupa(luva), q: QUALIDADE_DO_JOGO });
      const c = await doCorpo;
      const { coberto } = await pedir<{ coberto: Float32Array }>(ajudante, { tipo: 'coberto', pos: c.malha.pos.slice(), unha: c.malha.unha.slice() });
      const roupa: Roupa = { ...r.roupa, coberto };
      roupasFeitas.set(id, roupa);
      marcar('pronta');
      return roupa;
    } catch (err) {
      roupas.delete(id);
      marcar('falhou');
      throw err;
    } finally {
      ajudante.terminate();
    }
  })();
  // (guardada antes de avisar: quem ouve o aviso pode pedir a mesma roupa de novo)
  roupas.set(id, p);
  marcar('fazendo');
  return p;
}

/** As animações (calculadas na página, num boneco à parte: levam um instante). */
export function prepararClipes(): Promise<void> {
  return import('./clipes').then((m) => m.prepararClipes());
}

/**
 * Prepara tudo o que a mesa vai precisar para estes personagens: o corpo, a roupa de cada um e as
 * animações. Cumpre-se quando está tudo pronto (ou falhou: a mesa abre assim mesmo, sem o que faltou).
 */
export async function preparar(personagens: string[]): Promise<void> {
  if (!podeModelar()) return;
  // (o pacote da mesa 3D — o three.js, a cena — desce e é lido já agora, na tela de carregamento: sem
  // isto, era lido no instante em que a mesa aparece, e a página parava um terço de segundo)
  void import('./Mesa3D').catch(() => {});
  const ids = [...new Set(personagens.map(chaveDaRoupa))];
  await Promise.allSettled([prepararCorpo(), ...ids.map(prepararRoupa)]);
  await prepararClipes().catch(() => {});
}

/**
 * `preparar`, com um limite: passado o tempo, segue sem o que faltou (a mesa abre, e quem faltar
 * senta quando ficar pronto). Nunca falha.
 */
export function prepararAte(personagens: string[], ms: number): Promise<void> {
  return Promise.race([preparar(personagens).catch(() => {}), new Promise<void>((r) => setTimeout(r, ms))]);
}

/** O que já está pronto, sem esperar (null: ainda não, ou falhou). */
export function modeloPronto(personagem: string): { corpo: Corpo; roupa: Roupa } | null {
  const roupa = roupasFeitas.get(chaveDaRoupa(personagem));
  return corpoFeito && roupa ? { corpo: corpoFeito, roupa } : null;
}

/** Um resumo do andamento, para a tela de carregamento (null quando não há nada sendo feito). */
export function textoDoAndamento(a: Andamento, personagens: string[]): string | null {
  const ids = [...new Set(personagens.map(chaveDaRoupa))];
  if (a.corpo === 'nada' && !ids.some((id) => a.roupas[id])) return null;
  const prontas = ids.filter((id) => a.roupas[id] === 'pronta' || a.roupas[id] === 'falhou').length;
  const tudo = (a.corpo === 'pronto' || a.corpo === 'falhou') && prontas === ids.length && (a.clipes === 'prontos' || a.clipes === 'falhou');
  if (tudo) return 'Personagens prontos';
  if (prontas === ids.length && a.corpo === 'pronto') return 'Ensaiando os gestos…';
  return `Modelando os personagens… ${prontas} de ${ids.length}`;
}
