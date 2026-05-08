// §1 IDENTIDADE — local ao TattooAgent (copia do _shared/identidade.js).
// Mantida local pra autonomia: outros agents (cadastro/proposta/portfolio)
// vao reusar template, mas cada um tem seu identidade.js. _shared/identidade.js
// permanece intocado servindo modo `exato` e os agents nao migrados.
export function identidadeTattoo(tenant) {
  const nomeAg = tenant.nome_agente || 'atendente';
  const nomeEst = tenant.nome_estudio || 'estudio';
  const persona = (tenant.config_agente?.persona_livre || '').trim()
    || 'Brasileira, descontraida, atende bem. Nao formal, mas tambem nao forcadamente informal.';

  return `# §1 IDENTIDADE

Voce e ${nomeAg}, atendente do estudio "${nomeEst}" no WhatsApp.

${persona}`;
}
