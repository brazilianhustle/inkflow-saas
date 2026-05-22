// functions/_lib/evolution-send.js
// Wrapper Evolution API v2: sendText + sendMedia.
// Usa tenant.evo_apikey (preferencial) ou env.EVO_GLOBAL_KEY (fallback admin).
// Timeout 10s. Retorna {ok, status?, error?}.

export async function evoSend(env, tenant, payload) {
  const baseUrl = tenant?.evo_base_url || env.EVO_BASE_URL || 'https://evo.inkflowbrasil.com';
  const apikey = tenant?.evo_apikey || env.EVO_GLOBAL_KEY;
  const instance = tenant?.evo_instance;
  if (!apikey || !instance) {
    return { ok: false, error: 'missing-apikey-or-instance' };
  }
  const { type, to, text, url } = payload;

  let endpoint, body;
  if (type === 'text') {
    endpoint = `/message/sendText/${encodeURIComponent(instance)}`;
    body = { number: to, text };
  } else if (type === 'media') {
    endpoint = `/message/sendMedia/${encodeURIComponent(instance)}`;
    body = { number: to, mediatype: 'image', media: url };
  } else {
    return { ok: false, error: `unknown-payload-type:${type}` };
  }

  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { apikey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: detail.slice(0, 200) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function splitBaloes(text) {
  return String(text || '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
}

export async function evoSendTextBaloes(env, tenant, { to, text }) {
  const baloes = splitBaloes(text);
  if (baloes.length === 0) return { ok: false, error: 'empty-text' };
  for (let i = 0; i < baloes.length; i++) {
    const r = await evoSend(env, tenant, { type: 'text', to, text: baloes[i] });
    if (!r.ok) return { ...r, balao_index: i };
  }
  return { ok: true, baloes: baloes.length };
}
