import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { insecureGateway, useAuth } from '../store/auth';
import { CharacterStageView, Petals } from './MainMenu';
import { sfx } from '../audio/sfx';

/**
 * Tela de entrada: usuário, senha e "lembrar-me" — e, na mesma tela, criar a conta.
 *
 * A conta é do serviço do bot do Discord (o GBOT). O jogo não fala com ele diretamente: o pedido
 * vai ao servidor Pokeru, que repassa para a API interna e devolve o **token** — é esse token que
 * identifica o jogador na conexão da mesa.
 *
 * Dá para seguir sem conta: o jogo offline e as mesas livres não dependem de login. O que precisa
 * de conta é o que fica guardado — fichas, itens da loja e vínculo.
 *
 * O "lembrar-me" guarda **usuário e token**, cifrados (src/auth/vault.ts). A senha não é salva.
 */

export type LoginMode = 'in' | 'up';

/** A parte visual, sem estado — é o que os testes desenham. */
export function LoginPanel({
  mode,
  user,
  password,
  remember,
  error,
  busy,
  serviceReady,
  serviceError,
  insecure,
  onMode,
  onUser,
  onPassword,
  onRemember,
  onSubmit,
  onSkip,
}: {
  mode: LoginMode;
  user: string;
  password: string;
  remember: boolean;
  error: string | null;
  busy: boolean;
  serviceReady: boolean;
  /** Por que o serviço não respondeu (certificado não aceito, servidor fora do ar…). */
  serviceError?: string | null;
  /** O caminho até o servidor é sem TLS? (a senha vai em claro na rede) */
  insecure?: boolean;
  onMode: (m: LoginMode) => void;
  onUser: (v: string) => void;
  onPassword: (v: string) => void;
  onRemember: (v: boolean) => void;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  const [showPass, setShowPass] = useState(false);
  const novo = mode === 'up';
  return (
    <motion.form
      className="panel login-panel"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <h2 className="title-deco login-title">{novo ? 'Criar conta' : 'Entrar'}</h2>
      <p className="muted login-sub">Sua conta guarda fichas, itens da loja e vínculo no servidor.</p>

      <div className="login-modes">
        <button type="button" className={`login-mode ${novo ? '' : 'on'}`} onClick={() => onMode('in')}>
          Já tenho conta
        </button>
        <button type="button" className={`login-mode ${novo ? 'on' : ''}`} onClick={() => onMode('up')}>
          Criar conta
        </button>
      </div>

      <label className="login-field">
        <span className="field-label">Usuário</span>
        <input
          className="input"
          value={user}
          autoComplete="username"
          maxLength={32}
          placeholder="seu usuário"
          onChange={(e) => onUser(e.target.value)}
        />
      </label>

      <label className="login-field">
        <span className="field-label">Senha</span>
        <span className="login-pass">
          <input
            className="input"
            type={showPass ? 'text' : 'password'}
            value={password}
            autoComplete={novo ? 'new-password' : 'current-password'}
            maxLength={128}
            placeholder={novo ? 'pelo menos 8 caracteres' : 'sua senha'}
            onChange={(e) => onPassword(e.target.value)}
          />
          <button
            type="button"
            className="login-eye"
            title={showPass ? 'Esconder a senha' : 'Mostrar a senha'}
            aria-label={showPass ? 'Esconder a senha' : 'Mostrar a senha'}
            onClick={() => setShowPass((v) => !v)}
          >
            {showPass ? '🙈' : '👁'}
          </button>
        </span>
      </label>

      <button type="button" className={`pre-btn login-remember ${remember ? 'on' : ''}`} onClick={() => onRemember(!remember)}>
        <span className="box" />
        Lembrar-me neste computador
      </button>
      <p className="field-hint login-hint">
        Guarda seu usuário e a sessão (o token) cifrados aqui. <b>A senha não é salva</b> — ela serve só para entrar.
      </p>

      {/* sem TLS a senha atravessa a rede em claro: quem digita merece saber antes */}
      {insecure && (
        <p className="field-hint login-plain">
          A conexão com o servidor <b>ainda é sem TLS</b>: a senha vai em claro na rede. Use uma senha só deste jogo.
        </p>
      )}

      {error && <div className="login-error">{error}</div>}

      <div className="row gap center login-actions">
        <button className="btn btn-gold big" disabled={busy}>
          {busy ? (novo ? 'Criando…' : 'Entrando…') : novo ? 'Criar e entrar' : 'Entrar'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSkip}>
          Jogar sem conta
        </button>
      </div>

      {!serviceReady && (
        <p className="field-hint login-soon">
          {serviceError ?? 'O servidor está sem serviço de contas agora.'} <b>Jogar sem conta</b> libera a Partida Rápida e as mesas livres.
        </p>
      )}
    </motion.form>
  );
}

/** A tela, ligada na loja de login. */
export function LoginScreen() {
  const { status, user: saved, remember, error, serviceReady, serviceError, setRemember, signIn, register, continueOffline } = useAuth();
  const insecure = insecureGateway();
  const [mode, setMode] = useState<LoginMode>('in');
  const [user, setUser] = useState(saved ?? '');
  const [password, setPassword] = useState('');

  // o usuário lembrado chega depois do `restore()`
  useEffect(() => {
    if (saved) setUser(saved);
  }, [saved]);

  return (
    <div className="screen login-screen">
      <div className="menu-bg" />
      <Petals />
      <CharacterStageView className="login-char" heightVh={86} />
      <div className="login-side">
        <LoginPanel
          mode={mode}
          user={user}
          password={password}
          remember={remember}
          error={error}
          busy={status === 'signing' || status === 'restoring'}
          serviceReady={serviceReady}
          serviceError={serviceError}
          insecure={insecure}
          onMode={(m) => {
            sfx.hover();
            setMode(m);
          }}
          onUser={setUser}
          onPassword={setPassword}
          onRemember={(v) => {
            sfx.click();
            setRemember(v);
          }}
          onSubmit={() => {
            sfx.click();
            const go = mode === 'up' ? register : signIn;
            void go(user, password).then((ok) => {
              // a senha não fica nem na tela depois de usada
              if (ok) setPassword('');
            });
          }}
          onSkip={() => {
            sfx.click();
            continueOffline();
          }}
        />
      </div>
    </div>
  );
}
