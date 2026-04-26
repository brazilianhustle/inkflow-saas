// ── Dispatcher público de prompts — InkFlow ────────────────────────────────
// Substitui functions/_lib/generate-prompt.js. API pública:
//   generateSystemPrompt(tenant, conversa, clientContext) -> string
//
// Escolhe o gerador baseado em tenant.config_precificacao.modo. Default 'faixa'
// (compatibilidade com tenants que nunca setaram o campo).
//
// PR 1: só faixa/exato implementados. modo='coleta' é rejeitado upstream em
// update-tenant.js pela feature flag ENABLE_COLETA_MODE.

import { generatePromptFaixa } from './faixa/generate.js';
import { generatePromptExato } from './exato/generate.js';

export function generateSystemPrompt(tenant, conversa, clientContext) {
  const modo = tenant?.config_precificacao?.modo || 'faixa';

  switch (modo) {
    case 'exato':
      return generatePromptExato(tenant, conversa, clientContext);
    case 'faixa':
    default:
      return generatePromptFaixa(tenant, conversa, clientContext);
  }
}
