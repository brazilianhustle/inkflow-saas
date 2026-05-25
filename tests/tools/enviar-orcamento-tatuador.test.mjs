// Testes do handler enviar-orcamento-tatuador (refator pra contrato tenant_id+telefone).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, formatarDataBr, montarLinhaIdade, montarBriefing, montarTextoOrcamento, selecionarFotosOrcamento, enviarFotosOrcamento, localComPreposicao } from '../../functions/api/tools/enviar-orcamento-tatuador.js';

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
      descricao_curta: 'borboleta', local_corpo: 'pulso',
      tamanho_cm: 8,    // tamanho da TATTOO (opcional)
      altura_cm: 165,   // altura do CLIENTE (corpo) — NAO e o tamanho da tattoo
      estilo: 'fineline', foto_local: 'presente', refs_imagens: ['ref1', 'ref2'],
    },
    dados_cadastro: { nome: 'Maria' },
  };
  const txt = montarBriefing(conv);
  assert.match(txt, /borboleta/);
  assert.match(txt, /fineline/);
  assert.match(txt, /pulso/);
  // tamanho da tattoo aparece como ~8cm
  assert.match(txt, /~?8\s*cm/i);
  // altura do cliente aparece SEPARADA e rotulada (nao como tamanho da tattoo)
  assert.match(txt, /altura do cliente[^\d]*165\s*cm/i);
  assert.match(txt, /foto do local/i);
  assert.match(txt, /2\s+refer/i);
});

test('localComPreposicao: concorda genero em locais comuns', () => {
  assert.equal(localComPreposicao('perna'), 'na perna');
  assert.equal(localComPreposicao('coxa direita'), 'na coxa direita');
  assert.equal(localComPreposicao('costas'), 'nas costas');
  assert.equal(localComPreposicao('antebraco'), 'no antebraco');
});

test('montarBriefing: nao escreve "no perna"', () => {
  const txt = montarBriefing({
    dados_coletados: { descricao_curta: 'rosa', local_corpo: 'perna', altura_cm: 181, estilo: 'fineline' },
    dados_cadastro: { nome: 'Mario' },
  });
  assert.match(txt, /na perna/);
  assert.doesNotMatch(txt, /no perna/);
});

test('montarBriefing: altura_cm (corpo) NUNCA vira o tamanho da tattoo', () => {
  // So altura (cliente alto), sem tamanho de tattoo → NAO deve descrever a tattoo
  // como "~170cm". A altura sai rotulada; o tamanho fica ausente (opcional).
  const conv = {
    dados_coletados: { descricao_curta: 'leao', local_corpo: 'costas', altura_cm: 170, estilo: 'realismo' },
    dados_cadastro: { nome: 'Joao' },
  };
  const txt = montarBriefing(conv);
  assert.match(txt, /altura do cliente[^\d]*170\s*cm/i);
  assert.doesNotMatch(txt, /tatuagem de leao[^.]*170/i); // 170 nao entra na descricao da tattoo
});

test('montarBriefing: sem foto_local → omite mencao', () => {
  const conv = {
    dados_coletados: { descricao_curta: 'rosa', local_corpo: 'costas', altura_cm: 170, estilo: 'realismo' },
    dados_cadastro: { nome: 'Joao' },
  };
  const txt = montarBriefing(conv);
  assert.doesNotMatch(txt, /foto do local/i);
});

test('montarTextoOrcamento: SEM orcid visivel + linha idade + briefing', () => {
  const conv = {
    id: 'conv-orcamento-123',
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
  assert.match(txt, /Pacote: handoff_package_v1/);
  assert.match(txt, /Trace: hp_convorcame/);
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

// ── Task 8: selecionarFotosOrcamento + enviarFotosOrcamento ──────────────────

test('selecionarFotosOrcamento: 1 local + 2 refs → 3 itens', () => {
  const conv = { dados_coletados: { foto_local_msg_id: 42, refs_imagens_msg_ids: [43, 44] } };
  const r = selecionarFotosOrcamento(conv);
  assert.deepEqual(r, [
    { msg_id: 42, tipo: 'local' },
    { msg_id: 43, tipo: 'ref' },
    { msg_id: 44, tipo: 'ref' },
  ]);
});

test('selecionarFotosOrcamento: 0 local + 0 refs → array vazio', () => {
  const conv = { dados_coletados: {} };
  assert.deepEqual(selecionarFotosOrcamento(conv), []);
});

test('selecionarFotosOrcamento: cap 10 (1 local + 9 refs mais recentes de 15)', () => {
  const refs = Array.from({ length: 15 }, (_, i) => 100 + i);  // [100..114]
  const conv = { dados_coletados: { foto_local_msg_id: 42, refs_imagens_msg_ids: refs } };
  const r = selecionarFotosOrcamento(conv);
  assert.equal(r.length, 10);
  assert.equal(r[0].tipo, 'local');
  assert.equal(r[0].msg_id, 42);
  // Pega as 9 ULTIMAS refs: 106..114
  assert.deepEqual(r.slice(1).map(x => x.msg_id), [106, 107, 108, 109, 110, 111, 112, 113, 114]);
});

test('selecionarFotosOrcamento: 12 refs sem foto local → cap 10 (10 mais recentes)', () => {
  const refs = Array.from({ length: 12 }, (_, i) => 100 + i);
  const conv = { dados_coletados: { refs_imagens_msg_ids: refs } };
  const r = selecionarFotosOrcamento(conv);
  assert.equal(r.length, 10);
  assert.deepEqual(r.map(x => x.msg_id), [102, 103, 104, 105, 106, 107, 108, 109, 110, 111]);
});

test('enviarFotosOrcamento: 1 local + 2 refs JPEG → sendMediaGroup, PATCH file_ids, RPC zerar 3x', async () => {
  const conv = {
    id: 'c1',
    dados_coletados: { foto_local_msg_id: 42, refs_imagens_msg_ids: [43, 44] },
    dados_cadastro: { nome: 'Maria' },
  };
  const supaCalls = [];
  const tgCalls = [];
  const deps = {
    supaFetch: async (path, init = {}) => {
      supaCalls.push({ path, method: init.method || 'GET', body: init.body });
      if (path.includes('/conversa_mensagens?')) {
        return new Response(JSON.stringify([
          { id: 42, message: { media_base64: 'B42', media_mimetype: 'image/jpeg' } },
          { id: 43, message: { media_base64: 'B43', media_mimetype: 'image/jpeg' } },
          { id: 44, message: { media_base64: 'B44', media_mimetype: 'image/jpeg' } },
        ]), { status: 200 });
      }
      return new Response(null, { status: 204 });
    },
    sendTelegramMediaGroup: async (env, chat, items) => {
      tgCalls.push({ tipo: 'mediaGroup', items });
      return items.map((_, i) => ({ file_id: `FID_${i}` }));
    },
    sendTelegramPhoto: async () => ({ file_id: 'FID_solo' }),
    sendTelegramDocument: async () => { throw new Error('nao esperado'); },
  };
  const r = await enviarFotosOrcamento({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, '99', conv, deps);
  assert.equal(r.enviadas, 3);
  assert.equal(r.falhas, 0);
  // PATCH dados_coletados com file_ids
  const patch = supaCalls.find(c => c.method === 'PATCH' && c.path.includes('/conversas?id=eq.c1'));
  assert.ok(patch);
  const body = JSON.parse(patch.body);
  assert.equal(body.dados_coletados.foto_local_file_id, 'FID_0');
  assert.deepEqual(body.dados_coletados.refs_imagens_file_ids, ['FID_1', 'FID_2']);
  // RPC zerar chamado 3 vezes
  const rpcs = supaCalls.filter(c => c.path.includes('/rpc/zerar_media_base64'));
  assert.equal(rpcs.length, 3);
});

test('enviarFotosOrcamento: 1 foto unica JPEG → sendTelegramPhoto (nao MediaGroup)', async () => {
  const conv = {
    id: 'c1',
    dados_coletados: { foto_local_msg_id: 42 },
    dados_cadastro: { nome: 'Maria' },
  };
  let usouSolo = false;
  const deps = {
    supaFetch: async (path) => {
      if (path.includes('/conversa_mensagens?')) {
        return new Response(JSON.stringify([
          { id: 42, message: { media_base64: 'B42', media_mimetype: 'image/jpeg' } },
        ]), { status: 200 });
      }
      return new Response(null, { status: 204 });
    },
    sendTelegramPhoto: async () => { usouSolo = true; return { file_id: 'SOLO' }; },
    sendTelegramMediaGroup: async () => { throw new Error('nao esperado'); },
    sendTelegramDocument: async () => { throw new Error('nao esperado'); },
  };
  await enviarFotosOrcamento({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, '99', conv, deps);
  assert.ok(usouSolo);
});

test('enviarFotosOrcamento: mix JPEG + HEIC → 1 sendDocument(HEIC) + 1 sendMediaGroup(JPEGs)', async () => {
  const conv = {
    id: 'c1',
    dados_coletados: { foto_local_msg_id: 42, refs_imagens_msg_ids: [43, 44] },
    dados_cadastro: { nome: 'Maria' },
  };
  let chamouDoc = false; let chamouGroup = false;
  const deps = {
    supaFetch: async (path) => {
      if (path.includes('/conversa_mensagens?')) {
        return new Response(JSON.stringify([
          { id: 42, message: { media_base64: 'B42', media_mimetype: 'image/jpeg' } },
          { id: 43, message: { media_base64: 'B43', media_mimetype: 'image/heic' } },
          { id: 44, message: { media_base64: 'B44', media_mimetype: 'image/jpeg' } },
        ]), { status: 200 });
      }
      return new Response(null, { status: 204 });
    },
    sendTelegramMediaGroup: async (env, chat, items) => {
      chamouGroup = true; assert.equal(items.length, 2);
      return items.map((_, i) => ({ file_id: `JPEG_${i}` }));
    },
    sendTelegramDocument: async () => { chamouDoc = true; return { file_id: 'HEIC' }; },
    sendTelegramPhoto: async () => ({ file_id: 'JPEG_solo' }),
  };
  const r = await enviarFotosOrcamento({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, '99', conv, deps);
  assert.ok(chamouDoc, 'HEIC via sendDocument');
  assert.ok(chamouGroup, 'JPEGs via mediaGroup');
  assert.equal(r.enviadas, 3);
});

test('enviarFotosOrcamento: 0 fotos → return {enviadas:0, tentadas:0}', async () => {
  const conv = { id: 'c1', dados_coletados: {}, dados_cadastro: {} };
  const deps = {
    supaFetch: async () => new Response('[]', { status: 200 }),
    sendTelegramPhoto: async () => { throw new Error('nao esperado'); },
    sendTelegramMediaGroup: async () => { throw new Error('nao esperado'); },
    sendTelegramDocument: async () => { throw new Error('nao esperado'); },
  };
  const r = await enviarFotosOrcamento({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, '99', conv, deps);
  assert.equal(r.enviadas, 0);
  assert.equal(r.tentadas, 0);
});

test('enviarFotosOrcamento: upload throw → cleanup NAO roda (base64 intacto)', async () => {
  const conv = {
    id: 'c1',
    dados_coletados: { foto_local_msg_id: 42, refs_imagens_msg_ids: [43] },
    dados_cadastro: { nome: 'Maria' },
  };
  const rpcCalls = [];
  const deps = {
    supaFetch: async (path, init = {}) => {
      if (path.includes('/conversa_mensagens?')) {
        return new Response(JSON.stringify([
          { id: 42, message: { media_base64: 'B', media_mimetype: 'image/jpeg' } },
          { id: 43, message: { media_base64: 'B', media_mimetype: 'image/jpeg' } },
        ]), { status: 200 });
      }
      if (path.includes('/rpc/zerar_media_base64')) {
        rpcCalls.push(init.body);
      }
      return new Response(null, { status: 204 });
    },
    sendTelegramMediaGroup: async () => { throw new Error('telegram-413: too large'); },
    sendTelegramPhoto: async () => { throw new Error('telegram-413: too large'); },
    sendTelegramDocument: async () => { throw new Error('telegram-413: too large'); },
  };
  const r = await enviarFotosOrcamento({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, '99', conv, deps);
  assert.equal(r.falhas_total, true);
  assert.equal(rpcCalls.length, 0, 'cleanup NAO deve rodar se upload falhou');
});
