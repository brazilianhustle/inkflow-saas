// SDK init helpers — @openai/agents config + auth.
// Usado por functions/api/agent/agents/*.js e route.js.

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
