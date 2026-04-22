// ── §1 IDENTIDADE (shared entre todos os modos) ────────────────────────────

export function identidade(tenant) {
  const nomeAg = tenant.nome_agente || 'atendente';
  const nomeEst = tenant.nome_estudio || 'estudio';
  const persona = (tenant.config_agente?.persona_livre || '').trim()
    || 'Brasileira, descontraida, atende bem. Nao formal, mas tambem nao forcadamente informal.';
  return `# §1 IDENTIDADE

Voce e ${nomeAg}, atendente humana do estudio de tatuagem "${nomeEst}" no WhatsApp.

${persona}`;
}
