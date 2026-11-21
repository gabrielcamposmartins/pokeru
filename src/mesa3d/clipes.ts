/**
 * As animações de mãos (src/personagem/animacoes.ts) prontas para a mesa: calculadas uma vez, num
 * boneco à parte que não aparece, e passadas a cada personagem (o clipe é dado no espaço do
 * personagem, então serve para qualquer um, em qualquer lugar da mesa — como em src/dev/mesa.ts).
 *
 * Calcular os clipes leva um instante (as chaves de algumas animações são achadas por procura);
 * é feito na tela de carregamento, junto com os modelos.
 */
import { Boneco } from '../personagem/boneco';
import { montarEsqueleto, type Esqueleto } from '../personagem/esqueleto';
import { criarClipes, maoComOBaralho, pegarBaralho, pousarBaralho, type BaralhoNaMesa, type Clipe, type EstadoDaMao, type Objeto, ganhar, idleAbertas, retanguloDasCartas, virarAPilha, type Retangulo } from '../personagem/animacoes';
import { GIRO_DO_BARALHO, MARCAS } from './geometria';
import { useModelos } from './modelos';

let esqueleto: Esqueleto | null = null;
let boneco: Boneco | null = null;
let segurando: { mao: EstadoDaMao; baralho: (b: Boneco) => Objeto } | null = null;

/** Onde o baralho fica parado na mesa do jogo, nas coordenadas de quem dá as cartas. */
const BARALHO_DO_JOGO: BaralhoNaMesa = { em: [MARCAS.baralho[0], MARCAS.baralho[1]], giro: GIRO_DO_BARALHO };

/** Os gestos em que o baralho é do próprio clipe (pegá-lo, repartir, abrir as cartas da mesa, pousá-lo). */
export const ehDoBaralho = (id: string | null | undefined): boolean => !!id && /^(entregar|abrir|pegar|pousar)/.test(id);
let clipes: Clipe[] | null = null;
let fazendo: Promise<void> | null = null;

/** O esqueleto (o mesmo para todos os personagens). */
export function esqueletoDoJogo(): Esqueleto {
  return (esqueleto ??= montarEsqueleto());
}

/**
 * O boneco que não aparece, em que os clipes são montados (montar um clipe posa o boneco). É um só:
 * o que a entrega de cartas acha por procura fica guardado nele, e os gestos montados durante a
 * partida (o dealer repartindo para os lugares desta mesa) saem em poucos milissegundos.
 */
export function bonecoDeConta(): Boneco {
  return (boneco ??= new Boneco(esqueletoDoJogo()));
}

export function prepararClipes(): Promise<void> {
  if (clipes) return Promise.resolve();
  if (fazendo) return fazendo;
  useModelos.setState({ clipes: 'fazendo' });
  // (um respiro antes: a tela de carregamento desenha o andamento antes da conta, que trava a página um instante)
  fazendo = new Promise<void>((r) => setTimeout(r, 30)).then(() => {
    try {
      clipes = criarClipes(bonecoDeConta());
      // No jogo as cartas abertas são 2D, por cima de tudo o que é 3D: quem as vira acaba com as mãos
      // fora delas (o descanso `idle-abertas`), e quem ganha com elas na frente parte dali e volta para lá.
      const abertas = retanguloDasCartas();
      clipes[clipes.findIndex((c) => c.id === 'virar-pilha')] = virarAPilha(bonecoDeConta(), undefined, 'virar-pilha', 'Virar as duas cartas', abertas);
      clipes.push(ganhar(bonecoDeConta(), abertas, 'ganhar-abertas'));
      // pegar o baralho de onde ele fica na mesa do jogo, e pousá-lo de volta; e a mão que o segura entre uma coisa e outra
      try {
        clipes.push(pegarBaralho(bonecoDeConta(), BARALHO_DO_JOGO), pousarBaralho(bonecoDeConta(), BARALHO_DO_JOGO));
        // (esperando com o baralho, a mão descansa na mesa: no ar, a sombra a mostrava suspensa)
        segurando = maoComOBaralho(bonecoDeConta(), BARALHO_DO_JOGO, true);
      } catch (err) {
        console.warn('[mesa 3D] sem o gesto de pegar o baralho', err);
      }
      useModelos.setState({ clipes: 'prontos' });
    } catch (err) {
      useModelos.setState({ clipes: 'falhou' });
      fazendo = null;
      throw err;
    }
  });
  return fazendo;
}

/** Os clipes, se já estão prontos. */
export function clipesProntos(): Clipe[] | null {
  return clipes;
}

/** Um clipe pelo id (undefined se não existe — as animações novas entram aos poucos). */
export function clipe(id: string): Clipe | undefined {
  return clipes?.find((c) => c.id === id);
}

/** A mão esquerda com o baralho (veja `maoComOBaralho`), se o gesto de pegá-lo ficou pronto. */
export function maoQueSegura(): { mao: EstadoDaMao; baralho: (b: Boneco) => Objeto } | null {
  return segurando;
}

const descansosComAbertas = new Map<string, Clipe>();

/**
 * O descanso de quem tem cartas abertas na frente, ocupando o retângulo dado (visto do lugar): as
 * mãos fora dele. Para as duas cartas do hold'em é o `idle-abertas` de sempre; para outra arrumação
 * (as cinco do draw), é montado na primeira vez e fica guardado.
 */
export function descansoComAbertas(fora?: Retangulo): Clipe | undefined {
  if (!fora) return clipe('idle-abertas');
  const chave = [fora.x0, fora.x1, fora.z0, fora.z1].map((v) => v.toFixed(2)).join();
  let c = descansosComAbertas.get(chave);
  if (!c && clipes) {
    c = idleAbertas(bonecoDeConta(), fora, 'idle-abertas:' + chave);
    descansosComAbertas.set(chave, c);
  }
  return c;
}
