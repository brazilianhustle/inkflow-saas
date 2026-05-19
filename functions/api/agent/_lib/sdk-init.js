// SDK init helpers — OpenAI key validation.
// Usado por functions/api/agent/route.js (validateEnv pre-runAgent).
// Pos Fase 2B: nao ha mais SDK init real — runtime.run injeta apiKey
// explicita. Este arquivo so faz validate.

const REQUIRED_VARS = ['OPENAI_API_KEY'];

export function getApiKey(env) {
  const key = env?.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY ausente no env');
  }
  return key;
}

export function validateEnv(env) {
  const missing = REQUIRED_VARS.filter(v => !env?.[v]);
  return { ok: missing.length === 0, missing };
}
