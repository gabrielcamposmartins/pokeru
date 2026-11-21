/**
 * A mesa 3D dentro da tela de jogo: o canvas que fica no fundo do palco, debaixo da camada 2D
 * (cartas abertas, placas, painel). Ele ocupa a janela inteira — passa do palco para os lados (e
 * para cima e para baixo, numa janela mais alta que 16:9) —, com o palco no meio. Abre a cena (src/mesa3d/cena.ts), registra-a como palco do
 * diretor e lhe passa o estado da partida e os cosméticos que valem na rodada a cada mudança.
 *
 * É carregada à parte (React.lazy em src/game/TableStage.tsx): o three.js e a modelagem só descem
 * quando uma partida abre.
 */
import { useEffect, useRef } from 'react';
import { findCharacter } from '../../shared/styles';
import { STAGE_H, STAGE_W } from '../game/layout';
import { chipSkin, dealerCardSkin, mainChipSkin, tableSkin } from '../game/skins';
import { useJanelaNoPalco } from '../game/Stage';
import { useEquipped, useProfile } from '../store/profile';
import { useTable } from '../store/table';
import { Cena3D } from './cena';
import { registrarPalco } from './palco';

export default function Mesa3D() {
  const caixa = useRef<HTMLDivElement>(null);
  const cena = useRef<Cena3D | null>(null);
  const view = useTable((s) => s.display);
  const minhaMesa = useEquipped('table');
  const minhaFicha = useEquipped('chip');
  const minhaFrente = useEquipped('face');
  const meuVerso = useEquipped('back');
  const meuPersonagem = useProfile((s) => s.character);
  const meusAcessorios = useProfile((s) => s.acessorios);
  const janela = useJanelaNoPalco();

  // o canvas é criado aqui (e não no JSX): cada montagem tem o seu contexto WebGL, e a desmontagem
  // do StrictMode não deixa um contexto descartado no canvas da montagem seguinte
  useEffect(() => {
    const tela = document.createElement('canvas');
    tela.className = 'mesa3d-canvas';
    caixa.current!.append(tela);
    const c = new Cena3D(tela);
    cena.current = c;
    registrarPalco(c);
    (window as unknown as { mesa3d?: Cena3D }).mesa3d = c;
    return () => {
      registrarPalco(null, c);
      c.destruir();
      tela.remove();
      cena.current = null;
    };
  }, []);

  useEffect(() => {
    const c = cena.current;
    if (!c || !view) return;
    const minhas = { face: minhaFrente, back: meuVerso };
    c.atualizar({
      view,
      mesa: tableSkin(view, minhaMesa),
      cartas: dealerCardSkin(view, minhas),
      fichaDe: (seat) => chipSkin(view, seat, minhaFicha),
      fichaDoPote: mainChipSkin(view, minhaFicha),
      // o meu personagem sai do perfil (a troca mais recente), como nas vozes do diretor
      personagemDe: (seat) => (seat === view.mySeat ? findCharacter(meuPersonagem).id : (view.seats[seat]?.cosmetics.character.id ?? '')),
      // os meus saem do perfil; os dos outros, do que o servidor mandou (bot não usa acessório, como não tem aura)
      acessoriosDe: (seat) => (seat === view.mySeat ? meusAcessorios : view.seats[seat]?.isBot ? undefined : view.seats[seat]?.cosmetics.acessorios),
    });
  }, [view, minhaMesa, minhaFicha, minhaFrente, meuVerso, meuPersonagem, meusAcessorios]);

  return <div ref={caixa} className="mesa3d" style={{ left: (STAGE_W - janela.largura) / 2, top: (STAGE_H - janela.altura) / 2, width: janela.largura, height: janela.altura }} />;
}
