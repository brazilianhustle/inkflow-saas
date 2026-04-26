---
last_reviewed: 2026-04-25
owner: leandro
status: stable
related: [stack.md, flows.md, ids.md, secrets.md, limits.md, runbooks/README.md, methodology/index.md]
---
# Mapa Canônico do InkFlow — Index

> Este arquivo é embutido literalmente no system prompt dos agents do Sub-projeto 2 (Time de Subagents).
> Antes de qualquer ação irreversível em produção, agent consulta o runbook relevante.

## Convenções para agents

- **Source-of-truth:** este Mapa é canonical. Quando há divergência entre Mapa e arquivo de config (`wrangler.toml`, migration aplicada via Supabase MCP), o **arquivo de config / código é a verdade técnica**; o Mapa é a verdade narrativa. Se notar divergência, reporta ao founder via Telegram em vez de adivinhar.
- **Secrets:** valores de secrets NUNCA estão neste repo. Ver `secrets.md` para nomes e procedure de obtenção.
- **Antes de ações destrutivas:** consultar runbook correspondente em `runbooks/<incidente>.md`. Se incidente não tem runbook listado abaixo, parar e reportar ao founder antes de improvisar.
- **Frontmatter:** todos os arquivos têm `last_reviewed`, `owner`, `status`. Se `last_reviewed` defasado >30 dias em arquivo crítico (limits.md, secrets.md), sinalizar antes de usá-lo.

## Arquivos disponíveis

| Arquivo | Conteúdo |
|---|---|
| `stack.md` | Os 8 serviços do InkFlow (CF Pages, CF Worker, Supabase, Evolution, MP, MailerLite, n8n, Telegram). Propósito, owner, integração, health check de cada um. |
| `flows.md` | 8 fluxos críticos com diagramas Mermaid: signup→trial, trial→pago, payment recorrente IPN, webhook Evolution→n8n→bot, 3 crons (expira-trial, cleanup-tenants, monitor-whatsapp), delete-tenant cascata. |
| `ids.md` | IDs de domínio, 11 tabelas Supabase, workflows n8n, group IDs MailerLite, 38+ endpoints `/api/*`. |
| `secrets.md` | Mapa de secrets — APENAS nomes e ponteiros pra fonte canônica (Bitwarden + CF Pages env). Procedure de rotação. **ZERO valores plaintext.** |
| `limits.md` | Quotas de Vultr / CF Workers / CF Pages / Supabase / MP / MailerLite / Telegram / n8n / LLM providers + thresholds warn/critical. Alimenta auditores #3 (VPS limits) e #5 (billing health) do Sub-projeto 3. |
| `runbooks/` | Procedimentos operacionais. Ver `runbooks/README.md` pro índice completo + `runbooks/<incidente>.md` por procedimento. |
| `methodology/index.md` | Doutrina de operação: matriz principal-subagent, incident-response, release-protocol. Ver `methodology/` pro índice completo. |

## Runbooks disponíveis

| Runbook | Sintoma principal | Severidade típica |
|---|---|---|
| `runbooks/deploy.md` | rotina (não é incidente) | n/a |
| `runbooks/rollback.md` | deploy quebrou prod | critical |
| `runbooks/outage-wa.md` | mensagens WhatsApp não fluem (Evolution down) | critical |
| `runbooks/mp-webhook-down.md` | webhook IPN do MP parou de chegar | critical |
| `runbooks/db-indisponivel.md` | Supabase fora do ar (5xx em quase todos endpoints) | critical |
| `runbooks/restore-backup.md` | dados corrompidos / restore destrutivo | critical |

## Como agents devem usar este Mapa

1. **Antes de iniciar qualquer tarefa** que toque produção, ler `index.md` (este arquivo) e os arquivos relevantes:
   - Mexe em serviço/integração → `stack.md`
   - Precisa de credencial → `secrets.md` (ver onde está, NUNCA esperar valor neste repo)
   - Toca fluxo end-to-end → `flows.md`
   - Toca limites/quotas → `limits.md`
   - É incidente → runbook correspondente
2. **Em incidente**, abrir `runbooks/<incidente>.md` correspondente — **NÃO improvisar**. Se o sintoma não bate com nenhum runbook listado, parar e reportar ao founder.
3. **Se achar info desatualizada** (ex: endpoint que não existe mais, ID que mudou), reportar via Telegram em vez de adivinhar — o canonical pode ter divergido do código real entre revisões.
4. **Após mudança em produção** (deploy de feature, migration, secret rotation), agent deve **sugerir update** no arquivo correspondente do Mapa + atualizar `last_reviewed`. Submeter como commit separado de `docs(canonical): ...`.

## Visão geral da rede

Os 14 arquivos do Mapa cobrem 7 áreas técnicas do spec-mestre:

```
                        index.md (este arquivo)
                              │
      ┌──────────┬────┴────┬──────────┬──────────┬──────────────┐
      │          │         │          │          │              │
  stack.md   flows.md   ids.md   secrets.md  limits.md  methodology/
      │          │         │          │          │
      └─────── runbooks/ (6 procedimentos) ───────┘
```

Sub-projeto 2 (Time de Subagents) consome este Mapa como contexto base. Sub-projeto 3 (Time de Auditores) audita a saúde dos sistemas referenciados aqui.
