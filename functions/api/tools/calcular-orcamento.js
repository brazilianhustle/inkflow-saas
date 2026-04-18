// ── Tool — calcular_orcamento (v5) ─────────────────────────────────────────
// POST /api/tools/calcular-orcamento
// Headers: X-Inkflow-Tool-Secret
// Body: { tenant_id, tamanho_cm, estilo, regiao, cor_bool, nivel_detalhe, telefone? }
//
// Delega lógica de cálculo para _lib/pricing.js. Responde com:
//   { pode_fazer, valor_tipo: 'faixa'|'exato', min, max, valor?, sinal, breakdown, ... }
// OU
//   { pode_fazer: false, motivo_recusa, motivo_recusa_texto } pra guardrails.

import { withTool, supaFetch } from './_tool-helpers.js';
import { loadConfigPrecificacao, calcularOrcamento } from '../../_lib/pricing.js';

// Auto-transição de estado na FSM de conversas. Fire-and-forget.
async function bumpEstado(env, tenant_id, telefone, min, max) {
  if (!telefone) return;
  try {
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
    await fetch(`https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&estado=in.(qualificando,orcando)`, {
      method: 'PATCH',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'orcando', orcamento_min: min, orcamento_max: max, updated_at: new Date().toISOString() }),
    });
  } catch (e) { /* nao bloqueia resposta */ }
}

export const onRequest = withTool('calcular_orcamento', async ({ env, input, context }) => {
  const { tenant_id, tamanho_cm, estilo, regiao, cor_bool, nivel_detalhe, telefone, tipo } = input || {};

  if (!tenant_id) return { status: 400, body: { ok: false, error: 'tenant_id obrigatorio' } };

  let tenant;
  try {
    tenant = await loadConfigPrecificacao((path) => supaFetch(env, path), tenant_id);
  } catch (e) {
    return { status: 500, body: { ok: false, error: 'db-error', detail: String(e?.message || e) } };
  }
  if (!tenant) return { status: 404, body: { ok: false, error: 'tenant-nao-encontrado' } };

  const result = calcularOrcamento({ tamanho_cm, estilo, regiao, cor_bool, nivel_detalhe }, tenant);

  if (result.ok === false) {
    return { status: 400, body: result };
  }

  // Retoque: aplica desconto sobre o valor integral
  if (tipo === 'retoque' && result.pode_fazer) {
    let descontoPct = 50;
    try {
      const tRes = await supaFetch(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=desconto_retoque_pct`);
      if (tRes.ok) {
        const rows = await tRes.json();
        if (rows[0]?.desconto_retoque_pct != null) descontoPct = rows[0].desconto_retoque_pct;
      }
    } catch {}
    const fator = 1 - descontoPct / 100;
    result.tipo_orcamento = 'retoque';
    result.desconto_retoque_pct = descontoPct;
    if (result.valor_tipo === 'faixa') {
      result.valor_integral_min = result.valor_minimo;
      result.valor_integral_max = result.valor_maximo;
      result.valor_minimo = Math.max(Math.round(result.valor_minimo * fator), result.minimo || 200);
      result.valor_maximo = Math.max(Math.round(result.valor_maximo * fator), result.minimo || 200);
      result.sinal = Math.round(result.valor_minimo * (result.sinal_percentual || 30) / 100);
    } else {
      result.valor_integral = result.valor;
      result.valor = Math.max(Math.round(result.valor * fator), result.minimo || 200);
      result.sinal = Math.round(result.valor * (result.sinal_percentual || 30) / 100);
    }
  }

  // Auto-transição só se orçamento válido (pode_fazer=true)
  if (result.pode_fazer && context && telefone) {
    const min = result.min || result.valor_minimo || result.valor || 0;
    const max = result.max || result.valor_maximo || result.valor || 0;
    context.waitUntil(bumpEstado(env, tenant_id, telefone, min, max));
  }

  return { status: 200, body: result };
});
