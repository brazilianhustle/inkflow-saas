// functions/_lib/prompts/coleta/proposta/generate.js
// Generator — modo Coleta v2, fase PROPOSTA (Sub-3.2 v2 rewrite).
// Substitui composicao 5-camadas legacy (fluxo, regras com T1-T5 tools,
// few-shot, few-shot-tenant) por 8 blocos focados em pure
// structured-output: identidade, contexto, objetivo, faq, fluxo slim,
// decisao (CORE), exemplos, few-shot-tenant. Pattern Sub-2/3.1.
//
// Files legacy (regras.js, few-shot.js) NAO sao mais importados —
// permanecem orfaos no diretorio.
import { identidadeProposta } from './identidade.js';
import { contextoProposta } from './contexto.js';
import { OBJETIVO_PROPOSTA } from './objetivo.js';
import { faqProposta } from './faq.js';
import { fluxoProposta } from './fluxo.js';
import { decisaoProposta } from './decisao.js';
import { exemplosProposta } from './exemplos.js';
import { fewShotTenant } from './few-shot-tenant.js';

export function generatePromptColetaProposta(tenant, conversa, clientContext) {
  const ctx = clientContext || {};
  const blocks = [
    identidadeProposta(tenant),
    contextoProposta(tenant, conversa, ctx),
    OBJETIVO_PROPOSTA,
    faqProposta(tenant),
    fluxoProposta(tenant, ctx),
    decisaoProposta(tenant),
    exemplosProposta(tenant),
    fewShotTenant(tenant),
  ].filter(b => b && b.trim().length > 0);
  return blocks.join('\n\n---\n\n');
}
