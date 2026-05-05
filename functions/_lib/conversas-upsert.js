// ── InkFlow — Helper pra garantir existência de conversa ──────────────────
// Idempotente via UNIQUE(tenant_id, telefone) + Prefer: ignore-duplicates.
// Defaults só aplicam em INSERT efetivo; SELECT pós-conflito retorna row intacta.
//
// Uso:
//   const conv = await ensureConversa(env, {
//     tenant_id, telefone,
//     defaultsOnInsert: { estado_agente: 'coletando_tattoo' }
//   });
//   if (!conv.ok) return errorResponse;
//   // conv.id, conv.criado, conv.row disponíveis
import { supaFetch } from '../api/tools/_tool-helpers.js';

/**
 * Upsert idempotente em conversas via PostgREST ignore-duplicates.
 * @param {object} env - CF Pages env (precisa SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SERVICE_KEY)
 * @param {object} args
 * @param {string} args.tenant_id - UUID do tenant
 * @param {string} args.telefone - número normalizado
 * @param {object} [args.defaultsOnInsert={}] - campos a popular se for INSERT (ignorados se row já existe)
 * @returns {Promise<
 *   {ok: true, id: string, criado: boolean, row: object} |
 *   {ok: false, reason: string, status?: number}
 * >}
 */
export async function ensureConversa(env, { tenant_id, telefone, defaultsOnInsert = {} }) {
  if (!tenant_id) return { ok: false, reason: 'tenant_id-obrigatorio' };
  if (!telefone)  return { ok: false, reason: 'telefone-obrigatorio' };

  // Try INSERT com ignore-duplicates: cria se não existe, retorna [] se conflita.
  const insRes = await supaFetch(env, '/rest/v1/conversas?on_conflict=tenant_id,telefone', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ tenant_id, telefone, ...defaultsOnInsert }),
  });
  if (!insRes.ok) {
    return { ok: false, reason: 'insert-falhou', status: insRes.status };
  }
  const insRows = await insRes.json();

  if (Array.isArray(insRows) && insRows.length > 0) {
    // INSERT efetivado: row recém-criada.
    return { ok: true, id: insRows[0].id, criado: true, row: insRows[0] };
  }

  // Conflito (row já existia) → SELECT pra recuperar.
  const selRes = await supaFetch(
    env,
    `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&select=*`
  );
  if (!selRes.ok) {
    return { ok: false, reason: 'select-pos-conflito-falhou', status: selRes.status };
  }
  const selRows = await selRes.json();
  if (!Array.isArray(selRows) || selRows.length === 0) {
    return { ok: false, reason: 'row-nao-encontrada-pos-conflito' };
  }
  return { ok: true, id: selRows[0].id, criado: false, row: selRows[0] };
}
