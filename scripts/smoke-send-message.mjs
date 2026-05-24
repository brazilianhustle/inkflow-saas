#!/usr/bin/env node
import { processBatch } from '../functions/_lib/whatsapp-pipeline.js';

const TENANT_ID = process.env.SMOKE_TENANT_ID || 'db686ef2-ca42-43e4-a831-808984d8d6c6';
const PHONE = process.argv[2];
const TEXT = process.argv.slice(3).join(' ');

if (!PHONE || !TEXT) {
  console.error('uso: node scripts/smoke-send-message.mjs <telefone> <mensagem>');
  process.exit(2);
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bfzuxxuscyplfoimvomh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY ausente');
  process.exit(2);
}

const session_id = `${TENANT_ID}_${PHONE}`;

async function supaFetch(path, init = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

const evoMessageId = `smoke-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const insert = await supaFetch('/rest/v1/conversa_mensagens', {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify({
    session_id,
    evo_message_id: evoMessageId,
    status: 'received',
    message: { type: 'human', content: TEXT },
  }),
});

const raw = await insert.text();
let rows = [];
try { rows = JSON.parse(raw); } catch {}

if (!insert.ok || !Array.isArray(rows) || !rows[0]?.id) {
  console.error(`insert failed status=${insert.status}: ${raw.slice(0, 500)}`);
  process.exit(1);
}

const msgRowId = rows[0].id;
await processBatch(process.env, {
  session_id,
  tenantId: TENANT_ID,
  telefone: PHONE,
  msgRowIds: [msgRowId],
});

console.log(JSON.stringify({ ok: true, session_id, msgRowId, evoMessageId }));
