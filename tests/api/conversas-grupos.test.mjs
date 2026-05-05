import { test } from 'node:test';
import assert from 'node:assert/strict';

test('getGrupoFilter("hoje") — 2 listas: agente (coleta) + workflow (agenda) + filtro hoje BRT', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('hoje');
  assert.deepEqual(r.estados_agente, ['coletando_tattoo', 'coletando_cadastro']);
  assert.deepEqual(r.estados, ['escolhendo_horario', 'aguardando_sinal']);
  assert.ok(r.last_msg_at_gte, 'deve incluir filtro last_msg_at_gte');
  assert.match(r.last_msg_at_gte, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

test('getGrupoFilter("aguardando") — só estados_agente, estados vazio', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('aguardando');
  assert.deepEqual(r.estados_agente, ['aguardando_tatuador', 'aguardando_decisao_desconto']);
  assert.deepEqual(r.estados, []);
  assert.equal(r.last_msg_at_gte, undefined);
});

test('getGrupoFilter("negociacao") — propondo + lead_frio + pausada_tatuador (single col)', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('negociacao');
  assert.deepEqual(r.estados_agente, ['propondo_valor', 'lead_frio', 'pausada_tatuador']);
  assert.deepEqual(r.estados, []);
});

test('getGrupoFilter("historico") — só fechado em estados_agente', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('historico');
  assert.deepEqual(r.estados_agente, ['fechado']);
  assert.deepEqual(r.estados, []);
});

test('getGrupoFilter("invalid") — retorna null (caller decide 400)', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  assert.equal(getGrupoFilter('invalid'), null);
  assert.equal(getGrupoFilter(''), null);
  assert.equal(getGrupoFilter(null), null);
  assert.equal(getGrupoFilter(undefined), null);
});

test('getGrupoFilter("hoje") — last_msg_at_gte é 00:00 BRT em UTC (T03:00:00Z)', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('hoje');
  assert.ok(
    r.last_msg_at_gte.endsWith('T03:00:00.000Z') || r.last_msg_at_gte.endsWith('T03:00:00Z'),
    `Esperava ISO terminando em T03:00:00Z, recebi: ${r.last_msg_at_gte}`
  );
});

test('getGrupoFilter — caso aguardando: estados vazio + estados_agente cheio (forma assimétrica)', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('aguardando');
  assert.equal(r.estados_agente.length > 0, true, 'estados_agente deve ter itens');
  assert.equal(r.estados.length, 0, 'estados deve ser vazio (caller usa forma direta)');
});

test('GRUPOS_VALIDOS — exporta lista dos 4 grupos', async () => {
  const { GRUPOS_VALIDOS } = await import('../../functions/api/conversas/_grupos.js');
  assert.deepEqual(GRUPOS_VALIDOS, ['hoje', 'aguardando', 'negociacao', 'historico']);
});
