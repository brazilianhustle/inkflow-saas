---
title: InkFlow Agent — Fase 1.B — Prompt Iteration TattooAgent
status: ready-to-plan
created: 2026-05-16
owner: leandro
parent_spec: docs/superpowers/specs/2026-05-15-inkflow-agent-program-design.md
parent_phase: Fase 1 — TattooAgent
predecessor_subphase: 1.A — Foundation Hardening (mergeado em main via PR #67 + PR #68)
successor_subphase: 1.C — Edge failures + DoD close (futuro)
companion_obsidian: "[[InkFlow Agent — Fase 1 TattooAgent]]"
---

# InkFlow Agent — Fase 1.B — Prompt Iteration TattooAgent

## Contexto

A **Sub 1.A — Foundation Hardening** foi mergeada em `main` (PR #67 + PR #68). Entregou:

- Audit dos 8 FMs do TattooAgent vs prompts atuais (`docs/inkflow-agent/reports/2026-05-15-tattoo-audit-baseline.md`)
- 3 directed evals JSON em `evals/inkflow-agent/directed/tattoo/per-{001,009,010}/`
- Cron worker de inferência de persona em prod (`cron-worker/src/persona-inferred-classifier.mjs`)
- Baseline rodado contra prompts atuais (`docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md`)
- Fix do harness — orchestrator real, vocabulário canonical, capture de `proxima_acao` (spec `2026-05-15-fix-eval-harness-pipeline-real-design.md`)

O baseline pós-fix expôs **três sinais distintos** que cravam o escopo desta sub-fase:

| Eval | Resultado | Sinal real |
|---|---|---|
| PER-001 happy path | **FAIL** | naturalidade 3.4 < 4.0; 2 violações P2 parciais (4 OBR não estruturados) |
| PER-009 muda-decisão | **ERROR HTTP 500** | validator closure rejeita output do LLM (invariant violation) |
| PER-010 conflito-tamanho | **ERROR HTTP 500** | mesmo padrão |

Nota cravada no baseline:
> "Recomendação atualizada brainstorm Sub 1.B: priorizar redução de invariant-violations (Sub-3.3 reliability) ANTES de mexer em naturalidade/FM-0001. Sem o pipeline confiável, não dá pra medir avanço."

Sub 1.B absorve essa recomendação **sem abandonar prompt iteration**: estrutura híbrida data-driven com diagnose first + fix targeted + iteração informada pelo dado real.

### Decisões cravadas no brainstorm 2026-05-16

1. **Foco**: híbrido — reliability fix + prompt iteration na mesma sub-fase
2. **Estratégia 500s**: diagnose first (1 dia) antes de prescrever fix
3. **Escopo FMs**: data-driven, cap 3 FMs (escolha final pós-diagnose)
4. **DoD**: 3 evals existentes sem HTTP 500 + 2/3 pass thresholds (naturalidade ≥4.0, manifesto ≥0.85, state=1)
5. **Evals novos**: até +2 quando justificável por FM (PER-012 emocional, PER-014 estilo, etc)
6. **Cross-cutting reliability**: tattoo-only por design. Se diagnose mostrar fix transversal, documenta em FM novo + abre spec próprio `Phase 1.5 Reliability Cross-Agent`
7. **Smoke prod manual**: fica pra Sub 1.C — Sub 1.B encerra em re-baseline

## Goals

1. **Eliminar HTTP 500s** nas 3 evals existentes (PER-001, PER-009, PER-010) — pipeline confiável é pré-condição pra medir naturalidade/manifesto/state com sinal real
2. **Fixar até 3 failure modes** do TattooAgent via prompt iteration, com seleção data-driven baseada em reprodução empírica pós-fix de reliability
3. **Expandir até 2 evals novos** pra personas não cobertas (PER-012, PER-014, ou PER-002) quando os FMs em escopo exigirem
4. **Re-baseline final** documentando delta vs Sub 1.A em scores de naturalidade, manifesto e state
5. **Failure entries em `mitigated`** pra cada FM em escopo, com regression test e contramedida documentada
6. **Sem cross-cutting reliability**: se causa raiz dos 500s for transversal (validator shared, `route.js` retry), documenta + abre spec próprio. Sub 1.B segue paralelo só com prompt iteration

## Non-Goals

- Smoke prod manual via WhatsApp real com 3 personas (fica pra Sub 1.C)
- CI gate da eval directed suite (fica pra Sub 1.C)
- Fechar 100% dos FMs do TattooAgent — cap rígido de 3 FMs nesta sub-fase
- Fix transversal de reliability em `route.js` ou validator shared (escape hatch → spec próprio)
- Mexer em CadastroAgent, PropostaAgent ou PortfolioAgent — Sub 1.B é tattoo-only
- Mudança de schema/migration em `agent_turn_logs` ou outras tabelas
- Re-trabalhar o cron worker de persona-inference (Sub 1.A já entregou)
- Validar empiricamente todos os 8 FMs da audit — seleção data-driven implica que alguns ficam fora
- Adicionar evals para personas além de PER-012/014/002 (futuro)

## Arquitetura — 5 fases sequenciais com gates

```
┌─────────────────────────────────────────────────────────────────┐
│ FASE A — Diagnose 500s (1 dia)                                  │
│ Capturar payloads exatos das 500s em PER-009 e PER-010.         │
│ Reproduzir local via run.mjs --debug. Identificar causa raiz:   │
│ prompt fraco / invariante forte demais / retry ausente /         │
│ schema mismatch.                                                 │
│ Saída: docs/inkflow-agent/reports/2026-05-16-tattoo-500s-       │
│         diagnose.md + artefatos JSON.                            │
│ Gate A→B: hipótese de causa raiz documentada + categorizada     │
│ como tattoo-only OU cross-cutting.                              │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ FASE B — Reliability fix (1-2 dias)                              │
│ TATTOO-ONLY (default): ataca em decisao.js/exemplos.js (prompt) │
│   ou invariante de tattoo.js. Aplica fix, roda eval, valida sem │
│   500s.                                                          │
│ CROSS-CUTTING (escape hatch): documenta em FM-00XX novo + abre  │
│   spec próprio `docs/superpowers/specs/2026-05-16-phase1-5-     │
│   reliability-cross-agent-design.md`. Sub 1.B segue só com      │
│   prompt iteration nos FMs que não dependem do fix transversal. │
│ Gate B→C: re-rodada dos 3 evals existentes — 0 erros HTTP 500   │
│ (OU cross-cutting documentado e absorvido por outro spec).      │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ FASE C — Selecionar FMs em escopo (½ dia)                        │
│ Com baseline limpa (sem 500s), scores reais aparecem.           │
│ Cruza priorização da audit (FM-0012 / FM-0011 / FM-0001 top-3)  │
│ com reprodução empírica. Escolhe até 3 FMs.                     │
│ Saída: docs/inkflow-agent/reports/2026-05-16-tattoo-sub1b-      │
│         fm-selection.md (decisão registrada com critérios).     │
│ Gate C→D: lista fechada de 3 FMs + 0-2 evals novos planejados.  │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ FASE D — Prompt iteration (2-3 dias)                             │
│ Para cada FM em escopo:                                          │
│   1. Cria/atualiza eval (se persona não coberta)                │
│   2. Itera prompt (decisao.js / exemplos.js / regras.js)         │
│   3. Roda directed eval do FM até pass thresholds               │
│   4. Roda regression suite — não pode regredir                  │
│   5. Atualiza failure entry no catálogo (open → mitigated)      │
│ Snapshot tests regenerados quando prompt muda.                  │
│ Gate D→E: cada FM em escopo passa eval directed do próprio.     │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ FASE E — Re-baseline final (½ dia)                              │
│ `npm run inkflow-agent:baseline` contra prod com prompts novos. │
│ Gera docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-    │
│ post-sub1b.md.                                                   │
│ Gate E (DoD Sub 1.B): 3 evals existentes 0 erros + 2/3 pass     │
│ thresholds. Até +2 evals novos rodam até o fim.                 │
└─────────────────────────────────────────────────────────────────┘
```

## Componentes e fronteiras

### C1 — Diagnose tooling (Fase A)

**Arquivo**: `scripts/inkflow-agent/diagnose-500s.mjs` (novo)

Captura payload completo das 500s:
- Lê output cru do harness ou roda request curado contra `/api/agent/route` com payload de PER-009/010
- Captura: request body, response status, response body completo, validator error trace, hipótese inicial
- Saída: artefato JSON por 500 (1 arquivo) + sumário markdown consolidado

**Patch dependente**: `evals/inkflow-agent/_harness/run.mjs` — adicionar flag `--capture-500-body` que inclui `response_body_raw` no `report.json` quando status 500.

**Reversível**: `git revert`, zero impacto em prod.

### C2 — Reliability fix (Fase B, depende do diagnose)

**Tattoo-only (default)** — toca um dos:
- `functions/_lib/prompts/coleta/tattoo/decisao.js` (regras R1-R8, §4.x)
- `functions/_lib/prompts/coleta/tattoo/exemplos.js` (few-shots 1-8)
- `functions/_lib/prompts/coleta/tattoo/contexto.js` / `identidade.js` / `faq.js` (auxiliares — só se diagnose apontar)
- `functions/api/agent/agents/tattoo.js` (Zod schema + validator closure do agent)

**Cross-cutting (escape hatch)** — não toca código de tattoo:
- Cria `docs/inkflow-agent/failures/FM-00XX-<slug>.md` documentando o gap
- Cria `docs/superpowers/specs/2026-05-16-phase1-5-reliability-cross-agent-design.md` (spec próprio)
- Sub 1.B continua com prompt iteration nos FMs que não dependem do fix transversal

### C3 — FM selection report (Fase C)

**Arquivo**: `docs/inkflow-agent/reports/2026-05-16-tattoo-sub1b-fm-selection.md`

Tabela cruzando reprodução empírica × audit priority × cobertura prompt × persona. Decisão de 3 FMs registrada com critério. 0-2 evals novos planejados com persona + justificativa.

Pure doc, sem código. Review humano (Leandro) antes da Fase D.

### C4 — Prompt iteration (Fase D)

Cada FM = 1 commit isolado, link ao failure entry no body. Arquivos do prompt do tattoo (`functions/_lib/prompts/coleta/tattoo/`):
- `decisao.js` (regras R1-R8, §4.x — coração da policy)
- `exemplos.js` (8 few-shots — adiciona/edita)
- `contexto.js` / `identidade.js` / `faq.js` (auxiliares, mudar só se gap específico exigir)

Snapshot tests (`tests/prompts/snapshots/coleta-tattoo.txt`) regenerados quando prompt muda. Comando: `npm test -- --update tests/prompts/snapshots/coleta-tattoo.txt`. Diff revisada manualmente antes do commit do snapshot.

### C5 — Eval expansion (subset da Fase D)

0 a 2 novos JSONs em `evals/inkflow-agent/directed/tattoo/per-XXX/01-<cenario>.json`.

Schema = idêntico aos 3 existentes:
- `expected.manifesto_principles_aplicaveis`
- `expected.should_not_contain`
- `expected.should_contain_at_least_one`
- `expected.proxima_acao_esperada`
- `thresholds` (`naturalidade_min`, `manifesto_adherence_min`)

Personas candidatas (decisão final pós-FM-selection):
- **PER-012** (cliente em surto / emocional) — cobre FM-0011
- **PER-014** (estilo indisponível) — cobre FM-0012
- **PER-002** (indeciso explorando) — cobre FM-0001 (modo consultor tardio)

`tests/inkflow-agent/eval-schema-lint.test.mjs` valida.

### C6 — Failure catalog + baseline update (Fase D + E)

Cada FM mitigated → atualiza:
- `docs/inkflow-agent/failures/FM-XXXX-*.md` (status + entrada no `## Histórico`)
- `docs/inkflow-agent/failures/INDEX.md`

Re-baseline final → gera `docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1b.md` via `npm run inkflow-agent:baseline` (re-uso da Sub 1.A).

### Boundaries críticas

- C1 (diagnose) e C2 (fix) são acoplados temporalmente mas separáveis por commit — diagnose pode mergear sem fix (apenas como artefato de aprendizado se cross-cutting)
- C3 (FM selection) é gate documental — sem ele, Fase D não começa
- C4 e C5 são paralelos por FM, sequenciais por commit (cada FM = isolated commit pra facilitar revert)
- C6 fecha a sub-fase — só com re-baseline rodado é que avalia DoD

## Data flow detalhado

### 4.1 Diagnose 500s — payload capturado

```json
{
  "eval_id": "per-010-01-conflito-tamanho",
  "turn_index": 3,
  "request": {
    "url": "https://inkflowbrasil.com/api/agent/route",
    "body": {
      "conversa_id": "...",
      "estado_atual": "coletando_tattoo",
      "client_msg": "queria uma rosa pequena de uns 25cm"
    }
  },
  "response": {
    "status": 500,
    "body": {
      "error": "invariant_violation",
      "reason": "proxima_acao=pergunta but resposta_cliente has no '?'",
      "raw_llm_output": "...",
      "parsed_output": {
        "resposta_cliente": "...",
        "proxima_acao": "pergunta",
        "dados_persistidos": {}
      }
    }
  },
  "validator_layer": "tattoo.js / pergunta_invariant",
  "hypothesis_seed": "prompt_fraco|invariante_forte|retry_ausente|schema_mismatch"
}
```

Saída: 1 arquivo por 500 capturada em `docs/inkflow-agent/reports/2026-05-16-tattoo-500s-diagnose/<eval>-<turn>.json` + sumário `.md` consolidando hipóteses.

### 4.2 FM selection report — formato

```markdown
# Sub 1.B — FM Selection 2026-05-16

**Critério de seleção:** (a) reprodução empírica na baseline pós-fix-reliability,
(b) impacto declarado no catálogo, (c) cap de 3 FMs.

| FM | Reproduz? | Severidade | Cobertura prompt | Persona | Decisão |
|---|---|---|---|---|---|
| FM-0012 estilo indisponível | sim (det) | alta (gap estrutural) | zero | PER-014 (novo eval) | ✅ entra |
| FM-0011 frio em luto | ? | alta | zero | PER-012 (novo eval) | ⏸️ pós-baseline |
| FM-0001 consultor turn 3+ | ? | média | parcial (janela 1-2) | PER-002 | ⏸️ pós-baseline |
| FM-0009 muda decisão | confirmado (was 500) | média | zero | PER-009 (existe) | ✅ entra |
| FM-0003 sugere tamanho | não (mitigated) | baixa | tripla | PER-010 (existe) | ❌ fora |

## FMs em escopo final (3)
1. FM-0012 — entra com novo eval PER-014
2. FM-0011 — entra com novo eval PER-012
3. FM-0009 — entra com eval existente PER-009 (pós-fix)

## Justificativa de exclusão
- FM-0001: não reproduziu em PER-002 sintético (testar em smoke da Sub 1.C)
- FM-0003: cobertura tripla mantém mitigated, regression suite cobre

## Evals novos planejados (2/2 cap)
- evals/inkflow-agent/directed/tattoo/per-014/01-estilo-fora-catalogo.json
- evals/inkflow-agent/directed/tattoo/per-012/01-acolhimento-luto.json
```

> Os FMs e personas acima são **ilustrativos**. Seleção final é registrada no momento da execução da Fase C, baseada em dado empírico.

### 4.3 Failure entry update — status transition

```markdown
## Histórico
- 2026-05-15: catálogo criado (Phase 0)
- 2026-05-16: Sub 1.B — contramedida em commit abc123
  - Adicionado few-shot exemplos.js:NN-MM (PER-014)
  - Regra nova decisao.js:§4.7 — leitura de estilos_oferecidos
  - Status: open → mitigated
  - Regression: evals/inkflow-agent/directed/tattoo/per-014/01-*.json
```

### 4.4 Re-baseline report — formato

Mesmo formato do `2026-05-15-tattoo-baseline.md`. Adiciona seção de diff:

```markdown
## Diff vs baseline 2026-05-15

| eval | nat pre | nat pos | manif pre | manif pos | state pre | state pos | Δ |
|------|---------|---------|-----------|-----------|-----------|-----------|---|
| per-001 | 3.4 | 4.2 | 0.92 | 0.95 | 1 | 1 | ✅ |
| per-009 | (500) | 4.0 | (500) | 0.88 | (500) | 1 | ✅ |
| per-010 | (500) | 4.1 | (500) | 0.92 | (500) | 1 | ✅ |
| per-014 (novo) | — | 4.0 | — | 0.90 | — | 1 | — |
| per-012 (novo) | — | 3.8 | — | 0.80 | — | 1 | (fail nat) |

## DoD check
- 3 evals existentes sem 500s: ✅
- 2/3 pass thresholds: ✅
- Evals novos rodaram até o fim: ✅
```

### 4.5 Contratos reusados (zero mudança)

- Eval JSON schema: idêntico aos 3 existentes (`evals/inkflow-agent/directed/tattoo/per-001/01-happy-path.json`)
- Harness runner: `evals/inkflow-agent/_harness/run.mjs` — só patch leve em C1 pra expor body de 500
- Rubric: `evals/inkflow-agent/_harness/rubric.mjs` — sem mudança

## Error handling

| Fase | Erro | Estratégia |
|---|---|---|
| A — Diagnose | Harness 500 não captura body completo | Patch leve em `run.mjs` adiciona `response_body_raw` ao report. Falha desse patch = bloqueante. |
| A — Diagnose | LLM produz output diferente a cada run (não-determinístico) | Roda diagnose 3× por turno e agrega padrões. Se padrão estável, hipótese sólida; se variável, marca causa como `llm_non_determinism` + ataca via prompt + invariante mais leniente. |
| B — Reliability fix | Fix tattoo-only não elimina 500s após 3ª iteração | Escala pra hipótese cross-cutting → escape hatch (spec próprio). |
| B — Cross-cutting | Diagnose aponta `route.js` ou validator shared | Cria FM-00XX, commita diagnose report, abre spec próprio. Sub 1.B segue paralelo só com prompt iteration. |
| C — FM selection | Nenhum FM reproduz empiricamente além do fix em B | Sub 1.B encerra prematuramente com B + 0 FMs novos. DoD revisto: 3 evals sem 500s + scores melhorados documentados. Sub 1.C absorve FMs. |
| D — Prompt iteration | FM não converge após 3 iterações de prompt | Aborta esse FM, documenta como `intratável-via-prompt` no failure entry, escala pra próxima sub-fase. Os outros FMs seguem. |
| D — Regression suite quebra | Iteração introduziu regressão em snapshot/invariante | Reverte commit do FM, retoma com hipótese revisada. Snapshot regen só se diff for intencional (review humano). |
| E — Re-baseline falha em 2/3 | DoD não bate | Não fecha PR. Decide explicitamente: estender prazo OU reduzir escopo. Não mergeia parcial sem decisão registrada. |

## Testing strategy

| Componente | Testes |
|---|---|
| C1 — Diagnose tooling | Smoke manual contra eval que dá 500. Sucesso = artefato JSON + sumário gerados, hipótese declarada. |
| C2 — Reliability fix tattoo-only | Re-roda 3 evals existentes via harness → 0 erros HTTP 500. Regression suite passa (snapshot tests + invariantes existentes). |
| C3 — FM selection report | N/A (doc). Review humano (Leandro). |
| C4 — Prompt iteration | Pra cada FM: directed eval passa thresholds. Regression suite roda completa após cada commit — não pode regredir. |
| C5 — Evals novos | `tests/inkflow-agent/eval-schema-lint.test.mjs` valida. Dry-run via harness confirma carregamento. |
| C6 — Failure catalog + baseline | `scripts/inkflow-agent/failure-catalog-lint.mjs` (entregue na Sub 1.A) confirma INDEX coerente + links cruzados Persona ↔ Failure ↔ Eval. |

### Gate de merge final (PR Sub 1.B)

- ✅ Regression suite passa (CI)
- ✅ 3 evals existentes rodam sem 500s
- ✅ 2/3 evals existentes pass thresholds (naturalidade ≥4.0, manifesto ≥0.85, state=1)
- ✅ Evals novos (se criados) rodam até o fim
- ✅ Re-baseline report commitado
- ✅ Failure entries dos FMs em escopo: status `open` → `mitigated`
- ✅ Diagnose report commitado (independente de tattoo-only / cross-cutting)

## Rollback strategy

| Componente | Rollback |
|---|---|
| Diagnose docs + harness patch | `git revert` — zero impacto em prod. |
| Reliability fix tattoo-only | `git revert` do commit. Estado prévio (com 500s) é o conhecido; volta pra ele. |
| Prompt iteration por FM | Cada FM = commit isolado. `git revert <commit-fm>` reverte só aquele FM. |
| Evals novos | `git revert` — só remove JSONs. |
| Failure catalog updates | `git revert` — restaura status `open`. |
| Re-baseline report | Doc, sem rollback necessário. |

**Hard guarantee**: Sub 1.B não introduz mudança de schema/migration. Tudo é prompt, eval, doc ou patch leve em harness.

## Riscos e mitigações

| Risco | Prob | Impacto | Mitigação |
|---|---|---|---|
| Diagnose não converge em 1 dia (causa ambígua) | M | M | Cap rígido de 1 dia. Se não convergir, vira hipótese tattoo-only como default + segue. Documenta no diagnose report. |
| Reliability fix é cross-cutting → spec próprio estoura prazo Phase 1 | M | A | Escape hatch documentado. Sub 1.B continua com prompt iteration nos FMs que não dependem do fix. Spec próprio é paralelo. |
| Iteração regride naturalidade de PER-001 (já 3.4) | M | M | Regression suite roda após cada commit. PER-001 happy path é gating — se cair abaixo de 3.0, reverte. |
| LLM-judge tem viés em re-baseline (Haiku 4.5 favorece outputs específicos) | B | M | Comparação direta com baseline pré-Sub-1.B usa MESMO judge e MESMO prompt — viés sistemático cancela. |
| Snapshot tests não regen automaticamente após prompt change | A | B | Plan documenta comando + diff review antes do commit. |
| Cron de persona-inference não classifica conversas pós-fix (agent_version mudou) | B | B | Aceita. Backfill manual via re-run se necessário. |
| Prompt fix quebra invariante de schema (proxima_acao válida mas semanticamente errada) | M | A | Directed eval cobre via `state-transition judge` existente. Falha → não mergeia. |
| 2 evals novos exigem prompts de judge específicos | B | B | Reuse dos 3 judges existentes. `manifesto_principles_aplicaveis` no eval JSON guia o judge. |
| Custo Anthropic explode | B | B | Cap declarado: ~$2-3 USD pra Sub 1.B inteira. Cap mensal de $50 já no spec do programa. |
| Re-baseline tem flake entre runs (judge inconsistente) | M | M | Roda 2× a re-baseline final, tira mediana se diff >0.3 entre runs. Decisão registrada no report. |

## Open questions (decidir no `/plan`)

1. **Diagnose tooling — patch no harness vs script separado?** Default: patch leve em `run.mjs` (flag `--capture-500-body`) + script de extração pós-processo. Decidir se vale separar.
2. **Snapshot tests — regen automático em CI ou commit manual?** Default: commit manual com diff review. Plan confirma comando exato.
3. **Eval flake mitigation — quantas amostras?** Default: 2 runs com mediana se diff >0.3. Pode subir pra 3 se Fase E mostrar instabilidade alta.
4. **Cross-cutting reliability — slug do spec próprio?** Default: `docs/superpowers/specs/2026-05-16-phase1-5-reliability-cross-agent-design.md`.
5. **Failure entries — adicionar campo `commit_hash` no template ou só linkar via histórico textual?** Default: histórico textual (status quo Sub 1.A).
6. **PR strategy** — 1 PR único Sub 1.B inteira, ou PR por fase? Default: 1 PR único com commits separados internamente.

## Definition of Done — Sub 1.B

- [ ] Diagnose report commitado em `docs/inkflow-agent/reports/2026-05-16-tattoo-500s-diagnose.md` com causa raiz declarada
- [ ] Reliability fix aplicado (tattoo-only) OU FM-00XX novo + spec cross-cutting criado
- [ ] 3 evals existentes (PER-001, PER-009, PER-010) rodam sem HTTP 500
- [ ] FM selection report commitado em `docs/inkflow-agent/reports/2026-05-16-tattoo-sub1b-fm-selection.md`
- [ ] Até 3 FMs com fix aplicado (prompt iteration)
- [ ] Até 2 evals novos criados em `evals/inkflow-agent/directed/tattoo/per-XXX/` (eval-schema-lint passa)
- [ ] Failure entries dos FMs em escopo: status `open` → `mitigated`
- [ ] Re-baseline report commitado em `docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1b.md`
- [ ] DoD da re-baseline: 3 existentes sem 500s + 2/3 pass thresholds
- [ ] Regression suite passa em CI
- [ ] PR mergeado em main
- [ ] Brainstorm da Sub 1.C agendado com re-baseline como input

## Estimativa

| Fase | Estimativa |
|---|---|
| A — Diagnose | 1 dia |
| B — Reliability fix (tattoo-only) | 1-2 dias |
| C — FM selection | ½ dia |
| D — Prompt iteration (3 FMs + até 2 evals novos) | 2-3 dias |
| E — Re-baseline final | ½ dia |
| **Total** | **5-7 dias úteis** |

Cap superior (7 dias) absorve escape hatch cross-cutting parcial. Acima disso, vira Sub 1.B.2.

## Links

- **Parent spec**: `docs/superpowers/specs/2026-05-15-inkflow-agent-program-design.md`
- **Predecessor spec**: `docs/superpowers/specs/2026-05-15-inkflow-agent-phase-1a-tattoo-foundation-design.md`
- **Harness fix spec**: `docs/superpowers/specs/2026-05-15-fix-eval-harness-pipeline-real-design.md`
- **Manifesto**: `docs/manifesto-tatuador-bot.md`
- **Reports da Sub 1.A**:
  - `docs/inkflow-agent/reports/2026-05-15-tattoo-audit-baseline.md`
  - `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md`
  - `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline-pre-fix.md`
- **Personas core**:
  - `docs/inkflow-agent/personas/PER-001-curioso-primeira-vez.md`
  - `docs/inkflow-agent/personas/PER-009-indeciso-eterno.md`
  - `docs/inkflow-agent/personas/PER-010-contraditorio.md`
  - `docs/inkflow-agent/personas/PER-012-cliente-em-surto.md` (candidato a eval novo)
  - `docs/inkflow-agent/personas/PER-014-estilo-indisponivel.md` (candidato a eval novo)
- **Failure modes em escopo potencial**: FM-0001, FM-0003, FM-0008, FM-0009, FM-0011, FM-0012 (todos em `docs/inkflow-agent/failures/`)
- **Prompts atuais do TattooAgent** (`functions/_lib/prompts/coleta/tattoo/`):
  - `decisao.js`, `exemplos.js`, `contexto.js`, `identidade.js`, `objetivo.js`, `faq.js`, `few-shot-tenant.js`, `generate.js`
- **Agent + validator closure**: `functions/api/agent/agents/tattoo.js`
- **Eval harness**:
  - `evals/inkflow-agent/_harness/run.mjs` + `rubric.mjs`
  - `evals/inkflow-agent/directed/tattoo/per-{001,009,010}/`

## Origem

- Brainstorm 2026-05-16 com Leandro (founder + tatuador profissional)
- Branch alvo: `feat/sub-1b-prompt-iteration-tattoo` (base `main` commit `3026ddd`)
- Baseline empírico cravado na Sub 1.A é input central pra todas as decisões
- Memory relevantes: `[[InkFlow Agent — Visão (2026-05-15)]]`, `[[feedback_qualidade_sobre_pressa]]`, `[[feedback_padrao_mercado]]`
