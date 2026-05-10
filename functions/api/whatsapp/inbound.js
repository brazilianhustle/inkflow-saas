// functions/api/whatsapp/inbound.js
// POST /api/whatsapp/inbound — webhook Evolution v2.
// Auth: x-webhook-secret. Persist-first + idempotencia via UNIQUE partial.
// Ack 200 < 200ms; processamento via waitUntil(processMessage).

import { parseEvolutionPayload } from '../../_lib/evolution-parser.js';
import { processMessage } from '../../_lib/whatsapp-pipeline.js';
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

  // Lookup tenant via evo_instance.
  // NOTA: coluna correta e fewshots_por_modo (NAO fewshots — Task 1 finding).
  let tenant;
  try {
    const r = await supaFetch(env, `/rest/v1/tenants?evo_instance=eq.${encodeURIComponent(inbound.tenantEvoInstance)}` +
      `&select=id,nome_estudio,evo_instance,evo_apikey,tatuador_telegram_chat_id,config_agente,config_precificacao,sinal_percentual,gatilhos_handoff,faqs,fewshots_por_modo&limit=1`);
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
    const ins = await supaFetch(env, '/rest/v1/n8n_chat_histories', {
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

  // Dispatch async
  const msg = {
    tenantId: tenant.id, telefone: inbound.telefone,
    evoMessageId: inbound.evoMessageId, texto: inbound.texto,
    mediaBase64: inbound.mediaBase64, mediaMimetype: inbound.mediaMimetype,
    pushName: inbound.pushName, msgRowId: insertedRow.id, tenant,
  };
  if (typeof waitUntil === 'function') {
    waitUntil(processMessage(env, msg).catch(e => {
      console.error('[inbound] waitUntil processMessage rejected:', e.message);
    }));
  }

  return json({ ok: true, accepted: insertedRow.id });
}
