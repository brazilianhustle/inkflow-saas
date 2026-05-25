import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWorkflowTransition,
  evaluateWorkflowTransition,
  missingCadastroRequirements,
  missingTattooRequirements,
  summarizeWorkflowDecision,
} from '../../functions/_lib/workflow-manager.js';

const tattooComplete = {
  descricao_curta: 'leao',
  local_corpo: 'antebraco',
  altura_cm: 170,
  estilo: 'fineline',
};

const cadastroComplete = {
  nome: 'Joao Silva',
  data_nascimento: '1995-03-12',
  email_recusado: true,
};

test('Workflow Manager: cadastro completo promove para aguardando_tatuador', () => {
  const decision = evaluateWorkflowTransition({
    estado_atual: 'cadastro',
    agentOut: { proxima_acao: 'pergunta', estado_novo: 'cadastro' },
    dados_coletados: tattooComplete,
    dados_cadastro: cadastroComplete,
  });

  assert.equal(decision.shouldTransition, true);
  assert.equal(decision.fromState, 'cadastro');
  assert.equal(decision.toState, 'aguardando_tatuador');
  assert.equal(decision.reason, 'cadastro_and_tattoo_complete');
});

test('Workflow Manager: cadastro incompleto bloqueia transicao e resume faltantes', () => {
  const decision = evaluateWorkflowTransition({
    estado_atual: 'cadastro',
    agentOut: { proxima_acao: 'pergunta', estado_novo: 'cadastro' },
    dados_coletados: { descricao_curta: 'leao' },
    dados_cadastro: { nome: 'Joao Silva' },
  });

  assert.equal(decision.shouldTransition, false);
  assert.equal(decision.reason, 'requirements_missing');
  assert.deepEqual(decision.missingRequirements.cadastro, ['data_nascimento', 'email_or_refusal']);
  assert.deepEqual(decision.missingRequirements.tattoo, ['local_corpo', 'altura_cm', 'estilo']);
});

test('Workflow Manager: calcula faltantes exatos por fase', () => {
  assert.deepEqual(missingCadastroRequirements({ nome: 'Joao' }), ['data_nascimento', 'email_or_refusal']);
  assert.deepEqual(missingCadastroRequirements({ nome: 'Joao', data_nascimento: '1995-03-12', email_recusado: true }), []);
  assert.deepEqual(missingTattooRequirements({ descricao_curta: 'leao' }), ['local_corpo', 'altura_cm', 'estilo']);
  assert.deepEqual(missingTattooRequirements(tattooComplete), []);
});

test('Workflow Manager: applyWorkflowTransition força payload seguro quando permitido', () => {
  const result = applyWorkflowTransition({
    estado_atual: 'cadastro',
    agentOut: {
      ok: true,
      resposta_cliente: 'vou enviar para o tatuador',
      proxima_acao: 'pergunta',
      estado_novo: 'cadastro',
      dados_completos: false,
      campos_faltando: ['email'],
    },
    dados_coletados: tattooComplete,
    dados_cadastro: cadastroComplete,
  });

  assert.equal(result.agentOut.estado_novo, 'aguardando_tatuador');
  assert.equal(result.agentOut.proxima_acao, 'handoff');
  assert.equal(result.agentOut.dados_completos, true);
  assert.deepEqual(result.agentOut.campos_faltando, []);
  assert.equal(result.agentOut.workflow_decision.reason, 'cadastro_and_tattoo_complete');
});

test('Workflow Manager: resumo observavel nao vaza dados pessoais', () => {
  const metadata = summarizeWorkflowDecision({
    shouldTransition: true,
    fromState: 'cadastro',
    toState: 'aguardando_tatuador',
    reason: 'cadastro_and_tattoo_complete',
  });

  assert.deepEqual(metadata, {
    workflow_layer: 'workflow_manager',
    workflow_from_state: 'cadastro',
    workflow_to_state: 'aguardando_tatuador',
    workflow_transition_allowed: true,
    workflow_reason: 'cadastro_and_tattoo_complete',
    workflow_requested_state: null,
    workflow_can_mutate_state: null,
    workflow_blocked_mutation: false,
    workflow_missing_cadastro_count: 0,
    workflow_missing_tattoo_count: 0,
    workflow_escalation_reason_code: null,
    workflow_escalation_severity: null,
    workflow_escalation_requires_orcid: null,
  });
});

test('Workflow Manager: escalonamento humano vira transicao formal observavel', () => {
  const result = applyWorkflowTransition({
    estado_atual: 'tattoo',
    agentOut: {
      ok: true,
      handled_by: 'conversation_router',
      estado_novo: 'aguardando_tatuador',
      resposta_cliente: 'vou acionar uma pessoa do estudio',
      proxima_acao: 'erro',
      campos_faltando: ['client_upset_trigger'],
      escalation: {
        required: true,
        reason_code: 'client_upset',
        reason_label: 'cliente irritado',
        severity: 'high',
        source: 'conversation_router',
        requires_orcid: false,
      },
    },
    dados_coletados: { descricao_curta: 'rosa' },
    dados_cadastro: {},
  });

  assert.equal(result.agentOut.estado_novo, 'aguardando_tatuador');
  assert.equal(result.agentOut.proxima_acao, 'erro');
  assert.equal(result.agentOut.workflow_decision.reason, 'escalation_required');
  assert.equal(result.agentOut.workflow_decision.escalation.reason_code, 'client_upset');

  const metadata = summarizeWorkflowDecision(result.agentOut.workflow_decision);
  assert.equal(metadata.workflow_from_state, 'tattoo');
  assert.equal(metadata.workflow_to_state, 'aguardando_tatuador');
  assert.equal(metadata.workflow_transition_allowed, true);
  assert.equal(metadata.workflow_reason, 'escalation_required');
  assert.equal(metadata.workflow_escalation_reason_code, 'client_upset');
  assert.equal(metadata.workflow_escalation_severity, 'high');
  assert.equal(metadata.workflow_escalation_requires_orcid, false);
});

test('Workflow Manager: Router sem permissao de mutacao preserva estado', () => {
  const result = applyWorkflowTransition({
    estado_atual: 'tattoo',
    agentOut: {
      ok: true,
      handled_by: 'conversation_router',
      can_mutate_state: false,
      estado_novo: 'aguardando_tatuador',
      resposta_cliente: 'resposta lateral',
      proxima_acao: 'pergunta',
    },
    dados_coletados: {},
    dados_cadastro: {},
  });

  assert.equal(result.agentOut.estado_novo, 'tattoo');
  assert.equal(result.agentOut.workflow_decision.reason, 'mutation_blocked_by_router_policy');
  assert.equal(result.agentOut.workflow_decision.requestedState, 'aguardando_tatuador');
  assert.equal(result.agentOut.workflow_decision.blockedMutation, true);
});

test('Workflow Manager: Router lateral que ja preserva estado tambem fica observavel', () => {
  const result = applyWorkflowTransition({
    estado_atual: 'tattoo',
    agentOut: {
      ok: true,
      handled_by: 'conversation_router',
      can_mutate_state: false,
      estado_novo: 'tattoo',
      resposta_cliente: 'resposta lateral',
      proxima_acao: 'pergunta',
    },
    dados_coletados: {},
    dados_cadastro: {},
  });

  assert.equal(result.agentOut.estado_novo, 'tattoo');
  assert.equal(result.agentOut.workflow_decision.reason, 'state_preserved_by_router_policy');
  assert.equal(result.agentOut.workflow_decision.blockedMutation, false);
});

test('Workflow Manager: cadastro completo vence Router lateral sem mutacao', () => {
  const result = applyWorkflowTransition({
    estado_atual: 'cadastro',
    agentOut: {
      ok: true,
      handled_by: 'conversation_router',
      can_mutate_state: false,
      estado_novo: 'cadastro',
      resposta_cliente: 'resposta lateral e fechamento',
      proxima_acao: 'pergunta',
    },
    dados_coletados: tattooComplete,
    dados_cadastro: cadastroComplete,
  });

  assert.equal(result.agentOut.estado_novo, 'aguardando_tatuador');
  assert.equal(result.agentOut.proxima_acao, 'handoff');
  assert.equal(result.agentOut.workflow_decision.reason, 'cadastro_and_tattoo_complete');
});
