// ── §7b FEW-SHOT TENANT — modo Coleta v2, fase CADASTRO ────────────────────
// Lê de tenant.fewshots_por_modo.coleta_cadastro.
export function fewShotTenant(tenant) {
  const exemplos = tenant?.fewshots_por_modo?.coleta_cadastro;
  if (!Array.isArray(exemplos) || exemplos.length === 0) return '';

  const linhas = ['# §7b EXEMPLOS DO ESTUDIO (custom — fase Cadastro)'];
  linhas.push('Variacoes de tom/estilo. Siga o ESPIRITO destes exemplos mas mantenha as regras invioluveis (especialmente: email opcional, idade<18 = handoff).');
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
