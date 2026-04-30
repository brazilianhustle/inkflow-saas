import { test } from 'node:test';
import assert from 'node:assert/strict';

// Importar a função interna validateFieldTypes via dynamic import depois
// que ela for exportada. Por enquanto, declarar shape esperado.

test('validateFieldTypes — fewshots_por_modo aceita objeto com 4 chaves esperadas', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const ok = validateFieldTypes({
    fewshots_por_modo: { faixa: [], exato: [], coleta_info: [], coleta_agendamento: [] }
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
  const r = validateFieldTypes({ fewshots_por_modo: { faixa: [], inventado: [] } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /chave/i);
});

test('validateFieldTypes — fewshots_por_modo aceita objeto vazio (partial update intencional)', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ fewshots_por_modo: {} });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — modo=coleta REJEITADO em PR 1 (flag virá em PR 2)', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'coleta' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /modo coleta ainda nao disponivel/i);
});

test('validateConfigPrecificacao — modo=faixa OK', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'faixa' });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — modo invalido rejeitado', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'inventado' });
  assert.equal(r.ok, false);
});

test('validateConfigPrecificacao — coleta_submode aceito como schema (sem modo=coleta ainda)', async () => {
  // Campos forward-compat: persistem mas só ativam em PR 2.
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'faixa', coleta_submode: 'puro' });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — trigger_handoff rejeita length 1 (abaixo do minimo)', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'faixa', trigger_handoff: 'X' });
  assert.equal(r.ok, false);
});

test('validateConfigPrecificacao — trigger_handoff aceita length 2 (limite inferior)', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'faixa', trigger_handoff: 'AB' });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — trigger_handoff aceita length 50 (limite superior)', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'faixa', trigger_handoff: 'A'.repeat(50) });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — trigger_handoff rejeita length 51 (acima do maximo)', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'faixa', trigger_handoff: 'A'.repeat(51) });
  assert.equal(r.ok, false);
});

test('validateConfigPrecificacao — trigger_handoff aceita string mid-range valida', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'faixa', trigger_handoff: 'Lina, assume' });
  assert.equal(r.ok, true);
});
