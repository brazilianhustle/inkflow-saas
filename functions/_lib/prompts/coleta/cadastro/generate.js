// functions/_lib/prompts/coleta/cadastro/generate.js
// Generator — modo Coleta v2, fase CADASTRO (rewrite v2).
// Substitui composicao 9-camadas legacy (que carregava _shared/checklist-critico.js,
// _shared/contexto.js, fluxo.js, regras.js, few-shot.js) por 8 blocos focados em
// cadastro: identidade, contexto slim, objetivo (north-star), decisao (CORE),
// faq (opt), tom, exemplos base (6), exemplos tenant (opt). Pattern Sub-2.
//
// Files legacy (fluxo.js, regras.js, few-shot.js) NAO sao mais importados
// daqui — permanecem no diretorio orfaos (mesma estrategia tattoo Sub-2).
import { identidadeCadastro } from './identidade.js';
import { contextoCadastro } from './contexto.js';
import { OBJETIVO } from './objetivo.js';
import { decisaoCadastro } from './decisao.js';
import { faqCadastro } from './faq.js';
import { tom } from '../../_shared/tom.js';
import { exemplosCadastro } from './exemplos.js';
import { fewShotTenant } from './few-shot-tenant.js';

export function generatePromptColetaCadastro(tenant, conversa, clientContext) {
  const ctx = clientContext || {};
  const blocks = [
    identidadeCadastro(tenant),
    contextoCadastro(tenant, conversa, ctx),
    OBJETIVO,
    decisaoCadastro(tenant),
    faqCadastro(tenant),
    tom(tenant),
    exemplosCadastro(tenant),
    fewShotTenant(tenant),
  ].filter(b => b && b.trim().length > 0);
  return blocks.join('\n\n---\n\n');
}
