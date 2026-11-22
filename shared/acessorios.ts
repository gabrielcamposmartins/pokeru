/**
 * Acessórios — o que o personagem usa nas mãos: anéis, pulseiras, relógios, a cor do esmalte e o
 * estilo da luva.
 *
 * São do **jogador**, não do personagem: quem equipa um anel o leva para qualquer personagem que
 * escolher. Na mesa 3D são as mãos que aparecem o tempo todo, então é ali que eles vivem (o
 * desenho de cada um está em src/mesa3d/acessorios3d.ts; a luva é costurada com a roupa, em
 * src/personagem/roupa.ts; o esmalte é uma cor no material da pele).
 *
 * Este arquivo é comum ao servidor e ao cliente, como o catálogo: o servidor confere com ele o que
 * chega pela rede (`sanitizeAcessorios`) e corta o que a conta não tem (`clampCosmetics`, em
 * shared/catalog.ts).
 */

export type TipoDeAcessorio = 'anel' | 'pulseira' | 'relogio' | 'esmalte' | 'luva';

/** A ordem em que a Galeria mostra os tipos, e o nome de cada um. */
export const TIPOS_DE_ACESSORIO: { id: TipoDeAcessorio; nome: string }[] = [
  { id: 'anel', nome: 'Anéis' },
  { id: 'pulseira', nome: 'Pulseiras' },
  { id: 'relogio', nome: 'Relógios' },
  { id: 'esmalte', nome: 'Esmaltes' },
  { id: 'luva', nome: 'Luvas' },
];

/**
 * O formato da pedra (ou o feitio) de um anel. Além das pedras sozinhas, há a `trinca` (três pedras
 * em fila), a `gota` (a lapidação em pera), a `serpente` (o aro é uma cobra enrolada no dedo, com
 * dois olhos de pedra) e a `incrustada` (um aro largo de outro material, com frisos de metal).
 */
export type Pedra = 'nenhuma' | 'redonda' | 'esmeralda' | 'oval' | 'marquise' | 'coracao' | 'perola' | 'sinete' | 'quadrada' | 'trinca' | 'gota' | 'serpente' | 'incrustada';

interface Base {
  id: string;
  nome: string;
  /** Uma linha sobre a peça, para o palco da Galeria. */
  sobre: string;
}

export interface Anel extends Base {
  tipo: 'anel';
  metal: string;
  pedra: Pedra;
  /** A cor da pedra. */
  cor: string;
}

export interface Pulseira extends Base {
  tipo: 'pulseira';
  /**
   * `contas`: um fio de contas; `corrente`: elos; `couro`: uma tira larga com tachas; `argolas`: três
   * aros rígidos e finos, soltos; `trancada`: um cordão de dois fios torcidos, com um nó; `riviera`:
   * uma fila de pedras quadradas engastadas; `espinhos`: a tira de couro com cones de metal; `terco`:
   * um terço enrolado três vezes no pulso — as dezenas de contas, as contas maiores entre elas, a
   * medalha e o crucifixo, deitado sobre as voltas.
   */
  feitio: 'argola' | 'contas' | 'corrente' | 'couro' | 'argolas' | 'trancada' | 'riviera' | 'espinhos' | 'terco';
  cor: string;
  /** A segunda cor: o fecho, as tachas, a conta do meio, o outro fio, as pedras, o metal do terço. */
  cor2: string;
}

export interface Relogio extends Base {
  tipo: 'relogio';
  /**
   * `oval`: a caixa pequena de um relógio-joia; `digital`: a caixa retangular de um relógio de visor;
   * `oitavada`: a caixa de oito lados de um relógio moderno, com o aro preso por parafusos.
   */
  caixa: 'redonda' | 'quadrada' | 'oval' | 'digital' | 'oitavada';
  metal: string;
  /** O segundo metal de um relógio bicolor: o aro, os botões e os elos do meio da pulseira. */
  metal2?: string;
  /** A caixa jateada, sem polimento: o aço fosco de um relógio de campo. */
  fosca?: boolean;
  mostrador: string;
  ponteiros: string;
  /**
   * `borracha`: larga e fosca; `corrente`: fina, de elos; `lona`: uma tira de tecido grosso, com a
   * listra do meio e os passadores de metal; `bicolor`: a pulseira de elos em dois metais — os de fora
   * na cor da correia, os do meio em `metal2`.
   */
  correia: 'couro' | 'metal' | 'borracha' | 'corrente' | 'lona' | 'bicolor';
  corDaCorreia: string;
  /**
   * O que o mostrador tem além dos ponteiros: a lua e as estrelas, os algarismos de um visor, o
   * `prisma` (um mostrador iridescente, em que as cores correm conforme o ângulo) ou os três
   * mostradores pequenos e os botões de um `cronografo`.
   */
  visor?: 'lua' | 'digital' | 'prisma' | 'cronografo';
  /** O aro giratório de um relógio de mergulho: as duas cores dele. */
  aro?: [string, string];
}

export interface Esmalte extends Base {
  tipo: 'esmalte';
  /** A cor do esmalte; null = a unha natural. */
  cor: string | null;
  /** Metálico: brilha mais. */
  metalico?: boolean;
  /**
   * O acabamento: `francesinha` (a unha natural com a ponta na cor), `degrade` (da cor, na raiz, à
   * segunda cor, na ponta), `glitter` (a cor com pontos de brilho na segunda cor) ou `cromado` (um
   * espelho: escuro de frente, claro de lado).
   */
  efeito?: 'francesinha' | 'degrade' | 'glitter' | 'cromado';
  cor2?: string;
}

export interface Luva extends Base {
  tipo: 'luva';
  /**
   * `traje`: a que o traje do personagem tem (ou não tem); `nenhuma`: as mãos nuas; `inteira`: a
   * luva de passeio, com nervuras; `sem-dedos`: a de meio dedo, com a abertura nas costas da mão e
   * a tira do pulso; `tatica`: de meio dedo, com a placa dura em cima dos nós; `renda`: inteira, de
   * renda vazada; `opera`: inteira e comprida, até o meio do antebraço; `manopla`: de placas de metal.
   */
  feitio: 'traje' | 'nenhuma' | 'inteira' | 'sem-dedos' | 'tatica' | 'renda' | 'opera' | 'manopla';
  cor: string;
  /** A cor das costuras, das bainhas, das almofadas dos nós, das placas. */
  cor2: string;
  /** A cor do metal: o botão de pressão da tira, os frisos das placas. */
  cor3?: string;
}

/** O que uma luva cobre: os dedos inteiros, só até o meio do primeiro osso, ou nada. (É por cima disso que os anéis e a pulseira vão.) */
export function coberturaDaLuva(feitio: Luva['feitio']): 'nenhuma' | 'inteira' | 'sem-dedos' {
  if (feitio === 'nenhuma' || feitio === 'traje') return 'nenhuma';
  return feitio === 'sem-dedos' || feitio === 'tatica' ? 'sem-dedos' : 'inteira';
}

export type Acessorio = Anel | Pulseira | Relogio | Esmalte | Luva;

const OURO = '#e0ad3e';
const PRATA = '#cfd3dc';
const ROSE = '#e6a48f';
const BRONZE = '#b5763c';

export const ACESSORIOS: Acessorio[] = [
  // ───────────── anéis ─────────────
  { tipo: 'anel', id: 'anel-alianca', nome: 'Aliança lisa', sobre: 'Um aro de ouro, sem pedra: o anel de todo dia.', metal: OURO, pedra: 'nenhuma', cor: OURO },
  { tipo: 'anel', id: 'anel-perola', nome: 'Pérola', sobre: 'Uma pérola redonda sobre um aro fino de prata.', metal: PRATA, pedra: 'perola', cor: '#f6efe6' },
  { tipo: 'anel', id: 'anel-sinete', nome: 'Sinete', sobre: 'O anel de selo: uma chapa oval de ouro, lisa, para bater na mesa.', metal: OURO, pedra: 'sinete', cor: '#c9962f' },
  { tipo: 'anel', id: 'anel-safira', nome: 'Safira marquise', sobre: 'Uma safira em navete — comprida, de duas pontas — num aro de prata.', metal: PRATA, pedra: 'marquise', cor: '#2f6fe0' },
  { tipo: 'anel', id: 'anel-rubi', nome: 'Rubi oval', sobre: 'Um rubi oval, polido em cabochão, engastado em ouro.', metal: OURO, pedra: 'oval', cor: '#d21f3c' },
  { tipo: 'anel', id: 'anel-solitario', nome: 'Solitário', sobre: 'Um diamante redondo, lapidado, sozinho no alto do aro.', metal: PRATA, pedra: 'redonda', cor: '#eaf6ff' },
  { tipo: 'anel', id: 'anel-esmeralda', nome: 'Esmeralda', sobre: 'Uma esmeralda no corte que leva o nome dela: retangular, de cantos cortados.', metal: OURO, pedra: 'esmeralda', cor: '#1fa56a' },
  { tipo: 'anel', id: 'anel-coracao', nome: 'Coração de quartzo', sobre: 'Um quartzo rosa lapidado em coração, num aro de ouro rosé.', metal: ROSE, pedra: 'coracao', cor: '#ff7fb0' },
  { tipo: 'anel', id: 'anel-onix', nome: 'Ônix quadrado', sobre: 'Uma placa quadrada de ônix negro, presa por quatro garras de prata.', metal: PRATA, pedra: 'quadrada', cor: '#17151c' },
  { tipo: 'anel', id: 'anel-gota', nome: 'Gota de ametista', sobre: 'Uma ametista lapidada em gota — redonda de um lado, em ponta do outro — num aro de ouro rosé.', metal: ROSE, pedra: 'gota', cor: '#a35cf0' },
  { tipo: 'anel', id: 'anel-ebano', nome: 'Aro de ébano', sobre: 'Um aro largo de madeira escura, com um friso de ouro em cada beirada.', metal: OURO, pedra: 'incrustada', cor: '#2b1d16' },
  { tipo: 'anel', id: 'anel-trinca', nome: 'Trinca de brilhantes', sobre: 'Três brilhantes em fila sobre o aro: o do meio maior, um menor de cada lado.', metal: OURO, pedra: 'trinca', cor: '#eaf6ff' },
  { tipo: 'anel', id: 'anel-serpente', nome: 'Serpente', sobre: 'Uma cobra de prata escurecida, enrolada duas vezes no dedo, com olhos de rubi.', metal: '#7d8794', pedra: 'serpente', cor: '#e0203a' },
  // ───────────── pulseiras ─────────────
  { tipo: 'pulseira', id: 'pulseira-contas', nome: 'Contas de jade', sobre: 'Um fio de contas de jade, com uma conta dourada no fecho.', feitio: 'contas', cor: '#3fae7c', cor2: OURO },
  { tipo: 'pulseira', id: 'pulseira-couro', nome: 'Bracelete de couro', sobre: 'Uma tira larga de couro escuro, com tachas de metal.', feitio: 'couro', cor: '#3a2a22', cor2: PRATA },
  { tipo: 'pulseira', id: 'pulseira-perolas', nome: 'Fio de pérolas', sobre: 'Pérolas pequenas, uma ao lado da outra, em volta do pulso.', feitio: 'contas', cor: '#f6efe6', cor2: PRATA },
  { tipo: 'pulseira', id: 'pulseira-corrente', nome: 'Corrente de ouro', sobre: 'Uma corrente de elos grossos de ouro.', feitio: 'corrente', cor: OURO, cor2: '#c9962f' },
  { tipo: 'pulseira', id: 'pulseira-argolas', nome: 'Três argolas', sobre: 'Três aros finos e rígidos de ouro, soltos no pulso: batem um no outro a cada gesto.', feitio: 'argolas', cor: OURO, cor2: ROSE },
  { tipo: 'pulseira', id: 'pulseira-cordao', nome: 'Cordão trançado', sobre: 'Dois fios de algodão torcidos, um vermelho e um preto, fechados num nó.', feitio: 'trancada', cor: '#c4202f', cor2: '#1d1b22' },
  { tipo: 'pulseira', id: 'pulseira-riviera', nome: 'Riviera', sobre: 'Uma fila de brilhantes quadrados, um ao lado do outro, engastados em prata.', feitio: 'riviera', cor: PRATA, cor2: '#eaf6ff' },
  { tipo: 'pulseira', id: 'pulseira-espinhos', nome: 'Bracelete de espinhos', sobre: 'Couro preto com uma fila de cones de aço: o bracelete de quem não quer conversa.', feitio: 'espinhos', cor: '#19181d', cor2: PRATA },
  { tipo: 'pulseira', id: 'pulseira-terco', nome: 'Terço de prata', sobre: 'Um terço de contas de prata escurecida, enrolado três vezes no pulso, com a medalha e o crucifixo deitado sobre as voltas.', feitio: 'terco', cor: '#8e929b', cor2: PRATA },
  { tipo: 'pulseira', id: 'pulseira-terco-madreperola', nome: 'Terço de madrepérola', sobre: 'Um terço de contas de madrepérola em corrente de ouro, enrolado três vezes no pulso, com a medalha e o crucifixo dourados.', feitio: 'terco', cor: '#f3ece2', cor2: OURO },
  // ───────────── relógios ─────────────
  { tipo: 'relogio', id: 'relogio-classico', nome: 'Relógio clássico', sobre: 'Caixa redonda de ouro, mostrador branco e correia de couro marrom.', caixa: 'redonda', metal: OURO, mostrador: '#fbf7ee', ponteiros: '#2a2140', correia: 'couro', corDaCorreia: '#6b4226' },
  { tipo: 'relogio', id: 'relogio-esportivo', nome: 'Relógio esportivo', sobre: 'Caixa redonda de aço, mostrador azul e pulseira de elos de metal.', caixa: 'redonda', metal: PRATA, mostrador: '#1d3f8f', ponteiros: '#f4f4f8', correia: 'metal', corDaCorreia: PRATA },
  { tipo: 'relogio', id: 'relogio-rose', nome: 'Relógio rosé', sobre: 'Caixa quadrada de ouro rosé, mostrador de madrepérola e correia clara.', caixa: 'quadrada', metal: ROSE, mostrador: '#fff1f4', ponteiros: '#a8566a', correia: 'couro', corDaCorreia: '#f1d9d2' },
  { tipo: 'relogio', id: 'relogio-noturno', nome: 'Relógio noturno', sobre: 'Caixa quadrada negra, mostrador preto de ponteiros vermelhos e correia preta.', caixa: 'quadrada', metal: '#2a2832', mostrador: '#111016', ponteiros: '#ff3b4a', correia: 'couro', corDaCorreia: '#19181d' },
  { tipo: 'relogio', id: 'relogio-joia', nome: 'Relógio-joia', sobre: 'Uma caixa oval pequena de ouro, de mostrador perolado, presa por uma corrente fina.', caixa: 'oval', metal: OURO, mostrador: '#fbf3e4', ponteiros: '#7a5a1e', correia: 'corrente', corDaCorreia: OURO },
  { tipo: 'relogio', id: 'relogio-digital', nome: 'Relógio digital', sobre: 'Caixa retangular de resina preta, visor de cristal líquido e pulseira de borracha.', caixa: 'digital', metal: '#22212a', mostrador: '#b9c7a6', ponteiros: '#1c2418', correia: 'borracha', corDaCorreia: '#19181d', visor: 'digital' },
  { tipo: 'relogio', id: 'relogio-lua', nome: 'Fases da lua', sobre: 'Caixa redonda de prata, mostrador azul-noite com a lua e as estrelas, correia azul.', caixa: 'redonda', metal: PRATA, mostrador: '#14204a', ponteiros: '#f3e9c6', correia: 'couro', corDaCorreia: '#1d2a5c', visor: 'lua' },
  { tipo: 'relogio', id: 'relogio-mergulho', nome: 'Relógio de mergulho', sobre: 'Caixa de aço com o aro giratório em azul e vermelho, mostrador preto e pulseira de elos.', caixa: 'redonda', metal: PRATA, mostrador: '#101014', ponteiros: '#f4f4f8', correia: 'metal', corDaCorreia: PRATA, aro: ['#1f4fb0', '#c4202f'] },
  { tipo: 'relogio', id: 'relogio-campo', nome: 'Relógio de campo', sobre: 'Caixa redonda de aço fosco, mostrador creme com todos os algarismos e correia de lona cor de areia: o relógio simples, de todo dia.', caixa: 'redonda', metal: '#a2a7b0', fosca: true, mostrador: '#efe7d2', ponteiros: '#2b2a26', correia: 'lona', corDaCorreia: '#b8a77e' },
  { tipo: 'relogio', id: 'relogio-prisma', nome: 'Relógio prismático', sobre: 'Caixa de oito lados em aço claro e pulseira branca, sem um algarismo: o mostrador é um prisma, e as cores correm por ele conforme o pulso vira.', caixa: 'oitavada', metal: '#dfe4ec', mostrador: '#f4f2ff', ponteiros: '#23212e', correia: 'borracha', corDaCorreia: '#f1f2f6', visor: 'prisma' },
  { tipo: 'relogio', id: 'relogio-bronze', nome: 'Cronógrafo de bronze e prata', sobre: 'Um cronógrafo bicolor: caixa de bronze, aro de prata com a escala gravada, três mostradores pequenos e a pulseira de elos alternando prata e bronze.', caixa: 'redonda', metal: BRONZE, metal2: PRATA, mostrador: '#e9ebf0', ponteiros: '#4a2c17', correia: 'bicolor', corDaCorreia: BRONZE, visor: 'cronografo' },
  // ───────────── esmaltes ─────────────
  { tipo: 'esmalte', id: 'esmalte-natural', nome: 'Natural', sobre: 'A unha como ela é: clara, com um lustro discreto.', cor: null },
  { tipo: 'esmalte', id: 'esmalte-rosa', nome: 'Rosa sakura', sobre: 'Rosa claro, da cor da flor.', cor: '#ff9ec2' },
  { tipo: 'esmalte', id: 'esmalte-vermelho', nome: 'Vermelho', sobre: 'O vermelho vivo de sempre.', cor: '#d8182f' },
  { tipo: 'esmalte', id: 'esmalte-branco', nome: 'Branco', sobre: 'Branco leitoso, opaco.', cor: '#fbfaf6' },
  { tipo: 'esmalte', id: 'esmalte-preto', nome: 'Preto', sobre: 'Preto fechado, brilhante.', cor: '#17151c' },
  { tipo: 'esmalte', id: 'esmalte-lilas', nome: 'Lilás', sobre: 'Lilás suave.', cor: '#b99cff' },
  { tipo: 'esmalte', id: 'esmalte-vinho', nome: 'Vinho', sobre: 'Bordô escuro, quase preto na sombra.', cor: '#6e1028' },
  { tipo: 'esmalte', id: 'esmalte-azul', nome: 'Azul-celeste', sobre: 'Azul claro, de céu aberto.', cor: '#5fb6ff' },
  { tipo: 'esmalte', id: 'esmalte-dourado', nome: 'Dourado', sobre: 'Ouro metálico: pega a luz como o metal.', cor: '#e0ad3e', metalico: true },
  { tipo: 'esmalte', id: 'esmalte-francesinha', nome: 'Francesinha', sobre: 'A unha natural, com a ponta pintada de branco.', cor: '#fdfbf7', efeito: 'francesinha' },
  { tipo: 'esmalte', id: 'esmalte-cromado', nome: 'Cromado', sobre: 'Espelhado como metal polido: escuro de frente, claro de lado.', cor: '#c9d0dc', cor2: '#3c4252', efeito: 'cromado', metalico: true },
  { tipo: 'esmalte', id: 'esmalte-degrade', nome: 'Degradê do pôr do sol', sobre: 'Do rosa, na raiz da unha, ao laranja, na ponta.', cor: '#ff6fa8', cor2: '#ffb347', efeito: 'degrade' },
  { tipo: 'esmalte', id: 'esmalte-galaxia', nome: 'Galáxia', sobre: 'Azul quase preto, salpicado de pontos de brilho que acendem conforme a mão vira.', cor: '#161a3d', cor2: '#cfe4ff', efeito: 'glitter', metalico: true },
  // ───────────── luvas ─────────────
  { tipo: 'luva', id: 'luva-nenhuma', nome: 'Sem luvas', sobre: 'As mãos nuas, seja qual for o traje: é como todo mundo começa, e como os anéis e o esmalte aparecem melhor.', feitio: 'nenhuma', cor: '#18171d', cor2: '#34323d' },
  { tipo: 'luva', id: 'luva-traje', nome: 'A do traje', sobre: 'A luva que o traje do personagem tem (os que têm): a de passeio do Ren, a de meio dedo da Marina e do Tobi.', feitio: 'traje', cor: '#18171d', cor2: '#34323d' },
  { tipo: 'luva', id: 'luva-branca', nome: 'Luvas brancas', sobre: 'Luvas inteiras de tecido branco, com as três nervuras nas costas da mão.', feitio: 'inteira', cor: '#f1eee8', cor2: '#d6d1c8' },
  { tipo: 'luva', id: 'luva-couro', nome: 'Luvas de couro', sobre: 'Luvas inteiras de couro preto, de passeio, com nervuras em relevo.', feitio: 'inteira', cor: '#1a181e', cor2: '#3a3843' },
  { tipo: 'luva', id: 'luva-meio-dedo-branca', nome: 'Meio dedo brancas', sobre: 'Luvas sem dedos, brancas: abertas nas costas da mão, com a tira do pulso presa por um botão de pressão dourado.', feitio: 'sem-dedos', cor: '#f1eee8', cor2: '#cfc9bf', cor3: OURO },
  { tipo: 'luva', id: 'luva-meio-dedo-vermelha', nome: 'Meio dedo vermelhas', sobre: 'Luvas sem dedos de couro vermelho, abertas nas costas da mão, com os reforços dos nós e a tira do pulso em preto.', feitio: 'sem-dedos', cor: '#b81d2b', cor2: '#1c1a20', cor3: PRATA },
  { tipo: 'luva', id: 'luva-renda', nome: 'Luvas de renda', sobre: 'Luvas inteiras de renda preta: o desenho da renda deixa ver a pele por baixo.', feitio: 'renda', cor: '#17151c', cor2: '#3a3446' },
  { tipo: 'luva', id: 'luva-tatica', nome: 'Luvas táticas', sobre: 'De meio dedo, em tecido verde-oliva, com uma placa dura moldada em cima dos nós e a tira do pulso.', feitio: 'tatica', cor: '#3d4632', cor2: '#1b1c1f', cor3: '#8a8f99' },
  { tipo: 'luva', id: 'luva-opera', nome: 'Luvas de ópera', sobre: 'Luvas inteiras e compridas de cetim cor de vinho, que sobem até o meio do antebraço.', feitio: 'opera', cor: '#7a1230', cor2: '#a82848' },
  { tipo: 'luva', id: 'luva-manopla', nome: 'Manoplas', sobre: 'Luvas de armadura: placas de aço em cada dedo e nas costas da mão, com frisos de ouro e o punho aberto em sino.', feitio: 'manopla', cor: '#aab1c0', cor2: '#7d8494', cor3: OURO },
];

const porId = new Map(ACESSORIOS.map((a) => [a.id, a]));

export function findAcessorio(id: string): Acessorio | undefined {
  return porId.get(id);
}

export const acessoriosDoTipo = (tipo: TipoDeAcessorio): Acessorio[] => ACESSORIOS.filter((a) => a.tipo === tipo);

/// ───────────────────────────── o que está equipado ─────────────────────────────

export type Mao = 'E' | 'D';
export const MAOS: { id: Mao; nome: string }[] = [
  { id: 'E', nome: 'Mão esquerda' },
  { id: 'D', nome: 'Mão direita' },
];
/** Os dedos, na ordem do esqueleto: 0 = indicador … 3 = mínimo, 4 = polegar. */
export const DEDOS = ['Indicador', 'Médio', 'Anelar', 'Mínimo', 'Polegar'] as const;
/** A ordem em que os dedos aparecem numa mão, do polegar ao mínimo. */
export const ORDEM_DOS_DEDOS = [4, 0, 1, 2, 3] as const;

/** Um anel num dedo. */
export interface AnelPosto {
  id: string;
  mao: Mao;
  dedo: number;
}

export interface Acessorios {
  /**
   * Os anéis: no máximo um por dedo, e `MAX_ANEIS` ao todo. O mesmo anel pode estar em mais de um
   * dedo — quando a conta tem mais de um dele (quem confere a quantidade é `clampAcessorios`, em
   * shared/catalog.ts).
   */
  aneis: AnelPosto[];
  /**
   * O que vai em cada braço, **do pulso para o cotovelo**: até `MAX_PULSEIRAS` pulseiras em cada um, e
   * um relógio só, num dos dois. O relógio entra na fila como as pulseiras: as que vêm antes dele ficam
   * entre ele e a mão, as que vêm depois sobem o braço acima dele.
   */
  bracos: Record<Mao, string[]>;
  /** O esmalte (um para todas as unhas). */
  esmalte: string;
  /** A luva de cada mão: dá para usar numa só (a outra fica nua, `LUVA_PADRAO`). */
  luvas: Record<Mao, string>;
  /**
   * O jeito antigo — um só no pulso de cada mão, e uma luva para as duas —, só para os clientes de
   * antes desta versão, que ainda leem estes campos. Sai sempre derivado dos de cima (`comLegado`);
   * ninguém daqui os lê.
   */
  pulsos?: Record<Mao, string | null>;
  luva?: string;
}

export const MAX_ANEIS = 6;
/** Quantas pulseiras cabem num braço (o relógio não conta). */
export const MAX_PULSEIRAS = 5;
export const ESMALTE_PADRAO = 'esmalte-natural';
/**
 * A luva de quem não escolheu nenhuma: **as mãos nuas**, seja qual for o traje. Todo mundo começa de
 * mãos vazias — sem anel, sem pulseira e sem luva, mesmo que o traje do personagem tenha a dele; a
 * luva do traje (`luva-traje`) é uma escolha como as outras, e vem com o jogo.
 */
export const LUVA_PADRAO = 'luva-nenhuma';

const tipoDe = (id: string | null | undefined): TipoDeAcessorio | undefined => (id ? porId.get(id)?.tipo : undefined);

/** Os campos antigos (`pulsos`, `luva`), tirados dos novos — veja `Acessorios.pulsos`. */
export function comLegado(a: Acessorios): Acessorios {
  const noPulso = (m: Mao) => a.bracos[m].find((id) => tipoDe(id) === 'relogio') ?? a.bracos[m][0] ?? null;
  const luva = a.luvas.E === a.luvas.D || a.luvas.D === LUVA_PADRAO ? a.luvas.E : a.luvas.D;
  return { aneis: a.aneis, bracos: a.bracos, esmalte: a.esmalte, luvas: a.luvas, pulsos: { E: noPulso('E'), D: noPulso('D') }, luva };
}

/** Sem acessório nenhum: as unhas naturais e as mãos nuas. */
export const SEM_ACESSORIOS: Acessorios = Object.freeze(comLegado({ aneis: [], bracos: { E: [], D: [] }, esmalte: ESMALTE_PADRAO, luvas: { E: LUVA_PADRAO, D: LUVA_PADRAO } })) as Acessorios;

const doTipo = (v: unknown, ...tipos: TipoDeAcessorio[]): string | null => {
  const a = typeof v === 'string' ? porId.get(v) : undefined;
  return a && tipos.includes(a.tipo) ? a.id : null;
};

/**
 * Arruma a fila de um braço: só pulseiras e relógios, no máximo `MAX_PULSEIRAS` pulseiras, e o
 * relógio só se ainda não há um (`temRelogio` diz se o outro braço já levou o dele).
 */
function filaDoBraco(v: unknown, temRelogio: boolean): { fila: string[]; relogio: boolean } {
  const fila: string[] = [];
  let pulseiras = 0;
  let relogio = temRelogio;
  for (const x of Array.isArray(v) ? v : []) {
    const id = doTipo(x, 'pulseira', 'relogio');
    if (!id) continue;
    if (tipoDe(id) === 'relogio') {
      if (relogio) continue;
      relogio = true;
    } else if (++pulseiras > MAX_PULSEIRAS) continue;
    fila.push(id);
  }
  return { fila, relogio };
}

/**
 * Os acessórios que chegaram de fora (da rede, do perfil salvo): só ids que existem, cada um no
 * lugar em que cabe — um anel por dedo e não mais que `MAX_ANEIS`; até `MAX_PULSEIRAS` pulseiras por
 * braço e um relógio só. O que não é nada (um cliente antigo, que não manda o campo) vira "sem
 * acessórios", e o jeito antigo (`pulsos`, `luva`) vira o novo.
 */
export function sanitizeAcessorios(v: unknown): Acessorios {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const aneis: AnelPosto[] = [];
  for (const x of Array.isArray(o.aneis) ? o.aneis : []) {
    const a = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const id = doTipo(a.id, 'anel');
    const mao = a.mao === 'E' || a.mao === 'D' ? a.mao : null;
    const dedo = typeof a.dedo === 'number' && Number.isInteger(a.dedo) && a.dedo >= 0 && a.dedo <= 4 ? a.dedo : null;
    if (!id || !mao || dedo === null) continue;
    if (aneis.some((y) => y.mao === mao && y.dedo === dedo)) continue;
    aneis.push({ id, mao, dedo });
    if (aneis.length >= MAX_ANEIS) break;
  }
  // os braços: o campo novo, ou — de um cliente antigo — o que ele tinha em cada pulso
  const b = (o.bracos && typeof o.bracos === 'object' ? o.bracos : null) as Record<string, unknown> | null;
  const p = (o.pulsos && typeof o.pulsos === 'object' ? o.pulsos : {}) as Record<string, unknown>;
  const pedido = (m: Mao): unknown => (b ? b[m] : p[m] ? [p[m]] : []);
  const E = filaDoBraco(pedido('E'), false);
  const D = filaDoBraco(pedido('D'), E.relogio);
  // as luvas: uma para cada mão, ou — do jeito antigo — a mesma nas duas
  const l = (o.luvas && typeof o.luvas === 'object' ? o.luvas : null) as Record<string, unknown> | null;
  const luvaDe = (m: Mao) => doTipo(l ? l[m] : o.luva, 'luva') ?? LUVA_PADRAO;
  return comLegado({
    aneis,
    bracos: { E: E.fila, D: D.fila },
    esmalte: doTipo(o.esmalte, 'esmalte') ?? ESMALTE_PADRAO,
    luvas: { E: luvaDe('E'), D: luvaDe('D') },
  });
}

/** Uma chave curta para um conjunto de acessórios (o mesmo conjunto dá a mesma chave). */
export function chaveDosAcessorios(a: Acessorios | undefined): string {
  if (!a) return '';
  const aneis = [...a.aneis].sort((x, y) => (x.mao + x.dedo).localeCompare(y.mao + y.dedo)).map((x) => `${x.mao}${x.dedo}:${x.id}`);
  return [aneis.join(','), a.bracos.E.join(','), a.bracos.D.join(','), a.esmalte, a.luvas.E, a.luvas.D].join('|');
}

/** Põe (ou tira, se já está lá) um anel num dedo. Passando do limite, o anel mais antigo sai. */
export function alternarAnel(a: Acessorios, id: string, mao: Mao, dedo: number): Acessorios {
  const ja = a.aneis.find((x) => x.mao === mao && x.dedo === dedo);
  const resto = a.aneis.filter((x) => x !== ja);
  if (ja?.id === id) return comLegado({ ...a, aneis: resto });
  return comLegado({ ...a, aneis: [...resto, { id, mao, dedo }].slice(-MAX_ANEIS) });
}

/** Quantas pulseiras há num braço. */
export const pulseirasNoBraco = (a: Acessorios, mao: Mao): number => a.bracos[mao].filter((id) => tipoDe(id) === 'pulseira').length;

/** Em que braço está o relógio (null: sem relógio). */
export function bracoDoRelogio(a: Acessorios): Mao | null {
  for (const m of ['E', 'D'] as const) if (a.bracos[m].some((id) => tipoDe(id) === 'relogio')) return m;
  return null;
}

/** Ainda cabe esta peça neste braço? (O relógio sempre cabe: o que já havia sai do lugar.) */
export function cabeNoBraco(a: Acessorios, id: string, mao: Mao): boolean {
  const t = tipoDe(id);
  if (t === 'relogio') return true;
  return t === 'pulseira' && pulseirasNoBraco(a, mao) < MAX_PULSEIRAS;
}

/**
 * Põe uma pulseira ou o relógio num braço, na posição `onde` da fila (0 = junto da mão; sem dizer, a
 * pulseira vai para o alto da fila e o relógio para junto da mão). O relógio é um só: pôr um tira o
 * que havia, no braço que for. Sem lugar (cinco pulseiras), nada muda.
 */
export function porNoBraco(a: Acessorios, id: string, mao: Mao, onde?: number): Acessorios {
  const t = tipoDe(id);
  if (t !== 'pulseira' && t !== 'relogio') return a;
  if (!cabeNoBraco(a, id, mao)) return a;
  const semRelogio = (fila: string[]) => (t === 'relogio' ? fila.filter((x) => tipoDe(x) !== 'relogio') : fila);
  const bracos = { E: semRelogio(a.bracos.E), D: semRelogio(a.bracos.D) };
  const fila = [...bracos[mao]];
  const i = Math.max(0, Math.min(fila.length, onde ?? (t === 'relogio' ? 0 : fila.length)));
  fila.splice(i, 0, id);
  return comLegado({ ...a, bracos: { ...bracos, [mao]: fila } });
}

/** Tira o que está na posição `i` da fila de um braço. */
export function tirarDoBraco(a: Acessorios, mao: Mao, i: number): Acessorios {
  return comLegado({ ...a, bracos: { ...a.bracos, [mao]: a.bracos[mao].filter((_, k) => k !== i) } });
}

/** Troca de lugar a peça `i` de um braço com a vizinha (`passo` = −1: para junto da mão; +1: braço acima). */
export function moverNoBraco(a: Acessorios, mao: Mao, i: number, passo: -1 | 1): Acessorios {
  const j = i + passo;
  const fila = [...a.bracos[mao]];
  if (i < 0 || i >= fila.length || j < 0 || j >= fila.length) return a;
  [fila[i], fila[j]] = [fila[j], fila[i]];
  return comLegado({ ...a, bracos: { ...a.bracos, [mao]: fila } });
}

/** Põe uma luva nas mãos dadas (as outras ficam como estão). */
export function porLuva(a: Acessorios, id: string, maos: readonly Mao[]): Acessorios {
  const luvas = { ...a.luvas };
  for (const m of maos) luvas[m] = id;
  return comLegado({ ...a, luvas });
}

/** Quantas vezes a peça está em uso (o mesmo anel em dois dedos são dois; a luva nas duas mãos é um par: uma). */
export function vezesEmUso(a: Acessorios, id: string): number {
  if (a.esmalte === id || a.luvas.E === id || a.luvas.D === id) return 1;
  return a.aneis.filter((x) => x.id === id).length + a.bracos.E.filter((x) => x === id).length + a.bracos.D.filter((x) => x === id).length;
}

/** O acessório está em uso? */
export const emUso = (a: Acessorios, id: string): boolean => vezesEmUso(a, id) > 0;
