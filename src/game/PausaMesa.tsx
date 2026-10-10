import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSession } from '../store/session';
import { sfx } from '../audio/sfx';
import type { PausaInfo } from '../../shared/pausa';

/**
 * A pausa da mesa, do lado de quem joga: o botão de pedir, a faixa da votação e a tela da mesa
 * parada. Quem decide é o servidor (shared/room.ts); aqui só se pede, vota e mostra.
 */

/** Quanto falta, contando no relógio daqui a partir do `restaMs` que veio com a mesa. */
function useFalta(p: PausaInfo | null | undefined): number | null {
  const fim = useMemo(() => (p?.restaMs != null ? Date.now() + p.restaMs : null), [p]);
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (fim == null) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fim]);
  return fim == null ? null : Math.max(0, fim - agora);
}

/** `1:59:30` ou `0:23`. */
function relogio(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** O botão de pedir pausa, com os outros botões do canto da mesa. */
export function BotaoPausaMesa({ className }: { className?: string }) {
  const room = useSession((s) => s.room);
  const send = useSession((s) => s.send);
  const pausa = room?.pausa;
  const pode = room?.status === 'playing' && !pausa;
  return (
    <button
      className={className}
      title={pausa ? 'A mesa já tem um pedido de pausa' : 'Pedir pausa (todos precisam aceitar)'}
      aria-label="Pedir pausa"
      disabled={!pode}
      onClick={() => {
        sfx.click();
        send({ type: 'pausa', acao: 'pedir' });
      }}
    >
      ⏸
    </button>
  );
}

/** A faixa da votação, a espera pelo fim da mão e a tela da mesa pausada. */
export function PausaMesa() {
  const room = useSession((s) => s.room);
  const eu = useSession((s) => s.playerId);
  const send = useSession((s) => s.send);
  const p = room?.pausa ?? null;
  const falta = useFalta(p);
  const nome = (id: string) => room?.members.find((m) => m.id === id)?.name ?? '';
  const responder = (acao: 'aceitar' | 'recusar' | 'retomar') => {
    sfx.click();
    send({ type: 'pausa', acao });
  };

  const votou = !!p && !!eu && p.aceitos.includes(eu);
  const voto = !!p && !!eu && p.votantes.includes(eu);
  const faltam = p ? p.votantes.filter((id) => !p.aceitos.includes(id)) : [];

  return (
    <AnimatePresence>
      {p?.estado === 'votando' && (
        <motion.div key="voto" className="pausa-faixa panel" initial={{ y: -30, x: '-50%', opacity: 0 }} animate={{ y: 0, x: '-50%', opacity: 1 }} exit={{ y: -30, x: '-50%', opacity: 0 }}>
          <span className="pausa-faixa-texto">
            {p.por === eu ? 'Você pediu para pausar' : `${p.nome} pediu para pausar`}
            <small>
              {p.aceitos.filter((id) => p.votantes.includes(id)).length}/{p.votantes.length} aceitaram
              {faltam.length > 0 && votou ? ` · falta${faltam.length > 1 ? 'm' : ''} ${faltam.map(nome).join(', ')}` : ''}
              {falta != null ? ` · ${relogio(falta)}` : ''}
            </small>
          </span>
          {voto && !votou && (
            <span className="pausa-faixa-botoes">
              <button className="btn btn-gold small" onClick={() => responder('aceitar')}>
                Aceitar
              </button>
              <button className="btn btn-ghost small" onClick={() => responder('recusar')}>
                Recusar
              </button>
            </span>
          )}
        </motion.div>
      )}
      {p?.estado === 'aguardando' && (
        <motion.div key="espera" className="pausa-faixa panel" initial={{ y: -30, x: '-50%', opacity: 0 }} animate={{ y: 0, x: '-50%', opacity: 1 }} exit={{ y: -30, x: '-50%', opacity: 0 }}>
          <span className="pausa-faixa-texto">
            Pausa aprovada
            <small>a mesa para quando esta mão acabar</small>
          </span>
          <button className="btn btn-ghost small" onClick={() => responder('retomar')}>
            Cancelar
          </button>
        </motion.div>
      )}
      {p?.estado === 'pausada' && (
        <motion.div key="parada" className="pausa-mesa" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="panel pausa-mesa-quadro">
            <span className="pausa-mesa-icone">⏸</span>
            <h2 className="title-deco">Mesa pausada</h2>
            <p className="muted">Qualquer jogador pode retomar a partida.</p>
            {falta != null && (
              <p className="muted small">
                Sem ninguém retomar, a partida é encerrada em <b>{relogio(falta)}</b> — e as fichas da mesa voltam para cada um.
              </p>
            )}
            <button className="btn btn-gold" onClick={() => responder('retomar')}>
              Retomar a partida
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
