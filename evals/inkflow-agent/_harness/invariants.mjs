// invariants.mjs — checkers de invariantes binárias para o harness InkFlow.
//
// API:
//   checkInvariant(invariantId, transcript, dados_persistidos) → bool | null
//   INVARIANTS — mapa de id → função checker interna (exportado para testes)
//
// Retornos:
//   true  = invariante respeitada
//   false = invariante violada
//   null  = não aplicável (ex: I-P2 em transcript sem handoff)
//
// Limitações conhecidas:
//   I-P1: false positivo possível se o bot ecoa o tamanho informado pelo cliente.
//         A detecção cobre o failure mode principal (bot sugerindo proativamente).

const CM_PATTERN = /\d+\s*cm\b/i;

const ANTIPATTERN_P4 = /\b(Anotei|Confirmado|Vou anotar|Registrado)\b/i;

const OBR_FIELDS = ['descricao_curta', 'local_corpo', 'altura_cm', 'estilo'];

/**
 * I-P1: Bot nunca sugere tamanho em cm ao cliente.
 * Falha se qualquer turn de assistant contém padrão numérico seguido de "cm".
 */
function checkP1(transcript) {
  for (const turn of transcript) {
    if (turn.role !== 'assistant') continue;
    if (CM_PATTERN.test(turn.content || '')) return false;
  }
  return true;
}

/**
 * I-P2: Handoff sempre carrega os 4 campos OBR:
 *   descricao_curta, local_corpo, altura_cm, estilo.
 * Inspeciona o turn assistant com proxima_acao === 'handoff'.
 * Retorna null se nenhum turn de handoff existe no transcript.
 */
function checkP2(transcript, dados_persistidos) {
  const handoffTurn = transcript.find(
    t => t.role === 'assistant' && t.proxima_acao === 'handoff',
  );

  if (!handoffTurn) return null;

  const dados = handoffTurn.dados_persistidos || dados_persistidos || {};

  for (const field of OBR_FIELDS) {
    const val = dados[field];
    if (val === undefined || val === null || val === '') return false;
  }
  return true;
}

/**
 * I-P4: Bot não usa anti-patterns "Anotei / Confirmado / Vou anotar / Registrado"
 * em nenhum turn do transcript.
 * Falha se qualquer turn de assistant bate na regex.
 */
function checkP4(transcript) {
  for (const turn of transcript) {
    if (turn.role !== 'assistant') continue;
    if (ANTIPATTERN_P4.test(turn.content || '')) return false;
  }
  return true;
}

export const INVARIANTS = {
  'I-P1': checkP1,
  'I-P2': checkP2,
  'I-P4': checkP4,
};

/**
 * Dispatcher principal.
 *
 * @param {string} invariantId - ex: 'I-P1'
 * @param {Array} transcript - array de turns { role, content, proxima_acao?, dados_persistidos? }
 * @param {object} [dados_persistidos={}] - dados acumulados finais da run (fallback para I-P2)
 * @returns {boolean|null}
 */
export function checkInvariant(invariantId, transcript, dados_persistidos = {}) {
  const checker = INVARIANTS[invariantId];
  if (!checker) {
    throw new Error(`checkInvariant: invariant desconhecida "${invariantId}"`);
  }
  return checker(transcript, dados_persistidos);
}
