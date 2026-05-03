// ── §7b FEW-SHOT TENANT — modo Coleta v2, fase PROPOSTA ────────────────────
// Lê de tenant.fewshots_por_modo.coleta_proposta.
export function fewShotTenant(tenant) {
  const exemplos = tenant?.fewshots_por_modo?.coleta_proposta;
  if (!Array.isArray(exemplos) || exemplos.length === 0) return '';

  const linhas = ['# §7b EXEMPLOS DO ESTUDIO (custom — fase Proposta)'];
  linhas.push('Variacoes de tom/estilo. Siga o ESPIRITO destes exemplos. Importante: os 3 caminhos (aceita/desconto/adia) sao invioluveis — mesmo que exemplos custom mostrem outro fluxo, voce segue os 3 caminhos do §3.2.');
  linhas.push('');

  for (const ex of exemplos) {
    if (!ex || typeof ex !== 'object' || !ex.cliente || !ex.agente) continue;
    linhas.push('```');
    linhas.push(`CLIENTE: ${ex.cliente}`);
    linhas.push(`AGENTE: ${ex.agente}`);
    linhas.push('```');
    linhas.push('');
  }

  return linhas.join('\n');
}
