// ── InkFlow — Decide approval (approve/reject) ──────────────────────────────
// POST /api/approvals/decide
// Body: { id: "<uuid>", action: "approve" | "reject", notes?: "<string>" }
// Auth: Bearer <supabase-auth-jwt> de admin (ADMIN_EMAIL)
// Resposta sucesso: { status, approved_at, approved_by, notes }
// Resposta falha: { error }
//
// Spec: docs/superpowers/specs/2026-04-26-telegram-bot-down-design.md §6.3

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const ADMIN_EMAIL = 'lmf4200@gmail.com';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

async function verifyAdmin(authHeader, supabaseKey) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: supabaseKey, Authorization: authHeader },
    });
    if (!userRes.ok) return null;
    const user = await userRes.json();
    if (user.email !== ADMIN_EMAIL) return null;
    return user.email;
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json({ error: 'Server misconfigured' }, 500);

  const authHeader = request.headers.get('Authorization');
  const adminEmail = await verifyAdmin(authHeader, SUPABASE_KEY);
  if (!adminEmail) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { id, action, notes } = body || {};
  if (!id || typeof id !== 'string') return json({ error: 'Missing id' }, 400);
  if (action !== 'approve' && action !== 'reject') return json({ error: 'Invalid action' }, 400);
  if (notes !== undefined && (typeof notes !== 'string' || notes.length > 1000)) {
    return json({ error: 'Invalid notes' }, 400);
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  // Atomic UPDATE: WHERE status='pending' garante que mesmo race com cron de expiry
  // ou double-decide concorrente não corrompe estado. Se 0 rows affected → já
  // decidido/expirado → 409.
  try {
    const patchUrl = `${SUPABASE_URL}/rest/v1/approvals?id=eq.${encodeURIComponent(id)}&status=eq.pending`;
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        status: newStatus,
        approved_at: new Date().toISOString(),
        approved_by: adminEmail,
        notes: notes ?? null,
      }),
    });

    if (!patchRes.ok) {
      console.error('approvals/decide: PATCH failed', patchRes.status);
      return json({ error: 'DB error' }, 500);
    }

    const rows = await patchRes.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      // Nenhuma row atualizada — id inexistente OU status != pending
      return json({ error: 'Approval not found or already decided' }, 409);
    }

    const row = rows[0];
    return json({
      status: row.status,
      approved_at: row.approved_at,
      approved_by: row.approved_by,
      notes: row.notes,
    });
  } catch (err) {
    console.error('approvals/decide exception:', err);
    return json({ error: 'Internal error' }, 500);
  }
}
