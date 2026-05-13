# Sub-4.1 Bug #2 — Continuidade do TattooAgent (Design)

**Data:** 2026-05-13
**Branch alvo:** `feat/sub4-cutover-n8n` (já existe, 7 commits ahead de origin)
**Status:** ready-to-plan
**Sub-projeto pai:** Sub-4.1 follow-ups P1 (3 de 4 já resolvidos em 12/05 — `440742b`, `c51b672`, `19d9c17`)

---

## Contexto

Smoke E2E real do Sub-4.1 em 09/05/2026 parte 7 descobriu que o TattooAgent às vezes para no meio da coleta sem perguntar o próximo campo obrigatório. Exemplo observado:

- **Cenário:** cliente disse "leão 20cm". 2 de 3 OBR coletados (`descricao_curta='leão'`, `tamanho_cm=20`, falta `local_corpo`).
- **Comportamento errado:** bot respondeu "Leão de 20cm fica bem imponente!" e parou — sem follow-up sobre onde quer fazer a tattoo.
- **Diagnóstico:** modelo provavelmente emite output schema-válido (`proxima_acao='pergunta'`, `campos_faltando=['local_corpo']`, `dados_persistidos={descricao_curta:'leão', tamanho_cm:20}`), mas `resposta_cliente` fica só com validação substantiva, sem incluir a pergunta de follow-up. Schema passa, UX falha.

Análise do código atual (2026-05-13):

- **`functions/_lib/prompts/coleta/tattoo/decisao.js §4.1 linha 4`** (parcial | não | não → pergunta): diz "pergunta o(s) faltante(s)" mas não há regra `Rx` explícita exigindo que `resposta_cliente` contenha a pergunta. R3 só fala do lado dos campos (`campos_faltando` array).
- **`functions/api/agent/agents/tattoo.js` `validateTattooOutputInvariant`**: valida apenas `proxima_acao='handoff'` (dados_completos + sem conflitos) e `proxima_acao='enviar_portfolio'` (portfolio + payload). `proxima_acao='pergunta'` não tem invariante — é onde o bug escapa.
- **Schema `TattooOutputSchema`**: `resposta_cliente: z.string().min(1)` — zero validação semântica.

Este bug é o 4º e último follow-up P1 do Sub-4.1 antes do cutover Sub-4.2. Os outros 3 foram resolvidos em 12/05 (sendTelegramTo token, typing delay, history whitelist).

## Goals

1. Quando `proxima_acao='pergunta'` E `campos_faltando` não-vazio, garantir que `resposta_cliente` contenha pergunta explícita.
2. Defesa em profundidade: camada 1 (prompt) guia o modelo; camada 2 (validator) bloqueia escapes raros.
3. Confirmar reprodução do bug em eval antes de aplicar fix (workflow baseline → fix → re-eval).
4. Manter paridade com pattern existente: terceira regra na função `validateTattooOutputInvariant` (já valida handoff + enviar_portfolio).
5. Zero regressão na suite (`npm test` 405/405 + 4 novos = 409/409).
6. Cobertura eval: TC-11 fiel ao smoke ("leão 20cm") + estender TC-03 e TC-04 com assertion nova.

## Non-Goals

- Replicar invariante nos outros agents (Cadastro, Proposta, Portfolio) — YAGNI. Bug observado apenas no Tattoo. Se sintoma similar surgir em outros, abre entry própria.
- Validação semântica mais rica (regex de verbos interrogativos, NLP, etc) — heurística `contém '?'` cobre ~95% e é determinística.
- Soft-fail / retry / log-only — cravado hard-fail HTTP 500 com paridade aos invariants existentes.
- Mudar schema `TattooOutputSchema` — `resposta_cliente: z.string().min(1)` permanece. Validação semântica é pós-parse via `validateTattooOutputInvariant`.
- Mudar pipeline (`whatsapp-pipeline.js`) ou route handler (`route.js`) — `route.js` já trata `validator(out).valid === false` com HTTP 500 + Telegram alert (pattern Sub-3.1/3.2/3.3 cravado).
- Tratar caso `proxima_acao='pergunta'` + `campos_faltando=[]` (clarificação/contradição) — validator deve aceitar respostas sem `?` nesse cenário (linha 6/10 da tabela, R6 conflito).

## Premissas validadas

- **TattooAgent é pure structured-output** (sem tools) desde Sub-2 (PR #56, `b0812df`). Output schema Zod com 7 campos. Validator pos-parse via `validateTattooOutputInvariant(out, clientContext)`.
- **`validateTattooOutputInvariant`** já tem signature `(out, clientContext = {})` e retorna `{ valid: true }` ou `{ valid: false, reason: string }`. Extensão é additiva.
- **`route.js`** já trata `validator(out).valid === false` (pattern Sub-3.1/3.2/3.3) — converte em HTTP 500 + `sendTelegramAdmin` com reason. Zero mudança necessária.
- **Pipeline `whatsapp-pipeline.js`** trata HTTP 500 do agent endpoint: marca `n8n_chat_histories.status = 'failed'`, não chama `evoSend`, typing-delay não dispara (early return).
- **`tests/agent/_fixtures/scenarios.json`** tem 10 cenários (TC-01..TC-10). TC-03 ("rosa pequena") e TC-04 ("preço e disponibilidade") já esperam `proxima_acao='pergunta'` — natural extensão pra incluir nova assertion.
- **Eval framework** (`tattoo-agent.eval.mjs`) suporta assertions custom via `scenario.expected.*` (pattern existente: `proxima_acao`, `dados_completos`, `campos_faltando_inclui`, `dados_persistidos_inclui`, etc).
- **Eval não roda em CI** (filename `.eval.mjs` fora do glob `*.test.mjs`). Roda manual com `OPENAI_API_KEY=... npm run eval:tattoo`. Custo $0.020/suite.
- **Snapshot `tests/prompts/snapshots/coleta-tattoo.txt`** vai mudar (R8 adicionada ao prompt) — regenerar via `scripts/update-prompt-snapshots.sh` (referência: `tests/prompts/snapshot.test.mjs:20`).

## Arquitetura

```
Cliente WhatsApp
     ↓
whatsapp-pipeline.js (invoca route.js)
     ↓
TattooAgent (structured output via Zod)
     ↓ finalOutput
     ├─ Schema check (Zod, automático) — JÁ EXISTE
     │
     ├─ Invariante pos-parse (validateTattooOutputInvariant) — ESTENDIDO
     │   • handoff: dados_completos=true + campos_conflitantes=[] (já existe)
     │   • enviar_portfolio: portfolio_disponivel + payload_portfolio (já existe)
     │   • [NOVO] pergunta: se campos_faltando.length > 0 → resposta_cliente.includes('?')
     │
     ├─ valid:true → route.js prossegue → pipeline → evoSend → cliente recebe resposta
     └─ valid:false → HTTP 500 + sendTelegramAdmin com reason
                    → pipeline marca status='failed'
                    → cliente NÃO recebe resposta
                    → tatuador vê alert e responde manualmente
```

**Princípio:** mesma estrutura de invariante que já existe pra `handoff` e `enviar_portfolio` — só adiciona terceira regra na função pura. Zero mudança no pipeline; só estende `validateTattooOutputInvariant`.

**Fluxo da camada de prevenção (R8 no prompt):** modelo recebe instrução explícita, gera output já dentro da regra → 95%+ dos turnos passam direto sem disparar validator. Validator é DEFCON pra escapes raros.

## Components

**6 files modificados, 0 novos:**

| # | File | Tipo | Mudança |
|---|------|------|---------|
| 1 | `functions/_lib/prompts/coleta/tattoo/decisao.js` | EDIT | Adicionar **R8** em §4.3 (entre R7 e §4.4). ~5 linhas de texto + 1 exemplo válido/inválido. |
| 2 | `functions/api/agent/agents/tattoo.js` | EDIT | Estender `validateTattooOutputInvariant` com terceiro bloco `if (out.proxima_acao === 'pergunta' && Array.isArray(out.campos_faltando) && out.campos_faltando.length > 0 && !out.resposta_cliente.includes('?'))`. ~7 linhas. Mantém signature `(out, clientContext = {})`. |
| 3 | `tests/agent/tattoo-agent.test.mjs` | EDIT | Adicionar 4 testes unitários (rejeita pergunta sem `?` + faltando; aceita com `?`; aceita sem `?` se faltando vazio; regression handoff/portfolio intactos). |
| 4 | `tests/agent/_fixtures/scenarios.json` | EDIT | Adicionar TC-11 "Leão 20cm" + adicionar `expected.resposta_contains_question: true` em TC-03, TC-04, TC-11. |
| 5 | `tests/agent/tattoo-agent.eval.mjs` | EDIT | Adicionar handler da assertion `expected.resposta_contains_question` (~5 linhas no for-loop). |
| 6 | `tests/prompts/snapshots/coleta-tattoo.txt` | REGEN | Snapshot do prompt vai mudar (R8 adicionada) — regenerar via `scripts/update-prompt-snapshots.sh`. |

**Boundary do fix:** zero mudança em `route.js`, `whatsapp-pipeline.js`, schema do output, ou pipeline. **Tudo é additivo** — terceira regra na função pura, novo cenário no JSON, nova assertion no eval.

## Data flow

### Fluxo feliz (~95% dos turnos `pergunta`)

```
1. Cliente: "leão 20cm"
2. TattooAgent recebe prompt com R8 explícita
3. Modelo gera structured output:
   {
     resposta_cliente: "Leão de 20cm fica imponente! Onde tu quer fazer?",
     dados_persistidos: { descricao_curta:"leão", tamanho_cm:20 },
     dados_completos: false,
     campos_faltando: ["local_corpo"],
     campos_conflitantes: [],
     proxima_acao: "pergunta",
     payload_portfolio: null
   }
4. Zod parse OK
5. validateTattooOutputInvariant:
   - proxima_acao='pergunta' → enter novo bloco
   - campos_faltando.length > 0 → SIM
   - resposta_cliente.includes('?') → SIM
   - return { valid: true }
6. route.js → pipeline → evoSend → cliente recebe resposta
```

### Fluxo de fail (~5% — escape do modelo apesar do R8)

```
1. Cliente: "leão 20cm"
2. Modelo (apesar do R8) emite:
   {
     resposta_cliente: "Leão de 20cm fica bem imponente!",
     campos_faltando: ["local_corpo"],
     proxima_acao: "pergunta",
     ...
   }
3. Zod parse OK
4. validateTattooOutputInvariant:
   - proxima_acao='pergunta' → enter novo bloco
   - campos_faltando.length > 0 → SIM
   - resposta_cliente.includes('?') → NÃO
   - return { valid: false, reason: "pergunta com campos_faltando=[local_corpo] mas resposta sem '?'" }
5. route.js detecta valid:false
6. HTTP 500 + sendTelegramAdmin(env, "[invariante tattoo] ...")
7. Pipeline marca status='failed' (via PATCH em n8n_chat_histories)
8. Cliente NÃO recebe resposta (silêncio até tatuador intervir)
9. Tatuador vê alert Telegram com session_id + telefone + reason
   → entra manual no WhatsApp e responde
```

### Edge case — `pergunta` com `campos_faltando=[]`

Quando agent aciona linhas 6/10 da tabela (conflito), pode emitir `proxima_acao='pergunta'` com `campos_faltando=[]` e `campos_conflitantes=['tamanho_cm']`. Nesse caso `resposta_cliente` pode ser declarativa ("Tu disse pequena mas 25cm já é grande, me confirma") sem `?` final. Validator **deve aceitar** — R8 só dispara quando há campos faltando.

## Error handling

### Trigger do HTTP 500

Já existe em `route.js` (pattern Sub-3.1/3.2/3.3). Pseudocódigo:

```js
const { agent, validator } = buildTattooAgent({...});
const result = await run(agent, messages, { maxTurns: 20 });
const out = result.finalOutput;

const v = validator(out);
if (!v.valid) {
  await sendTelegramAdmin(env, `[invariante tattoo] ${v.reason} | session=${conversa.id} | telefone=${conversa.telefone}`);
  return new Response(JSON.stringify({ error: 'invariant_failed', reason: v.reason }), { status: 500 });
}
```

### Impacto UX (trade-off aceito)

- Quando validator dispara, cliente fica em silêncio temporário.
- Tatuador recebe alert Telegram detalhado e responde manualmente.
- Melhor que cliente receber "Leão fica imponente!" e ficar esperando — pergunta clara faz parte da experiência.

### Telemetria

`reason` do validator inclui:
- `proxima_acao` (sempre `pergunta` neste caso)
- `campos_faltando` (quais OBR estavam faltando)
- Fragmento da `resposta_cliente` (primeiros 80 chars pra context)

Permite identificar:
- Frequência (alerts/dia)
- Padrões (sempre falta `local_corpo`? Sempre certos turnos?)
- Decisão futura: ajustar R8 ou refinar heurística

## Testing

### Camada 1 — Tests unitários (`tattoo-agent.test.mjs`)

Rodam em CI (`npm test`), sem custo LLM. **4 novos tests:**

```js
test('validator rejeita pergunta com campos_faltando mas sem ? na resposta', () => {
  const invalid = {
    resposta_cliente: 'Leão de 20cm fica imponente!',
    dados_persistidos: { descricao_curta:'leão', tamanho_cm:20 },
    dados_completos: false,
    campos_faltando: ['local_corpo'],
    campos_conflitantes: [],
    proxima_acao: 'pergunta',
    payload_portfolio: null,
  };
  const r = validateTattooOutputInvariant(invalid);
  assert.equal(r.valid, false);
  assert.match(r.reason, /pergunta.*resposta sem/);
});

test('validator aceita pergunta com campos_faltando + ? na resposta', () => {
  const valid = { /* idem mas resposta_cliente termina com ? */ };
  assert.equal(validateTattooOutputInvariant(valid).valid, true);
});

test('validator aceita pergunta com campos_faltando vazio (conflito/clarificação)', () => {
  const valid = {
    resposta_cliente: 'Tu disse pequena mas 25cm já é grande, me confirma.',
    campos_faltando: [],
    campos_conflitantes: ['tamanho_cm'],
    proxima_acao: 'pergunta',
    /* ... */
  };
  assert.equal(validateTattooOutputInvariant(valid).valid, true);
});

test('regression: invariants handoff + enviar_portfolio intactos', () => {
  // Re-testar invariants antigos com cenários conhecidos pra garantir extensão não quebra
});
```

**Total novos:** 4 tests, ~50 linhas. Roda em <100ms.

### Camada 2 — Eval direcionado (`tattoo-agent.eval.mjs`)

**Não roda em CI** (filename `.eval.mjs` fora do glob). Roda manual com `OPENAI_API_KEY=... npm run eval:tattoo`. Custo ~$0.020/suite contra `gpt-4o-mini`.

**(a) `_fixtures/scenarios.json` — adicionar TC-11:**

```json
{
  "id": "TC-11",
  "descricao": "2/3 OBR faltando local_corpo — agent DEVE perguntar (bug #2 smoke 09/05)",
  "hipoteses": ["bug2-continuidade"],
  "input": {
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "telefone": "+5511900000011",
    "mensagens": [
      { "role": "user", "content": "quero tatuar um leão de 20cm" }
    ],
    "estado_atual": "tattoo",
    "dados_acumulados": {},
    "historico": []
  },
  "expected": {
    "proxima_acao": "pergunta",
    "dados_completos": false,
    "campos_faltando_inclui": ["local_corpo"],
    "dados_persistidos_inclui": ["descricao_curta", "tamanho_cm"],
    "resposta_contains_question": true
  }
}
```

**(b) `scenarios.json` — estender TC-03 e TC-04** com `expected.resposta_contains_question: true`.

**(c) `tattoo-agent.eval.mjs` — adicionar handler da assertion** (~5 linhas no fim do for-loop):

```js
if (scenario.expected.resposta_contains_question === true) {
  assert.ok(
    out.resposta_cliente.includes('?'),
    `${scenario.id}: esperava resposta com '?' — got="${out.resposta_cliente}"`
  );
}
```

### Workflow de execução (detalhado vai pro plan)

1. **Step 1:** Adicionar TC-11 + estender TC-03/TC-04 + handler de assertion no eval.
2. **Step 2:** Rodar `npm run eval:tattoo` → **BASELINE** (sem fix ainda).
   - Esperado: TC-11 falha (`proxima_acao` OK mas `resposta_cliente` sem `?`).
   - TC-03/TC-04 incerto (modelo pode ou não estar emitindo `?` por sorte).
   - Custo: ~$0.020.
   - **SE TC-11 NÃO falhar:** bug é intermitente. Stop, reportar resultado, decidir (talvez já resolvido por refator anterior, ou flake do smoke).
3. **Step 3:** Aplicar R8 no prompt + estender validator + 4 unit tests.
4. **Step 4:** Rodar `npm test` → unit tests verdes (409/409 total).
5. **Step 5:** Rodar `npm run eval:tattoo` → **POST-FIX**.
   - Esperado: TC-11, TC-03, TC-04 com `resposta_contains_question:true` PASS.
   - Custo: ~$0.020.
6. **Step 6:** Comparar baseline vs post-fix em log do plan.
7. **Step 7:** Commit + push (sem PR ainda — branch `feat/sub4-cutover-n8n` acumulando, abre PR quando Sub-4.2 também estiver pronto).

## Acceptance criteria

1. ✅ TC-11 PASS em eval pós-fix (não passava em baseline).
2. ✅ TC-03 e TC-04 PASS com `resposta_contains_question: true` em eval pós-fix.
3. ✅ 4 novos unit tests verdes em `npm test`.
4. ✅ Suite total `npm test` zero regressão (409/409).
5. ✅ Snapshot `coleta-tattoo.txt` regenerado e committed.
6. ✅ Log de baseline vs post-fix anexado ao plan (evidência que fix resolveu o bug).
7. ✅ `validateTattooOutputInvariant` mantém signature `(out, clientContext = {})` — extensão é additiva.

## Riscos & mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Baseline NÃO reproduz o bug | Média | Alto (plano cai) | Step 2 do workflow tem stop-gap explícito: stop, reportar, decidir. Talvez bug foi resolvido por refator anterior (PR #56/#57/#58) e a observação de 09/05 foi flake. |
| R8 no prompt causa regressão em outros cenários (TC-01..TC-10) | Baixa | Médio | Eval post-fix roda toda a suite — qualquer regressão é visível. R8 é additiva (não substitui R3-R7). |
| Heurística `includes('?')` gera falso positivo | Baixa | Baixo | Em pt-BR coloquial, perguntas quase sempre usam `?`. Few-shots do prompt reforçam. Edge case "Me conta onde." sem `?` é raro nos exemplos. Se aparecer, refinar em P2 separado. |
| Hard-fail em prod aumenta failed rate visível ao tatuador | Média | Baixo | Trade-off aceito. Tatuador prefere alert + intervenção manual a cliente receber "Leão fica imponente!" sem follow-up. Telemetria do `reason` permite monitorar. |
| Snapshot regen quebra outro snapshot dependente | Baixa | Baixo | `npm test` da suite total inclui validação de snapshots — qualquer cascata aparece. |

## Estimativa

**Tempo total:** 1-2h (paridade com o estimado na entry de backlog).

Decomposição:
- Eval scaffolding (TC-11 + assertions extra + handler): ~15min
- Baseline eval run: ~3min (LLM real)
- Prompt R8 + validator extension: ~30min
- 4 unit tests + run: ~20min
- Post-fix eval run + análise: ~5min
- Snapshot regen + commit + push: ~10min
- Buffer pra surpresas: ~20-40min

**Custo OpenAI:** ~$0.05 total ($0.020 baseline + $0.020 post-fix + ~$0.010 retries esperados).

## Decisões cravadas (durante brainstorm 13/05)

1. **Escopo:** só TattooAgent. Cadastro/Proposta NÃO replicar preventivamente — abre entry própria se sintoma similar surgir.
2. **Heurística:** `resposta_cliente.includes('?')` (contém `?` em qualquer lugar). Não strict (termina com), não rich (verbos interrogativos).
3. **Fail mode:** hard-fail HTTP 500 + sendTelegramAdmin. Paridade com `handoff` e `enviar_portfolio` invariants.
4. **Eval coverage:** TC-11 novo fiel ao smoke ("leão 20cm") + estender TC-03 e TC-04 com assertion nova. Não criar TC-12/TC-13 com variações.
5. **Workflow:** baseline-first (rodar eval sem fix antes pra confirmar reprodução).
6. **Camadas:** R8 prompt (primária) + validator (safety net). Não só prompt, não só validator.

## Out of scope (referência futura)

- Replicar invariante em outros agents — abre entry própria se sintoma surgir.
- Validação semântica via NLP/LLM — over-engineering pra heurística determinística que funciona.
- Soft-fail / retry com prompt corretivo — adiciona complexidade no pipeline, custo dobrado em LLM.
- Métricas de prod (dashboard de invariant failures) — vira P2 separado quando volume justificar.
- Aplicar R8 também em §4.4 mensagem-ponte (handoff) — já coberto pelo invariante handoff existente; R8 é específica pra `pergunta`.

## Próximo passo

Quando spec aprovado, rodar `/plan docs/superpowers/specs/2026-05-13-sub4-1-bug2-continuidade-agente-design.md` pra gerar plan executável com tasks granulares.

---

## Referências

- Painel sessão 12/05 — bug #2 diagnóstico inicial: `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md`
- Daily note 12/05 — workflow + hipótese de fix: `~/Documents/vault/Daily Notes/2026-05-12.md`
- Backlog entry origem: `InkFlow — Pendências (backlog).md` (P1 — Sub-4.1 follow-up: bug #2 falta continuidade do agente)
- Code referencias:
  - `functions/_lib/prompts/coleta/tattoo/decisao.js` — §4.1 tabela + §4.3 regras
  - `functions/api/agent/agents/tattoo.js:63-84` — `validateTattooOutputInvariant`
  - `tests/agent/tattoo-agent.test.mjs` — pattern de unit tests do validator
  - `tests/agent/tattoo-agent.eval.mjs` — eval suite + assertion handlers
  - `tests/agent/_fixtures/scenarios.json` — TC-01..TC-10
