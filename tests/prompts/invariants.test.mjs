// Invariantes que TODO modo deve respeitar, não importa o tenant.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import {
  tenantCanonicoFaixa,
  tenantCanonicoExato,
  conversaVazia,
  clientContextPrimeiroContato,
} from './fixtures/tenant-canonico.js';

const MODOS_SUPORTADOS = [
  { nome: 'faixa', tenant: tenantCanonicoFaixa },
  { nome: 'exato', tenant: tenantCanonicoExato },
];

for (const { nome, tenant } of MODOS_SUPORTADOS) {
  test(`invariante [${nome}]: prompt tem identidade, checklist, tom, contexto, regras, fluxo`, () => {
    const p = generateSystemPrompt(tenant, conversaVazia, clientContextPrimeiroContato);
    assert.ok(p.includes('§0 CHECKLIST'), 'falta §0');
    assert.ok(p.includes('§1 IDENTIDADE'), 'falta §1');
    assert.ok(p.includes('§2 TOM'), 'falta §2');
    assert.ok(p.includes('§3 FLUXO'), 'falta §3');
    assert.ok(p.includes('§4 REGRAS'), 'falta §4');
    assert.ok(p.includes('§5 CONTEXTO'), 'falta §5');
  });

  test(`invariante [${nome}]: prompt não contém metainstruções placeholder`, () => {
    const p = generateSystemPrompt(tenant, conversaVazia, clientContextPrimeiroContato);
    assert.ok(!p.includes('{{'), 'contém {{');
    assert.ok(!p.includes('}}'), 'contém }}');
    assert.ok(!/\bTODO\b/.test(p), 'contém TODO');
    assert.ok(!/\bFIXME\b/.test(p), 'contém FIXME');
  });

  test(`invariante [${nome}]: nome do agente aparece no prompt (identidade)`, () => {
    const p = generateSystemPrompt(tenant, conversaVazia, clientContextPrimeiroContato);
    assert.ok(p.includes(tenant.nome_agente), `nome_agente "${tenant.nome_agente}" não aparece`);
    assert.ok(p.includes(tenant.nome_estudio), `nome_estudio "${tenant.nome_estudio}" não aparece`);
  });

  test(`invariante [${nome}]: gatilhos de handoff aparecem literalmente em §4`, () => {
    const p = generateSystemPrompt(tenant, conversaVazia, clientContextPrimeiroContato);
    for (const gat of tenant.gatilhos_handoff) {
      assert.ok(p.includes(gat), `gatilho "${gat}" não aparece no prompt`);
    }
  });
}

test('invariante cross-mode: Faixa e Exato produzem prompts idênticos no PR 1', () => {
  // PR 1 não diferencia modos. Em PR 2 este teste passa a permitir diferenças
  // específicas (ex: few-shots distintos) e é reescrito pra validar só os
  // shared blocks.
  const pFaixa = generateSystemPrompt(tenantCanonicoFaixa, conversaVazia, clientContextPrimeiroContato);
  const pExato = generateSystemPrompt(tenantCanonicoExato, conversaVazia, clientContextPrimeiroContato);
  assert.equal(pFaixa, pExato);
});
