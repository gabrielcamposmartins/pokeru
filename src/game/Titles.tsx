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

import { equipTitle, useAchievements, useMyTitle } from '../store/titles';
import { useSession } from '../store/session';
import { Select, type SelectOption } from '../ui/controls';
import { TitleGlow } from '../render/Title';

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
        /*
         * Um seletor, e não uma fileira de botões.
         *
         * Os títulos se acumulam — são dez, e vão ser mais — e a fileira crescia até virar um
         * parágrafo de botões onde só um estava aceso. A lista fechada mostra o título em uso com o
         * brilho que ele tem na mesa, que é a única coisa que interessa enquanto não se está
         * trocando.
         */
        <Select<string | null>
          value={equipped}
          onChange={equipTitle}
          placeholder="Nenhum título"
          options={[
            { value: null, label: 'Nenhum', hint: 'Jogar sem título ao lado do nome' },
            ...feitas.map(
              (r): SelectOption<string | null> => ({
                value: r.a.title,
                label: r.a.title,
                render: <TitleGlow title={r.a.title} />,
                hint: r.a.name,
              }),
            ),
          ]}
        />
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
