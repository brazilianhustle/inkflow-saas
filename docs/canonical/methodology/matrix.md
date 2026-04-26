---
last_reviewed: 2026-04-26
owner: leandro
status: stable
related: [index.md, incident-response.md, release-protocol.md, ../secrets.md, ../runbooks/README.md]
---
<!-- index.md, incident-response.md, release-protocol.md são criados em Tasks 2-4 deste plano (docs/superpowers/plans/2026-04-25-metodologia-fabrica.md). Forward-references intencionais. -->

# Matrix — Principal vs. Subagent

Doctrine de delegação: quando trabalho fica na sessão principal vs. quando vira tarefa pra subagent dedicado. Lida por **Claude principal** (decidindo "delegar isso?") e por cada **subagent** (validando "tá no meu escopo?"). Ordem de aplicação das heurísticas: **Safety > Scope > Domain**.

## 5.1 Heurísticas globais (9 regras, 3 grupos)

**Scope** — decisão de delegação principal vs. subagent

1. **Read-only** (logs, docs, queries de leitura, `git log`, `wrangler tail`, `gh pr view`) → **principal**.
2. **Write seguro em dev** (refactor, novo arquivo, edit local, `npm test`, branch nova) → **principal**.
3. **Write em prod** (deploy, migration, `git push origin main`, configuração CF Pages env) → **subagent dedicado do domínio**.
   - **Exceção:** ações via MCP autenticada com API tipada (n8n MCP, Supabase MCP, Cloudflare MCP) são consideradas operações controladas pela API — `principal` pode executar diretamente. Exemplos canônicos: §5.3 #9b (n8n via `mcp__n8n__update_workflow`). Operação destrutiva via MCP (#4) ou que requer SSH/shell ao host (#9c) NÃO se beneficia dessa exceção.

**Safety** — overrides universais. Valem **mesmo dentro** do escopo de subagent autorizado.

4. **Operações destrutivas** (`drop table`, `git reset --hard`, `rm -rf`, `git push --force`, `wrangler delete`, drop de migration aplicada, truncate, `DELETE` sem `WHERE` específico) → SEMPRE confirmação humana via Telegram ✅. Subagent **nunca** executa destrutivo sozinho, mesmo no domínio dele.
   - **Fallback se Telegram indisponível ou sem resposta:** ver `../runbooks/telegram-bot-down.md` Ação 0. Resumo:
     - **Trigger:** Telegram API retornou erro **OU** msg aceita mas zero resposta do founder em 10 min.
     - **Canal alt:** Pushover (priority=2, retry=60, expire=1800, sound=siren).
     - **Mecanismo de retorno:** tabela `approvals` no Supabase + admin panel `/admin.html#approvals/<id>` linkado no Pushover. Agent faz polling.
     - **Polling interval por severity** (alinhado com `incident-response.md §6.2`):

       | Severity | Polling interval | Timeout total |
       |---|---|---|
       | P0 | 5s | 15 min |
       | P1 | 30s | 2 h |
       | P2 | 2 min | 24 h |

     - **Default se Pushover também falhar (ambos canais sem resposta em `expires_at`):** abort destrutivo automático. Operação fica registrada em log com payload completo pra retry manual quando founder ficar disponível. **Não inventar 3º canal ad-hoc** — fluxo é deterministicamente "abort". Se ocorrer >2x/trimestre, abrir spec separado pra formalizar 2º alt channel.
     - **Não** timeout silencioso autorizando destrutivo. Se nem canal primário nem alt respondem em `expires_at`, **default = abort**.
5. **Secrets em plaintext** → NUNCA `Read` direto em `.env`, `~/.zshrc`, `~/.config/`, ou arquivos com `secret`/`token`/`key`/`password` no nome. Pra obter valor: consultar `docs/canonical/secrets.md` pra descobrir fonte canônica (Bitwarden/CF env/Keychain) e pedir via Telegram. Se já tem MCP autenticado pro serviço (Cloudflare/Supabase/etc.), usar MCP em vez de pedir secret bruto.
6. **Tarefa que precisa >15 min de exploração isolada** → subagent (preserva contexto do principal).

**Domain** — lookup rápido por área

7. **Código de domínio específico** (CF Worker/Pages, Supabase migration/RLS, VPS/n8n, prompts do produto) → subagent do domínio. Tabela em §5.2.
8. **Decisão de produto** (UX, escopo, priorização, naming público) → **principal com Leandro** (não delegar).
9. **Brainstorm / pesquisa de soluções** → **principal** (mantém visão geral cross-domínio).

## 5.2 Tabela domínio × ação

| Domínio | Read-only | Write seguro (dev) | Write em prod | Debug profundo / >15min |
|---|---|---|---|---|
| **Deploy** (CF Worker/Pages, GHA) | principal | principal | `deploy-engineer` ✅ | `deploy-engineer` |
| **Supabase** (DB, RLS, queries) | principal | principal ou `supabase-dba` | `supabase-dba` ✅ | `supabase-dba` |
| **VPS / n8n** (Vultr, Evolution, workflows) | principal | principal (editar export commitado em `n8n/workflows/`) | `vps-ops` ✅ (aplicar no servidor) | `vps-ops` |
| **Prompts** (`generate-prompt.js` + sucessores) | principal | principal | `prompt-engineer` (golden set ✅) | `prompt-engineer` |
| **Outros** (frontend, docs, código geral, decisão de produto) | principal | principal | principal | principal |

✅ = gate de aprovação humana via Telegram. Define-se no prompt de cada agent (referência cruzada com Sub-projeto 2).

## 5.3 Exemplos canônicos

14 casos resolvidos cobrindo os 3 grupos de heurísticas:

| # | Cenário | Decisão | Heurística aplicada |
|---|---|---|---|
| 1 | Ler último deploy do worker pra investigar 5xx burst | **principal** | Scope/read-only (#1) |
| 2 | Refatorar 4 arquivos do frontend de Modo Coleta | **principal** | Scope/write-dev (#2) |
| 3 | Aplicar `wrangler rollback` em prod após deploy quebrado | **`deploy-engineer` ✅** | Scope/write-prod (#3) + Domain (#7) |
| 4 | Criar migration nova adicionando coluna nullable | **`supabase-dba`** | Scope/write-prod (#3) — não-destrutivo |
| 5 | Drop coluna obsoleta de `tenants` (já sem leitura) | **`supabase-dba` ✅ Telegram** | Safety/destrutivo (#4) sobrepõe Scope |
| 6 | Rotacionar `MP_ACCESS_TOKEN` em CF Pages env | **`deploy-engineer` ✅ Telegram** | Safety/secrets (#5) — valor via Bitwarden, não plaintext |
| 7 | Pedido "lê o valor de `OPENAI_API_KEY` no `.zshrc`" | **REJEITAR** + pedir via Telegram | Safety/secrets (#5) — proibição direta |
| 8 | Force push em `main` | **REJEITAR** salvo Telegram ✅ explícito | Safety/destrutivo (#4) |
| 9a | Ajustar workflow n8n via SDK + commitar export em `n8n/workflows/` | **principal** | Scope/write-dev (#2) — código versionado |
| 9b | Aplicar workflow ajustado **via n8n MCP** (HTTP autenticada — `mcp__n8n__update_workflow`) | **principal** | Scope/write-prod (#3) — API tipada, não-destrutivo de infra |
| 9c | Modificar config do servidor VPS **via SSH** (nginx, docker, systemd, env) | **`vps-ops` ✅** | Scope/write-prod (#3) + Domain (#7) — acesso shell ao host |
| 10 | Adicionar nova tool no `generate-prompt.js` | **`prompt-engineer`** (golden set ✅) | Domain (#7) |
| 11 | Editar `docs/canonical/stack.md` pós-refactor | **principal** (pós-MVP: `doc-keeper`) | Domain/docs (#7) |
| 12 | Decidir UX do novo Modo Coleta | **principal com Leandro** | Domain/produto (#8) — não delegar |
| 13 | Brainstorm de feature nova (`/nova-feature`) | **principal** | Domain/brainstorm (#9) |
| 14 | Investigação >15 min de query lenta em Supabase | **`supabase-dba`** com contexto isolado | Scope/tempo (#6) + Domain (#7) |

Esses 14 exemplos são o "padrão por imitação". Caso novo que não encaixa: aplicar heurísticas em ordem (Safety > Scope > Domain) e adicionar à tabela quando virar repetição.
