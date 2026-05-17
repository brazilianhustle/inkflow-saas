# Spike Fase 1 — Caminho C — OpenAI Responses API strict + discriminated union (PASS com ajustes)

**Date:** 2026-05-17
**Branch:** `feat/caminho-c-fase1-tattoo-strict`
**Cost:** ~$0.05 (4 tentativas até cravar o caminho)
**Status:** ✅ PASS — caminho cravado, mas 3 ajustes vs o plano original.

## Resultado

Discriminated union 4-branches no schema strict do Responses API funciona com `openai` SDK puro. Spike final retorna `status: completed` + `output_parsed` populado respeitando o branch correto.

## Ajustes vs plano (não invalidam o plano, mas movem implementação)

### Ajuste 1: Helper correto é `zodTextFormat`, não `zodResponseFormat`

- `zodResponseFormat` (`openai/helpers/zod`) é pro **Chat Completions** API — retorna `{ type: 'json_schema', json_schema: { name, strict, schema } }`.
- `zodTextFormat` (mesmo módulo) é pro **Responses** API — retorna `{ type: 'json_schema', name, strict, schema }` já no shape correto pra `text.format`.

**Impacto:** Task 4 (`schema-to-json.js`) usa `zodTextFormat`. Sem necessidade de normalização (o plano normalizava o shape do Chat Completions). Tests mantêm-se válidos com pequeno ajuste no nome do export importado.

### Ajuste 2: Endpoint correto é `client.responses.parse()`, não `.create()`

- `.create()` retorna o response com `output_text` (string JSON) mas **não** auto-popula `output_parsed`.
- `.parse()` mirror do `chat.completions.parse()` — auto-parseia `output_parsed` com a estrutura Zod.

**Impacto:** Task 5 (`runtime.js`) chama `client.responses.parse(...)` em vez de `.create(...)`. O retorno `response.output_parsed` continua válido. Schema fica mais robusto (parse falha cedo se response não casar).

### Ajuste 3: Wrap obrigatório — root JSON Schema deve ser `type: object`

OpenAI strict mode **rejeita** `anyOf` no root (que é o que `z.discriminatedUnion` gera direto). Erro 400: `schema must be a JSON Schema of 'type: "object"', got 'type: "None"'`.

Solução: wrap o discriminated union dentro de um `z.object({ output: union })`. Schema fica:
```js
const TattooOutputSchema = z.discriminatedUnion('proxima_acao', [Pergunta, Handoff, EnviarPortfolio, Erro]);
const TattooOutputEnvelope = z.object({ output: TattooOutputSchema });
```

**Impacto:** Isolado em **2 lugares**:
1. **Task 5** (`runtime.js`): aceita `outputSchema` (a union nua) + wrappa internamente em envelope antes de enviar, e **unwrap** (`return parsed.output`) antes de retornar. Caller continua recebendo o objeto unwrapped — o resto do plano (router, contracts, route.js, tests) consome shape idêntico ao plano.
2. **Task 7** (`tattoo-schema.js`): exporta `TattooOutputSchema` (discriminated union nua, como o plano cravou). Wrap fica no runtime.

Resto do plano (Tasks 3, 6, 8, 9, 10, 11, 12, 13) **intocado**.

## Decisão

Continuar com plano. Ajustes acima ficam no `_lib/agent-runtime/` (helper switch + endpoint switch + wrap interno). Spec source não muda — invariantes do schema, validateTransition, HANDOFF_CONTRACTS continuam idênticos.

## Run output (referência)

```
format shape: {"type":"json_schema","name":"tattoo_output","strict":true,"rootType":"object"}
status: completed
output_parsed: {
  "output": {
    "proxima_acao": "pergunta",
    "resposta_cliente": "Quero uma rosa pequena no braço direito, sou 1.70m, traço fino",
    "campos_faltando": ["descricao_curta"]
  }
}
PASS: discriminated union strict mode funciona com openai SDK puro (wrap obrigatorio)
```

## Next

Task 2 — eval baseline em main (zero-regression gate antes de tocar código de produção).
