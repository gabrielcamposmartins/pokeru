import { useEffect, useState } from 'react';
import { SERVER_URL, useCharacter, useProfile } from '../store/profile';
import { useSession } from '../store/session';
import { AccountSection } from './Account';
import { ScreenHeader, Section, Slider, Toggle } from '../ui/controls';
import { sfx } from '../audio/sfx';
import { FALA_SLOTS, sayLine } from '../audio/voice';
import { Petals } from './MainMenu';

function useAppInfo(): string {
  const [info, setInfo] = useState('Navegador');
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const core = await import('@tauri-apps/api/core');
        if (!core.isTauri()) return;
        const r = await core.invoke<{ name: string; version: string; platform: string }>('app_info');
        if (alive) setInfo(`${r.name} ${r.version} · Tauri (${r.platform})`);
      } catch {
        /* rodando no navegador */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

/**
 * Configurações: o que se resolve uma vez.
 *
 * Perfil, personalidade e títulos saíram daqui para a tela de Perfil (src/screens/Profile.tsx),
 * que abre pela foto no menu. O que sobra é ajuste — jogo, som, conta — e o rodapé com a versão e
 * o endereço do servidor.
 */
export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const p = useProfile();
  const character = useCharacter();

  const toast = useSession((s) => s.toast);
  const info = useAppInfo();
  const [confirmReset, setConfirmReset] = useState(false);
  const s = p.settings;
  return (
    <div className="screen tela-cheia">
      <div className="menu-bg" />
      <Petals />
      <ScreenHeader title="Configurações" onBack={onBack} />
      {/* um painel só, duas colunas: ele preenche a tela até a margem, e quem rola é cada coluna */}
      <div className="panel painel-duplo">
        <div className="painel-col">
          {/*
            * Jogo e som numa seção só.
            *
            * Eram duas listas curtas em colunas diferentes, e "Rede" e "Dados" ocupavam metade da
            * tela para dizer um endereço que ninguém digita e um botão que quase ninguém aperta. O
            * endereço do servidor virou a linha de rodapé, junto da versão.
            */}
          <Section title="Jogo">
            <Slider
              label="Velocidade das animações"
              value={s.animSpeed}
              min={0.5}
              max={2.5}
              step={0.1}
              format={(v) => `${v.toFixed(1)}x`}
              onChange={(v) => p.updateSettings({ animSpeed: v })}
            />
            <Toggle label="Mostrar dica da minha mão" value={s.handHint} onChange={(v) => p.updateSettings({ handHint: v })} />
            <Toggle label="Atualizar o app sozinho ao abrir" value={s.autoUpdate} onChange={(v) => p.updateSettings({ autoUpdate: v })} />

            <div className="settings-sub">Som</div>
            <Slider label="Volume" value={s.volume} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => p.updateSettings({ volume: v })} />
            <Toggle label="Silenciar tudo" value={s.muted} onChange={(v) => p.updateSettings({ muted: v })} />
            <Toggle label="Vozes dos personagens" value={s.voices} onChange={(v) => p.updateSettings({ voices: v })} />
            <Slider
              label="Volume das vozes"
              value={s.voiceVolume}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => p.updateSettings({ voiceVolume: v })}
            />
            <div className="row gap">
              <button className="btn btn-ghost small" onClick={() => sfx.win()}>
                ♪ Testar som
              </button>
              <button
                className="btn btn-ghost small"
                disabled={!s.voices || s.muted}
                onClick={() => sayLine(character.id, FALA_SLOTS[Math.floor(Math.random() * FALA_SLOTS.length)])}
              >
                ♪ Testar voz ({character.name})
              </button>
            </div>
          </Section>
          <div className="settings-pe">
            <div className="muted small">
              {info} · servidor <code>{SERVER_URL}</code>
            </div>
            {confirmReset ? (
              <div className="row gap">
                <button
                  className="btn btn-danger small"
                  onClick={() => {
                    p.resetAll();
                    setConfirmReset(false);
                    toast('Perfil e estilos restaurados.');
                  }}
                >
                  Confirmar: apagar tudo
                </button>
                <button className="btn btn-ghost small" onClick={() => setConfirmReset(false)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button className="btn btn-ghost small" onClick={() => setConfirmReset(true)}>
                Restaurar padrões (apaga estilos personalizados)
              </button>
            )}
          </div>
        </div>
        <div className="painel-col">
          <Section title="Conta">
            <AccountSection />
          </Section>
        </div>
      </div>
    </div>
  );
}
