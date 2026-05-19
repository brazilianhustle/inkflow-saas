import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefetchPropostaContext } from '../../functions/api/agent/_lib/prefetch-proposta.js';

// Mock minimo de callTool via override do modulo — testar com env stub.
// Como callTool() chama fetch, usar wrapper test-aware: prefetchPropostaContext
// nao injeta deps; usaremos fetch global override.
const ORIG_FETCH = globalThis.fetch;

function mockFetch(handlers) {
  return async (url, init) => {
    const u = typeof url === 'string' ? url : url.toString();
    const matched = Object.keys(handlers).find(k => u.includes(k));
    if (!matched) throw new Error(`unmocked fetch: ${u}`);
    return new Response(JSON.stringify(handlers[matched]), { status: 200 });
  };
}

test.beforeEach(() => { globalThis.fetch = ORIG_FETCH; });

test('prefetchPropostaContext: aguardando_sinal retorna slots_reservados E proposta_status', async () => {
  globalThis.fetch = mockFetch({
    'consultar-proposta-tatuador': {
      ok: true,
      status: 'aguardando_sinal',
      slots_reservados: [
        { inicio: '2026-05-14T13:00:00Z', fim: '2026-05-14T16:00:00Z', agendamento_id: 'agd-001' },
      ],
    },
  });
  const ctx = await prefetchPropostaContext({
    env: { INKFLOW_TOOL_SECRET: 'stub', AGENT_INTERNAL_BASE_URL: 'https://stub' },
    tenant: { id: 't1' },
    conversa: { valor_proposto: 750, dados_coletados: { decisao_desconto: null } },
    telefone: '+5511', estado_atual: 'aguardando_sinal',
  });
  assert.equal(ctx.proposta_status, 'aguardando_sinal');
  assert.ok(Array.isArray(ctx.slots_reservados));
  assert.equal(ctx.slots_reservados.length, 1);
  assert.equal(ctx.slots_reservados[0].agendamento_id, 'agd-001');
});

test('prefetchPropostaContext: propondo_valor NAO retorna slots_reservados', async () => {
  globalThis.fetch = mockFetch({
    'consultar-horarios': { ok: true, slots: [] },
  });
  const ctx = await prefetchPropostaContext({
    env: { INKFLOW_TOOL_SECRET: 'stub', AGENT_INTERNAL_BASE_URL: 'https://stub' },
    tenant: { id: 't1' },
    conversa: { valor_proposto: 750, dados_coletados: { decisao_desconto: null } },
    telefone: '+5511', estado_atual: 'propondo_valor',
  });
  assert.equal(ctx.slots_reservados, undefined);
  assert.ok(Array.isArray(ctx.horarios_livres));
});

test('prefetchPropostaContext: aguardando_sinal com tool retornando vazio nao quebra', async () => {
  globalThis.fetch = mockFetch({
    'consultar-proposta-tatuador': { ok: true, status: null },
  });
  const ctx = await prefetchPropostaContext({
    env: { INKFLOW_TOOL_SECRET: 'stub', AGENT_INTERNAL_BASE_URL: 'https://stub' },
    tenant: { id: 't1' },
    conversa: {},
    telefone: '+5511', estado_atual: 'aguardando_sinal',
  });
  assert.deepEqual(ctx.slots_reservados, []);
});
