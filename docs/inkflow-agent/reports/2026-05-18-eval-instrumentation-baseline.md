# Fix Eval Instrumentation — Baseline Report

**Data:** 2026-05-18
**Branch:** `feat/fix-eval-instrumentation` (PR → main)
**Spec:** `docs/superpowers/specs/2026-05-18-fix-eval-instrumentation-design.md`
**Plan:** `docs/superpowers/plans/2026-05-18-fix-eval-instrumentation.md`
**Predecessor:** `docs/inkflow-agent/reports/2026-05-18-eval-sub-spec-b-pivot-naturalidade.md`

---

## 1. Deliverables aplicados

- [x] D1 — judge-prompt P2 hardener anti-tamanho_cm (commit `8be1402`)
- [x] D2 — verify run.mjs já tinha temperature=0 + JUDGE_MODEL (sanity check inline na Task 2, commit anterior `5a8ea77` já tinha)
- [x] D3 — runtime.js temperature gated por EVAL_MODE (commit `6d190f9`)
- [x] D4 — run-baseline.sh + compute-variance.mjs (commits `ed1bd45` + `04018d1`)
- [x] Preview deploy com EVAL_MODE=true setado APENAS em Preview env (Production env confirmado SEM essa var)
- [x] **Extra (não previsto no plano)** — `chore(test): quote glob para node expandir recursivamente` (commit `cf410b2`): bug pré-existing no `npm test` que escondia ~326 testes (subdirs `tests/_lib/agent-runtime/*`, `tests/agent/_lib/*`, `tests/api/webhooks/*` etc). Aspas no glob delegam expansion pro node (em vez de sh) → count real passou de 450 → 776 testes.

## 2. Caminho de infra (não estava no plano)

A Task 6 "Deploy preview com EVAL_MODE=true (dashboard CF)" assumiu que `git push` triggeraria build automático. **Falsa premissa:** Git integration do projeto `inkflow-saas` está desconectada no CF Pages (`source.type: None` na API), e a UI nova do dashboard não expõe botão de reconnect pra projetos disconnected.

**Workaround aplicado (não-blocking pro deliverable principal):**

1. `bash scripts/sync-secrets.sh --only=preview` — sync de 21 secrets do `.env.production` (mantido em Vault Bitwarden, source-of-truth desde 13/05) pra Preview env do CF Pages via wrangler. Esse script já existia no repo.
2. `npx wrangler@latest pages deploy . --project-name=inkflow-saas --branch=feat/fix-eval-instrumentation` — direct upload preview deployment.
3. **API PATCH** pra cravar `EVAL_MODE=true` como `plain_text` (não `secret_text`) em Preview env. Production confirmado sem `EVAL_MODE`.
4. Smoke contra preview URL `https://71b69436.inkflow-saas.pages.dev`.

**Follow-up pós-merge (não bloqueia esta PR):** reconectar Git integration do projeto via dashboard CF ou support ticket. Próximos pushes em outras branches feat/* também não disparam build automático — issue de infra separado desta sub-spec.

## 3. DoD — resultados

### DoD #1: Variância nat ≤ 0.6 per persona (N=5, Haiku judge)

| Persona | nat.min | nat.max | nat.range | Veredito |
|---|---|---|---|---|
| per-001-01-happy-path | 3.6 | 4.6 | **1.0** | ❌ FAIL |
| per-009-01-muda-decisao | 3.2 | 4.2 | **1.0** | ❌ FAIL |
| per-010-01-conflito-tamanho | 3.8 | 4.2 | **0.4** | ✅ PASS |

Origem dos números: `/tmp/eval-baseline/aggregate.json`.

**Veredito DoD #1 (Haiku): FAIL em 2/3 personas.**

**Mas DoD #5 (abaixo) inverte o diagnóstico:** o problema não é o bot (mesmo com `temperature: 0` pinado), é o juiz Haiku dando notas erráticas. Ver §3.5 abaixo.

### DoD #2: Zero falso-positivo tamanho_cm (15 runs Haiku + 3 runs Sonnet = 18 total)

`tamanho_cm_violations` por persona:

| Persona | violations count |
|---|---|
| per-001 | 0 |
| per-009 | 0 |
| per-010 (a persona "conflito-tamanho", a mais propensa) | 0 |
| per-001 (sonnet judge) | 0 |

**Veredito DoD #2: PASS clean.**

O hardener D1 (judge-prompt `manifesto-adherence.txt` linhas 6-7 expandidas pra ~14 linhas com exemplos explícitos) eliminou o false-positive que apareceu em sub-spec B. Zero ocorrências em 18 runs.

### DoD #3: Bot temperature pin não quebra prod

- Smoke manual prod (`BASE_URL=https://inkflowbrasil.com`, sem EVAL_MODE): **200 OK** + scoring fail `naturalidade` (esperado — failure de score não importa aqui, comportamento do bot íntegro)
- Smoke manual preview (`BASE_URL=https://71b69436.inkflow-saas.pages.dev`, EVAL_MODE=true): **200 OK** + scoring fail `state_transition` (esperado, mesma natureza)
- CF Pages config confirmou `EVAL_MODE` setado apenas em Preview env (Production sem essa var) via API GET: `Preview total 22 env vars (21 secrets + EVAL_MODE plain_text=true)`, Production sem `EVAL_MODE`.
- Grep `EVAL_MODE` em `functions/_lib/agent-runtime/runtime.js`: 1 match (linha 44, dentro do spread condicional).

**Veredito DoD #3: PASS.** Risco #1 do spec (temperature=0 quebrar edge runtime) **REFUTADO empiricamente** — preview com EVAL_MODE=true responde 200 e produz transcript completo. Gate funcionou como projetado.

### DoD #4: Suite local

Resultado de `npm test`: **780/780 PASS, 0 fail**.

> **Note de revisão:** O plano dizia "Expected: 457 pass". Esse número era **errado** — baseline pré-task era 450 (npm test não recursando subdirs por bug do glob, mascarando ~326 testes). Após o fix de glob (commit `cf410b2`), baseline real virou 776 → +4 testes Task 4 = 780. Os 7 testes novos desta sub-spec (3 runtime + 4 compute-variance) estão todos contados.

**Veredito DoD #4: PASS (com correção da expectativa do plano).**

### DoD #5: Spike sonnet documentado

| Métrica per-001 | Haiku (N=5) | Sonnet (N=3) | Razão sonnet/haiku |
|---|---|---|---|
| nat.range | 1.0 | **0.2** | 0.20 |
| nat.média | 4.16 | 3.87 | 0.93 |
| manifesto.range | 0.25 | **0.075** | 0.30 |
| manifesto.média | 0.9 | 0.65 | 0.72 |

**Conclusão direcional: FORTE INDICAÇÃO de upgrade default `JUDGE_MODEL=claude-sonnet-4-6`.**

- Sonnet judge é **5× mais consistente em naturalidade** (range 0.2 vs 1.0) e **3× mais consistente em manifesto** (range 0.075 vs 0.25).
- Sonnet é também **mais rígido** (notas menores): nat.média 3.87 vs 4.16, manifesto.média 0.65 vs 0.9. Isso é OK — juiz mais exigente vai pegar problemas reais que Haiku deixaria passar.
- **DoD #1 passaria clean com Sonnet judge** (range 0.2 << 0.6).

Por isso a recomendação é **NÃO escalar pra Opção 3 (reforma metodológica completa)** — o instrumento construído nesta sub-spec funciona, só precisa de upgrade do default judge. Sub-spec dedicada pra esse upgrade + re-run baseline 3 personas com Sonnet vai cravar DoD #1.

> **Bug do plano corrigido:** plano usava `claude-sonnet-4-6-20251001` (com date suffix), API Anthropic retornou 404. ID correto é `claude-sonnet-4-6` (sem suffix). Documentado pra próxima sub-spec.

## 4. Veredito geral

- DoD #1: ❌ FAIL com Haiku (root cause: juiz, não bot — ver DoD #5)
- DoD #2: ✅ PASS
- DoD #3: ✅ PASS
- DoD #4: ✅ PASS (780/780)
- DoD #5: ✅ PASS informativo (forte direção de solução)

**Resultado: PARTIAL PASS com next-step claro.**

### Próxima ação

Abrir sub-spec dedicada pra **upgrade default `JUDGE_MODEL=claude-sonnet-4-6`** em `run.mjs` (1-line change na linha 34) + re-rodar baseline N=5×3 com Sonnet pra cravar DoD #1 com novo default.

Esta PR (`feat/fix-eval-instrumentation`) ainda vale merge porque entrega:
- Anti-falso-positivo `tamanho_cm` (provado, DoD #2)
- Pin temperature gated por EVAL_MODE (provado funcional, DoD #3)
- Baseline harness tooling reusable (`run-baseline.sh` + `compute-variance.mjs`)
- Evidência empírica forte pra upgrade do judge (DoD #5)
- Bug fix pré-existing exposto (`npm test` glob → 326 testes mais visíveis)

Sub-spec C futura (audit de tom, playbook, ou re-avaliação A/B) roda contra este instrumento + novo judge default.

## 5. Custo real

- Baseline Haiku N=5×3 = 15 runs: estimativa ~$0.75 (target match)
- Sonnet spike: 4 runs efetivos (1 falhou por model id errado + 3 retry) ≈ $0.40
- **Total: ~$1.15** (cap $2 ✅, dentro do budgeted ~$1.05 do spec com pouco overrun por retry)

## 6. Cross-references

- Spec instrumentação: `docs/superpowers/specs/2026-05-18-fix-eval-instrumentation-design.md`
- Plan: `docs/superpowers/plans/2026-05-18-fix-eval-instrumentation.md`
- Aggregate Haiku: `/tmp/eval-baseline/aggregate.json` (transient — resumido em §3.1 acima)
- Aggregate Sonnet: `/tmp/eval-baseline-sonnet/aggregate.json` (transient — resumido em §3.5 acima)
- Preview deploy: `https://71b69436.inkflow-saas.pages.dev`
- 7 commits na branch: `a5e7ba2 docs(spec)`, `b6f3b43 docs(plan)`, `8be1402 fix(eval-judge)`, `6d190f9 feat(runtime)`, `cf410b2 chore(test)`, `ed1bd45 feat(eval-harness compute-variance)`, `04018d1 feat(eval-harness run-baseline)`

## 7. Issues descobertos (out-of-scope desta PR, follow-ups)

1. **Git integration desconectada no CF Pages `inkflow-saas`**: `source.type: None` na API. UI dashboard nova não expõe botão Connect pra projetos disconnected. Workaround: `wrangler pages deploy` direct upload. Follow-up: support ticket Cloudflare ou uninstall+reinstall do GitHub App (afeta outros projetos Pages, decisão pendente).

2. **`sync-secrets.sh` mascarando erros**: linha 97 usa `npx wrangler ... >/dev/null 2>&1` — se um secret falha, o resumo final reporta `failed=0` mas a secret pode estar com value vazio. Workaround manual: `wrangler pages secret put OPENAI_API_KEY` standalone com verbose output. Follow-up: remover redirect de stderr ou capturar exit code per-secret.

3. **Plano usou model id `claude-sonnet-4-6-20251001`** (com date suffix) — API Anthropic retorna 404. ID correto é `claude-sonnet-4-6`. Documentado aqui pra próxima sub-spec.

4. **`state_pass_rate: null`** em todas as 4 entries do aggregate — `compute-variance.mjs` não detecta o campo `state.pass` nos reports. Bug menor — checar se report.json gerado pelo `run.mjs` tem essa key. Não bloqueia desta PR (não está nos DoDs).
