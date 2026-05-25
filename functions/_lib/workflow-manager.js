// Workflow Manager minimo: autoridade central para conclusao de fases.
// Primeiro contrato suportado: cadastro completo -> handoff para tatuador.

function hasValue(v) {
  return v !== null && v !== undefined && v !== '';
}

export function isTattooBriefComplete(dados = {}) {
  return Boolean(
    (hasValue(dados.descricao_tattoo) || hasValue(dados.descricao_curta))
    && hasValue(dados.local_corpo)
    && hasValue(dados.altura_cm)
    && hasValue(dados.estilo)
  );
}

export function isCadastroComplete(dados = {}) {
  return Boolean(
    hasValue(dados.nome)
    && hasValue(dados.data_nascimento)
    && (hasValue(dados.email) || dados.email_recusado === true)
  );
}

export function evaluateWorkflowTransition({
  estado_atual,
  agentOut,
  dados_coletados,
  dados_cadastro,
} = {}) {
  if (estado_atual !== 'cadastro') {
    return {
      shouldTransition: false,
      fromState: estado_atual,
      toState: agentOut?.estado_novo || estado_atual,
      reason: 'unsupported_state',
    };
  }

  if (agentOut?.proxima_acao === 'handoff') {
    return {
      shouldTransition: true,
      fromState: 'cadastro',
      toState: 'aguardando_tatuador',
      reason: 'agent_requested_handoff',
    };
  }

  const cadastroComplete = isCadastroComplete(dados_cadastro);
  const tattooComplete = isTattooBriefComplete(dados_coletados);
  if (!cadastroComplete || !tattooComplete) {
    return {
      shouldTransition: false,
      fromState: 'cadastro',
      toState: agentOut?.estado_novo || 'cadastro',
      reason: 'requirements_missing',
      missingRequirements: {
        cadastro: cadastroComplete ? [] : ['nome', 'data_nascimento', 'email_or_refusal'],
        tattoo: tattooComplete ? [] : ['descricao', 'local_corpo', 'altura_cm', 'estilo'],
      },
    };
  }

  return {
    shouldTransition: true,
    fromState: 'cadastro',
    toState: 'aguardando_tatuador',
    reason: 'cadastro_and_tattoo_complete',
  };
}

export function summarizeWorkflowDecision(decision = {}) {
  const missingCadastro = Array.isArray(decision?.missingRequirements?.cadastro)
    ? decision.missingRequirements.cadastro.length
    : 0;
  const missingTattoo = Array.isArray(decision?.missingRequirements?.tattoo)
    ? decision.missingRequirements.tattoo.length
    : 0;

  return {
    workflow_layer: 'workflow_manager',
    workflow_from_state: decision.fromState || null,
    workflow_to_state: decision.toState || null,
    workflow_transition_allowed: decision.shouldTransition === true,
    workflow_reason: decision.reason || null,
    workflow_missing_cadastro_count: missingCadastro,
    workflow_missing_tattoo_count: missingTattoo,
  };
}

export function applyWorkflowTransition({ estado_atual, agentOut, dados_coletados, dados_cadastro } = {}) {
  const decision = evaluateWorkflowTransition({ estado_atual, agentOut, dados_coletados, dados_cadastro });
  if (!decision.shouldTransition) return { agentOut, decision };

  return {
    decision,
    agentOut: {
      ...agentOut,
      estado_novo: decision.toState,
      proxima_acao: 'handoff',
      dados_completos: true,
      campos_faltando: [],
      campos_conflitantes: [],
      workflow_decision: decision,
    },
  };
}
