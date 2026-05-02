// ── Dispatcher de prompts — substitui generate-prompt.js ────────────────────
// PR 1: roteia faixa/exato. Coleta (modo + estados) chega em PR 2 quando
// flag ENABLE_COLETA_MODE wirar.
import { generatePromptFaixa } from './faixa/generate.js';
import { generatePromptExato } from './exato/generate.js';

export function generateSystemPrompt(tenant, conversa, clientContext) {
  const modo = tenant?.config_precificacao?.modo || 'faixa';
  switch (modo) {
    case 'exato':
      return generatePromptExato(tenant, conversa, clientContext);
    case 'faixa':
    default:
      // Fallback intencional: tenants legados sem `modo` setado caem em Faixa
      // (que era o default historico). Se valor invalido chegar aqui, melhor
      // gerar prompt funcional do que crashar — validacao acontece em
      // update-tenant.js (Task 2).
      return generatePromptFaixa(tenant, conversa, clientContext);
  }
}
