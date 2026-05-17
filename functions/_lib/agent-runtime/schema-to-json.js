// functions/_lib/agent-runtime/schema-to-json.js
// Wrapper minimalista em torno de zodTextFormat (openai/helpers/zod).
// Existe pra:
// 1. Isolar a dep oficial em um unico lugar (futuro multi-provider).
// 2. Detectar ZodEffects (.refine/.transform) cedo com mensagem clara — o
//    helper aceita silenciosamente e dropa a refine no JSON Schema, o que
//    cria bugs sutis onde a validacao parece ativa mas nao e enforcada
//    no constrained decoding.
//
// Decisao cravada (spec Caminho C Fase 1 secao 4.A Principio 1).
// Ajuste pos-spike: helper correto pro Responses API e zodTextFormat (nao
// zodResponseFormat, que e pro Chat Completions e retorna shape aninhado).
import { zodTextFormat } from 'openai/helpers/zod';

export function toResponseFormat(zodSchema, name) {
  if (!zodSchema || !zodSchema._def) {
    throw new Error('toResponseFormat: zodSchema invalido (sem _def)');
  }
  const typeName = zodSchema._def.typeName;
  if (typeName === 'ZodEffects') {
    throw new Error(
      'toResponseFormat: ZodEffects (.refine/.transform) nao suportado em json_schema strict. ' +
      'Mova invariantes pra discriminated union ou validacao pos-parse.',
    );
  }
  // zodTextFormat retorna shape achatado { type, name, strict, schema } pronto
  // pra ser passado em responses.parse({ text: { format: ... } }).
  return zodTextFormat(zodSchema, name);
}
