import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { sfx } from '../audio/sfx';
import { fmt } from '../util/format';
import {
  ALTURA,
  ALTURA_LINHA,
  ATIRADOR,
  ERROS_ATE_DESCER,
  LARGURA,
  LINHA_LIMITE,
  PALETA,
  R,
  anguloPara,
  atirar,
  avancar,
  centro,
  coresNaGrade,
  criar,
  empurrar,
  mira,
  pousar,
  ultimaLinha,
  vazia,
  type Grade,
  type Voo,
} from './bolhas';
import { gravarRecorde, lerRecorde } from './recorde';

/** Onde fica a próxima bolha (clicar nela troca com a atual). */
const PROXIMA = { x: ATIRADOR.x - 78, y: ATIRADOR.y + 18 };

/** A grade de cada nível: mais linhas e mais cores conforme avança. */
function nivelNovo(n: number): { grade: Grade; cores: number } {
  const cores = Math.min(PALETA.length, 3 + n);
  return { grade: criar(Math.min(9, 5 + n), cores), cores };
}

interface Particula {
  x: number;
  y: number;
  vx: number;
  vy: number;
  cor: number;
  /** 'estouro' cresce e some; 'queda' cai com a gravidade. */
  tipo: 'estouro' | 'queda';
  t: number;
}

/** Uma bolha brilhante: o degradê de dentro, a borda mais escura e o reflexo no alto. */
function bolha(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, cor: string, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.28, cor);
  g.addColorStop(0.85, cor);
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r - 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.32, y - r * 0.45, r * 0.32, r * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function JogoBolhas({ onSair }: { onSair: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const inicio = useRef(nivelNovo(1));
  // o estado do jogo mora em refs: o laço de desenho lê e escreve 60 vezes por segundo
  const jogo = useRef({
    grade: inicio.current.grade,
    cores: inicio.current.cores,
    atual: 0,
    proxima: 0,
    angulo: Math.PI / 2,
    voo: null as Voo | null,
    particulas: [] as Particula[],
    erros: 0,
    pontos: 0,
    nivel: 1,
    fim: false,
    raios: 0,
  });
  const [hud, setHud] = useState({ pontos: 0, nivel: 1, fim: false, venceuNivel: 0 });
  const [recorde, setRecorde] = useState(() => lerRecorde('bolhas'));
  const [novoRecorde, setNovoRecorde] = useState(false);

  const sortear = () => {
    const j = jogo.current;
    const cores = coresNaGrade(j.grade);
    const lista = cores.length ? cores : Array.from({ length: j.cores }, (_, i) => i);
    return lista[Math.floor(Math.random() * lista.length)];
  };

  const comecar = () => {
    const n = nivelNovo(1);
    Object.assign(jogo.current, { grade: n.grade, cores: n.cores, voo: null, particulas: [], erros: 0, pontos: 0, nivel: 1, fim: false });
    jogo.current.atual = sortear();
    jogo.current.proxima = sortear();
    setHud({ pontos: 0, nivel: 1, fim: false, venceuNivel: 0 });
    setNovoRecorde(false);
  };

  useEffect(() => {
    jogo.current.atual = sortear();
    jogo.current.proxima = sortear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // o laço: anda o voo, as partículas e desenha
  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = LARGURA * dpr;
    cv.height = ALTURA * dpr;
    let raf = 0;
    let antes = performance.now();

    const pousou = (casa: { r: number; c: number }) => {
      const j = jogo.current;
      const res = pousar(j.grade, casa, j.atual);
      j.grade = res.grade;
      for (const q of res.estouradas) {
        const p = centro(j.grade, q.r, q.c);
        j.particulas.push({ x: p.x, y: p.y, vx: 0, vy: 0, cor: j.atual, tipo: 'estouro', t: 0 });
      }
      for (const q of res.caidas) {
        const p = centro(j.grade, q.casa.r, q.casa.c);
        j.particulas.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 180, cor: q.cor, tipo: 'queda', t: 0 });
      }
      if (res.estouradas.length) {
        j.erros = 0;
        j.pontos += res.pontos;
        sfx.estourar(res.estouradas.length);
        if (res.caidas.length) sfx.cair(res.caidas.length);
      } else {
        sfx.gruda();
        if (++j.erros >= ERROS_ATE_DESCER) {
          j.erros = 0;
          j.grade = empurrar(j.grade, j.cores);
          sfx.descer();
        }
      }
      if (vazia(j.grade)) {
        // limpou a grade: bônus e o próximo nível
        const bonus = 500 * j.nivel;
        j.pontos += bonus;
        j.nivel++;
        const n = nivelNovo(j.nivel);
        j.grade = n.grade;
        j.cores = n.cores;
        j.erros = 0;
        sfx.win();
        setHud((h) => ({ ...h, venceuNivel: j.nivel }));
        setTimeout(() => setHud((h) => ({ ...h, venceuNivel: 0 })), 1600);
      } else if (ultimaLinha(j.grade) >= LINHA_LIMITE) {
        j.fim = true;
        sfx.lose();
      }
      j.atual = j.proxima;
      // a bolha da vez sempre tem uma cor que ainda está na grade
      if (!coresNaGrade(j.grade).includes(j.atual)) j.atual = sortear();
      j.proxima = sortear();
      setHud((h) => ({ ...h, pontos: j.pontos, nivel: j.nivel, fim: j.fim }));
    };

    const quadro = (agora: number) => {
      const dt = Math.min(1 / 30, (agora - antes) / 1000);
      antes = agora;
      const j = jogo.current;
      j.raios += dt * 0.08;

      if (j.voo) {
        const r = avancar(j.grade, j.voo, dt);
        j.voo = r.voo;
        if (r.parou) {
          j.voo = null;
          pousou(r.parou);
        }
      }
      for (const p of j.particulas) {
        p.t += dt;
        if (p.tipo === 'queda') {
          p.vy += 1400 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      }
      j.particulas = j.particulas.filter((p) => (p.tipo === 'estouro' ? p.t < 0.3 : p.y < ALTURA + R));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // o fundo: o azul fundo com os raios saindo do atirador
      const fundo = ctx.createLinearGradient(0, 0, 0, ALTURA);
      fundo.addColorStop(0, '#0b1f8f');
      fundo.addColorStop(1, '#2350e6');
      ctx.fillStyle = fundo;
      ctx.fillRect(0, 0, LARGURA, ALTURA);
      ctx.save();
      ctx.translate(ATIRADOR.x, ATIRADOR.y);
      ctx.rotate(Math.sin(j.raios) * 0.12);
      ctx.fillStyle = 'rgba(160, 200, 255, 0.10)';
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI + (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, ALTURA * 1.4, a, a + Math.PI / 24);
        ctx.fill();
      }
      ctx.restore();

      // a linha que não pode ser cruzada
      const yLimite = R + LINHA_LIMITE * ALTURA_LINHA - R;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, yLimite);
      ctx.lineTo(LARGURA, yLimite);
      ctx.stroke();
      ctx.restore();

      // a grade
      j.grade.linhas.forEach((l, r) =>
        l.forEach((c0, c) => {
          if (c0 == null) return;
          const p = centro(j.grade, r, c);
          bolha(ctx, p.x, p.y, R, PALETA[c0]);
        }),
      );

      // a mira: bolinhas até a primeira batida
      if (!j.voo && !j.fim) {
        const pts = mira(j.grade, j.angulo);
        ctx.fillStyle = PALETA[j.atual];
        let resto = 0;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          let s = resto;
          for (; s < d; s += 16) {
            const k = s / d;
            ctx.globalAlpha = 0.75;
            ctx.beginPath();
            ctx.arc(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 3.2, 0, Math.PI * 2);
            ctx.fill();
          }
          // o espaçamento continua do mesmo jeito depois da tabela
          resto = s - d;
        }
        ctx.globalAlpha = 1;
      }

      // as partículas
      for (const p of j.particulas) {
        if (p.tipo === 'estouro') {
          const k = p.t / 0.3;
          bolha(ctx, p.x, p.y, R * (1 + k * 0.6), PALETA[p.cor], 1 - k);
        } else bolha(ctx, p.x, p.y, R, PALETA[p.cor]);
      }

      // o atirador: a base, a bolha da vez e a próxima
      ctx.fillStyle = 'rgba(0, 10, 60, 0.35)';
      ctx.beginPath();
      ctx.ellipse(ATIRADOR.x, ATIRADOR.y + R + 6, R * 1.9, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      if (j.voo) bolha(ctx, j.voo.x, j.voo.y, R, PALETA[j.atual]);
      else if (!j.fim) bolha(ctx, ATIRADOR.x, ATIRADOR.y, R * 1.15, PALETA[j.atual]);
      bolha(ctx, PROXIMA.x, PROXIMA.y, R * 0.75, PALETA[j.proxima]);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '600 11px "M PLUS Rounded 1c", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('próxima', PROXIMA.x, PROXIMA.y + R + 8);

      // os tiros que faltam até a grade descer
      for (let i = 0; i < ERROS_ATE_DESCER; i++) {
        ctx.beginPath();
        ctx.fillStyle = i < ERROS_ATE_DESCER - j.erros ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.18)';
        ctx.arc(ATIRADOR.x + 62 + i * 14, ATIRADOR.y + 24, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(quadro);
    };
    raf = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // acabou: guarda o recorde
  useEffect(() => {
    if (!hud.fim) return;
    if (hud.pontos > recorde) {
      gravarRecorde('bolhas', hud.pontos);
      setRecorde(hud.pontos);
      setNovoRecorde(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hud.fim]);

  const ponto = (e: { clientX: number; clientY: number }) => {
    const box = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - box.left) / box.width) * LARGURA, y: ((e.clientY - box.top) / box.height) * ALTURA };
  };
  const trocar = () => {
    const j = jogo.current;
    [j.atual, j.proxima] = [j.proxima, j.atual];
    sfx.hover();
  };
  const disparar = () => {
    const j = jogo.current;
    if (j.voo || j.fim) return;
    j.voo = atirar(j.angulo);
    sfx.tiro();
  };

  // teclado: setas miram, espaço atira, X troca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const j = jogo.current;
      if (e.key === 'ArrowLeft') j.angulo = Math.min(Math.PI - 0.14, j.angulo + 0.04);
      else if (e.key === 'ArrowRight') j.angulo = Math.max(0.14, j.angulo - 0.04);
      else if (e.key === ' ') disparar();
      else if (e.key.toLowerCase() === 'x') trocar();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mj-bolhas">
      <aside className="panel mj-lado">
        <div className="mj-placar">
          <small>Pontos</small>
          <b>{fmt(hud.pontos)}</b>
        </div>
        <div className="mj-jogadas">
          <small>Nível</small>
          <b>{hud.nivel}</b>
        </div>
        <div className="mj-recorde">
          Recorde <b>{fmt(recorde)}</b>
        </div>
        <div className="mj-botoes">
          <button className="btn btn-ghost small" onClick={comecar}>
            ↻ Recomeçar
          </button>
        </div>
        <p className="muted small mj-ajuda">
          Mire com o mouse e clique para atirar. Três ou mais da mesma cor estouram — e o que ficar pendurado cai junto. Clique na próxima bolha para
          trocar. A cada {ERROS_ATE_DESCER} tiros sem estourar nada, a grade desce uma linha.
        </p>
        <p className="muted small mj-ajuda">Teclado: setas miram, espaço atira, X troca.</p>
      </aside>

      <div className="mj-bolhas-palco">
        <canvas
          ref={canvas}
          className="mj-canvas"
          style={{ aspectRatio: `${LARGURA} / ${ALTURA}` }}
          onPointerMove={(e) => {
            const p = ponto(e);
            jogo.current.angulo = anguloPara(p.x, p.y);
          }}
          onPointerDown={(e) => {
            const p = ponto(e);
            if (Math.hypot(p.x - PROXIMA.x, p.y - PROXIMA.y) < R * 1.4) trocar();
            else {
              jogo.current.angulo = anguloPara(p.x, p.y);
              disparar();
            }
          }}
        />
        <AnimatePresence>
          {hud.venceuNivel > 0 && (
            <motion.div className="mj-nivel" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0, y: -20 }}>
              Nível {hud.venceuNivel}!
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {hud.fim && (
            <motion.div className="mj-fim-fundo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="panel mj-fim" initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}>
                <h2 className="title-deco">As bolhas chegaram</h2>
                <div className="mj-fim-pontos">{fmt(hud.pontos)} pontos</div>
                <div className="muted">Até o nível {hud.nivel}</div>
                {novoRecorde && <div className="mj-fim-recorde">Novo recorde!</div>}
                <div className="row gap center" style={{ marginTop: 16 }}>
                  <button className="btn btn-gold" onClick={comecar}>
                    Jogar de novo
                  </button>
                  <button className="btn btn-ghost" onClick={onSair}>
                    Outros minijogos
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
