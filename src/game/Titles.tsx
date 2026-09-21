/**
 * Conquistas e títulos do jogador.
 *
 * O título é o que aparece junto do nome na mesa. Cada um vem de uma conquista,
 * e conquista é contador que chegou na meta — então esta tela mostra as duas
 * coisas juntas: o que já deu, e o quanto falta no resto.
 *
 * Quem decide se um título vale é o servidor. Aqui a lista só oferece o que a
 * conta liberou; pedir outro não teria efeito.
 */

import { sfx } from '../audio/sfx';
import { equipTitle, useAchievements, useMyTitle } from '../store/titles';
import { useSession } from '../store/session';

export function TitlePanel() {
  const rows = useAchievements();
  const equipped = useMyTitle();
  const temConta = useSession((s) => !!s.account);

  const feitas = rows.filter((r) => r.done);

  if (!temConta) {
    return (
      <p className="muted small">
        Títulos ficam guardados na conta. Entre numa conta para começar a colecionar — sem conta dá para
        jogar, mas não há onde guardar o que você conquistar.
      </p>
    );
  }

  return (
    <div className="titles">
      <div className="field-label">Título em uso</div>
      {feitas.length === 0 ? (
        <p className="muted small" style={{ marginTop: 0 }}>
          Nenhuma conquista ainda. Jogue uma mão até o fim e o primeiro título aparece aqui.
        </p>
      ) : (
        <div className="title-picks">
          <button
            className={`btn small ${equipped === null ? 'btn-gold' : 'btn-ghost'}`}
            onClick={() => {
              sfx.click();
              equipTitle(null);
            }}
          >
            Nenhum
          </button>
          {feitas.map((r) => (
            <button
              key={r.a.id}
              className={`btn small ${equipped === r.a.title ? 'btn-gold' : 'btn-ghost'}`}
              onClick={() => {
                sfx.click();
                equipTitle(r.a.title);
              }}
            >
              {r.a.title}
            </button>
          ))}
        </div>
      )}

      <div className="field-label" style={{ marginTop: 14 }}>
        Conquistas <small className="muted">({feitas.length}/{rows.length})</small>
      </div>
      <div className="achievements">
        {rows.map((r) => (
          <div key={r.a.id} className={`achv ${r.done ? 'done' : ''}`}>
            <span className="achv-mark">{r.done ? '★' : '☆'}</span>
            <span className="achv-info">
              <b>{r.a.name}</b>
              <small>{r.a.hint}</small>
              <span className="achv-title">{r.done ? `Título: ${r.a.title}` : `Libera: ${r.a.title}`}</span>
            </span>
            <span className="achv-count">
              {r.done ? (
                'feito'
              ) : (
                <>
                  {r.have}
                  <small>/{r.a.need}</small>
                </>
              )}
              <span className="achv-track">
                <span className="achv-fill" style={{ width: `${Math.round(r.progress * 100)}%` }} />
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
