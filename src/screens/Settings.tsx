import { useEffect, useState } from 'react';
import { SERVER_URL, useCharacter, useProfile } from '../store/profile';
import { useSession } from '../store/session';
import { useAuth } from '../store/auth';
import { ScreenHeader, Section, Slider, Toggle, Field } from '../ui/controls';
import { CharacterPortrait } from '../render/CharacterArt';
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

export function SettingsScreen({ onBack, onCharacters }: { onBack: () => void; onCharacters: () => void }) {
  const p = useProfile();
  const character = useCharacter();
  const toast = useSession((s) => s.toast);
  const info = useAppInfo();
  const [confirmReset, setConfirmReset] = useState(false);
  const authStatus = useAuth((a) => a.status);
  const authUser = useAuth((a) => a.user);
  const signOut = useAuth((a) => a.signOut);
  const s = p.settings;
  return (
    <div className="screen">
      <div className="menu-bg" />
      <Petals />
      <ScreenHeader title="Configurações" onBack={onBack} />
      <div className="settings-grid">
        <div className="panel pad">
          <Section title="Perfil">
            <Field label="Nome">
              <input className="input" value={p.name} maxLength={16} onChange={(e) => p.setName(e.target.value)} />
            </Field>
            <div className="field-label">Personagem</div>
            <div className="row gap">
              <div className="char-info-portrait" style={{ background: `linear-gradient(160deg, ${character.bg}, ${character.bg2})` }}>
                <CharacterPortrait st={character} size={72} />
              </div>
              <div>
                <b>{character.name}</b>
                <div className="muted small">{character.title}</div>
                <button className="btn btn-pink small" style={{ marginTop: 6 }} onClick={onCharacters}>
                  Trocar personagem
                </button>
              </div>
            </div>
          </Section>
          <Section title="Conta">
            {authStatus === 'logged' ? (
              <>
                <div className="row gap between">
                  <div>
                    <b>{authUser}</b>
                    <div className="muted small">Sessão guardada neste computador.</div>
                  </div>
                  <button
                    className="btn btn-ghost small"
                    onClick={() => {
                      void signOut();
                      toast('Você saiu da conta.');
                    }}
                  >
                    Sair da conta
                  </button>
                </div>
                <div className="field-hint">As fichas e o vínculo ficam no servidor, ligados a esta conta.</div>
              </>
            ) : (
              <>
                <div className="muted small">{authUser ? `Último usuário: ${authUser}` : 'Você está jogando sem conta.'}</div>
                <button
                  className="btn btn-pink small"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    // volta o login para a frente: sem sessão, o App mostra a tela de entrada
                    void signOut();
                  }}
                >
                  Entrar numa conta
                </button>
                <div className="field-hint">O "lembrar-me" guarda o usuário e a sessão cifrados. A senha não é salva.</div>
              </>
            )}
          </Section>
          <Section title="Áudio">
            <Slider label="Volume" value={s.volume} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => p.updateSettings({ volume: v })} />
            <Toggle label="Silenciar tudo" value={s.muted} onChange={(v) => p.updateSettings({ muted: v })} />
            <button className="btn btn-ghost small" onClick={() => sfx.win()}>
              ♪ Testar som
            </button>
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
            <button className="btn btn-ghost small" disabled={!s.voices || s.muted} onClick={() => sayLine(character.id, FALA_SLOTS[Math.floor(Math.random() * FALA_SLOTS.length)])}>
              ♪ Testar voz ({character.name})
            </button>
          </Section>
        </div>
        <div className="panel pad">
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
          </Section>
          <Section title="Rede">
            <div className="field-label">Servidor</div>
            <div className="server-info">
              <code>{SERVER_URL}</code>
              <div className="field-hint">
                O jogo fala sempre com o servidor oficial — o que você escolhe é a <b>sala</b>, em Salas. Quem hospeda o próprio
                servidor aponta o app na hora de montá-lo (<code>VITE_SERVER_URL</code> ou <code>POKERU_SERVER_URL</code>).
              </div>
            </div>
          </Section>
          <Section title="Dados">
            {confirmReset ? (
              <div className="row gap">
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    p.resetAll();
                    setConfirmReset(false);
                    toast('Perfil e estilos restaurados.');
                  }}
                >
                  Confirmar: apagar tudo
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button className="btn btn-ghost" onClick={() => setConfirmReset(true)}>
                Restaurar padrões (apaga estilos personalizados)
              </button>
            )}
          </Section>
          <div className="muted small" style={{ marginTop: 18 }}>
            {info}
          </div>
        </div>
      </div>
    </div>
  );
}
