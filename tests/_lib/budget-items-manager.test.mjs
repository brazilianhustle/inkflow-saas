import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBudgetChangePending,
  composeBudgetConfirmationTelegram,
  composeBudgetChangeTelegram,
  detectBudgetChangeRequest,
  resolveBudgetChangeConfirmation,
} from '../../functions/_lib/budget-items-manager.js';

test('detecta mudanca de ideia orcamentavel em aguardando_tatuador sem apagar orcamento anterior', () => {
  const dados = {
    descricao_curta: 'dragao',
    local_corpo: 'perna',
    altura_cm: 170,
    estilo: 'realismo',
  };
  const detection = detectBudgetChangeRequest({
    estado_agente: 'aguardando_tatuador',
    mensagem: 'mudei de ideia, queria uma caveira na perna',
    dados_coletados: dados,
  });

  assert.equal(detection.matched, true);
  assert.equal(detection.pending.status, 'awaiting_replace_or_add');
  assert.equal(detection.pending.previous_item_snapshot.descricao_curta, 'dragao');
  assert.equal(detection.pending.proposed_item.descricao_curta, 'caveira');
  assert.equal(detection.pending.proposed_item.local_corpo, 'perna');
  assert.match(detection.response, /somente essa ou a anterior tambem/);

  const merged = applyBudgetChangePending(dados, detection);
  assert.equal(merged.descricao_curta, 'dragao');
  assert.equal(merged.budget_change_pending.proposed_item.descricao_curta, 'caveira');
});

test('nao intercepta mensagens terminais sem nova ideia de tattoo', () => {
  const detection = detectBudgetChangeRequest({
    estado_agente: 'aguardando_tatuador',
    mensagem: 'obrigado, fico no aguardo',
    dados_coletados: { descricao_curta: 'dragao' },
  });
  assert.equal(detection.matched, false);
});

test('compõe aviso ao Telegram com anterior e nova ideia', () => {
  const detection = detectBudgetChangeRequest({
    estado_agente: 'aguardando_tatuador',
    mensagem: 'mudei de ideia, queria uma caveira na perna',
    dados_coletados: { descricao_curta: 'dragao', local_corpo: 'braco' },
  });
  const text = composeBudgetChangeTelegram({
    telefone: '5521999999999',
    tenant: { nome_estudio: 'InkFlow' },
    detection,
  });
  assert.match(text, /mudanca\/novo orcamento/);
  assert.match(text, /Anterior: dragao na braco/);
  assert.match(text, /Nova ideia: caveira na perna/);
});

test('resolve "as duas" criando segundo item ativo sem perder snapshot anterior', () => {
  const detection = detectBudgetChangeRequest({
    estado_agente: 'aguardando_tatuador',
    mensagem: 'mudei de ideia, queria uma caveira na perna',
    dados_coletados: { descricao_curta: 'dragao', local_corpo: 'braco', altura_cm: 170, estilo: 'realismo' },
  });
  const dados = applyBudgetChangePending({ descricao_curta: 'dragao', local_corpo: 'braco', altura_cm: 170, estilo: 'realismo' }, detection);

  const resolution = resolveBudgetChangeConfirmation({
    mensagem: 'as duas',
    dados_coletados: dados,
  });

  assert.equal(resolution.matched, true);
  assert.equal(resolution.action, 'add');
  assert.equal(resolution.estado_agente, 'coletando_tattoo');
  assert.equal(resolution.next_dados_coletados.budget_items.length, 2);
  assert.equal(resolution.next_dados_coletados.budget_items[0].status, 'sent_to_artist');
  assert.equal(resolution.next_dados_coletados.budget_items[1].descricao_curta, 'caveira');
  assert.equal(resolution.next_dados_coletados.active_budget_item_id, 'item_2');
  assert.equal(resolution.next_dados_coletados.descricao_curta, 'caveira');
  assert.match(resolution.response, /considerar as duas/);
  assert.match(resolution.response, /qual estilo/);
});

test('resolve "somente essa" marcando anterior como substituido', () => {
  const detection = detectBudgetChangeRequest({
    estado_agente: 'aguardando_tatuador',
    mensagem: 'mudei de ideia, queria uma caveira na perna',
    dados_coletados: { descricao_curta: 'dragao', local_corpo: 'braco', altura_cm: 170, estilo: 'realismo' },
  });
  const dados = applyBudgetChangePending({ descricao_curta: 'dragao', local_corpo: 'braco', altura_cm: 170, estilo: 'realismo' }, detection);

  const resolution = resolveBudgetChangeConfirmation({
    mensagem: 'so essa',
    dados_coletados: dados,
  });

  assert.equal(resolution.matched, true);
  assert.equal(resolution.action, 'replace');
  assert.equal(resolution.next_dados_coletados.budget_items[0].status, 'replaced');
  assert.equal(resolution.next_dados_coletados.budget_items[1].status, 'collecting');
  assert.match(composeBudgetConfirmationTelegram({ telefone: '55', tenant: { nome_estudio: 'InkFlow' }, resolution }), /substituir tattoo anterior/);
});
