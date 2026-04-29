# Time de Subagents — InkFlow

Subagents Claude Code do InkFlow. Cada um é especializado num domínio crítico, com tools whitelist explícita e gates de aprovação humana documentados. Doctrine de delegação está em `docs/canonical/methodology/matrix.md` §5.

**Última atualização:** 2026-04-26 (Sub-projeto 2 MVP).

## Agents ativos (MVP)

| Agent | Domínio | Modelo | Tools top-level | Gate ✅ |
|---|---|---|---|---|
| `deploy-engineer` | CF Pages/Workers, GHA, secret rotation | Sonnet | Read, Edit, Bash, mcp github + cloudflare | Telegram pra `wrangler deploy`, secret put, `git push --force`, edit GHA workflow |
| `supabase-dba` | Migrations, RLS, advisor, queries | Sonnet | Read, Edit, Bash, mcp supabase (16 tools) | Telegram pra `apply_migration` em prod, DDL, DELETE/UPDATE em massa, mudanças RLS |
| `vps-ops` | Vultr resources, uptime, restart Docker | Haiku | Read, Bash | Telegram pra restart/stop container, edit config, reboot |

Detalhe completo de tools/gates por agent: ver frontmatter de cada arquivo `.md` e seção "Comandos típicos" do prompt.

## Como invocar

Via `Agent` tool no Claude Code principal:

```
Agent({
  description: "<descrição curta da tarefa>",
  subagent_type: "deploy-engineer",  // ou supabase-dba, vps-ops
  prompt: "<task self-contained com contexto suficiente>"
})
```

**Quando usar (heurísticas — referência completa em `matrix.md` §5.1):**

| Cenário | Quem faz |
|---|---|
| Read-only / write-dev simples | Claude principal (não invoca agent) |
| Write-em-prod / domínio específico / >15min isolado | Subagent |
| Decisão de produto / brainstorm | Principal com Leandro (não delegar) |
| Operação destrutiva | Subagent ✅ Telegram (NUNCA agent sozinho) |

Ver `matrix.md` §5.3 pros 14 exemplos canônicos resolvidos.

## Doctrine de operação

Cada agent valida no pre-flight checklist:

1. `docs/canonical/methodology/matrix.md` §5.1 — heurísticas Safety > Scope > Domain
2. `docs/canonical/methodology/incident-response.md` — severity classification (P0/P1/P2)
3. Runbooks específicos do domínio do agent

**Agents propõem com diff/plano e param na fronteira de write-em-prod.** Claude principal aprova explicitamente antes de re-invocar pra execução. Esta é a "autonomia média (b)" do plano-mestre Fábrica §2.1.

**Em dúvida sobre classificação, default = destrutiva.** Falso-positivo (pedir ✅ à toa) custa 1 ping. Falso-negativo (executar destrutivo sem ✅) custa incidente.

## Mapping auditor → agent

Auditores em prod sugerem qual subagent é especialista no domínio do alerta. Founder vê `payload.suggested_subagent` no Telegram e roteia.

| Auditor | Suggested subagent | Doctrine reason |
|---|---|---|
| `key-expiry` | `deploy-engineer` | Secrets vivem em CF Pages env; rotação envolve `wrangler` + GHA Secrets. Domain match. |
| `deploy-health` | `deploy-engineer` | Failures de pipeline (GHA + CF Pages + Wrangler). Domain match — agent já roteia rollback.md. |
| `billing-flow` | _none_ | MP webhook é integração externa (Mercado Pago dashboard) sem agent dedicado no MVP. Runbook `mp-webhook-down.md` é a doutrina — founder executa as 4 ações manuais. |

Doc canonical dos auditores: [`docs/canonical/auditores.md`](../../docs/canonical/auditores.md).

## Histórico de promoções de autonomia

(vazio — todos os agents operam em autonomia média (b). Promoção pra autonomia (a) — execução sem aprovação prévia em ações reversíveis e baixo blast radius — requer >30d sem incidentes do agent específico + decisão consciente registrada em `docs/canonical/decisions/`.)

| Agent | Data promoção | Para autonomia | Base de evidência |
|---|---|---|---|
| (nenhum ainda) | — | — | — |

## Agents postponed / deprecated

Ver `.claude/agents/_legacy/README.md` pros 6 prompts arquivados em 2026-04-26 (Sub-projeto 2 MVP). Inclui `marcelo-pago` (postponed pra Sub-projeto 2 v2 quando MRR > 0).

## Cross-references

- `docs/canonical/methodology/matrix.md` — doctrine de delegação (Sub-projeto 5)
- `docs/canonical/methodology/incident-response.md` — severity + protocolo de resposta
- `docs/canonical/methodology/release-protocol.md` — protocolo de release
- `docs/canonical/runbooks/` — 6 runbooks operacionais (outage-wa, mp-webhook-down, db-indisponivel, restore-backup, deploy, rollback, telegram-bot-down, secrets-expired)
- `docs/canonical/secrets.md` — mapa de secrets (referenciado por deploy-engineer pra rotação)
- `docs/canonical/ids.md` — IDs e tabelas (referenciado por supabase-dba)
- `docs/superpowers/specs/2026-04-25-fabrica-inkflow-design.md` — plano-mestre Fábrica
- `docs/superpowers/specs/2026-04-26-subagentes-mvp-design.md` — sub-spec deste MVP
