// Testes dos helpers puros do endpoint de reentrada (formatador de mensagem
// + formatador BRL). Integration tests com mock Supabase/Evolution ficam pra
// fase de testes de tool full.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBudgetItemValues,
  composeMultiBudgetProposal,
  parseBudgetItemValues,
} from '../../functions/_lib/budget-proposal-manager.js';
import { montarMensagem, fmtBRL, handle, resumoTattoo, rotuloTatuador } from '../../functions/api/telegram/reentrada.js';

// ── fmtBRL ────────────────────────────────────────────────────────────────

test('fmtBRL: valor inteiro fica sem decimais', () => {
  assert.equal(fmtBRL(750), '750');
  assert.equal(fmtBRL(1000), '1000');
});

test('fmtBRL: valor com decimais usa virgula', () => {
  assert.equal(fmtBRL(750.50), '750,50');
  assert.equal(fmtBRL(99.99), '99,99');
});

test('fmtBRL: null/undefined retorna "?"', () => {
  assert.equal(fmtBRL(null), '?');
  assert.equal(fmtBRL(undefined), '?');
});

test('fmtBRL: string numerica converte', () => {
  assert.equal(fmtBRL('750'), '750');
});

test('fmtBRL: string nao numerica retorna como veio', () => {
  assert.equal(fmtBRL('abc'), 'abc');
});

// ── montarMensagem ─────────────────────────────────────────────────────────

test('montarMensagem: evento "fechar"', () => {
  assert.equal(
    montarMensagem('fechar', 750, null, {
      dados_cadastro: { nome: 'Leandro Marquex' },
      dados_coletados: { descricao_curta: 'rosa', estilo: 'fineline', local_corpo: 'perna', tamanho_cm: 5 },
      tenants: { config_agente: { nome_tatuador: 'Rafa' } },
    }),
    'Fala Leandro, tudo bem? O nosso tatuador Rafa acabou de me passar o seu orçamento\n\nUma rosa delicada na perna nessa pegada de tamanho ficaria por R$ 750! O que me diz, vamos agendar?'
  );
});

test('montarMensagem: evento "aceitar_desconto"', () => {
  assert.equal(
    montarMensagem('aceitar_desconto', 600),
    'Show! Ele topou em R$ 600. Bora marcar?'
  );
});

test('montarMensagem: evento "manter_valor" usa valor_proposto', () => {
  // valor_pedido_cliente seria 600, mas tatuador manteve 750
  assert.equal(
    montarMensagem('manter_valor', null, 750),
    'Ele preferiu manter R$ 750. Tá fechado pra ti? Bora marcar?'
  );
});

test('montarMensagem: evento "recusar"', () => {
  assert.equal(
    montarMensagem('recusar'),
    'Infelizmente o tatuador não vai poder fazer essa peça. Posso te ajudar com outra ideia?'
  );
});

test('parseBudgetItemValues: lê valores numerados para multiplas tattoos', () => {
  const items = [
    { item_id: 'item_1', descricao_curta: 'borboleta', local_corpo: 'perna' },
    { item_id: 'item_2', descricao_curta: 'caveira', local_corpo: 'perna' },
  ];
  const parsed = parseBudgetItemValues('1 200\n2: R$ 400', items);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.total, 600);
  assert.equal(parsed.total_text, 'R$ 600');
  assert.deepEqual(parsed.priced_items.map(item => [item.item_id, item.valor]), [
    ['item_1', 200],
    ['item_2', 400],
  ]);
});

test('parseBudgetItemValues: falha se faltar valor de algum item', () => {
  const parsed = parseBudgetItemValues('1 200', [
    { item_id: 'item_1' },
    { item_id: 'item_2' },
  ]);
  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.missing, [2]);
});

test('applyBudgetItemValues + composeMultiBudgetProposal: monta proposta unica consolidada', () => {
  const dados = {
    budget_items: [
      { item_id: 'item_1', descricao_curta: 'borboleta', local_corpo: 'perna', estilo: 'fineline', status: 'sent_to_artist' },
      { item_id: 'item_2', descricao_curta: 'caveira', local_corpo: 'perna', estilo: 'blackwork', status: 'sent_to_artist' },
    ],
  };
  const parsed = parseBudgetItemValues('1 200\n2 400', dados.budget_items);
  const merged = applyBudgetItemValues(dados, parsed);
  assert.equal(merged.proposal_summary.type, 'multi_budget');
  assert.equal(merged.proposal_summary.total, 600);
  assert.equal(merged.budget_items[0].proposal.valor, 200);
  assert.equal(merged.budget_items[1].proposal.valor, 400);

  const msg = composeMultiBudgetProposal({
    dados_cadastro: { nome: 'Joao Silva' },
    dados_coletados: merged,
  });
  assert.match(msg, /Fala Joao/);
  assert.match(msg, /orçamento das 2 tattoos/);
  assert.match(msg, /borboleta na perna ficaria por R\$ 200/);
  assert.match(msg, /caveira na perna ficaria por R\$ 400/);
  assert.match(msg, /agendar/);
});

test('montarMensagem: evento desconhecido retorna null', () => {
  assert.equal(montarMensagem('inventado', 100), null);
  assert.equal(montarMensagem('', 100), null);
  assert.equal(montarMensagem(undefined, 100), null);
});

test('montarMensagem: valores com decimais sao formatados', () => {
  assert.match(montarMensagem('fechar', 750.50), /R\$ 750,50/);
});

test('rotuloTatuador: usa feminino quando configurado', () => {
  assert.equal(
    rotuloTatuador({ config_agente: { genero_tatuador: 'feminino', nome_tatuador: 'Marina' } }),
    'a nossa tatuadora Marina',
  );
});

test('resumoTattoo: contextualiza descricao, estilo, local e tamanho', () => {
  assert.equal(
    resumoTattoo({ descricao_curta: 'rosa', estilo: 'fineline', local_corpo: 'perna', tamanho_cm: 5 }),
    'Uma rosa delicada na perna nessa pegada de tamanho',
  );
});

test('S2 reentrada: registra mensagem automatica em conversa_mensagens para entrar no historico do agente', async () => {
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    const u = String(url);
    if (u.includes('/rest/v1/conversas?id=eq.')) {
      return new Response(JSON.stringify([{
        id: 'conv-1',
        telefone: '5511999',
        valor_proposto: 750,
        orcid: 'orc_123',
        tenant_id: 'tenant-1',
        dados_cadastro: { nome: 'Leandro Marquex' },
        dados_coletados: { descricao_curta: 'rosa', estilo: 'fineline', local_corpo: 'perna', tamanho_cm: 5 },
        tenants: { id: 'tenant-1', config_agente: { nome_tatuador: 'Rafa' }, evo_instance: 'inst', evo_apikey: 'k', evo_base_url: 'https://evo.test' },
      }]), { status: 200 });
    }
    if (u.includes('evo.test/message/sendText')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (u.includes('/rest/v1/chat_messages') || u.includes('/rest/v1/conversa_mensagens')) {
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    const r = await handle(
      { SUPABASE_SERVICE_KEY: 's', EVO_BASE_URL: 'https://evo.test' },
      { conversa_id: 'conv-1', evento: 'fechar', orcid: 'orc_123', valor: 750 },
    );
    assert.equal(r.status, 200);
    const hist = calls.find(c => c.url.includes('/rest/v1/conversa_mensagens'));
    assert.ok(hist, 'deve inserir conversa_mensagens');
    assert.equal(hist.body.session_id, 'tenant-1_5511999');
    assert.equal(hist.body.message.type, 'ai');
    assert.match(hist.body.message.content, /Fala Leandro/);
    assert.match(hist.body.message.content, /R\$ 750/);
    assert.equal(hist.body.status, 'processed');
    const sends = calls.filter(c => c.url.includes('evo.test/message/sendText'));
    assert.equal(sends.length, 2);
    assert.match(sends[0].body.text, /acabou de me passar/);
    assert.match(sends[1].body.text, /Uma rosa delicada/);
  } finally {
    globalThis.fetch = orig;
  }
});

test('reentrada fechar_multi: envia uma unica proposta consolidada em vez de uma por tattoo', async () => {
  const orig = globalThis.fetch;
  const calls = [];
  const dados = applyBudgetItemValues({
    budget_items: [
      { item_id: 'item_1', descricao_curta: 'borboleta', local_corpo: 'perna', estilo: 'fineline', status: 'sent_to_artist' },
      { item_id: 'item_2', descricao_curta: 'caveira', local_corpo: 'perna', estilo: 'blackwork', status: 'sent_to_artist' },
    ],
  }, parseBudgetItemValues('1 200\n2 400', [
    { item_id: 'item_1' },
    { item_id: 'item_2' },
  ]));
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    const u = String(url);
    if (u.includes('/rest/v1/conversas?id=eq.')) {
      return new Response(JSON.stringify([{
        id: 'conv-1',
        telefone: '5511999',
        valor_proposto: 600,
        orcid: 'orc_123',
        tenant_id: 'tenant-1',
        dados_cadastro: { nome: 'Joao Silva' },
        dados_coletados: dados,
        tenants: { id: 'tenant-1', config_agente: {}, evo_instance: 'inst', evo_apikey: 'k', evo_base_url: 'https://evo.test' },
      }]), { status: 200 });
    }
    if (u.includes('evo.test/message/sendText')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (u.includes('/rest/v1/chat_messages') || u.includes('/rest/v1/conversa_mensagens')) {
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    const r = await handle(
      { SUPABASE_SERVICE_KEY: 's', EVO_BASE_URL: 'https://evo.test' },
      { conversa_id: 'conv-1', evento: 'fechar_multi', orcid: 'orc_123', valor: 600 },
    );
    assert.equal(r.status, 200);
    assert.match(r.body.mensagem_enviada, /borboleta na perna ficaria por R\$ 200/);
    assert.match(r.body.mensagem_enviada, /caveira na perna ficaria por R\$ 400/);
    const sends = calls.filter(c => c.url.includes('evo.test/message/sendText'));
    assert.equal(sends.length, 1, 'multi-orcamento deve sair em uma unica mensagem consolidada');
    assert.match(sends[0].body.text, /orçamento das 2 tattoos/);
    assert.match(sends[0].body.text, /Quer que eu veja um horario/);
  } finally {
    globalThis.fetch = orig;
  }
});
