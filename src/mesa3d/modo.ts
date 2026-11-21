/**
 * A mesa da partida é 3D quando o aparelho desenha WebGL.
 *
 * Sem WebGL (um navegador sem aceleração, os testes em Node/jsdom) a mesa continua sendo a 2D de
 * antes: a partida não pode deixar de abrir porque o 3D não abriu. `?mesa=2d` no endereço força a
 * 2D (para comparar e para depurar).
 */
let resposta: boolean | null = null;

export function usar3D(): boolean {
  if (resposta !== null) return resposta;
  resposta = detectar();
  return resposta;
}

function detectar(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (typeof WebGLRenderingContext === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('mesa') === '2d') return false;
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return false;
    // (devolve o contexto: o de verdade é o do canvas da mesa)
    (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
