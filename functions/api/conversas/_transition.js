// ── InkFlow — Pure state transition logic (testable) ──
// Usado por assumir.js, devolver.js e auto-retomar-bot.js (Task 6).
// Stateless: caller é responsável por aplicar o resultado no DB.

export function applyTransition({ estado_atual, action, estado_agente_anterior = null }) {
  if (action === 'pause') {
    if (estado_atual === 'pausada_tatuador') return { action: 'noop' };
    return {
      action: 'apply',
      new_state: 'pausada_tatuador',
      estado_agente_anterior: estado_atual,
      pausada_em: new Date().toISOString(),
    };
  }

  if (action === 'resume') {
    if (estado_atual !== 'pausada_tatuador') return { action: 'noop' };
    const restored = estado_agente_anterior || 'ativo';
    return {
      action: 'apply',
      new_state: restored,
      estado_agente_anterior: null,
      pausada_em: null,
    };
  }

  return { action: 'noop' };
}
