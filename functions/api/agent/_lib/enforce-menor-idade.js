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

export function extractIsoDateFromText(text) {
  const s = String(text || '');
  let m = s.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/);
  if (m) {
    const dd = String(Number(m[1])).padStart(2, '0');
    const mm = String(Number(m[2])).padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export function enforceMenorIdade(out, mensagem = '') {
  const persistedDate = out?.dados_persistidos?.data_nascimento;
  const messageDate = extractIsoDateFromText(mensagem);
  const dateForCheck = persistedDate || messageDate;
  const idade = calcIdade(dateForCheck);
  if (idade !== null && idade < 18) {
    return {
      ...out,
      proxima_acao: 'erro',
      resposta_cliente:
        'Como a pessoa que vai tatuar tem menos de 18 anos, eu nao consigo seguir com o orçamento direto por aqui. Vou acionar o tatuador para orientar com segurança sobre responsável legal e próximos passos.',
      dados_persistidos: {
        ...(out.dados_persistidos || {}),
        data_nascimento: dateForCheck,
      },
      escalation: {
        required: true,
        reason_code: 'minor_age',
        reason_label: 'menoridade / responsavel legal',
        severity: 'high',
        source: persistedDate ? 'dados_persistidos.data_nascimento' : 'mensagem',
        requires_orcid: false,
      },
      campos_faltando: [...(out.campos_faltando || []), 'menor_idade_trigger'],
    };
  }
  return out;
}
