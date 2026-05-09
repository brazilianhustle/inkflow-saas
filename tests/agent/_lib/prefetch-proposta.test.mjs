// tests/agent/_lib/prefetch-proposta.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { prefetchPropostaContext } from '../../../functions/api/agent/_lib/prefetch-proposta.js';

test('prefetchPropostaContext em propondo_valor: chama consultar-horarios + retorna horarios_livres', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetchMock = mock.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, slots: [{ inicio: 'a', fim: 'b', legenda: 'x' }] }),
  }));
  globalThis.fetch = fetchMock;

  const env = { INKFLOW_TOOL_SECRET: 'sek' };
  const tenant = { id: 't1' };
  const conversa = { valor_proposto: 750, dados_coletados: { decisao_desconto: null } };
  const r = await prefetchPropostaContext({ env, tenant, conversa, telefone: '5511', estado_atual: 'propondo_valor' });

  assert.equal(r.valor_proposto, 750);
  assert.equal(r.decisao_desconto, null);
  assert.deepEqual(r.horarios_livres, [{ inicio: 'a', fim: 'b', legenda: 'x' }]);
  assert.match(fetchMock.mock.calls[0].arguments[0], /\/api\/tools\/consultar-horarios/);
  // NAO deve passar telefone (evita side-effect bumpEstadoEscolhendo)
  const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
  assert.equal(body.telefone, undefined);
});

test('prefetchPropostaContext em escolhendo_horario: refetch slots, sem proposta_status', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, slots: [] }),
  }));

  const env = { INKFLOW_TOOL_SECRET: 'sek' };
  const r = await prefetchPropostaContext({
    env, tenant: { id: 't1' }, conversa: {}, telefone: '5511',
    estado_atual: 'escolhendo_horario',
  });
  assert.deepEqual(r.horarios_livres, []);
  assert.equal(r.proposta_status, undefined);
});

test('prefetchPropostaContext em aguardando_sinal: chama consultar-proposta-tatuador com telefone', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const fetchMock = mock.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, status: 'aguardando_pgto' }),
  }));
  globalThis.fetch = fetchMock;

  const env = { INKFLOW_TOOL_SECRET: 'sek' };
  const r = await prefetchPropostaContext({
    env, tenant: { id: 't1' }, conversa: {}, telefone: '5511999',
    estado_atual: 'aguardando_sinal',
  });
  assert.equal(r.proposta_status, 'aguardando_pgto');
  assert.equal(r.horarios_livres, undefined);
  const url = fetchMock.mock.calls[0].arguments[0];
  assert.match(url, /\/api\/tools\/consultar-proposta-tatuador/);
  const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
  assert.deepEqual(body, { tenant_id: 't1', telefone: '5511999' });
});

test('prefetchPropostaContext: horarios_livres vira [] se tool retornar !ok', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = mock.fn(async () => ({
    ok: false, status: 500, json: async () => ({ ok: false }),
  }));

  const env = { INKFLOW_TOOL_SECRET: 'sek' };
  const r = await prefetchPropostaContext({
    env, tenant: { id: 't1' }, conversa: { valor_proposto: 100 }, telefone: '55',
    estado_atual: 'propondo_valor',
  });
  assert.deepEqual(r.horarios_livres, []);
});
