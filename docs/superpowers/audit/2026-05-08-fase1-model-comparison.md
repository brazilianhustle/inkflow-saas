# Fase 1 — Modelo: TC-03 comparison (gpt-4o-mini vs gpt-4o)

**Data:** 2026-05-08
**Branch:** `audit/coleta-multi-agent-prompt-v2`
**Predecessor:** [spec validacao prompt v2](../specs/2026-05-08-coleta-multi-agent-prompt-validation-design.md)
**Script:** `tests/agent/_tc03-model-compare.mjs` (NAO commitado — artefato)
**Log bruto:** `/tmp/tc03-model-compare.log`

---

## Pergunta central

gpt-4o-mini e o modelo certo pra fase Tattoo, ou TC-03 max-turns e signal de incapacidade do modelo de raciocinar "OBR parcial -> ask next"?

---

## Escopo executado

- gpt-4o-mini (atual baseline)
- gpt-4o (~25x mais caro)
- ~~claude-haiku-4-5~~ — SKIPPED. `@anthropic-ai/sdk` nao instalado, `@openai/agents` nao suporta Anthropic nativamente em JS. Spec marca modelos nao-OpenAI como opcionais. Fica como follow-up se decisao final for upgrade.

Mesmo prompt (`generatePromptColetaTattoo` + `REFORCO_HANDOFF`), mesmo input ("quero uma rosa pequena"), `maxTurns: 20`.

---

## Resultados crus

### gpt-4o-mini — FAIL patologico

| Metrica | Valor |
|---------|-------|
| Status | FAIL — `Max turns (20) exceeded` |
| Latencia | 117151 ms (~2 min) |
| Tool calls | 22 (todas `dados_coletados`) |
| Output final | nenhum (erro antes de emitir) |

**Padrao observado:** loop tentando persistir valor `"null"` (string literal!) em `tamanho_cm` e `local_corpo` repetidamente:

```json
{ "campo": "tamanho_cm", "valor": "null" }
{ "campo": "local_corpo", "valor": "null" }
{ "campo": "tamanho_cm", "valor": "null" }
{ "campo": "local_corpo", "valor": "null" }
... (22 vezes)
```

Cada tool call retorna `{ ok: true }` (no-op stub aceita), agent nao recebe sinal de erro, continua loop ate max-turns.

### gpt-4o — FAIL tecnico (mas correto conceitualmente)

| Metrica | Valor |
|---------|-------|
| Status | FAIL — failure unico em check de eval, nao do prompt |
| Latencia | 2266 ms (~2.3 s) |
| Tool calls | 0 |
| Output | estruturado, completo, semanticamente correto |

**Output:**

```json
{
  "resposta_cliente": "Bacana! 'Pequena' e relativo demais pra orcar — me passa em cm aproximado (tipo 5, 8, 12cm)? E em qual lugar do corpo tu quer?",
  "dados_persistidos": {
    "estilo": "",
    "tamanho_cm": null,
    "altura_cm": null,
    "local_corpo": "",
    "cor_preferencia": "",
    "descricao_curta": "",
    "foto_local": ""
  },
  "dados_completos": false,
  "campos_faltando": ["tamanho_cm", "local_corpo"],
  "campos_conflitantes": [],
  "proxima_acao": "pergunta"
}
```

**Avaliacao conceitual:** gpt-4o ACERTA TC-03 em todos os campos materiais:
- `proxima_acao='pergunta'` ✅
- `dados_completos=false` ✅
- `campos_faltando` inclui `tamanho_cm` e `local_corpo` ✅
- `handoff_to_cadastro` NUNCA chamado ✅
- 0 tool calls (nao tenta persistir lixo) ✅
- resposta natural pedindo cm aproximado em escala ✅

**A unica falha e tecnica (bug do eval check):** `dados_persistidos_NAO_inclui: ['tamanho_cm']` checa `'tamanho_cm' in out.dados_persistidos`. Como o `TattooOutputSchema` declara `tamanho_cm: z.number().positive().max(200).nullable().optional()`, OpenAI Responses API forca emitir TODAS as chaves do schema (com `null` quando ausente). Logo `'tamanho_cm' in dados_persistidos === true`, mesmo com `valor === null`.

---

## Diagnosticos cruzados

### D1 (modelo): gpt-4o-mini e estruturalmente incapaz com prompt atual

22 tool calls com valor `"null"` em loop nao e wording bug — e incapacidade de raciocinio do modelo. O modelo nao distingue entre:
- "cliente disse 'pequena' = informacao fuzzy, peca em cm"
- "cliente nao disse = persiste null como sentinel"

Loop indica: prompt instrui "chame `dados_coletados` quando tiver dado", mini interpreta wide demais e tenta persistir null. Tool descricao diz "Persiste 1 campo coletado" mas nao tem fail-fast — schema da tool aceita string "null".

Prompt v2 melhor PODE ajudar (instrucoes mais explicitas + few-shot anti-null), mas e debugging por sintoma. **Solucao estrutural:** validacao server-side da tool rejeita string "null" + mini upgrade pra modelo mais capaz.

### D2 (schema/eval): mismatch entre eval check e schema atual

O eval `dados_persistidos_NAO_inclui` foi escrito assumindo que LLM omitiria a chave quando vazio. **Mas schema OpenAI Responses API forca emitir TODAS as keys de `z.object()` com `nullable().optional()`** — entao a presenca da chave nao e signal de "persistido", o valor e.

**Fix imediato (Fase 4):** mudar check pra `out.dados_persistidos[c] != null` (semantica "nao tem valor real"). Ou: validar via `dados_persistidos_valor_NAO`.

Esse bug existe nos outros TCs com `dados_persistidos_NAO_inclui` tambem — re-auditar Fase 7.

### D3 (prompt): TC-03 e estruturalmente solucionavel SEM mudar prompt

gpt-4o passou TC-03 em 2.3s sem chamar tools, com prompt INTACTO. Isso prova que o prompt atual **tem a informacao necessaria** pra responder corretamente — a mensagem de §3.2/§3.4/few-shots e suficiente PRA UM MODELO CAPAZ.

Implicacao: o "gap estrutural" identificado em Sub-2 (estado "OBR parcial sem trigger sem conflito" sem branch explicita) e parcialmente real, mas o efeito principal observado em mini (loop max-turns) NAO e por falta de branch explicita — e por falta de capacidade de inferir do contexto. Branch explicita ajuda mini a nao errar, mas nao resolve a tendencia de "persistir null".

---

## Estimativa de custo (100 conversas/mes × 5 turns × ~3k tokens/turn = 1.5M tokens/mes)

Pricing OpenAI atual (2026):

| Modelo | Input $/1M | Output $/1M | Custo mensal estimado |
|--------|-----------|-------------|------------------------|
| gpt-4o-mini | $0.15 | $0.60 | **~$0.45/mes** |
| gpt-4o | $2.50 | $10.00 | **~$11/mes** |
| ratio | 17x | 17x | 24x |

**Diferenca absoluta:** ~$10.50/mes pra um SaaS gerando MRR positivo. Irrelevante.

**Diferenca relativa:** 24x — significativa SE volume escalar pra 1k+ conversas/mes (~$110/mes 4o vs ~$4.50 mini).

---

## Decisao

**MANTER** gpt-4o-mini como baseline na Coleta v2 ate Sub-3 cutover **CONDICIONAL a 3 mudancas estruturais** (validar nas Fases 4-6):

1. **Schema/tool fail-fast (Fase 4):** `dados_coletados` deve rejeitar valor `"null"` (string), `null`, ou strings vazias com erro claro que volta pro agent. Schema da tool: `z.union([z.string().min(1), z.number().positive(), z.array(z.string()).nonempty()])` ou similar. Atualmente passa qualquer string.
2. **Prompt v2 com branch explicita (Fase 3):** estado "OBR parcial sem trigger sem conflito" → `proxima_acao='pergunta'`, `tools=[]`. Mini precisa de instrucao literal, nao inferencia.
3. **MaxTurns reducao (Fase 5):** 20 e custoso quando agent looper. Reduzir pra 8-10 com error guard claro. Loops sao signal de problema de prompt, nao de "agent precisando mais turns".

**Sub-3 GO condicional:** se Fases 4-6 entregarem fixes 1-3 e revalidacao de TC-03 com mini passar, Sub-3 destrava. Se nao passar mesmo com fixes, **upgrade pra gpt-4o e justificavel** ($10/mes vs custo de cliente real impactado).

**Follow-up nao-bloqueador:** rodar eval suite completo (10 TCs) com gpt-4o ANTES do cutover Sub-3 pra confirmar nao-regressao em TC-01/02/04..10. Custo: ~$0.50.

**Claude haiku-4-5 follow-up:** se decisao virar upgrade, comparar com claude-haiku-4-5 antes de cravar gpt-4o. Anthropic Haiku tier-similar custa ~25% do gpt-4o-mini segundo pricing 2026 — pode ser sweet-spot. Requer instalar `@anthropic-ai/sdk` + harness paralelo (1-2h trabalho).

---

## Output esperado da Fase 1

- [x] Tabela de comparacao com PASS/FAIL + latencia + tools chamadas + output ✅
- [x] Estimativa de custo mensal por modelo ✅
- [x] Decisao de modelo com justificativa ✅
- [x] Identificacao de 2 follow-ups (eval full 4o, claude haiku) ✅

---

## Findings que alimentam fases seguintes

| Finding | Fase que aborda | Severidade |
|---------|-----------------|------------|
| F1 — `dados_coletados` aceita string "null" sem fail-fast | Fase 4 | **CRITICAL** |
| F2 — `dados_persistidos_NAO_inclui` check incompativel com schema OpenAI Responses API | Fase 4 + Fase 7 | high |
| F3 — Branch "OBR parcial sem trigger sem conflito" sem instrucao explicita pra `proxima_acao='pergunta'` | Fase 3 | high |
| F4 — gpt-4o-mini incapaz de inferir "null = sem dado, NAO persistir" sem validacao server-side | Fase 4 + Fase 6 | high |
| F5 — maxTurns 20 e teto custoso pra problemas de prompt — reduzir + erro guard | Fase 5 | medium |
