import { test } from 'node:test';
import assert from 'node:assert/strict';

// Modo Coleta v2: 'faixa' REMOVIDO; 'coleta' default novo; 'exato' beta.
// fewshots_por_modo keys atualizadas: coleta_tattoo, coleta_cadastro, coleta_proposta, exato.

test('validateFieldTypes — fewshots_por_modo aceita objeto com 4 chaves esperadas (v2)', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const ok = validateFieldTypes({
    fewshots_por_modo: { coleta_tattoo: [], coleta_cadastro: [], coleta_proposta: [], exato: [] }
  });
  assert.equal(ok.ok, true);
});

test('validateFieldTypes — fewshots_por_modo rejeita array', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ fewshots_por_modo: [] });
  assert.equal(r.ok, false);
  assert.match(r.erro, /fewshots_por_modo/);
});

test('validateFieldTypes — fewshots_por_modo rejeita chave desconhecida', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ fewshots_por_modo: { coleta_tattoo: [], inventado: [] } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /chave/i);
});

test('validateFieldTypes — fewshots_por_modo rejeita chave legacy "faixa"', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ fewshots_por_modo: { faixa: [], exato: [] } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /chave invalida.*faixa/i);
});

test('validateFieldTypes — fewshots_por_modo aceita objeto vazio (partial update intencional)', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ fewshots_por_modo: {} });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — modo=coleta ACEITO (v2: default novo)', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'coleta' });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — modo=exato ACEITO (v2: beta secundário)', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'exato' });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — modo=faixa REJEITADO (v2: removido)', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'faixa' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /faixa removido/i);
});

test('validateConfigPrecificacao — modo invalido rejeitado', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'inventado' });
  assert.equal(r.ok, false);
});

test('validateConfigPrecificacao — config sem modo OK (partial update)', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ sinal_percentual: 30 });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — coleta_submode legacy v1 ignorado (não rejeita)', async () => {
  // v2 só tem reentrada e callback Telegram. Migration apaga esses campos.
  // Validação não rejeita pra não quebrar payloads em flight.
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'coleta', coleta_submode: 'puro' });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — trigger_handoff legacy v1 ignorado', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'coleta', trigger_handoff: 'qualquer coisa' });
  assert.equal(r.ok, true);
});
