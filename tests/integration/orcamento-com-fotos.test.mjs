// E2E canonico: 1 foto local + 2 refs (todas JPEG) → sendMediaGroup, file_ids
// persistidos, base64 zerado via RPC, sendMessage com texto sem orcid + botoes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  onRequest, buildContext, makeConversa, mediaRow, tgRouter, installFetchMock,
  tgCall, supaRpcZerar, supaPatchFileIds, TENANT_ID,
} from './_orcamento-mocks.mjs';

test('E2E: 1 local + 2 refs JPEG → sendMediaGroup, file_ids, base64 zerado, sendMessage', async () => {
  const conversa = makeConversa({
    dados_coletados: {
      descricao_curta: 'borboleta', local_corpo: 'pulso', altura_cm: 8, estilo: 'fineline',
      foto_local: 'presente', refs_imagens: ['r1', 'r2'],
      foto_local_msg_id: 42, refs_imagens_msg_ids: [43, 44],
    },
  });
  const mock = installFetchMock({
    conversa,
    mediaRows: [mediaRow(42), mediaRow(43), mediaRow(44)],
    telegram: tgRouter({ mediaGroupIds: ['F0', 'F1', 'F2'] }),
  });
  try {
    const resp = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: '+5511999' }));
    assert.equal(resp.status, 200);

    // 1) sendMediaGroup chamado
    assert.ok(tgCall(mock.calls, 'sendMediaGroup'), 'sendMediaGroup enviado');
    // 2) sendMessage com texto orcamento (Maria, sem orc_) + botao novo
    const sendMsg = tgCall(mock.calls, 'sendMessage');
    assert.ok(sendMsg);
    const sendBody = JSON.parse(sendMsg.body);
    assert.match(sendBody.text, /Maria/);
    assert.doesNotMatch(sendBody.text, /orc_/);
    assert.match(sendBody.reply_markup.inline_keyboard[0][0].text, /Informar valor/);
    // 3) PATCH dados_coletados com file_ids
    const patch = supaPatchFileIds(mock.calls);
    assert.ok(patch, 'PATCH com file_ids');
    const patchBody = JSON.parse(patch.body);
    assert.equal(patchBody.dados_coletados.foto_local_file_id, 'F0');
    assert.deepEqual(patchBody.dados_coletados.refs_imagens_file_ids, ['F1', 'F2']);
    // 4) RPC zerar chamado 3x
    assert.equal(supaRpcZerar(mock.calls).length, 3);
  } finally {
    mock.restore();
  }
});
