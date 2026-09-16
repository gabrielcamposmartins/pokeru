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
import './styles/global.css';
import { App } from './App';

// respeita "reduzir movimento" do sistema; ?nomotion força (útil para capturas/testes)
const reducedMotion = new URLSearchParams(location.search).has('nomotion') ? 'always' : 'user';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion={reducedMotion}>
      <App />
    </MotionConfig>
  </StrictMode>,
);
