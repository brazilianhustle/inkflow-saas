// ── Generator — modo Coleta v2, fase CADASTRO ─────────────────────────────
import { identidade } from '../../_shared/identidade.js';
import { checklistCritico } from '../../_shared/checklist-critico.js';
import { tom } from '../../_shared/tom.js';
import { contexto } from '../../_shared/contexto.js';
import { faqBlock } from '../../_shared/faq.js';
import { fluxo } from './fluxo.js';
import { regras } from './regras.js';
import { fewShotBase } from './few-shot.js';
import { fewShotTenant } from './few-shot-tenant.js';

export function generatePromptColetaCadastro(tenant, conversa, clientContext) {
  const ctx = clientContext || {};
  const blocks = [
    identidade(tenant),
    checklistCritico(tenant),
    tom(tenant),
    fluxo(tenant, ctx),
    regras(tenant),
    contexto(tenant, conversa, ctx),
    faqBlock(tenant),
    fewShotTenant(tenant),
    fewShotBase(tenant),
  ].filter(b => b && b.trim().length > 0);
  return blocks.join('\n\n---\n\n');
}
