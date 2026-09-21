import { useEffect, useState } from 'react';
import { useSession } from './store/session';
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
import { CharactersScreen } from './screens/Characters';
import { LoginScreen } from './screens/Login';
import { Toasts } from './game/Overlays';
import { BondUnlockScreen } from './game/BondBar';
import { UpdateOverlay } from './update/UpdateOverlay';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { useUiTheme } from './ui/themes';

export type Screen = 'menu' | 'online' | 'studio' | 'settings' | 'characters';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const room = useSession((s) => s.room);
  const mode = useSession((s) => s.mode);
  const botsPending = useSession((s) => s.botsPending);
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

  // volta ao menu certo ao sair de uma partida
  useEffect(() => {
    if (mode === 'none' && screen !== 'online' && screen !== 'studio' && screen !== 'settings' && screen !== 'characters') setScreen('menu');
  }, [mode, screen]);

  let content;
  // a entrada é a tela de login; "jogar sem conta" e a sessão logada seguem para o jogo
  const gated = authStatus !== 'logged' && authStatus !== 'offline' && mode === 'none' && !room;
  if (gated) content = <LoginScreen />;
  else if (mode === 'local') content = <GameScreen />;
  else if (mode === 'online' && room && room.status !== 'waiting') content = <GameScreen />;
  // partida contra bots sendo montada no servidor: o menu segue na frente ("sentando à mesa…")
  else if (botsPending) content = <MainMenu go={setScreen} />;
  else if (mode === 'online' && room) content = <RoomLobby />;
  else if (screen === 'online' || mode === 'online') content = <OnlineLobby onBack={() => setScreen('menu')} />;
  else if (screen === 'studio') content = <Studio onBack={() => setScreen('menu')} />;
  else if (screen === 'settings') content = <SettingsScreen onBack={() => setScreen('menu')} onCharacters={() => setScreen('characters')} />;
  else if (screen === 'characters') content = <CharactersScreen onBack={() => setScreen('menu')} />;
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
      <UpdateOverlay />
      <Toasts />
    </>
  );
}
