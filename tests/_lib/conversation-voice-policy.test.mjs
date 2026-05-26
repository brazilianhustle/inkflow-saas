import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cadastroHandoffReply,
  cadastroResumeQuestion,
  firstName,
  fotoAmbiguaComoLocalCadastroQuestion,
  fotoAmbiguaComoReferenciaQuestion,
  fotoLocalRecebidaCadastroQuestion,
  referenciaRecebidaCadastroQuestion,
} from '../../functions/_lib/conversation-voice-policy.js';

test('VoicePolicy: firstName extrai primeiro nome com fallback seguro', () => {
  assert.equal(firstName('Joao Silva'), 'Joao');
  assert.equal(firstName('  Maria  Costa  '), 'Maria');
  assert.equal(firstName(''), '');
  assert.equal(firstName(null), '');
});

test('VoicePolicy: cadastroResumeQuestion cobre familia de cadastro', () => {
  assert.equal(
    cadastroResumeQuestion({ dados_cadastro: {} }),
    'Pra liberar teu orçamento, me passa nome completo e data de nascimento?',
  );
  assert.equal(
    cadastroResumeQuestion({ dados_cadastro: { data_nascimento: '1995-03-12' } }),
    'Me passa teu nome completo?',
  );
  assert.equal(
    cadastroResumeQuestion({ dados_cadastro: { nome: 'Joao Silva' } }),
    'Me passa tua data de nascimento completa?',
  );
  assert.equal(
    cadastroResumeQuestion({ dados_cadastro: { nome: 'Joao Silva', data_nascimento: '1995-03-12' } }),
    'E o e-mail? Se preferir seguir sem, me avisa',
  );
});

test('VoicePolicy: cadastroHandoffReply evita fechamento rigido antigo', () => {
  const reply = cadastroHandoffReply({ nome: 'Joao Silva' });
  assert.equal(reply, 'Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.');
  assert.doesNotMatch(reply, /valor certinho|avaliar com calma|Fechado/i);
});

test('VoicePolicy: familia de media/cadastro fica centralizada', () => {
  assert.match(fotoLocalRecebidaCadastroQuestion(), /Recebi a foto do local/);
  assert.match(referenciaRecebidaCadastroQuestion(), /referência também/);
  assert.match(fotoAmbiguaComoLocalCadastroQuestion(), /foto do local/);
  assert.match(fotoAmbiguaComoReferenciaQuestion(), /referência do desenho/);
});
