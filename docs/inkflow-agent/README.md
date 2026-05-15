# InkFlow Agent — Programa cross-agent de qualidade

**Status:** ativo (Phase 0 Foundation)
**Spec:** [`docs/superpowers/specs/2026-05-15-inkflow-agent-program-design.md`](../superpowers/specs/2026-05-15-inkflow-agent-program-design.md)
**Manifesto canônico:** [`docs/manifesto-tatuador-bot.md`](../manifesto-tatuador-bot.md)

---

## O que é

Framework cross-agent transversal pra construir os 4 agents customer-facing (TattooAgent, CadastroAgent, PropostaAgent, PortfolioAgent) com qualidade máxima antes de abrir beta. Aplica gates de eval + telemetria + cadência operacional sobre o que existe; não substitui prompts em massa.

## 5 pilares

1. **Persona Library** ([`personas/`](personas/INDEX.md)) — taxonomia formal de arquétipos de cliente final
2. **Failure Catalog** ([`failures/`](failures/INDEX.md)) — taxonomia viva de falhas observadas
3. **Telemetria de Produção** — tabela `agent_turn_logs` + logger fire-and-forget em `functions/_lib/telemetry/`
4. **Eval Governance** ([`evals/`](evals/governance.md) + `evals/inkflow-agent/`) — 3 categorias com judge model separado
5. **Cadência + Métricas** ([`ops/`](ops/cadence.md)) — daily/weekly/monthly/quarterly

## Ordem de execução

| Fase | Agent | Status |
|---|---|---|
| 0 | Foundation | em curso |
| 1 | TattooAgent | planejada |
| 2 | CadastroAgent | planejada |
| 3 | PropostaAgent | planejada |
| 4 | PortfolioAgent | planejada |
| 5 | Beta fechado | planejada |

## Princípios operacionais

1. Cross-agent first — failure em um agent vira aprendizado pros outros
2. Telemetria antes de cliente — não abre beta sem captura turn-level
3. Eval como contrato — toda mudança de prompt passa por eval direcionado + regressão
4. Manifesto vive — `docs/manifesto-tatuador-bot.md` é constituição
5. Failure catalog é cumulativo — falha resolvida vira regression test permanente
6. Métricas de produto > métricas de bot
7. Persona-driven evals
