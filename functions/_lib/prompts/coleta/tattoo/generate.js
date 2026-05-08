// Generator — modo Coleta v2, fase TATTOO (rewrite v2).
// Substitui composicao 10-camadas (que carregava _shared/checklist-critico.js
// e _shared/contexto.js cheias de legacy n8n) por 8 blocos focados em coleta:
// identidade, contexto slim, objetivo (north-star), decisao (CORE), faq (opt),
// tom, exemplos base (8), exemplos tenant (opt). Reducao ~3860 -> ~1880 tokens.
//
// Files legacy (regras.js, fluxo.js, few-shot.js) NAO sao mais importados
// daqui — permanecem no diretorio sem importer ate Sub-3 cuidar.
import { identidadeTattoo } from './identidade.js';
import { contextoTattoo } from './contexto.js';
import { OBJETIVO } from './objetivo.js';
import { decisaoTattoo } from './decisao.js';
import { faqTattoo } from './faq.js';
import { tom } from '../../_shared/tom.js';
import { exemplosTattoo } from './exemplos.js';
import { fewShotTenant } from './few-shot-tenant.js';

export function generatePromptColetaTattoo(tenant, conversa, clientContext) {
  const ctx = clientContext || {};
  const blocks = [
    identidadeTattoo(tenant),
    contextoTattoo(tenant, conversa, ctx),
    OBJETIVO,
    decisaoTattoo(tenant),
    faqTattoo(tenant),
    tom(tenant),
    exemplosTattoo(tenant),
    fewShotTenant(tenant),
  ].filter(b => b && b.trim().length > 0);
  return blocks.join('\n\n---\n\n');
}
