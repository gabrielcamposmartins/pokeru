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

import { equipTitle, useAchievements, useMyTitle, type AchievementRow } from '../store/titles';
import { useSession } from '../store/session';
import { Select, type SelectOption } from '../ui/controls';
import { TitleGlow } from '../render/Title';

/**
 * O título em uso, num seletor.
 *
 * Mora sozinho porque o perfil o põe logo abaixo da identidade (foto, nome, nível) — é parte de
 * como a pessoa aparece na mesa —, e a lista de conquistas vai para a aba dela.
 */
export function EscolhaDeTitulo() {
  const rows = useAchievements();
  const equipped = useMyTitle();
  const temConta = useSession((s) => !!s.account);
  const feitas = rows.filter((r) => r.done);
  if (!temConta) return null;
  return (
    <div className="titulo-em-uso">
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
    </div>
  );
}

/** A lista de conquistas, com o progresso de cada uma — a minha e a de um amigo. */
export function ListaDeConquistas({ rows }: { rows: AchievementRow[] }) {
  const feitas = rows.filter((r) => r.done).length;
  return (
    <>
      <div className="field-label" style={{ marginTop: 14 }}>
        Conquistas <small className="muted">({feitas}/{rows.length})</small>
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
    </>
  );
}
