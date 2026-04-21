// ── InkFlow — Trial lifecycle helpers ────────────────────────────────────────

const ML_BASE = 'https://connect.mailerlite.com/api';

export function calculateTrialEnd(now = new Date()) {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 7);
  return end.toISOString();
}

// Move um subscriber entre grupos MailerLite.
// opts.from = group ID de origem (remove); opts.to = group ID de destino (add).
// Fail-open: loga erro e retorna {ok:false} se algo falhar — caller segue em frente.
export async function moveToMailerLiteGroup(env, emailOrId, { from, to }) {
  const key = env.MAILERLITE_API_KEY;
  if (!key) {
    console.warn('moveToMailerLiteGroup: MAILERLITE_API_KEY ausente');
    return { ok: false, skipped: true };
  }
  const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  try {
    if (from) {
      await fetch(`${ML_BASE}/groups/${from}/subscribers/${encodeURIComponent(emailOrId)}`, {
        method: 'DELETE',
        headers,
      });
    }
    if (to) {
      await fetch(`${ML_BASE}/subscribers/${encodeURIComponent(emailOrId)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ groups: [to] }),
      });
    }
    return { ok: true };
  } catch (e) {
    console.error('moveToMailerLiteGroup failed:', e.message);
    return { ok: false, error: e.message };
  }
}
