---
title: InkFlow Agent — Fase 1.C — TattooAgent reliability fix (gpt-4o)
status: ready-to-plan
created: 2026-05-16
owner: leandro
parent_spec: docs/superpowers/specs/2026-05-15-inkflow-agent-program-design.md
parent_phase: Fase 1 — TattooAgent
predecessor_subphase: 1.B — Prompt iteration TattooAgent (mergeado em main via PR #69)
successor_subphase: 1.D — Avenida estrutural alternativa (futuro, condicional a DoD falhar)
companion_obsidian: "[[InkFlow Agent — Fase 1 TattooAgent]]"
---

# InkFlow Agent — Fase 1.C — TattooAgent reliability fix (gpt-4o)

## Contexto

A **Sub 1.B — Prompt Iteration TattooAgent** foi mergeada em `main` (PR #69, merge commit `d138c09`, 10 commits granulares preservados via no-squash). Entregou:

- **R9 — acoplamento decisão↔texto** em `decisao.js` + Exemplo 9 em `exemplos.js` (commit `18a48a9`). Validator endureceu: rejeita output quando `proxima_acao=pergunta + campos_faltando=[X] + texto sem '?'`.
- 3 iterações de policy-de-coleta tentadas e revertidas (R10 anti-repergunta, R11 substituir+validar, §4.6 modo consultor ampliado). FM-0005/0009/0001 marcados `intratável-via-prompt`.
- Re-baseline 2× contra preview revelou **trade-off explícito do R9**: qualidade quando passa subiu (PER-010 nat 2.6→4.2, state 0→1; PER-001 nat 3.4→3.8) **ao custo de reliability** (~33% rate HTTP 500 em PER-001 e PER-010).
- DoD oficial **FAIL**: 0/3 pass thresholds, 33% 500 rate.
- Decisão Leandro: opção (c) — entregar como está com nota explícita, Sub 1.C ataca reliability via avenidas estruturais.

Detalhes em `docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1b.md`.

### Padrão estrutural confirmado (aprendizado-chave Sub 1.B)

Três iterações consecutivas com regras semanticamente diferentes produziram a MESMA assinatura de falha — PER-001 happy path regride sob qualquer policy-de-coleta nova no `gpt-4o-mini`. R9 (invariante de OUTPUT) é a única vitória de prompt porque trata propriedade estrutural do output, não policy de coleta.

**Implicação:** prompt iteration sozinho tem teto no `gpt-4o-mini` para TattooAgent.

### Decisões cravadas no brainstorm 2026-05-16

1. **Critério de sucesso**: fechar o reliability gap — 0% 500s em PER-001/009/010, qualidade Sub 1.B preservada.
2. **Escopo**: 1 avenida cravada (PR único). Falha → fecha Sub 1.C, abre Sub 1.D.
3. **Avenida escolhida**: (a) mudança de modelo. (b) schema/Zod limitação regex; (c) sub-sistemas refator grande atacando raiz errada; (d) NO-CHANGE control não fixa 500s.
4. **Modelo concreto**: `gpt-4o` (full, mesmo provider OpenAI). claude-haiku-4-5 fica como alternativa em Sub 1.D se gpt-4o falhar OU se custo virar bloqueio.
5. **Mudança aplica só ao TattooAgent**. Cadastro/Proposta/Portfolio continuam `gpt-4o-mini`.

## Objetivo

Zerar HTTP 500s do TattooAgent em PER-001/009/010 sob R9, mantendo qualidade Sub 1.B (não regredir nat/manif/state).

**Mecanismo:** swap de modelo `gpt-4o-mini → gpt-4o` no TattooAgent. Mudança mínima, reversível em 1 commit.

## Escopo

### In scope

- Edit em `functions/api/agent/agents/tattoo.js:124` — model swap.
- Comment inline justificando desvio do padrão `gpt-4o-mini`.
- Re-baseline 2× contra preview deploy (3º run condicional se flake).
- Report comparativo `docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1c.md` documentando resultado vs Sub 1.B trade-off.
- Plan B documentado pra DoD falhar.
- Decisão de custo de produção registrada como follow-up (não decidida nesta sub).

### Out of scope

- CadastroAgent / PropostaAgent / PortfolioAgent (continuam `gpt-4o-mini` intactos).
- Refator de schema (avenida b), sub-sistemas (avenida c), persona NO-CHANGE control (avenida d).
- Mudança de prompt — R9 e todo o trabalho do Sub 1.B preservados.
- Decisão final sobre adotar `gpt-4o` permanente em produção (vira follow-up no backlog pós-DoD positivo).
- Híbrido mini+fallback gpt-4o (otimização futura, fora de escopo desta sub).
- Cadastro/Proposta/Portfolio em gpt-4o (só se houver evidência específica de problema).

## Definition of Done

### Bate (DoD ✅)

- **0 HTTP 500** em 6 execuções (3 evals × 2 runs) contra preview deploy.
- **Naturalidade preservada** por eval:
  - PER-001 ≥ 3.8
  - PER-009 ≥ 3.8
  - PER-010 ≥ 4.2
- **Manifesto ≥ 0.83** em todos os 3 evals.
- **State preservado**: PER-010 mantém =1; PER-001/009 mantêm =0 (não-handoff esperado nesses cenários).

### Falha (DoD ❌ → Plan B)

DoD é binária. Qualquer resultado que NÃO bate todos os critérios da seção "Bate" cai aqui. Em particular:

- ≥1 HTTP 500 em qualquer das 6 execuções.
- Naturalidade abaixo do threshold em qualquer eval (PER-001 < 3.8, PER-009 < 3.8, PER-010 < 4.2).
- Manifesto < 0.83 em qualquer eval.
- State divergiu do esperado em qualquer eval.

Não há zona cinza — se algum critério ficou a 0.05 do threshold, ainda é DoD ❌. Resultados intermediários ricos viram entrada da decisão "qual avenida Sub 1.D" mas não promovem o PR.

### Tratamento de flake

- 2 runs como padrão. Se diff > 0.3 em qualquer dimensão entre runs, roda 3º run.
- Cap rígido: **máximo 3 runs por eval = 9 execuções totais** antes de declarar resultado.
- Mediana onde aplicável (paridade Sub 1.B Task 6).

## Mudança técnica

### Edit único de produção

```diff
// functions/api/agent/agents/tattoo.js:124
   const agent = new Agent({
     name: 'tattoo-agent',
-    model: 'gpt-4o-mini',
+    model: 'gpt-4o',
     instructions,
     tools: [],
     outputType: TattooOutputSchema,
   });
```

**Apenas isso muda em código de produção.** Schema, validator, prompt, route.js, _lib — tudo preservado.

### Comment inline a adicionar

Linha próxima à mudança ganha justificativa curta:

```js
// Sub 1.C: gpt-4o pra zerar 500s sob R9 (validator-rejection ~33% no mini).
// Outros agents (cadastro/proposta/portfolio) continuam gpt-4o-mini.
// Decisão de custo permanente pendente (ver backlog).
model: 'gpt-4o',
```

### Documentação a criar

- `docs/superpowers/specs/2026-05-16-sub-1c-tattoo-reliability-gpt4o-design.md` (este spec).
- `docs/superpowers/plans/2026-05-16-sub-1c-tattoo-reliability-gpt4o.md` (gerado via `/plan` depois).
- `docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1c.md` (gerado após re-baseline).

### Suíte de testes existente

443/443 unit tests devem continuar verde sem alteração — não estamos tocando lógica testada por unit tests. Smoke é o eval harness (não unit suite).

## Procedimento — re-baseline

Paridade com Sub 1.B Task 6:

1. **Deploy preview da branch:**
   ```bash
   npx wrangler pages deploy . \
     --project-name=inkflow-saas \
     --branch=feat/sub-1c-tattoo-reliability-edge-failures \
     --commit-dirty=true
   ```
   Preview URL alias: `https://feat-sub-1c-tattoo-reliability.inkflow-saas.pages.dev` (ou similar, conforme branch slug).

2. **Re-baseline 2×:**
   ```bash
   BASE_URL=<preview-url> npm run inkflow-agent:baseline   # run 1
   BASE_URL=<preview-url> npm run inkflow-agent:baseline   # run 2
   ```

3. **3º run condicional** se diff > 0.3 em qualquer dim entre run 1 e run 2.

4. **Headers Cloudflare Access** via env já configurados em `evals/.env` (Service Token rotacionado em Sub 1.B parte 4, ainda válido).

5. **Pré-flight no início:** smoke test `curl -I` no preview URL com headers Access pra confirmar 401 não acontecendo (Service Token vivo). Se expirou, rotacionar antes.

## Riscos + mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| gpt-4o não zera 500s (modelo maior ainda quebra invariante) | ~20% | Plan B: rollback + Sub 1.D. Aprendizado capturado no report mesmo se falhar. |
| Qualidade regride (nat/manif pior que mini sob R9) | ~10% | DoD pega via thresholds. Se acontecer, sinal estrutural forte → Sub 1.D investiga schema/Zod. |
| Latência ↑ (gpt-4o ~1.5-2× lento) | ~70% | Não bloqueia DoD (eval harness não mede latência). Decisão de produção pós-DoD. Se virar gatilho pra UX, vira FM novo. |
| Custo de produção 16× (gpt-4o vs mini) | Cravado se DoD bater | NÃO decidido nesta sub. Vira follow-up: "Adotar gpt-4o permanente vs híbrido mini+fallback" — decisão de produto pós-evidência. |
| Custo de re-baseline estoura cap $3 | ~5% | 3-run cap rígido. Monitorar em tempo real e abortar 4º run se > $2 acumulado. |
| OpenAI Agents SDK comportamento diferente sob gpt-4o (ex: structured output mais estrito quebra outros agents) | ~5% | Só TattooAgent muda. Outros agents continuam mini intactos. Smoke harness é único surface de risco — se quebrar, reverte. |
| Service Token CF Access expirou | ~5% | Pré-flight `curl -I` no preview no início. Rotacionar se 401. |
| Rate limit OpenAI no gpt-4o | ~3% | Eval roda 6 turnos × ~3-8 mensagens = ~50 chamadas total. Bem abaixo de qualquer rate limit razoável. Se acontecer, retry-with-backoff manual. |

**Assumption registrada:** sem ajuste de timeout no harness — gpt-4o latência maior cabe nos defaults atuais. Se 6 runs derem timeout antes de 500, vira sinal e ajustamos.

## Esforço + custo

### Esforço

| Etapa | Tempo |
|---|---|
| Edit + comment inline | ~10 min |
| Deploy preview + setup env | ~20 min |
| Re-baseline 2× (+ eventual 3º run) | ~40-60 min wall clock (eval em background) |
| Análise + decisão DoD | ~30 min |
| Report `2026-05-16-tattoo-rebaseline-post-sub1c.md` | ~30 min |
| PR (push, descrição, CI watch, merge) | ~30 min |
| **Total** | **~3-4h** (~1h ativo + ~2-3h em background) |

### Custo

| Item | Estimativa |
|---|---|
| Re-baseline gpt-4o driver (6 exec × ~8 turnos × ~500 tokens IO) | ~$1.50 |
| Judge claude-haiku-4-5 (preservado) | ~$0.30 |
| 3º run condicional + buffer | ~$0.50 |
| **Total cap** | **~$2.50** |

## Estrutura PR

**Branch:** `feat/sub-1c-tattoo-reliability-edge-failures` (já criada).

**Commits granulares planejados** (no-squash interno, squash externo):

1. `docs: spec sub-1c gpt-4o reliability fix design`
2. `docs: plan sub-1c gpt-4o reliability fix`
3. `fix(tattoo-agent): swap gpt-4o-mini → gpt-4o pra zerar 500s sob R9`
4. `docs(report): re-baseline post sub 1c gpt-4o`

**Squash policy:** **squash-merge** desta vez. Sub 1.B usou no-squash por preservar revert granular de 10 commits. Aqui são 4 commits e o fix é 1 linha — squash mantém main history limpo. Revert vira `git revert <merge-commit>` se necessário.

**Trigger do merge:**

- DoD ✅ + Leandro aprovar review → squash-merge em main.
- DoD ❌ → decisão de PR na hora: (a) PR informativo zero-code-change com report como evidência, ou (b) descartar branch local.

## Plan B (DoD ❌)

1. **Rollback** `model: 'gpt-4o-mini'` (1 commit revert do fix).
2. **Report final** documenta números observados em `2026-05-16-tattoo-rebaseline-post-sub1c.md` + decisão de scoping (similar protocolo Sub 1.B parte 4).
3. **Fecha Sub 1.C** com diagnóstico: "modelo gpt-4o não-suficiente para zerar 500s sob R9".
4. **Abre Sub 1.D** atacando próxima avenida em ordem ROI:
   - (b) schema/Zod discriminated union, OU
   - (β) claude-haiku-4-5 via integração custom (LiteLLM proxy ou model provider custom).
5. **Branch fica fechada** com PR informativo (zero code change merged) OU descartada — Leandro decide na hora.

## Follow-ups

Estes itens **NÃO entram** nesta sub, viram backlog conforme resultado:

- **Pós-DoD ✅:** "Adotar gpt-4o permanente vs híbrido mini+fallback" → backlog P1. Decisão de produto pós-evidência de custo real em prod.
- **Pós-DoD ❌:** "Sub 1.D — schema/Zod ou claude-haiku-4-5" → backlog P0 imediato.
- **Independente do DoD:** Cadastro/Proposta/Portfolio em gpt-4o — fora de escopo até evidência específica de problema nesses agents.

## Decisões pendentes (não bloqueiam exec)

| Decisão | Quando decidir |
|---|---|
| Adotar gpt-4o permanente em prod? | Pós-DoD ✅, com evidência de custo real (não só estimativa). |
| Ajustar timeout do harness pra latência gpt-4o? | Durante re-baseline, se observar timeouts. |
| Estrutura de Sub 1.D (qual avenida em ordem)? | Pós-DoD ❌, com resultado concreto da Sub 1.C como entrada. |

## Artefatos referenciados

- Spec Sub 1.B: `docs/superpowers/specs/2026-05-16-sub-1b-prompt-iteration-tattoo-design.md`
- Plan Sub 1.B: `docs/superpowers/plans/2026-05-16-sub-1b-prompt-iteration-tattoo.md`
- Re-baseline Sub 1.B (entrada principal): `docs/inkflow-agent/reports/2026-05-16-tattoo-rebaseline-post-sub1b.md`
- Diagnose 500s Fase A: `docs/inkflow-agent/reports/2026-05-16-tattoo-500s-diagnose.md`
- FM selection report: `docs/inkflow-agent/reports/2026-05-16-tattoo-sub1b-fm-selection.md`
- Failures atualizados pós Sub 1.B: `FM-0005`, `FM-0009`, `FM-0001`
- TattooAgent atual: `functions/api/agent/agents/tattoo.js`
- Schema atual: `TattooOutputSchema` em `tattoo.js:29-56`
- Validator atual: `validateTattooOutputInvariant` em `tattoo.js:64-111`
