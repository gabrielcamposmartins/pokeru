import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import '@fontsource/m-plus-rounded-1c/400.css';
import '@fontsource/m-plus-rounded-1c/500.css';
import '@fontsource/m-plus-rounded-1c/700.css';
import '@fontsource/m-plus-rounded-1c/800.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/cinzel-decorative/700.css';
import '@fontsource/cinzel-decorative/900.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/600-italic.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/cormorant-garamond/700-italic.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/800.css';
import '@fontsource/playfair-display/900.css';
import '@fontsource/playfair-display/900-italic.css';
import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/600.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/orbitron/800.css';
import '@fontsource/orbitron/900.css';
import '@fontsource/chakra-petch/400.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import './styles/global.css';
import './styles/cardfx.css';
import './styles/persona.css';
import './styles/victorian.css';
import './styles/retro.css';
import { App } from './App';
import { useProfile } from './store/profile';
import { applyTheme, findTheme } from './ui/themes';

// aplica o tema salvo antes do primeiro desenho (o perfil é lido do localStorage na hora)
applyTheme(findTheme(useProfile.getState().settings.uiTheme), useProfile.getState().settings);

// respeita "reduzir movimento" do sistema; ?nomotion força (útil para capturas/testes)
const reducedMotion = new URLSearchParams(location.search).has('nomotion') ? 'always' : 'user';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion={reducedMotion}>
      <App />
    </MotionConfig>
  </StrictMode>,
);
