import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cadastroHandoffReply,
  cadastroResumeQuestion,
  firstName,
  firstContactSoftIntro,
  fotoAmbiguaComoLocalCadastroQuestion,
  fotoAmbiguaComoReferenciaQuestion,
  fotoLocalRecebidaCadastroQuestion,
  minorAgeHandoffReply,
  referenciaRecebidaCadastroQuestion,
} from '../../functions/_lib/conversation-voice-policy.js';

test('VoicePolicy: firstName extrai primeiro nome com fallback seguro', () => {
  assert.equal(firstName('Joao Silva'), 'Joao');
  assert.equal(firstName('  Maria  Costa  '), 'Maria');
  assert.equal(firstName(''), '');
  assert.equal(firstName(null), '');
});

test('VoicePolicy: saudacao curta de primeiro contato evita apresentacao mecanica', () => {
  const text = firstContactSoftIntro();
  assert.equal(text, 'Oii, tudo bem.');
  assert.doesNotMatch(text, /me chamo|muito prazer/i);
});

test('VoicePolicy: cadastroResumeQuestion cobre familia de cadastro', () => {
  assert.equal(
    cadastroResumeQuestion({ dados_cadastro: {} }),
    'Pra montar teu cadastro, me passa teu nome completo e data de nascimento?',
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
  assert.doesNotMatch(cadastroResumeQuestion({ dados_cadastro: {} }), /liberar teu orçamento|orçamento personalizado/i);
});

test('VoicePolicy: cadastroHandoffReply evita fechamento rigido antigo', () => {
  const reply = cadastroHandoffReply({ nome: 'Joao Silva' });
  assert.equal(reply, 'Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.');
  assert.doesNotMatch(reply, /valor certinho|avaliar com calma|Fechado/i);
});

test('VoicePolicy: familia de media/cadastro fica centralizada', () => {
  assert.equal(
    fotoLocalRecebidaCadastroQuestion(),
    'Recebi a foto do local. Agora me passa teu nome completo pra eu montar o cadastro.',
  );
  assert.equal(
    referenciaRecebidaCadastroQuestion(),
    'Recebi essa referência também. Agora me passa teu nome completo pra eu montar o cadastro.',
  );
  assert.equal(
    fotoAmbiguaComoLocalCadastroQuestion(),
    'Perfeito, vou usar essa imagem como foto do local. Me passa nome completo e data de nascimento pra eu montar o cadastro?',
  );
  assert.equal(
    fotoAmbiguaComoReferenciaQuestion(),
    'Perfeito, deixei essa imagem como referência do desenho. Agora me manda a foto do local onde tu quer tatuar.',
  );
  assert.doesNotMatch(fotoLocalRecebidaCadastroQuestion(), /liberar teu orçamento|orçamento personalizado/i);
  assert.doesNotMatch(fotoAmbiguaComoLocalCadastroQuestion(), /liberar teu orçamento|orçamento personalizado/i);
});

test('VoicePolicy: menoridade preserva segurança legal sem rigidez antiga', () => {
  const text = minorAgeHandoffReply();
  assert.match(text, /menos de 18 anos/i);
  assert.match(text, /tatuador/i);
  assert.match(text, /segurança/i);
  assert.match(text, /respons[aá]vel legal/i);
  assert.doesNotMatch(text, /acionar o tatuador para orientar/i);
  assert.doesNotMatch(text, /orçamento direto/i);
});
