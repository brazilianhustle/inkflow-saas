import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTenantContext, isPropostaSubstate } from '../../../functions/api/agent/_lib/tenant-context-manager.js';

test('TenantContextManager: identifica substates de proposta', () => {
  assert.equal(isPropostaSubstate('propondo_valor'), true);
  assert.equal(isPropostaSubstate('escolhendo_horario'), true);
  assert.equal(isPropostaSubstate('aguardando_sinal'), true);
  assert.equal(isPropostaSubstate('tattoo'), false);
  assert.equal(isPropostaSubstate('cadastro'), false);
});

test('TenantContextManager: injeta portfolio sem mutar clientContext original', async () => {
  const clientContext = { is_first_contact: true };

  const ctx = await buildTenantContext({
    env: {},
    tenant: { portfolio_urls: ['https://example.com/a.jpg'] },
    estado_atual: 'tattoo',
    clientContext,
  });

  assert.deepEqual(clientContext, { is_first_contact: true });
  assert.deepEqual(ctx, {
    is_first_contact: true,
    portfolio_disponivel: true,
  });
});

test('TenantContextManager: contexto derivado sobrescreve flags transversais antigas', async () => {
  const ctx = await buildTenantContext({
    env: {},
    tenant: { portfolio_urls: [] },
    estado_atual: 'cadastro',
    clientContext: { portfolio_disponivel: true, eh_recorrente: true },
  });

  assert.deepEqual(ctx, {
    portfolio_disponivel: false,
    eh_recorrente: true,
  });
});

test('TenantContextManager: injeta contexto de proposta somente em substate de proposta', async () => {
  const calls = [];
  const deps = {
    prefetchPortfolio: async () => ({ portfolio_disponivel: true }),
    prefetchPropostaContext: async (args) => {
      calls.push(args);
      return { horarios_livres: [{ inicio: '2026-05-25T15:00:00Z' }] };
    },
  };

  const ctx = await buildTenantContext({
    env: { CRON_SECRET: 'x' },
    tenant: { id: 'tenant-1' },
    conversa: { id: 'conv-1' },
    telefone: '5521999999999',
    estado_atual: 'propondo_valor',
    clientContext: { nome_cliente: 'Joao' },
    deps,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].estado_atual, 'propondo_valor');
  assert.deepEqual(ctx, {
    nome_cliente: 'Joao',
    portfolio_disponivel: true,
    horarios_livres: [{ inicio: '2026-05-25T15:00:00Z' }],
  });

  await buildTenantContext({
    env: {},
    tenant: { id: 'tenant-1' },
    estado_atual: 'tattoo',
    deps,
  });
  assert.equal(calls.length, 1);
});
