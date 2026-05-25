import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeEscalationTelegram, evaluateEscalation } from '../../functions/_lib/escalation-manager.js';

test('evaluateEscalation: menoridade em cadastro vira escalonamento high sem orcid', () => {
  const decision = evaluateEscalation({
    estado_atual: 'cadastro',
    agentOut: {
      proxima_acao: 'erro',
      campos_faltando: ['menor_idade_trigger'],
    },
  });

  assert.equal(decision.required, true);
  assert.equal(decision.reason_code, 'minor_age');
  assert.equal(decision.severity, 'high');
  assert.equal(decision.requires_orcid, false);
});

test('evaluateEscalation: respeita escalation explicita do agent/guardrail', () => {
  const decision = evaluateEscalation({
    estado_atual: 'cadastro',
    agentOut: {
      proxima_acao: 'erro',
      escalation: {
        required: true,
        reason_code: 'minor_age',
        reason_label: 'menoridade / responsavel legal',
        severity: 'high',
        source: 'mensagem',
        requires_orcid: false,
      },
    },
  });

  assert.equal(decision.required, true);
  assert.equal(decision.reason_code, 'minor_age');
  assert.equal(decision.source, 'mensagem');
});

test('evaluateEscalation: preserva gatilho tenant matched em escalation explicita', () => {
  const decision = evaluateEscalation({
    estado_atual: 'tattoo',
    agentOut: {
      proxima_acao: 'erro',
      matched_trigger: 'rosto',
      escalation: {
        required: true,
        reason_code: 'tenant_handoff_trigger',
        reason_label: 'gatilho de handoff do estúdio',
        severity: 'high',
        source: 'tenant_rules',
        requires_orcid: false,
      },
    },
  });

  assert.equal(decision.required, true);
  assert.equal(decision.reason_code, 'tenant_handoff_trigger');
  assert.equal(decision.source, 'tenant_rules');
  assert.equal(decision.matched_tenant_trigger, 'rosto');
});

test('evaluateEscalation: cobertura em tattoo vira escalonamento high sem orcid', () => {
  const decision = evaluateEscalation({
    estado_atual: 'tattoo',
    agentOut: {
      proxima_acao: 'erro',
      cobertura_suspeita: true,
      campos_faltando: ['cover_up_trigger'],
    },
  });

  assert.equal(decision.required, true);
  assert.equal(decision.reason_code, 'cover_up');
  assert.equal(decision.severity, 'high');
  assert.equal(decision.requires_orcid, false);
});

test('evaluateEscalation: pedido humano em tattoo vira escalonamento medium sem orcid', () => {
  const decision = evaluateEscalation({
    estado_atual: 'tattoo',
    agentOut: {
      proxima_acao: 'erro',
      campos_faltando: ['human_requested_trigger'],
    },
  });

  assert.equal(decision.required, true);
  assert.equal(decision.reason_code, 'human_requested');
  assert.equal(decision.severity, 'medium');
  assert.equal(decision.requires_orcid, false);
});

test('evaluateEscalation: cliente irritado em tattoo vira escalonamento high sem orcid', () => {
  const decision = evaluateEscalation({
    estado_atual: 'tattoo',
    agentOut: {
      proxima_acao: 'erro',
      campos_faltando: ['client_upset_trigger'],
    },
  });

  assert.equal(decision.required, true);
  assert.equal(decision.reason_code, 'client_upset');
  assert.equal(decision.severity, 'high');
  assert.equal(decision.requires_orcid, false);
});

test('composeEscalationTelegram: inclui codigo rastreavel e resumo do cliente', () => {
  const text = composeEscalationTelegram({
    decision: {
      required: true,
      reason_code: 'minor_age',
      reason_label: 'menoridade / responsavel legal',
      severity: 'high',
      source: 'mensagem',
    },
    tenant: { id: 'tenant-1' },
    telefone: '5511999998888',
    estado_atual: 'cadastro',
    agentOut: { resposta_cliente: 'Vou acionar o tatuador.' },
  });

  assert.match(text, /\[escalation:minor_age\]/);
  assert.match(text, /Cliente: 5511999998888/);
  assert.match(text, /Motivo: menoridade \/ responsavel legal/);
  assert.match(text, /Vou acionar o tatuador\./);
});

test('composeEscalationTelegram: inclui gatilho tenant quando presente', () => {
  const text = composeEscalationTelegram({
    decision: {
      required: true,
      reason_code: 'tenant_handoff_trigger',
      reason_label: 'gatilho de handoff do estúdio',
      severity: 'high',
      source: 'tenant_rules',
      matched_tenant_trigger: 'rosto',
    },
    tenant: { id: 'tenant-1' },
    telefone: '5511999998888',
    estado_atual: 'tattoo',
    agentOut: { resposta_cliente: 'Vou acionar uma pessoa do estúdio.' },
  });

  assert.match(text, /\[escalation:tenant_handoff_trigger\]/);
  assert.match(text, /Gatilho tenant: rosto/);
});
