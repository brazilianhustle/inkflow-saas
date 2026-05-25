// Escalation Manager: centraliza quando e por que a IA deve sair de cena.
// Coberturas formais iniciais: menoridade, cobertura/cover-up, pedido humano e cliente irritado.

function preview(value, max = 500) {
  return String(value || '').slice(0, max);
}

function fields(agentOut) {
  return Array.isArray(agentOut?.campos_faltando) ? agentOut.campos_faltando : [];
}

function cleanObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => [k, Array.isArray(v) ? `${v.length} item(ns)` : v])
  );
}

function formatDataLine(label, data) {
  const entries = Object.entries(cleanObject(data));
  if (entries.length === 0) return null;
  return `${label}: ${entries.map(([k, v]) => `${k}=${preview(v, 80)}`).join('; ')}`;
}

export function buildEscalationHandoffPackage({ conversa, agentOut } = {}) {
  const tattoo = cleanObject(conversa?.dados_coletados);
  const cadastro = cleanObject(conversa?.dados_cadastro);
  const missingFields = fields(agentOut);
  return {
    version: 'handoff_package_v1',
    has_summary: Object.keys(tattoo).length > 0 || Object.keys(cadastro).length > 0 || missingFields.length > 0,
    tattoo_fields_count: Object.keys(tattoo).length,
    cadastro_fields_count: Object.keys(cadastro).length,
    missing_fields_count: missingFields.length,
    lines: [
      formatDataLine('Tattoo', tattoo),
      formatDataLine('Cadastro', cadastro),
      missingFields.length > 0 ? `Campos/flags: ${missingFields.join(', ')}` : null,
    ].filter(Boolean),
  };
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
      matched_tenant_trigger: explicit.matched_tenant_trigger || agentOut?.matched_trigger || null,
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
    matched_tenant_trigger: null,
  };
}

export function composeEscalationTelegram({ decision, tenant, telefone, estado_atual, agentOut, handoffPackage } = {}) {
  const d = decision || evaluateEscalation({ estado_atual, agentOut });
  const pkg = handoffPackage || buildEscalationHandoffPackage({ agentOut });
  return [
    `Atendimento precisa de humano [escalation:${d.reason_code || 'unknown'}]`,
    '',
    `Tenant: ${tenant?.id || '(unknown)'}`,
    `Cliente: ${telefone || '(unknown)'}`,
    `Estado: ${estado_atual || '(unknown)'}`,
    `Severidade: ${d.severity || 'unknown'}`,
    `Motivo: ${d.reason_label || d.reason_code || 'unknown'}`,
    `Fonte: ${d.source || 'unknown'}`,
    d.matched_tenant_trigger ? `Gatilho tenant: ${d.matched_tenant_trigger}` : null,
    '',
    `Pacote: ${pkg.version}`,
    pkg.lines.length > 0 ? 'Resumo operacional:' : null,
    ...pkg.lines,
    '',
    'Resposta enviada ao cliente:',
    preview(agentOut?.resposta_cliente, 500),
  ].filter(line => line !== null).join('\n');
}
