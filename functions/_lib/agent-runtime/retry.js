// functions/_lib/agent-runtime/retry.js
// Exponential backoff + taxonomia de erros retryaveis. Wrappa qualquer fn
// async — usado pelo runtime.run() pra envelopar openai.responses.parse().
//
// Decisao cravada (spec Caminho C Fase 1 secao 5):
// - Retry: 500/502/503/504, 429 (respeita Retry-After), ECONNRESET/ETIMEDOUT/EAI_AGAIN
// - NO retry: 401/403 (config), context_length_exceeded, 400 (nao deve acontecer pos-strict)
// - Backoff: 1s, 2s, 4s (baseMs * 2^attempt). Worst case: 1+2+4=7s.

const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
const RATE_LIMIT_STATUS = 429;
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']);
const NON_RETRYABLE_CODES = new Set(['context_length_exceeded', 'invalid_api_key']);
const NON_RETRYABLE_STATUS = new Set([401, 403]);

export function isRetryable(err) {
  if (!err) return false;
  if (NON_RETRYABLE_CODES.has(err.code)) return false;
  if (NON_RETRYABLE_STATUS.has(err.status)) return false;
  if (err.status === RATE_LIMIT_STATUS) return true;
  return RETRYABLE_STATUS.has(err.status) || RETRYABLE_CODES.has(err.code);
}

function parseRetryAfter(err) {
  const h = err.headers && (err.headers['retry-after'] ?? err.headers['Retry-After']);
  if (h == null) return null;
  const seconds = Number(h);
  if (!Number.isFinite(seconds)) return null;
  return seconds * 1000;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function runWithRetry(fn, { maxRetries = 3, baseMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxRetries) throw err;
      const retryAfterMs = err.status === RATE_LIMIT_STATUS ? parseRetryAfter(err) : null;
      const delay = retryAfterMs ?? baseMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  throw lastErr;
}
