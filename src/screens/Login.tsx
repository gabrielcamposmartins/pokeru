import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { insecureGateway, useAuth } from '../store/auth';
import { CharacterStageView, Petals } from './MainMenu';
import { sfx } from '../audio/sfx';
import { BotaoBaixarApp } from '../ui/BaixarApp';

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
 *
 * Quem esqueceu a senha troca por um código: ele chega na DM do Discord vinculado ou no e-mail da
 * conta — por isso o cadastro pede o e-mail (veja `RecuperarPanel`).
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
  email = '',
  onMode,
  onUser,
  onPassword,
  onEmail,
  onRemember,
  onSubmit,
  onSkip,
  onForgot,
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
  /** O e-mail do cadastro (é por ele que se recupera a senha). */
  email?: string;
  onMode: (m: LoginMode) => void;
  onUser: (v: string) => void;
  onPassword: (v: string) => void;
  onEmail?: (v: string) => void;
  /** "Esqueci a senha" (sem isso, o link não aparece). */
  onForgot?: () => void;
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

      {novo && onEmail && (
        <label className="login-field">
          <span className="field-label">E-mail</span>
          <input
            className="input"
            type="email"
            value={email}
            autoComplete="email"
            maxLength={254}
            placeholder="voce@exemplo.com"
            onChange={(e) => onEmail(e.target.value)}
          />
          <span className="field-hint">Só para recuperar a senha se você esquecer. Não mandamos mais nada.</span>
        </label>
      )}

      {!novo && onForgot && (
        <button type="button" className="login-esqueci" onClick={onForgot}>
          Esqueci a senha
        </button>
      )}

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

/**
 * Esqueci a senha, em dois passos: pedir o código (pelo Discord vinculado ou pelo e-mail da conta)
 * e trocar a senha com ele. Trocada a senha, já entra — o painel não pede para digitá-la de novo.
 */
export function RecuperarPanel({ userInicial, onVoltar }: { userInicial: string; onVoltar: () => void }) {
  const { busy, recuperarPedir, recuperarConfirmar } = useAuth();
  const [user, setUser] = useState(userInicial);
  const [via, setVia] = useState<'discord' | 'email'>('discord');
  const [destino, setDestino] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [nova, setNova] = useState('');
  const [verNova, setVerNova] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pedir = async () => {
    sfx.click();
    setErro(null);
    const r = await recuperarPedir(user, via);
    if ('erro' in r) return setErro(r.erro);
    setDestino(r.destino);
  };

  return (
    <motion.form
      className="panel login-panel"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!destino) return void pedir();
        sfx.click();
        setErro(null);
        const err = await recuperarConfirmar(user, code, nova);
        if (err) setErro(err);
        else sfx.win();
      }}
    >
      <h2 className="title-deco login-title">Recuperar a senha</h2>
      {!destino ? (
        <>
          <p className="muted login-sub">Mandamos um código para você trocar a senha.</p>
          <label className="login-field">
            <span className="field-label">Usuário</span>
            <input className="input" value={user} autoComplete="username" maxLength={32} placeholder="seu usuário" onChange={(e) => setUser(e.target.value)} />
          </label>
          <span className="field-label">Receber o código por</span>
          <div className="login-modes">
            <button type="button" className={`login-mode ${via === 'discord' ? 'on' : ''}`} onClick={() => setVia('discord')}>
              Discord
            </button>
            <button type="button" className={`login-mode ${via === 'email' ? 'on' : ''}`} onClick={() => setVia('email')}>
              E-mail
            </button>
          </div>
          <p className="field-hint">
            {via === 'discord'
              ? 'O bot manda o código na DM do Discord vinculado à conta (as mensagens diretas precisam estar abertas).'
              : 'O código vai para o e-mail cadastrado na conta.'}
          </p>
        </>
      ) : (
        <>
          <p className="muted login-sub">
            Código enviado para <b>{destino}</b>. Ele vale 15 minutos.
          </p>
          <label className="login-field">
            <span className="field-label">Código</span>
            <input
              className="input login-codigo"
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              autoFocus
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <label className="login-field">
            <span className="field-label">Senha nova</span>
            <span className="login-pass">
              <input
                className="input"
                type={verNova ? 'text' : 'password'}
                value={nova}
                autoComplete="new-password"
                maxLength={128}
                placeholder="pelo menos 8 caracteres"
                onChange={(e) => setNova(e.target.value)}
              />
              <button type="button" className="login-eye" aria-label={verNova ? 'Esconder a senha' : 'Mostrar a senha'} onClick={() => setVerNova((v) => !v)}>
                {verNova ? '🙈' : '👁'}
              </button>
            </span>
          </label>
          <button type="button" className="login-esqueci" disabled={busy} onClick={() => void pedir()}>
            Não chegou? Mandar outro código
          </button>
        </>
      )}

      {erro && <div className="login-error">{erro}</div>}

      <div className="row gap center login-actions">
        <button className="btn btn-gold big" disabled={busy || (!destino ? !user.trim() : code.length < 6 || nova.length < 8)}>
          {busy ? 'Aguarde…' : !destino ? 'Mandar o código' : 'Trocar a senha e entrar'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onVoltar}>
          Voltar
        </button>
      </div>
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
  const [email, setEmail] = useState('');
  const [recuperando, setRecuperando] = useState(false);

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
        {recuperando ? (
          <RecuperarPanel
            userInicial={user}
            onVoltar={() => {
              sfx.click();
              setRecuperando(false);
            }}
          />
        ) : (
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
            email={email}
            onEmail={setEmail}
            onForgot={() => {
              sfx.click();
              setRecuperando(true);
            }}
            onRemember={(v) => {
              sfx.click();
              setRemember(v);
            }}
            onSubmit={() => {
              sfx.click();
              const go = mode === 'up' ? register(user, password, email) : signIn(user, password);
              void go.then((ok) => {
                // a senha não fica nem na tela depois de usada
                if (ok) setPassword('');
              });
            }}
            onSkip={() => {
              sfx.click();
              continueOffline();
            }}
          />
        )}
        {/* jogando pelo navegador: o convite para o app desktop */}
        <BotaoBaixarApp jeito="largo" />
      </div>
    </div>
  );
}
