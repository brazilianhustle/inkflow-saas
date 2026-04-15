// ── Handler compartilhado do sinal MP ──────────────────────────────────────
// Processa o pagamento one-shot de sinal de tatuagem. Chamado tanto pelo
// endpoint dedicado (/api/webhooks/mp-sinal) quanto pelo IPN principal
// (/api/mp-ipn) quando ele detecta que o evento e de tipo `payment`.
//
// A decisao de processar esta centralizada aqui — external_reference precisa
// bater com "sinal:<agendamento_uuid>". Fora desse formato, retorna ignored.

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const MP_API = 'https://api.mercadopago.com';

async function supaFetch(env, path, init = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

// Processa um paymentId: busca no MP, promove agendamento tentative → confirmed
// se status=approved e external_reference bate. Idempotente (so promove se ainda tentative).
// Retorna objeto com { ok, processed, agendamento_id?, status?, ignored? }.
export async function processMpSinal(env, paymentId) {
  const MP_TOKEN = env.MP_ACCESS_TOKEN;
  if (!MP_TOKEN) return { ok: false, error: 'mp-not-configured' };
  if (!paymentId) return { ok: true, ignored: 'no-payment-id' };

  // Busca o payment no MP pra ter dados frescos (webhook vem com IDs stale as vezes)
  const payRes = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  });
  if (!payRes.ok) {
    console.error('mp-sinal-handler: erro buscando payment', payRes.status);
    return { ok: true, ignored: 'payment-fetch-failed' };
  }
  const payment = await payRes.json();
  const externalRef = payment.external_reference || '';
  const match = externalRef.match(/^sinal:([a-f0-9-]+)$/i);
  if (!match) {
    return { ok: true, ignored: 'not-a-sinal', external_reference: externalRef };
  }
  const agendamento_id = match[1];

  if (payment.status !== 'approved') {
    console.log(`mp-sinal-handler: payment ${paymentId} status=${payment.status} agendamento=${agendamento_id}`);
    return { ok: true, ignored: 'not-approved', status: payment.status, agendamento_id };
  }

  // Promove agendamento tentative → confirmed (so se ainda em tentative — idempotencia)
  const updRes = await supaFetch(env, `/rest/v1/agendamentos?id=eq.${encodeURIComponent(agendamento_id)}&status=eq.tentative`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'confirmed',
      sinal_pago_em: new Date().toISOString(),
      mp_payment_id: String(paymentId),
    }),
  });
  if (!updRes.ok) {
    console.error('mp-sinal-handler: erro promovendo agendamento', await updRes.text());
    return { ok: true, ignored: 'update-failed', agendamento_id };
  }
  const updated = await updRes.json();
  if (!Array.isArray(updated) || updated.length === 0) {
    return { ok: true, ignored: 'already-processed', agendamento_id };
  }
  const ag = updated[0];

  // Atualiza conversa correspondente para confirmado
  if (ag.cliente_telefone && ag.tenant_id) {
    await supaFetch(env, `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(ag.tenant_id)}&telefone=eq.${encodeURIComponent(ag.cliente_telefone)}`, {
      method: 'PATCH',
      body: JSON.stringify({ estado: 'confirmado', updated_at: new Date().toISOString() }),
    });
  }

  console.log(`mp-sinal-handler: agendamento ${agendamento_id} confirmado via payment ${paymentId}`);
  return {
    ok: true,
    processed: true,
    agendamento_id,
    status: 'confirmed',
    payment_id: String(paymentId),
  };
}

// Detecta se um webhook do MP refere-se a um sinal (helper pra dispatch).
// O external_reference so pode ser recuperado buscando o payment no MP,
// entao a verificacao e feita la. Aqui olhamos so o tipo.
export function isSinalCandidateEvent({ type, topic }) {
  const t = (type || topic || '').toLowerCase();
  return t === 'payment' || t.includes('payment');
}
