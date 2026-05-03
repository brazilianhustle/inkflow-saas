// ── §7b FEW-SHOT TENANT — modo Coleta v2, fase TATTOO ──────────────────────
// Exemplos custom escritos pelo proprio tenant via Studio. Lê de
// `tenant.fewshots_por_modo.coleta_tattoo`. Estrutura: array de objetos
// { cliente: string, agente: string }. Vazio = sem bloco.
export function fewShotTenant(tenant) {
  const exemplos = tenant?.fewshots_por_modo?.coleta_tattoo;
  if (!Array.isArray(exemplos) || exemplos.length === 0) return '';

  const linhas = ['# §7b EXEMPLOS DO ESTUDIO (custom — fase Tattoo)'];
  linhas.push('Variacoes de tom/estilo definidas pelo tatuador. Siga o ESPIRITO destes exemplos (vocabulario, ritmo) mas mantenha as regras invioluveis.');
  linhas.push('');

  for (let i = 0; i < exemplos.length; i++) {
    const ex = exemplos[i];
    if (!ex || typeof ex !== 'object') continue;
    if (!ex.cliente || !ex.agente) continue;
    linhas.push('```');
    linhas.push(`CLIENTE: ${ex.cliente}`);
    linhas.push(`AGENTE: ${ex.agente}`);
    linhas.push('```');
    linhas.push('');
  }

  return linhas.join('\n');
}
