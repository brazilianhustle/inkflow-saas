# Legacy agents (deprecated)

These prompts predate the Sub-projeto 2 doctrine (cementada via `docs/canonical/methodology/matrix.md` em 2026-04-25). Kept here as historical reference. **Não invocar.**

## Status por agent

| Agent | Status | Conhecimento extraído pra |
|---|---|---|
| `doutor-evo` | deprecated | `docs/canonical/runbooks/outage-wa.md` (3 seções de Evolution) |
| `estagiario` | deprecated | superseded by `superpowers:writing-plans` skill |
| `hunter` | deprecated | superseded by `pr-review-toolkit:silent-failure-hunter` |
| `marcelo-pago` | postponed | retornará como `billing-watcher` em Sub-projeto 2 v2 (gate: MRR > 0) |
| `o-confere` | deprecated | `docs/canonical/runbooks/deploy.md` (parcial — ASCII check descartado, Decisão #7 cravou UTF-8 real) |
| `supa` | deprecated | superseded by `supabase-dba.md` (matrix.md-aligned, usa MCP em vez de SB_PAT plaintext) |

## Por que aposentados

1. **Não-versionados antes** — viviam só no MacBook do founder, sem sync com VPS espelhado.
2. **Violavam doctrine** — alguns liam secrets em plaintext (Safety #5), tinham IP hardcoded, ou misturavam conhecimento de domínio com instrução (deveria viver em `docs/canonical/`).
3. **Sobreposição com built-ins** — `estagiario` e `hunter` duplicavam capabilities já mantidas pelos plugins oficiais (`superpowers`, `pr-review-toolkit`).
4. **Escopo redundante** — `supa` e `supabase-dba` (novo) cobrem o mesmo domínio.

## Quando consultar estes arquivos

- Histórico/auditoria: como pensávamos a operação antes da doctrine matrix.md.
- Re-ativação postponed: `marcelo-pago` é base pra `billing-watcher` (Sub-projeto 2 v2).
- Comparação: ver como o agent novo difere do antigo no mesmo domínio.

**Aposentado em:** 2026-04-26 (PR Sub-projeto 2 MVP).
**Spec:** `docs/superpowers/specs/2026-04-26-subagentes-mvp-design.md` (commit `089b44c`).
