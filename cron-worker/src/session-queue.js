// cron-worker/src/session-queue.js
// Durable Object: serializa + agrupa (debounce) o processamento WhatsApp por sessão.
// Uma instância por conversa (idFromName(session_id)). Sintaxe clássica (constructor(state,env))
// — sem extends DurableObject — pra ser importável/testável fora do runtime de Workers.
// Backend SQLite vem da migration new_sqlite_classes no wrangler.toml.

export const DEBOUNCE_MS = 12000;  // janela de silêncio que agrupa balões humanos reais (2-3 bolhas em ritmo normal)
export const MAX_WAIT_MS = 35000;  // teto desde o 1º balão do lote; evita espera infinita sem cortar briefing orgânico cedo demais

// Mesma convenção do index.js: host único como constante de módulo (single source).
const BASE_URL = 'https://inkflowbrasil.com';
const PROCESS_BATCH_URL = `${BASE_URL}/api/whatsapp/process-batch`;

// Estado persistido (única chave de storage do DO), shape:
//   batch = { msgRowIds: number[], session_id, tenantId, telefone, firstEnqueuedAt: number, lastEnqueuedAt: number }
const BATCH_KEY = 'batch';

// Retorna um batch válido: o stored se tiver msgRowIds[] array, senão um novo vazio.
// Defende contra registro corrompido (evita TypeError → alarm em retry infinito).
function freshBatch(stored, { session_id, tenantId, telefone, now }) {
  if (stored && Array.isArray(stored.msgRowIds)) return stored;
  return { msgRowIds: [], session_id, tenantId, telefone, firstEnqueuedAt: now, lastEnqueuedAt: now };
}

// Alerta admin via Telegram (mesmo padrão fail-open do notifyFailure em index.js).
async function notifyAdmin(env, detail) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: `⚠️ SessionQueue: ${detail}` }),
    });
  } catch {
    // fail-open: se Telegram tambem falhar, pelo menos tem o console.error
  }
}

export class SessionQueue {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/enqueue') return this.enqueue(request);
    return new Response('not-found', { status: 404 });
  }

  async enqueue(request) {
    let body;
    try { body = await request.json(); } catch { return new Response('bad-json', { status: 400 }); }
    const { msgRowId, session_id, tenantId, telefone } = body || {};
    if (msgRowId == null || !session_id) return new Response('bad-enqueue', { status: 400 });

    const now = Date.now();
    const stored = await this.state.storage.get(BATCH_KEY);
    const batch = freshBatch(stored, { session_id, tenantId, telefone, now });
    batch.session_id = session_id;
    batch.tenantId = tenantId;
    batch.telefone = telefone;
    if (!batch.firstEnqueuedAt) batch.firstEnqueuedAt = now;
    batch.lastEnqueuedAt = now;
    if (!batch.msgRowIds.includes(msgRowId)) batch.msgRowIds.push(msgRowId);
    await this.state.storage.put(BATCH_KEY, batch);

    const alarmAt = Math.min(now + DEBOUNCE_MS, batch.firstEnqueuedAt + MAX_WAIT_MS);
    await this.state.storage.setAlarm(alarmAt);
    return new Response(JSON.stringify({ accepted: msgRowId }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  async alarm() {
    // Misconfig do binding: falha rápido e descritivo (padrão do index.js) em vez de
    // mandar 'x-cron-secret: undefined' e tomar 401 confuso.
    if (!this.env.CRON_SECRET) throw new Error('CRON_SECRET env binding ausente');

    const batch = await this.state.storage.get(BATCH_KEY);
    if (!batch) return;
    // Self-heal: registro corrompido (msgRowIds nao-array) seria retry infinito. Limpa e sai.
    if (!Array.isArray(batch.msgRowIds)) {
      console.error('[session-queue] batch corrompido (msgRowIds nao-array), descartando');
      await this.state.storage.delete(BATCH_KEY);
      return;
    }
    if (batch.msgRowIds.length === 0) return;
    const sending = [...batch.msgRowIds];
    const processStartedAt = Date.now();
    const queueMeta = {
      queue_version: 'session_queue_v1',
      debounce_ms: DEBOUNCE_MS,
      max_wait_ms: MAX_WAIT_MS,
      first_enqueued_at_ms: Number(batch.firstEnqueuedAt || 0),
      last_enqueued_at_ms: Number(batch.lastEnqueuedAt || batch.firstEnqueuedAt || 0),
      process_started_at_ms: processStartedAt,
      queued_wait_ms: Number(batch.firstEnqueuedAt || 0)
        ? Math.max(0, processStartedAt - Number(batch.firstEnqueuedAt || 0))
        : null,
      silence_wait_ms: Number(batch.lastEnqueuedAt || 0)
        ? Math.max(0, processStartedAt - Number(batch.lastEnqueuedAt || 0))
        : null,
      batch_message_count: sending.length,
    };

    const res = await fetch(PROCESS_BATCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': this.env.CRON_SECRET },
      body: JSON.stringify({
        session_id: batch.session_id, tenantId: batch.tenantId, telefone: batch.telefone, msgRowIds: sending, queue_meta: queueMeta,
      }),
    });
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        // Permanente (401 secret mismatch, 400 contrato): retry nao resolve e ficaria em loop
        // sem ninguem saber. Alerta admin e para. Msgs continuam 'received' no DB (recuperaveis
        // por varredura fase-2/manual). Espelha isRetryable()+notifyFailure() do index.js.
        console.error(`[session-queue] process-batch ${res.status} permanente — descartando lote da sessao ${batch.session_id}`);
        await notifyAdmin(this.env, `process-batch HTTP ${res.status} (permanente) na sessao ${batch.session_id} — lote nao processado, msgs ficam received`);
        await this.state.storage.delete(BATCH_KEY);
        return;
      }
      // Transiente (5xx / cold start / upstream): lança → DO re-agenda alarm com backoff durável.
      throw new Error(`process-batch HTTP ${res.status}`);
    }

    // Sucesso: remove só os ids enviados; balões que chegaram durante o POST ficam.
    const after = await this.state.storage.get(BATCH_KEY);
    const afterIds = (after && Array.isArray(after.msgRowIds)) ? after.msgRowIds : [];
    const remaining = afterIds.filter(id => !sending.includes(id));
    if (remaining.length > 0) {
      // Sobreviventes formam um NOVO lote: firstEnqueuedAt reinicia o teto a partir de agora.
      // (Sessão de altíssimo volume pode estender o teto a cada flush — aceitável p/ o caso real.)
      await this.state.storage.put(BATCH_KEY, { ...after, msgRowIds: remaining, firstEnqueuedAt: Date.now(), lastEnqueuedAt: Date.now() });
      await this.state.storage.setAlarm(Date.now() + DEBOUNCE_MS);
    } else {
      await this.state.storage.delete(BATCH_KEY);
    }
  }
}
