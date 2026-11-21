/**
 * Os materiais do personagem 3D, divididos pelas páginas de apoio (personagem.html e mesa.html): a
 * pele, o traço do modo de desenho, o tecido da roupa, e as fichas e cartas.
 *
 * Todos os materiais do corpo têm `uSemCabeca`: o que fica acima dessa altura (na T-pose) não se
 * desenha — é para pôr a câmera nos olhos de um personagem sem ver a cabeça dele por dentro.
 */
import * as THREE from 'three';
import { BARALHO, CARTA, FICHA, type Objeto } from '../personagem/animacoes';

/** As cores vão para o shader como estão escritas (sRGB), sem conversão. */
export const cor = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** O começo de todo shader de vértice do corpo: a pele acompanha os ossos. */
export const COM_OSSOS = /* glsl */ `
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
`;

/**
 * A pele: branca puxada para o rosa, fosca (quase sem reflexo), e mais rosada nas pontas dos dedos.
 * A luz principal vem de cima, à esquerda de quem olha, e anda junto com a câmera — assim a forma
 * se lê de qualquer ângulo. `uAnime` troca o degradê macio pelas duas cores chapadas de desenho.
 * As unhas são esbranquiçadas e meio transparentes: deixam ver o rosado do dedo por baixo.
 */
export function criarPele() {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uPele: { value: cor('#fff6f2') },
      uMeio: { value: cor('#f9e0da') },
      uSombra: { value: cor('#e4b2b0') },
      uFundo: { value: cor('#c18b8f') },
      uAnime: { value: 0 },
      uSemCabeca: { value: 99 },
      // o esmalte: a cor, o quanto cobre a unha (0 = a unha natural) e o lustro dele
      uEsmalte: { value: cor('#ffffff') },
      uEsmalteForca: { value: 0 },
      uEsmalteBrilho: { value: 0.3 },
      // a segunda cor e o acabamento: 0 liso, 1 francesinha, 2 degradê, 3 glitter, 4 cromado
      uEsmalte2: { value: cor('#ffffff') },
      uEsmalteTipo: { value: 0 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      attribute float ar;
      attribute float unha;
      attribute float rosado;
      attribute float coberto;
      varying vec3 vN;
      varying vec3 vV;
      varying float vAr;
      varying float vUnha;
      varying float vRosado;
      varying float vCoberto;
      varying float vAltura;
      varying vec3 vRepouso;
      // (onde o vértice fica ao longo da unha, 0 na raiz e 1 na ponta: só a mesa do jogo o dá — sem ele, vale 0)
      attribute float aoLongoDaUnha;
      varying float vNaUnha;
      void main() {
        ${COM_OSSOS}
        vAltura = position.y;
        vRepouso = position;
        vNaUnha = aoLongoDaUnha;
        vec4 p = modelViewMatrix * vec4(transformed, 1.0);
        vN = normalMatrix * objectNormal;
        vV = -p.xyz;
        vAr = ar;
        vUnha = unha;
        vRosado = rosado;
        vCoberto = coberto;
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uPele, uMeio, uSombra, uFundo;
      uniform float uAnime;
      uniform float uSemCabeca;
      uniform vec3 uEsmalte;
      uniform vec3 uEsmalte2;
      uniform float uEsmalteForca;
      uniform float uEsmalteBrilho;
      uniform float uEsmalteTipo;
      varying vec3 vRepouso;
      varying float vNaUnha;
      varying vec3 vN;
      varying vec3 vV;
      varying float vAr;
      varying float vUnha;
      varying float vRosado;
      varying float vCoberto;
      varying float vAltura;
      void main() {
        // debaixo da roupa não há pele a desenhar (senão ela furaria a roupa nas dobras)
        if (vCoberto > 0.5 || vAltura > uSemCabeca) discard;
        vec3 n = normalize(vN);
        vec3 v = normalize(vV);
        vec3 l = normalize(vec3(-0.5, 0.6, 0.62));
        float ndl = dot(n, l);
        // o "ar livre" do vértice: 1 em campo aberto, menos no fundo das dobras
        float ar = smoothstep(0.3, 0.95, vAr);

        // macio: do fundo da sombra à luz cheia, passando pela sombra e pelo meio-tom
        float luz = (0.8 * max(ndl, 0.0) + 0.2 * (0.5 + 0.5 * n.y)) * mix(0.5, 1.0, ar);
        vec3 macio = mix(uFundo, uSombra, smoothstep(0.0, 0.26, luz));
        macio = mix(macio, uMeio, smoothstep(0.16, 0.48, luz));
        macio = mix(macio, uPele, smoothstep(0.44, 0.86, luz));
        // um nada de brilho de contorno e de reflexo: a pele é fosca
        float borda = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        macio += borda * 0.05 * vec3(1.0, 0.93, 0.96);
        vec3 h = normalize(l + v);
        macio += pow(max(dot(n, h), 0.0), 40.0) * 0.015;

        // anime: duas cores chapadas, com a divisa quase dura
        // (a luz do desenho vem mais de lado, para a sombra desenhar a forma; só as dobras fundas a puxam)
        float deLado = dot(n, normalize(vec3(-0.72, 0.6, 0.34)));
        float chapa = smoothstep(0.0, 0.04, deLado + 0.1 - (1.0 - smoothstep(0.05, 0.42, vAr)) * 0.7);
        vec3 anime = mix(mix(uSombra, uMeio, 0.5), uPele, chapa);

        // as pontas dos dedos puxam para o rosa, num degradê que começa na última junta
        vec3 rosa = mix(vec3(1.0), vec3(1.0, 0.82, 0.845), vRosado * 0.8);
        macio *= rosa;
        anime *= rosa;

        // a unha: natural (esbranquiçada, com um lustro discreto, e meio transparente) ou com esmalte
        // (a cor dele, opaca, com a sombra e o lustro de uma tinta lisa)
        float lustro = pow(max(dot(n, h), 0.0), 60.0) * mix(0.22, uEsmalteBrilho, uEsmalteForca);
        // o acabamento: a tinta de cada ponto da unha e o quanto ela cobre
        float naPonta = smoothstep(0.12, 0.88, vNaUnha);
        vec3 tinta = uEsmalte;
        float cobre = uEsmalteForca;
        if (uEsmalteTipo > 3.5) {
          // cromado: um espelho — o que reflete o alto é claro, o que reflete o chão é escuro, com um risco de luz
          vec3 r = reflect(-v, n);
          tinta = mix(uEsmalte2, uEsmalte, smoothstep(-0.25, 0.55, r.y)) + pow(max(r.y, 0.0), 10.0) * 0.5;
        } else if (uEsmalteTipo > 2.5) {
          // glitter: pontos de brilho presos na unha, que acendem e apagam conforme a mão vira
          vec3 q = floor(vRepouso * 2600.0);
          float acaso = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float pisca = 0.5 + 0.5 * sin(acaso * 60.0 + dot(n, v) * 26.0);
          tinta = mix(uEsmalte, uEsmalte2, step(0.74, acaso) * (0.35 + 0.65 * pisca));
        } else if (uEsmalteTipo > 1.5) {
          tinta = mix(uEsmalte, uEsmalte2, naPonta);
        } else if (uEsmalteTipo > 0.5) {
          // francesinha: só a ponta é pintada
          cobre *= smoothstep(0.66, 0.74, vNaUnha);
        }
        vec3 pintada = tinta * mix(0.6, 1.0, smoothstep(0.1, 0.8, luz));
        macio = mix(macio, mix(mix(macio, vec3(1.0, 0.975, 0.97), 0.55), pintada, cobre) + lustro, vUnha);
        vec3 pintadaChapada = tinta * mix(0.76, 1.0, chapa);
        anime = mix(anime, mix(mix(anime, vec3(1.0, 0.975, 0.97), 0.55), pintadaChapada, cobre), vUnha);

        gl_FragColor = vec4(mix(macio, anime, uAnime), mix(1.0, mix(0.7, 1.0, cobre), vUnha));
      }
    `,
  });
}

/** O traço do desenho: o avesso do corpo, um pouco inchado (a mesma grossura na tela em qualquer distância). */
export function criarTraco() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uGrossura: { value: 1.6 }, uTela: { value: new THREE.Vector2(1, 1) }, uSemCabeca: { value: 99 } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      uniform float uGrossura;
      uniform vec2 uTela;
      attribute float coberto;
      varying float vCoberto;
      varying float vAltura;
      void main() {
        ${COM_OSSOS}
        vCoberto = coberto;
        vAltura = position.y;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
        vec3 n = normalize(normalMatrix * objectNormal);
        vec2 lado = normalize(n.xy + vec2(1e-5));
        p.xy += lado * uGrossura * 2.0 / uTela * p.w;
        gl_Position = p;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uSemCabeca;
      varying float vCoberto;
      varying float vAltura;
      void main() {
        if (vCoberto > 0.5 || vAltura > uSemCabeca) discard;
        gl_FragColor = vec4(0.42, 0.22, 0.27, 1.0);
      }
    `,
  });
}

/**
 * O tecido da roupa: fosco, da cor de cada peça (o atributo `cor`), iluminado como a pele — a mesma
 * luz que anda com a câmera, e as duas cores chapadas no modo de desenho. As estampas (o `enfeite`
 * de cada peça: canelado, dragão bordado, renda, ramos, brocado) são desenhadas aqui, com a segunda
 * cor (`cor2`). Serve para as peças que acompanham os ossos e para o pano solto.
 */
export function criarTecido() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uAnime: { value: 0 }, uSemCabeca: { value: 99 } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      attribute float ar;
      attribute vec3 cor;
      attribute vec3 cor2;
      attribute vec3 avesso;
      attribute float enfeite;
      attribute vec3 repouso;
      varying vec3 vN;
      varying vec3 vV;
      varying float vAr;
      varying vec3 vCor;
      varying vec3 vCor2;
      varying vec3 vAvesso;
      varying float vEnfeite;
      varying vec3 vRepouso;
      void main() {
        ${COM_OSSOS}
        vec4 p = modelViewMatrix * vec4(transformed, 1.0);
        vN = normalMatrix * objectNormal;
        vV = -p.xyz;
        vAr = ar;
        vCor = cor;
        vCor2 = cor2;
        vAvesso = avesso;
        vEnfeite = enfeite;
        vRepouso = repouso;
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAnime;
      uniform float uSemCabeca;
      varying vec3 vN;
      varying vec3 vV;
      varying float vAr;
      varying vec3 vCor;
      varying vec3 vCor2;
      varying vec3 vAvesso;
      varying float vEnfeite;
      varying vec3 vRepouso;
      const float VOLTA = 6.2831853;

      // Os enfeites são desenhados em cima de onde o ponto fica na T-pose: no braço, ao longo dele e
      // em volta (em metros); no tronco, de lado e para cima.
      vec2 noPano(vec3 p) {
        if (abs(p.x) > 0.2) return vec2(abs(p.x), atan(p.z, p.y - 1.4) * 0.045);
        return p.xy;
      }
      // escamas: fileiras de arcos, desencontradas
      float escamas(vec2 q) {
        q *= 100.0;
        q.x += 0.5 * mod(floor(q.y), 2.0);
        vec2 f = fract(q) - vec2(0.5, 1.0);
        return smoothstep(0.1, 0.03, abs(length(f) - 0.52));
      }
      // nuvens: uma espiral em cada casa
      float nuvens(vec2 q) {
        vec2 casa = q / 0.05;
        casa.y += 0.5 * mod(floor(casa.x), 2.0);
        vec2 c = fract(casa) - 0.5;
        float r = length(c) * 0.05;
        return smoothstep(0.0017, 0.0007, abs(r - (0.007 + 0.0011 * atan(c.y, c.x)))) * step(r, 0.0125);
      }
      // o dragão bordado: uma faixa de escamas, com crista, que dá a volta na manga (e desce o peito do
      // lado esquerdo), entre nuvens
      float dragao(vec3 p, bool soEsquerdo) {
        float ax = abs(p.x);
        vec2 q = noPano(p);
        float d;
        float some = 1.0;
        if (ax > 0.2) {
          if (soEsquerdo && p.x < 0.0) return 0.0;
          d = abs(mod(atan(p.z, p.y - 1.4) - ax * 15.0 + VOLTA * 0.5, VOLTA) - VOLTA * 0.5) * 0.045;
          if (soEsquerdo) some = smoothstep(0.56, 0.47, ax);
        } else {
          if (p.x < 0.0) return 0.0;
          d = abs(p.x - (0.074 + 0.034 * sin((p.y - 1.0) * 15.0)));
          some = smoothstep(1.43, 1.39, p.y);
        }
        float corpo = smoothstep(0.0185, 0.016, d);
        float borda = smoothstep(0.0028, 0.0012, abs(d - 0.0172));
        float crista = step(0.0185, d) * smoothstep(0.0, 0.003, 0.012 * abs(sin(q.x * 160.0 + q.y * 45.0)) - (d - 0.0185));
        float longe = soEsquerdo ? 0.0 : nuvens(q) * step(0.036, d);
        return some * clamp(max(max(corpo * (0.3 + 0.7 * escamas(q)), max(borda, crista)), longe), 0.0, 1.0);
      }
      // a renda: 1 no fio, 0 no furo (os furos crescem e encolhem, formando flores)
      float renda(vec2 q) {
        q *= 150.0;
        float flor = 0.5 + 0.5 * sin(q.x * 0.8) * sin(q.y * 0.8);
        q.x += 0.5 * mod(floor(q.y), 2.0);
        float furo = 0.2 + 0.17 * flor;
        return smoothstep(furo - 0.05, furo, length(fract(q) - 0.5));
      }
      // ramos: um caule ondulado com folhas de um lado e do outro
      float ramos(vec2 q) {
        float linha = floor(q.y / 0.045);
        float y = (fract(q.y / 0.045) - 0.5) * 0.045 - 0.007 * sin(q.x * 70.0 + linha * 1.7);
        float caule = smoothstep(0.0013, 0.0005, abs(y));
        float cx = (fract(q.x / 0.014) - 0.5) * 0.014;
        float lado = mod(floor(q.x / 0.014), 2.0) * 2.0 - 1.0;
        vec2 f = vec2(cx, y - lado * 0.0045);
        f = vec2(f.x * 0.8 - f.y * 0.6 * lado, f.x * 0.6 * lado + f.y * 0.8);
        float folha = smoothstep(1.0, 0.75, length(f / vec2(0.0056, 0.0023)));
        return max(caule, folha);
      }
      // brocado: losangos miúdos com um ponto no meio
      float brocado(vec2 q) {
        vec2 f = abs(fract(q * 85.0) - 0.5);
        float a = f.x + f.y;
        return smoothstep(0.36, 0.32, a) * smoothstep(0.16, 0.2, a) + smoothstep(0.07, 0.04, a);
      }

      void main() {
        if (vRepouso.y > uSemCabeca) discard;
        vec3 base = vCor;
        int enfeite = int(vEnfeite + 0.5);
        vec3 p = vRepouso;
        vec2 q = noPano(p);
        bool noBraco = abs(p.x) > 0.2;
        if (enfeite == 1) {
          // o canelado: nervuras ao comprido, e listras da segunda cor em volta
          float nervura = 0.5 + 0.5 * sin(noBraco ? atan(p.z, p.y - 1.4) * 30.0 : atan(p.x, p.z + 0.0001) * 60.0);
          float listra = step(0.7, fract((noBraco ? abs(p.x) : p.y) * 50.0));
          base = mix(base, vCor2, listra) * mix(0.72, 1.1, nervura);
        } else if (enfeite == 2 || enfeite == 6 || enfeite == 7) {
          base = mix(base, vCor2, dragao(p, enfeite == 6));
          // a faixa preta de frisos (da segunda cor) em volta da manga, acima do cotovelo
          float ax = abs(p.x);
          if (enfeite == 7 && ax > 0.318 && ax < 0.374) base = ax > 0.326 && ax < 0.366 ? vec3(0.094, 0.09, 0.114) : vCor2;
        } else if (enfeite == 3) {
          if (renda(q) < 0.5) discard;
        } else if (enfeite == 4) {
          // os ramos ficam perto da barra da manga
          base = mix(base, vCor2, ramos(q) * (noBraco ? smoothstep(0.47, 0.56, abs(p.x)) : 1.0));
        } else if (enfeite == 5) {
          base = mix(base, vCor2, brocado(q));
        }
        // o avesso (o forro de uma jaqueta, o lado de dentro de uma manga larga) tem a cor dele
        if (!gl_FrontFacing) base = vAvesso;

        vec3 v = normalize(vV);
        vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 l = normalize(vec3(-0.5, 0.6, 0.62));
        float ndl = dot(n, l);
        float ar = smoothstep(0.3, 0.95, vAr);
        // um pano escuro não some no fundo: as sombras dele puxam para um cinza-azulado
        vec3 claro = base * 1.04 + 0.03;
        vec3 sombra = mix(base * 0.5, vec3(0.16, 0.15, 0.2), 0.18);
        float luz = (0.8 * max(ndl, 0.0) + 0.2 * (0.5 + 0.5 * n.y)) * mix(0.5, 1.0, ar);
        vec3 macio = mix(sombra, claro, smoothstep(0.05, 0.75, luz));
        macio += pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.06;
        float deLado = dot(n, normalize(vec3(-0.72, 0.6, 0.34)));
        float chapa = smoothstep(0.0, 0.04, deLado + 0.1 - (1.0 - smoothstep(0.05, 0.42, vAr)) * 0.7);
        vec3 anime = mix(mix(sombra, claro, 0.35), claro, chapa);
        gl_FragColor = vec4(mix(macio, anime, uAnime), 1.0);
      }
    `,
  });
}

// ─────────────────────────── as fichas e as cartas ───────────────────────────

const lateralDaFicha = new THREE.MeshStandardMaterial({ color: 0xf4ecec, roughness: 0.55 });
const formaDaFicha = new THREE.CylinderGeometry(FICHA.raio, FICHA.raio, FICHA.alto * 0.94, 36);
const formaDaCarta = new THREE.BoxGeometry(CARTA.larg, CARTA.alto, CARTA.comp);
const formaDoBaralho = new THREE.BoxGeometry(CARTA.larg, BARALHO.alto, CARTA.comp);
const papel = new THREE.MeshStandardMaterial({ color: 0xfaf6f0, roughness: 0.6 });
const verso = new THREE.MeshStandardMaterial({ color: 0x8e2f45, roughness: 0.6 });
const frente = new THREE.MeshStandardMaterial({ color: 0xfdfaf4, roughness: 0.55, emissive: 0x3a1020, emissiveIntensity: 0.25 });
// as seis faces de uma caixa: +x, -x, +y (o verso, para cima quando a carta está de costas), -y (a frente), +z, -z
const daCarta = [papel, papel, verso, frente, papel, papel];
const doBaralho = [papel, papel, verso, papel, papel, papel];
const coresDeFicha = new Map<number, THREE.MeshStandardMaterial>();

/**
 * Quem põe as fichas e cartas de um instante dentro do grupo dado (aproveitando as peças já criadas
 * de uma vez para a outra).
 */
export function criarObjetos(grupo: THREE.Object3D) {
  const pecas: Record<Objeto['tipo'], THREE.Mesh[]> = { ficha: [], carta: [], baralho: [] };
  return (objs: Objeto[]) => {
    const usados = { ficha: 0, carta: 0, baralho: 0 };
    for (const o of objs) {
      const i = usados[o.tipo]++;
      let m = pecas[o.tipo][i];
      if (!m) {
        m = o.tipo === 'ficha' ? new THREE.Mesh(formaDaFicha, [lateralDaFicha, papel, papel]) : new THREE.Mesh(o.tipo === 'carta' ? formaDaCarta : formaDoBaralho, o.tipo === 'carta' ? daCarta : doBaralho);
        pecas[o.tipo].push(m);
        grupo.add(m);
      }
      if (o.tipo === 'ficha') {
        const c = o.cor ?? 0xc8324a;
        if (!coresDeFicha.has(c)) coresDeFicha.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
        m.material = [lateralDaFicha, coresDeFicha.get(c)!, coresDeFicha.get(c)!];
      }
      m.visible = true;
      m.position.copy(o.pos);
      m.quaternion.copy(o.quat);
    }
    for (const tipo of ['ficha', 'carta', 'baralho'] as const) for (let i = usados[tipo]; i < pecas[tipo].length; i++) pecas[tipo][i].visible = false;
  };
}
