// ── InkFlow — Motor de precificação compartilhado ──────────────────────────
// Usado por:
//   - /api/tools/calcular-orcamento  (produção, loga em tool_calls_log)
//   - /api/tools/preview-orcamento   (Testador A, sem log)
//   - /api/tools/simular-conversa    (Testador B, redireciona calcular pra preview)
//
// Lida com 2 modos:
//   - modo "faixa"  → retorna {min, max, valor_tipo: 'faixa'}
//   - modo "formula" → retorna {valor, valor_tipo: 'exato'}
// Guardrails:
//   - tamanho_maximo_sessao_cm → handoff
//   - valor_maximo_orcado → handoff (teto de segurança)
//   - estilo_fallback quando cliente pede estilo fora do catalogo

const DEFAULTS = {
  moeda: 'BRL',
  modo: 'faixa',
  valor_minimo: 200,
  buckets_cm: { P: 5, M: 12, G: 20 },
  tabela_tamanho: { P: [200, 400], M: [400, 800], G: [800, 1500], GG: [1500, 3000] },
  multiplicadores: {
    cor: 1.3,
    detalhe_alto: 1.5,
    detalhe_medio: 1.2,
    regiao_dificil: 1.2,
  },
  regioes_dificeis: ['costela', 'pe', 'mao', 'pescoco', 'cabeca', 'rosto', 'coluna'],
  sinal_percentual: 30,
  tamanho_maximo_sessao_cm: 25,
  valor_maximo_orcado: 5000,
  estilo_fallback: 'blackwork',
  arredondamento: 50,
  amplitude_pct: 15,
  formula: {
    tipo: 'hibrido',
    valor_cm2: 8,
    valor_hora: 300,
    tempo_por_cm2_minutos: { fineline: 1.5, blackwork: 3, realismo: 5, tradicional: 2, aquarela: 4 },
  },
};

function bucketize(cm, buckets) {
  if (cm <= buckets.P) return 'P';
  if (cm <= buckets.M) return 'M';
  if (cm <= buckets.G) return 'G';
  return 'GG';
}

// Merge profundo raso — JSONB do tenant sobrescreve default.
function mergeConfig(base, override) {
  if (!override || typeof override !== 'object') return base;
  return {
    ...base,
    ...override,
    multiplicadores: { ...base.multiplicadores, ...(override.multiplicadores || {}) },
    buckets_cm: { ...base.buckets_cm, ...(override.buckets_cm || {}) },
    tabela_tamanho: { ...base.tabela_tamanho, ...(override.tabela_tamanho || {}) },
    formula: { ...base.formula, ...(override.formula || {}) },
  };
}

function arredondar(valor, unidade) {
  if (!unidade || unidade <= 0) return Math.round(valor);
  return Math.round(valor / unidade) * unidade;
}

// Busca config do tenant.
// supaFetch: função injetada pelo caller.
export async function loadConfigPrecificacao(supaFetch, tenant_id) {
  const r = await supaFetch(`/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=config_precificacao,config_agente,sinal_percentual,modo_atendimento`);
  if (!r.ok) throw new Error(`db-error-${r.status}`);
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const t = rows[0];

  return t;
}

// Calcula orçamento. Entrada: input do cliente + config do tenant.
// Saída: objeto padronizado (faixa OU exato + breakdown + guardrails).
export function calcularOrcamento({ tamanho_cm, estilo, regiao, cor_bool, nivel_detalhe }, tenant) {
  if (!Number.isFinite(Number(tamanho_cm)) || Number(tamanho_cm) <= 0) {
    return { ok: false, error: 'tamanho_cm invalido' };
  }

  const cm = Number(tamanho_cm);
  const cfg = mergeConfig(DEFAULTS, tenant?.config_precificacao || {});
  const sinal_pct = tenant?.sinal_percentual || cfg.sinal_percentual;
  const arrUnit = cfg.arredondamento || 50;

  // ── Guardrail 1: tamanho máximo ────────────────────────────────────────
  if (cm > cfg.tamanho_maximo_sessao_cm) {
    return {
      ok: true,
      pode_fazer: false,
      motivo_recusa: `tamanho_excede_limite_sessao`,
      motivo_recusa_texto: `Peça de ${cm}cm excede o máximo da sessão (${cfg.tamanho_maximo_sessao_cm}cm). Geralmente requer múltiplas sessões — avaliação pessoal com tatuador.`,
      tamanho_cm: cm,
      tamanho_maximo_sessao_cm: cfg.tamanho_maximo_sessao_cm,
    };
  }

  // ── Guardrail 2: estilo recusado ───────────────────────────────────────
  const estiloRaw = String(estilo || '').toLowerCase().trim();
  const recusados = (tenant?.config_agente?.estilos_recusados || []).map(s => String(s).toLowerCase());
  if (estiloRaw && recusados.includes(estiloRaw)) {
    return {
      ok: true,
      pode_fazer: false,
      motivo_recusa: 'estilo_recusado',
      motivo_recusa_texto: `O estúdio não trabalha com estilo: ${estilo}.`,
      estilo_recusado: estilo,
    };
  }

  // ── Guardrail 3: estilo fallback ───────────────────────────────────────
  // Se estilo não está em aceitos nem recusados, usa fallback
  const aceitos = (tenant?.config_agente?.estilos_aceitos || []).map(s => String(s).toLowerCase());
  let estiloEfetivo = estiloRaw;
  let estiloFallbackAplicado = false;
  if (aceitos.length > 0 && estiloRaw && !aceitos.includes(estiloRaw) && !recusados.includes(estiloRaw)) {
    estiloEfetivo = String(cfg.estilo_fallback || 'blackwork').toLowerCase();
    estiloFallbackAplicado = true;
  }

  // ── Multiplicadores ────────────────────────────────────────────────────
  const mult = cfg.multiplicadores;
  const breakdown = { base: null, multiplicadores_aplicados: [], fallback: null };
  let multTotal = 1;

  if (cor_bool === true) {
    multTotal *= (mult.cor || 1);
    breakdown.multiplicadores_aplicados.push({ nome: 'cor', fator: mult.cor || 1, descricao: 'colorida' });
  }
  if (nivel_detalhe === 'alto') {
    multTotal *= (mult.detalhe_alto || 1);
    breakdown.multiplicadores_aplicados.push({ nome: 'detalhe_alto', fator: mult.detalhe_alto || 1, descricao: 'realismo/alto detalhe' });
  } else if (nivel_detalhe === 'medio') {
    multTotal *= (mult.detalhe_medio || 1);
    breakdown.multiplicadores_aplicados.push({ nome: 'detalhe_medio', fator: mult.detalhe_medio || 1, descricao: 'médio detalhe' });
  }
  const regiaoNorm = String(regiao || '').toLowerCase().trim();
  if (regiaoNorm && (cfg.regioes_dificeis || []).includes(regiaoNorm)) {
    const regiaoMap = { costela:'regiao_costela', mao:'regiao_mao', pescoco:'regiao_pescoco', pe:'regiao_pe', cabeca:'regiao_cabeca', rosto:'regiao_cabeca', coluna:'regiao_coluna' };
    const regiaoKey = regiaoMap[regiaoNorm];
    const regiaoFator = (regiaoKey && mult[regiaoKey]) ? mult[regiaoKey] : (mult.regiao_dificil || 1);
    multTotal *= regiaoFator;
    breakdown.multiplicadores_aplicados.push({ nome: regiaoKey || 'regiao_dificil', fator: regiaoFator, descricao: `região difícil (${regiao})` });
  }

  if (estiloFallbackAplicado) {
    breakdown.fallback = { estilo_original: estilo, estilo_aplicado: estiloEfetivo };
  }

  // ── Branch: modo FAIXA ou EXATO (ambos usam tabela_tamanho) ────────────
  // 'exato' = mesma tabela do 'faixa', mas retorna midpoint colapsado (ver onboarding.html)
  if (cfg.modo === 'faixa' || cfg.modo === 'exato') {
    const bucket = bucketize(cm, cfg.buckets_cm);
    const base = cfg.tabela_tamanho[bucket];
    if (!Array.isArray(base) || base.length !== 2) {
      return { ok: false, error: 'tabela_tamanho_invalida' };
    }
    let [bmin, bmax] = base;
    let min = Math.round(bmin * multTotal);
    let max = Math.round(bmax * multTotal);

    // Piso mínimo
    if (min < cfg.valor_minimo) min = cfg.valor_minimo;
    if (max < min) max = min;

    // Arredondamento
    min = arredondar(min, arrUnit);
    max = arredondar(max, arrUnit);

    // Guardrail teto
    if (max > cfg.valor_maximo_orcado) {
      return {
        ok: true,
        pode_fazer: false,
        motivo_recusa: 'valor_excede_teto',
        motivo_recusa_texto: `Valor calculado (R$ ${max}) excede o teto de segurança (R$ ${cfg.valor_maximo_orcado}). Peça complexa — avaliação pessoal.`,
        valor_calculado: max,
        valor_maximo_orcado: cfg.valor_maximo_orcado,
      };
    }

    breakdown.base = { bucket, faixa_base: base, multiplicador_total: Number(multTotal.toFixed(2)) };

    // Modo EXATO: colapsa pra midpoint
    if (cfg.modo === 'exato') {
      let valor = arredondar(Math.round((min + max) / 2), arrUnit);
      const sinal = Math.round(valor * (sinal_pct / 100));
      return {
        ok: true,
        pode_fazer: true,
        valor_tipo: 'exato',
        moeda: 'BRL',
        valor,
        sinal,
        sinal_percentual: sinal_pct,
        min: valor, max: valor,
        bucket,
        multiplicador_total: Number(multTotal.toFixed(2)),
        breakdown,
        herdou_do_pai: tenant?._herdou_do_pai || false,
      };
    }

    const sinal = Math.round(min * (sinal_pct / 100));
    return {
      ok: true,
      pode_fazer: true,
      valor_tipo: 'faixa',
      moeda: 'BRL',
      min, max, sinal,
      sinal_percentual: sinal_pct,
      bucket,
      multiplicador_total: Number(multTotal.toFixed(2)),
      breakdown,
      herdou_do_pai: tenant?._herdou_do_pai || false,
    };
  }

  // ── Branch: modo FORMULA ────────────────────────────────────────────────
  if (cfg.modo === 'formula') {
    const area = cm * cm; // aproxima como quadrado (altura × altura). TODO: receber largura separada.
    const f = cfg.formula || {};
    let valorBase = 0;

    if (f.tipo === 'cm2') {
      valorBase = area * (f.valor_cm2 || 8);
    } else if (f.tipo === 'hora') {
      const tempoMin = (f.tempo_por_cm2_minutos?.[estiloEfetivo] || 3) * area;
      valorBase = (tempoMin / 60) * (f.valor_hora || 300);
    } else {
      // hibrido (default): pega o maior dos dois
      const c1 = area * (f.valor_cm2 || 8);
      const tempoMin = (f.tempo_por_cm2_minutos?.[estiloEfetivo] || 3) * area;
      const c2 = (tempoMin / 60) * (f.valor_hora || 300);
      valorBase = Math.max(c1, c2);
    }

    let valor = valorBase * multTotal;
    if (valor < cfg.valor_minimo) valor = cfg.valor_minimo;
    valor = arredondar(valor, arrUnit);

    // Guardrail teto
    if (valor > cfg.valor_maximo_orcado) {
      return {
        ok: true,
        pode_fazer: false,
        motivo_recusa: 'valor_excede_teto',
        motivo_recusa_texto: `Valor calculado (R$ ${valor}) excede o teto de segurança (R$ ${cfg.valor_maximo_orcado}). Peça complexa — avaliação pessoal.`,
        valor_calculado: valor,
        valor_maximo_orcado: cfg.valor_maximo_orcado,
      };
    }

    const sinal = Math.round(valor * (sinal_pct / 100));
    breakdown.base = { modo_formula: f.tipo, valor_base: Math.round(valorBase), area_cm2: area, multiplicador_total: Number(multTotal.toFixed(2)) };

    return {
      ok: true,
      pode_fazer: true,
      valor_tipo: 'exato',
      moeda: 'BRL',
      valor,
      sinal,
      sinal_percentual: sinal_pct,
      // Retorna também min/max iguais ao valor pra compat com consumidores antigos
      min: valor, max: valor,
      multiplicador_total: Number(multTotal.toFixed(2)),
      breakdown,
      herdou_do_pai: tenant?._herdou_do_pai || false,
    };
  }

  return { ok: false, error: `modo_desconhecido: ${cfg.modo}` };
}
