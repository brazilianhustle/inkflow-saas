# Eval Governance — InkFlow Agent

> Pilar 4 do programa. Define categorias, judge model, custo, gate de merge.

## 3 categorias

| Categoria | Quando roda | Custo | Failure = | Owner |
|---|---|---|---|---|
| **Regression suite** | CI cada PR | ~$0.01 | Bloqueia merge | CI automático |
| **Directed evals** (persona × agent, LLM-judge) | Pré-merge prompt change + weekly | ~$0.20-0.30/run | Bloqueia se persona core falha | Leandro |
| **Red-team / adversarial** | Mensal | ~$1.00/run | Gera failure entries + plano | Leandro |

## Judge model = diferente do model under test

| Papel | Model | Provider |
|---|---|---|
| **Model under test** | `gpt-4o-mini` | OpenAI |
| **Judge** | `claude-haiku-4-5-20251001` | Anthropic |

Elimina viés sistemático onde model gosta da própria saída.

## Cost budgets

| Escopo | Cap |
|---|---|
| Regression suite (CI) | ~$0.01/run, ~$5/mês total |
| Directed eval por run | $0.30 hard cap |
| Red-team mensal | $1.00 hard cap |
| **Total InkFlow Agent/mês** | **$50/mês teto** |
| Alarme Telegram | Atinge 70% do cap mensal ($35) |

## Gate de merge (CI)

PR que toca:
- `functions/_lib/prompts/coleta/<agent>/*.js` → obriga regression + directed eval do agent passar
- `functions/api/agent/agents/<agent>.js` → obriga unit + invariant tests + regression
- `docs/manifesto-tatuador-bot.md` → obriga directed eval de TODOS os agents

## Override de emergência (bypass)

Permitido com:
- Label `bypass-inkflow-agent-gate` no PR
- Body do PR explica o que está sendo skipado + plano de re-validação em 24h
- Cria failure entry rastreando o bypass (não pode virar prática silenciosa)

## Versionamento de evals

Cada eval file tem frontmatter:

```yaml
---
id: eval-tattoo-per001-handoff
version: 2026-05-15.001
agents: [tattoo]
personas: [PER-001]
failure_modes_covered: [FM-0003, FM-0007]
manifesto_principles: [P1, P2, P5]
cost_budget_usd: 0.20
created: 2026-05-15
last_updated: 2026-05-15
status: active
---
```

Mudança em eval = bump version, registra em [INDEX.md](INDEX.md).

## Privacy

Judge prompt nunca envia PII real do tenant (telefone, email, cpf). Para evals reais (promote-logs-to-evals), tem que rodar redactor antes — Phase 1+ task.
