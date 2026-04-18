var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-dKkxrd/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// .wrangler/tmp/pages-Ts3BqB/functionsWorker-0.7782612408702769.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var urls2 = /* @__PURE__ */ new Set();
function checkURL2(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls2.has(url.toString())) {
      urls2.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL2, "checkURL");
__name2(checkURL2, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL2(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});
var SUPABASE_URL = "https://bfzuxxuscyplfoimvomh.supabase.co";
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
__name(json, "json");
__name2(json, "json");
async function supaFetch(env, path, init = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
}
__name(supaFetch, "supaFetch");
__name2(supaFetch, "supaFetch");
async function onRequest(context) {
  const { request, env } = context;
  const secret = env.CLEANUP_SECRET || env.CRON_SECRET;
  if (!secret) return json({ error: "cron-secret-missing" }, 503);
  const got = request.headers.get("X-Cron-Secret");
  if (got !== secret) return json({ error: "unauthorized" }, 401);
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const cRes = await supaFetch(
    env,
    `/rest/v1/conversas?estado=eq.aguardando_sinal&slot_expira_em=lt.${encodeURIComponent(nowIso)}&select=id,tenant_id,telefone,slot_tentative_id`
  );
  if (!cRes.ok) return json({ error: "db-conversas-error" }, 500);
  const conversas = await cRes.json();
  if (!Array.isArray(conversas) || conversas.length === 0) {
    return json({ ok: true, processadas: 0 });
  }
  const agIds = conversas.map((c) => c.slot_tentative_id).filter(Boolean);
  let canceladas = 0;
  if (agIds.length > 0) {
    const list = agIds.map((i) => `"${i}"`).join(",");
    const upA = await supaFetch(
      env,
      `/rest/v1/agendamentos?id=in.(${list})&status=eq.tentative`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "cancelled" })
      }
    );
    if (upA.ok) {
      const rows = await upA.json();
      canceladas = Array.isArray(rows) ? rows.length : 0;
    }
  }
  const convIds = conversas.map((c) => `"${c.id}"`).join(",");
  if (convIds) {
    await supaFetch(
      env,
      `/rest/v1/conversas?id=in.(${convIds})`,
      {
        method: "PATCH",
        body: JSON.stringify({
          estado: "expirado",
          slot_expira_em: null,
          slot_tentative_id: null,
          updated_at: nowIso
        })
      }
    );
  }
  return json({ ok: true, processadas: conversas.length, canceladas });
}
__name(onRequest, "onRequest");
__name2(onRequest, "onRequest");
var SUPABASE_URL2 = "https://bfzuxxuscyplfoimvomh.supabase.co";
var TOOL_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Inkflow-Tool-Secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function toolJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: TOOL_HEADERS });
}
__name(toolJson, "toolJson");
__name2(toolJson, "toolJson");
function authTool(request, env) {
  const secret = env.INKFLOW_TOOL_SECRET;
  if (!secret) return { ok: false, reason: "secret-missing" };
  const got = request.headers.get("X-Inkflow-Tool-Secret");
  if (!got || got !== secret) return { ok: false, reason: "bad-secret" };
  return { ok: true };
}
__name(authTool, "authTool");
__name2(authTool, "authTool");
function supaKey(env) {
  return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
}
__name(supaKey, "supaKey");
__name2(supaKey, "supaKey");
async function supaFetch2(env, path, init = {}) {
  const key = supaKey(env);
  if (!key) throw new Error("SUPABASE_SERVICE_KEY ausente");
  return fetch(`${SUPABASE_URL2}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
}
__name(supaFetch2, "supaFetch2");
__name2(supaFetch2, "supaFetch");
async function logToolCall(env, row) {
  try {
    await supaFetch2(env, "/rest/v1/tool_calls_log", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        tenant_id: row.tenant_id || null,
        telefone: row.telefone || null,
        tool: row.tool,
        input: row.input || null,
        output: row.output || null,
        sucesso: row.sucesso,
        latency_ms: row.latency_ms,
        erro: row.erro || null
      })
    });
  } catch (e) {
    console.error("logToolCall falhou:", e);
  }
}
__name(logToolCall, "logToolCall");
__name2(logToolCall, "logToolCall");
function withTool(toolName, handler) {
  return async (context) => {
    const { request, env } = context;
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: TOOL_HEADERS });
    }
    if (request.method !== "POST") {
      return toolJson({ ok: false, error: "method-not-allowed" }, 405);
    }
    const auth = authTool(request, env);
    if (!auth.ok) return toolJson({ ok: false, error: auth.reason }, 401);
    let input;
    try {
      input = await request.json();
    } catch {
      return toolJson({ ok: false, error: "invalid-json" }, 400);
    }
    const t0 = Date.now();
    let res, erro = null, sucesso = false;
    try {
      res = await handler({ env, input, context });
      sucesso = (res?.status ?? 200) < 400;
    } catch (e) {
      erro = String(e?.message || e);
      res = { status: 500, body: { ok: false, error: "internal", detail: erro } };
    }
    const latency_ms = Date.now() - t0;
    context.waitUntil(logToolCall(env, {
      tenant_id: input?.tenant_id,
      telefone: input?.telefone,
      tool: toolName,
      input,
      output: res.body,
      sucesso,
      latency_ms,
      erro
    }));
    return toolJson(res.body, res.status || 200);
  };
}
__name(withTool, "withTool");
__name2(withTool, "withTool");
function normalizePhoneBR(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  return digits;
}
__name(normalizePhoneBR, "normalizePhoneBR");
__name2(normalizePhoneBR, "normalizePhoneBR");
async function upsertConversaHandoff(env, tenant_id, telefone, motivo) {
  const selRes = await supaFetch2(
    env,
    `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&select=id,dados_coletados`
  );
  const existentes = selRes.ok ? await selRes.json() : [];
  const dadosAntes = existentes[0]?.dados_coletados || {};
  const dadosMerge = { ...dadosAntes, handoff_motivo: motivo, handoff_em: (/* @__PURE__ */ new Date()).toISOString() };
  if (Array.isArray(existentes) && existentes.length > 0) {
    const updRes = await supaFetch2(
      env,
      `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          estado: "handoff",
          dados_coletados: dadosMerge,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        })
      }
    );
    if (!updRes.ok) return { ok: false, reason: "update-failed", status: updRes.status };
    const rows = await updRes.json();
    return { ok: true, id: rows[0]?.id, criado: false };
  }
  const insRes = await supaFetch2(env, "/rest/v1/conversas", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      tenant_id,
      telefone,
      estado: "handoff",
      dados_coletados: dadosMerge
    })
  });
  if (!insRes.ok) return { ok: false, reason: "insert-failed", status: insRes.status };
  const created = await insRes.json();
  return { ok: true, id: created[0]?.id, criado: true };
}
__name(upsertConversaHandoff, "upsertConversaHandoff");
__name2(upsertConversaHandoff, "upsertConversaHandoff");
async function notificarTatuador(env, tenant, telefone_cliente, motivo) {
  const CENTRAL_INSTANCE = env.EVO_CENTRAL_INSTANCE;
  const CENTRAL_APIKEY = env.EVO_CENTRAL_APIKEY || env.EVO_GLOBAL_KEY;
  const EVO_BASE_URL = env.EVO_BASE_URL || "https://evo.inkflowbrasil.com";
  if (!CENTRAL_INSTANCE || !CENTRAL_APIKEY) {
    return { sent: false, reason: "central-instance-not-configured" };
  }
  const phone = normalizePhoneBR(tenant.telefone);
  if (!phone) return { sent: false, reason: "tenant-sem-telefone" };
  const text = `*InkFlow - Handoff automatico*

Cliente ${telefone_cliente} precisa de atendimento humano.

Motivo: ${motivo || "nao informado"}

A IA pausou a conversa. Responda direto no WhatsApp do estudio.`;
  try {
    const r = await fetch(
      `${EVO_BASE_URL}/message/sendText/${encodeURIComponent(CENTRAL_INSTANCE)}`,
      {
        method: "POST",
        headers: { apikey: CENTRAL_APIKEY, "Content-Type": "application/json" },
        body: JSON.stringify({ number: phone, text })
      }
    );
    if (!r.ok) return { sent: false, reason: "evolution-error", status: r.status };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: "exception", detail: String(e?.message || e) };
  }
}
__name(notificarTatuador, "notificarTatuador");
__name2(notificarTatuador, "notificarTatuador");
var onRequest2 = withTool("acionar_handoff", async ({ env, input }) => {
  const { tenant_id, telefone, motivo } = input || {};
  if (!tenant_id || !telefone) {
    return { status: 400, body: { ok: false, error: "tenant_id e telefone obrigatorios" } };
  }
  const r = await supaFetch2(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=id,telefone,nome_estudio`);
  if (!r.ok) return { status: 500, body: { ok: false, error: "db-error" } };
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return { status: 404, body: { ok: false, error: "tenant-nao-encontrado" } };
  }
  const tenant = rows[0];
  const conv = await upsertConversaHandoff(env, tenant_id, telefone, motivo || null);
  if (!conv.ok) {
    return { status: 500, body: { ok: false, error: "conversa-falhou", detail: conv } };
  }
  const notif = await notificarTatuador(env, tenant, telefone, motivo);
  return {
    status: 200,
    body: {
      ok: true,
      conversa_id: conv.id,
      conversa_criada: conv.criado,
      notificacao: notif
    }
  };
});
var DEFAULTS = {
  moeda: "BRL",
  modo: "faixa",
  valor_minimo: 200,
  buckets_cm: { P: 5, M: 12, G: 20 },
  tabela_tamanho: { P: [200, 400], M: [400, 800], G: [800, 1500], GG: [1500, 3e3] },
  multiplicadores: {
    cor: 1.3,
    detalhe_alto: 1.5,
    detalhe_medio: 1.2,
    regiao_dificil: 1.2
  },
  regioes_dificeis: ["costela", "pe", "mao", "pescoco", "cabeca"],
  sinal_percentual: 30,
  tamanho_maximo_sessao_cm: 25,
  valor_maximo_orcado: 5e3,
  estilo_fallback: "blackwork",
  arredondamento: 50,
  amplitude_pct: 15,
  formula: {
    tipo: "hibrido",
    valor_cm2: 8,
    valor_hora: 300,
    tempo_por_cm2_minutos: { fineline: 1.5, blackwork: 3, realismo: 5, tradicional: 2, aquarela: 4 }
  }
};
function bucketize(cm, buckets) {
  if (cm <= buckets.P) return "P";
  if (cm <= buckets.M) return "M";
  if (cm <= buckets.G) return "G";
  return "GG";
}
__name(bucketize, "bucketize");
__name2(bucketize, "bucketize");
function mergeConfig(base, override) {
  if (!override || typeof override !== "object") return base;
  return {
    ...base,
    ...override,
    multiplicadores: { ...base.multiplicadores, ...override.multiplicadores || {} },
    buckets_cm: { ...base.buckets_cm, ...override.buckets_cm || {} },
    tabela_tamanho: { ...base.tabela_tamanho, ...override.tabela_tamanho || {} },
    formula: { ...base.formula, ...override.formula || {} }
  };
}
__name(mergeConfig, "mergeConfig");
__name2(mergeConfig, "mergeConfig");
function arredondar(valor, unidade) {
  if (!unidade || unidade <= 0) return Math.round(valor);
  return Math.round(valor / unidade) * unidade;
}
__name(arredondar, "arredondar");
__name2(arredondar, "arredondar");
async function loadConfigPrecificacao(supaFetch6, tenant_id) {
  const r = await supaFetch6(`/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=config_precificacao,config_agente,sinal_percentual,parent_tenant_id,is_artist_slot,modo_atendimento`);
  if (!r.ok) throw new Error(`db-error-${r.status}`);
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const t = rows[0];
  const herda = t.config_precificacao?.herda_do_pai === true;
  if (herda && t.parent_tenant_id) {
    const r2 = await supaFetch6(`/rest/v1/tenants?id=eq.${encodeURIComponent(t.parent_tenant_id)}&select=config_precificacao,sinal_percentual`);
    if (r2.ok) {
      const paiRows = await r2.json();
      if (Array.isArray(paiRows) && paiRows.length > 0) {
        t.config_precificacao = paiRows[0].config_precificacao || t.config_precificacao;
        t.sinal_percentual = paiRows[0].sinal_percentual || t.sinal_percentual;
        t._herdou_do_pai = true;
      }
    }
  }
  return t;
}
__name(loadConfigPrecificacao, "loadConfigPrecificacao");
__name2(loadConfigPrecificacao, "loadConfigPrecificacao");
function calcularOrcamento({ tamanho_cm, estilo, regiao, cor_bool, nivel_detalhe }, tenant) {
  if (!Number.isFinite(Number(tamanho_cm)) || Number(tamanho_cm) <= 0) {
    return { ok: false, error: "tamanho_cm invalido" };
  }
  const cm = Number(tamanho_cm);
  const cfg = mergeConfig(DEFAULTS, tenant?.config_precificacao || {});
  const sinal_pct = tenant?.sinal_percentual || cfg.sinal_percentual;
  const arrUnit = cfg.arredondamento || 50;
  if (cm > cfg.tamanho_maximo_sessao_cm) {
    return {
      ok: true,
      pode_fazer: false,
      motivo_recusa: `tamanho_excede_limite_sessao`,
      motivo_recusa_texto: `Pe\xE7a de ${cm}cm excede o m\xE1ximo da sess\xE3o (${cfg.tamanho_maximo_sessao_cm}cm). Geralmente requer m\xFAltiplas sess\xF5es \u2014 avalia\xE7\xE3o pessoal com tatuador.`,
      tamanho_cm: cm,
      tamanho_maximo_sessao_cm: cfg.tamanho_maximo_sessao_cm
    };
  }
  const estiloRaw = String(estilo || "").toLowerCase().trim();
  const recusados = (tenant?.config_agente?.estilos_recusados || []).map((s) => String(s).toLowerCase());
  if (estiloRaw && recusados.includes(estiloRaw)) {
    return {
      ok: true,
      pode_fazer: false,
      motivo_recusa: "estilo_recusado",
      motivo_recusa_texto: `O est\xFAdio n\xE3o trabalha com estilo: ${estilo}.`,
      estilo_recusado: estilo
    };
  }
  const aceitos = (tenant?.config_agente?.estilos_aceitos || []).map((s) => String(s).toLowerCase());
  let estiloEfetivo = estiloRaw;
  let estiloFallbackAplicado = false;
  if (aceitos.length > 0 && estiloRaw && !aceitos.includes(estiloRaw) && !recusados.includes(estiloRaw)) {
    estiloEfetivo = String(cfg.estilo_fallback || "blackwork").toLowerCase();
    estiloFallbackAplicado = true;
  }
  const mult = cfg.multiplicadores;
  const breakdown = { base: null, multiplicadores_aplicados: [], fallback: null };
  let multTotal = 1;
  if (cor_bool === true) {
    multTotal *= mult.cor || 1;
    breakdown.multiplicadores_aplicados.push({ nome: "cor", fator: mult.cor || 1, descricao: "colorida" });
  }
  if (nivel_detalhe === "alto") {
    multTotal *= mult.detalhe_alto || 1;
    breakdown.multiplicadores_aplicados.push({ nome: "detalhe_alto", fator: mult.detalhe_alto || 1, descricao: "realismo/alto detalhe" });
  } else if (nivel_detalhe === "medio") {
    multTotal *= mult.detalhe_medio || 1;
    breakdown.multiplicadores_aplicados.push({ nome: "detalhe_medio", fator: mult.detalhe_medio || 1, descricao: "m\xE9dio detalhe" });
  }
  const regiaoNorm = String(regiao || "").toLowerCase().trim();
  if (regiaoNorm && (cfg.regioes_dificeis || []).includes(regiaoNorm)) {
    multTotal *= mult.regiao_dificil || 1;
    breakdown.multiplicadores_aplicados.push({ nome: "regiao_dificil", fator: mult.regiao_dificil || 1, descricao: `regi\xE3o dif\xEDcil (${regiao})` });
  }
  if (estiloFallbackAplicado) {
    breakdown.fallback = { estilo_original: estilo, estilo_aplicado: estiloEfetivo };
  }
  if (cfg.modo === "faixa") {
    const bucket = bucketize(cm, cfg.buckets_cm);
    const base = cfg.tabela_tamanho[bucket];
    if (!Array.isArray(base) || base.length !== 2) {
      return { ok: false, error: "tabela_tamanho_invalida" };
    }
    let [bmin, bmax] = base;
    let min = Math.round(bmin * multTotal);
    let max = Math.round(bmax * multTotal);
    if (min < cfg.valor_minimo) min = cfg.valor_minimo;
    if (max < min) max = min;
    min = arredondar(min, arrUnit);
    max = arredondar(max, arrUnit);
    if (max > cfg.valor_maximo_orcado) {
      return {
        ok: true,
        pode_fazer: false,
        motivo_recusa: "valor_excede_teto",
        motivo_recusa_texto: `Valor calculado (R$ ${max}) excede o teto de seguran\xE7a (R$ ${cfg.valor_maximo_orcado}). Pe\xE7a complexa \u2014 avalia\xE7\xE3o pessoal.`,
        valor_calculado: max,
        valor_maximo_orcado: cfg.valor_maximo_orcado
      };
    }
    const sinal = Math.round(min * (sinal_pct / 100));
    breakdown.base = { bucket, faixa_base: base, multiplicador_total: Number(multTotal.toFixed(2)) };
    return {
      ok: true,
      pode_fazer: true,
      valor_tipo: "faixa",
      moeda: "BRL",
      min,
      max,
      sinal,
      sinal_percentual: sinal_pct,
      bucket,
      multiplicador_total: Number(multTotal.toFixed(2)),
      breakdown,
      herdou_do_pai: tenant?._herdou_do_pai || false
    };
  }
  if (cfg.modo === "formula") {
    const area = cm * cm;
    const f = cfg.formula || {};
    let valorBase = 0;
    if (f.tipo === "cm2") {
      valorBase = area * (f.valor_cm2 || 8);
    } else if (f.tipo === "hora") {
      const tempoMin = (f.tempo_por_cm2_minutos?.[estiloEfetivo] || 3) * area;
      valorBase = tempoMin / 60 * (f.valor_hora || 300);
    } else {
      const c1 = area * (f.valor_cm2 || 8);
      const tempoMin = (f.tempo_por_cm2_minutos?.[estiloEfetivo] || 3) * area;
      const c2 = tempoMin / 60 * (f.valor_hora || 300);
      valorBase = Math.max(c1, c2);
    }
    let valor = valorBase * multTotal;
    if (valor < cfg.valor_minimo) valor = cfg.valor_minimo;
    valor = arredondar(valor, arrUnit);
    if (valor > cfg.valor_maximo_orcado) {
      return {
        ok: true,
        pode_fazer: false,
        motivo_recusa: "valor_excede_teto",
        motivo_recusa_texto: `Valor calculado (R$ ${valor}) excede o teto de seguran\xE7a (R$ ${cfg.valor_maximo_orcado}). Pe\xE7a complexa \u2014 avalia\xE7\xE3o pessoal.`,
        valor_calculado: valor,
        valor_maximo_orcado: cfg.valor_maximo_orcado
      };
    }
    const sinal = Math.round(valor * (sinal_pct / 100));
    breakdown.base = { modo_formula: f.tipo, valor_base: Math.round(valorBase), area_cm2: area, multiplicador_total: Number(multTotal.toFixed(2)) };
    return {
      ok: true,
      pode_fazer: true,
      valor_tipo: "exato",
      moeda: "BRL",
      valor,
      sinal,
      sinal_percentual: sinal_pct,
      // Retorna também min/max iguais ao valor pra compat com consumidores antigos
      min: valor,
      max: valor,
      multiplicador_total: Number(multTotal.toFixed(2)),
      breakdown,
      herdou_do_pai: tenant?._herdou_do_pai || false
    };
  }
  return { ok: false, error: `modo_desconhecido: ${cfg.modo}` };
}
__name(calcularOrcamento, "calcularOrcamento");
__name2(calcularOrcamento, "calcularOrcamento");
async function bumpEstado(env, tenant_id, telefone, min, max) {
  if (!telefone) return;
  try {
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
    await fetch(`https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&estado=in.(qualificando,orcando)`, {
      method: "PATCH",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "orcando", orcamento_min: min, orcamento_max: max, updated_at: (/* @__PURE__ */ new Date()).toISOString() })
    });
  } catch (e) {
  }
}
__name(bumpEstado, "bumpEstado");
__name2(bumpEstado, "bumpEstado");
var onRequest3 = withTool("calcular_orcamento", async ({ env, input, context }) => {
  const { tenant_id, tamanho_cm, estilo, regiao, cor_bool, nivel_detalhe, telefone } = input || {};
  if (!tenant_id) return { status: 400, body: { ok: false, error: "tenant_id obrigatorio" } };
  let tenant;
  try {
    tenant = await loadConfigPrecificacao((path) => supaFetch2(env, path), tenant_id);
  } catch (e) {
    return { status: 500, body: { ok: false, error: "db-error", detail: String(e?.message || e) } };
  }
  if (!tenant) return { status: 404, body: { ok: false, error: "tenant-nao-encontrado" } };
  const result = calcularOrcamento({ tamanho_cm, estilo, regiao, cor_bool, nivel_detalhe }, tenant);
  if (result.ok === false) {
    return { status: 400, body: result };
  }
  if (result.pode_fazer && context && telefone) {
    const min = result.min || result.valor || 0;
    const max = result.max || result.valor || 0;
    context.waitUntil(bumpEstado(env, tenant_id, telefone, min, max));
  }
  return { status: 200, body: result };
});
var DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
function parseHorario(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.trim().toLowerCase();
  if (s === "closed" || s === "fechado" || s === "-") return null;
  const normalized = s.replace(/h(\d)/g, ":$1").replace(/h$/g, ":00");
  const parts = normalized.split(/[-\u2013]/).map((x) => x.trim());
  if (parts.length !== 2) return null;
  const toMin = /* @__PURE__ */ __name2((hm) => {
    const m = hm.match(/^(\d{1,2})(?::(\d{2}))?/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const mm = m[2] ? parseInt(m[2], 10) : 0;
    if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
    return h * 60 + mm;
  }, "toMin");
  const start = toMin(parts[0]);
  const end = toMin(parts[1]);
  if (start == null || end == null || end <= start) return null;
  return { start, end };
}
__name(parseHorario, "parseHorario");
__name2(parseHorario, "parseHorario");
function horarioDoDia(horarioFuncionamento, diaSemana) {
  if (!horarioFuncionamento || typeof horarioFuncionamento !== "object") return null;
  const dia = DIAS[diaSemana];
  if (horarioFuncionamento[dia]) return parseHorario(horarioFuncionamento[dia]);
  for (const k of Object.keys(horarioFuncionamento)) {
    const parts = k.toLowerCase().split(/[-\u2013_]/);
    if (parts.length === 2 && DIAS.includes(parts[0]) && DIAS.includes(parts[1])) {
      const i0 = DIAS.indexOf(parts[0]);
      const i1 = DIAS.indexOf(parts[1]);
      const inRange = i0 <= i1 ? diaSemana >= i0 && diaSemana <= i1 : diaSemana >= i0 || diaSemana <= i1;
      if (inRange) return parseHorario(horarioFuncionamento[k]);
    }
  }
  return null;
}
__name(horarioDoDia, "horarioDoDia");
__name2(horarioDoDia, "horarioDoDia");
var SP_OFFSET_HOURS = 3;
function spDateParts(date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  });
  const parts = fmt.formatToParts(date);
  const y = parseInt(parts.find((p) => p.type === "year").value, 10);
  const m = parseInt(parts.find((p) => p.type === "month").value, 10) - 1;
  const d = parseInt(parts.find((p) => p.type === "day").value, 10);
  const wdStr = parts.find((p) => p.type === "weekday").value.toLowerCase();
  const wmap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return { y, m, d, wd: wmap[wdStr] };
}
__name(spDateParts, "spDateParts");
__name2(spDateParts, "spDateParts");
function slotsDoDia(data, horarioFuncionamento, duracaoH) {
  const { y, m, d, wd } = spDateParts(data);
  const horario = horarioDoDia(horarioFuncionamento, wd);
  if (!horario) return [];
  const duracaoMin = Math.max(30, Math.round(duracaoH * 60));
  const slots = [];
  for (let t = horario.start; t + duracaoMin <= horario.end; t += duracaoMin) {
    const inicio = new Date(Date.UTC(y, m, d, Math.floor(t / 60) + SP_OFFSET_HOURS, t % 60, 0));
    const fim = new Date(inicio.getTime() + duracaoMin * 6e4);
    slots.push({ inicio, fim });
  }
  return slots;
}
__name(slotsDoDia, "slotsDoDia");
__name2(slotsDoDia, "slotsDoDia");
function filtrarConflitos(slots, agendamentos) {
  const ocupados = (agendamentos || []).filter((a) => ["tentative", "confirmed"].includes(a.status)).map((a) => ({ inicio: new Date(a.inicio).getTime(), fim: new Date(a.fim).getTime() }));
  return slots.filter((s) => {
    const si = s.inicio.getTime(), sf = s.fim.getTime();
    return !ocupados.some((o) => si < o.fim && sf > o.inicio);
  });
}
__name(filtrarConflitos, "filtrarConflitos");
__name2(filtrarConflitos, "filtrarConflitos");
var HORARIO_DEFAULT = {
  "seg-sex": "10:00-19:00",
  "sab": "10:00-15:00",
  "dom": "closed"
};
var MAX_SLOTS = 5;
var DIAS_LOOKAHEAD = 14;
function toBrISO(d) {
  return d.toISOString();
}
__name(toBrISO, "toBrISO");
__name2(toBrISO, "toBrISO");
function formatarSP(dUTC) {
  const date = new Date(dUTC);
  const diaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" }).format(date);
  const dataBr = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(date);
  const horaBr = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(date);
  return { dia_semana: diaSemana, data_br: dataBr, hora_br: horaBr };
}
__name(formatarSP, "formatarSP");
__name2(formatarSP, "formatarSP");
async function bumpEstadoEscolhendo(env, tenant_id, telefone) {
  if (!telefone) return;
  try {
    await supaFetch2(env, `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&estado=in.(qualificando,orcando,expirado)`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "escolhendo_horario", updated_at: (/* @__PURE__ */ new Date()).toISOString() })
    });
  } catch {
  }
}
__name(bumpEstadoEscolhendo, "bumpEstadoEscolhendo");
__name2(bumpEstadoEscolhendo, "bumpEstadoEscolhendo");
var onRequest4 = withTool("consultar_horarios_livres", async ({ env, input, context }) => {
  const { tenant_id, data_preferida, duracao_h, telefone } = input || {};
  if (!tenant_id) return { status: 400, body: { ok: false, error: "tenant_id obrigatorio" } };
  const r = await supaFetch2(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=horario_funcionamento,duracao_sessao_padrao_h`);
  if (!r.ok) return { status: 500, body: { ok: false, error: "db-error" } };
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) return { status: 404, body: { ok: false, error: "tenant-nao-encontrado" } };
  const t = rows[0];
  const horario = t.horario_funcionamento && Object.keys(t.horario_funcionamento).length > 0 ? t.horario_funcionamento : HORARIO_DEFAULT;
  const duracao = Number(duracao_h) > 0 ? Number(duracao_h) : t.duracao_sessao_padrao_h || 3;
  let inicio = data_preferida ? new Date(data_preferida) : /* @__PURE__ */ new Date();
  if (!Number.isFinite(inicio.getTime())) inicio = /* @__PURE__ */ new Date();
  const agora = /* @__PURE__ */ new Date();
  if (inicio.getTime() < agora.getTime()) inicio = agora;
  const ateData = new Date(inicio.getTime() + DIAS_LOOKAHEAD * 864e5);
  const aRes = await supaFetch2(
    env,
    `/rest/v1/agendamentos?tenant_id=eq.${encodeURIComponent(tenant_id)}&inicio=gte.${encodeURIComponent(inicio.toISOString())}&inicio=lte.${encodeURIComponent(ateData.toISOString())}&status=in.(tentative,confirmed)&select=inicio,fim,status`
  );
  const agendamentos = aRes.ok ? await aRes.json() : [];
  const slotsResp = [];
  for (let d = 0; d < DIAS_LOOKAHEAD && slotsResp.length < MAX_SLOTS; d++) {
    const dia = new Date(inicio);
    dia.setDate(dia.getDate() + d);
    dia.setHours(0, 0, 0, 0);
    const slotsDia = slotsDoDia(dia, horario, duracao);
    const livres = filtrarConflitos(slotsDia, agendamentos);
    const agoraComBuffer = new Date(Date.now() + 2 * 36e5);
    const futuros = livres.filter((s) => s.inicio > agoraComBuffer);
    for (const s of futuros) {
      if (slotsResp.length >= MAX_SLOTS) break;
      const fmtIni = formatarSP(s.inicio);
      const fmtFim = formatarSP(s.fim);
      slotsResp.push({
        inicio: toBrISO(s.inicio),
        fim: toBrISO(s.fim),
        // Campos legiveis em pt-BR / SP timezone pro agente usar direto
        dia_semana: fmtIni.dia_semana,
        data_br: fmtIni.data_br,
        hora_inicio_br: fmtIni.hora_br,
        hora_fim_br: fmtFim.hora_br,
        legenda: `${fmtIni.dia_semana} ${fmtIni.data_br} de ${fmtIni.hora_br} \xE0s ${fmtFim.hora_br}`
      });
    }
  }
  if (context && telefone && slotsResp.length > 0) {
    context.waitUntil(bumpEstadoEscolhendo(env, tenant_id, telefone));
  }
  return {
    status: 200,
    body: {
      ok: true,
      duracao_h: duracao,
      slots: slotsResp,
      total: slotsResp.length
    }
  };
});
var DEFAULT_MAX = 5;
var onRequest5 = withTool("enviar_portfolio", async ({ env, input }) => {
  const { tenant_id, estilo, max } = input || {};
  if (!tenant_id) return { status: 400, body: { ok: false, error: "tenant_id obrigatorio" } };
  const r = await supaFetch2(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=portfolio_urls,nome_estudio`);
  if (!r.ok) return { status: 500, body: { ok: false, error: "db-error" } };
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) return { status: 404, body: { ok: false, error: "tenant-nao-encontrado" } };
  const t = rows[0];
  const urls22 = Array.isArray(t.portfolio_urls) ? t.portfolio_urls : [];
  if (urls22.length === 0) {
    return { status: 200, body: { ok: true, urls: [], motivo: "portfolio_vazio" } };
  }
  let filtrados = urls22;
  if (estilo && typeof estilo === "string") {
    const needle = estilo.toLowerCase().trim();
    const matches = urls22.filter((u) => String(u).toLowerCase().includes(needle));
    if (matches.length > 0) filtrados = matches;
  }
  const limit = Math.min(Math.max(1, Number(max) || DEFAULT_MAX), 10);
  return {
    status: 200,
    body: {
      ok: true,
      estudio: t.nome_estudio || null,
      urls: filtrados.slice(0, limit),
      total: filtrados.length
    }
  };
});
var MP_API = "https://api.mercadopago.com/checkout/preferences";
var HOLD_MIN = 2880;
var onRequest6 = withTool("gerar_link_sinal", async ({ env, input }) => {
  const { tenant_id, agendamento_id, valor_sinal } = input || {};
  if (!tenant_id || !agendamento_id) {
    return { status: 400, body: { ok: false, error: "tenant_id e agendamento_id obrigatorios" } };
  }
  if (!Number.isFinite(Number(valor_sinal)) || Number(valor_sinal) < 1) {
    return { status: 400, body: { ok: false, error: "valor_sinal invalido" } };
  }
  const MP_TOKEN = env.MP_ACCESS_TOKEN;
  if (!MP_TOKEN) return { status: 503, body: { ok: false, error: "mp-nao-configurado" } };
  const aRes = await supaFetch2(env, `/rest/v1/agendamentos?id=eq.${encodeURIComponent(agendamento_id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&select=id,status,inicio,fim,cliente_nome,cliente_telefone`);
  if (!aRes.ok) return { status: 500, body: { ok: false, error: "db-error" } };
  const rows = await aRes.json();
  if (!Array.isArray(rows) || rows.length === 0) return { status: 404, body: { ok: false, error: "agendamento-nao-encontrado" } };
  const ag = rows[0];
  const statusesPermitidos = ["tentative", "cancelled"];
  if (!statusesPermitidos.includes(ag.status)) {
    return { status: 409, body: { ok: false, error: `agendamento em status ${ag.status} nao aceita gerar link`, status_atual: ag.status } };
  }
  const regenerado = ag.status === "cancelled";
  if (regenerado) {
    const conflito = await supaFetch2(
      env,
      `/rest/v1/agendamentos?tenant_id=eq.${encodeURIComponent(tenant_id)}&status=in.(tentative,confirmed)&inicio=lt.${encodeURIComponent(ag.fim)}&fim=gt.${encodeURIComponent(ag.inicio)}&id=neq.${encodeURIComponent(agendamento_id)}&select=id`
    );
    if (conflito.ok) {
      const conflitos = await conflito.json();
      if (Array.isArray(conflitos) && conflitos.length > 0) {
        return { status: 409, body: { ok: false, error: "slot-ocupado", code: "slot_taken_other" } };
      }
    }
  }
  const tRes = await supaFetch2(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=nome_estudio,sinal_percentual,config_precificacao`);
  const tenant = tRes.ok ? (await tRes.json())[0] : {};
  const sinalPct = tenant.config_precificacao && tenant.config_precificacao.sinal_percentual || tenant.sinal_percentual || 30;
  const siteUrl = env.SITE_URL || "https://inkflowbrasil.com";
  const externalRef = `sinal:${agendamento_id}`;
  const prefBody = {
    items: [{
      id: agendamento_id,
      title: `Sinal - ${tenant.nome_estudio || "Tatuagem"}`,
      description: `Sinal para sessao em ${new Date(ag.inicio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      quantity: 1,
      unit_price: Number(Number(valor_sinal).toFixed(2)),
      currency_id: "BRL"
    }],
    external_reference: externalRef,
    notification_url: `${siteUrl}/api/webhooks/mp-sinal`,
    back_urls: {
      success: `${siteUrl}/sinal-ok?ag=${agendamento_id}`,
      failure: `${siteUrl}/sinal-falha?ag=${agendamento_id}`,
      pending: `${siteUrl}/sinal-pendente?ag=${agendamento_id}`
    },
    auto_return: "approved",
    metadata: { tenant_id, agendamento_id, tipo: "sinal_tatuagem" }
  };
  const mpRes = await fetch(MP_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(prefBody)
  });
  if (!mpRes.ok) {
    const err = await mpRes.text();
    console.error("gerar-link-sinal: MP error:", err);
    return { status: 502, body: { ok: false, error: "mp-error", detail: err.slice(0, 300) } };
  }
  const pref = await mpRes.json();
  const link = pref.init_point || pref.sandbox_init_point;
  if (!link) return { status: 502, body: { ok: false, error: "mp-sem-link" } };
  const novoSlotExpira = new Date(Date.now() + HOLD_MIN * 6e4).toISOString();
  const agendamentoPatch = {
    sinal_valor: Number(valor_sinal),
    mp_payment_id: null
  };
  if (regenerado) {
    agendamentoPatch.status = "tentative";
  }
  await supaFetch2(env, `/rest/v1/agendamentos?id=eq.${encodeURIComponent(agendamento_id)}`, {
    method: "PATCH",
    body: JSON.stringify(agendamentoPatch)
  });
  if (ag.cliente_telefone) {
    await supaFetch2(env, `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(ag.cliente_telefone)}`, {
      method: "PATCH",
      body: JSON.stringify({
        mp_preference_id: pref.id,
        estado: "aguardando_sinal",
        slot_tentative_id: agendamento_id,
        slot_expira_em: novoSlotExpira,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      })
    });
  }
  return {
    status: 200,
    body: {
      ok: true,
      link_pagamento: link,
      preference_id: pref.id,
      external_reference: externalRef,
      valor: Number(valor_sinal),
      sinal_percentual: sinalPct,
      hold_horas: Math.round(HOLD_MIN / 60),
      expira_em: novoSlotExpira,
      regenerado
    }
  };
});
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function b64url(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
__name(b64url, "b64url");
__name2(b64url, "b64url");
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return atob(str);
}
__name(b64urlDecode, "b64urlDecode");
__name2(b64urlDecode, "b64urlDecode");
async function hmacSign(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hmacSign, "hmacSign");
__name2(hmacSign, "hmacSign");
var DEFAULT_TTL_DAYS = 30;
var REFRESH_THRESHOLD_DAYS = 7;
async function generateStudioToken(tenantId, secret, ttlDays = DEFAULT_TTL_DAYS) {
  if (!UUID_RE.test(tenantId)) throw new Error("tenant_id inv\xE1lido");
  if (!secret) throw new Error("STUDIO_TOKEN_SECRET ausente");
  const exp = Math.floor(Date.now() / 1e3) + ttlDays * 86400;
  const payload = `${b64url(tenantId)}.${exp}`;
  const sig = await hmacSign(payload, secret);
  return `v1.${payload}.${sig}`;
}
__name(generateStudioToken, "generateStudioToken");
__name2(generateStudioToken, "generateStudioToken");
async function verifyStudioToken(token, secret) {
  if (typeof token !== "string" || !token.startsWith("v1.")) return null;
  if (!secret) return { valid: false, reason: "secret-missing" };
  const parts = token.split(".");
  if (parts.length !== 4) return { valid: false, reason: "malformed" };
  const [, tidB64, expStr, sig] = parts;
  const payload = `${tidB64}.${expStr}`;
  let expectedSig;
  try {
    expectedSig = await hmacSign(payload, secret);
  } catch {
    return { valid: false, reason: "hmac-error" };
  }
  if (sig.length !== expectedSig.length) return { valid: false, reason: "bad-signature" };
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  if (diff !== 0) return { valid: false, reason: "bad-signature" };
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp)) return { valid: false, reason: "malformed-exp" };
  const now = Math.floor(Date.now() / 1e3);
  if (exp < now) return { valid: false, reason: "expired", exp };
  let tenantId;
  try {
    tenantId = b64urlDecode(tidB64);
  } catch {
    return { valid: false, reason: "malformed-tenant" };
  }
  if (!UUID_RE.test(tenantId)) return { valid: false, reason: "malformed-tenant" };
  const shouldRefresh = exp - now < REFRESH_THRESHOLD_DAYS * 86400;
  return { valid: true, tenantId, exp, shouldRefresh };
}
__name(verifyStudioToken, "verifyStudioToken");
__name2(verifyStudioToken, "verifyStudioToken");
async function verifyOnboardingKey({ tenantId, onboardingKey, supabaseUrl, supabaseKey }) {
  if (!tenantId || !onboardingKey || typeof onboardingKey !== "string" || onboardingKey.length < 8) {
    return { ok: false, reason: "missing" };
  }
  if (!UUID_RE.test(tenantId)) return { ok: false, reason: "invalid-tenant-id" };
  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=onboarding_key`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    if (!r.ok) return { ok: false, reason: "db-error" };
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) return { ok: false, reason: "not-found" };
    const stored = rows[0].onboarding_key;
    if (!stored || stored !== onboardingKey) return { ok: false, reason: "mismatch" };
    try {
      const linkRes = await fetch(
        `${supabaseUrl}/rest/v1/onboarding_links?key=eq.${encodeURIComponent(onboardingKey)}&select=expires_at`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
      );
      if (linkRes.ok) {
        const linkRows = await linkRes.json();
        if (Array.isArray(linkRows) && linkRows.length > 0) {
          const expiresAt = linkRows[0].expires_at;
          if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
            return { ok: false, reason: "expired", expires_at: expiresAt };
          }
        }
      }
    } catch (e) {
      console.warn("verifyOnboardingKey: TTL check falhou (fail-open):", e?.message);
    }
    return { ok: true };
  } catch (e) {
    console.error("verifyOnboardingKey exception:", e);
    return { ok: false, reason: "exception" };
  }
}
__name(verifyOnboardingKey, "verifyOnboardingKey");
__name2(verifyOnboardingKey, "verifyOnboardingKey");
async function verifyStudioTokenOrLegacy({ token, secret, supabaseUrl, supabaseKey }) {
  if (!token || typeof token !== "string") return null;
  const hmac = await verifyStudioToken(token, secret);
  if (hmac?.valid) return { tenantId: hmac.tenantId, exp: hmac.exp, shouldRefresh: hmac.shouldRefresh, source: "hmac" };
  if (hmac && !hmac.valid && hmac.reason === "expired") return null;
  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/tenants?studio_token=eq.${encodeURIComponent(token)}&select=id`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return { tenantId: rows[0].id, source: "legacy-uuid" };
  } catch {
    return null;
  }
}
__name(verifyStudioTokenOrLegacy, "verifyStudioTokenOrLegacy");
__name2(verifyStudioTokenOrLegacy, "verifyStudioTokenOrLegacy");
var SUPABASE_URL3 = "https://bfzuxxuscyplfoimvomh.supabase.co";
var ADMIN_EMAIL = "lmf4200@gmail.com";
async function verifyAdmin(authHeader, supabaseKey) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  try {
    const r = await fetch(`${SUPABASE_URL3}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: authHeader }
    });
    if (!r.ok) return false;
    const u = await r.json();
    return u.email === ADMIN_EMAIL;
  } catch {
    return false;
  }
}
__name(verifyAdmin, "verifyAdmin");
__name2(verifyAdmin, "verifyAdmin");
async function supaFetch3(env, path) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  return fetch(`${SUPABASE_URL3}${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
}
__name(supaFetch3, "supaFetch3");
__name2(supaFetch3, "supaFetch");
async function onRequest7(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: TOOL_HEADERS });
  if (request.method !== "POST") return toolJson({ ok: false, error: "method-not-allowed" }, 405);
  let input;
  try {
    input = await request.json();
  } catch {
    return toolJson({ ok: false, error: "invalid-json" }, 400);
  }
  const { tenant_id, tamanho_cm, estilo, regiao, cor_bool, nivel_detalhe, studio_token } = input || {};
  if (!tenant_id) return toolJson({ ok: false, error: "tenant_id obrigatorio" }, 400);
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const authHeader = request.headers.get("Authorization") || "";
  const tokenViaBody = studio_token;
  const tokenViaHeader = request.headers.get("X-Studio-Token");
  const studio_tok = tokenViaBody || tokenViaHeader;
  let authorized = false;
  if (await verifyAdmin(authHeader, SB_KEY)) {
    authorized = true;
  } else if (studio_tok) {
    const verified = await verifyStudioTokenOrLegacy({
      token: studio_tok,
      secret: env.STUDIO_TOKEN_SECRET,
      supabaseUrl: SUPABASE_URL3,
      supabaseKey: SB_KEY
    });
    if (verified && verified.tenantId === tenant_id) authorized = true;
  }
  if (!authorized) {
    return toolJson({ ok: false, error: "unauthorized" }, 401);
  }
  let tenant;
  try {
    tenant = await loadConfigPrecificacao((path) => supaFetch3(env, path), tenant_id);
  } catch (e) {
    return toolJson({ ok: false, error: "db-error", detail: String(e?.message || e) }, 500);
  }
  if (!tenant) return toolJson({ ok: false, error: "tenant-nao-encontrado" }, 404);
  const result = calcularOrcamento({ tamanho_cm, estilo, regiao, cor_bool, nivel_detalhe }, tenant);
  if (result.ok === false) return toolJson(result, 400);
  return toolJson({ ...result, preview: true }, 200);
}
__name(onRequest7, "onRequest7");
__name2(onRequest7, "onRequest");
var GATILHOS_DEFAULT = ["cobertura", "retoque", "rosto", "mao", "pescoco", "menor_idade"];
var EMOJI_RULES = {
  nenhum: "NAO use emojis em nenhuma mensagem.",
  raro: "Emoji no maximo 1 a cada 3 mensagens. Prefira mensagens sem emoji.",
  moderado: "Use no maximo 1 emoji por mensagem, quando encaixar naturalmente.",
  muitos: "Pode usar emojis mais livremente, mas sem exagero."
};
var TOM_DESC = {
  descontraido: "Tom descontraido, proximo, uso de girias moderado.",
  amigavel: "Tom amigavel e acolhedor, portugues claro, sem formalidade.",
  profissional: "Tom profissional e polido, mas nao corporativo.",
  zoeiro: "Tom bem-humorado, pode zoar de leve, girias brasileiras.",
  formal: "Tom formal e elegante. Evita girias."
};
function quoteList(arr) {
  if (!Array.isArray(arr) || !arr.length) return "";
  return arr.map((e) => `"${e}"`).join(", ");
}
__name(quoteList, "quoteList");
__name2(quoteList, "quoteList");
function identidade(tenant) {
  const nomeAg = tenant.nome_agente || "atendente";
  const nomeEst = tenant.nome_estudio || "estudio";
  const persona = (tenant.config_agente?.persona_livre || "").trim() || "Brasileira, descontraida, atende bem. Nao formal, mas tambem nao forcadamente informal.";
  return `# \xA71 IDENTIDADE

Voce e ${nomeAg}, atendente humana do estudio de tatuagem "${nomeEst}" no WhatsApp.

${persona}`;
}
__name(identidade, "identidade");
__name2(identidade, "identidade");
function tom(tenant) {
  const cfg = tenant.config_agente || {};
  const linhas = ["# \xA72 TOM"];
  linhas.push("- Mensagens curtas: 1-2 linhas, maximo 200 caracteres.");
  linhas.push("- Uma pergunta por vez. Nunca 2 ou 3 juntas.");
  if (cfg.tom && TOM_DESC[cfg.tom]) {
    linhas.push(`- ${TOM_DESC[cfg.tom]}`);
  }
  const emojiLevel = cfg.emoji_level || "raro";
  linhas.push(`- ${EMOJI_RULES[emojiLevel] || EMOJI_RULES.raro}`);
  if (cfg.usa_giria === true) {
    linhas.push('- Pode usar girias brasileiras: "massa", "show", "fechou", "top", "tranquilo". Contracoes naturais: "pra", "ta", "ce".');
  } else if (cfg.usa_giria === false) {
    linhas.push('- Portugues padrao, sem girias. Use "para", "esta", "voce".');
  }
  const proibidasDefault = ["caro cliente", "a sua disposicao", "gostaria de", "atenciosamente", "prezado", "feliz em conhecer", "que legal", "ja tenho algumas informacoes", "entao vamos la", "prazer em conhecer"];
  const proibidasCustom = Array.isArray(cfg.expressoes_proibidas) ? cfg.expressoes_proibidas : [];
  const proibidasAll = Array.from(/* @__PURE__ */ new Set([...proibidasDefault, ...proibidasCustom]));
  linhas.push(`- NUNCA use: ${quoteList(proibidasAll)}.`);
  const frases = cfg.frases_naturais || {};
  const fs = [];
  if (Array.isArray(frases.saudacao) && frases.saudacao.length) fs.push(`saudacoes (${quoteList(frases.saudacao)})`);
  if (Array.isArray(frases.confirmacao) && frases.confirmacao.length) fs.push(`confirmacoes (${quoteList(frases.confirmacao)})`);
  if (Array.isArray(frases.encerramento) && frases.encerramento.length) fs.push(`encerramentos (${quoteList(frases.encerramento)})`);
  if (fs.length) linhas.push(`- Repertorio variado de ${fs.join(", ")} \u2014 alterne, nao repita a mesma palavra toda msg.`);
  linhas.push("- NUNCA cumprimente 2x na mesma conversa.");
  linhas.push('- NUNCA comece mensagens com preambulos tipo "Show! Entao vamos la", "Perfeito! Agora", "Entendi, entao". Va direto.');
  linhas.push('- NUNCA responda so com 1 palavra ("Show!", "Ok!") \u2014 sempre complete com pergunta ou continuacao.');
  if (cfg.usa_identificador === true) {
    linhas.push(`- Formato de mensagem: prefixe APENAS a primeira msg do primeiro contato com "${tenant.nome_agente || "Atendente"}:" seguido de quebra de linha. Mensagens subsequentes sao texto puro, SEM prefixo.`);
  } else {
    linhas.push('- NUNCA escreva seu proprio nome como prefixo (tipo "Isabela:"). Responde em texto puro.');
  }
  return linhas.join("\n");
}
__name(tom, "tom");
__name2(tom, "tom");
function fluxo(tenant, clientContext) {
  const isEstudio = tenant.plano === "estudio" || tenant.plano === "premium";
  const nomeAg = tenant.nome_agente || "atendente";
  const nomeEst = tenant.nome_estudio || "estudio";
  const linhas = ["# \xA73 FLUXO"];
  linhas.push("Sua missao: coletar dados pra orcar e agendar tatuagens.");
  linhas.push("");
  linhas.push("## \xA73.1 Saudacao inicial (so no PRIMEIRO turno do PRIMEIRO contato)");
  linhas.push("Envie em 2 baloes separados por \\n\\n:");
  linhas.push('- Balao 1 (apresentacao): variacao de "Oii, tudo bem? Aqui e ' + nomeAg + " do " + nomeEst + '"');
  if (isEstudio) {
    linhas.push('- Balao 2 (pergunta): "Me conta o que esta pensando em fazer, ja te direciono pro tatuador certo do estilo."');
  } else {
    linhas.push('- Balao 2 (pergunta): "Me conta o que esta pensando em fazer?"');
  }
  linhas.push("Apos o primeiro contato, nao se apresenta mais. Em conversas subsequentes, va direto na pergunta.");
  linhas.push("");
  linhas.push("## \xA73.2 Coleta (ordem obrigatoria, UMA etapa por turno)");
  linhas.push("1. LOCAL do corpo (antebraco, biceps, ombro, costela, perna, etc)");
  linhas.push("2. FOTO do local (cliente pode pular \u2014 se recusar, siga sem)");
  linhas.push("3. TAMANHO aproximado em cm (altura)");
  linhas.push("4. ESTILO + referencia (opcional)");
  linhas.push("");
  linhas.push('Se o cliente adiantar uma info, NAO repita a pergunta. Valide ("Massa!") e siga pra proxima etapa faltante.');
  linhas.push("");
  linhas.push("## \xA73.3 Orcamento");
  linhas.push("Chame `calcular_orcamento` apenas quando tiver TODOS os dados (tamanho, estilo, regiao, cor, detalhe).");
  linhas.push("");
  linhas.push("A resposta da tool tem um campo `valor_tipo`. Adapte o discurso:");
  linhas.push("");
  linhas.push('**Se `valor_tipo === "faixa"`** (bot apresenta faixa + valor final com tatuador):');
  linhas.push('1. "Pelo estilo X, fica entre R$ Y e R$ Z."');
  linhas.push('2. "O valor final e passado diretamente pelo tatuador."');
  linhas.push('3. "Gostaria de agendar? Apos confirmar o horario, passo essas infos pra ele finalizar os detalhes."');
  linhas.push("");
  linhas.push('**Se `valor_tipo === "exato"`** (bot apresenta valor fechado):');
  linhas.push('1. "Pelo estilo X, fica em R$ Y."');
  linhas.push('2. "Gostaria de agendar? O tatuador finaliza os detalhes com voce apos o agendamento."');
  linhas.push('(NAO diga "entre X e Y" nem "valor final pelo tatuador" quando valor_tipo=exato \u2014 e valor fechado)');
  linhas.push("");
  linhas.push("**Se `pode_fazer === false`:** NAO apresente preco. Chame `acionar_handoff` com o motivo_recusa_texto. Ex:");
  linhas.push('- tamanho_excede_limite_sessao: "Peca desse tamanho pede avaliacao presencial, vou chamar o tatuador"');
  linhas.push('- estilo_recusado: "Esse estilo a gente nao trabalha, mas posso te direcionar pra outro estudio se quiser"');
  linhas.push('- valor_excede_teto: "Peca complexa, o tatuador precisa avaliar pessoalmente"');
  linhas.push("");
  linhas.push('**Breakdown (detalhamento do calculo)**: so apresente se cliente perguntar EXPLICITAMENTE ("por que tanto?", "como chegou nesse valor?", "pode explicar?"). Nao confunda reclamacao vaga ("caro...") com pedido de breakdown. Breakdown formato:');
  linhas.push('"Base: R$ X | + Y% por cor | + Z% por regiao = R$ Total"');
  linhas.push("");
  linhas.push('PROIBIDO: "valor final confirmado pessoalmente", "pode mudar", "depende" \u2014 essas frases matam a venda.');
  linhas.push("");
  linhas.push("## \xA73.4 Agendamento");
  linhas.push("1. Cliente aceita preco \u2192 `consultar_horarios_livres` (passe data_preferida se cliente disse, senao vazio).");
  linhas.push('2. Apresente ATE 3 slots usando o campo "legenda" de cada slot (ja formatado em SP-BR). JAMAIS invente dia/horario fora da lista.');
  linhas.push('3. Cliente escolhe 1 \u2192 `reservar_horario` com os valores EXATOS de "inicio"/"fim" ISO-UTC do slot escolhido (nao transforme).');
  linhas.push("4. Em sequencia natural: `gerar_link_sinal` com agendamento_id e valor_sinal (retornado em calcular_orcamento.sinal).");
  linhas.push("");
  linhas.push("## \xA73.5 Envio do link de sinal (formato obrigatorio)");
  linhas.push("Estrutura da mensagem:");
  linhas.push('a) Linha 1: "Pra agendar a gente trabalha com sinal de {sinal_percentual}% do valor, em torno de R$ {valor}."');
  linhas.push('b) Linha em branco, depois URL CRUA em linha propria (campo "link_pagamento" da tool).');
  linhas.push('c) Linha em branco, depois: "O link tem validade de {hold_horas} horas. Se expirar, so me chamar que envio outro."');
  linhas.push("");
  linhas.push("PROIBIDO: markdown [texto](url), < > em volta de URL \u2014 WhatsApp nao renderiza markdown. URL sempre crua em linha propria.");
  linhas.push("");
  linhas.push("## \xA73.6 Pos-link");
  linhas.push("Se cliente avisar que o link venceu ou quer outro: chame `consultar_horarios_livres` pra ver se o slot original ainda esta livre, e depois `gerar_link_sinal` com o MESMO agendamento_id (gera link novo reabrindo o hold).");
  return linhas.join("\n");
}
__name(fluxo, "fluxo");
__name2(fluxo, "fluxo");
function regras(tenant) {
  const gatilhos = Array.isArray(tenant.gatilhos_handoff) && tenant.gatilhos_handoff.length ? tenant.gatilhos_handoff : GATILHOS_DEFAULT;
  const aceitaCobertura = tenant.config_agente?.aceita_cobertura !== false;
  const linhas = ["# \xA74 REGRAS INVIOLAVEIS"];
  linhas.push('**R1.** NUNCA invente preco, horario, tempo de sessao ou quantidade de sessoes. Se cliente perguntar "quanto dura?" ou "quantas sessoes?", responda: "sobre isso quem passa e o tatuador \u2014 ele avalia conforme o detalhe".');
  linhas.push("");
  linhas.push('**R2.** NOME DO CLIENTE: so chame pelo nome se ELE disser na conversa. NUNCA use username/nomeWpp do WhatsApp (vem "iPhone de X", apelidos, nome de outros). Em duvida, saudacao neutra sem nome.');
  linhas.push("");
  linhas.push("**R3.** UMA tool por vez. Excecao unica: `reservar_horario` \u2192 `gerar_link_sinal` em sequencia natural (fazem sentido juntos).");
  linhas.push("");
  linhas.push("**R4.** Apos `calcular_orcamento` retornar, apresente a faixa e PARE. Espere o cliente. Nao encadeie mais tools nesse turno.");
  linhas.push("");
  linhas.push(`**R5.** HANDOFF: chame \`acionar_handoff\` APENAS quando: (a) cliente mencionar explicitamente um gatilho do estudio: ${quoteList(gatilhos)}; (b) cliente pedir explicitamente pra falar com humano; (c) conflito grave (cliente bravo, insulto, fora do escopo). Nunca por "caso complexo" ou "imagem dificil" \u2014 coleta de dados e SUA funcao.`);
  linhas.push("");
  linhas.push("**R6.** COBERTURA DE TATUAGEM ANTIGA:");
  linhas.push('- Detecte se: descricao da foto indica "pele tatuada" no sujeito principal OU cliente mencionou "cobrir", "cobertura", "cover up".');
  linhas.push('- Sempre confirme antes de agir: "Vi que ja tem tattoo nesse local. Seria pra cobertura?"');
  if (aceitaCobertura) {
    linhas.push('- Se cliente confirmar: diga "Pra cobertura, as infos sao tratadas direto com o tatuador \u2014 vou pedir pra ele entrar em contato com voce" e chame `acionar_handoff` com motivo="Orcamento de cobertura".');
  } else {
    linhas.push('- Se cliente confirmar: recuse educadamente \u2014 "Infelizmente nosso estudio nao faz cobertura, trabalhamos so com pecas em pele virgem. Se pensar em uma tattoo nova em outro local, e so me chamar." NAO chame `acionar_handoff`.');
  }
  linhas.push("");
  linhas.push('**R7.** IMAGENS: o workflow injeta descricao textual da foto no historico ("A imagem mostra..."). Regras de interpretacao:');
  linhas.push("- SUJEITO PRINCIPAL (parte em foco / maior area) com pele VAZIA = local candidato.");
  linhas.push("- SUJEITO PRINCIPAL com pele TATUADA = referencia visual (ou cobertura \u2014 ver R6).");
  linhas.push("- Tatuagens em segundo plano = IGNORAR, nao sao o foco.");
  linhas.push('- DIVERGENCIA entre sujeito principal da foto e local que cliente disse: pergunte gentilmente "Vi que a foto mostra {parte_foto} em vez do {parte_falada} \u2014 seria ai que voce quer fazer?" Nao assuma.');
  return linhas.join("\n");
}
__name(regras, "regras");
__name2(regras, "regras");
function contexto(tenant, conversa, clientContext) {
  const cfg = tenant.config_precificacao || {};
  const sinalPct = cfg.sinal_percentual ?? tenant.sinal_percentual ?? 30;
  const h = tenant.horario_funcionamento || {};
  const aceitaCobertura = tenant.config_agente?.aceita_cobertura !== false;
  const aceitos = tenant.config_agente?.estilos_aceitos || [];
  const recusados = tenant.config_agente?.estilos_recusados || [];
  const estado = conversa?.estado || "qualificando";
  const dados = conversa?.dados_coletados || {};
  const ctx = clientContext || {};
  const linhas = ["# \xA75 CONTEXTO"];
  linhas.push("## Estudio");
  linhas.push(`- Sinal: ${sinalPct}% do minimo da faixa do orcamento.`);
  if (Object.keys(h).length) {
    const hstr = Object.entries(h).map(([d, hs]) => `${d} ${hs}`).join(" | ");
    linhas.push(`- Horario: ${hstr}.`);
  }
  if (aceitos.length) linhas.push(`- Estilos em que o estudio e especializado: ${aceitos.join(", ")}. (Outros estilos podem ser consultados.)`);
  if (recusados.length) linhas.push(`- Estilos que NAO faz: ${recusados.join(", ")}.`);
  linhas.push(`- ${aceitaCobertura ? "ACEITA" : "NAO ACEITA"} cobertura (cover up).`);
  if (cfg.tamanho_maximo_sessao_cm) {
    linhas.push(`- Tamanho maximo por sessao: ${cfg.tamanho_maximo_sessao_cm}cm (acima disso = handoff automatico).`);
  }
  const observacoes = (cfg.observacoes_tatuador || "").trim();
  if (observacoes) {
    linhas.push("");
    linhas.push("## Observacoes especificas do tatuador (siga estas regras):");
    linhas.push(observacoes);
  }
  linhas.push("");
  linhas.push("## Cliente");
  if (ctx.is_first_contact) {
    linhas.push("- PRIMEIRO CONTATO do cliente com o estudio.");
  } else if (ctx.eh_recorrente) {
    linhas.push(`- Cliente RECORRENTE (${ctx.total_sessoes || 1} sessao(oes) anterior(es)).`);
    if (ctx.nome_cliente && ctx.nome_cliente.trim().length >= 2) {
      linhas.push(`- Nome (capturado anteriormente): ${ctx.nome_cliente.split(" ")[0]}.`);
    }
  } else {
    linhas.push("- Cliente ja conversou antes, nao se apresente novamente.");
  }
  linhas.push("");
  linhas.push(`## Estado da conversa: ${estado}`);
  const estadoHint = {
    qualificando: "Colete os dados pra poder orcar.",
    orcando: "Ja tem dados. Pode chamar calcular_orcamento.",
    escolhendo_horario: "Cliente quer agendar. Use consultar_horarios_livres.",
    aguardando_sinal: "Slot reservado. Se cliente avisar que link venceu, consultar_horarios_livres + gerar_link_sinal com mesmo agendamento_id.",
    confirmado: "Sinal pago. So duvidas leves. Mudanca de data = handoff.",
    handoff: "NAO RESPONDA. Humano assumiu.",
    expirado: "Slot caiu. Se quer retomar, consultar_horarios_livres + se livre, gerar_link_sinal mesmo agendamento_id."
  };
  linhas.push(estadoHint[estado] || estadoHint.qualificando);
  linhas.push("");
  const dadosLinhas = [];
  if (dados.tema) dadosLinhas.push(`- Tema: ${dados.tema}`);
  if (dados.local) dadosLinhas.push(`- Local: ${dados.local}`);
  if (dados.tamanho_cm) dadosLinhas.push(`- Tamanho: ${dados.tamanho_cm}cm`);
  if (dados.estilo) dadosLinhas.push(`- Estilo: ${dados.estilo}`);
  if (dados.cor_bool !== void 0) dadosLinhas.push(`- Cor: ${dados.cor_bool ? "colorida" : "preto e sombra"}`);
  if (dados.nivel_detalhe) dadosLinhas.push(`- Nivel de detalhe: ${dados.nivel_detalhe}`);
  if (dados.nome) dadosLinhas.push(`- Nome do cliente (capturado): ${dados.nome}`);
  if (conversa?.orcamento_min && conversa?.orcamento_max) dadosLinhas.push(`- Orcamento ja calculado: R$ ${conversa.orcamento_min} a R$ ${conversa.orcamento_max}`);
  if (dadosLinhas.length) {
    linhas.push("## Dados ja coletados nesta conversa (NAO pergunte de novo)");
    linhas.push(...dadosLinhas);
  }
  return linhas.join("\n");
}
__name(contexto, "contexto");
__name2(contexto, "contexto");
function faqBlock(tenant) {
  const faq = (tenant.faq_texto || "").trim();
  if (!faq) return "";
  return `# \xA76 FAQ DO ESTUDIO
${faq}`;
}
__name(faqBlock, "faqBlock");
__name2(faqBlock, "faqBlock");
function fewShotBase(tenant) {
  const nomeAg = tenant.nome_agente || "atendente";
  const nomeEst = tenant.nome_estudio || "estudio";
  return `# \xA77 EXEMPLOS DE CONVERSAS IDEAIS

## Exemplo 1 \u2014 Fluxo padrao completo

Cliente: oi, quero uma tatuagem
Voce: Oii, tudo bem? Aqui e ${nomeAg} do ${nomeEst}\\n\\nMe conta o que esta pensando em fazer?

Cliente: um leao no braco
Voce: Massa! Em qual parte do braco \u2014 antebraco, biceps ou ombro?

Cliente: biceps
Voce: Show. Manda uma foto do local pra eu ver o espaco disponivel?

Cliente: [manda foto]
Voce: Recebi. E o tamanho aproximado? Tipo 10, 15, 20cm de altura?

Cliente: uns 15
Voce: Fechou. Qual estilo voce quer? Se tiver referencia pode mandar tambem.

Cliente: realismo, mandei essa ref [foto]
Voce: [chama calcular_orcamento] Show! Pelo estilo realista detalhado, fica entre R$ 1.200 e R$ 1.800. O valor final e passado diretamente pelo tatuador. Gostaria de agendar? Apos confirmar o horario, passo essas infos pra ele finalizar os detalhes.

Cliente: quero, pode ser semana que vem
Voce: [chama consultar_horarios_livres] Tenho esses horarios:
- quinta-feira de 10:00 as 13:00
- sexta-feira de 10:00 as 13:00
- sexta-feira de 13:00 as 16:00
Qual fica melhor pra voce?

Cliente: sexta 10h
Voce: [chama reservar_horario + gerar_link_sinal] Beleza, reservei sexta-feira das 10:00 as 13:00.

Pra agendar a gente trabalha com sinal de 30% do valor, em torno de R$ 360. Aqui o link:
https://mercadopago.com.br/checkout/v1/redirect?pref_id=XXXXX

O link tem validade de 48 horas. Se expirar, so me chamar que envio outro.

## Exemplo 2 \u2014 Cliente sem referencia visual

Cliente: quero uma tattoo
Voce: Show! Em qual lugar do corpo voce quer fazer?

Cliente: panturrilha
Voce: Beleza. Tem uma foto do local pra me mandar?

Cliente: nao precisa
Voce: Tranquilo. Qual o tamanho aproximado? Tipo 8cm, 12cm de altura?

Cliente: 10
Voce: Qual estilo voce tem em mente?

Cliente: uma rosa fineline, sem referencia
Voce: [chama calcular_orcamento] Massa. Rosa fineline de 10cm fica entre R$ 350 e R$ 600. O valor final quem fecha e o tatuador. Bora agendar? Quando marcar, te direciono pra ele acertar os ultimos detalhes.

## Exemplo 3 \u2014 Cobertura detectada pela foto

Cliente: quero uma tatuagem no antebraco
Voce: Massa! Manda uma foto do local?

Cliente: [foto] [descricao injetada: "Sujeito principal: antebraco direito com pele tatuada"]
Voce: Vi que voce ja tem uma tatuagem nesse local. Seria pra cobertura?

Cliente: sim
Voce: [chama acionar_handoff motivo="Orcamento de cobertura"] Fechou! Pra cobertura, as infos sao tratadas direto com o tatuador \u2014 vou pedir pra ele entrar em contato.

## Exemplo 4 \u2014 Divergencia de local + cliente adiantou tema

Cliente: quero um leao no braco
Voce: Massa! Em qual parte do braco \u2014 antebraco, biceps ou ombro?

Cliente: [manda foto mostrando canela + "nessa parte"]
Voce: Vi que a foto mostra a canela em vez do braco que voce falou \u2014 seria entao na canela que voce quer fazer, ou foi so de referencia do corpo?

Cliente: foi engano, e no braco mesmo
Voce: Beleza. Antebraco, biceps ou ombro?`;
}
__name(fewShotBase, "fewShotBase");
__name2(fewShotBase, "fewShotBase");
function fewShotTenant(tenant) {
  const ex = tenant.config_agente?.few_shot_exemplos || [];
  if (!Array.isArray(ex) || ex.length === 0) return "";
  const formatado = ex.map((e, i) => {
    if (typeof e === "string") return `### Exemplo customizado ${i + 1}
${e}`;
    if (e && typeof e === "object" && e.cliente && e.agente) {
      return `### Exemplo customizado ${i + 1}
Cliente: ${e.cliente}
Voce: ${e.agente}`;
    }
    return "";
  }).filter(Boolean).join("\n\n");
  return formatado ? `# \xA77b EXEMPLOS CUSTOMIZADOS DO ESTUDIO
${formatado}` : "";
}
__name(fewShotTenant, "fewShotTenant");
__name2(fewShotTenant, "fewShotTenant");
function generateSystemPrompt(tenant, conversa, clientContext) {
  const ctx = clientContext || {};
  const blocks = [
    identidade(tenant),
    tom(tenant),
    fluxo(tenant, ctx),
    regras(tenant),
    contexto(tenant, conversa, ctx),
    faqBlock(tenant),
    fewShotTenant(tenant),
    fewShotBase(tenant)
  ].filter((b) => b && b.trim().length > 0);
  return blocks.join("\n\n---\n\n");
}
__name(generateSystemPrompt, "generateSystemPrompt");
__name2(generateSystemPrompt, "generateSystemPrompt");
var TENANT_FIELDS = [
  "id",
  "nome_agente",
  "nome_estudio",
  "plano",
  "prompt_sistema",
  "faq_texto",
  "config_precificacao",
  "config_agente",
  "horario_funcionamento",
  "duracao_sessao_padrao_h",
  "sinal_percentual",
  "gatilhos_handoff",
  "portfolio_urls"
].join(",");
async function loadContext(env, tenant_id, telefone) {
  const [tr, cr, ar] = await Promise.all([
    supaFetch2(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=${TENANT_FIELDS}`),
    telefone ? supaFetch2(env, `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&select=id,estado,dados_coletados,slot_expira_em`) : Promise.resolve(null),
    telefone ? supaFetch2(env, `/rest/v1/agendamentos?tenant_id=eq.${encodeURIComponent(tenant_id)}&cliente_telefone=eq.${encodeURIComponent(telefone)}&status=in.(confirmed,done)&select=id,cliente_nome,status&order=created_at.desc&limit=5`) : Promise.resolve(null)
  ]);
  if (!tr.ok) throw new Error(`tenant-db-error-${tr.status}`);
  const tenants = await tr.json();
  if (!Array.isArray(tenants) || tenants.length === 0) return { tenant: null };
  const tenant = tenants[0];
  let conversa = null;
  if (cr && cr.ok) {
    const rows = await cr.json();
    if (Array.isArray(rows) && rows.length > 0) conversa = rows[0];
  }
  let agendamentos_passados = [];
  if (ar && ar.ok) {
    const rows = await ar.json();
    if (Array.isArray(rows)) agendamentos_passados = rows;
  }
  const is_first_contact = !conversa && agendamentos_passados.length === 0;
  const nome_cliente = conversa?.dados_coletados?.nome || agendamentos_passados[0]?.cliente_nome || null;
  const clientContext = {
    is_first_contact,
    eh_recorrente: agendamentos_passados.length > 0,
    total_sessoes: agendamentos_passados.length,
    nome_cliente
  };
  return { tenant, conversa, clientContext };
}
__name(loadContext, "loadContext");
__name2(loadContext, "loadContext");
async function handle({ env, input }) {
  const { tenant_id, telefone } = input || {};
  if (!tenant_id) return { status: 400, body: { ok: false, error: "tenant_id obrigatorio" } };
  const { tenant, conversa, clientContext } = await loadContext(env, tenant_id, telefone);
  if (!tenant) return { status: 404, body: { ok: false, error: "tenant-nao-encontrado" } };
  const prompt = generateSystemPrompt(tenant, conversa, clientContext);
  return {
    status: 200,
    body: {
      ok: true,
      prompt,
      estado: conversa?.estado || "qualificando",
      conversa_id: conversa?.id || null,
      cliente: clientContext,
      tenant: {
        nome_estudio: tenant.nome_estudio,
        nome_agente: tenant.nome_agente
      }
    }
  };
}
__name(handle, "handle");
__name2(handle, "handle");
async function onRequest8(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: TOOL_HEADERS });
  const auth = authTool(request, env);
  if (!auth.ok) return toolJson({ ok: false, error: auth.reason }, 401);
  let input = {};
  if (request.method === "GET") {
    const url = new URL(request.url);
    input.tenant_id = url.searchParams.get("tenant_id");
    input.telefone = url.searchParams.get("telefone");
  } else if (request.method === "POST") {
    try {
      input = await request.json();
    } catch {
      return toolJson({ ok: false, error: "invalid-json" }, 400);
    }
  } else {
    return toolJson({ ok: false, error: "method-not-allowed" }, 405);
  }
  const t0 = Date.now();
  let res, erro = null, sucesso = false;
  try {
    res = await handle({ env, input });
    sucesso = (res?.status ?? 200) < 400;
  } catch (e) {
    erro = String(e?.message || e);
    res = { status: 500, body: { ok: false, error: "internal", detail: erro } };
  }
  const latency_ms = Date.now() - t0;
  context.waitUntil(logToolCall(env, {
    tenant_id: input?.tenant_id,
    telefone: input?.telefone,
    tool: "prompt",
    input,
    output: res.body,
    sucesso,
    latency_ms,
    erro
  }));
  return toolJson(res.body, res.status || 200);
}
__name(onRequest8, "onRequest8");
__name2(onRequest8, "onRequest");
var HOLD_MIN2 = 2880;
var onRequest9 = withTool("reservar_horario", async ({ env, input }) => {
  const { tenant_id, telefone, nome, inicio, fim, descricao } = input || {};
  if (!tenant_id || !telefone || !inicio || !fim) {
    return { status: 400, body: { ok: false, error: "tenant_id, telefone, inicio e fim obrigatorios" } };
  }
  const di = new Date(inicio);
  const df = new Date(fim);
  if (!Number.isFinite(di.getTime()) || !Number.isFinite(df.getTime()) || df <= di) {
    return { status: 400, body: { ok: false, error: "inicio/fim invalidos" } };
  }
  if (di.getTime() < Date.now()) {
    return { status: 400, body: { ok: false, error: "inicio no passado" } };
  }
  const cRes = await supaFetch2(
    env,
    `/rest/v1/agendamentos?tenant_id=eq.${encodeURIComponent(tenant_id)}&status=in.(tentative,confirmed)&inicio=lt.${encodeURIComponent(df.toISOString())}&fim=gt.${encodeURIComponent(di.toISOString())}&select=id`
  );
  if (cRes.ok) {
    const conflitos = await cRes.json();
    if (Array.isArray(conflitos) && conflitos.length > 0) {
      return { status: 409, body: { ok: false, error: "slot-ocupado", code: "slot_taken" } };
    }
  }
  const selConv = await supaFetch2(env, `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&select=id,dados_coletados`);
  const convs = selConv.ok ? await selConv.json() : [];
  const slotExpira = new Date(Date.now() + HOLD_MIN2 * 6e4).toISOString();
  let conversa_id;
  if (Array.isArray(convs) && convs.length > 0) {
    conversa_id = convs[0].id;
    const dadosMerge = { ...convs[0].dados_coletados || {}, nome, ultimo_slot_proposto: inicio };
    await supaFetch2(env, `/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        estado: "aguardando_sinal",
        slot_expira_em: slotExpira,
        dados_coletados: dadosMerge,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      })
    });
  } else {
    const insC = await supaFetch2(env, "/rest/v1/conversas", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        tenant_id,
        telefone,
        estado: "aguardando_sinal",
        dados_coletados: { nome, ultimo_slot_proposto: inicio },
        slot_expira_em: slotExpira
      })
    });
    if (insC.ok) {
      const c = await insC.json();
      conversa_id = c[0]?.id;
    }
  }
  const insA = await supaFetch2(env, "/rest/v1/agendamentos", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      tenant_id,
      conversa_id,
      cliente_nome: nome || null,
      cliente_telefone: telefone,
      inicio: di.toISOString(),
      fim: df.toISOString(),
      status: "tentative"
    })
  });
  if (!insA.ok) {
    return { status: 500, body: { ok: false, error: "agendamento-falhou", detail: await insA.text() } };
  }
  const [ag] = await insA.json();
  if (conversa_id) {
    await supaFetch2(env, `/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}`, {
      method: "PATCH",
      body: JSON.stringify({ slot_tentative_id: ag.id })
    });
  }
  return {
    status: 200,
    body: {
      ok: true,
      agendamento_id: ag.id,
      conversa_id,
      expira_em: slotExpira,
      hold_minutos: HOLD_MIN2,
      hold_horas: Math.round(HOLD_MIN2 / 60),
      descricao: descricao || null
    }
  };
});
var SUPABASE_URL4 = "https://bfzuxxuscyplfoimvomh.supabase.co";
var ADMIN_EMAIL2 = "lmf4200@gmail.com";
var DAILY_LIMIT = 50;
var MINUTE_LIMIT = 5;
async function verifyAdmin2(authHeader, supabaseKey) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  try {
    const r = await fetch(`${SUPABASE_URL4}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: authHeader }
    });
    if (!r.ok) return false;
    const u = await r.json();
    return u.email === ADMIN_EMAIL2;
  } catch {
    return false;
  }
}
__name(verifyAdmin2, "verifyAdmin2");
__name2(verifyAdmin2, "verifyAdmin");
async function supaFetch4(env, path, init = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  return fetch(`${SUPABASE_URL4}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
}
__name(supaFetch4, "supaFetch4");
__name2(supaFetch4, "supaFetch");
async function checkAndBumpUsage(env, tenant_id, configAgente) {
  const tz = /* @__PURE__ */ new Date();
  const hojeIso = tz.toISOString().slice(0, 10);
  const agoraMs = Date.now();
  const um_minuto_atras = agoraMs - 6e4;
  const usage = configAgente && configAgente.tester_usage || {};
  let contagem_hoje = (usage.data === hojeIso ? usage.count : 0) || 0;
  let ultimas = Array.isArray(usage.ultimas_ms) ? usage.ultimas_ms : [];
  ultimas = ultimas.filter((ms) => ms > um_minuto_atras);
  if (contagem_hoje >= DAILY_LIMIT) {
    return { ok: false, error: "daily_limit_reached", usage: { today: contagem_hoje, limit: DAILY_LIMIT } };
  }
  if (ultimas.length >= MINUTE_LIMIT) {
    return { ok: false, error: "minute_limit_reached", usage: { today: contagem_hoje, limit: DAILY_LIMIT }, retry_after_s: 60 };
  }
  contagem_hoje += 1;
  ultimas.push(agoraMs);
  const novoTester = { data: hojeIso, count: contagem_hoje, ultimas_ms: ultimas };
  const novoConfig = { ...configAgente || {}, tester_usage: novoTester };
  await supaFetch4(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}`, {
    method: "PATCH",
    body: JSON.stringify({ config_agente: novoConfig })
  });
  return { ok: true, usage: { today: contagem_hoje, limit: DAILY_LIMIT } };
}
__name(checkAndBumpUsage, "checkAndBumpUsage");
__name2(checkAndBumpUsage, "checkAndBumpUsage");
var TOOL_SCHEMA_CALC = {
  type: "function",
  function: {
    name: "calcular_orcamento",
    description: "Calcula valor/faixa de pre\xE7o com base em tamanho, estilo, regi\xE3o e cor. Use SEMPRE antes de falar valor.",
    parameters: {
      type: "object",
      properties: {
        tamanho_cm: { type: "number", description: "Tamanho em cm de altura" },
        estilo: { type: "string", description: "Estilo (blackwork, fineline, realismo, tradicional, etc)" },
        regiao: { type: "string", description: "Regi\xE3o do corpo (antebraco, biceps, ombro, costela, etc)" },
        cor_bool: { type: "boolean", description: "true se colorida, false se preto e sombra" },
        nivel_detalhe: { type: "string", enum: ["baixo", "medio", "alto"], description: "N\xEDvel de detalhamento" }
      },
      required: ["tamanho_cm", "estilo", "regiao", "cor_bool", "nivel_detalhe"]
    }
  }
};
async function onRequest10(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: TOOL_HEADERS });
  if (request.method !== "POST") return toolJson({ ok: false, error: "method-not-allowed" }, 405);
  const OPENAI_KEY = env.OPENAI_API_KEY;
  if (!OPENAI_KEY) return toolJson({ ok: false, error: "openai-not-configured" }, 503);
  let input;
  try {
    input = await request.json();
  } catch {
    return toolJson({ ok: false, error: "invalid-json" }, 400);
  }
  const { tenant_id, messages, studio_token } = input || {};
  if (!tenant_id) return toolJson({ ok: false, error: "tenant_id obrigatorio" }, 400);
  if (!Array.isArray(messages) || messages.length === 0) {
    return toolJson({ ok: false, error: "messages obrigatorio (array nao vazio)" }, 400);
  }
  if (messages.length > 30) {
    return toolJson({ ok: false, error: "historico muito longo (max 30 msgs)" }, 400);
  }
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const authHeader = request.headers.get("Authorization") || "";
  const studio_tok = studio_token || request.headers.get("X-Studio-Token");
  let authorized = false;
  if (await verifyAdmin2(authHeader, SB_KEY)) {
    authorized = true;
  } else if (studio_tok) {
    const verified = await verifyStudioTokenOrLegacy({
      token: studio_tok,
      secret: env.STUDIO_TOKEN_SECRET,
      supabaseUrl: SUPABASE_URL4,
      supabaseKey: SB_KEY
    });
    if (verified && verified.tenantId === tenant_id) authorized = true;
  }
  if (!authorized) return toolJson({ ok: false, error: "unauthorized" }, 401);
  const tFields = "id,nome_agente,nome_estudio,plano,faq_texto,config_precificacao,config_agente,horario_funcionamento,duracao_sessao_padrao_h,sinal_percentual,gatilhos_handoff,portfolio_urls,modo_atendimento,parent_tenant_id,is_artist_slot";
  const tRes = await supaFetch4(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=${tFields}`);
  if (!tRes.ok) return toolJson({ ok: false, error: "db-error" }, 500);
  const tenants = await tRes.json();
  if (!tenants.length) return toolJson({ ok: false, error: "tenant-nao-encontrado" }, 404);
  const tenant = tenants[0];
  const usageCheck = await checkAndBumpUsage(env, tenant_id, tenant.config_agente);
  if (!usageCheck.ok) {
    return toolJson({ ok: false, error: usageCheck.error, usage: usageCheck.usage, retry_after_s: usageCheck.retry_after_s }, 429);
  }
  const systemPrompt = generateSystemPrompt(tenant, null, { is_first_contact: messages.length <= 2 });
  const openaiMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 2e3) }))
  ];
  let openaiRes;
  try {
    openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: openaiMessages,
        temperature: 0.7,
        max_tokens: 400,
        tools: [TOOL_SCHEMA_CALC],
        tool_choice: "auto"
      })
    });
  } catch (e) {
    return toolJson({ ok: false, error: "openai-network-error", detail: String(e?.message || e) }, 502);
  }
  if (!openaiRes.ok) {
    const err = await openaiRes.text();
    return toolJson({ ok: false, error: "openai-error", detail: err.slice(0, 500) }, 502);
  }
  const oaiData = await openaiRes.json();
  const choice = oaiData.choices?.[0]?.message;
  if (choice?.tool_calls && choice.tool_calls.length > 0) {
    const toolCall = choice.tool_calls[0];
    if (toolCall.function?.name === "calcular_orcamento") {
      let args = {};
      try {
        args = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
      }
      const tenantFull = await loadConfigPrecificacao((path) => supaFetch4(env, path), tenant_id);
      const toolResult = calcularOrcamento(args, tenantFull);
      const followupRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            ...openaiMessages,
            choice,
            { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(toolResult) }
          ],
          temperature: 0.7,
          max_tokens: 400
        })
      });
      if (followupRes.ok) {
        const followup = await followupRes.json();
        const reply = followup.choices?.[0]?.message?.content || "";
        return toolJson({
          ok: true,
          reply,
          tool_call: { name: "calcular_orcamento", args, result: toolResult },
          usage: usageCheck.usage,
          preview: true
        });
      }
    }
  }
  return toolJson({
    ok: true,
    reply: choice?.content || "",
    tool_call: null,
    usage: usageCheck.usage,
    preview: true
  });
}
__name(onRequest10, "onRequest10");
__name2(onRequest10, "onRequest");
var SUPABASE_URL5 = "https://bfzuxxuscyplfoimvomh.supabase.co";
var MP_API2 = "https://api.mercadopago.com";
async function supaFetch5(env, path, init = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  return fetch(`${SUPABASE_URL5}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
}
__name(supaFetch5, "supaFetch5");
__name2(supaFetch5, "supaFetch");
async function processMpSinal(env, paymentId) {
  const MP_TOKEN = env.MP_ACCESS_TOKEN;
  if (!MP_TOKEN) return { ok: false, error: "mp-not-configured" };
  if (!paymentId) return { ok: true, ignored: "no-payment-id" };
  const payRes = await fetch(`${MP_API2}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` }
  });
  if (!payRes.ok) {
    console.error("mp-sinal-handler: erro buscando payment", payRes.status);
    return { ok: true, ignored: "payment-fetch-failed" };
  }
  const payment = await payRes.json();
  const externalRef = payment.external_reference || "";
  const match2 = externalRef.match(/^sinal:([a-f0-9-]+)$/i);
  if (!match2) {
    return { ok: true, ignored: "not-a-sinal", external_reference: externalRef };
  }
  const agendamento_id = match2[1];
  if (payment.status !== "approved") {
    console.log(`mp-sinal-handler: payment ${paymentId} status=${payment.status} agendamento=${agendamento_id}`);
    return { ok: true, ignored: "not-approved", status: payment.status, agendamento_id };
  }
  const updRes = await supaFetch5(env, `/rest/v1/agendamentos?id=eq.${encodeURIComponent(agendamento_id)}&status=eq.tentative`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: "confirmed",
      sinal_pago_em: (/* @__PURE__ */ new Date()).toISOString(),
      mp_payment_id: String(paymentId)
    })
  });
  if (!updRes.ok) {
    console.error("mp-sinal-handler: erro promovendo agendamento", await updRes.text());
    return { ok: true, ignored: "update-failed", agendamento_id };
  }
  const updated = await updRes.json();
  if (!Array.isArray(updated) || updated.length === 0) {
    return { ok: true, ignored: "already-processed", agendamento_id };
  }
  const ag = updated[0];
  if (ag.cliente_telefone && ag.tenant_id) {
    await supaFetch5(env, `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(ag.tenant_id)}&telefone=eq.${encodeURIComponent(ag.cliente_telefone)}`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "confirmado", updated_at: (/* @__PURE__ */ new Date()).toISOString() })
    });
  }
  console.log(`mp-sinal-handler: agendamento ${agendamento_id} confirmado via payment ${paymentId}`);
  return {
    ok: true,
    processed: true,
    agendamento_id,
    status: "confirmed",
    payment_id: String(paymentId)
  };
}
__name(processMpSinal, "processMpSinal");
__name2(processMpSinal, "processMpSinal");
function isSinalCandidateEvent({ type, topic }) {
  const t = (type || topic || "").toLowerCase();
  return t === "payment" || t.includes("payment");
}
__name(isSinalCandidateEvent, "isSinalCandidateEvent");
__name2(isSinalCandidateEvent, "isSinalCandidateEvent");
function json2(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
__name(json2, "json2");
__name2(json2, "json");
async function verifyMpSig(request, env, dataId) {
  const secret = env.MP_WEBHOOK_SECRET;
  if (!secret) return { ok: true, reason: "secret-missing" };
  const sig = request.headers.get("x-signature");
  const reqId = request.headers.get("x-request-id");
  if (!sig || !reqId || !dataId) return { ok: false, reason: "headers-missing" };
  const tsMatch = sig.match(/ts=([^,]+)/);
  const v1Match = sig.match(/v1=([a-f0-9]+)/);
  if (!tsMatch || !v1Match) return { ok: false, reason: "sig-malformed" };
  const manifest = `id:${dataId};request-id:${reqId};ts:${tsMatch[1]};`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(manifest));
  const hex = Array.from(new Uint8Array(sigBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return { ok: hex === v1Match[1], reason: hex === v1Match[1] ? "ok" : "sig-mismatch" };
}
__name(verifyMpSig, "verifyMpSig");
__name2(verifyMpSig, "verifyMpSig");
async function onRequest11(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") return json2({ error: "method-not-allowed" }, 405);
  const url = new URL(request.url);
  const dataId = url.searchParams.get("data.id") || url.searchParams.get("id");
  let body = {};
  try {
    body = await request.json();
  } catch {
  }
  const paymentId = dataId || body?.data?.id || body?.id;
  const sigCheck = await verifyMpSig(request, env, paymentId);
  if (!sigCheck.ok) {
    console.warn("webhooks/mp-sinal: assinatura invalida", sigCheck);
    return json2({ error: "invalid-signature" }, 401);
  }
  const result = await processMpSinal(env, paymentId);
  return json2(result);
}
__name(onRequest11, "onRequest11");
__name2(onRequest11, "onRequest");
var SUPABASE_URL6 = "https://bfzuxxuscyplfoimvomh.supabase.co";
var CORS = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
function json3(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
__name(json3, "json3");
__name2(json3, "json");
async function onRequest12(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json3({ error: "Method not allowed" }, 405);
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  const CLEANUP_SECRET = env.CLEANUP_SECRET;
  if (!CLEANUP_SECRET || token !== CLEANUP_SECRET) {
    return json3({ error: "N\xE3o autorizado" }, 401);
  }
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json3({ error: "Configura\xE7\xE3o interna ausente" }, 503);
  try {
    const sbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1e3).toISOString();
    const cutoff72h = new Date(Date.now() - 72 * 60 * 60 * 1e3).toISOString();
    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3).toISOString();
    const q1 = fetch(
      `${SUPABASE_URL6}/rest/v1/tenants?status_pagamento=eq.rascunho&mp_subscription_id=is.null&created_at=lt.${encodeURIComponent(cutoff48h)}&select=id,nome_estudio,email,created_at,evo_instance,status_pagamento`,
      { headers: sbHeaders }
    );
    const q2 = fetch(
      `${SUPABASE_URL6}/rest/v1/tenants?status_pagamento=eq.pendente&ativo=eq.false&mp_subscription_id=is.null&created_at=lt.${encodeURIComponent(cutoff72h)}&select=id,nome_estudio,email,created_at,evo_instance,status_pagamento`,
      { headers: sbHeaders }
    );
    const q3 = fetch(
      `${SUPABASE_URL6}/rest/v1/tenants?status_pagamento=eq.artist_slot&ativo=eq.false&created_at=lt.${encodeURIComponent(cutoff7d)}&select=id,nome_estudio,email,created_at,evo_instance,status_pagamento`,
      { headers: sbHeaders }
    );
    const [res1, res2, res3] = await Promise.all([q1, q2, q3]);
    if (!res1.ok || !res2.ok || !res3.ok) {
      const errText = (!res1.ok ? await res1.text() : "") || (!res2.ok ? await res2.text() : "") || await res3.text();
      console.error("cleanup-tenants: search error:", errText);
      return json3({ error: "Erro ao buscar tenants" }, 500);
    }
    const [list1, list2, list3] = await Promise.all([res1.json(), res2.json(), res3.json()]);
    const seen = /* @__PURE__ */ new Set();
    const staleTeams = [];
    for (const t of [...list1, ...list2, ...list3]) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        staleTeams.push(t);
      }
    }
    if (!staleTeams || staleTeams.length === 0) {
      return json3({ cleaned: 0, message: "Nenhum rascunho antigo encontrado" });
    }
    const results = [];
    const EVO_BASE_URL = env.EVO_BASE_URL || "https://evo.inkflowbrasil.com";
    const EVO_GLOBAL_KEY = env.EVO_GLOBAL_KEY || "";
    for (const tenant of staleTeams) {
      let evoDeleted = false;
      if (tenant.evo_instance) {
        try {
          const evoRes = await fetch(
            `${EVO_BASE_URL}/instance/delete/${encodeURIComponent(tenant.evo_instance)}`,
            {
              method: "DELETE",
              headers: { apikey: EVO_GLOBAL_KEY }
            }
          );
          evoDeleted = evoRes.ok;
          if (evoRes.ok) {
            console.log(`cleanup-tenants: deleted EVO instance '${tenant.evo_instance}'`);
          } else {
            console.warn(`cleanup-tenants: EVO delete failed for '${tenant.evo_instance}':`, await evoRes.text());
          }
        } catch (evoErr) {
          console.warn(`cleanup-tenants: EVO delete error for '${tenant.evo_instance}':`, evoErr.message);
        }
      }
      const delRes = await fetch(
        `${SUPABASE_URL6}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant.id)}`,
        {
          method: "DELETE",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            Prefer: "return=minimal"
          }
        }
      );
      results.push({
        id: tenant.id,
        evo_instance: tenant.evo_instance,
        categoria: tenant.status_pagamento,
        evo_deleted: evoDeleted,
        db_deleted: delRes.ok
      });
      if (delRes.ok) {
        console.log(`cleanup-tenants: deleted orphan tenant ${tenant.id} (${tenant.nome_estudio}, status=${tenant.status_pagamento})`);
      } else {
        console.error(`cleanup-tenants: failed to delete ${tenant.id}:`, await delRes.text());
      }
    }
    const cleaned = results.filter((r) => r.db_deleted).length;
    const evoCleanedCount = results.filter((r) => r.evo_deleted).length;
    return json3({
      cleaned,
      evo_cleaned: evoCleanedCount,
      total_found: staleTeams.length,
      by_category: {
        rascunho: results.filter((r) => r.categoria === "rascunho").length,
        pendente: results.filter((r) => r.categoria === "pendente").length,
        artist_slot: results.filter((r) => r.categoria === "artist_slot").length
      },
      details: results
    });
  } catch (err) {
    console.error("cleanup-tenants exception:", err);
    return json3({ error: "Erro interno" }, 500);
  }
}
__name(onRequest12, "onRequest12");
__name2(onRequest12, "onRequest");
var SUPABASE_URL7 = "https://bfzuxxuscyplfoimvomh.supabase.co";
var CORS2 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
function json4(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS2 });
}
__name(json4, "json4");
__name2(json4, "json");
function generateKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "";
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 16; i++) {
    key += chars[arr[i] % chars.length];
  }
  return key;
}
__name(generateKey, "generateKey");
__name2(generateKey, "generateKey");
async function onRequest13(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS2 });
  if (request.method !== "POST") return json4({ error: "Method not allowed" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json4({ error: "JSON inv&#225;lido" }, 400);
  }
  const { tenant_id } = body;
  if (!tenant_id || typeof tenant_id !== "string" || tenant_id.length < 10) {
    return json4({ error: "tenant_id &#233; obrigat&#243;rio" }, 400);
  }
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json4({ error: "Configura&#231;&#227;o interna ausente" }, 503);
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json"
  };
  try {
    const tenantRes = await fetch(
      `${SUPABASE_URL7}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=id,plano,max_artists,ativo,is_artist_slot,google_calendar_id`,
      { headers }
    );
    if (!tenantRes.ok) {
      console.error("create-artist-invite: erro ao buscar tenant:", await tenantRes.text());
      return json4({ error: "Erro ao verificar est&#250;dio" }, 500);
    }
    const tenants = await tenantRes.json();
    if (!tenants || tenants.length === 0) {
      return json4({ error: "Est&#250;dio n&#227;o encontrado" }, 404);
    }
    const tenant = tenants[0];
    if (tenant.is_artist_slot === true) {
      return json4({ error: "Apenas o dono do est&#250;dio pode convidar artistas" }, 403);
    }
    if (!["estudio", "premium"].includes(tenant.plano)) {
      return json4({ error: "Convite de artistas dispon&#237;vel apenas nos planos Est&#250;dio e Premium" }, 403);
    }
    if (tenant.ativo !== true) {
      return json4({ error: "Est&#250;dio precisa estar ativo para convidar artistas" }, 403);
    }
    const countRes = await fetch(
      `${SUPABASE_URL7}/rest/v1/tenants?parent_tenant_id=eq.${encodeURIComponent(tenant_id)}&is_artist_slot=eq.true&select=id`,
      {
        headers: {
          ...headers,
          Prefer: "count=exact"
        }
      }
    );
    if (!countRes.ok) {
      console.error("create-artist-invite: erro ao contar artistas:", await countRes.text());
      return json4({ error: "Erro ao verificar slots" }, 500);
    }
    const contentRange = countRes.headers.get("content-range");
    let currentArtists = 0;
    if (contentRange) {
      const match2 = contentRange.match(/\/(\d+)$/);
      if (match2) currentArtists = parseInt(match2[1], 10);
    }
    const maxArtists = tenant.max_artists || (tenant.plano === "estudio" ? 5 : 10);
    const slotsDisponiveis = maxArtists - 1 - currentArtists;
    if (slotsDisponiveis <= 0) {
      return json4({
        error: `Limite de artistas atingido (${currentArtists} de ${maxArtists - 1} slots usados)`
      }, 409);
    }
    const pendingRes = await fetch(
      `${SUPABASE_URL7}/rest/v1/onboarding_links?parent_tenant_id=eq.${encodeURIComponent(tenant_id)}&is_artist_invite=eq.true&used=eq.false&expires_at=gt.${(/* @__PURE__ */ new Date()).toISOString()}&select=id`,
      {
        headers: {
          ...headers,
          Prefer: "count=exact"
        }
      }
    );
    let pendingInvites = 0;
    if (pendingRes.ok) {
      const pendingRange = pendingRes.headers.get("content-range");
      if (pendingRange) {
        const match2 = pendingRange.match(/\/(\d+)$/);
        if (match2) pendingInvites = parseInt(match2[1], 10);
      }
    }
    if (currentArtists + pendingInvites >= maxArtists - 1) {
      return json4({
        error: `J&#225; existem ${pendingInvites} convite(s) pendente(s). Aguarde serem aceitos ou expirem.`
      }, 409);
    }
    const key = generateKey();
    const insertRes = await fetch(
      `${SUPABASE_URL7}/rest/v1/onboarding_links`,
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          key,
          plano: tenant.plano,
          used: false,
          parent_tenant_id: tenant_id,
          is_artist_invite: true
        })
      }
    );
    if (!insertRes.ok) {
      const err = await insertRes.text();
      console.error("create-artist-invite: erro ao criar link:", err);
      return json4({ error: "Erro ao gerar convite" }, 500);
    }
    const created = await insertRes.json();
    const link = `https://inkflowbrasil.com/onboarding.html?key=${key}`;
    console.log(`create-artist-invite: convite criado para estudio ${tenant_id}, key=${key}, slots restantes=${slotsDisponiveis - 1}`);
    return json4({
      success: true,
      key,
      link,
      expires_at: created[0]?.expires_at,
      slots: {
        used: currentArtists,
        pending_invites: pendingInvites + 1,
        max: maxArtists - 1,
        remaining: slotsDisponiveis - 1
      }
    }, 201);
  } catch (err) {
    console.error("create-artist-invite exception:", err);
    return json4({ error: "Erro interno" }, 500);
  }
}
__name(onRequest13, "onRequest13");
__name2(onRequest13, "onRequest");
async function onRequest14(context) {
  const SUPABASE_URL21 = "https://bfzuxxuscyplfoimvomh.supabase.co";
  const SUPABASE_SERVICE_KEY = context.env.SUPABASE_SERVICE_KEY;
  const ALLOWED_ORIGIN = "https://inkflowbrasil.com";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (context.request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  try {
    const authHeader = context.request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const userRes = await fetch(SUPABASE_URL21 + "/auth/v1/user", {
      headers: { "apikey": SUPABASE_SERVICE_KEY, "Authorization": authHeader }
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const user = await userRes.json();
    const ADMIN_EMAILS = ["lmf4200@gmail.com"];
    if (!ADMIN_EMAILS.includes(user.email)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const body = await context.request.json();
    const key = body.key;
    const plano = body.plano || "individual";
    if (!key || typeof key !== "string" || key.length < 8) {
      return new Response(JSON.stringify({ error: "Key invalida (min 8 caracteres)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const validPlans = ["teste", "individual", "estudio", "premium"];
    if (!validPlans.includes(plano)) {
      return new Response(JSON.stringify({ error: "Plano invalido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const insertRes = await fetch(
      SUPABASE_URL21 + "/rest/v1/onboarding_links",
      {
        method: "POST",
        headers: {
          "apikey": SUPABASE_SERVICE_KEY,
          "Authorization": "Bearer " + SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify({
          key,
          plano,
          used: false
          // expires_at usa o default da tabela: now() + 30 days
        })
      }
    );
    if (!insertRes.ok) {
      const err = await insertRes.text();
      console.error("create-onboarding-link: insert error:", err);
      return new Response(JSON.stringify({ error: "Erro ao criar link" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const created = await insertRes.json();
    return new Response(JSON.stringify({
      success: true,
      key,
      plano,
      expires_at: created[0]?.expires_at
    }), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(onRequest14, "onRequest14");
__name2(onRequest14, "onRequest");
var CORS3 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
var PLANOS = {
  teste: { nome: "InkFlow Teste", valor: 1 },
  // TEMPORÁRIO: remover após teste
  individual: { nome: "InkFlow Individual", valor: 1 },
  // TEMP TESTE: original 197
  estudio: { nome: "InkFlow Est\xFAdio", valor: 1 },
  // TEMP TESTE: original 497
  premium: { nome: "InkFlow Est\xFAdio VIP", valor: 1 }
  // TEMP TESTE: original 997
};
var SUPABASE_URL8 = "https://bfzuxxuscyplfoimvomh.supabase.co";
function json5(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS3 });
}
__name(json5, "json5");
__name2(json5, "json");
async function addToMailerLite(env, email, plano, tenantId) {
  const ML_KEY = env.MAILERLITE_API_KEY;
  const ML_GROUP = env.MAILERLITE_GROUP_ID;
  if (!ML_KEY || !ML_GROUP || !email) return;
  try {
    const res = await fetch("https://connect.mailerlite.com/api/subscribers", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ML_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        email,
        groups: [ML_GROUP],
        fields: { plano, tenant_id: String(tenantId) },
        status: "active"
      })
    });
    if (!res.ok) console.error("MailerLite add error:", await res.text());
  } catch (e) {
    console.error("MailerLite error:", e);
  }
}
__name(addToMailerLite, "addToMailerLite");
__name2(addToMailerLite, "addToMailerLite");
async function logPaymentEvent(env, tenantId, eventType, data = {}) {
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return;
  try {
    await fetch(`${SUPABASE_URL8}/rest/v1/payment_logs`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        event_type: eventType,
        mp_subscription_id: data.subscriptionId || null,
        status: data.status || null,
        error_message: data.error || null,
        raw_response: data.raw || null
      })
    });
  } catch (e) {
    console.error("logPaymentEvent error:", e);
  }
}
__name(logPaymentEvent, "logPaymentEvent");
__name2(logPaymentEvent, "logPaymentEvent");
async function updateTenant(env, tenantId, fields) {
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return;
  try {
    const patchRes = await fetch(
      `${SUPABASE_URL8}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify(fields)
      }
    );
    if (!patchRes.ok) {
      console.error("create-subscription: falha ao atualizar tenant:", await patchRes.text());
    }
  } catch (e) {
    console.error("create-subscription: erro ao atualizar tenant:", e);
  }
}
__name(updateTenant, "updateTenant");
__name2(updateTenant, "updateTenant");
async function checkExistingSubscription(env, tenantId) {
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL8}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=mp_subscription_id,status_pagamento`,
      {
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`
        }
      }
    );
    const tenants = await res.json();
    if (tenants[0]?.mp_subscription_id && tenants[0]?.status_pagamento === "authorized") {
      return tenants[0];
    }
  } catch (e) {
    console.error("checkExistingSubscription error:", e);
  }
  return null;
}
__name(checkExistingSubscription, "checkExistingSubscription");
__name2(checkExistingSubscription, "checkExistingSubscription");
async function onRequest15(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS3 });
  }
  if (request.method !== "POST") {
    return json5({ error: "Method not allowed" }, 405);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json5({ error: "JSON inv\xE1lido" }, 400);
  }
  const {
    tenant_id,
    plano,
    email,
    card_token,
    payment_method_id,
    issuer_id
  } = body;
  if (!tenant_id || !plano) {
    return json5({ error: "tenant_id e plano s\xE3o obrigat\xF3rios" }, 400);
  }
  if (plano === "free") {
    return json5({ trial: true });
  }
  const planoConfig = PLANOS[plano];
  if (!planoConfig) {
    return json5({ error: `Plano inv\xE1lido: ${plano}` }, 400);
  }
  const ACCESS_TOKEN = env.MP_ACCESS_TOKEN;
  const SITE_URL = env.SITE_URL || "https://inkflowbrasil.com";
  if (!ACCESS_TOKEN) {
    return json5({ error: "Gateway de pagamento n\xE3o configurado." }, 503);
  }
  if (!email || !email.includes("@")) {
    return json5({ error: "Email v\xE1lido \xE9 obrigat\xF3rio para processar o pagamento." }, 400);
  }
  const existing = await checkExistingSubscription(env, tenant_id);
  if (existing) {
    return json5({ error: "Este est\xFAdio j\xE1 possui uma assinatura ativa." }, 409);
  }
  try {
    const artCheck = await fetch(
      `${SUPABASE_URL8}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=is_artist_slot`,
      { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    const artData = await artCheck.json();
    if (artData[0]?.is_artist_slot === true) {
      return json5({ error: "Artistas vinculados a um est\xFAdio n\xE3o precisam de assinatura." }, 403);
    }
  } catch (e) {
    console.error("create-subscription: artist guard check failed:", e);
  }
  if (card_token) {
    const payload2 = {
      reason: planoConfig.nome,
      external_reference: tenant_id,
      payer_email: email,
      // [FIX #1] Sem fallback fake
      card_token_id: card_token,
      back_url: `${SITE_URL}/onboarding`,
      // [FIX #4] Padronizado
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: planoConfig.valor,
        currency_id: "BRL",
        start_date: new Date(Date.now() + 5 * 60 * 1e3).toISOString()
        // [FIX] cobrar em 5 min
      },
      status: "authorized"
    };
    if (payment_method_id) payload2.payment_method_id = payment_method_id;
    if (issuer_id) payload2.issuer_id = String(issuer_id);
    try {
      const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload2)
      });
      const data = await mpRes.json();
      if (!mpRes.ok) {
        console.error("MP card error:", JSON.stringify(data));
        const msg = data?.cause?.[0]?.description || data.message || "Erro no Mercado Pago";
        await logPaymentEvent(env, tenant_id, "subscription_error", {
          error: msg,
          raw: data
        });
        return json5({ error: msg }, mpRes.status);
      }
      await addToMailerLite(env, email, plano, tenant_id);
      await updateTenant(env, tenant_id, {
        mp_subscription_id: data.id,
        status_pagamento: data.status
      });
      await logPaymentEvent(env, tenant_id, "subscription_created", {
        subscriptionId: data.id,
        status: data.status,
        raw: { id: data.id, status: data.status, payer_email: email, plano }
      });
      return json5({ subscription_id: data.id, status: data.status });
    } catch (err) {
      console.error("create-subscription (card) error:", err);
      await logPaymentEvent(env, tenant_id, "subscription_error", {
        error: err.message || "Erro interno"
      });
      return json5({ error: "Erro interno ao processar cart\xE3o" }, 500);
    }
  }
  const payload = {
    reason: planoConfig.nome,
    external_reference: tenant_id,
    payer_email: email,
    // [FIX #1] Sem fallback fake
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: planoConfig.valor,
      currency_id: "BRL",
      start_date: new Date(Date.now() + 5 * 60 * 1e3).toISOString()
      // [FIX] cobrar em 5 min
    },
    back_url: `${SITE_URL}/onboarding`,
    // [FIX #4] Padronizado (era /onboarding.html)
    status: "pending"
  };
  try {
    const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await mpRes.json();
    if (!mpRes.ok) {
      console.error("MP redirect error:", JSON.stringify(data));
      await logPaymentEvent(env, tenant_id, "subscription_error", {
        error: data.message || "Erro na API do Mercado Pago",
        raw: data
      });
      return json5({ error: data.message || "Erro na API do Mercado Pago" }, mpRes.status);
    }
    await addToMailerLite(env, email, plano, tenant_id);
    await updateTenant(env, tenant_id, {
      mp_subscription_id: data.id,
      status_pagamento: "pendente"
    });
    await logPaymentEvent(env, tenant_id, "subscription_redirect", {
      subscriptionId: data.id,
      status: "pendente"
    });
    return json5({ init_point: data.init_point, subscription_id: data.id });
  } catch (err) {
    console.error("create-subscription (redirect) error:", err);
    await logPaymentEvent(env, tenant_id, "subscription_error", {
      error: err.message || "Erro interno"
    });
    return json5({ error: "Erro interno ao criar assinatura" }, 500);
  }
}
__name(onRequest15, "onRequest15");
__name2(onRequest15, "onRequest");
var SUPABASE_URL9 = "https://bfzuxxuscyplfoimvomh.supabase.co";
var CORS4 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
var ALLOWED_FIELDS = /* @__PURE__ */ new Set([
  "nome",
  "nome_agente",
  "nome_estudio",
  "email",
  "telefone",
  "cidade",
  "endereco",
  "evo_instance",
  "webhook_path",
  "evo_base_url",
  "plano",
  "prompt_sistema",
  "parent_tenant_id",
  "is_artist_slot",
  "google_calendar_id",
  // [FIX] onboarding_key precisa ser persistido para que update-tenant/get-studio-token
  // possam autenticar via verifyOnboardingKey (sem isso, todas as auth pos-criacao falham 403)
  "onboarding_key",
  // [v5 agente IA] Configs opcionais que o onboarding pode preencher ja na criacao
  "config_agente",
  "config_precificacao",
  "horario_funcionamento",
  "duracao_sessao_padrao_h",
  "sinal_percentual",
  "gatilhos_handoff",
  "portfolio_urls",
  "faq_texto",
  "modo_atendimento"
]);
function json6(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS4 });
}
__name(json6, "json6");
__name2(json6, "json");
async function onRequest16(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS4 });
  if (request.method !== "POST") return json6({ error: "Method not allowed" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json6({ error: "JSON inv\xE1lido" }, 400);
  }
  const { nome, nome_agente, nome_estudio, email, plano } = body;
  if (!nome || typeof nome !== "string" || nome.trim().length < 2) {
    return json6({ error: "Nome \xE9 obrigat\xF3rio (m\xEDn. 2 caracteres)" }, 400);
  }
  const isArtistRequest = body.is_artist_slot === true && body.parent_tenant_id;
  if (!isArtistRequest) {
    if (!nome_estudio || typeof nome_estudio !== "string" || nome_estudio.trim().length < 2) {
      return json6({ error: "Nome do est\xFAdio \xE9 obrigat\xF3rio" }, 400);
    }
  }
  if (!nome_agente || typeof nome_agente !== "string" || nome_agente.trim().length < 2) {
    return json6({ error: "Nome do agente \xE9 obrigat\xF3rio (m\xEDn. 2 caracteres)" }, 400);
  }
  if (!email || !email.includes("@") || email.length > 254) {
    return json6({ error: "Email v\xE1lido \xE9 obrigat\xF3rio" }, 400);
  }
  if (!plano || !["teste", "individual", "estudio", "premium"].includes(plano)) {
    return json6({ error: "Plano inv\xE1lido" }, 400);
  }
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json6({ error: "Configura\xE7\xE3o interna ausente" }, 503);
  try {
    const tenantData = {};
    for (const [key, val] of Object.entries(body)) {
      if (ALLOWED_FIELDS.has(key) && val !== void 0 && val !== "") {
        tenantData[key] = typeof val === "string" ? val.trim() : val;
      }
    }
    tenantData.evo_apikey = "pending";
    tenantData.webhook_path = tenantData.webhook_path || "inkflow";
    tenantData.evo_base_url = tenantData.evo_base_url || env.EVO_BASE_URL || "https://evo.inkflowbrasil.com";
    const isArtist = tenantData.parent_tenant_id && tenantData.is_artist_slot === true;
    if (isArtist) {
      const parentRes = await fetch(
        `${SUPABASE_URL9}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantData.parent_tenant_id)}&select=id,plano,ativo`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      if (!parentRes.ok) return json6({ error: "Erro ao validar tenant pai" }, 500);
      const parents = await parentRes.json();
      if (!Array.isArray(parents) || parents.length === 0) {
        return json6({ error: "Tenant pai nao encontrado", code: "parent_not_found" }, 404);
      }
      const parent = parents[0];
      if (!["estudio", "premium"].includes(parent.plano)) {
        return json6({ error: "Tenant pai precisa ter plano estudio ou premium", code: "parent_plan_invalid" }, 403);
      }
      if (parent.ativo !== true) {
        return json6({ error: "Tenant pai inativo", code: "parent_inactive" }, 403);
      }
      tenantData.ativo = false;
      tenantData.status_pagamento = "artist_slot";
      if (body.parent_google_calendar_id) {
        tenantData.google_calendar_id = body.parent_google_calendar_id;
      }
      tenantData.is_artist_slot = true;
    } else {
      tenantData.ativo = false;
      tenantData.status_pagamento = "rascunho";
      delete tenantData.parent_tenant_id;
      delete tenantData.is_artist_slot;
      if (["estudio", "premium"].includes(tenantData.plano)) {
        tenantData.studio_token = crypto.randomUUID();
      }
    }
    if (!isArtist) {
      const BLOCKED_STATUS = ["approved", "authorized", "pending", "paid"];
      const statusFilter = `status_pagamento=in.(${BLOCKED_STATUS.join(",")})`;
      async function lookupDup(field, value) {
        const r = await fetch(
          `${SUPABASE_URL9}/rest/v1/tenants?${field}=eq.${encodeURIComponent(value)}&select=id,email,telefone,status_pagamento,ativo,plano,evo_instance,nome_estudio,nome_agente&order=created_at.desc`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        );
        if (!r.ok) return [];
        const rows = await r.json();
        return Array.isArray(rows) ? rows : [];
      }
      __name(lookupDup, "lookupDup");
      __name2(lookupDup, "lookupDup");
      const matches = [];
      const byEmail = await lookupDup("email", tenantData.email);
      matches.push(...byEmail);
      if (tenantData.telefone) {
        const normTel = String(tenantData.telefone).replace(/\D/g, "");
        if (normTel.length >= 10) {
          const byTel = await lookupDup("telefone", tenantData.telefone);
          for (const t of byTel) if (!matches.find((m) => m.id === t.id)) matches.push(t);
        }
      }
      const blocked = matches.find((m) => BLOCKED_STATUS.includes(m.status_pagamento));
      if (blocked) {
        const campo = blocked.email === tenantData.email ? "Email" : "Telefone";
        return json6({ error: `${campo} ja em uso. Use outro ou entre em contato com suporte.`, code: campo.toLowerCase() + "_in_use" }, 409);
      }
      const rascunho = matches.find((m) => m.status_pagamento === "rascunho");
      if (rascunho) {
        console.log(`create-tenant: reusando rascunho id=${rascunho.id} email=${rascunho.email}`);
        return json6({ tenant: rascunho, reused: true });
      }
    }
    let res = await fetch(`${SUPABASE_URL9}/rest/v1/tenants`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(tenantData)
    });
    const OPTIONAL_COLS = ["onboarding_key", "telefone"];
    for (let attempt = 0; attempt < OPTIONAL_COLS.length && !res.ok; attempt++) {
      const peek = await res.clone().text();
      const isMissingCol = peek.includes("PGRST204") || peek.includes("42703") || peek.includes("does not exist");
      if (!isMissingCol) break;
      const missing = OPTIONAL_COLS.find((c) => peek.includes(c) && tenantData[c] !== void 0);
      if (!missing) break;
      console.warn(`create-tenant: coluna ${missing} ausente no DB \u2014 retentando sem ela. RODE: ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ${missing} TEXT;`);
      delete tenantData[missing];
      res = await fetch(`${SUPABASE_URL9}/rest/v1/tenants`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(tenantData)
      });
    }
    if (!res.ok) {
      const errText = await res.text();
      if (errText.includes("unique") || errText.includes("duplicate") || errText.includes("23505")) {
        let retryOk = false;
        const base = (tenantData.evo_instance || "inkflow").replace(/\d+$/, "");
        for (let attempt = 0; attempt < 5; attempt++) {
          const suffix = Date.now().toString().slice(-5) + attempt;
          tenantData.evo_instance = base + suffix;
          res = await fetch(`${SUPABASE_URL9}/rest/v1/tenants`, {
            method: "POST",
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              "Content-Type": "application/json",
              Prefer: "return=representation"
            },
            body: JSON.stringify(tenantData)
          });
          if (res.ok) {
            retryOk = true;
            break;
          }
        }
        if (!retryOk) {
          console.error("create-tenant: slug collision after 5 retries");
          return json6({ error: "Erro ao criar perfil ap\xF3s v\xE1rias tentativas" }, 500);
        }
      } else {
        console.error("create-tenant: insert error:", errText);
        return json6({ error: "Erro ao criar perfil" }, 500);
      }
    }
    const data = await res.json();
    const tenant = Array.isArray(data) ? data[0] : data;
    if (!tenant || !tenant.id) {
      return json6({ error: "N\xE3o foi poss\xEDvel obter o ID do tenant" }, 500);
    }
    const onboardingKey = body.onboarding_key;
    if (onboardingKey && typeof onboardingKey === "string" && onboardingKey.length >= 8) {
      try {
        await fetch(
          `${SUPABASE_URL9}/rest/v1/onboarding_links?key=eq.${encodeURIComponent(onboardingKey)}`,
          {
            method: "PATCH",
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal"
            },
            body: JSON.stringify({ used: true })
          }
        );
      } catch (keyErr) {
        console.warn("create-tenant: falha ao marcar onboarding key como usada:", keyErr);
      }
    }
    return json6({
      tenant: {
        id: tenant.id,
        evo_instance: tenant.evo_instance
      }
    }, 201);
  } catch (err) {
    console.error("create-tenant exception:", err);
    return json6({ error: "Erro interno" }, 500);
  }
}
__name(onRequest16, "onRequest16");
__name2(onRequest16, "onRequest");
var CORS5 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
function json7(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS5 });
}
__name(json7, "json7");
__name2(json7, "json");
async function onRequest17(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS5 });
  if (request.method !== "POST") return json7({ error: "Method not allowed" }, 405);
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json7({ error: "Unauthorized" }, 401);
  }
  const SUPABASE_URL21 = "https://bfzuxxuscyplfoimvomh.supabase.co";
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json7({ error: "Configuracao interna ausente" }, 503);
  const userRes = await fetch(SUPABASE_URL21 + "/auth/v1/user", {
    headers: { apikey: SB_KEY, Authorization: authHeader }
  });
  if (!userRes.ok) return json7({ error: "Invalid token" }, 401);
  const user = await userRes.json();
  const ADMIN_EMAILS = ["lmf4200@gmail.com"];
  if (!ADMIN_EMAILS.includes(user.email)) {
    return json7({ error: "Forbidden" }, 403);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json7({ error: "JSON invalido" }, 400);
  }
  const { tenant_id } = body;
  if (!tenant_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant_id)) {
    return json7({ error: "tenant_id invalido" }, 400);
  }
  const headers = {
    apikey: SB_KEY,
    Authorization: "Bearer " + SB_KEY,
    "Content-Type": "application/json",
    Prefer: "return=minimal"
  };
  try {
    const tenantRes = await fetch(
      `${SUPABASE_URL21}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=mp_subscription_id,evo_instance,evo_apikey,evo_base_url`,
      { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } }
    );
    let tenantInfo = null;
    if (tenantRes.ok) {
      const tenants = await tenantRes.json();
      if (tenants.length > 0) tenantInfo = tenants[0];
    }
    if (tenantInfo?.mp_subscription_id && env.MP_ACCESS_TOKEN) {
      try {
        const mpRes = await fetch(
          `https://api.mercadopago.com/preapproval/${encodeURIComponent(tenantInfo.mp_subscription_id)}`,
          {
            method: "PUT",
            headers: {
              Authorization: "Bearer " + env.MP_ACCESS_TOKEN,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "cancelled" })
          }
        );
        if (!mpRes.ok) console.warn("delete-tenant: falha ao cancelar assinatura MP:", await mpRes.text());
        else console.log("delete-tenant: assinatura MP cancelada:", tenantInfo.mp_subscription_id);
      } catch (mpErr) {
        console.warn("delete-tenant: erro ao cancelar MP (nao fatal):", mpErr);
      }
    }
    async function tryApiDelete(evoKey, base, instanceName, logoutMethod) {
      try {
        const r = await fetch(`${base}/instance/logout/${encodeURIComponent(instanceName)}`, {
          method: logoutMethod,
          headers: { apikey: evoKey }
        });
        const t = await r.text().catch(() => "");
        console.log(`[evo-delete] logout[${logoutMethod}] ${instanceName} status=${r.status} resp=${t.slice(0, 200)}`);
      } catch (e) {
        console.warn(`[evo-delete] logout[${logoutMethod}] ${instanceName} threw:`, e?.message || e);
      }
      try {
        const r = await fetch(`${base}/instance/delete/${encodeURIComponent(instanceName)}`, {
          method: "DELETE",
          headers: { apikey: evoKey }
        });
        const t = await r.text().catch(() => "");
        console.log(`[evo-delete] delete ${instanceName} (via ${logoutMethod}-logout) status=${r.status} resp=${t.slice(0, 200)}`);
        if (r.ok) return { ok: true };
        return { ok: false, status: r.status, body: t.slice(0, 200) };
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    }
    __name(tryApiDelete, "tryApiDelete");
    __name2(tryApiDelete, "tryApiDelete");
    async function deleteEvoInstance(instanceName, baseUrl) {
      const evoKey = env.EVO_GLOBAL_KEY || env.EVOLUTION_GLOBAL_KEY;
      const base = baseUrl || env.EVO_BASE_URL || "https://evo.inkflowbrasil.com";
      if (!instanceName) return { ok: false, cleanup: "failed", reason: "missing instance" };
      if (!evoKey) return { ok: false, cleanup: "failed", instance: instanceName, reason: "missing EVO_GLOBAL_KEY" };
      const a1 = await tryApiDelete(evoKey, base, instanceName, "DELETE");
      if (a1.ok) return { ok: true, cleanup: "success", instance: instanceName };
      await new Promise((r) => setTimeout(r, 2e3));
      const a2 = await tryApiDelete(evoKey, base, instanceName, "POST");
      if (a2.ok) return { ok: true, cleanup: "retry_success", instance: instanceName };
      const dbUrl = env.EVO_DB_CLEANUP_URL;
      const dbSecret = env.EVO_DB_CLEANUP_SECRET;
      if (dbUrl && dbSecret) {
        try {
          const dbRes = await fetch(dbUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-secret": dbSecret },
            body: JSON.stringify({ instance_name: instanceName })
          });
          const dbTxt = await dbRes.text().catch(() => "");
          console.log(`[evo-delete] db-fallback ${instanceName} status=${dbRes.status} resp=${dbTxt.slice(0, 200)}`);
          if (dbRes.ok) return { ok: true, cleanup: "db_fallback", instance: instanceName };
        } catch (e) {
          console.warn(`[evo-delete] db-fallback threw:`, e?.message || e);
        }
      } else {
        console.warn("[evo-delete] EVO_DB_CLEANUP_URL/SECRET nao configuradas \u2014 pulando nivel 3");
      }
      console.error(`[evo-delete] FALHA TOTAL para ${instanceName}. Admin precisa rodar SQL manualmente.`);
      return {
        ok: false,
        cleanup: "failed",
        instance: instanceName,
        last_status: a2.status || a1.status,
        last_body: (a2.body || a1.body || "").slice(0, 200),
        manual_sql: `DELETE FROM "Instance" WHERE name = '${instanceName.replace(/'/g, "''")}';`
      };
    }
    __name(deleteEvoInstance, "deleteEvoInstance");
    __name2(deleteEvoInstance, "deleteEvoInstance");
    const evoDeleted = [];
    const evoErrors = [];
    if (tenantInfo?.evo_instance) {
      const r = await deleteEvoInstance(tenantInfo.evo_instance, tenantInfo.evo_base_url);
      if (r.ok) evoDeleted.push({ instance: r.instance, cleanup: r.cleanup });
      else evoErrors.push(r);
    }
    async function del(table, filter) {
      const res = await fetch(`${SUPABASE_URL21}/rest/v1/${table}?${filter}`, { method: "DELETE", headers });
      if (!res.ok) {
        const err = await res.text();
        console.error(`delete-tenant: falha ao deletar ${table} (${filter}):`, err);
      }
    }
    __name(del, "del");
    __name2(del, "del");
    const childRes = await fetch(
      `${SUPABASE_URL21}/rest/v1/tenants?parent_tenant_id=eq.${encodeURIComponent(tenant_id)}&select=id,evo_instance,evo_base_url`,
      { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } }
    );
    const childTenants = childRes.ok ? await childRes.json() : [];
    const childIds = childTenants.map((c) => c.id);
    for (const child of childTenants) {
      if (child.evo_instance) {
        const r = await deleteEvoInstance(child.evo_instance, child.evo_base_url);
        if (r.ok) evoDeleted.push({ instance: r.instance, cleanup: r.cleanup });
        else evoErrors.push(r);
      }
    }
    for (const childId of childIds) {
      await del("chat_messages", "tenant_id=eq." + childId);
      await del("chats", "tenant_id=eq." + childId);
      await del("dados_cliente", "tenant_id=eq." + childId);
      await del("logs", "tenant_id=eq." + childId);
      await del("signups_log", "tenant_id=eq." + childId);
      await del("payment_logs", "tenant_id=eq." + childId);
    }
    await del("onboarding_links", "parent_tenant_id=eq." + tenant_id);
    if (childIds.length > 0) {
      await del("tenants", "parent_tenant_id=eq." + tenant_id);
    }
    await del("chat_messages", "tenant_id=eq." + tenant_id);
    await del("chats", "tenant_id=eq." + tenant_id);
    await del("dados_cliente", "tenant_id=eq." + tenant_id);
    await del("logs", "tenant_id=eq." + tenant_id);
    await del("signups_log", "tenant_id=eq." + tenant_id);
    await del("payment_logs", "tenant_id=eq." + tenant_id);
    const finalRes = await fetch(`${SUPABASE_URL21}/rest/v1/tenants?id=eq.${tenant_id}`, { method: "DELETE", headers });
    if (!finalRes.ok) {
      const err = await finalRes.text();
      console.error("delete-tenant: falha ao deletar tenant principal:", err);
      return json7({ error: "Erro ao excluir tenant" }, 500);
    }
    let evoCleanup = "success";
    if (evoErrors.length > 0) evoCleanup = "failed";
    else if (evoDeleted.some((x) => typeof x === "object" && x.cleanup === "db_fallback")) evoCleanup = "db_fallback";
    else if (evoDeleted.some((x) => typeof x === "object" && x.cleanup === "retry_success")) evoCleanup = "retry_success";
    console.log("delete-tenant: tenant", tenant_id, "excluido. EVO cleanup:", evoCleanup, "deletadas:", evoDeleted.length, "erros:", evoErrors.length);
    return json7({
      ok: true,
      evo_cleanup: evoCleanup,
      evo_deleted: evoDeleted,
      evo_errors: evoErrors
    });
  } catch (err) {
    console.error("delete-tenant exception:", err);
    return json7({ error: "Erro interno" }, 500);
  }
}
__name(onRequest17, "onRequest17");
__name2(onRequest17, "onRequest");
var SUPABASE_URL10 = "https://bfzuxxuscyplfoimvomh.supabase.co";
var CORS6 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
function json8(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS6 });
}
__name(json8, "json8");
__name2(json8, "json");
async function onRequest18(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS6 });
  if (request.method !== "POST") return json8({ error: "Method not allowed" }, 405);
  const EVO_BASE_URL = env.EVO_BASE_URL;
  const N8N_WEBHOOK = env.N8N_WEBHOOK_URL;
  const GLOBAL_KEY = env.EVO_GLOBAL_KEY;
  const WEBHOOK_SECRET = env.N8N_WEBHOOK_SECRET;
  if (!GLOBAL_KEY || !EVO_BASE_URL || !N8N_WEBHOOK) {
    console.error("evo-create-instance: env vars ausentes", { EVO_BASE_URL: !!EVO_BASE_URL, N8N_WEBHOOK: !!N8N_WEBHOOK, GLOBAL_KEY: !!GLOBAL_KEY });
    return json8({ error: "Configura\xE7\xE3o interna ausente" }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json8({ error: "Body invalido" }, 400);
  }
  const { instanceName, tenant_id } = body;
  if (!instanceName || !tenant_id) {
    return json8({ error: "instanceName e tenant_id sao obrigatorios" }, 400);
  }
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(instanceName)) {
    return json8({ error: "instanceName invalido (apenas letras, numeros, hifen e underscore)" }, 400);
  }
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (SB_KEY) {
    try {
      const tRes = await fetch(
        `${SUPABASE_URL10}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=status_pagamento,plano,is_artist_slot`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      if (tRes.ok) {
        const rows = await tRes.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const t = rows[0];
          const ALLOWED = ["authorized", "approved", "paid", "artist_slot"];
          const isFreeTrial = t.plano === "teste";
          const isArtist = t.is_artist_slot === true || t.status_pagamento === "artist_slot";
          const paymentOk = ALLOWED.includes(t.status_pagamento);
          if (!paymentOk && !isFreeTrial && !isArtist) {
            console.warn(`evo-create-instance: bloqueado \u2014 tenant=${tenant_id} status=${t.status_pagamento} plano=${t.plano}`);
            return json8({ error: "Pagamento nao confirmado. Conclua o checkout antes de criar a instancia.", code: "payment_required", status_pagamento: t.status_pagamento }, 403);
          }
        }
      }
    } catch (e) {
      console.error("evo-create-instance: erro ao verificar status_pagamento:", e);
    }
  }
  let apikey = null;
  let already_existed = false;
  try {
    const checkRes = await fetch(
      `${EVO_BASE_URL}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
      { headers: { apikey: GLOBAL_KEY } }
    );
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (Array.isArray(checkData) && checkData.length > 0) {
        const existing = checkData[0];
        apikey = (typeof existing.hash === "string" ? existing.hash : existing.hash?.apikey) || existing.instance?.apikey || existing.apikey || existing.token || null;
        if (apikey) already_existed = true;
      }
    }
  } catch (e) {
    console.error("evo-create-instance: erro ao verificar instancia existente:", e);
  }
  if (!apikey) {
    let createRes, createData;
    try {
      createRes = await fetch(`${EVO_BASE_URL}/instance/create`, {
        method: "POST",
        headers: {
          apikey: GLOBAL_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          instanceName,
          qrcode: false,
          integration: "WHATSAPP-BAILEYS",
          // Settings corretos para o InkFlow
          rejectCall: false,
          // NAO rejeitar ligacoes
          groupsIgnore: true,
          // ignorar mensagens de grupo
          alwaysOnline: false,
          // NAO mostrar sempre online
          readMessages: false,
          // nao marcar como lido automaticamente
          readStatus: false,
          // nao ler status/stories
          syncFullHistory: false,
          // nao sincronizar historico antigo
          webhookBase64: true
          // [FIX] midia enviada como base64 no webhook
        })
      });
      createData = await createRes.json();
    } catch (fetchErr) {
      console.error("evo-create-instance: erro de rede ao criar instancia:", fetchErr);
      return json8({ error: "Erro de conexao com a Evolution API. Tente novamente." }, 502);
    }
    if (!createRes.ok) {
      console.error("evo-create-instance: falha ao criar instancia:", JSON.stringify(createData));
      return json8({ error: "Falha ao criar instancia na Evolution API" }, createRes.status);
    }
    apikey = (typeof createData.hash === "string" ? createData.hash : createData.hash?.apikey) || createData.instance?.apikey || createData.apikey || null;
  }
  if (!apikey) {
    return json8({ error: "apikey nao encontrada na resposta" }, 500);
  }
  const secretHdr = WEBHOOK_SECRET ? { "x-webhook-secret": WEBHOOK_SECRET } : {};
  const WEBHOOK_FORMATS = [
    {
      label: "A:nested-short",
      body: { webhook: { enabled: true, url: N8N_WEBHOOK, byEvents: false, base64: true, events: ["MESSAGES_UPSERT"], ...WEBHOOK_SECRET ? { headers: secretHdr } : {} } }
    },
    {
      label: "B:flat-long",
      body: { enabled: true, url: N8N_WEBHOOK, webhookByEvents: false, webhookBase64: true, events: ["MESSAGES_UPSERT"], ...WEBHOOK_SECRET ? { headers: secretHdr } : {} }
    },
    {
      label: "C:nested-long",
      body: { webhook: { enabled: true, url: N8N_WEBHOOK, webhookByEvents: false, webhookBase64: true, events: ["MESSAGES_UPSERT"], ...WEBHOOK_SECRET ? { headers: secretHdr } : {} } }
    }
  ];
  async function findWebhook(useKey) {
    try {
      const r = await fetch(`${EVO_BASE_URL}/webhook/find/${instanceName}`, { headers: { apikey: useKey } });
      const txt = await r.text();
      let data = null;
      try {
        data = JSON.parse(txt);
      } catch {
      }
      const wh = Array.isArray(data) ? data[0] : data;
      return { status: r.status, raw: txt, wh };
    } catch (e) {
      return { status: 0, raw: String(e), wh: null };
    }
  }
  __name(findWebhook, "findWebhook");
  __name2(findWebhook, "findWebhook");
  function webhookIsCorrect(wh) {
    if (!wh) return { ok: false, reason: "no wh object" };
    if (wh.enabled !== true) return { ok: false, reason: `enabled=${wh.enabled}` };
    const b64 = wh.webhookBase64 === true || wh.base64 === true;
    if (!b64) return { ok: false, reason: `webhookBase64=${wh.webhookBase64}, base64=${wh.base64}` };
    const events = Array.isArray(wh.events) ? wh.events : [];
    if (!events.includes("MESSAGES_UPSERT")) return { ok: false, reason: `events=${JSON.stringify(events)}` };
    return { ok: true };
  }
  __name(webhookIsCorrect, "webhookIsCorrect");
  __name2(webhookIsCorrect, "webhookIsCorrect");
  async function trySetWebhook(useKey, keyLabel) {
    for (const fmt of WEBHOOK_FORMATS) {
      let status = 0, rawResp = "";
      try {
        const r = await fetch(`${EVO_BASE_URL}/webhook/set/${instanceName}`, {
          method: "POST",
          headers: { apikey: useKey, "Content-Type": "application/json" },
          body: JSON.stringify(fmt.body)
        });
        status = r.status;
        rawResp = await r.text().catch(() => "");
      } catch (e) {
        console.error(`[webhook] SET ${keyLabel}/${fmt.label} network error:`, e);
        continue;
      }
      console.log(`[webhook] SET ${keyLabel}/${fmt.label} status=${status} resp=${rawResp.slice(0, 300)}`);
      if (status < 200 || status >= 300) continue;
      const found = await findWebhook(useKey);
      console.log(`[webhook] FIND ${keyLabel}/${fmt.label} status=${found.status} raw=${(found.raw || "").slice(0, 400)}`);
      const check = webhookIsCorrect(found.wh);
      if (check.ok) {
        console.log(`[webhook] OK com formato ${fmt.label} usando ${keyLabel}`);
        return { ok: true, format: fmt.label, keyUsed: keyLabel, wh: found.wh };
      }
      console.warn(`[webhook] formato ${fmt.label} aplicado mas incorreto: ${check.reason}`);
    }
    return { ok: false };
  }
  __name(trySetWebhook, "trySetWebhook");
  __name2(trySetWebhook, "trySetWebhook");
  let webhookResult = await trySetWebhook(apikey, "instance-key");
  if (!webhookResult.ok) {
    console.warn("[webhook] todos formatos falharam com apikey da instancia. Retry com GLOBAL_KEY...");
    webhookResult = await trySetWebhook(GLOBAL_KEY, "global-key");
  }
  const webhookOk = webhookResult.ok;
  if (!webhookOk) {
    console.error("[webhook] FALHA TOTAL: nenhum formato configurou webhook corretamente para", instanceName);
  }
  const SETTINGS_BODIES = [
    // Flat (v2 atual)
    { rejectCall: false, groupsIgnore: true, alwaysOnline: false, readMessages: false, readStatus: false, syncFullHistory: false, webhookBase64: true },
    // Nested (legado)
    { settings: { rejectCall: false, groupsIgnore: true, alwaysOnline: false, readMessages: false, readStatus: false, syncFullHistory: false, webhookBase64: true } }
  ];
  for (const sb of SETTINGS_BODIES) {
    try {
      const r = await fetch(`${EVO_BASE_URL}/settings/set/${instanceName}`, {
        method: "POST",
        headers: { apikey, "Content-Type": "application/json" },
        body: JSON.stringify(sb)
      });
      const txt = await r.text().catch(() => "");
      console.log(`[settings] status=${r.status} body=${JSON.stringify(sb).slice(0, 100)} resp=${txt.slice(0, 200)}`);
      if (r.ok) break;
    } catch (settingsErr) {
      console.warn("[settings] update failed (nao fatal):", settingsErr);
    }
  }
  if (SB_KEY && tenant_id) {
    try {
      await fetch(SUPABASE_URL10 + "/rest/v1/tenants?id=eq." + encodeURIComponent(tenant_id), {
        method: "PATCH",
        headers: {
          apikey: SB_KEY,
          Authorization: "Bearer " + SB_KEY,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ evo_apikey: apikey, evo_instance: instanceName })
      });
    } catch (sbErr) {
      console.error("evo-create-instance: falha ao salvar apikey no tenant:", sbErr);
    }
  }
  if (!webhookOk) {
    return json8({
      error: "Inst\xE2ncia criada mas webhook n\xE3o configurou corretamente. Contate o suporte para ativar o assistente.",
      instanceName,
      already_existed,
      webhook_configured: false
    }, 502);
  }
  return json8({
    instanceName,
    already_existed,
    webhook_configured: true,
    webhook_format: webhookResult.format,
    webhook_key_used: webhookResult.keyUsed
  });
}
__name(onRequest18, "onRequest18");
__name2(onRequest18, "onRequest");
var CORS7 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
function json9(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS7 });
}
__name(json9, "json9");
__name2(json9, "json");
async function onRequest19(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS7 });
  if (request.method !== "GET") return json9({ error: "Method not allowed" }, 405);
  const url = new URL(request.url);
  const instance = url.searchParams.get("instance")?.trim();
  const number = url.searchParams.get("number")?.trim();
  if (!instance) return json9({ error: "instance obrigatorio" }, 400);
  if (!number) return json9({ error: "number obrigatorio" }, 400);
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(instance)) {
    return json9({ error: "instance invalido" }, 400);
  }
  const cleanNumber = number.replace(/\D/g, "");
  if (cleanNumber.length < 10 || cleanNumber.length > 15) {
    return json9({ error: "Numero invalido. Use formato: 5511999999999 (codigo do pais + DDD + numero)" }, 400);
  }
  const SUPABASE_URL21 = "https://bfzuxxuscyplfoimvomh.supabase.co";
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json9({ error: "Configuracao interna ausente" }, 503);
  try {
    const tenantRes = await fetch(
      SUPABASE_URL21 + "/rest/v1/tenants?evo_instance=eq." + encodeURIComponent(instance) + "&select=evo_base_url,evo_apikey,ativo&limit=1",
      { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }
    );
    const tenants = await tenantRes.json();
    if (!Array.isArray(tenants) || tenants.length === 0) {
      return json9({ error: "Instancia nao encontrada" }, 404);
    }
    const { evo_base_url, evo_apikey } = tenants[0];
    if (!evo_apikey || evo_apikey === "pending") {
      return json9({ error: "Instancia ainda nao configurada. Aguarde alguns segundos e tente novamente." }, 425);
    }
    try {
      const statusRes = await fetch(
        evo_base_url + "/instance/connectionState/" + instance,
        { headers: { apikey: evo_apikey } }
      );
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const connState = statusData?.instance?.state || statusData?.state || "";
        console.log("evo-pairing-code: connectionState =", connState);
        if (connState === "open") {
          return json9({ error: "Este WhatsApp j\xE1 est\xE1 conectado. Recarregue a p\xE1gina." }, 409);
        }
        if (connState === "connecting") {
          console.log("evo-pairing-code: instancia em connecting \u2014 fazendo logout para resetar");
          await fetch(evo_base_url + "/instance/logout/" + instance, {
            method: "DELETE",
            headers: { apikey: evo_apikey }
          }).catch(() => {
          });
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    } catch (stateErr) {
      console.warn("evo-pairing-code: nao foi possivel checar estado da instancia (nao fatal):", stateErr.message);
    }
    const evoRes = await fetch(
      evo_base_url + "/instance/connect/" + instance + "?number=" + encodeURIComponent(cleanNumber),
      { headers: { apikey: evo_apikey } }
    );
    if (!evoRes.ok) {
      const errBody = await evoRes.text().catch(() => "");
      console.error("evo-pairing-code: Evolution API error", evoRes.status, errBody);
      return json9({ error: "Erro ao gerar codigo de pareamento" }, 502);
    }
    const evoData = await evoRes.json();
    console.log("evo-pairing-code: evo response keys =", Object.keys(evoData).join(","));
    const pairingCode = evoData.pairingCode || null;
    if (!pairingCode) {
      console.error("evo-pairing-code: pairingCode nao retornado. Response:", JSON.stringify(evoData));
      return json9({ error: "Codigo de pareamento nao disponivel. Tente novamente.", debug_keys: Object.keys(evoData) }, 404);
    }
    const formatted = pairingCode.length === 8 ? pairingCode.slice(0, 4) + "-" + pairingCode.slice(4) : pairingCode;
    return json9({ pairingCode: formatted });
  } catch (err) {
    console.error("evo-pairing-code error:", err);
    return json9({ error: "Erro interno" }, 500);
  }
}
__name(onRequest19, "onRequest19");
__name2(onRequest19, "onRequest");
var CORS8 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json"
};
function json10(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS8 });
}
__name(json10, "json10");
__name2(json10, "json");
async function onRequest20(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS8 });
  if (request.method !== "GET") return json10({ error: "Method not allowed" }, 405);
  const url = new URL(request.url);
  const instance = url.searchParams.get("instance")?.trim();
  if (!instance) return json10({ error: "instance obrigatorio" }, 400);
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(instance)) {
    return json10({ error: "instance invalido" }, 400);
  }
  const SUPABASE_URL21 = "https://bfzuxxuscyplfoimvomh.supabase.co";
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json10({ error: "Configuracao interna ausente" }, 503);
  try {
    const tenantRes = await fetch(
      SUPABASE_URL21 + "/rest/v1/tenants?evo_instance=eq." + encodeURIComponent(instance) + "&select=evo_base_url,evo_apikey,ativo&limit=1",
      { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }
    );
    const tenants = await tenantRes.json();
    if (!Array.isArray(tenants) || tenants.length === 0) {
      return json10({ error: "Instancia nao encontrada" }, 404);
    }
    const { evo_base_url, evo_apikey } = tenants[0];
    if (!evo_apikey || evo_apikey === "pending") {
      return json10({ error: "Instancia ainda nao configurada. Aguarde alguns segundos e tente novamente." }, 425);
    }
    const evoRes = await fetch(
      evo_base_url + "/instance/connect/" + instance,
      { headers: { apikey: evo_apikey } }
    );
    if (!evoRes.ok) {
      console.error("evo-qr: Evolution API error", evoRes.status);
      return json10({ error: "Erro ao gerar QR code" }, 502);
    }
    const evoData = await evoRes.json();
    const base64 = evoData.base64 || evoData.qrcode?.base64 || evoData.code;
    if (!base64) return json10({ error: "QR code nao disponivel" }, 404);
    return json10({ base64 });
  } catch (err) {
    console.error("evo-qr error:", err);
    return json10({ error: "Erro interno" }, 500);
  }
}
__name(onRequest20, "onRequest20");
__name2(onRequest20, "onRequest");
var CORS9 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json"
};
function json11(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS9 });
}
__name(json11, "json11");
__name2(json11, "json");
async function onRequest21(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS9 });
  if (request.method !== "GET") return json11({ error: "Method not allowed" }, 405);
  const url = new URL(request.url);
  const instance = url.searchParams.get("instance")?.trim();
  if (!instance) return json11({ error: "instance obrigatorio" }, 400);
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(instance)) {
    return json11({ error: "instance invalido" }, 400);
  }
  const SUPABASE_URL21 = "https://bfzuxxuscyplfoimvomh.supabase.co";
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json11({ error: "Configuracao interna ausente" }, 503);
  try {
    const tenantRes = await fetch(
      SUPABASE_URL21 + "/rest/v1/tenants?evo_instance=eq." + encodeURIComponent(instance) + "&select=evo_base_url,evo_apikey,ativo&limit=1",
      { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }
    );
    const tenants = await tenantRes.json();
    if (!Array.isArray(tenants) || tenants.length === 0) {
      return json11({ error: "Instancia nao encontrada" }, 404);
    }
    const { evo_base_url, evo_apikey } = tenants[0];
    if (!evo_apikey || evo_apikey === "pending") {
      return json11({ error: "Instancia ainda nao configurada" }, 425);
    }
    const evoRes = await fetch(
      evo_base_url + "/instance/fetchInstances?instanceName=" + encodeURIComponent(instance),
      { headers: { apikey: evo_apikey } }
    );
    if (!evoRes.ok) {
      console.error("evo-status: Evolution API error", evoRes.status);
      return json11({ error: "Erro ao verificar status" }, 502);
    }
    const evoData = await evoRes.json();
    const instances = Array.isArray(evoData) ? evoData : evoData.data || [];
    const inst = instances.find(
      (i) => (i.instance?.instanceName || i.instanceName) === instance
    );
    const state = inst ? inst.instance?.state || inst.state || inst.connectionStatus || "unknown" : "unknown";
    return json11({ state });
  } catch (err) {
    console.error("evo-status error:", err);
    return json11({ error: "Erro interno" }, 500);
  }
}
__name(onRequest21, "onRequest21");
__name2(onRequest21, "onRequest");
var SUPABASE_URL11 = "https://bfzuxxuscyplfoimvomh.supabase.co";
var CORS10 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
function json12(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS10 });
}
__name(json12, "json12");
__name2(json12, "json");
async function onRequest22(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS10 });
  if (request.method !== "POST") return json12({ error: "Method not allowed" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json12({ error: "JSON inv\xE1lido" }, 400);
  }
  const { tenant_id, onboarding_key } = body;
  if (!tenant_id || !onboarding_key) {
    return json12({ error: "tenant_id e onboarding_key obrigat\xF3rios" }, 400);
  }
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const TOKEN_SECRET = env.STUDIO_TOKEN_SECRET;
  if (!SB_KEY || !TOKEN_SECRET) return json12({ error: "Configura\xE7\xE3o interna ausente" }, 503);
  const ownership = await verifyOnboardingKey({
    tenantId: tenant_id,
    onboardingKey: onboarding_key,
    supabaseUrl: SUPABASE_URL11,
    supabaseKey: SB_KEY
  });
  if (!ownership.ok) {
    console.warn(`get-studio-token: auth rejeitada tenant_id=${tenant_id} reason=${ownership.reason}`);
    return json12({ error: "Autentica\xE7\xE3o falhou" }, 403);
  }
  try {
    const r = await fetch(
      `${SUPABASE_URL11}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=plano,ativo`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!r.ok) return json12({ error: "Erro ao verificar tenant" }, 500);
    const rows = await r.json();
    if (!rows?.[0]) return json12({ error: "Tenant n\xE3o encontrado" }, 404);
    const t = rows[0];
    if (!["estudio", "premium"].includes(t.plano)) {
      return json12({ error: "Plano n\xE3o eleg\xEDvel para painel de est\xFAdio" }, 400);
    }
  } catch (e) {
    console.error("get-studio-token: erro ao verificar tenant:", e?.message);
    return json12({ error: "Erro interno" }, 500);
  }
  let token;
  try {
    token = await generateStudioToken(tenant_id, TOKEN_SECRET);
  } catch (e) {
    console.error("get-studio-token: falha ao gerar:", e?.message);
    return json12({ error: "Falha ao gerar token" }, 500);
  }
  const link = `https://inkflowbrasil.com/studio.html?token=${token}&welcome=true`;
  const expiresAt = Math.floor(Date.now() / 1e3) + 30 * 86400;
  return json12({ token, link, expires_at: expiresAt });
}
__name(onRequest22, "onRequest22");
__name2(onRequest22, "onRequest");
var SUPABASE_URL12 = "https://bfzuxxuscyplfoimvomh.supabase.co";
var ADMIN_EMAIL3 = "lmf4200@gmail.com";
var CORS11 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
var READABLE_FIELDS = /* @__PURE__ */ new Set([
  "id",
  "email",
  "ativo",
  "plano",
  "mp_subscription_id",
  "status_pagamento",
  "nome_estudio",
  "nome_agente",
  "evo_instance",
  "trial_ate",
  "welcome_shown"
]);
function json13(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS11 });
}
__name(json13, "json13");
__name2(json13, "json");
async function verifyAdmin3(authHeader, supabaseKey) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  try {
    const userRes = await fetch(SUPABASE_URL12 + "/auth/v1/user", {
      headers: { apikey: supabaseKey, Authorization: authHeader }
    });
    if (!userRes.ok) return false;
    const user = await userRes.json();
    return user.email === ADMIN_EMAIL3;
  } catch {
    return false;
  }
}
__name(verifyAdmin3, "verifyAdmin3");
__name2(verifyAdmin3, "verifyAdmin");
async function onRequest23(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS11 });
  if (request.method !== "POST") return json13({ error: "Method not allowed" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json13({ error: "JSON inv\xE1lido" }, 400);
  }
  const { tenant_id, email, evo_instance, fields, onboarding_key, studio_token } = body;
  if (!tenant_id && !email && !evo_instance) {
    return json13({ error: "tenant_id, email ou evo_instance obrigat\xF3rio" }, 400);
  }
  if (tenant_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant_id)) {
    return json13({ error: "tenant_id inv\xE1lido" }, 400);
  }
  if (email && (!email.includes("@") || email.length > 254)) {
    return json13({ error: "email inv\xE1lido" }, 400);
  }
  if (evo_instance && !/^[a-zA-Z0-9_-]{1,64}$/.test(evo_instance)) {
    return json13({ error: "evo_instance inv\xE1lido" }, 400);
  }
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json13({ error: "Configura\xE7\xE3o interna ausente" }, 503);
  const isAdmin = await verifyAdmin3(request.headers.get("Authorization"), SUPABASE_KEY);
  let authorizedTenantId = null;
  if (isAdmin) authorizedTenantId = tenant_id || null;
  if (!authorizedTenantId && tenant_id && onboarding_key) {
    const ok = await verifyOnboardingKey({
      tenantId: tenant_id,
      onboardingKey: onboarding_key,
      supabaseUrl: SUPABASE_URL12,
      supabaseKey: SUPABASE_KEY
    });
    if (ok.ok) authorizedTenantId = tenant_id;
  }
  if (!authorizedTenantId && studio_token) {
    const verified = await verifyStudioTokenOrLegacy({
      token: studio_token,
      secret: env.STUDIO_TOKEN_SECRET,
      supabaseUrl: SUPABASE_URL12,
      supabaseKey: SUPABASE_KEY
    });
    if (verified && (!tenant_id || verified.tenantId === tenant_id)) {
      authorizedTenantId = verified.tenantId;
    }
  }
  const requestedFields = (fields || "id,ativo").split(",").map((f) => f.trim());
  const safeFields = requestedFields.filter((f) => READABLE_FIELDS.has(f));
  if (safeFields.length === 0) safeFields.push("id");
  const EMAIL_ONLY_FIELDS = ["id", "ativo"];
  const isEmailOnlyLookup = !authorizedTenantId && !evo_instance && email && !tenant_id;
  const isTenantIdOnlyLookup = !authorizedTenantId && !isAdmin && tenant_id && !email && !evo_instance;
  if (isTenantIdOnlyLookup) {
    return json13({ error: "autentica\xE7\xE3o requerida (onboarding_key ou studio_token)" }, 403);
  }
  let queryParam;
  let selectStr;
  if (authorizedTenantId) {
    queryParam = `id=eq.${encodeURIComponent(authorizedTenantId)}`;
    selectStr = safeFields.join(",");
  } else if (isEmailOnlyLookup) {
    queryParam = `email=eq.${encodeURIComponent(email)}`;
    selectStr = EMAIL_ONLY_FIELDS.join(",");
  } else if (evo_instance) {
    queryParam = `evo_instance=eq.${encodeURIComponent(evo_instance)}`;
    selectStr = safeFields.join(",");
  } else {
    return json13({ error: "par\xE2metros insuficientes ou n\xE3o autorizados" }, 400);
  }
  try {
    const res = await fetch(
      `${SUPABASE_URL12}/rest/v1/tenants?${queryParam}&select=${selectStr}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) {
      console.error("get-tenant error:", await res.text());
      return json13({ error: "Erro ao consultar tenant" }, 500);
    }
    const data = await res.json();
    return json13({ tenants: data });
  } catch (err) {
    console.error("get-tenant exception:", err);
    return json13({ error: "Erro interno" }, 500);
  }
}
__name(onRequest23, "onRequest23");
__name2(onRequest23, "onRequest");
var CORS12 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
var SUPABASE_URL13 = "https://bfzuxxuscyplfoimvomh.supabase.co";
function json14(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS12 });
}
__name(json14, "json14");
__name2(json14, "json");
async function verifyMPSignature(request, env, rawBody) {
  const secret = env.MP_WEBHOOK_SECRET;
  if (!secret) return true;
  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");
  if (!xSignature) return false;
  const parts = Object.fromEntries(
    xSignature.split(",").map((p) => p.split("=").map((s) => s.trim()))
  );
  const ts = parts["ts"];
  const hash = parts["v1"];
  if (!ts || !hash) return false;
  const url = new URL(request.url);
  const dataId = url.searchParams.get("data.id") || url.searchParams.get("id");
  const manifest = "id:" + (dataId || "") + ";request-id:" + (xRequestId || "") + ";ts:" + ts + ";";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(manifest));
  const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return computed === hash;
}
__name(verifyMPSignature, "verifyMPSignature");
__name2(verifyMPSignature, "verifyMPSignature");
async function logIPNEvent(env, tenantId, eventType, data = {}) {
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return;
  try {
    await fetch(`${SUPABASE_URL13}/rest/v1/payment_logs`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        tenant_id: tenantId || null,
        event_type: eventType,
        mp_subscription_id: data.subscriptionId || null,
        status: data.status || null,
        error_message: data.error || null,
        raw_response: data.raw || null
      })
    });
  } catch (e) {
    console.error("logIPNEvent error:", e);
  }
}
__name(logIPNEvent, "logIPNEvent");
__name2(logIPNEvent, "logIPNEvent");
async function addSubscriberToMailerLite(env, tenantId, supabaseKey) {
  const mlKey = env.MAILERLITE_API_KEY;
  if (!mlKey) {
    console.warn("mp-ipn: MAILERLITE_API_KEY n\xE3o configurado \u2014 subscriber n\xE3o adicionado");
    return;
  }
  try {
    const tenantRes = await fetch(
      `${SUPABASE_URL13}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=email,nome`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    );
    if (!tenantRes.ok) {
      console.warn("mp-ipn: falha ao buscar tenant para MailerLite");
      return;
    }
    const tenants = await tenantRes.json();
    const tenant = tenants[0];
    if (!tenant?.email) {
      console.warn("mp-ipn: tenant sem email \u2014 subscriber n\xE3o adicionado ao MailerLite");
      return;
    }
    const mlRes = await fetch("https://connect.mailerlite.com/api/subscribers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mlKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        email: tenant.email,
        fields: { name: tenant.nome || "" },
        groups: ["184387920768009398"]
      })
    });
    if (mlRes.ok) {
      console.log("mp-ipn: subscriber adicionado ao MailerLite:", tenant.email);
    } else {
      const err = await mlRes.text();
      console.warn("mp-ipn: erro MailerLite:", err);
    }
  } catch (e) {
    console.warn("mp-ipn: exce\xE7\xE3o ao adicionar subscriber ao MailerLite:", e.message);
  }
}
__name(addSubscriberToMailerLite, "addSubscriberToMailerLite");
__name2(addSubscriberToMailerLite, "addSubscriberToMailerLite");
async function onRequest24(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS12 });
  }
  if (request.method !== "POST") {
    return json14({ error: "Method not allowed" }, 405);
  }
  let rawBody = "";
  let body = {};
  try {
    rawBody = await request.text();
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
  }
  if (!env.MP_WEBHOOK_SECRET) {
    console.warn("mp-ipn: MP_WEBHOOK_SECRET nao configurado \u2014 assinatura nao verificada. Configure a env var para seguranca.");
    await logIPNEvent(env, null, "ipn_warning_no_secret", {
      error: "MP_WEBHOOK_SECRET nao configurado \u2014 webhook aceito sem validacao HMAC"
    });
  } else {
    const valid = await verifyMPSignature(request, env, rawBody);
    if (!valid) {
      console.warn("mp-ipn: assinatura HMAC invalida \u2014 rejeitando request");
      await logIPNEvent(env, null, "ipn_hmac_rejected", {
        error: "Assinatura HMAC invalida"
      });
      return json14({ error: "Assinatura invalida" }, 401);
    }
  }
  const url = new URL(request.url);
  const topic = url.searchParams.get("topic") || url.searchParams.get("type");
  const dataId = url.searchParams.get("data.id") || url.searchParams.get("id");
  const type = topic || body.type;
  const id = dataId || body.data?.id;
  if (!type || !id) return json14({ received: true });
  if (isSinalCandidateEvent({ type, topic })) {
    const result = await processMpSinal(env, id);
    console.log("mp-ipn: sinal dispatch", result);
    return json14({ received: true, dispatched: "sinal", ...result });
  }
  if (type !== "preapproval" && type !== "subscription_preapproval") {
    return json14({ received: true, skipped: type });
  }
  const ACCESS_TOKEN = env.MP_ACCESS_TOKEN;
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!ACCESS_TOKEN || !SUPABASE_KEY) return json14({ error: "Env vars n\xE3o configuradas" }, 503);
  try {
    const mpRes = await fetch("https://api.mercadopago.com/preapproval/" + encodeURIComponent(id), {
      headers: { Authorization: "Bearer " + ACCESS_TOKEN }
    });
    const sub = await mpRes.json();
    if (!mpRes.ok) {
      await logIPNEvent(env, null, "ipn_error", {
        subscriptionId: id,
        error: "Falha ao buscar assinatura MP",
        raw: sub
      });
      return json14({ error: "Falha ao buscar assinatura MP" }, 500);
    }
    const tenantId = sub.external_reference;
    const mpStatus = sub.status;
    const ativo = mpStatus === "authorized";
    const STATUS_MAP = { authorized: "authorized", paused: "paused", cancelled: "cancelled", pending: "pendente" };
    const statusPagamento = STATUS_MAP[mpStatus] || mpStatus;
    await fetch(SUPABASE_URL13 + "/rest/v1/tenants?id=eq." + encodeURIComponent(tenantId), {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ ativo, status_pagamento: statusPagamento, mp_subscription_id: id })
    });
    if (ativo) {
      await addSubscriberToMailerLite(env, tenantId, SUPABASE_KEY);
    }
    await logIPNEvent(env, tenantId, "ipn_processed", {
      subscriptionId: id,
      status: mpStatus,
      raw: { status: mpStatus, ativo, payer_email: sub.payer_email || null }
    });
    console.log("IPN: tenant " + tenantId + " -> " + mpStatus + " (ativo=" + ativo + ")");
    return json14({ ok: true, tenant: tenantId, status: mpStatus });
  } catch (err) {
    console.error("mp-ipn error:", err);
    await logIPNEvent(env, null, "ipn_error", {
      subscriptionId: id,
      error: err.message || "Erro interno"
    });
    return json14({ error: "Erro interno" }, 500);
  }
}
__name(onRequest24, "onRequest24");
__name2(onRequest24, "onRequest");
var SUPABASE_URL14 = "https://bfzuxxuscyplfoimvomh.supabase.co";
var CORS13 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
function json15(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS13 });
}
__name(json15, "json15");
__name2(json15, "json");
async function onRequest25(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS13 });
  if (request.method !== "POST") return json15({ error: "Method not allowed" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json15({ error: "JSON invalido" }, 400);
  }
  const plano = body?.plano;
  const VALID_PLANS = ["teste", "individual", "estudio", "premium"];
  if (!VALID_PLANS.includes(plano)) {
    return json15({ error: "Plano invalido" }, 400);
  }
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json15({ error: "Configuracao interna ausente" }, 503);
  const key = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
  try {
    const res = await fetch(`${SUPABASE_URL14}/rest/v1/onboarding_links`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        key,
        plano,
        used: false,
        expires_at: expiresAt
        // email fica null — cliente preenche no form de onboarding
      })
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("public-start: insert error:", err);
      return json15({ error: "Erro ao criar link" }, 500);
    }
    const url = `https://inkflowbrasil.com/onboarding?token=${key}`;
    return json15({ ok: true, key, url, plano, expires_at: expiresAt });
  } catch (e) {
    console.error("public-start exception:", e?.message);
    return json15({ error: "Erro interno" }, 500);
  }
}
__name(onRequest25, "onRequest25");
__name2(onRequest25, "onRequest");
var SUPABASE_URL15 = "https://bfzuxxuscyplfoimvomh.supabase.co";
var MAILERLITE_GROUP_ID = "184440232841578230";
var CORS14 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
function json16(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS14 });
}
__name(json16, "json16");
__name2(json16, "json");
function normalizePhoneBR2(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  return digits;
}
__name(normalizePhoneBR2, "normalizePhoneBR2");
__name2(normalizePhoneBR2, "normalizePhoneBR");
async function findTenantByEmailOrPhone({ supabaseUrl, supabaseKey, email, phone }) {
  const tryFetch = /* @__PURE__ */ __name2(async (filter) => {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/tenants?${filter}&plano=in.(estudio,premium)&select=id,email,telefone,nome,nome_estudio,plano&limit=1`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }, "tryFetch");
  if (email) {
    const t = await tryFetch(`email=eq.${encodeURIComponent(email.toLowerCase())}`);
    if (t) return t;
  }
  if (phone) {
    const t = await tryFetch(`telefone=eq.${encodeURIComponent(phone)}`);
    if (t) return t;
  }
  return null;
}
__name(findTenantByEmailOrPhone, "findTenantByEmailOrPhone");
__name2(findTenantByEmailOrPhone, "findTenantByEmailOrPhone");
async function sendViaWhatsApp({ env, tenant, token }) {
  const EVO_BASE_URL = env.EVO_BASE_URL || "https://evo.inkflowbrasil.com";
  const CENTRAL = env.EVO_CENTRAL_INSTANCE;
  const CENTRAL_KEY = env.EVO_CENTRAL_APIKEY || env.EVO_GLOBAL_KEY;
  if (!CENTRAL || !CENTRAL_KEY) return { sent: false, reason: "central-not-configured" };
  const phone = normalizePhoneBR2(tenant.telefone);
  if (!phone) return { sent: false, reason: "no-phone" };
  const firstName = (tenant.nome || "").split(" ")[0] || "Tatuador";
  const link = `https://inkflowbrasil.com/studio.html?token=${token}`;
  const text = `Opa, ${firstName}! \u{1F510}

Novo link de acesso ao painel do est\xFAdio *${tenant.nome_estudio || "seu est\xFAdio"}*:

${link}

V\xE1lido por 30 dias. N\xE3o compartilhe.`;
  try {
    const r = await fetch(
      `${EVO_BASE_URL}/message/sendText/${encodeURIComponent(CENTRAL)}`,
      {
        method: "POST",
        headers: { apikey: CENTRAL_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ number: phone, text })
      }
    );
    return { sent: r.ok, status: r.status };
  } catch (e) {
    console.error("request-studio-link: WA send error:", e?.message);
    return { sent: false, reason: "network" };
  }
}
__name(sendViaWhatsApp, "sendViaWhatsApp");
__name2(sendViaWhatsApp, "sendViaWhatsApp");
async function sendViaEmail({ env, tenant, token }) {
  const ML_KEY = env.MAILERLITE_API_KEY;
  if (!ML_KEY || !tenant.email) return { sent: false, reason: "no-mailerlite-or-email" };
  const link = `https://inkflowbrasil.com/studio.html?token=${token}`;
  const planLabel = tenant.plano === "premium" ? "Est\xFAdio VIP" : "Est\xFAdio";
  const maxSlots = tenant.plano === "premium" ? 9 : 4;
  try {
    const r = await fetch(
      `https://connect.mailerlite.com/api/subscribers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ML_KEY}` },
        body: JSON.stringify({
          email: tenant.email,
          fields: {
            name: tenant.nome || "",
            nome_estudio: tenant.nome_estudio || "",
            plano: planLabel,
            studio_link: link,
            max_artistas: maxSlots
          },
          groups: [MAILERLITE_GROUP_ID],
          status: "active"
        })
      }
    );
    return { sent: r.ok, status: r.status };
  } catch (e) {
    console.error("request-studio-link: email send error:", e?.message);
    return { sent: false, reason: "network" };
  }
}
__name(sendViaEmail, "sendViaEmail");
__name2(sendViaEmail, "sendViaEmail");
async function onRequest26(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS14 });
  if (request.method !== "POST") return json16({ error: "Method not allowed" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json16({ error: "JSON inv\xE1lido" }, 400);
  }
  let { email, phone } = body || {};
  email = (email || "").toString().trim().toLowerCase();
  phone = normalizePhoneBR2(phone || "");
  const emailValid = email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  if (!emailValid && !phone) {
    return json16({ error: "Informe email ou telefone v\xE1lido" }, 400);
  }
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const TOKEN_SECRET = env.STUDIO_TOKEN_SECRET;
  if (!SB_KEY || !TOKEN_SECRET) return json16({ error: "Configura\xE7\xE3o interna ausente" }, 503);
  const channels_tried = [];
  try {
    const tenant = await findTenantByEmailOrPhone({
      supabaseUrl: SUPABASE_URL15,
      supabaseKey: SB_KEY,
      email: emailValid ? email : null,
      phone
    });
    if (tenant) {
      const token = await generateStudioToken(tenant.id, TOKEN_SECRET);
      const waResult = await sendViaWhatsApp({ env, tenant, token });
      console.log(`[request-studio-link] tenant=${tenant.id} wa=${JSON.stringify(waResult)}`);
      if (waResult.sent) channels_tried.push("whatsapp");
      const emailResult = await sendViaEmail({ env, tenant, token });
      console.log(`[request-studio-link] tenant=${tenant.id} email=${JSON.stringify(emailResult)}`);
      if (emailResult.sent) channels_tried.push("email");
    } else {
      console.log(`[request-studio-link] no tenant found for email=${email ? "***" : "-"} phone=${phone ? "***" : "-"}`);
    }
  } catch (e) {
    console.error("request-studio-link exception:", e?.message);
  }
  return json16({ ok: true, channels_tried });
}
__name(onRequest26, "onRequest26");
__name2(onRequest26, "onRequest");
var SUPABASE_URL16 = "https://bfzuxxuscyplfoimvomh.supabase.co";
var MAILERLITE_GROUP_ID2 = "184440232841578230";
var CORS15 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
function json17(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS15 });
}
__name(json17, "json17");
__name2(json17, "json");
async function onRequest27(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS15 });
  if (request.method !== "POST") return json17({ error: "Method not allowed" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json17({ error: "JSON inv\xE1lido" }, 400);
  }
  const { tenant_id } = body;
  if (!tenant_id) return json17({ error: "tenant_id \xE9 obrigat\xF3rio" }, 400);
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const ML_KEY = env.MAILERLITE_API_KEY;
  if (!ML_KEY) {
    console.error("send-studio-email: MAILERLITE_API_KEY n\xE3o configurada");
    return json17({ success: true, email_sent: false, reason: "MailerLite API key ausente" });
  }
  try {
    const res = await fetch(
      `${SUPABASE_URL16}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=id,nome_estudio,nome,email,plano,studio_token,ativo`,
      {
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`
        }
      }
    );
    if (!res.ok) {
      console.error("send-studio-email: Supabase fetch error", res.status);
      return json17({ error: "Erro ao buscar dados do est\xFAdio" }, 500);
    }
    const tenants = await res.json();
    if (!tenants || tenants.length === 0) {
      return json17({ error: "Est\xFAdio n\xE3o encontrado" }, 404);
    }
    const tenant = tenants[0];
    if (!["estudio", "premium"].includes(tenant.plano)) {
      return json17({ success: true, skipped: true, reason: "Plano n\xE3o eleg\xEDvel" });
    }
    const TOKEN_SECRET = env.STUDIO_TOKEN_SECRET;
    if (!TOKEN_SECRET) {
      console.error("send-studio-email: STUDIO_TOKEN_SECRET n\xE3o configurado");
      return json17({ error: "Configura\xE7\xE3o de seguran\xE7a ausente" }, 503);
    }
    let studioToken;
    try {
      studioToken = await generateStudioToken(tenant.id, TOKEN_SECRET);
    } catch (e) {
      console.error("send-studio-email: falha ao gerar token:", e?.message);
      return json17({ error: "Falha ao gerar token de acesso" }, 500);
    }
    if (!tenant.email) {
      console.warn("send-studio-email: tenant sem email");
      return json17({ success: true, skipped: true, reason: "Sem email" });
    }
    const studioLink = `https://inkflowbrasil.com/studio.html?token=${studioToken}`;
    const planLabel = tenant.plano === "premium" ? "Est\xFAdio VIP" : "Est\xFAdio";
    const maxSlots = tenant.plano === "premium" ? 9 : 4;
    const mlRes = await fetch(
      `https://connect.mailerlite.com/api/subscribers`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ML_KEY}`
        },
        body: JSON.stringify({
          email: tenant.email,
          fields: {
            name: tenant.nome || "",
            nome_estudio: tenant.nome_estudio || "",
            plano: planLabel,
            studio_link: studioLink,
            max_artistas: maxSlots
          },
          groups: [MAILERLITE_GROUP_ID2],
          status: "active"
        })
      }
    );
    if (!mlRes.ok) {
      const mlErr = await mlRes.text().catch(() => "unknown");
      console.error("send-studio-email: MailerLite API failed:", mlRes.status, mlErr);
      return json17({ success: true, email_sent: false, reason: "MailerLite falhou" });
    }
    console.log(`send-studio-email: subscriber adicionado ao MailerLite \u2014 ${tenant.email} (${tenant.plano})`);
    return json17({ success: true, email_sent: true });
  } catch (err) {
    console.error("send-studio-email:", err);
    return json17({ success: true, email_sent: false, reason: err.message });
  }
}
__name(onRequest27, "onRequest27");
__name2(onRequest27, "onRequest");
var SUPABASE_URL17 = "https://bfzuxxuscyplfoimvomh.supabase.co";
var CORS16 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
function json18(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS16 });
}
__name(json18, "json18");
__name2(json18, "json");
function normalizePhoneBR3(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  return digits;
}
__name(normalizePhoneBR3, "normalizePhoneBR3");
__name2(normalizePhoneBR3, "normalizePhoneBR");
async function onRequest28(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS16 });
  if (request.method !== "POST") return json18({ error: "Method not allowed" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json18({ error: "JSON inv\xE1lido" }, 400);
  }
  const { tenant_id, onboarding_key } = body;
  if (!tenant_id || !onboarding_key) {
    return json18({ error: "tenant_id e onboarding_key obrigat\xF3rios" }, 400);
  }
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const TOKEN_SECRET = env.STUDIO_TOKEN_SECRET;
  const EVO_BASE_URL = env.EVO_BASE_URL || "https://evo.inkflowbrasil.com";
  const CENTRAL_INSTANCE = env.EVO_CENTRAL_INSTANCE;
  const CENTRAL_APIKEY = env.EVO_CENTRAL_APIKEY || env.EVO_GLOBAL_KEY;
  if (!SB_KEY || !TOKEN_SECRET) return json18({ error: "Configura\xE7\xE3o interna ausente" }, 503);
  if (!CENTRAL_INSTANCE || !CENTRAL_APIKEY) {
    console.warn("send-whatsapp-link: EVO_CENTRAL_INSTANCE/EVO_CENTRAL_APIKEY n\xE3o configuradas \u2014 skip");
    return json18({ ok: true, sent: false, reason: "central-instance-not-configured" });
  }
  const ownership = await verifyOnboardingKey({
    tenantId: tenant_id,
    onboardingKey: onboarding_key,
    supabaseUrl: SUPABASE_URL17,
    supabaseKey: SB_KEY
  });
  if (!ownership.ok) {
    return json18({ error: "Autentica\xE7\xE3o falhou" }, 403);
  }
  let tenant;
  try {
    const r = await fetch(
      `${SUPABASE_URL17}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=telefone,nome,nome_estudio,plano,ativo`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!r.ok) return json18({ error: "Erro ao buscar tenant" }, 500);
    const rows = await r.json();
    tenant = rows?.[0];
    if (!tenant) return json18({ error: "Tenant n\xE3o encontrado" }, 404);
  } catch (e) {
    console.error("send-whatsapp-link: lookup error:", e?.message);
    return json18({ error: "Erro interno" }, 500);
  }
  if (!["estudio", "premium"].includes(tenant.plano)) {
    return json18({ ok: true, sent: false, reason: "plan-not-eligible" });
  }
  const phone = normalizePhoneBR3(tenant.telefone);
  if (!phone) {
    console.warn(`send-whatsapp-link: tenant ${tenant_id} sem telefone v\xE1lido`);
    return json18({ ok: true, sent: false, reason: "invalid-phone" });
  }
  let token;
  try {
    token = await generateStudioToken(tenant_id, TOKEN_SECRET);
  } catch (e) {
    console.error("send-whatsapp-link: token generation failed:", e?.message);
    return json18({ error: "Falha ao gerar token" }, 500);
  }
  const link = `https://inkflowbrasil.com/studio.html?token=${token}&welcome=true`;
  const firstName = (tenant.nome || "").split(" ")[0] || "Tatuador";
  const text = `Opa, ${firstName}! \u{1F3A8}

Seu InkFlow est\xE1 pronto. Acesse o painel do est\xFAdio *${tenant.nome_estudio || "seu est\xFAdio"}* aqui:

${link}

No painel voc\xEA conecta o WhatsApp do est\xFAdio, convida artistas e gerencia tudo.

Esse link \xE9 pessoal \u2014 n\xE3o compartilhe.`;
  try {
    const sendRes = await fetch(
      `${EVO_BASE_URL}/message/sendText/${encodeURIComponent(CENTRAL_INSTANCE)}`,
      {
        method: "POST",
        headers: { apikey: CENTRAL_APIKEY, "Content-Type": "application/json" },
        body: JSON.stringify({ number: phone, text })
      }
    );
    const sendTxt = await sendRes.text().catch(() => "");
    console.log(`[send-whatsapp-link] status=${sendRes.status} phone=${phone} resp=${sendTxt.slice(0, 200)}`);
    if (!sendRes.ok) {
      return json18({ ok: true, sent: false, reason: "evolution-error", status: sendRes.status });
    }
    return json18({ ok: true, sent: true });
  } catch (e) {
    console.error("send-whatsapp-link: send error:", e?.message);
    return json18({ ok: true, sent: false, reason: "network-error" });
  }
}
__name(onRequest28, "onRequest28");
__name2(onRequest28, "onRequest");
var SUPABASE_URL18 = "https://bfzuxxuscyplfoimvomh.supabase.co";
var ADMIN_EMAIL4 = "lmf4200@gmail.com";
var CORS17 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
var ALLOWED_FIELDS2 = /* @__PURE__ */ new Set([
  "evo_instance",
  "evo_apikey",
  "evo_base_url",
  "webhook_path",
  "grupo_notificacao",
  "grupo_orcamento",
  "google_calendar_id",
  "google_drive_folder",
  "nome_agente",
  "nome_estudio",
  "ativo",
  "plano",
  "trial_ate",
  "parent_tenant_id",
  "is_artist_slot",
  "welcome_shown",
  // [v5 agente IA] Configs do agente editaveis pelo dono via studio.html
  "config_agente",
  // JSONB: persona, tom, emoji_level, usa_giria, expressoes_proibidas, frases_naturais, usa_identificador, aceita_cobertura, estilos_aceitos, estilos_recusados, few_shot_exemplos, tester_usage
  "config_precificacao",
  // JSONB: modo, tabela_tamanho, multiplicadores, sinal_percentual, minimo, formula, tamanho_maximo_sessao_cm, valor_maximo_orcado, estilo_fallback, observacoes_tatuador, herda_do_pai
  "horario_funcionamento",
  // JSONB: { 'seg-sex': '10:00-19:00', 'sab': '10:00-15:00' }
  "duracao_sessao_padrao_h",
  "sinal_percentual",
  "gatilhos_handoff",
  // TEXT[]: ['cobertura','retoque','rosto',...]
  "portfolio_urls",
  // TEXT[]: URLs de portfolio
  "faq_texto",
  // texto livre de FAQ
  "modo_atendimento"
  // TEXT: individual | tatuador_dono | recepcionista | artista_slot
]);
var ADMIN_EXTRA_FIELDS = /* @__PURE__ */ new Set([
  "nome",
  "email",
  "cidade",
  "endereco",
  "prompt_sistema",
  "status_pagamento",
  "mp_subscription_id"
]);
var MODOS_ATENDIMENTO = ["individual", "tatuador_dono", "recepcionista", "artista_slot"];
function validateFieldTypes(fields) {
  const jsonbFields = ["config_agente", "config_precificacao", "horario_funcionamento"];
  const arrayFields = ["gatilhos_handoff", "portfolio_urls"];
  const intFields = ["duracao_sessao_padrao_h", "sinal_percentual"];
  for (const f of jsonbFields) {
    if (fields[f] !== void 0) {
      if (typeof fields[f] !== "object" || Array.isArray(fields[f])) {
        return { ok: false, erro: `${f} deve ser objeto JSON` };
      }
    }
  }
  for (const f of arrayFields) {
    if (fields[f] !== void 0) {
      if (!Array.isArray(fields[f])) return { ok: false, erro: `${f} deve ser array` };
      if (fields[f].some((x) => typeof x !== "string")) return { ok: false, erro: `${f} deve conter apenas strings` };
    }
  }
  for (const f of intFields) {
    if (fields[f] !== void 0) {
      const n = Number(fields[f]);
      if (!Number.isFinite(n) || n < 0 || n > 1e4) return { ok: false, erro: `${f} deve ser numero entre 0 e 10000` };
    }
  }
  if (fields.modo_atendimento !== void 0 && !MODOS_ATENDIMENTO.includes(fields.modo_atendimento)) {
    return { ok: false, erro: `modo_atendimento deve ser um de: ${MODOS_ATENDIMENTO.join(", ")}` };
  }
  return { ok: true };
}
__name(validateFieldTypes, "validateFieldTypes");
__name2(validateFieldTypes, "validateFieldTypes");
function json19(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS17 });
}
__name(json19, "json19");
__name2(json19, "json");
async function verifyAdmin4(authHeader, supabaseKey) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  try {
    const userRes = await fetch(SUPABASE_URL18 + "/auth/v1/user", {
      headers: { apikey: supabaseKey, Authorization: authHeader }
    });
    if (!userRes.ok) return false;
    const user = await userRes.json();
    return user.email === ADMIN_EMAIL4;
  } catch {
    return false;
  }
}
__name(verifyAdmin4, "verifyAdmin4");
__name2(verifyAdmin4, "verifyAdmin");
async function onRequest29(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS17 });
  if (request.method !== "POST") return json19({ error: "Method not allowed" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json19({ error: "JSON inv\xE1lido" }, 400);
  }
  const { tenant_id, email, onboarding_key, studio_token, ...fields } = body;
  if (!tenant_id) return json19({ error: "tenant_id obrigat\xF3rio" }, 400);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant_id)) {
    return json19({ error: "tenant_id inv\xE1lido" }, 400);
  }
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json19({ error: "Configura\xE7\xE3o interna ausente" }, 503);
  const isAdmin = await verifyAdmin4(request.headers.get("Authorization"), SUPABASE_KEY);
  let authorized = isAdmin;
  let authSource = isAdmin ? "admin" : null;
  if (!authorized && onboarding_key) {
    const check = await verifyOnboardingKey({
      tenantId: tenant_id,
      onboardingKey: onboarding_key,
      supabaseUrl: SUPABASE_URL18,
      supabaseKey: SUPABASE_KEY
    });
    if (check.ok) {
      authorized = true;
      authSource = "onboarding_key";
    }
  }
  if (!authorized && studio_token) {
    const verified = await verifyStudioTokenOrLegacy({
      token: studio_token,
      secret: env.STUDIO_TOKEN_SECRET,
      supabaseUrl: SUPABASE_URL18,
      supabaseKey: SUPABASE_KEY
    });
    if (verified && verified.tenantId === tenant_id) {
      authorized = true;
      authSource = "studio_token";
    }
  }
  if (!authorized) {
    console.warn(`update-tenant: auth rejeitada tenant_id=${tenant_id} email_sent=${!!email}`);
    return json19({ error: "Autentica\xE7\xE3o requerida: onboarding_key, studio_token ou admin JWT" }, 403);
  }
  const safeFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED_FIELDS2.has(k) || isAdmin && ADMIN_EXTRA_FIELDS.has(k)) safeFields[k] = v;
  }
  if (Object.keys(safeFields).length === 0) {
    return json19({ error: "Nenhum campo v\xE1lido para atualizar" }, 400);
  }
  const typeCheck = validateFieldTypes(safeFields);
  if (!typeCheck.ok) {
    return json19({ error: typeCheck.erro, code: "invalid_field_type" }, 400);
  }
  try {
    const res = await fetch(
      `${SUPABASE_URL18}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify(safeFields)
      }
    );
    if (!res.ok) {
      console.error("update-tenant error:", await res.text());
      return json19({ error: "Erro ao atualizar tenant" }, 500);
    }
    if (safeFields.ativo === true) {
      try {
        const tenantRes = await fetch(
          `${SUPABASE_URL18}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=email`,
          {
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`
            }
          }
        );
        if (tenantRes.ok) {
          const tenantData = await tenantRes.json();
          const tenantEmail = tenantData?.[0]?.email;
          if (tenantEmail) {
            await fetch(
              `${SUPABASE_URL18}/rest/v1/onboarding_links?email=eq.${encodeURIComponent(tenantEmail)}&used=eq.false`,
              {
                method: "PATCH",
                headers: {
                  apikey: SUPABASE_KEY,
                  Authorization: `Bearer ${SUPABASE_KEY}`,
                  "Content-Type": "application/json",
                  Prefer: "return=minimal"
                },
                body: JSON.stringify({ used: true })
              }
            );
            console.log("update-tenant: onboarding link marcado como used para:", tenantEmail);
          }
        }
      } catch (linkErr) {
        console.warn("update-tenant: falha ao marcar onboarding link como used:", linkErr.message);
      }
    }
    return json19({ ok: true, updated: Object.keys(safeFields) });
  } catch (err) {
    console.error("update-tenant exception:", err);
    return json19({ error: "Erro interno" }, 500);
  }
}
__name(onRequest29, "onRequest29");
__name2(onRequest29, "onRequest");
var CORS18 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
var SUPABASE_URL19 = "https://bfzuxxuscyplfoimvomh.supabase.co";
function json20(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS18 });
}
__name(json20, "json20");
__name2(json20, "json");
async function onRequest30(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS18 });
  if (request.method !== "POST") return json20({ error: "Method not allowed" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json20({ valid: false, error: "JSON inv\xE1lido" }, 400);
  }
  const { key } = body;
  if (!key || typeof key !== "string" || key.length < 8) {
    return json20({ valid: false, error: "Key inv\xE1lida" }, 400);
  }
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json20({ valid: false, error: "Configura\xE7\xE3o interna ausente" }, 503);
  try {
    const res = await fetch(
      `${SUPABASE_URL19}/rest/v1/onboarding_links?key=eq.${encodeURIComponent(key)}&select=id,key,plano,email,used,expires_at,parent_tenant_id,is_artist_invite`,
      {
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`
        }
      }
    );
    if (!res.ok) {
      console.error("validate-onboarding-key: Supabase error", await res.text());
      return json20({ valid: false, error: "Erro ao verificar link" }, 500);
    }
    const links = await res.json();
    if (!links || links.length === 0) {
      return json20({ valid: false, error: "Link de onboarding inv\xE1lido ou n\xE3o encontrado." });
    }
    const link = links[0];
    if (new Date(link.expires_at) < /* @__PURE__ */ new Date()) {
      return json20({ valid: false, error: "Link de onboarding expirado. Solicite um novo link ao suporte InkFlow." });
    }
    if (link.used) {
      if (link.email) {
        try {
          const tenantCheck = await fetch(
            `${SUPABASE_URL19}/rest/v1/tenants?email=eq.${encodeURIComponent(link.email)}&select=ativo,welcome_shown,config_precificacao&order=created_at.desc&limit=1`,
            {
              headers: {
                apikey: SB_KEY,
                Authorization: `Bearer ${SB_KEY}`
              }
            }
          );
          if (tenantCheck.ok) {
            const tenants = await tenantCheck.json();
            const tenant = tenants[0];
            const onboardingIncompleto = tenant && tenant.ativo === true && (!tenant.welcome_shown || !tenant.config_precificacao || Object.keys(tenant.config_precificacao).length <= 1);
            if (!tenant || tenant.ativo !== true || onboardingIncompleto) {
              await fetch(
                `${SUPABASE_URL19}/rest/v1/onboarding_links?id=eq.${link.id}`,
                {
                  method: "PATCH",
                  headers: {
                    apikey: SB_KEY,
                    Authorization: `Bearer ${SB_KEY}`,
                    "Content-Type": "application/json",
                    Prefer: "return=minimal"
                  },
                  body: JSON.stringify({ used: false })
                }
              );
              console.log("validate-onboarding-key: link reativado para retry (tenant n\xE3o ativo)");
            } else {
              return json20({ valid: false, error: "Este link de onboarding j\xE1 foi utilizado." });
            }
          } else {
            return json20({ valid: false, error: "Este link de onboarding j\xE1 foi utilizado." });
          }
        } catch (e) {
          console.warn("validate-onboarding-key: erro ao verificar tenant para retry:", e);
          return json20({ valid: false, error: "Este link de onboarding j\xE1 foi utilizado." });
        }
      } else {
        return json20({ valid: false, error: "Este link de onboarding j\xE1 foi utilizado." });
      }
    }
    const response = { valid: true, plano: link.plano, link_id: link.id };
    if (link.is_artist_invite && link.parent_tenant_id) {
      response.is_artist_invite = true;
      response.parent_tenant_id = link.parent_tenant_id;
      try {
        const parentRes = await fetch(
          `${SUPABASE_URL19}/rest/v1/tenants?id=eq.${encodeURIComponent(link.parent_tenant_id)}&select=google_calendar_id,nome_estudio,evo_base_url`,
          {
            headers: {
              apikey: SB_KEY,
              Authorization: `Bearer ${SB_KEY}`
            }
          }
        );
        if (parentRes.ok) {
          const parents = await parentRes.json();
          if (parents && parents[0]) {
            response.parent_google_calendar_id = parents[0].google_calendar_id;
            response.parent_nome_estudio = parents[0].nome_estudio;
            response.parent_evo_base_url = parents[0].evo_base_url;
          }
        }
      } catch (e) {
        console.warn("validate-onboarding-key: erro ao buscar dados do tenant pai:", e);
      }
    }
    console.log("validate-onboarding-key: key v\xE1lida, plano:", link.plano, "artista:", !!link.is_artist_invite);
    return json20(response);
  } catch (err) {
    console.error("validate-onboarding-key exception:", err);
    return json20({ valid: false, error: "Erro interno" }, 500);
  }
}
__name(onRequest30, "onRequest30");
__name2(onRequest30, "onRequest");
var CORS19 = {
  "Access-Control-Allow-Origin": "https://inkflowbrasil.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
var SUPABASE_URL20 = "https://bfzuxxuscyplfoimvomh.supabase.co";
function json21(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS19 });
}
__name(json21, "json21");
__name2(json21, "json");
async function onRequest31(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS19 });
  if (request.method !== "POST") return json21({ error: "Method not allowed" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json21({ valid: false, error: "JSON inv\xE1lido" }, 400);
  }
  const { token } = body;
  if (!token || typeof token !== "string" || token.length < 10) {
    return json21({ valid: false, error: "Token inv\xE1lido" }, 400);
  }
  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const TOKEN_SECRET = env.STUDIO_TOKEN_SECRET;
  try {
    const verified = await verifyStudioTokenOrLegacy({
      token,
      secret: TOKEN_SECRET,
      supabaseUrl: SUPABASE_URL20,
      supabaseKey: SUPABASE_KEY
    });
    if (!verified) {
      return json21({ valid: false, error: "Token inv\xE1lido ou expirado. Solicite um novo link." }, 401);
    }
    const tenantFields = [
      "id",
      "nome_estudio",
      "plano",
      "email",
      "evo_instance",
      "ativo",
      "nome",
      "welcome_shown",
      "nome_agente",
      "faq_texto",
      "config_agente",
      "config_precificacao",
      "horario_funcionamento",
      "duracao_sessao_padrao_h",
      "sinal_percentual",
      "gatilhos_handoff",
      "portfolio_urls"
    ].join(",");
    const res = await fetch(
      `${SUPABASE_URL20}/rest/v1/tenants?id=eq.${encodeURIComponent(verified.tenantId)}&select=${tenantFields}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    if (!res.ok) {
      console.error("validate-studio-token: Supabase error", res.status);
      return json21({ valid: false, error: "Erro ao validar token" }, 500);
    }
    const tenants = await res.json();
    if (!tenants || tenants.length === 0) {
      return json21({ valid: false, error: "Tenant n\xE3o encontrado" }, 404);
    }
    const tenant = tenants[0];
    const slotsRes = await fetch(
      `${SUPABASE_URL20}/rest/v1/tenants?parent_tenant_id=eq.${tenant.id}&is_artist_slot=eq.true&select=id,nome,evo_instance,ativo`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    let artists = [];
    if (slotsRes.ok) {
      artists = await slotsRes.json();
    }
    const maxSlots = tenant.plano === "premium" ? 10 : 5;
    const usedSlots = artists.length;
    let refreshedToken = null;
    if (TOKEN_SECRET) {
      const shouldRefresh = verified.source === "legacy-uuid" || verified.shouldRefresh;
      if (shouldRefresh) {
        try {
          refreshedToken = await generateStudioToken(tenant.id, TOKEN_SECRET);
          console.log(`validate-studio-token: token renovado para tenant=${tenant.id} (source=${verified.source})`);
        } catch (e) {
          console.warn("validate-studio-token: falha ao renovar token:", e?.message);
        }
      }
    }
    return json21({
      valid: true,
      tenant: {
        id: tenant.id,
        nome_estudio: tenant.nome_estudio,
        nome: tenant.nome,
        plano: tenant.plano,
        email: tenant.email,
        evo_instance: tenant.evo_instance,
        welcome_shown: !!tenant.welcome_shown,
        ativo: !!tenant.ativo,
        // [v5 agente IA] campos pra aba "Agente & Preços" pre-popular os forms
        nome_agente: tenant.nome_agente || null,
        faq_texto: tenant.faq_texto || null,
        config_agente: tenant.config_agente || null,
        config_precificacao: tenant.config_precificacao || null,
        horario_funcionamento: tenant.horario_funcionamento || null,
        duracao_sessao_padrao_h: tenant.duracao_sessao_padrao_h || null,
        sinal_percentual: tenant.sinal_percentual || null,
        gatilhos_handoff: tenant.gatilhos_handoff || null,
        portfolio_urls: tenant.portfolio_urls || null
      },
      slots: {
        max: maxSlots,
        used: usedSlots,
        remaining: maxSlots - usedSlots - 1
        // -1 porque o dono ocupa 1 slot
      },
      artists: artists.map((a) => ({
        id: a.id,
        nome: a.nome,
        evo_instance: a.evo_instance,
        ativo: a.ativo
      })),
      token_exp: verified.exp || null,
      refreshed_token: refreshedToken
    });
  } catch (err) {
    console.error("validate-studio-token:", err);
    return json21({ valid: false, error: "Erro interno" }, 500);
  }
}
__name(onRequest31, "onRequest31");
__name2(onRequest31, "onRequest");
async function onRequest32(context) {
  const token = context.params.token.join("");
  if (!token) {
    return new Response("Token n\xE3o informado", { status: 400 });
  }
  const destination = `https://inkflowbrasil.com/onboarding?token=${encodeURIComponent(token)}`;
  return Response.redirect(destination, 302);
}
__name(onRequest32, "onRequest32");
__name2(onRequest32, "onRequest");
var SENTRY_DSN = "https://c658b9d1be28f744f2aef5c552ef1b4f@o4511123798687744.ingest.us.sentry.io/4511123944505344";
function parseDSN(dsn) {
  const url = new URL(dsn);
  return {
    publicKey: url.username,
    host: url.hostname,
    protocol: url.protocol,
    projectId: url.pathname.replace("/", ""),
    // Porta da organização (subdomínio)
    origin: `${url.protocol}//${url.hostname}`
  };
}
__name(parseDSN, "parseDSN");
__name2(parseDSN, "parseDSN");
function buildSentryPayload(error, request, dsnParts) {
  const url = new URL(request.url);
  const now = /* @__PURE__ */ new Date();
  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: now.toISOString(),
    platform: "javascript",
    level: "error",
    server_name: "cloudflare-pages",
    environment: "production",
    tags: {
      runtime: "cloudflare-pages-function",
      endpoint: url.pathname,
      method: request.method
    },
    request: {
      url: request.url,
      method: request.method,
      headers: {
        "user-agent": request.headers.get("user-agent") || "unknown",
        "content-type": request.headers.get("content-type") || "unknown",
        origin: request.headers.get("origin") || "unknown"
      },
      query_string: url.search || ""
    },
    exception: {
      values: [
        {
          type: error.name || "Error",
          value: error.message || "Unknown error",
          stacktrace: error.stack ? {
            frames: error.stack.split("\n").filter((line) => line.includes("at ")).map((line) => ({
              filename: line.trim(),
              function: line.trim().replace(/^\s*at\s+/, "").split(" ")[0] || "?"
            })).reverse()
          } : void 0
        }
      ]
    },
    extra: {
      cf_ray: request.headers.get("cf-ray") || "unknown",
      cf_country: request.headers.get("cf-ipcountry") || "unknown",
      cf_ip: request.headers.get("cf-connecting-ip") || "unknown"
    }
  };
  return event;
}
__name(buildSentryPayload, "buildSentryPayload");
__name2(buildSentryPayload, "buildSentryPayload");
async function sendToSentry(event, dsnParts) {
  const storeUrl = `${dsnParts.origin}/api/${dsnParts.projectId}/store/?sentry_version=7&sentry_key=${dsnParts.publicKey}`;
  try {
    await fetch(storeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event)
    });
  } catch (e) {
    console.error("Sentry send failed:", e.message);
  }
}
__name(sendToSentry, "sendToSentry");
__name2(sendToSentry, "sendToSentry");
async function onRequest33(context) {
  const dsnParts = parseDSN(SENTRY_DSN);
  try {
    const response = await context.next();
    return response;
  } catch (error) {
    console.error(`[SENTRY-MIDDLEWARE] Erro em ${context.request.url}:`, error.message);
    const event = buildSentryPayload(error, context.request, dsnParts);
    context.waitUntil(sendToSentry(event, dsnParts));
    return new Response(
      JSON.stringify({
        error: "Erro interno do servidor. Nossa equipe j\xE1 foi notificada."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://inkflowbrasil.com"
        }
      }
    );
  }
}
__name(onRequest33, "onRequest33");
__name2(onRequest33, "onRequest");
var routes = [
  {
    routePath: "/api/cron/expira-holds",
    mountPath: "/api/cron",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/api/tools/acionar-handoff",
    mountPath: "/api/tools",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/api/tools/calcular-orcamento",
    mountPath: "/api/tools",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  },
  {
    routePath: "/api/tools/consultar-horarios",
    mountPath: "/api/tools",
    method: "",
    middlewares: [],
    modules: [onRequest4]
  },
  {
    routePath: "/api/tools/enviar-portfolio",
    mountPath: "/api/tools",
    method: "",
    middlewares: [],
    modules: [onRequest5]
  },
  {
    routePath: "/api/tools/gerar-link-sinal",
    mountPath: "/api/tools",
    method: "",
    middlewares: [],
    modules: [onRequest6]
  },
  {
    routePath: "/api/tools/preview-orcamento",
    mountPath: "/api/tools",
    method: "",
    middlewares: [],
    modules: [onRequest7]
  },
  {
    routePath: "/api/tools/prompt",
    mountPath: "/api/tools",
    method: "",
    middlewares: [],
    modules: [onRequest8]
  },
  {
    routePath: "/api/tools/reservar-horario",
    mountPath: "/api/tools",
    method: "",
    middlewares: [],
    modules: [onRequest9]
  },
  {
    routePath: "/api/tools/simular-conversa",
    mountPath: "/api/tools",
    method: "",
    middlewares: [],
    modules: [onRequest10]
  },
  {
    routePath: "/api/webhooks/mp-sinal",
    mountPath: "/api/webhooks",
    method: "",
    middlewares: [],
    modules: [onRequest11]
  },
  {
    routePath: "/api/cleanup-tenants",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest12]
  },
  {
    routePath: "/api/create-artist-invite",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest13]
  },
  {
    routePath: "/api/create-onboarding-link",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest14]
  },
  {
    routePath: "/api/create-subscription",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest15]
  },
  {
    routePath: "/api/create-tenant",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest16]
  },
  {
    routePath: "/api/delete-tenant",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest17]
  },
  {
    routePath: "/api/evo-create-instance",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest18]
  },
  {
    routePath: "/api/evo-pairing-code",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest19]
  },
  {
    routePath: "/api/evo-qr",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest20]
  },
  {
    routePath: "/api/evo-status",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest21]
  },
  {
    routePath: "/api/get-studio-token",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest22]
  },
  {
    routePath: "/api/get-tenant",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest23]
  },
  {
    routePath: "/api/mp-ipn",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest24]
  },
  {
    routePath: "/api/public-start",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest25]
  },
  {
    routePath: "/api/request-studio-link",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest26]
  },
  {
    routePath: "/api/send-studio-email",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest27]
  },
  {
    routePath: "/api/send-whatsapp-link",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest28]
  },
  {
    routePath: "/api/update-tenant",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest29]
  },
  {
    routePath: "/api/validate-onboarding-key",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest30]
  },
  {
    routePath: "/api/validate-studio-token",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest31]
  },
  {
    routePath: "/start/:token*",
    mountPath: "/start",
    method: "",
    middlewares: [],
    modules: [onRequest32]
  },
  {
    routePath: "/",
    mountPath: "/",
    method: "",
    middlewares: [onRequest33],
    modules: []
  }
];
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name2(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  static {
    __name(this, "___Facade_ScheduledController__");
  }
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name2(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name2((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name2((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// ../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// ../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-dKkxrd/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// ../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-dKkxrd/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class ___Facade_ScheduledController__2 {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.7782612408702769.js.map
