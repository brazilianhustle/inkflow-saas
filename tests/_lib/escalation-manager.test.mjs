import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEscalationHandoffPackage,
  composeEscalationTelegram,
  evaluateEscalation,
} from '../../functions/_lib/escalation-manager.js';

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

test('buildEscalationHandoffPackage: resume dados operacionais sem campos vazios', () => {
  const pkg = buildEscalationHandoffPackage({
    conversa: {
      id: 'conv-trace-123456',
      dados_coletados: {
        descricao_curta: 'rosa pequena',
        local_corpo: 'braco',
        foto_local_msg_id: '',
      },
      dados_cadastro: {
        nome: 'Leandro',
        email: null,
      },
    },
    agentOut: {
      campos_faltando: ['client_upset_trigger'],
    },
  });

  assert.equal(pkg.version, 'handoff_package_v1');
  assert.equal(pkg.trace_id, 'hp_convtrace1');
  assert.equal(pkg.has_summary, true);
  assert.equal(pkg.tattoo_fields_count, 2);
  assert.equal(pkg.cadastro_fields_count, 1);
  assert.equal(pkg.missing_fields_count, 1);
  assert.deepEqual(pkg.lines, [
    'Tattoo: descricao_curta=rosa pequena; local_corpo=braco',
    'Cadastro: nome=Leandro',
    'Campos/flags: client_upset_trigger',
  ]);
});

test('composeEscalationTelegram: inclui pacote operacional quando fornecido', () => {
  const handoffPackage = buildEscalationHandoffPackage({
    conversa: {
      id: 'conv-trace-987654',
      dados_coletados: { descricao_curta: 'rosa pequena', local_corpo: 'braco' },
      dados_cadastro: { nome: 'Leandro' },
    },
    agentOut: { campos_faltando: ['human_requested_trigger'] },
  });
  const text = composeEscalationTelegram({
    decision: {
      required: true,
      reason_code: 'human_requested',
      reason_label: 'cliente pediu humano',
      severity: 'medium',
      source: 'campos_faltando',
    },
    tenant: { id: 'tenant-1' },
    telefone: '5511999998888',
    estado_atual: 'tattoo',
    agentOut: { resposta_cliente: 'Vou chamar uma pessoa.', campos_faltando: ['human_requested_trigger'] },
    handoffPackage,
  });

  assert.match(text, /Pacote: handoff_package_v1/);
  assert.match(text, /Trace: hp_convtrace9/);
  assert.match(text, /Resumo operacional:/);
  assert.match(text, /Tattoo: descricao_curta=rosa pequena; local_corpo=braco/);
  assert.match(text, /Cadastro: nome=Leandro/);
  assert.match(text, /Campos\/flags: human_requested_trigger/);
});
