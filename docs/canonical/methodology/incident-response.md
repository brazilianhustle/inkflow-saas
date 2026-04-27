---
last_reviewed: 2026-04-26
owner: leandro
status: stable
related: [index.md, matrix.md, release-protocol.md, ../runbooks/README.md, ../runbooks/rollback.md]
---
<!-- index.md, release-protocol.md são criados em Tasks 3-4 deste plano (docs/superpowers/plans/2026-04-25-metodologia-fabrica.md). Forward-references intencionais. -->

# Incident Response — Estrutura mãe

Meta-doctrine pra responder a alertas. **Não duplica os 6 runbooks operacionais** em `../runbooks/` — esse documento é a estrutura mãe que cada runbook instancia. Sob alerta no Telegram em horário ruim: começar pelo §6.3 (cenário→runbook) e seguir o runbook específico. Esse doc só explica a moldura.

## 6.1 Estrutura mãe (5 etapas)

Aplicável a qualquer alerta. Cada runbook em `canonical/runbooks/` é uma instância dessa estrutura pra um cenário específico.

1. **Detect** — fonte do alerta (Telegram do auditor, Sentry, Supabase advisor, GHA notification, reclamação cliente).
2. **Confirm** — verificar que não é falso positivo. 1 query / 1 curl / 1 dashboard. Antes de mexer em prod.
3. **Contain** — parar o sangramento (rollback, disable feature flag, throttle, kill process). Prioriza estancar dano sobre causa raiz.
4. **Fix** — resolver causa raiz. **Linka pro runbook específico** em `canonical/runbooks/` se houver. Se não houver, ad-hoc + criar runbook depois (regra do README de runbooks).
5. **Postmortem** — entrada nova em `[[InkFlow — Painel]]` seção "Incidentes recentes" + nota dedicada `vault/InkFlow — Incidentes/<YYYY-MM-DD>-<slug>.md` com timeline, causa, fix, prevenção. Se virou learning generalizável: atualizar matrix.md ou criar runbook novo.

## 6.2 Tabela de severity

Alinha com a do `runbooks/README.md`. Severity define **tempo de resposta esperado**, não procedimento — procedimento mora no card.

| Severity | Sintoma | Tempo de resposta | Slash de entrada |
|---|---|---|---|
| **P0** (critical) | Bot não responde / pagamento quebrado / dado corrompido | < 15 min | `/hotfix` imediato |
| **P1** (high) | Funcionalidade degradada (1 tenant afetado, ou >1 funcionalidade lenta) | < 2h | Card específico + fix em horário |
| **P2** (medium/low) | Bug não-crítico / cosmético | < 24h | `/backlog-add` priorizado |

## 6.3 Cenários conhecidos → runbook canônico (fonte única)

> **Importante:** essa tabela é a **única fonte da verdade** para mapeamento sintoma→runbook. `index.md` apenas linka pra cá. Se um runbook novo for adicionado em `canonical/runbooks/`, atualizar essa tabela aqui (não em `index.md`).

| Sintoma | Runbook | Severidade típica |
|---|---|---|
| 5xx burst em `inkflowbrasil.com/*` ou `/api/*` (deploy quebrou) | [`runbooks/rollback.md`](../runbooks/rollback.md) | P0 |
| Worker `inkflow-cron` parou de disparar | [`runbooks/rollback.md`](../runbooks/rollback.md) | P0 |
| MP webhook silent (>15 min sem evento esperado) | [`runbooks/mp-webhook-down.md`](../runbooks/mp-webhook-down.md) | P0 |
| Supabase indisponível (todos os `/api/*` quebrando) | [`runbooks/db-indisponivel.md`](../runbooks/db-indisponivel.md) | P0 |
| Mensagens WhatsApp Evolution não fluem | [`runbooks/outage-wa.md`](../runbooks/outage-wa.md) | P0/P1 |
| Dados corrompidos / restore necessário | [`runbooks/restore-backup.md`](../runbooks/restore-backup.md) | P0 |
| Procedimento de deploy padrão (não é incidente) | [`runbooks/deploy.md`](../runbooks/deploy.md) | n/a |
| Supabase advisor crítico (RLS exposto / slow query / security issue, DB no ar) | _gap registrado_ | P1 |
| Deploy GHA falhou antes de chegar em prod | _gap registrado — coberto parcialmente por `rollback.md`_ | P2 |
| **Telegram bot down** (canal de approval indisponível — quebra fluxo destrutivo §5.1#4) | [`runbooks/telegram-bot-down.md`](../runbooks/telegram-bot-down.md) | P0 |
| **Secret expirado / rotação não-anunciada** (CF API token TTL=90d, OPENAI key, etc.) | [`runbooks/secrets-expired.md`](../runbooks/secrets-expired.md) | P1 |
| **CF Pages build failed** (build no CF após push, distinto de GHA) | _gap registrado — adjacente a `rollback.md`_ | P2 |
| **MailerLite block rate alto** (entrega quebrada — afeta funil) | _gap registrado_ | P3 |

Os 6 gaps ficam registrados em `[[InkFlow — Pendências (backlog)]]` com prioridades diferenciadas (ver §11). Cada um vira trabalho próprio quando o cenário ocorrer e a resposta ad-hoc não for óbvia em 5 min (regra do `runbooks/README.md`). **Não** são trabalho desse spec.

### Auditores em prod (cross-ref)

Auditores que detectam sintomas mapeados em §6.3 e disparam alerta com `payload.runbook_path` apontando pra fonte única acima:

- **key-expiry** (2026-04-27): detecta secrets expirando ou inválidos via TTL/self-check/drift. Alerta `[critical] [key-expiry]` → seguir [secrets-expired.md](../runbooks/secrets-expired.md). Doc canônico: [auditores.md#key-expiry](../auditores.md#key-expiry).
