import { create } from 'zustand';

/**
 * Atualização automática do app desktop.
 *
 * Ao abrir, o Pokeru pergunta ao GitHub se existe uma versão mais nova (o `latest.json` da última
 * release), baixa, instala e reinicia — sem ninguém precisar buscar instalador. A verificação da
 * assinatura é do próprio atualizador do Tauri: só instala um pacote assinado com a chave do
 * projeto, então uma release adulterada é recusada.
 *
 * No navegador nada disso existe: os módulos do Tauri só são carregados dentro do app, e a
 * checagem simplesmente não acontece.
 */

export type UpdateStage = 'idle' | 'checking' | 'downloading' | 'installing' | 'ready' | 'error';

interface UpdateState {
  stage: UpdateStage;
  /** Versão encontrada (quando há uma nova). */
  version: string | null;
  notes: string | null;
  /** 0 a 1 enquanto baixa (null quando o servidor não informa o tamanho). */
  progress: number | null;
  error: string | null;
  set(patch: Partial<UpdateState>): void;
  dismiss(): void;
}

export const useUpdate = create<UpdateState>()((set) => ({
  stage: 'idle',
  version: null,
  notes: null,
  progress: null,
  error: null,
  set: (patch) => set(patch),
  dismiss: () => set({ stage: 'idle', error: null }),
}));

/** Só o app desktop se atualiza (no navegador quem atualiza é o servidor web). */
export async function isDesktopApp(): Promise<boolean> {
  try {
    const core = await import('@tauri-apps/api/core');
    return core.isTauri();
  } catch {
    return false;
  }
}

/**
 * Procura, baixa e instala a versão nova; ao terminar, reinicia o app.
 * Devolve `false` quando não havia nada para atualizar (ou quando não deu para verificar).
 */
export async function runAutoUpdate(): Promise<boolean> {
  const st = useUpdate.getState();
  if (st.stage !== 'idle') return false;
  if (!(await isDesktopApp())) return false;

  st.set({ stage: 'checking', error: null });
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) {
      st.set({ stage: 'idle' });
      return false;
    }

    st.set({ stage: 'downloading', version: update.version, notes: update.body ?? null, progress: 0 });
    let total = 0;
    let got = 0;
    await update.downloadAndInstall((ev) => {
      if (ev.event === 'Started') {
        total = ev.data.contentLength ?? 0;
        got = 0;
      } else if (ev.event === 'Progress') {
        got += ev.data.chunkLength;
        useUpdate.getState().set({ progress: total ? Math.min(1, got / total) : null });
      } else if (ev.event === 'Finished') {
        useUpdate.getState().set({ stage: 'installing', progress: 1 });
      }
    });

    st.set({ stage: 'ready' });
    // o instalador já rodou: reiniciar entra na versão nova
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
    return true;
  } catch (err) {
    // ficar sem internet (ou sem release) não pode atrapalhar quem só quer jogar
    console.warn('[atualização]', err);
    useUpdate.getState().set({ stage: 'error', error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
