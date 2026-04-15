// ── Tool 3.1 — calcular_orcamento ──────────────────────────────────────────
// POST /api/tools/calcular-orcamento
// Headers: X-Inkflow-Tool-Secret
// Body: { tenant_id, tamanho_cm, estilo, regiao, cor_bool, nivel_detalhe }
// Retorna faixa determinística, NUNCA valor único. Regra de ouro do SaaS.

import { withTool, supaFetch } from './_tool-helpers.js';

// Defaults aplicados quando tenant.config_precificacao está vazio.
// Valores conservadores; dono sobrescreve no onboarding/studio.
const DEFAULTS = {
  moeda: 'BRL',
  valor_hora: 250,
  minimo: 200,
  buckets_cm: { P: 5, M: 12, G: 20 }, // ≤P, ≤M, ≤G, >G=GG
  tabela_tamanho: { P: [200, 400], M: [400, 800], G: [800, 1500], GG: [1500, 3000] },
  multiplicadores: { cor: 1.3, detalhe_alto: 1.5, detalhe_medio: 1.2, regiao_dificil: 1.2 },
  regioes_dificeis: ['costela', 'pe', 'mao', 'pescoco', 'cabeca'],
  sinal_percentual: 30,
  observacoes: 'Valor final confirmado em avaliação presencial.',
};

function bucketize(cm, buckets) {
  if (cm <= buckets.P) return 'P';
  if (cm <= buckets.M) return 'M';
  if (cm <= buckets.G) return 'G';
  return 'GG';
}

function merge(base, over) {
  if (!over || typeof over !== 'object') return base;
  return { ...base, ...over, multiplicadores: { ...base.multiplicadores, ...(over.multiplicadores || {}) } };
}

// Auto-transicao de estado na FSM de conversas. Fire-and-forget.
async function bumpEstado(env, tenant_id, telefone, min, max) {
  if (!telefone) return;
  try {
    await fetch(`https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&estado=in.(qualificando,orcando)`, {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ estado: 'orcando', orcamento_min: min, orcamento_max: max, updated_at: new Date().toISOString() }),
    });
  } catch (e) { /* nao bloqueia resposta */ }
}

export const onRequest = withTool('calcular_orcamento', async ({ env, input, context }) => {
  const { tenant_id, tamanho_cm, estilo, regiao, cor_bool, nivel_detalhe, telefone } = input || {};

  if (!tenant_id) return { status: 400, body: { ok: false, error: 'tenant_id obrigatorio' } };
  if (!Number.isFinite(Number(tamanho_cm)) || Number(tamanho_cm) <= 0) {
    return { status: 400, body: { ok: false, error: 'tamanho_cm invalido' } };
  }

  const r = await supaFetch(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=config_precificacao,config_agente,sinal_percentual`);
  if (!r.ok) return { status: 500, body: { ok: false, error: 'db-error' } };
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return { status: 404, body: { ok: false, error: 'tenant-nao-encontrado' } };
  }
  const t = rows[0];
  const cfg = merge(DEFAULTS, t.config_precificacao || {});
  const sinal_pct = t.sinal_percentual || cfg.sinal_percentual;

  // 1. Checa estilos recusados
  const recusados = (t.config_agente?.estilos_recusados || []).map(s => String(s).toLowerCase());
  const estiloNorm = String(estilo || '').toLowerCase().trim();
  if (estiloNorm && recusados.includes(estiloNorm)) {
    return {
      status: 200,
      body: {
        ok: true,
        pode_fazer: false,
        motivo_recusa: `O estudio nao trabalha com estilo: ${estilo}`,
        min: null, max: null, sinal: null,
      },
    };
  }

  // 2. Bucket por tamanho
  const cm = Number(tamanho_cm);
  const bucket = bucketize(cm, cfg.buckets_cm);
  const base = cfg.tabela_tamanho[bucket];
  if (!Array.isArray(base) || base.length !== 2) {
    return { status: 500, body: { ok: false, error: 'tabela-tamanho-invalida' } };
  }
  let [min, max] = base;

  // 3. Multiplicadores
  const mult = cfg.multiplicadores;
  let multTotal = 1;
  if (cor_bool === true) multTotal *= (mult.cor || 1);
  if (nivel_detalhe === 'alto') multTotal *= (mult.detalhe_alto || 1);
  else if (nivel_detalhe === 'medio') multTotal *= (mult.detalhe_medio || 1);
  const regiaoNorm = String(regiao || '').toLowerCase().trim();
  if (regiaoNorm && (cfg.regioes_dificeis || []).includes(regiaoNorm)) {
    multTotal *= (mult.regiao_dificil || 1);
  }
  min = Math.round(min * multTotal);
  max = Math.round(max * multTotal);

  // 4. Piso mínimo
  if (min < cfg.minimo) min = cfg.minimo;
  if (max < min) max = min;

  // 5. Sinal
  const sinal = Math.round(min * (sinal_pct / 100));

  // 6. Auto-transiciona estado da conversa para "orcando" (fire-and-forget)
  if (context && telefone) context.waitUntil(bumpEstado(env, tenant_id, telefone, min, max));

  return {
    status: 200,
    body: {
      ok: true,
      pode_fazer: true,
      moeda: cfg.moeda,
      min, max, sinal,
      bucket,
      multiplicador_total: Number(multTotal.toFixed(2)),
      observacoes: cfg.observacoes,
    },
  };
});
