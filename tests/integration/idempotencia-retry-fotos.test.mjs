// orcid ja reservado + foto_local_msg_id SEM foto_local_file_id → tool detecta o
// gap e roda SO o upload das fotos (retry parcial), sem reenviar o texto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  onRequest, buildContext, makeConversa, mediaRow, tgRouter, installFetchMock,
  tgCall, supaRpcZerar, TENANT_ID,
} from './_orcamento-mocks.mjs';

test('idempotencia retry: orcid existe + foto pendente → so reenvia fotos', async () => {
  const conversa = makeConversa({
    orcid: 'orc_existing',
    estado_agente: 'aguardando_tatuador',
    dados_coletados: {
      descricao_curta: 'borboleta', local_corpo: 'pulso', altura_cm: 8, estilo: 'fineline',
      foto_local: 'presente', refs_imagens: ['r1'],
      foto_local_msg_id: 42, // sem foto_local_file_id → pendente
    },
  });
  const mock = installFetchMock({
    conversa,
    mediaRows: [mediaRow(42)],
    telegram: tgRouter({ photoId: 'SOLO' }),
  });
  try {
    const resp = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: '+5511999' }));
    const body = await resp.json();
    assert.equal(resp.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.orcid, 'orc_existing');
    assert.equal(body.retry_fotos, true);
    // Reenviou foto (1 foto → sendPhoto), mas NAO reenviou o texto do orcamento
    assert.ok(tgCall(mock.calls, 'sendPhoto'), 'foto reenviada');
    assert.equal(tgCall(mock.calls, 'sendMessage'), undefined, 'texto NAO reenviado em retry');
    // base64 da foto enviada zerado
    assert.equal(supaRpcZerar(mock.calls).length, 1);
  } finally {
    mock.restore();
  }
});

test('idempotencia pura: orcid existe + sem fotos pendentes → idempotente, nada enviado', async () => {
  const conversa = makeConversa({
    orcid: 'orc_done',
    estado_agente: 'aguardando_tatuador',
    // defaults: sem foto_local_msg_id nem refs_imagens_msg_ids → nada pendente
  });
  const mock = installFetchMock({ conversa, mediaRows: [], telegram: tgRouter() });
  try {
    const resp = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: '+5511999' }));
    const body = await resp.json();
    assert.equal(resp.status, 200);
    assert.equal(body.idempotente, true);
    assert.equal(body.orcid, 'orc_done');
    assert.equal(mock.calls.tg.length, 0, 'nenhum envio Telegram');
  } finally {
    mock.restore();
  }
});
