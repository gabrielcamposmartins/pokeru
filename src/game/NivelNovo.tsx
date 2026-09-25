/**
 * Subiu de nível: a mesma cena da revelação da roleta, com o número novo no lugar do prêmio.
 *
 * A tela some, a Luz Sagrada abre na cor da dezena e o número se materializa com uma seta para
 * cima — ele não aparece, ele **vira** número, como o prêmio do ticket. Embaixo vem o que o nível
 * novo abriu (as dificuldades contra bots), para a subida não ser só um algarismo maior.
 *
 * O nível sobe no meio de uma mão (cada mão rende experiência), e a cena não pode cobrir a mesa
 * nessa hora: ela espera a partida acabar — ou a pessoa sair da mesa — para aparecer. Quem descobre
 * a subida é a sessão, comparando a foto nova da conta com a anterior (veja `nivelSubiu`).
 */

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { BOT_TIERS } from '../../shared/protocol';
import { LevelNumber, levelColor } from '../render/Level';
import { LuzDoPremio } from '../render/Luz';
import { Sparks } from '../render/Sparks';
import { useSession } from '../store/session';
import { useTable } from '../store/table';
import { useNivelNovo } from '../store/nivel';
import { sfx } from '../audio/sfx';
import { fmt } from '../util/format';

/** O que abriu entre um nível e outro (as dificuldades contra bots). */
export function desbloqueiosEntre(de: number, para: number): { titulo: string; detalhe: string }[] {
  return BOT_TIERS.filter((t) => t.level > de && t.level <= para).map((t) => ({
    titulo: `Contra Bots: ${t.label}`,
    detalhe: `Mesa de ${fmt(t.mesa.stack)} e blinds ${fmt(t.mesa.smallBlind)}/${fmt(t.mesa.bigBlind)}`,
  }));
}

/** A cena em si (sem loja: é o que o preview desenha). */
export function NivelNovoView({ de, para, onClose }: { de: number; para: number; onClose: () => void }) {
  const cor = levelColor(para);
  const abriu = desbloqueiosEntre(de, para);
  const numero = (
    <span className="nivel-novo-numero">
      <LevelNumber level={para} size={150} />
      <i className="nivel-novo-seta" aria-hidden>
        ▲
      </i>
    </span>
  );
  return (
    <div className="giro-cena nivel-novo" onClick={onClose}>
      <div className="giro-fundo" />
      <motion.div className="giro-meio" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
        <Sparks color={cor} count={16} rise={90} spread={160} size={5} />
        <div className="giro-premio nivel-novo-palco" style={{ color: cor }}>
          <LuzDoPremio />
          {/* o número se materializa: a mesma arte duas vezes, e a de cima, branca, se dissolve */}
          <span className="giro-arte">
            {numero}
            <span className="giro-branco" aria-hidden>
              {numero}
            </span>
          </span>
        </div>
        <h2 className="title-deco">Subiu de nível!</h2>
        <div className="giro-linha">
          {para - de > 1 ? (
            <>
              Do nível <b>{de}</b> direto para o <b>{para}</b>
            </>
          ) : (
            <>
              Agora você está no nível <b>{para}</b>
            </>
          )}
        </div>
        {abriu.length > 0 && (
          <div className="nivel-novo-abriu">
            <small>Desbloqueado</small>
            {abriu.map((d) => (
              <span key={d.titulo} className="nivel-novo-item">
                <b>🔓 {d.titulo}</b>
                <i>{d.detalhe}</i>
              </span>
            ))}
          </div>
        )}
        <button
          className="btn btn-gold"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          Continuar
        </button>
      </motion.div>
    </div>
  );
}

/**
 * A cena ligada na sessão: aparece quando há subida pendente e ninguém está no meio de uma mão.
 *
 * A música é a da roleta, tocada no instante em que a cena entra — não quando o nível subiu, que
 * pode ter sido três mãos atrás.
 */
export function NivelNovoCena() {
  const pendente = useNivelNovo((s) => s.pendente);
  const fechar = useNivelNovo((s) => s.fechar);
  const emJogo = useSession((s) => !!s.room && s.room.status === 'playing');
  const abrindo = useTable((s) => !!s.opening);
  const visivel = !!pendente && !emJogo && !abrindo;
  if (!visivel) return null;
  return (
    <NivelNovoSom
      key={`${pendente.de}-${pendente.para}`}
      de={pendente.de}
      para={pendente.para}
      onClose={() => {
        sfx.click();
        fechar();
      }}
    />
  );
}

/** Toca a música uma vez, ao montar, e desenha a cena. */
function NivelNovoSom({ de, para, onClose }: { de: number; para: number; onClose: () => void }) {
  // a trava é no ref: em StrictMode o efeito roda duas vezes na montagem, e a música tocaria dobrada
  const tocou = useRef(false);
  useEffect(() => {
    if (tocou.current) return;
    tocou.current = true;
    sfx.revelar();
  }, []);
  return <NivelNovoView de={de} para={para} onClose={onClose} />;
}
