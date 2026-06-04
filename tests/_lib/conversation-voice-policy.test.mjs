import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cadastroHandoffReply,
  cadastroResumeQuestion,
  firstName,
  firstContactNameQuestion,
  firstContactSoftIntro,
  fotoAmbiguaComoLocalCadastroQuestion,
  fotoAmbiguaComoReferenciaQuestion,
  fotoLocalRecebidaCadastroQuestion,
  handoffVoiceReply,
  minorAgeHandoffReply,
  referenciaRecebidaCadastroQuestion,
  styleArtistReviewReply,
  tenantCoverUpNotAcceptedReply,
  tenantUnsupportedStyleReply,
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

test('VoicePolicy: pergunta de nome de primeiro contato evita apresentacao mecanica', () => {
  const text = firstContactNameQuestion();
  assert.equal(text, 'Oii, tudo bem.\n\nComo posso te chamar?');
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
    'Se quiser, me passa teu e-mail. Se preferir seguir só por aqui, tudo certo.',
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

test('VoicePolicy: familia de handoff usa tom natural e centralizado', () => {
  const style = styleArtistReviewReply({ style: 'old school' });
  assert.equal(style, 'Old school eu não consigo confirmar sozinho por aqui. Vou chamar o tatuador pra olhar contigo e te dizer se rola seguir nessa linha.');
  assert.doesNotMatch(style, /avalia[cç][aã]o direta|pessoa do est[uú]dio|precisa avaliar|acionar/i);

  const trigger = handoffVoiceReply({ kind: 'tenant_handoff_trigger', trigger: 'rosto' });
  assert.equal(trigger, 'Rosto eu não consigo tocar sozinho por aqui. Vou chamar o tatuador pra olhar contigo e seguir com segurança.');
  assert.doesNotMatch(trigger, /regi[aã]o ou caso|pessoa do est[uú]dio|precisa avaliar|acionar/i);

  const human = handoffVoiceReply({ kind: 'human_requested' });
  assert.equal(human, 'Claro. Vou chamar o tatuador pra assumir contigo por aqui.');
  assert.doesNotMatch(human, /orientar direto|acionar/i);

  const upset = handoffVoiceReply({ kind: 'client_upset' });
  assert.equal(upset, 'Entendi, desculpa pela frustração. Vou chamar alguém do estúdio pra assumir contigo por aqui.');
  assert.doesNotMatch(upset, /pessoa do est[uú]dio|ajudar direto|acionar/i);

  const cover = handoffVoiceReply({ kind: 'cover_up_review' });
  assert.equal(cover, 'Cobertura eu não consigo tocar sozinho por aqui. Vou chamar o tatuador pra olhar teu caso e combinar os próximos passos contigo.');
  assert.doesNotMatch(cover, /precisa avaliar direto|te orientar pelos pr[oó]ximos passos|acionar/i);
});

test('VoicePolicy: bordas de tenant recusam sem soar como regra interna', () => {
  const style = tenantUnsupportedStyleReply();
  assert.equal(style, 'Esse estilo não está no foco do estúdio por aqui. Se quiser adaptar pra outro estilo, eu sigo contigo.');
  assert.doesNotMatch(style, /acionar|avaliar direto|or[cç]amento|sinal/i);

  const cover = tenantCoverUpNotAcceptedReply();
  assert.equal(cover, 'Esse estúdio não faz cobertura por aqui. Se for uma tattoo nova em outro local, eu sigo contigo.');
  assert.doesNotMatch(cover, /acionar|avaliar direto|or[cç]amento|sinal/i);
});
