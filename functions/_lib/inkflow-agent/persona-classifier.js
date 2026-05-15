// persona-classifier.js — Sub 1.A. Classifica uma conversa em uma das 15 personas
// via Claude Haiku 4.5. Lib pura — recebe fetchImpl pra testar sem rede.
//
// Uso (em endpoint CF Pages):
//   const result = await classifyConversation({ transcript, env });
//   if (result) await supabaseUpdate(conversa_id, result.persona_id);

import { PERSONAS_PROMPT_BLOCK } from './persona-summaries.js';

const VALID_PERSONA_IDS = new Set([
  'PER-001','PER-002','PER-003','PER-004','PER-005',
  'PER-006','PER-007','PER-008','PER-009','PER-010',
  'PER-011','PER-012','PER-013','PER-014','PER-015',
]);

const CONFIDENCE_THRESHOLD = 0.6;
const JUDGE_MODEL = 'claude-haiku-4-5-20251001';

export function buildClassifierPrompt(transcript) {
  const turns = transcript.map(t => `[turn ${t.turn_index} - ${t.role}]\n${t.content}`).join('\n\n');

  return `Voce e um classificador de personas. Recebe um transcript de conversa entre cliente (user) e o bot de um estudio de tatuagem (agent). Sua tarefa: identificar qual das 15 personas a seguir melhor descreve o CLIENTE nesta conversa.

Personas disponiveis:
${PERSONAS_PROMPT_BLOCK}

Transcript:

${turns}

Responda SOMENTE com JSON neste formato exato:
{"persona_id": "PER-XXX", "confianca": <0.0-1.0>, "razao": "<frase curta justificando>"}

Regras:
- persona_id deve ser uma das 15 listadas (PER-001 ate PER-015).
- confianca = 0.0 a 1.0 (numero). Use 0.6+ apenas quando ha sinal CLARO. Ambiguidade real = confianca baixa.
- razao = 1 frase em portugues, ate 20 palavras.
- Se conversa nao tem nenhum sinal de persona, use a mais provavel mas com confianca baixa (<0.5).`;
}

function parseClassifierJSON(rawText) {
  if (!rawText) return null;
  const stripped = rawText.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();
  try { return JSON.parse(stripped); } catch {}
  const lastOpen = stripped.lastIndexOf('{');
  const lastClose = stripped.lastIndexOf('}');
  if (lastOpen === -1 || lastClose <= lastOpen) return null;
  try { return JSON.parse(stripped.slice(lastOpen, lastClose + 1)); } catch { return null; }
}

export async function classifyConversation({ transcript, env, fetchImpl = fetch }) {
  if (!transcript || !Array.isArray(transcript) || transcript.length === 0) return null;
  if (!transcript.some(t => t.role === 'agent' || t.role === 'assistant')) return null;
  if (!env?.ANTHROPIC_API_KEY) {
    console.warn('[persona-classifier] missing ANTHROPIC_API_KEY');
    return null;
  }

  const prompt = buildClassifierPrompt(transcript);

  let res;
  try {
    res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        max_tokens: 256,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    console.warn('[persona-classifier] fetch threw:', err?.message || err);
    return null;
  }

  if (!res?.ok) {
    console.warn('[persona-classifier] anthropic', res?.status);
    return null;
  }

  let data;
  try { data = await res.json(); } catch { return null; }

  const raw = data?.content?.[0]?.text || '';
  const parsed = parseClassifierJSON(raw);
  if (!parsed) return null;

  const { persona_id, confianca, razao } = parsed;
  if (!VALID_PERSONA_IDS.has(persona_id)) return null;
  if (typeof confianca !== 'number' || !Number.isFinite(confianca) || confianca < CONFIDENCE_THRESHOLD || confianca > 1) return null;

  return { persona_id, confianca, razao: razao || '' };
}
