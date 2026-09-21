import { useEffect, useState } from 'react';
import { useAuth } from '../store/auth';
import { useSession } from '../store/session';
import { pedeSaldo, useDiscord, usePado } from '../store/shop';
import { PadoCoinSvg } from '../render/PadoCoin';
import { fmt } from '../util/format';
import { sfx } from '../audio/sfx';

/**
 * A seção "Conta" das Configurações: quem está logado e o vínculo com o Discord.
 *
 * O vínculo é o que liga o jogo à economia do bot — é ele que faz os **padocoins** existirem para
 * a conta. São duas etapas, e a do meio é de propósito: o bot manda um código na DM daquele
 * Discord, e só quem recebe a DM consegue concluir. É assim que se prova que o Discord é seu sem
 * o jogo pedir sua senha do Discord.
 *
 * Nada disso passa pelo cliente sozinho: o pedido vai ao servidor Pokeru, que fala com a API
 * interna do bot e anota o vínculo na conta.
 */
export function AccountSection() {
  const { status, user, discord: linkedId, busy, signOut } = useAuth();
  const discordCode = useAuth((s) => s.discordCode);
  const discordLink = useAuth((s) => s.discordLink);
  const discordUnlink = useAuth((s) => s.discordUnlink);
  const toast = useSession((s) => s.toast);
  const discord = useDiscord();
  const pado = usePado();

  const [step, setStep] = useState<'idle' | 'id' | 'code'>('idle');
  /** O que a pessoa digitou: nome de usuário do Discord ou o id numérico — o servidor resolve. */
  const [id, setId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  // o saldo de padocoins é lido no servidor a pedido: ao abrir o perfil, pede um número fresco
  useEffect(() => {
    pedeSaldo();
  }, []);

  const logged = status === 'logged';
  // o servidor é a fonte; a sessão serve de resposta rápida enquanto a conta não chega
  const linked = discord?.id ?? linkedId;

  if (!logged) {
    return (
      <>
        <div className="muted small">{user ? `Último usuário: ${user}` : 'Você está jogando sem conta.'}</div>
        <button
          className="btn btn-pink small"
          style={{ marginTop: 8 }}
          onClick={() => {
            sfx.click();
            // sem sessão, o App põe a tela de entrada na frente
            void signOut();
          }}
        >
          Entrar numa conta
        </button>
        <div className="field-hint">
          A conta guarda fichas, itens e vínculo no servidor. O "lembrar-me" guarda o usuário e a sessão cifrados — a senha não é salva.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="row gap between">
        <div>
          <b>{user}</b>
          <div className="muted small">Fichas, itens e vínculo ficam no servidor, nesta conta.</div>
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

      <div className="acc-discord">
        {linked ? (
          <>
            <div className="row gap between">
              <div>
                <b className="acc-dc-name">
                  <span className="acc-dc-mark">Discord</span> {discord?.nickname || discord?.username || linked}
                </b>
                <div className="muted small">
                  {pado !== null ? (
                    <>
                      <PadoCoinSvg size={14} /> {fmt(pado)} padocoins
                    </>
                  ) : (
                    // sem saldo em mãos o jogador não fica sem saída: o botão pede de novo ao servidor
                    <button
                      className="btn btn-ghost small"
                      onClick={() => {
                        sfx.click();
                        pedeSaldo(true);
                      }}
                    >
                      saldo indisponível — tentar de novo
                    </button>
                  )}
                </div>
              </div>
              <button
                className="btn btn-ghost small"
                disabled={busy}
                onClick={async () => {
                  sfx.click();
                  const err = await discordUnlink();
                  setError(err);
                  if (!err) toast('Discord desvinculado. Os padocoins continuam na sua conta do bot.');
                }}
              >
                Desvincular
              </button>
            </div>
            <div className="field-hint">Com o Discord vinculado, a loja aceita padocoins além das fichas.</div>
          </>
        ) : step === 'idle' ? (
          <>
            <button
              className="btn btn-pink small"
              onClick={() => {
                sfx.click();
                setError(null);
                setStep('id');
              }}
            >
              Vincular conta do Discord
            </button>
            <div className="field-hint">
              A conta do jogo e o seu Discord são <b>coisas separadas</b> — o vínculo é o que liga as duas. Feito isso, os{' '}
              <b>padocoins</b> que você já tem aparecem no topo e valem na Loja.
            </div>
          </>
        ) : step === 'id' ? (
          <form
            className="acc-step"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              const err = await discordCode(id.trim());
              if (err) return setError(err);
              toast('Código enviado na sua DM do Discord.');
              setStep('code');
            }}
          >
            <span className="field-label">Seu usuário do Discord</span>
            <div className="row gap">
              <input
                className="input grow"
                value={id}
                maxLength={40}
                placeholder="gabss2"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => setId(e.target.value.trim())}
              />
              <button className="btn btn-pink small" disabled={busy || id.trim().length < 2}>
                {busy ? 'Enviando…' : 'Enviar código'}
              </button>
              <button type="button" className="btn btn-ghost small" onClick={() => setStep('idle')}>
                Cancelar
              </button>
            </div>
            <div className="field-hint">
              O <b>nome de usuário</b> do Discord (aquele sem espaços, como <code>gabss2</code>) — não o apelido no servidor. O id numérico
              também serve, se preferir.
              <br />
              O bot precisa conseguir te mandar DM: esteja no servidor dele e com as mensagens diretas abertas.
            </div>
          </form>
        ) : (
          <form
            className="acc-step"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              const err = await discordLink(code.trim());
              if (err) return setError(err);
              setStep('idle');
              setCode('');
              sfx.win();
              toast('Discord vinculado! Seus padocoins já aparecem no topo.');
            }}
          >
            <span className="field-label">Código que o bot mandou na DM</span>
            <div className="row gap">
              <input className="input grow" value={code} maxLength={16} placeholder="aB3xZ" onChange={(e) => setCode(e.target.value)} autoFocus />
              <button className="btn btn-gold small" disabled={busy || !code.trim()}>
                {busy ? 'Vinculando…' : 'Vincular'}
              </button>
              <button type="button" className="btn btn-ghost small" onClick={() => setStep('id')}>
                Voltar
              </button>
            </div>
            <div className="field-hint">O código vale 15 minutos e serve uma vez.</div>
          </form>
        )}
        {error && <div className="login-error">{error}</div>}
      </div>
    </>
  );
}
