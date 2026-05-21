// tests/agent/_lib/format-link-sinal-msg.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLinkSinalMessage, formatPixSinalMessage } from '../../../functions/api/agent/_lib/format-link-sinal-msg.js';

test('formatLinkSinalMessage: 3 partes separadas por linha em branco com URL crua', () => {
  const out = formatLinkSinalMessage({
    agent_text: 'Bora marcar!',
    sinal_pct: 30,
    valor_sinal: 225,
    link_pagamento: 'https://mpago.la/abc123',
    hold_horas: 24,
  });
  assert.equal(
    out,
    'Bora marcar!\n\n' +
    'Pra agendar a gente trabalha com sinal de 30% do valor, fica em R$ 225,00.\n\n' +
    'https://mpago.la/abc123\n\n' +
    'O link tem validade de 24 horas. Se expirar, so me chamar que envio outro.'
  );
});

test('formatLinkSinalMessage: formata BRL com virgula decimal', () => {
  const out = formatLinkSinalMessage({
    agent_text: 'Bora!',
    sinal_pct: 30,
    valor_sinal: 333.5,
    link_pagamento: 'https://mp/x',
    hold_horas: 24,
  });
  assert.match(out, /R\$ 333,50/);
});

test('formatLinkSinalMessage: omite prefix se agent_text vazio', () => {
  const out = formatLinkSinalMessage({
    agent_text: '',
    sinal_pct: 30,
    valor_sinal: 100,
    link_pagamento: 'https://mp/y',
    hold_horas: 24,
  });
  assert.equal(out.startsWith('Pra agendar'), true);
});

test('formatLinkSinalMessage: NAO inclui markdown link (URL crua)', () => {
  const out = formatLinkSinalMessage({
    agent_text: 'oi',
    sinal_pct: 30,
    valor_sinal: 100,
    link_pagamento: 'https://mp/z',
    hold_horas: 24,
  });
  assert.doesNotMatch(out, /\]\(http/);
  assert.doesNotMatch(out, /\[.*\]\(/);
});

test('formatPixSinalMessage: copia-e-cola em balão próprio, sem markdown, 2 balões', () => {
  const out = formatPixSinalMessage({
    agent_text: '',
    sinal_pct: 30,
    valor_sinal: 210,
    copia_e_cola: '00020126XXXBR.GOV.BCB.PIX',
    hold_horas: 48,
  });
  const baloes = out.split(/\n\s*\n/);
  assert.equal(baloes.length, 2);                       // texto + código
  assert.equal(baloes[1], '00020126XXXBR.GOV.BCB.PIX'); // balão do código, cru
  assert.match(baloes[0], /R\$ 210,00/);
  assert.doesNotMatch(out, /[*_`]/);                    // sem markdown
});

test('formatPixSinalMessage: com agent_text vira 3 balões (prefixo natural do bot)', () => {
  const out = formatPixSinalMessage({
    agent_text: 'Show, reservei teu horario!',
    sinal_pct: 30, valor_sinal: 210, copia_e_cola: 'PIX-CODE', hold_horas: 48,
  });
  const baloes = out.split(/\n\s*\n/);
  assert.equal(baloes.length, 3);
  assert.equal(baloes[0], 'Show, reservei teu horario!');
  assert.equal(baloes[2], 'PIX-CODE');
});
