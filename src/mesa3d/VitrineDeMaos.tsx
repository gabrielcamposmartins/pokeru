/**
 * A vitrine das mãos: as mãos do personagem do jogador na mesa, de perto, vistas de cima como no
 * jogo — para a Galeria mostrar um acessório onde ele vai ser usado (o anel no dedo, o relógio no
 * pulso, o esmalte nas unhas, a luva nas mãos).
 *
 * É o mesmo personagem da mesa 3D (src/mesa3d/ator.ts), com o mesmo descanso de mãos; só a câmera
 * chega mais perto. Como na mesa, o corpo e a roupa são modelados em ajudantes na primeira vez
 * (uns segundos) — e ficam guardados: a partida que vier depois já os encontra prontos.
 *
 * É carregada à parte (React.lazy na Galeria): o three.js só desce quando alguém abre os acessórios.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { chaveDosAcessorios, type Acessorios, type Mao } from '../../shared/acessorios';
import type { TableStyle } from '../../shared/styles';
import { MESA } from '../personagem/boneco';
import { shade } from '../util/color';
import { Ator } from './ator';
import { clipe } from './clipes';
import { seatLayout3d } from './geometria';
import { modeloPronto, podeModelar, prepararClipes, prepararCorpo, prepararRoupa, vestido } from './modelos';
import { prepararSombra, SOMBRA } from './sombras';

/**
 * Para onde a vitrine olha: as duas mãos, ou — de perto — os dedos ou o pulso de uma delas (onde a
 * peça está). Com `dedo` (0 = indicador … 4 = polegar), a câmera vai até o anel daquele dedo.
 */
export type FocoDaVitrine = { mao: Mao; onde: 'dedos' | 'pulso'; dedo?: number } | null;

const DEDOS = ['indicador', 'medio', 'anelar', 'minimo'];
/** Onde fica, no personagem, aquilo para que a vitrine olha de perto (o anel de um dedo, o pulso); null: sem lugar certo. */
function lugarDoFoco(ator: Ator, f: FocoDaVitrine): THREE.Vector3 | null {
  if (!f) return null;
  if (f.onde === 'pulso') return ator.ossoNoMundo(`mao.${f.mao}`);
  if (f.dedo === undefined) return null;
  // (o anel fica a dois terços do primeiro osso do dedo; no polegar, no meio do segundo)
  const [de, ate, k] = f.dedo === 4 ? ['polegar2', 'polegar3', 0.56] : [`${DEDOS[f.dedo]}1`, `${DEDOS[f.dedo]}2`, 0.66];
  const a = ator.ossoNoMundo(`${de}.${f.mao}`);
  const b = ator.ossoNoMundo(`${ate}.${f.mao}`);
  return a && b ? a.lerp(b, k as number) : null;
}

/** Onde a câmera fica e para onde olha, visto do lugar do personagem (o alvo no tampo, a altura e o recuo dela). */
function enquadrar(foco: FocoDaVitrine): { alvo: [number, number]; alto: number; recuo: number } {
  if (!foco) return { alvo: [0, 0.345], alto: 0.8, recuo: 0.145 };
  const lado = foco.mao === 'E' ? 1 : -1;
  return foco.onde === 'dedos' ? { alvo: [lado * 0.152, 0.405], alto: 0.31, recuo: 0.075 } : { alvo: [lado * 0.183, 0.318], alto: 0.3, recuo: 0.06 };
}

export default function VitrineDeMaos({ personagem, acessorios, mesa, foco = null }: { personagem: string; acessorios: Acessorios; mesa: TableStyle; foco?: FocoDaVitrine }) {
  const caixa = useRef<HTMLDivElement>(null);
  const palco = useRef<{ cena: THREE.Scene; ator: Ator | null; feltro: THREE.MeshBasicMaterial; tela: [number, number]; olhar: (f: FocoDaVitrine, jaJa?: boolean) => void; foco: FocoDaVitrine } | null>(null);
  const [estado, setEstado] = useState<'modelando' | 'pronto' | 'falhou'>(podeModelar() ? 'modelando' : 'falhou');
  const chave = `${personagem}|${chaveDosAcessorios(acessorios)}`;

  // a cena: o tampo, a luz e a câmera em cima das mãos de quem senta no lugar de baixo da mesa
  useEffect(() => {
    if (!podeModelar()) return;
    const tela = document.createElement('canvas');
    tela.className = 'vitrine-maos-tela';
    caixa.current!.append(tela);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: true, alpha: true });
    } catch {
      tela.remove();
      setEstado('falhou');
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const cena = new THREE.Scene();
    const lugar = seatLayout3d(6, 0, true)[0].lugar;
    const ancora = new THREE.Object3D();
    ancora.position.set(lugar.x, 0, lugar.z);
    ancora.rotation.set(0, lugar.giro, 0);
    ancora.updateMatrixWorld(true);
    const alvo = ancora.localToWorld(new THREE.Vector3(0, MESA, 0.345));
    const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 10);
    // (os dedos apontam para o alto da tela, como na mesa)
    camera.up.copy(ancora.localToWorld(new THREE.Vector3(0, 0, 1)).sub(ancora.localToWorld(new THREE.Vector3())).normalize());
    // a câmera vai de um enquadramento ao outro devagar (as duas mãos; de perto, os dedos ou o pulso de uma)
    const quer = { alvo: new THREE.Vector3(), olho: new THREE.Vector3() };
    const tem = { alvo: new THREE.Vector3(), olho: new THREE.Vector3() };
    const olhar = (f: FocoDaVitrine, jaJa = false) => {
      const e = enquadrar(f);
      quer.alvo.copy(ancora.localToWorld(new THREE.Vector3(e.alvo[0], MESA, e.alvo[1])));
      quer.olho.copy(ancora.localToWorld(new THREE.Vector3(e.alvo[0], MESA + e.alto, e.alvo[1] - e.recuo)));
      if (jaJa) {
        tem.alvo.copy(quer.alvo);
        tem.olho.copy(quer.olho);
      }
    };
    olhar(foco, true);
    cena.add(new THREE.AmbientLight(0xffffff, 1.5));
    const sol = new THREE.DirectionalLight(0xfff2ea, 1.7);
    const cantos = [MESA - 0.05, MESA + 0.4].flatMap((y) => [-1, 1].flatMap((i) => [-1, 1].map((j) => new THREE.Vector3(alvo.x + i * 0.5, y, alvo.z + j * 0.5))));
    prepararSombra(sol, alvo, cantos, Math.min(2048, renderer.capabilities.maxTextureSize));
    cena.add(sol, sol.target);
    const feltro = new THREE.MeshBasicMaterial({ color: mesa.felt });
    const tampo = new THREE.Mesh(new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2), feltro);
    tampo.position.set(alvo.x, MESA - 0.0006, alvo.z);
    const sombra = new THREE.Mesh(tampo.geometry, new THREE.ShadowMaterial({ color: SOMBRA.cor, opacity: SOMBRA.forca, depthWrite: false }));
    sombra.position.set(alvo.x, MESA - 0.0003, alvo.z);
    sombra.receiveShadow = true;
    cena.add(tampo, sombra);
    const p = { cena, ator: null as Ator | null, feltro, tela: [1, 1] as [number, number], olhar, foco: foco as FocoDaVitrine };
    palco.current = p;

    const medir = () => {
      const r = caixa.current?.getBoundingClientRect();
      if (!r || !r.width || !r.height) return;
      const razao = Math.min(window.devicePixelRatio || 1, 2);
      p.tela = [Math.round(r.width * razao), Math.round(r.height * razao)];
      renderer.setPixelRatio(1);
      renderer.setSize(p.tela[0], p.tela[1], false);
      camera.aspect = r.width / r.height;
      // (numa caixa estreita a lente abre, para as duas mãos caberem)
      camera.fov = camera.aspect < 1.25 ? 30 * (1.25 / camera.aspect) : 30;
      camera.updateProjectionMatrix();
      p.ator?.tela(p.tela[0], p.tela[1]);
    };
    const olho = new ResizeObserver(medir);
    olho.observe(caixa.current!);
    medir();

    let quadro = 0;
    let antes = performance.now();
    const anda = (agora: number) => {
      quadro = requestAnimationFrame(anda);
      const dt = Math.min(0.05, (agora - antes) / 1000);
      antes = agora;
      const k = 1 - Math.exp(-dt * 7);
      // (de perto, a câmera vai até a peça — o anel daquele dedo, aquele pulso —, onde quer que a mão esteja)
      const la = p.ator && lugarDoFoco(p.ator, p.foco);
      if (la) {
        const alto = p.foco!.onde === 'pulso' ? 0.21 : 0.125;
        quer.alvo.set(la.x, MESA, la.z);
        quer.olho.set(la.x, MESA + alto, la.z).addScaledVector(camera.up, -alto * 0.22);
      }
      tem.alvo.lerp(quer.alvo, k);
      tem.olho.lerp(quer.olho, k);
      camera.position.copy(tem.olho);
      camera.lookAt(tem.alvo);
      const ator = p.ator;
      if (ator) {
        ator.quadro(dt);
        if (ator.precisaDePano) ator.passoDoPano();
      }
      renderer.render(cena, camera);
    };
    quadro = requestAnimationFrame(anda);
    return () => {
      cancelAnimationFrame(quadro);
      olho.disconnect();
      p.ator?.destruir();
      palco.current = null;
      renderer.dispose();
      tela.remove();
    };
    // (a cena é montada uma vez; a cor do feltro e o personagem entram pelos efeitos abaixo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    palco.current?.feltro.color.set(shade(mesa.felt, 0.04));
  }, [mesa.felt]);

  useEffect(() => {
    if (palco.current) palco.current.foco = foco;
    palco.current?.olhar(foco);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco?.mao, foco?.onde, foco?.dedo]);

  // o personagem: refeito quando ele ou os acessórios mudam (a roupa nova é costurada num ajudante)
  useEffect(() => {
    if (!podeModelar()) return;
    let vale = true;
    const comLuva = vestido(personagem, acessorios.luva);
    if (!modeloPronto(comLuva) || !clipe('idle-plana')) setEstado('modelando');
    void Promise.all([prepararCorpo(), prepararRoupa(comLuva), prepararClipes()]).then(
      () => {
        const p = palco.current;
        const modelo = modeloPronto(comLuva);
        const descanso = clipe('idle-plana');
        if (!vale || !p || !modelo || !descanso) return;
        p.ator?.destruir();
        const ator = new Ator(personagem, modelo.corpo, modelo.roupa, acessorios);
        ator.tela(p.tela[0], p.tela[1]);
        ator.semCabeca(true);
        ator.sentar(seatLayout3d(6, 0, true)[0].lugar);
        ator.descansar(descanso);
        p.cena.add(ator.grupo);
        p.ator = ator;
        setEstado('pronto');
      },
      () => vale && setEstado('falhou'),
    );
    return () => {
      vale = false;
    };
    // (a chave resume o personagem e os acessórios)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return (
    <div ref={caixa} className="vitrine-maos">
      {estado === 'modelando' && <span className="vitrine-maos-aviso">Modelando as mãos…</span>}
      {estado === 'falhou' && <span className="vitrine-maos-aviso">Sem a prévia 3D neste aparelho.</span>}
    </div>
  );
}
