// functions/api/whatsapp/inbound.js
// POST /api/whatsapp/inbound — webhook Evolution v2.
// Auth: x-webhook-secret. Persist-first + idempotencia via UNIQUE partial.
// Ack 200 < 200ms; enfileira no DO SessionQueue via waitUntil(stub.fetch('/enqueue')).

import { parseEvolutionPayload } from '../../_lib/evolution-parser.js';
import { supaFetch } from '../tools/_tool-helpers.js';

const HEADERS = { 'Content-Type': 'application/json' };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

export async function onRequest(context) {
  const { request, env, waitUntil } = context;

  if (request.method !== 'POST') return json({ ok: false, error: 'method-not-allowed' }, 405);
  if (!env.WEBHOOK_SECRET || request.headers.get('x-webhook-secret') !== env.WEBHOOK_SECRET) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'body-invalido' }, 400); }

  const parsed = parseEvolutionPayload(body);
  if (parsed.skip) {
    console.log('[inbound] skip:', parsed.skip);
    return json({ ok: true, skipped: parsed.skip });
  }
  const inbound = parsed.inbound;
  if (inbound.mediaTruncated) {
    console.warn('[inbound] media-truncated:', inbound.evoMessageId, inbound.mediaMimetype);
  }

  // Lookup tenant via evo_instance.
  // NOTA: coluna correta e fewshots_por_modo (NAO fewshots — Task 1 finding).
  // portfolio_urls necessario pra prefetchPortfolio (qualquer agent ler portfolio_disponivel).
  let tenant;
  try {
    const r = await supaFetch(env, `/rest/v1/tenants?evo_instance=eq.${encodeURIComponent(inbound.tenantEvoInstance)}` +
      `&select=id,nome_estudio,evo_instance,evo_apikey,evo_base_url,tatuador_telegram_chat_id,config_agente,config_precificacao,sinal_percentual,gatilhos_handoff,faq_texto,fewshots_por_modo,portfolio_urls,horario_funcionamento,duracao_sessao_padrao_h&limit=1`);
    const arr = await r.json();
    tenant = arr?.[0];
  } catch (e) {
    console.error('[inbound] tenant lookup failed:', e.message);
    return json({ ok: false, error: 'tenant-lookup-failed' }, 500);
  }
  if (!tenant) {
    console.warn('[inbound] orphan-tenant:', inbound.tenantEvoInstance);
    return json({ ok: true, skipped: 'orphan-tenant' });
  }

  // INSERT idempotente
  const session_id = `${tenant.id}_${inbound.telefone}`;
  let insertedRow = null;
  try {
    const ins = await supaFetch(env, '/rest/v1/conversa_mensagens', {
      method: 'POST',
      headers: { Prefer: 'return=representation, resolution=ignore-duplicates' },
      body: JSON.stringify({
        session_id,
        message: {
          type: 'human',
          content: inbound.texto,
          media_base64: inbound.mediaBase64,
          media_mimetype: inbound.mediaMimetype,
        },
        evo_message_id: inbound.evoMessageId,
        status: 'received',
      }),
    });
    const arr = await ins.json();
    insertedRow = arr?.[0] || null;
  } catch (e) {
    console.error('[inbound] insert failed:', e.message);
    return json({ ok: false, error: 'insert-failed' }, 500);
  }

  if (!insertedRow) {
    // Idempotencia hit: ja tinha row com (session_id, evo_message_id) identicos
    return json({ ok: true, idempotent: true });
  }

  // Dispatch async: enfileira no Durable Object (serializa + debounce por sessao).
  // Em CF Pages waitUntil sempre existe; sem ele nao da pra fire-and-forget sem bloquear
  // o ack — entao tratamos como nao-enfileirado (msg fica received, recuperavel).
  if (env.SESSION_QUEUE && typeof waitUntil === 'function') {
    // host 'do' e ignorado pelo runtime do DO — so o path /enqueue importa.
    // telefone vai junto por conveniencia do DO (evita reparsear o session_id).
    const enqueueReq = new Request('https://do/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgRowId: insertedRow.id, session_id, tenantId: tenant.id, telefone: inbound.telefone,
      }),
    });
    const id = env.SESSION_QUEUE.idFromName(session_id);
    const stub = env.SESSION_QUEUE.get(id);
    waitUntil(stub.fetch(enqueueReq).catch(e => {
      console.error('[inbound] enqueue rejected:', e.message);
    }));
    return json({ ok: true, accepted: insertedRow.id });
  }

  // Sem binding ou sem waitUntil (dev local): msg fica `received`; recuperavel por retry/varredura.
  console.error('[inbound] nao enfileirado (SESSION_QUEUE/waitUntil ausente) — msg', insertedRow.id, 'fica received');
  return json({ ok: true, accepted: insertedRow.id, queued: false });
}
