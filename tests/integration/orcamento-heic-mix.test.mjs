// Mix [JPEG, HEIC, JPEG] → HEIC vai por sendDocument, os 2 JPEG por sendMediaGroup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  onRequest, buildContext, makeConversa, mediaRow, tgRouter, installFetchMock,
  tgCall, TENANT_ID,
} from './_orcamento-mocks.mjs';

test('heic mix: 1 sendDocument (HEIC) + 1 sendMediaGroup (2 JPEG)', async () => {
  const conversa = makeConversa({
    dados_coletados: {
      descricao_curta: 'borboleta', local_corpo: 'pulso', altura_cm: 8, estilo: 'fineline',
      foto_local: 'presente', refs_imagens: ['r1', 'r2'],
      foto_local_msg_id: 42, refs_imagens_msg_ids: [43, 44],
    },
  });
  const mock = installFetchMock({
    conversa,
    mediaRows: [mediaRow(42, 'image/jpeg'), mediaRow(43, 'image/heic'), mediaRow(44, 'image/jpeg')],
    telegram: tgRouter({ mediaGroupIds: ['J0', 'J1'], docId: 'H0' }),
  });
  try {
    const resp = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: '+5511999' }));
    assert.equal(resp.status, 200);
    assert.ok(tgCall(mock.calls, 'sendDocument'), 'HEIC via sendDocument');
    assert.ok(tgCall(mock.calls, 'sendMediaGroup'), 'JPEGs via sendMediaGroup');
    assert.ok(tgCall(mock.calls, 'sendMessage'), 'texto orcamento');
  } finally {
    mock.restore();
  }
});
