// ── Validação do payload config_precificacao (modo Coleta) ─────────────────
// Função pura. Retorna { ok, erro?, cleanedCfg? } onde cleanedCfg é o config
// com campos coleta removidos se modo != 'coleta' (defensive cleanup).

const MODOS_VALIDOS = ['faixa', 'exato', 'coleta'];
const SUBMODES_COLETA = ['puro', 'reentrada'];

export function validarConfigPrecificacao(cfg, { enableColetaMode = false } = {}) {
  if (cfg === undefined || cfg === null) return { ok: true, cleanedCfg: cfg };
  if (typeof cfg !== 'object' || Array.isArray(cfg)) {
    return { ok: false, erro: 'config_precificacao deve ser objeto JSON' };
  }

  const out = { ...cfg };

  // modo
  if (out.modo !== undefined && !MODOS_VALIDOS.includes(out.modo)) {
    return { ok: false, erro: `config_precificacao.modo deve ser um de: ${MODOS_VALIDOS.join(', ')}` };
  }

  // Feature flag: modo='coleta' só passa se ENABLE_COLETA_MODE on
  if (out.modo === 'coleta' && !enableColetaMode) {
    return { ok: false, erro: 'modo=coleta ainda não disponível (feature flag OFF)' };
  }

  // coleta_submode — obrigatório quando modo=coleta
  if (out.modo === 'coleta') {
    if (!out.coleta_submode) {
      return { ok: false, erro: 'coleta_submode obrigatório quando modo=coleta' };
    }
    if (!SUBMODES_COLETA.includes(out.coleta_submode)) {
      return { ok: false, erro: `coleta_submode deve ser um de: ${SUBMODES_COLETA.join(', ')}` };
    }
  }

  // trigger_handoff — obrigatório + bounded quando submode=reentrada
  if (out.modo === 'coleta' && out.coleta_submode === 'reentrada') {
    const trig = out.trigger_handoff;
    if (typeof trig !== 'string' || trig.length < 2 || trig.length > 50) {
      return { ok: false, erro: 'trigger_handoff deve ser string entre 2 e 50 caracteres' };
    }
  }

  // Defensive cleanup: remove campos coleta se modo != coleta
  if (out.modo && out.modo !== 'coleta') {
    delete out.coleta_submode;
    delete out.trigger_handoff;
  }
  // Se modo=coleta mas submode=puro, remove trigger_handoff
  if (out.modo === 'coleta' && out.coleta_submode !== 'reentrada') {
    delete out.trigger_handoff;
  }

  return { ok: true, cleanedCfg: out };
}

export function validarFewshotsPorModo(val) {
  if (val === undefined || val === null) return { ok: true };
  if (typeof val !== 'object' || Array.isArray(val)) {
    return { ok: false, erro: 'fewshots_por_modo deve ser objeto JSON' };
  }
  const keysEsperadas = ['faixa', 'exato', 'coleta_info', 'coleta_agendamento'];
  for (const k of keysEsperadas) {
    if (val[k] !== undefined && !Array.isArray(val[k])) {
      return { ok: false, erro: `fewshots_por_modo.${k} deve ser array` };
    }
  }
  return { ok: true };
}
