// functions/_lib/evolution-send.js
// Wrapper Evolution API v2: sendText + sendMedia.
// Usa tenant.evo_apikey (preferencial) ou env.EVO_GLOBAL_KEY (fallback admin).
// Timeout 10s. Retorna {ok, status?, error?}.

export async function evoSend(env, tenant, payload) {
  const baseUrl = env.EVO_BASE_URL || 'https://evo.inkflowbrasil.com';
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
