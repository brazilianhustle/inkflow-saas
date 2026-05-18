---
title: Reestruturação cirúrgica metodologia de eval — invariantes binárias + A/B comparativo
status: ready-to-execute
created: 2026-05-18
context: 3 sub-specs consecutivas em 18/05 (partes 1+2+4) deram DoD FAIL por variância irreduzível de naturalidade
parents:
  - PR #73 (squash a3c4d1a) — fix-eval-instrumentation
  - branch feat/upgrade-judge-sonnet-default (parte 4) — DoD FAIL sonnet judge default
priority: P0
---

# Reestruturação cirúrgica — metodologia de eval

## Motivação empírica (~$1.90 cravados em 2 sessões)

| Sub-spec | Resultado | Custo |
|---|---|---|
| PR #72 sub-spec A (parte 1) — refator manifesto v2 | DoD FAIL 1/6 PASS | ~$0.30 |
| Sub-spec B (parte 2) — pivot + naturalidade | DoD FAIL 0/6 PASS | ~$0.30 |
| PR #73 sub-spec fix-eval-instrumentation (parte 3) | DoD PARTIAL PASS — root cause "juiz Haiku" cravado erroneamente via spike N=3 | ~$1.15 |
| Sub-spec upgrade JUDGE_MODEL sonnet (parte 4) | DoD FAIL 3/3 — falsifica "juiz é o problema" | ~$0.75 |

**Conclusão dura:** o método de iteração (`bot LLM → conversa → judge LLM → nota 0-5 contínua`) produz **0 ganhos mergeable** com naturalidade como métrica primária. Range 1.0 em escala 0-5 = 20% de ruído de medição. Qualquer prompt change com efeito < 1σ vira indistinguível.

**Diagnóstico em uma frase:** o problema não está no juiz, no modelo ou no prompt — está no **método de validação**. Insistir em iterar prompt sem mudar metodologia = continua DoD FAIL.

## Decisão arquitetural

**Reestruturação cirúrgica de 2 frentes**, não reestruturação completa:
- ✅ Frente 1: Invariantes estruturais binárias como **gating** de DoD
- ✅ Frente 2: A/B comparativo metodologia como **template** de sub-specs futuras
- ❌ NÃO entra: ensemble de juízes (4× custo recorrente), dashboards de telemetria (premature), golden test cases (manutenção alta), rubric discreto (perde nuance)

**Razão (sem clientes pagantes):** YAGNI no eval engineering. Adicionar apenas o mínimo que destrava trabalho de prompt futuro.

## Frente 1 — Invariantes estruturais binárias

### Princípio

Em vez de medir **subjetivamente** ("naturalidade=4.2 de 5"), medir **binariamente** ("bot pediu altura antes do handoff? y/n"). Output binário tem **variância 0** em runs determinísticos.

Já temos prova de conceito viva: `tamanho_cm_violations` (hardener D1 do PR #73) — 0 violations em 18 runs (15 Haiku + 3 Sonnet), zero variância. Funciona perfeitamente.

### Mapa dos invariantes a implementar

Cravados a partir do `docs/manifesto-tatuador-bot.md`:

| ID | Invariante | Detecção | Fonte |
|---|---|---|---|
| I-P1 | Bot nunca sugere `tamanho_cm` ao cliente | grep no transcript do bot por padrões numéricos cm próximos a sugestão | P1 manifesto |
| I-P2 | Handoff sempre tem 4 OBR (`descricao_curta`, `local_corpo`, `altura_cm`, `estilo`) | inspect `dados_persistidos` no turn de handoff | P2 + Caminho C Fase 1 schema |
| I-P3 | Bot pede foto **antes** de pedir tamanho/altura em personas onde foto faz sentido | order check nos turns do bot | P3 manifesto |
| I-P4 | Bot não usa anti-patterns "Anotei/Confirmado/Vou anotar/Registrado" em todos os turns | regex no transcript do bot | §4.6 diretriz tom natural |
| I-P5 | Bot tem validação substantiva por turn (não apenas coleta robotizada) | hard: precisa heuristic. Adiar pra fase 2. | P5 manifesto |
| I-P6 | Bot reconhece pivot/indecisão do cliente (não trata como decidido) | detect mudança de tema cliente → bot acknowledge | P6 manifesto |
| I-tamanho_cm | Judge não dá falso-positivo `tamanho_cm` (já implementado) | já no `compute-variance.mjs` | Hardener D1 do PR #73 |

**Estratégia de implementação:** começar pelos **fáceis** (I-P1, I-P4, I-tamanho_cm) que são detectáveis via regex/grep simples. Os complexos (I-P3, I-P5, I-P6) ficam pra Fase 2 desta spec OU exigem helper estatístico LLM-based (custos diferentes).

### Entregáveis Frente 1 (escopo desta sub-spec)

1. **`evals/inkflow-agent/_harness/invariants.mjs`** (novo módulo)
   - Função `checkInvariant(invariantId, transcript, dados_persistidos) → bool`
   - Mapa interno `INVARIANTS = { 'I-P1': checkP1, 'I-P4': checkP4, ... }`
   - Cada checker é função pura: recebe transcript + dados, retorna bool
   - Implementar **3 invariantes fáceis** nesta sub-spec: I-P1, I-P4, I-P2 (schema check)

2. **`evals/inkflow-agent/_harness/compute-variance.mjs`** (atualizar)
   - Adicionar seção `invariants` ao aggregate JSON
   - Per persona: `{ "I-P1": { n: 5, pass: 5, pass_rate: 1.0 }, "I-P4": { ... }, ... }`
   - Manter `tamanho_cm_violations` (renomear pra `I-tamanho_cm` internamente, alias pra retrocompat)

3. **Testes unitários** em `tests/_lib/eval-harness/invariants.test.mjs`
   - Cada checker: 2+ test cases (positive + negative)
   - Transcripts fixture pequenos pra evitar dep externa

4. **Documentação** em `evals/inkflow-agent/_harness/INVARIANTS.md`
   - O que é cada invariante
   - Como adicionar invariante novo
   - Convenção de naming (`I-<código manifesto>`)

5. **Demo** — re-rodar `compute-variance.mjs` nos outputs já existentes:
   - `/tmp/eval-baseline-sonnet-default/` (parte 4)
   - Confirmar que invariantes binárias dão pass_rate consistente entre runs (esperado: 1.0 ou 0.0, não valores intermediários)

### DoD Frente 1

- [ ] `invariants.mjs` tem 3 checkers funcionais (I-P1, I-P2, I-P4)
- [ ] Testes unitários: ≥6 tests (2 per checker), 100% pass
- [ ] `compute-variance.mjs` aggregate.json tem seção `invariants` populada
- [ ] Demo: re-rodar nos outputs existentes mostra pass_rate determinístico (sem variância intra-persona)
- [ ] `INVARIANTS.md` doc escrita
- [ ] Suite local 780/780 pass (este escopo não toca código de produção)

## Frente 2 — A/B comparativo metodologia

### Princípio

Em vez de DoD absoluto ("nat ≥ 4.0"), DoD comparativo ("AFTER mostra diff médio > 1σ vs BEFORE, em IC 95%"). Mesmo método estatístico de **benchmark de performance**.

Razão: variância irreduzível existe (judge não-determinístico + rubric subjetivo). Mas se a variância intrínseca é, say, σ=0.4, então **mudanças de prompt com diff médio > 0.4** ainda são detectáveis estatisticamente.

### Entregáveis Frente 2

1. **`evals/inkflow-agent/_harness/compare-baselines.mjs`** (novo)
   - CLI: `node compare-baselines.mjs <BEFORE_DIR> <AFTER_DIR>`
   - Lê aggregate.json de cada dir
   - Computa per persona:
     - Diff médio nat (`AFTER.media - BEFORE.media`)
     - Pooled std (estimativa conservadora)
     - Diff em sigma (`diff / pooled_std`)
     - Conclusão: `significant` se |diff| > 1.96σ (IC 95%), `noise` caso contrário
   - Output markdown table pra colar no report

2. **Testes unitários** em `tests/_lib/eval-harness/compare-baselines.test.mjs`
   - Test cases: diff grande significant, diff pequeno noise, edge cases (N=1, dirs vazios)

3. **Documentação canonical** em `docs/canonical/methodology/eval-comparative-strategy.md`
   - Quando usar A/B comparativo vs absoluto
   - Template de sub-spec que aplica esse pattern
   - Conceitos: IC 95%, diff sigma, mínimo N=5 por baseline
   - Tabela "qual DoD usar pra qual tipo de mudança"

4. **Demo** — aplicar nos outputs já existentes:
   - BEFORE: baseline Haiku N=5×3 (PR #73)
   - AFTER: baseline Sonnet N=5×3 (parte 4)
   - Saída esperada: "Diff médio mínimo, dentro de IC 95% — `noise`. Confirma DoD FAIL com base estatística rigorosa, não só `range>0.6`."

### DoD Frente 2

- [ ] `compare-baselines.mjs` CLI funcional com markdown output
- [ ] Testes unitários: ≥4 tests, 100% pass
- [ ] Doc canonical escrita em `docs/canonical/methodology/`
- [ ] Demo: comparação Haiku vs Sonnet roda e produz tabela markdown
- [ ] Suite local 780/780 pass

## DoD geral da sub-spec

1. ✅ Frente 1 DoD completa (5 checkpoints)
2. ✅ Frente 2 DoD completa (5 checkpoints)
3. ✅ Custo eval: **$0** (esta sub-spec NÃO roda baseline novo — usa outputs existentes pra demos)
4. ✅ Suite local 780/780 mantém
5. ✅ CI verde no PR

## Plan inline (execução)

Branch: `feat/eval-methodology-cirurgia` (cortada de `main` pós-PR #73 merge — já criada)

| Task | Ação | Modo |
|---|---|---|
| 1 | Spec commit | direto |
| 2 | Implementer + TDD: `invariants.mjs` com 3 checkers + tests | implementer-only |
| 3 | Implementer + TDD: extender `compute-variance.mjs` com seção invariants | implementer-only |
| 4 | Demo Frente 1: re-roda compute-variance em `/tmp/eval-baseline-sonnet-default/` e confirma | direto |
| 5 | `INVARIANTS.md` doc | direto |
| 6 | Implementer + TDD: `compare-baselines.mjs` CLI + tests | implementer-only |
| 7 | `eval-comparative-strategy.md` canonical doc | direto |
| 8 | Demo Frente 2: rodar compare-baselines em Haiku vs Sonnet outputs | direto |
| 9 | Report `docs/inkflow-agent/reports/2026-05-18-eval-methodology-cirurgia.md` com demos colados | direto |
| 10 | Commit final + push branch + `gh pr create` | direto |

Estimativa: **~3-4h sessão concentrada** com subagent-driven-development calibrado. Sem custos OpenAI/Anthropic (esta sub-spec é só código + reuso de outputs existentes).

## Trigger pra atacar

Sessão fresca: `/superpowers:subagent-driven-development docs/superpowers/specs/2026-05-18-eval-methodology-cirurgia-design.md`

OU `/plan` neste spec se quiser validar self-contained primeiro.

## Pós-execução (próximas sub-specs com instrumento sólido)

- Sub-spec C tattoo (já cravada candidates no report parte 2 da sub-spec B): `C.1 playbook §4.7 pós-pivot`, `C.3 audit tom per-010`. Aplicar A/B comparativo + invariantes binárias.
- Caminho C Fase 2 (Cadastro + Proposta strict schema): aplicar mesmo padrão.
- Investigar `top_p: 0` no bot **rebaixa pra P2** — com invariantes binárias gating DoD, variância de naturalidade vira soft signal não-bloqueador.

## Comparação com Opção 3 rejeitada pelo PR #73

Esta sub-spec é uma **versão cirúrgica** da Opção 3 do PR #73 (que era "reforma metodológica completa: test cases ouro, dashboards, review 3 judge prompts").

| Componente Opção 3 PR #73 | Decisão aqui |
|---|---|
| Golden test cases ouro | ❌ não entra — manutenção alta |
| Dashboards de eval | ❌ não entra — premature sem clientes pagantes |
| Review/refator 3 judge prompts | ❌ não entra — variância não é do prompt do juiz |
| **Invariantes estruturais binárias** | ✅ ENTRA (frente 1) |
| **A/B comparativo metodologia** | ✅ ENTRA (frente 2) |
| Ensemble de juízes | ❌ não entra — 4× custo recorrente |
| Rubric discreto (3 buckets) | ❌ não entra — perde nuance |

PR #73 rejeitou Opção 3 com hipótese "root cause é simples (juiz Haiku)" — falsificada na parte 4. Hoje a rejeição não se sustenta. Esta sub-spec é a versão YAGNI da Opção 3 com novos dados.
