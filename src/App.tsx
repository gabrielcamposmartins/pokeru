import { useEffect, useState } from 'react';
import { useSession } from './store/session';
import { useTable } from './store/table';
import { useProfile } from './store/profile';
import { useAuth } from './store/auth';
import { setSoundSet, setVolume, sfx } from './audio/sfx';
import { setVoiceVolume } from './audio/voice';
import { MainMenu } from './screens/MainMenu';
import { OnlineLobby } from './screens/OnlineLobby';
import { RoomLobby } from './screens/RoomLobby';
import { GameScreen } from './screens/GameScreen';
import { Studio } from './screens/Studio';
import { SettingsScreen } from './screens/Settings';
import { PerfilAmigo, ProfileScreen } from './screens/Profile';
import { ConviteDeGrupo, ConviteDeSala, FriendsScreen } from './screens/Friends';
import { CharactersScreen } from './screens/Characters';
import { StoreScreen } from './screens/Store';
import { GalleryScreen } from './screens/Gallery';
import { LoginScreen } from './screens/Login';
import { Toasts } from './game/Overlays';
import { BondUnlockScreen } from './game/BondBar';
import { OpeningScreen } from './game/Opening';
import { NivelNovoCena } from './game/NivelNovo';
import { UpdateOverlay } from './update/UpdateOverlay';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { useUiTheme } from './ui/themes';

export type Screen = 'menu' | 'online' | 'studio' | 'settings' | 'profile' | 'friends' | 'characters' | 'store' | 'gallery';

/** Telas que vivem por conta própria: sair de uma partida não tira o jogador delas. */
const TELAS_PROPRIAS: Record<Exclude<Screen, 'menu'>, true> = {
  online: true,
  studio: true,
  settings: true,
  profile: true,
  friends: true,
  characters: true,
  store: true,
  gallery: true,
};

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const room = useSession((s) => s.room);
  const mode = useSession((s) => s.mode);
  const botsPending = useSession((s) => s.botsPending);
  const opening = useTable((s) => s.opening);
  const connStatus = useSession((s) => s.status);
  const connError = useSession((s) => s.connError);
  const connectOnline = useSession((s) => s.connectOnline);
  const volume = useProfile((s) => s.settings.volume);
  const muted = useProfile((s) => s.settings.muted);
  const voices = useProfile((s) => s.settings.voices);
  const voiceVolume = useProfile((s) => s.settings.voiceVolume);
  const theme = useUiTheme();
  const authStatus = useAuth((s) => s.status);
  const restore = useAuth((s) => s.restore);

  // ao abrir, lê a sessão guardada (o usuário lembrado e, quando houver, o token)
  useEffect(() => {
    void restore();
  }, [restore]);

  /**
   * Passou da tela de entrada: liga no servidor e deixa a conexão de pé.
   *
   * A conta do jogador — fichas, padocoins, itens — só existe enquanto há conexão. Antes disso o
   * jogo conectava só ao abrir **Salas**, então o menu, a loja e as Configurações apareciam sem
   * nada disso: quem tinha padocoins lia "saldo indisponível".
   *
   * Uma tentativa por sessão: se o servidor não responder, `connError` fica preenchido e quem
   * insiste é o botão em Salas — não um laço de reconexão no menu.
   */
  const passouDoLogin = authStatus === 'logged' || authStatus === 'offline';
  useEffect(() => {
    if (passouDoLogin && connStatus === 'idle' && !connError) connectOnline();
  }, [passouDoLogin, connStatus, connError, connectOnline]);

  // tema da interface: o CSS de cada tema vale sob <html data-ui="…">
  useEffect(() => {
    document.documentElement.dataset.ui = theme.id;
    setSoundSet(theme.sounds);
  }, [theme]);

  useEffect(() => {
    setVolume(volume, muted);
    setVoiceVolume(volume * voiceVolume, voices && !muted);
  }, [volume, muted, voices, voiceVolume]);

  useEffect(() => {
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  /**
   * Volta ao menu ao sair de uma partida — menos quando o jogador está numa tela que vive por
   * conta própria.
   *
   * A lista é um `Record` de todas as telas menos o menu: acrescentar uma tela nova sem dizer aqui
   * o que ela é **não compila**. Era uma cadeia de `!==` e a Galeria, que entrou depois, não estava
   * nela — clicar no botão abria a tela e este efeito mandava de volta ao menu no mesmo instante.
   */
  useEffect(() => {
    if (mode === 'none' && screen !== 'menu' && !TELAS_PROPRIAS[screen]) setScreen('menu');
  }, [mode, screen]);

  let content;
  // a entrada é a tela de login; "jogar sem conta" e a sessão logada seguem para o jogo
  const gated = authStatus !== 'logged' && authStatus !== 'offline' && mode === 'none' && !room;
  if (gated) content = <LoginScreen />;
  // a mesa está montada e conferindo os jogadores: a abertura passa na frente da partida
  else if (opening) content = <OpeningScreen />;
  else if (mode === 'local') content = <GameScreen />;
  else if (mode === 'online' && room && room.status !== 'waiting') content = <GameScreen />;
  // partida contra bots sendo montada no servidor: o menu segue na frente ("sentando à mesa…")
  else if (botsPending) content = <MainMenu go={setScreen} />;
  else if (mode === 'online' && room) content = <RoomLobby />;
  else if (screen === 'online' || mode === 'online') content = <OnlineLobby onBack={() => setScreen('menu')} />;
  else if (screen === 'studio') content = <Studio onBack={() => setScreen('menu')} />;
  else if (screen === 'settings') content = <SettingsScreen onBack={() => setScreen('menu')} />;
  else if (screen === 'profile') content = <ProfileScreen onBack={() => setScreen('menu')} />;
  else if (screen === 'friends') content = <FriendsScreen onBack={() => setScreen('menu')} onCustom={() => setScreen('online')} />;
  else if (screen === 'characters') content = <CharactersScreen onBack={() => setScreen('menu')} onStore={() => setScreen('store')} />;
  else if (screen === 'store') content = <StoreScreen onBack={() => setScreen('menu')} />;
  else if (screen === 'gallery') content = <GalleryScreen onBack={() => setScreen('menu')} />;
  else content = <MainMenu go={setScreen} />;

  return (
    <>
      <ErrorBoundary
        onReset={() => {
          useSession.getState().disconnect();
          setScreen('menu');
        }}
      >
        {content}
      </ErrorBoundary>
      <BondUnlockScreen />
      {/* subiu de nível: a cena espera a partida acabar para cobrir a tela */}
      <NivelNovoCena />
      {/* o convite de grupo fica por cima de qualquer tela: ele tem pressa */}
      <ConviteDeGrupo />
      <ConviteDeSala />
      {/* o perfil de um amigo abre por cima de qualquer tela: da lista, do grupo ou da sala */}
      <PerfilAmigo />
      <UpdateOverlay />
      <Toasts />
    </>
  );
}
