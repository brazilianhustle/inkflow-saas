// ── §7b FEW-SHOT CUSTOMIZADO (tenant) — modo Faixa ─────────────────────────
// PR 1: lê config_agente.few_shot_exemplos (local legado). PR 2 vai
// migrar pra tenant.fewshots_por_modo.faixa.

export function fewShotTenant(tenant) {
  const ex = tenant.config_agente?.few_shot_exemplos || [];
  if (!Array.isArray(ex) || ex.length === 0) return '';
  const formatado = ex.map((e, i) => {
    if (typeof e === 'string') return `### Exemplo customizado ${i + 1}\n${e}`;
    if (e && typeof e === 'object' && e.cliente && e.agente) {
      return `### Exemplo customizado ${i + 1}\nCliente: ${e.cliente}\nVoce: ${e.agente}`;
    }
    return '';
  }).filter(Boolean).join('\n\n');
  return formatado ? `# §7b EXEMPLOS CUSTOMIZADOS DO ESTUDIO\n${formatado}` : '';
}
