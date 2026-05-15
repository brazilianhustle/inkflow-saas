// rubric.mjs — scoring das 9 dimensoes do eval harness InkFlow Agent.
// Combina output dos 3 judges (naturalidade, manifesto, state) + checks
// deterministicos em pass/fail.

const DEFAULT_THRESHOLDS = {
  naturalidade_min: 4.0,
  manifesto_adherence_min: 0.85,
  funcionalidade_min: 0.8,
};

export function scoreNaturalidade(judgeOut) {
  const dims = ['n1_wpp_br', 'n2_robot_tells', 'n3_tom_consistente', 'n4_comprimento', 'n5_pontuacao'];
  const vals = dims.map(k => judgeOut[k]).filter(v => typeof v === 'number');
  const media = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  return { media: Number(media.toFixed(2)), per_dim: Object.fromEntries(dims.map(d => [d, judgeOut[d]])) };
}

export function scoreManifesto(judgeOut) {
  const perP = judgeOut.per_principle || {};
  const applicable = Object.values(perP).filter(v => typeof v === 'number');
  const m1 = applicable.length ? applicable.reduce((a, b) => a + b, 0) / applicable.length : null;
  return {
    m1_manifesto_adherence: m1,
    m2: judgeOut.m2_validacao_substantiva ?? null,
    m3: judgeOut.m3_multi_balao_apropriado ?? null,
    per_principle: perP,
    violations: judgeOut.violations || [],
  };
}

export function scoreState(judgeOut) {
  return {
    s1: judgeOut.s1_state_transition_ok ?? null,
    esperado_seria: judgeOut.esperado_seria || null,
    razao: judgeOut.razao || null,
  };
}

export function computePass({ naturalidade, manifesto, state, funcionalidade }, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const fails = [];

  if (naturalidade.media < t.naturalidade_min) fails.push('naturalidade');
  if (manifesto.m1_manifesto_adherence != null && manifesto.m1_manifesto_adherence < t.manifesto_adherence_min) fails.push('manifesto');
  if (state.s1 === 0) fails.push('state_transition');
  if (typeof funcionalidade === 'number' && funcionalidade < t.funcionalidade_min) fails.push('funcionalidade');

  return { pass: fails.length === 0, fails, thresholds: t };
}
