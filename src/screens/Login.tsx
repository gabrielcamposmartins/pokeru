import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../store/auth';
import { CharacterStageView, Petals } from './MainMenu';
import { sfx } from '../audio/sfx';

/**
 * Tela de entrada: usuário, senha e "lembrar-me".
 *
 * O serviço que emite o token está sendo construído à parte — a tela já faz a parte dela (valida,
 * guarda a sessão, mostra o erro) e avisa quando não há com quem falar. Dá para seguir sem conta:
 * o jogo offline e as mesas livres não dependem de login.
 *
 * O "lembrar-me" guarda **usuário e token**, cifrados (src/auth/vault.ts). A senha não é salva.
 */

/** A parte visual, sem estado — é o que os testes desenham. */
export function LoginPanel({
  user,
  password,
  remember,
  error,
  busy,
  serviceReady,
  onUser,
  onPassword,
  onRemember,
  onSubmit,
  onSkip,
}: {
  user: string;
  password: string;
  remember: boolean;
  error: string | null;
  busy: boolean;
  serviceReady: boolean;
  onUser: (v: string) => void;
  onPassword: (v: string) => void;
  onRemember: (v: boolean) => void;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  const [showPass, setShowPass] = useState(false);
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
      <h2 className="title-deco login-title">Entrar</h2>
      <p className="muted login-sub">Sua conta guarda fichas, vínculo e histórico no servidor.</p>

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
            autoComplete="current-password"
            maxLength={128}
            placeholder="sua senha"
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

      {error && <div className="login-error">{error}</div>}

      <div className="row gap center login-actions">
        <button className="btn btn-gold big" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSkip}>
          Jogar sem conta
        </button>
      </div>

      {!serviceReady && (
        <p className="field-hint login-soon">
          O serviço de login está sendo construído. Enquanto isso, <b>Jogar sem conta</b> libera a Partida Rápida e as mesas livres.
        </p>
      )}
    </motion.form>
  );
}

/** A tela, ligada na loja de login. */
export function LoginScreen() {
  const { status, user: saved, remember, error, serviceReady, setRemember, signIn, continueOffline } = useAuth();
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
          user={user}
          password={password}
          remember={remember}
          error={error}
          busy={status === 'signing' || status === 'restoring'}
          serviceReady={serviceReady}
          onUser={setUser}
          onPassword={setPassword}
          onRemember={(v) => {
            sfx.click();
            setRemember(v);
          }}
          onSubmit={() => {
            sfx.click();
            void signIn(user, password).then((ok) => {
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
