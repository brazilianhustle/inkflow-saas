// Escalation Manager: centraliza quando e por que a IA deve sair de cena.
// Coberturas formais iniciais: menoridade, cobertura/cover-up, pedido humano e cliente irritado.

function preview(value, max = 500) {
  return String(value || '').slice(0, max);
}

function fields(agentOut) {
  return Array.isArray(agentOut?.campos_faltando) ? agentOut.campos_faltando : [];
}

export function evaluateEscalation({ estado_atual, agentOut } = {}) {
  const explicit = agentOut?.escalation || agentOut?.escalation_decision || null;
  if (explicit?.required === true) {
    return {
      required: true,
      reason_code: explicit.reason_code || 'human_review',
      reason_label: explicit.reason_label || 'revisao humana',
      severity: explicit.severity || 'medium',
      source: explicit.source || 'agent_output',
      requires_orcid: explicit.requires_orcid === true,
    };
  }

  if (estado_atual === 'cadastro' && agentOut?.proxima_acao === 'erro') {
    if (fields(agentOut).includes('menor_idade_trigger')) {
      return {
        required: true,
        reason_code: 'minor_age',
        reason_label: 'menoridade / responsavel legal',
        severity: 'high',
        source: 'campos_faltando',
        requires_orcid: false,
      };
    }

    return {
      required: true,
      reason_code: 'cadastro_human_review',
      reason_label: 'cadastro precisa de humano',
      severity: 'medium',
      source: 'agent_error',
      requires_orcid: false,
    };
  }

  if (estado_atual === 'tattoo' && agentOut?.proxima_acao === 'erro') {
    if (fields(agentOut).includes('client_upset_trigger')) {
      return {
        required: true,
        reason_code: 'client_upset',
        reason_label: 'cliente irritado',
        severity: 'high',
        source: 'campos_faltando',
        requires_orcid: false,
      };
    }

    if (fields(agentOut).includes('human_requested_trigger')) {
      return {
        required: true,
        reason_code: 'human_requested',
        reason_label: 'cliente pediu humano',
        severity: 'medium',
        source: 'campos_faltando',
        requires_orcid: false,
      };
    }

    if (agentOut?.cobertura_suspeita === true || fields(agentOut).includes('cover_up_trigger')) {
      return {
        required: true,
        reason_code: 'cover_up',
        reason_label: 'cobertura / cover-up',
        severity: 'high',
        source: agentOut?.cobertura_suspeita === true ? 'cobertura_suspeita' : 'campos_faltando',
        requires_orcid: false,
      };
    }
  }

  return {
    required: false,
    reason_code: null,
    reason_label: null,
    severity: null,
    source: null,
    requires_orcid: false,
  };
}

export function composeEscalationTelegram({ decision, tenant, telefone, estado_atual, agentOut } = {}) {
  const d = decision || evaluateEscalation({ estado_atual, agentOut });
  return [
    `Atendimento precisa de humano [escalation:${d.reason_code || 'unknown'}]`,
    '',
    `Tenant: ${tenant?.id || '(unknown)'}`,
    `Cliente: ${telefone || '(unknown)'}`,
    `Estado: ${estado_atual || '(unknown)'}`,
    `Severidade: ${d.severity || 'unknown'}`,
    `Motivo: ${d.reason_label || d.reason_code || 'unknown'}`,
    `Fonte: ${d.source || 'unknown'}`,
    '',
    'Resposta enviada ao cliente:',
    preview(agentOut?.resposta_cliente, 500),
  ].join('\n');
}
