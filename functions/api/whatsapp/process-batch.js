// functions/api/whatsapp/process-batch.js
// POST interno — chamado pelo alarm() do DO SessionQueue. Auth: x-cron-secret.
// Roda o pipeline pro lote. Throw inesperado → 500 (o DO re-tenta com backoff durável).
import { processBatch } from '../../_lib/whatsapp-pipeline.js';
import { logAgentTurn } from '../../_lib/telemetry/agent-turn-logger.js';

const HEADERS = { 'Content-Type': 'application/json' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ ok: false, error: 'method-not-allowed' }, 405);
  if (!env.CRON_SECRET || request.headers.get('x-cron-secret') !== env.CRON_SECRET) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'body-invalido' }, 400); }
  const { session_id, msgRowIds, tenantId, telefone, queue_meta } = body || {};
  // Contrato do DO: sempre envia session_id + tenantId + telefone + msgRowIds[].
  // Exigimos todos na fronteira (fail-fast) em vez de depender do fallback do pipeline.
  if (!session_id || !tenantId || !telefone || !Array.isArray(msgRowIds) || msgRowIds.length === 0) {
    return json({ ok: false, error: 'bad-batch' }, 400);
  }
  try {
    await processBatch(env, { session_id, tenantId, telefone, msgRowIds, queue_meta }, {
      logAgentTurn: (fields) => logAgentTurn(context, env, fields),
    });
    return json({ ok: true });
  } catch (e) {
    // Falha de infra (Etapa 0: leitura DB). 500 sinaliza ao DO re-tentar.
    // Endpoint interno-only (auth x-cron-secret, chamado so pelo DO) → e.message no body
    // e seguro: a resposta volta pro alarm() do DO, nunca pra um cliente externo.
    console.error('[process-batch] failed:', e.message);
    return json({ ok: false, error: e.message }, 500);
  }
}
