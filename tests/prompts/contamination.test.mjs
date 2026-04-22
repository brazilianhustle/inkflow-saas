// Contamination linter — usa tenant com FAQ/few-shots sujos pra validar
// como cada modo lida com valores monetários vindos do tenant.
//
// PR 1: Faixa e Exato DEIXAM passar o conteúdo sujo (comportamento atual;
// é um prompt de vendas que pode até falar em R$ porque vai calcular valor
// no futuro). O teste documenta isso.
//
// PR 2: modo coleta_info deve bloquear. Esse mesmo arquivo ganha um assert
// negativo pra coleta_info. Mantemos a estrutura simétrica pra facilitar.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import { tenantContaminado } from './fixtures/tenant-contaminado.js';
import { conversaVazia, clientContextPrimeiroContato } from './fixtures/tenant-canonico.js';

test('contaminação [faixa]: FAQ com R$ aparece no prompt (comportamento atual, OK)', () => {
  // Faixa usa FAQ como-é. Se mudar, algo no shared/faq.js regrediu.
  const tenant = { ...tenantContaminado, config_precificacao: { modo: 'faixa' } };
  const p = generateSystemPrompt(tenant, conversaVazia, clientContextPrimeiroContato);
  assert.ok(p.includes('R$ 300'), 'FAQ contaminado deveria aparecer no prompt Faixa');
  assert.ok(p.includes('R$ 500'), 'few-shot contaminado deveria aparecer no prompt Faixa');
});

test('contaminação [exato]: FAQ com R$ aparece no prompt (idem Faixa no PR 1)', () => {
  const tenant = { ...tenantContaminado, config_precificacao: { modo: 'exato' } };
  const p = generateSystemPrompt(tenant, conversaVazia, clientContextPrimeiroContato);
  assert.ok(p.includes('R$ 300'));
  assert.ok(p.includes('R$ 500'));
});

// No PR 2, adicionar:
// test('contaminação [coleta_info]: R$ bloqueado pela regra R3', () => {
//   const tenant = { ...tenantContaminado, config_precificacao: { modo: 'coleta', coleta_submode: 'puro' } };
//   const p = generateSystemPrompt(tenant, null, { is_first_contact: true });
//   assert.ok(p.includes('NÃO repete nem apresenta qualquer valor monetário'));
//   // Asserção importante: mesmo que FAQ mencione R$, o prompt tem regra de topo
//   // que instrui LLM a suprimir. Teste não-determinístico do output do LLM
//   // fica pra evals.
// });
