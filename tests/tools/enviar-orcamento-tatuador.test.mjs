// Testes do handler enviar-orcamento-tatuador (refator pra contrato tenant_id+telefone).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, formatarDataBr, montarLinhaIdade, montarBriefing, montarTextoOrcamento } from '../../functions/api/tools/enviar-orcamento-tatuador.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TELEFONE = '+5511999999999';
const CONVERSA_ID = '11111111-1111-1111-1111-111111111111';
const SECRET = 'test-secret';
const TG_CHAT_ID = '-100123456';

const ENV = {
  INKFLOW_TOOL_SECRET: SECRET,
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  INKFLOW_TELEGRAM_BOT_TOKEN: 'fake-bot-token',
};

function buildContext(body, secret = SECRET) {
  return {
    request: new Request('https://example.com/api/tools/enviar-orcamento-tatuador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inkflow-Tool-Secret': secret },
      body: JSON.stringify(body),
    }),
    env: ENV,
    waitUntil: () => {},
  };
}

const CONVERSA_COMPLETA = {
  id: CONVERSA_ID,
  tenant_id: TENANT_ID,
  estado_agente: 'coletando_cadastro',
  orcid: null,
  dados_coletados: { descricao_tattoo: 'rosa', tamanho_cm: 10, local_corpo: 'antebraço', altura_cm: 165, estilo: 'realismo' },
  dados_cadastro: { nome: 'Maria Silva', data_nascimento: '1995-03-12', idade_anos: 31 },
  tenants: { id: TENANT_ID, nome_estudio: 'Hustle Ink', tatuador_telegram_chat_id: TG_CHAT_ID, tatuador_telegram_username: 'leo' },
};

test('enviar-orcamento: happy path envia Telegram e retorna 200 com orcid', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([CONVERSA_COMPLETA]), { status: 200 });
    }
    if (url.includes('telegram.org/bot') && url.includes('sendMessage')) {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 });
    }
    if (opts?.method === 'PATCH') return new Response(null, { status: 204 });
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response(JSON.stringify([]), { status: 200 });
  };
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.match(body.orcid, /^orc_/);
    assert.equal(body.telegram_message_id, 42);
    assert.equal(body.estado_agente, 'aguardando_tatuador');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-orcamento: tenant_id ausente retorna 400', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });
  try {
    const ctx = buildContext({ telefone: TELEFONE });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, 'tenant_id obrigatorio');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-orcamento: telefone ausente retorna 400', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, 'telefone obrigatorio');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-orcamento: conversa não existe retorna 404', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.error, 'conversa-nao-encontrada');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enviar-orcamento: idempotência via orcid existente', async () => {
  const origFetch = globalThis.fetch;
  const convComOrcid = { ...CONVERSA_COMPLETA, orcid: 'orc_abc123', estado_agente: 'aguardando_tatuador' };
  let telegramCalls = 0;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([convComOrcid]), { status: 200 });
    }
    if (url.includes('telegram.org')) {
      telegramCalls++;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response('', { status: 200 });
  };
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.orcid, 'orc_abc123');
    assert.equal(body.idempotente, true);
    assert.equal(telegramCalls, 0, 'Telegram NÃO deve ser chamado em idempotência');
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ── Refator 4 OBR (altura_cm + estilo) ──────────────────────────────────────

test('aceita payload com 4 OBR (altura_cm + estilo) — tamanho_cm null OK', async () => {
  const origFetch = globalThis.fetch;
  // Conversa com novos 4 OBR: descricao_curta + local_corpo + altura_cm + estilo; tamanho_cm null
  const convNova4OBR = {
    ...CONVERSA_COMPLETA,
    dados_coletados: {
      descricao_curta: 'leão fineline',
      local_corpo: 'antebraço',
      altura_cm: 170,
      estilo: 'fineline',
      tamanho_cm: null,
    },
  };
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([convNova4OBR]), { status: 200 });
    }
    if (url.includes('telegram.org/bot') && url.includes('sendMessage')) {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), { status: 200 });
    }
    if (opts?.method === 'PATCH') return new Response(null, { status: 204 });
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response(JSON.stringify([]), { status: 200 });
  };
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.match(body.orcid, /^orc_/);
    assert.equal(body.estado_agente, 'aguardando_tatuador');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('rejeita payload sem altura_cm — campos-faltando inclui altura_cm', async () => {
  const origFetch = globalThis.fetch;
  // Conversa com estilo + local + descricao mas sem altura_cm (null)
  const convSemAltura = {
    ...CONVERSA_COMPLETA,
    dados_coletados: {
      descricao_curta: 'leão',
      local_corpo: 'antebraço',
      altura_cm: null,
      estilo: 'fineline',
      tamanho_cm: 15,
    },
  };
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([convSemAltura]), { status: 200 });
    }
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response(JSON.stringify([]), { status: 200 });
  };
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, 'campos-faltando');
    assert.ok(body.faltando?.includes('altura_cm'), `esperava altura_cm em faltando, recebeu: ${JSON.stringify(body.faltando)}`);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('rejeita payload sem estilo — campos-faltando inclui estilo', async () => {
  const origFetch = globalThis.fetch;
  // Conversa com altura + local + descricao mas sem estilo (OBR novo)
  const convSemEstilo = {
    ...CONVERSA_COMPLETA,
    dados_coletados: {
      descricao_curta: 'leão',
      local_corpo: 'antebraço',
      altura_cm: 165,
      tamanho_cm: 15,
    },
  };
  globalThis.fetch = async (url) => {
    if (url.includes('/rest/v1/conversas?tenant_id=eq')) {
      return new Response(JSON.stringify([convSemEstilo]), { status: 200 });
    }
    if (url.includes('tool_calls_log')) return new Response('', { status: 201 });
    return new Response(JSON.stringify([]), { status: 200 });
  };
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, 'campos-faltando');
    assert.ok(body.faltando?.includes('estilo'), `esperava estilo em faltando, recebeu: ${JSON.stringify(body.faltando)}`);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ── Task 7: helpers visuais (briefing, idade, data, texto sem orcid) ─────────

test('formatarDataBr: ISO valida → dd/mm/yyyy', () => {
  assert.equal(formatarDataBr('2001-03-15'), '15/03/2001');
});

test('formatarDataBr: ISO invalida → null (defensivo)', () => {
  assert.equal(formatarDataBr('xxx'), null);
  assert.equal(formatarDataBr(null), null);
  assert.equal(formatarDataBr(undefined), null);
});

test('montarLinhaIdade: data presente → "🎂 25 anos (15/03/2001)"', () => {
  const linha = montarLinhaIdade({ data_nascimento: '2001-03-15' }, new Date('2026-05-19'));
  assert.match(linha, /🎂\s*25 anos\s*\(15\/03\/2001\)/);
});

test('montarLinhaIdade: data ausente → null (omite linha)', () => {
  assert.equal(montarLinhaIdade({ data_nascimento: null }), null);
  assert.equal(montarLinhaIdade({}), null);
});

test('montarLinhaIdade: aniversariante hoje (born 1990-05-19) → 36 em 2026-05-19', () => {
  const linha = montarLinhaIdade({ data_nascimento: '1990-05-19' }, new Date('2026-05-19'));
  assert.match(linha, /36 anos/);
});

test('montarLinhaIdade: ainda nao fez aniversario este ano', () => {
  const linha = montarLinhaIdade({ data_nascimento: '2000-12-25' }, new Date('2026-05-19'));
  assert.match(linha, /25 anos/);
});

test('montarBriefing: gera texto natural com campos completos', () => {
  const conv = {
    dados_coletados: {
      descricao_curta: 'borboleta', local_corpo: 'pulso', altura_cm: 8, estilo: 'fineline',
      foto_local: 'presente', refs_imagens: ['ref1', 'ref2'],
    },
    dados_cadastro: { nome: 'Maria' },
  };
  const txt = montarBriefing(conv);
  assert.match(txt, /borboleta/);
  assert.match(txt, /fineline/);
  assert.match(txt, /pulso/);
  assert.match(txt, /8\s*cm/i);
  assert.match(txt, /foto do local/i);
  assert.match(txt, /2\s+refer/i);
});

test('montarBriefing: sem foto_local → omite mencao', () => {
  const conv = {
    dados_coletados: { descricao_curta: 'rosa', local_corpo: 'costas', altura_cm: 15, estilo: 'realismo' },
    dados_cadastro: { nome: 'Joao' },
  };
  const txt = montarBriefing(conv);
  assert.doesNotMatch(txt, /foto do local/i);
});

test('montarTextoOrcamento: SEM orcid visivel + linha idade + briefing', () => {
  const conv = {
    dados_coletados: { descricao_curta: 'borboleta', local_corpo: 'pulso', altura_cm: 8, estilo: 'fineline', foto_local: 'presente' },
    dados_cadastro: { nome: 'Maria', data_nascimento: '2001-03-15', email: 'maria@x.com' },
    orcid: 'orc_xyz123',
  };
  const txt = montarTextoOrcamento(conv, null, new Date('2026-05-19'));
  assert.doesNotMatch(txt, /orc_/);
  assert.doesNotMatch(txt, /🆔/);
  assert.match(txt, /Maria/);
  assert.match(txt, /25 anos/);
  assert.match(txt, /maria@x\.com/);
  assert.match(txt, /borboleta/);
});

test('montarTextoOrcamento: append nota se resultadoFotos.falhas > 0', () => {
  const conv = {
    dados_coletados: { descricao_curta: 'x', local_corpo: 'y', altura_cm: 5, estilo: 'z' },
    dados_cadastro: { nome: 'X' },
    orcid: 'o',
  };
  const txt = montarTextoOrcamento(conv, { tentadas: 3, enviadas: 1, falhas: 2 });
  assert.match(txt, /2 de 3 fotos n[aã]o anexaram/i);
});

test('montarTextoOrcamento: append nota se resultadoFotos.falhas_total', () => {
  const conv = {
    dados_coletados: { descricao_curta: 'x', local_corpo: 'y', altura_cm: 5, estilo: 'z' },
    dados_cadastro: { nome: 'X' },
    orcid: 'o',
  };
  const txt = montarTextoOrcamento(conv, { falhas_total: true });
  assert.match(txt, /n[aã]o foi poss[ií]vel anexar as fotos/i);
});
