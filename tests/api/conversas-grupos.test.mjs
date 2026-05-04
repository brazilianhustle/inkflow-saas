import { test } from 'node:test';
import assert from 'node:assert/strict';

test('getGrupoFilter("hoje") — retorna estados de coleta + filtro last_msg_at hoje BRT', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('hoje');
  assert.deepEqual(r.estados, ['coletando_tattoo', 'coletando_cadastro', 'escolhendo_horario', 'aguardando_sinal']);
  assert.ok(r.last_msg_at_gte, 'deve incluir filtro last_msg_at_gte');
  assert.match(r.last_msg_at_gte, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

test('getGrupoFilter("aguardando") — estados de espera por tatuador', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('aguardando');
  assert.deepEqual(r.estados, ['aguardando_tatuador', 'aguardando_decisao_desconto']);
  assert.equal(r.last_msg_at_gte, undefined);
});

test('getGrupoFilter("negociacao") — propondo + lead_frio + pausada_tatuador', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('negociacao');
  assert.deepEqual(r.estados, ['propondo_valor', 'lead_frio', 'pausada_tatuador']);
});

test('getGrupoFilter("historico") — só fechado', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('historico');
  assert.deepEqual(r.estados, ['fechado']);
});

test('getGrupoFilter("invalid") — retorna null (caller decide 400)', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  assert.equal(getGrupoFilter('invalid'), null);
  assert.equal(getGrupoFilter(''), null);
  assert.equal(getGrupoFilter(null), null);
  assert.equal(getGrupoFilter(undefined), null);
});

test('getGrupoFilter("hoje") — last_msg_at_gte é hoje 00:00 timezone São Paulo, expressed em UTC', async () => {
  const { getGrupoFilter } = await import('../../functions/api/conversas/_grupos.js');
  const r = getGrupoFilter('hoje');
  // BRT é UTC-3 ano-redondo (sem DST desde 2019). Então 00:00 BRT = 03:00 UTC.
  assert.ok(r.last_msg_at_gte.endsWith('T03:00:00.000Z') || r.last_msg_at_gte.endsWith('T03:00:00Z'),
    `Esperava ISO terminando em T03:00:00Z, recebi: ${r.last_msg_at_gte}`);
});
