import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkInvariant, INVARIANTS } from '../../../evals/inkflow-agent/_harness/invariants.mjs';

// ---------------------------------------------------------------------------
// Fixtures helpers
// ---------------------------------------------------------------------------

function makeTranscript(turns) {
  return turns;
}

function assistantTurn(content, extras = {}) {
  return { role: 'assistant', content, ...extras };
}

function userTurn(content) {
  return { role: 'user', content };
}

// ---------------------------------------------------------------------------
// I-P1: bot nunca sugere tamanho em cm
// ---------------------------------------------------------------------------

test('I-P1: passa quando nenhum turn assistant menciona cm', () => {
  const transcript = makeTranscript([
    userTurn('quero uma tatuagem no braço'),
    assistantTurn('Que legal! Que estilo você prefere?'),
    userTurn('blackwork'),
    assistantTurn('Ótimo! Onde exatamente no braço?'),
  ]);
  assert.equal(checkInvariant('I-P1', transcript), true);
});

test('I-P1: falha quando bot sugere tamanho numérico em cm', () => {
  const transcript = makeTranscript([
    userTurn('quero tatuagem'),
    assistantTurn('Que tal uns 15cm no antebraço?'),
  ]);
  assert.equal(checkInvariant('I-P1', transcript), false);
});

test('I-P1: falha com variação "20 cm" com espaço', () => {
  const transcript = makeTranscript([
    userTurn('quero tatuagem'),
    assistantTurn('Costumo recomendar 20 cm para esse estilo.'),
  ]);
  assert.equal(checkInvariant('I-P1', transcript), false);
});

test('I-P1: ignora turn de usuário que menciona cm', () => {
  const transcript = makeTranscript([
    userTurn('quero uns 10cm de tatuagem'),
    assistantTurn('Entendido! Qual é o estilo que você prefere?'),
  ]);
  assert.equal(checkInvariant('I-P1', transcript), true);
});

// ---------------------------------------------------------------------------
// I-P2: handoff sempre carrega os 4 campos OBR
// ---------------------------------------------------------------------------

test('I-P2: passa quando handoff tem os 4 campos preenchidos', () => {
  const transcript = makeTranscript([
    userTurn('quero uma tatuagem'),
    assistantTurn('Perfeito, vou encaminhar pro tatuador!', {
      proxima_acao: 'handoff',
      dados_persistidos: {
        descricao_curta: 'dragão nas costas',
        local_corpo: 'costas',
        altura_cm: '30',
        estilo: 'realismo',
      },
    }),
  ]);
  assert.equal(checkInvariant('I-P2', transcript), true);
});

test('I-P2: falha quando falta um campo OBR no handoff', () => {
  const transcript = makeTranscript([
    userTurn('quero uma tatuagem'),
    assistantTurn('Encaminhando!', {
      proxima_acao: 'handoff',
      dados_persistidos: {
        descricao_curta: 'dragão',
        local_corpo: 'costas',
        // altura_cm ausente
        estilo: 'realismo',
      },
    }),
  ]);
  assert.equal(checkInvariant('I-P2', transcript), false);
});

test('I-P2: falha quando campo OBR está vazio no handoff', () => {
  const transcript = makeTranscript([
    userTurn('quero tatuagem'),
    assistantTurn('Encaminhando!', {
      proxima_acao: 'handoff',
      dados_persistidos: {
        descricao_curta: '',
        local_corpo: 'braço',
        altura_cm: '15',
        estilo: 'blackwork',
      },
    }),
  ]);
  assert.equal(checkInvariant('I-P2', transcript), false);
});

test('I-P2: retorna null quando transcript não tem turno de handoff', () => {
  const transcript = makeTranscript([
    userTurn('oi'),
    assistantTurn('Olá! Qual tatuagem você quer fazer?', { proxima_acao: 'pergunta' }),
  ]);
  assert.equal(checkInvariant('I-P2', transcript), null);
});

test('I-P2: usa dados_persistidos do 2º argumento quando turn de handoff não tem o campo', () => {
  const transcript = makeTranscript([
    userTurn('quero tatuagem'),
    assistantTurn('Encaminhando!', {
      proxima_acao: 'handoff',
      // dados_persistidos ausente no turn — cai no fallback
    }),
  ]);
  const dados = {
    descricao_curta: 'cobra no pescoço',
    local_corpo: 'pescoço',
    altura_cm: '10',
    estilo: 'fineline',
  };
  assert.equal(checkInvariant('I-P2', transcript, dados), true);
});

// ---------------------------------------------------------------------------
// I-P4: bot não usa anti-patterns "Anotei / Confirmado / Vou anotar / Registrado"
// ---------------------------------------------------------------------------

test('I-P4: passa quando nenhum turn assistant usa anti-patterns', () => {
  const transcript = makeTranscript([
    userTurn('quero blackwork no braço'),
    assistantTurn('Que estilo incrível! Onde no braço exatamente?'),
    userTurn('antebraço'),
    assistantTurn('Certo! Qual tamanho você imagina?'),
  ]);
  assert.equal(checkInvariant('I-P4', transcript), true);
});

test('I-P4: falha quando bot usa "Anotei"', () => {
  const transcript = makeTranscript([
    userTurn('blackwork'),
    assistantTurn('Anotei! Agora me diz onde quer colocar.'),
  ]);
  assert.equal(checkInvariant('I-P4', transcript), false);
});

test('I-P4: falha quando bot usa "Confirmado"', () => {
  const transcript = makeTranscript([
    userTurn('antebraço'),
    assistantTurn('Confirmado, antebraço. Qual estilo?'),
  ]);
  assert.equal(checkInvariant('I-P4', transcript), false);
});

test('I-P4: falha quando bot usa "Vou anotar"', () => {
  const transcript = makeTranscript([
    userTurn('realismo'),
    assistantTurn('Vou anotar aqui: realismo no braço.'),
  ]);
  assert.equal(checkInvariant('I-P4', transcript), false);
});

test('I-P4: falha quando bot usa "Registrado"', () => {
  const transcript = makeTranscript([
    userTurn('fineline'),
    assistantTurn('Registrado! Vamos seguir.'),
  ]);
  assert.equal(checkInvariant('I-P4', transcript), false);
});

test('I-P4: case-insensitive — falha com "confirmado" minúsculo', () => {
  const transcript = makeTranscript([
    userTurn('costas'),
    assistantTurn('confirmado, costas então.'),
  ]);
  assert.equal(checkInvariant('I-P4', transcript), false);
});

test('I-P4: ignora anti-pattern em turn de usuário', () => {
  const transcript = makeTranscript([
    userTurn('Confirmado, pode mandar'),
    assistantTurn('Ótimo! Quando você quer agendar?'),
  ]);
  assert.equal(checkInvariant('I-P4', transcript), true);
});

// ---------------------------------------------------------------------------
// checkInvariant dispatcher
// ---------------------------------------------------------------------------

test('checkInvariant: lança erro para invariante desconhecida', () => {
  assert.throws(
    () => checkInvariant('I-INEXISTENTE', []),
    /invariant desconhecida "I-INEXISTENTE"/,
  );
});

test('checkInvariant: INVARIANTS exporta exatamente I-P1, I-P2, I-P4', () => {
  const ids = Object.keys(INVARIANTS).sort();
  assert.deepEqual(ids, ['I-P1', 'I-P2', 'I-P4']);
});
