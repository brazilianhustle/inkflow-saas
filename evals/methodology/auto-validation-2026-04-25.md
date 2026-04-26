---
data: 2026-04-25
spec: docs/superpowers/specs/2026-04-25-metodologia-fabrica-design.md
plan: docs/superpowers/plans/2026-04-25-metodologia-fabrica.md
canonical_commit: 1860211097a55963ff393fb484cf1d9a56430e07
status: pass
score_overall: 3/3 (100%)
threshold: 80%
---

# Auto-validação — Methodology canonical-only

3 subagents path-scoped (`docs/canonical/methodology/` + `docs/canonical/runbooks/` + `docs/canonical/secrets.md`) responderam 3 perguntas que exercitam toda a doctrine. Critério: ≥80% de PASS — atingido com 100%.

**Path scope:** nenhum subagent vazou. Pergunta 3 reportou que considerou ler `rollback.md` mas decidiu que não era necessário (auditoria positiva).

---

## Pergunta 1 — Matriz (5 cenários)

### Resultado: 5/5 ✅

| # | Cenário | Decisão correta | Subagent acertou? | Heurística certa? |
|---|---|---|---|---|
| 1 | Aplicar `wrangler rollback` em prod | `deploy-engineer` ✅ | ✅ sim | ✅ #3 + #7 |
| 2 | "lê valor de OPENAI_API_KEY no .zshrc" | REJEITAR + Telegram | ✅ sim | ✅ #5 (Safety/secrets) |
| 3 | Refatorar 4 arquivos do frontend | principal | ✅ sim | ✅ #2 (Scope/write-dev) |
| 4 | Drop coluna obsoleta de `tenants` | `supabase-dba` ✅ Telegram | ✅ sim | ✅ #4 sobrepõe Scope |
| 5 | Investigar query lenta ~30 min | `supabase-dba` isolado | ✅ sim | ✅ #6 + #7 |

**Pass criterion:** ≥4/5 corretos com heurística certa. **Resultado: 5/5 — PASS.**

Observação do subagent: todos os 5 cenários aparecem literalmente como exemplos canônicos na tabela §5.3 de `matrix.md` (#3, #7, #2, #5, #14). Não houve necessidade de inferência cross-domínio.

---

## Pergunta 2 — Incident (MP webhook parou há 30 min)

### Resultado: 3/3 ✅

- **Severity P0 identificada?** ✅ — subagent justificou via `incident-response.md` linha 41 (P0 mapping) + tabela §6.2
- **Estrutura mãe (5 etapas) invocada?** ✅ — subagent listou Detect/Confirm/Contain/Fix/Postmortem citando linhas 17-21 de `incident-response.md`, com aplicação prática pra cada etapa do cenário MP
- **Runbook `mp-webhook-down.md` linkado?** ✅ — subagent citou path completo + as 4 ações diagnósticas (URL/5xx/401/200) com linhas específicas, + critério de "resolvido"

**Pass criterion:** os 3 critérios. **Resultado: PASS.**

Observação do subagent: identificou correlação interessante — se o alerta MP veio via Telegram e o bot estiver instável (gap registrado em §6.3), há degradação no canal de notificação. Não impede executar o runbook MP, mas é learning pra documentar quando o gap `telegram-bot-down` virar runbook.

---

## Pergunta 3 — Release (deploy Worker terça de manhã, sem migration)

### Resultado: 3/3 ✅

- **`release-protocol.md` §7.2 pre-flight invocado?** ✅ — subagent listou os 6 items com fonte (linhas 24-35) + adicionou os 6 pré-requisitos do `runbooks/deploy.md` linhas 25-31 (auth wrangler, working tree limpo, branch atualizada, token CF válido, smoke test, cwd correto)
- **`runbooks/deploy.md` linkado?** ✅ — subagent citou seção "Procedure — Worker `inkflow-cron`" (linhas 109-153) com 4 passos executáveis + pós-deploy (linhas 155-159)
- **Slash `/deploy-check` mencionado?** ✅ — subagent referenciou `release-protocol.md` §7.2 linha 26 explicitamente

**Pass criterion:** os 3 critérios. **Resultado: PASS.**

Janela: subagent confirmou que terça de manhã cai em "qualquer hora útil de Leandro" (não em pico estimado), dentro do disclaimer §7.5 de "ainda não validada empiricamente".

---

## Path scope violations

| Subagent | Read fora do scope? | Wanted-but-didn't (gaps) |
|---|---|---|
| Pergunta 1 (Matriz) | nenhuma | nenhum — todos os 5 cenários respondidos com `matrix.md` |
| Pergunta 2 (Incident) | nenhuma | nenhum |
| Pergunta 3 (Release) | nenhuma | `rollback.md` (citado no checklist mas não foi necessário ler) |

Todos os 3 subagents respeitaram path scope. Single auditoria positiva: subagent 3 flagou explicitamente o que considerou ler e por que decidiu não ler (boa prática de transparência).

---

## Resumo executivo

| Pergunta | Critério | Resultado |
|---|---|---|
| 1 — Matriz | ≥4/5 cenários corretos | **5/5 PASS** |
| 2 — Incident | Estrutura + runbook + severity | **PASS** |
| 3 — Release | §7.2 + runbook + /deploy-check | **PASS** |
| Path scope | Sem violations | **OK** |

**Score: 3/3 (100%). Threshold: 80%.**

**Doctrine done? SIM.** ✅

---

## Gaps detectados (input pra ajustes futuros)

Nenhum gap bloqueante na doutrina. 3 observações pra registro (não-bloqueantes):

1. **(Subagent 1)** `matrix.md` referencia `secrets.md` na heurística #5 pra obter fonte canônica de secret. Funciona, mas vale calibrar se a regra "REJEITAR + pedir via Telegram" cobre todos os subcasos (e.g., quando MCP autenticado existe pro serviço — atualmente §5 cobre isso, ok).

2. **(Subagent 2)** Correlação `mp-webhook-down` × `telegram-bot-down`: se Telegram bot estiver down quando MP webhook cair, alerta inicial pode ser perdido. Isso reforça a P0 do gap `telegram-bot-down` registrado em §6.3 (já backlog).

3. **(Subagent 3)** `release-protocol.md` §7.2 não documenta fallback pra "e se Worker não tem CI/testes?". Hoje Worker tem mínimo de testes; quando expandir, vale criar regra de "como deployar sem suite". **Não é bloqueador hoje** — Worker é simples e testável manualmente.

---

## Conclusão

A doctrine `docs/canonical/methodology/` (commit `1860211`) responde corretamente a perguntas reais de delegação, incident response e release planning **usando apenas conteúdo do próprio canonical + runbooks de Sub-projeto 1 + secrets.md**. Doctrine pronta pra Task 8 (teste real) e merge.
