// Helper de validacao pos-output: idade < 18 transforma handoff em erro
// + resposta padronizada. Aplicado em route.js apenas quando estado='cadastro'
// (Tattoo nao tem data_nascimento). Pattern Sub-2: agent decide intent +
// estrutura, helpers validam.

export function calcIdade(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) {
    age--;
  }
  return age;
}

export function enforceMenorIdade(out) {
  const idade = calcIdade(out?.dados_persistidos?.data_nascimento);
  if (idade !== null && idade < 18) {
    return {
      ...out,
      proxima_acao: 'erro',
      resposta_cliente:
        'Pra clientes com menos de 18 anos o tatuador conversa direto com o responsavel legal — ja sinalizei pra ele.',
      campos_faltando: [...(out.campos_faltando || []), 'menor_idade_trigger'],
    };
  }
  return out;
}
