---
last_reviewed: 2026-04-26
owner: leandro
status: stable
related: [../stack.md]
---

# Runbooks — Índice

Cada runbook é um procedimento operacional pra um cenário específico. Use:
1. Identifique o sintoma na tabela abaixo.
2. Abra o runbook correspondente: `Read docs/canonical/runbooks/<nome>.md`.
3. Siga o decision tree.

## Runbooks disponíveis

| Runbook | Sintoma principal | Severidade típica | Tempo estimado |
|---|---|---|---|
| `deploy.md` | rotina (não é incidente) | n/a | 5 min |
| `rollback.md` | deploy quebrou prod | critical | 10 min |
| `outage-wa.md` | mensagens WhatsApp não fluem | critical | 15-60 min |
| `mp-webhook-down.md` | webhook MP parou (>24h) | critical | 30 min |
| `db-indisponivel.md` | Supabase fora | critical | depende da Supabase |
| `restore-backup.md` | dados corrompidos / restore | critical | 1-4h |
| `telegram-bot-down.md` | Telegram bot off / approval bloqueado | critical (se P0 ativo) | 15-30 min |
| `secrets-expired.md` | Secret expirado / 401-403 / GHA silent failure | critical (se prod write afetado) | 15-45 min |

## Convenções de runbook

- **Sintomas** → como detectar
- **Pré-requisitos** → credenciais e ferramentas necessárias
- **Diagnóstico** → comandos pra confirmar a causa (com decision tree)
- **Ação** → comandos copy-paste resolvendo, condicionais ao output
- **Verificação** → como confirmar que está resolvido
- **Pós-incidente** → o que registrar (commit, daily note, decisão arquitetural)

## Quando adicionar um runbook novo

Quando um incidente novo acontece e a resposta não é óbvia em 5 min, escrever runbook pra próxima vez. Ciclo:
1. Resolver o incidente (ad-hoc).
2. Logo depois, escrever `runbooks/<nome>.md` com o que funcionou.
3. Atualizar este `README.md` com a nova entrada.
4. Commit + atualizar `last_reviewed` em ambos.
