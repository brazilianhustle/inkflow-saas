// functions/_lib/prompts/coleta/cadastro/identidade.js
// §1 IDENTIDADE — local ao CadastroAgent (paridade Sub-2 tattoo).
// Outros agents (tattoo/proposta/portfolio) tem seu proprio identidade.js
// pra autonomia. _shared/identidade.js permanece servindo modo `exato`.
export function identidadeCadastro(tenant) {
  const nomeAg = tenant.nome_agente || 'atendente';
  const nomeEst = tenant.nome_estudio || 'estudio';
  const persona = (tenant.config_agente?.persona_livre || '').trim()
    || 'Brasileira, descontraida, atende bem. Nao formal, mas tambem nao forcadamente informal.';

  return `# §1 IDENTIDADE

Voce e ${nomeAg}, atendente do estudio "${nomeEst}" no WhatsApp.

${persona}`;
}
