---
title: InkFlow Agent — Fase 1.A — Foundation Hardening do TattooAgent
status: ready-to-plan
created: 2026-05-15
owner: leandro
parent_spec: docs/superpowers/specs/2026-05-15-inkflow-agent-program-design.md
parent_phase: Fase 1 — TattooAgent
sibling_subphases:
  - 1.B — Core failure fixes (P1/P5/P6)
  - 1.C — Edge failures + DoD close
companion_obsidian: "[[InkFlow Agent — Fase 1 TattooAgent]]"
---

# InkFlow Agent — Fase 1.A — Foundation Hardening do TattooAgent

## Contexto

A **Phase 0 Foundation** do programa InkFlow Agent foi mergeada em `main` (PR #66). Entregou:

- 15 personas em `docs/inkflow-agent/personas/` (incluindo as 3 core desta fase: PER-001, PER-009, PER-010)
- 12 failure modes em `docs/inkflow-agent/failures/` (incluindo todos os 8 que tocam TattooAgent: FM-0001, FM-0003, FM-0004, FM-0005, FM-0008, FM-0009, FM-0011, FM-0012)
- Manifesto canônico (`docs/manifesto-tatuador-bot.md` — 6 princípios)
- Telemetria `agent_turn_logs` + `functions/_lib/telemetry/agent-turn-logger.js` integrada em `functions/api/agent/route.js`
- Eval harness `evals/inkflow-agent/_harness/run.mjs` + `rubric.mjs` + 3 judges (manifesto / naturalidade / state) usando Claude Haiku 4.5
- Regression `evals/inkflow-agent/regression/invariants.mjs` (chama suites existentes)

A **Phase 1 inteira** do TattooAgent foi decomposta em **3 sub-fases sequenciais** (decisão tomada durante este brainstorm, ver MEMORY frescos):

| Sub-fase | Conteúdo | Spec |
|---|---|---|
| **1.A — Foundation Hardening** | Audit + scaffolding evals + persona inference + baseline run | **este spec** |
| 1.B — Core failure fixes | FM-0001, 0003, 0008, 0009, 0011 fixes + expand evals + smoke 3 personas | spec próprio futuro |
| 1.C — Edge failures + DoD close | FM-0004, 0005, 0012 + CI gate + smoke prod manual + DoD 8 itens | spec próprio futuro |

Sub 1.A **não muda comportamento do bot em prod** — só observa, mede e dá visibilidade. Toda mudança de prompt fica reservada pra 1.B/1.C, informada pelo baseline desta sub-fase.

### Por que baseline-first

O programa spec original estimou Fase 1 em 5 dias úteis com 8 failure-mode fixes + audit + evals + telemetria + smoke num único pacote. Decomposto em 3 sub-fases o trabalho fica:
- Cada sub-PR é revisável e revertível independentemente
- Decisões de fix em 1.B são informadas por dados (`baseline-report.md`), não intuição
- Failure modes que parecem prováveis pelo catálogo podem não reproduzir empiricamente; outros podem aparecer onde não esperávamos
- O risco de over-engineering em 1.B cai porque cada fix tem evidência de necessidade

### Limitações da telemetria atual

A migration `agent_turn_logs` está aplicada e o logger fire-and-forget em `functions/_lib/telemetry/agent-turn-logger.js` recebe `persona_inferred` como campo, **mas o caller em `functions/api/agent/route.js:200-217` nunca passa valor pra ele** — fica sempre `null`. Sem persona inferida em prod, o DoD item 6 ("Telemetria captura turns do agent — query Supabase confirma") está formalmente cumprido mas o pilar Persona Library (Pilar 1) e o slice cross-agent do programa (princípio 7 "persona-driven evals") não conseguem fechar o loop com dados reais.

## Goals

1. **Audit dos prompts do TattooAgent vs manifesto**, lente failure-mode-driven, produzindo tabela acionável que vira input pro brainstorm da Sub 1.B
2. **3 directed evals JSON** (PER-001, PER-009, PER-010) compatíveis com o harness existente, com schema estendido para incluir princípios aplicáveis
3. **Persona inference cron worker** rodando em prod, classificando conversas reais de `agent_turn_logs` via Claude Haiku 4.5, fazendo backfill de `persona_inferred`
4. **Baseline report** rodado contra os 3 evals nos prompts atuais (sem mexer nada), commitado no repo como artefato versionado
5. **Sem regressão funcional** — prod do bot continua idêntico (zero mudança em `decisao.js`/`exemplos.js`/`route.js` que afete cliente final)

## Non-Goals

- Modificar `decisao.js`, `exemplos.js`, ou qualquer outro prompt do TattooAgent (fica pra 1.B)
- Adicionar evals para personas além de PER-001, PER-009, PER-010 (1.B expande pra 4-6)
- Adicionar snapshot tests novos (1.B/1.C)
- Habilitar CI gate da eval directed suite (1.C)
- Smoke prod manual em WhatsApp real com 3 personas (1.C)
- Fechar failure modes ainda `open` no catálogo (1.B/1.C)
- Inferência de persona em outros agents (`cadastro`, `proposta`, `portfolio`) — futuro
- Inferência inline no hot path do bot (decidido: offline batch)

## Arquitetura

Cinco componentes, cada um com fronteira clara e testável isoladamente.

```
┌──────────────────────────────────────────────────────────────────┐
│ C1 — Audit report (doc, sem código)                              │
│ docs/inkflow-agent/reports/2026-05-15-tattoo-audit-baseline.md   │
│ 8 entradas FM (gatilho · prompt-atual · gap · sugestão).         │
│ Linka linhas específicas de decisao.js/exemplos.js.              │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ C2 — Directed evals JSON (3 arquivos)                            │
│ evals/inkflow-agent/directed/tattoo/per-001/01-happy-path.json   │
│ evals/inkflow-agent/directed/tattoo/per-009/01-muda-decisao.json │
│ evals/inkflow-agent/directed/tattoo/per-010/01-conflito.json     │
│ Schema = evals/convs/ existente + extensão `manifesto_principles_│
│ aplicaveis` em `expected`. Reusa harness atual (run.mjs).        │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ C3 — Persona classifier (cron worker)                            │
│ cron-worker/src/persona-inferred-classifier.mjs                  │
│ Trigger: scheduled daily (03:00 UTC)                             │
│ Lê: agent_turn_logs WHERE persona_inferred IS NULL               │
│      AND created_at > NOW() - INTERVAL '7d'                      │
│ GROUP BY conversa_id                                             │
│ LLM: Claude Haiku 4.5 (ANTHROPIC_API_KEY)                        │
│ Output: UPDATE agent_turn_logs SET persona_inferred = 'PER-XXX'  │
│         WHERE conversa_id = ?                                    │
│ Idempotente — só escreve onde está NULL.                         │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ C4 — Persona classifier prompt                                   │
│ cron-worker/src/persona-classifier-prompt.txt                    │
│ Input runtime: transcript da conversa + lista das 15 personas    │
│ Output JSON: {persona_id, confianca: 0-1, razao}                 │
│ Fallback: confianca < 0.6 → UPDATE skip (persona fica NULL)      │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ C5 — Baseline runner script                                      │
│ scripts/inkflow-agent/run-baseline.mjs                           │
│ npm run inkflow-agent:baseline                                   │
│ Roda harness contra os 3 evals + consolida em                    │
│ docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md         │
│ (scores nat/manifesto/state + violations + per-principle)        │
└──────────────────────────────────────────────────────────────────┘
```

### Boundaries

- **C1 (Audit)** é doc, não tem código. Review humano pelo Leandro. Sem teste automatizado.
- **C2 (Eval JSONs)** são contratos imutáveis após commit; o harness lê e judges decidem.
- **C3 + C4 (Classifier)** são totalmente desacoplados do bot prod — fire-and-forget no schema, não afetam hot path.
- **C5 (Baseline runner)** é dev tool local + GitHub Actions futuro (CI fica pra 1.C). Não roda em CI agora.

## Data flow detalhado

### 4.1 Baseline run (one-shot, manual, dev local)

```
dev local → npm run inkflow-agent:baseline
  → carrega evals/inkflow-agent/directed/tattoo/*/*.json (3 evals)
  → para cada eval:
     → harness/run.mjs faz POST /api/tools/simular-conversa (prod via BASE_URL)
     → transcript chega ao runner
     → checagem determinística: should_not_contain / should_contain_at_least_one
     → 3 judges paralelos (Haiku 4.5): naturalidade / manifesto / state
     → rubric.mjs computePass() agrega scores
  → script consolida em baseline-report.md
  → git commit do report (versionado)
```

### 4.2 Persona inference (recorrente, autônomo, cron worker)

```
cron daily 03:00 UTC → worker handler
  → SELECT conversa_id, tenant_id,
           array_agg({turn_index, role, content}) AS transcript
     FROM agent_turn_logs
     WHERE persona_inferred IS NULL
       AND created_at > NOW() - INTERVAL '7d'
       AND agent_name = 'tattoo'  -- Sub 1.A escopa só TattooAgent
     GROUP BY conversa_id, tenant_id
  → batch em chunks de 10 conversas (paralelo, rate limit)
  → para cada chunk:
     → para cada conversa:
        → monta prompt: transcript renderizado + lista das 15 personas
        → call Anthropic Claude Haiku 4.5 (temperature=0)
        → parse JSON {persona_id, confianca, razao}
        → se confianca >= 0.6:
             UPDATE agent_turn_logs
             SET persona_inferred = ?,
                 persona_inferred_confidence = ?,  -- nova coluna opcional
                 persona_inferred_at = NOW()
             WHERE conversa_id = ? AND persona_inferred IS NULL
        → senão: log skip, NÃO faz UPDATE
  → log run summary: {processed, classified, skipped_low_conf, errored}
```

> **Nota schema:** este spec assume que `agent_turn_logs` precisa de 2 colunas auxiliares opcionais (`persona_inferred_confidence numeric`, `persona_inferred_at timestamptz`) para observabilidade da classificação. Decisão na fase de plan se vamos migrar essas colunas agora ou só usar `persona_inferred` como hoje. Se a migration não couber em 1.A, ficar só com `persona_inferred` text é aceitável e suficiente pro DoD.

### 4.3 Eval JSON schema exemplificado

```json
{
  "id": "per-010-01-conflito-tamanho",
  "titulo": "PER-010 — conflito tamanho 'rosa pequena de 25cm'",
  "descricao": "Persona contraditória — testa P1 manifesto. Bot DEVE pedir foto, NUNCA confrontar nem propor range.",
  "estado_atual": "coletando_tattoo",
  "persona": "PER-010",
  "turns_cliente": [
    "oi tudo bem?",
    "queria uma rosa pequena de uns 25cm no antebraco",
    "nao tenho foto agora",
    "fineline",
    "1.65m"
  ],
  "expected": {
    "proxima_acao_esperada": "handoff",
    "manifesto_principles_aplicaveis": ["P1", "P5"],
    "should_not_contain": ["confirme", "5-8cm", "muito grande", "muito pequena", "reduzir"],
    "should_contain_at_least_one": ["foto de referencia", "alguma referencia", "imagem de referencia"],
    "campos_conflitantes_esperados": ["tamanho_cm"]
  },
  "thresholds": {
    "naturalidade_min": 4.0,
    "manifesto_adherence_min": 0.85
  }
}
```

`should_not_contain` e `should_contain_at_least_one` são checagens determinísticas rodadas pelo runner **antes** do judge — fail fast em violação óbvia, economiza chamada Anthropic. `manifesto_principles_aplicaveis` informa o judge quais princípios pontuar (versus deixar implícito).

### 4.4 Classifier I/O

**Input runtime:**

```
Conversa #conv-abc-123 (10 turns)

[turn 1 — user] oi
[turn 2 — agent] Oii, tudo bem? Aqui é Pedro do Studio X
                 Me conta o que está pensando em fazer?
[turn 3 — user] queria uma rosa pequena de uns 25cm
...

Personas disponíveis (15):
- PER-001 curioso-primeira-vez: cliente que nunca tatuou, vocabulário leigo...
- PER-009 indeciso-eterno: troca de ideia, manda 50 referências...
- PER-010 contraditorio: info contraditória na mesma mensagem...
[... resumo de cada das 15 personas montado a partir do INDEX.md ...]
```

**Output esperado:**

```json
{"persona_id": "PER-010", "confianca": 0.82, "razao": "Cliente forneceu 'rosa pequena de 25cm' — contradição clássica entre 'pequena' e 25cm"}
```

### 4.5 Baseline report formato

```markdown
# TattooAgent — Baseline Run 2026-05-15

**Prompt hash:** sha256(...)
**Eval harness commit:** abc1234
**Judge model:** claude-haiku-4-5-20251001
**Base URL:** https://inkflowbrasil.com
**Total:** 3 evals · 2 pass · 1 fail

## PER-001 / 01-happy-path
✅ PASS
- naturalidade: 4.6 (n1=5, n2=4, n3=5, n4=4, n5=5)
- manifesto: 1.0 (P2, P3, P5 aplicáveis, todos 1.0)
- state: 1 (proxima_acao=handoff coerente)
- violations: []

## PER-009 / 01-muda-decisao
❌ FAIL em: manifesto, state
- naturalidade: 4.2
- manifesto: 0.67 (P5=1.0, mas observou dados acumulados rosa+leão)
- state: 0 (esperado: pergunta; bot emitiu: handoff prematuro)
- violations:
  - "msg 6: dados_persistidos mantém 'rosa' após cliente mudar pra 'leão'"

## PER-010 / 01-conflito
✅ PASS
- naturalidade: 4.4
- manifesto: 1.0 (P1, P5 aplicáveis, 1.0)
- state: 1
- violations: []

## Próximos passos sugeridos pra Sub 1.B
- FM-0009 confirmado em PER-009: prioridade alta
- FM-0003 NÃO reproduziu em PER-010 (mitigation segura): manter regression
- FM-0001 não testado nesta baseline (PER-002 não está em escopo de 1.A)
```

## Error handling

| Componente | Erro | Estratégia |
|---|---|---|
| Eval harness | Anthropic 429/5xx | retry 2x exponential backoff; eval marca como `status: 'error'`, continua próximo |
| Eval harness | `simular-conversa` 5xx | retry 2x; falha bloqueia só esse eval |
| Eval harness | judge retorna JSON malformado | rubric trata `undefined` como `null` (já em `rubric.mjs:13-15`); eval marca inconclusivo |
| Cron worker | Anthropic 429 | rate limit interno: max 10 calls paralelas, sleep 1s entre chunks |
| Cron worker | Anthropic 5xx | retry 1x, depois skip essa conversa (próximo run pega) |
| Cron worker | Supabase UPDATE falha | log warn, skip; idempotente |
| Cron worker | `confianca < 0.6` | skip UPDATE — fica NULL pra revisão manual |
| Cron worker | conversa com 0 turns do bot | skip — sem resposta do agent não dá pra classificar persona |
| Cron worker | exception não tratada | catch global → console.error + exit 1 pra alarme do scheduler |

### Idempotência e safety

- Query filtra `WHERE persona_inferred IS NULL` → nunca re-classifica turns já marcados
- Lookback window de 7 dias evita backfill infinito + cobre re-tentativa se Haiku cair 1-2 dias
- Primeira execução em prod pode classificar bastante coisa de uma vez — dimensionar rate (10 paralelas × ~2s = ~20 conv/min) é suficiente pro volume atual do beta fechado

## Testing strategy

| Componente | Testes |
|---|---|
| C1 — Audit report | N/A (doc). Review humano. |
| C2 — Eval JSONs | `tests/inkflow-agent/eval-schema-lint.test.mjs` valida campos obrigatórios (`id`, `turns_cliente`, `expected.manifesto_principles_aplicaveis`); dry-run do harness em local mode confirma carregamento. |
| C3 — Cron worker | `tests/inkflow-agent/persona-classifier.test.mjs`: unit com mock Anthropic + Supabase, valida prompt assembly, parse de output, `confianca<0.6` skip, conversa sem turns do bot skip, rate limit chunks. Smoke manual com `--dry-run`. |
| C4 — Classifier prompt | `scripts/inkflow-agent/test-persona-classifier.mjs` — monta 5 transcripts sintéticos com persona-alvo conhecida; threshold de aceitação: **4/5 correto (80%)** antes de habilitar UPDATE em prod. |
| C5 — Baseline runner | Smoke direto: `npm run inkflow-agent:baseline` end-to-end. Sucesso = report.json + baseline-report.md gerados. Falha de eval individual NÃO trava o runner. |

### Gate de saída da Sub 1.A (verificação end-to-end)

```
1. Audit report commitado e revisado pelo Leandro
2. 3 eval JSONs commitados, eval-schema-lint passa
3. Cron worker compila + unit tests passam
4. test-persona-classifier passa 4/5 (sintético)
5. Cron worker rodou 1x em prod com --dry-run, log mostra N>0 classificações plausíveis
6. Habilitar cron real (sem --dry-run) — primeiro run completa sem error global
7. Query manual Supabase confirma: agent_turn_logs.persona_inferred populado em ≥1 conversa
8. npm run inkflow-agent:baseline roda em prod, gera baseline-report.md
9. Report inclui scores reais (não null), violations capturadas, próximos passos pra 1.B documentados
```

Apenas após os 9 itens passarem é que abre brainstorm da Sub 1.B.

## Rollout sequence

| Step | Conteúdo | Tempo | Paralelizável |
|---|---|---|---|
| 1 | Audit doc — 8 entradas FM | 1 dia | sequencial |
| 2 | Eval JSONs (3) + eval-schema-lint | 1 dia | paralelo c/ step 3 |
| 3 | Cron worker + classifier prompt + unit tests + test-persona-classifier sintético | 1.5 dia | paralelo c/ step 2 |
| 4 | Baseline runner script + `npm run inkflow-agent:baseline` | 0.5 dia | sequencial |
| 5 | Deploy cron worker (`--dry-run` primeiro, depois real) + executar baseline em prod + commitar reports | 0.5 dia | sequencial |

**Estimativa total: 3-4 dias úteis.** Sobra pra absorver imprevistos ou avançar pra brainstorm da Sub 1.B no mesmo sprint.

## Rollback strategy

- **Audit/evals/baseline:** docs+JSON. `git revert` trivial, zero impacto em prod.
- **Cron worker:** worker independente. `wrangler deploy --rollback` ou desabilitar scheduled trigger; sem efeito no bot (campo `persona_inferred` ficar `null` é o estado atual).
- **Único risco real:** classifier escreve persona errada → mitigado por `confianca >= 0.6` threshold + test-persona-classifier 4/5 antes de habilitar.

## Risks & mitigations

| Risco | Impacto | Mitigação |
|---|---|---|
| Volume de prod < 3 conversas reais → classifier não tem o que classificar | baixo | aceitável; primeiro run pode produzir pouco. Opcionalmente: backfill via `simular-conversa` pra criar conversas sintéticas em ambiente de staging. |
| Haiku classificador erra muito (precisão < 4/5 no sintético) | médio | pivota pra prompt mais explícito ou few-shot no prompt; ou aumenta threshold confianca pra 0.75 |
| BASE_URL/EVAL_SECRET do harness não configurados | baixo (1.A não toca CI) | documentar setup em `evals/inkflow-agent/_harness/README.md`; CI gate só em 1.C |
| Eval baseline tem flake (judge inconsistente entre runs) | médio | rodar 3x e tirar mediana? Decidir empiricamente no Step 5 — se variância alta, adicionar `--samples=3` ao baseline runner |
| Audit identifica FMs adicionais não previstos no escopo | baixo-médio | documentar como `discovered failures` no audit report; cria FM-XXXX entry pendente em `docs/inkflow-agent/failures/`; decide em Sub 1.B brainstorm se entra no escopo |
| Migration nova de coluna em `agent_turn_logs` (`persona_inferred_confidence`) trava | baixo | aceitar fallback: usar só `persona_inferred` (text) como hoje; perde observabilidade da confiança mas DoD ainda fecha |

## Open questions (decidir no `/plan`)

1. **Migrar 2 colunas auxiliares** (`persona_inferred_confidence`, `persona_inferred_at`) em `agent_turn_logs` agora, ou ficar só com `persona_inferred` text? Decisão na fase de plan baseada em complexidade da migration vs valor de observabilidade.
2. **Onde mora o cron worker** — novo arquivo em `cron-worker/src/` ou adicionar handler num worker existente? Verificar convenção atual no `wrangler.toml` de `cron-worker/`.
3. **Quantos evals iniciais (3 vs 4)** — DoD diz "≥1 por persona core". 3 é mínimo viável; 4º como redundância PER-010 stress (conflito + cover-up combinado) pode trazer sinal extra. Default: 3 em 1.A, 1.B expande pra 4-6.
4. **Lista das 15 personas inline no prompt do classifier** — monta toda vez OU pre-renderiza um string estático e injeta? Default: gera dinamicamente do INDEX.md no startup do worker pra ficar sempre alinhado quando taxonomia mudar.

## Definition of Done — Sub 1.A

- [ ] Audit report `docs/inkflow-agent/reports/2026-05-15-tattoo-audit-baseline.md` commitado com 8 entradas FM
- [ ] 3 eval JSONs criados em `evals/inkflow-agent/directed/tattoo/per-{001,009,010}/`
- [ ] `tests/inkflow-agent/eval-schema-lint.test.mjs` passa
- [ ] `cron-worker/src/persona-inferred-classifier.mjs` implementado
- [ ] `tests/inkflow-agent/persona-classifier.test.mjs` passa
- [ ] Test-persona-classifier sintético passa 4/5
- [ ] Cron worker deployed + dry-run executado em prod com log saudável
- [ ] Cron habilitado, primeiro run real completo (sem error global)
- [ ] Query Supabase confirma `agent_turn_logs.persona_inferred` populado em ≥1 conversa
- [ ] `npm run inkflow-agent:baseline` roda em prod, gera `baseline-report.md`
- [ ] Baseline report commitado, scores reais e próximos passos pra 1.B documentados
- [ ] PR mergeado em main
- [ ] Brainstorm da Sub 1.B agendado/iniciado com baseline como input

## Links

- **Parent spec:** `docs/superpowers/specs/2026-05-15-inkflow-agent-program-design.md` (Seção "Fase 1 — TattooAgent")
- **Manifesto:** `docs/manifesto-tatuador-bot.md`
- **Personas core:**
  - `docs/inkflow-agent/personas/PER-001-curioso-primeira-vez.md`
  - `docs/inkflow-agent/personas/PER-009-indeciso-eterno.md`
  - `docs/inkflow-agent/personas/PER-010-contraditorio.md`
- **Failure modes em escopo de audit:**
  - FM-0001, FM-0003, FM-0004, FM-0005, FM-0008, FM-0009, FM-0011, FM-0012 (todos em `docs/inkflow-agent/failures/`)
- **Prompts atuais do TattooAgent:**
  - `functions/_lib/prompts/coleta/tattoo/decisao.js` (182 linhas — core)
  - `functions/_lib/prompts/coleta/tattoo/exemplos.js` (92 linhas — 8 few-shots)
  - `functions/_lib/prompts/coleta/tattoo/objetivo.js`, `identidade.js`, `contexto.js`, `faq.js`, `few-shot-tenant.js`, `generate.js` (auxiliares)
- **Telemetria existente:**
  - `functions/_lib/telemetry/agent-turn-logger.js` (logger + payload builder)
  - `functions/api/agent/route.js:200-217` (call site — `persona_inferred` passa `null` hoje)
- **Eval harness:**
  - `evals/inkflow-agent/_harness/run.mjs` + `rubric.mjs`
  - `evals/inkflow-agent/_harness/judge-prompts/` (3 prompts)
- **Schema de eval existente referência:** `evals/convs/001_fluxo_padrao.json`
