import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useProfile } from '../store/profile';
import { runAutoUpdate, useUpdate } from './autoUpdate';

/**
 * O aviso da atualização automática: aparece só quando há uma versão nova, mostra o download e
 * some sozinho quando não há nada (ou quando a checagem falha — ficar sem internet não pode
 * atrapalhar quem abriu o jogo para jogar).
 */
export function UpdateOverlay() {
  const { stage, version, progress, error, dismiss } = useUpdate();
  const autoUpdate = useProfile((s) => s.settings.autoUpdate);

  // uma checagem por abertura
  useEffect(() => {
    if (!autoUpdate) return;
    void runAutoUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a falha é só um aviso: some sozinha
  useEffect(() => {
    if (stage !== 'error') return;
    const t = setTimeout(dismiss, 6000);
    return () => clearTimeout(t);
  }, [stage, dismiss]);

  const show = stage === 'downloading' || stage === 'installing' || stage === 'ready' || stage === 'error';
  const pct = progress === null ? null : Math.round(progress * 100);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className={`update-card ${stage === 'error' ? 'bad' : ''}`}
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0, transition: { duration: 0.25 } }}
          transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        >
          {stage === 'error' ? (
            <>
              <b>Não deu para procurar atualização</b>
              <small>{error}</small>
            </>
          ) : (
            <>
              <b>
                {stage === 'downloading' ? 'Baixando a versão' : stage === 'installing' ? 'Instalando a versão' : 'Reiniciando na versão'} {version}
              </b>
              <div className="update-track">
                <div className="update-fill" style={{ width: pct === null ? '100%' : `${pct}%` }} />
              </div>
              <small>{stage === 'downloading' && pct !== null ? `${pct}%` : 'quase lá…'}</small>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
