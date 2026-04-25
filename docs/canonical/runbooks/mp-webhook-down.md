---
last_reviewed: 2026-04-25
owner: leandro
status: stable
related: [README.md, ../stack.md, ../flows.md, rollback.md]
---
# Runbook — MP webhook (IPN) não chega

Webhook IPN do Mercado Pago parou de chegar ou chega com erro. Endpoint alvo: `https://inkflowbrasil.com/api/mp-ipn`. Sem IPN funcionando, pagamentos recorrentes não atualizam `tenants.status_pagamento`.

## Sintomas

- Telegram alert do auditor `billing-flow-health` (Sub-projeto 3) — quando ativo
- `payment_logs.created_at` sem entradas recentes apesar de pagamentos visíveis no MP dashboard
- Cliente reclamando: "paguei e bot não me liberou" / "voltei pra trial após pagar"
- MP dashboard → Webhooks → Histórico mostra falhas de delivery
- `tenants.status_pagamento` ficando defasado em relação ao MP (ex: `pendente` há dias mesmo após pagamento)

## Pré-requisitos

- [ ] `MP_ACCESS_TOKEN` (Bitwarden item `inkflow-mp-prod`)
- [ ] Acesso ao MP dashboard (Bitwarden item `mercado-pago`)
- [ ] `wrangler` autenticado pra checar logs CF Pages
- [ ] Acesso Supabase dashboard (pra inspecionar `payment_logs`)

## Diagnóstico

### 1. Webhook URL configurado certo no MP?

MP Dashboard → **Suas integrações** → InkFlow → **Webhooks** → URL configurada.

Esperado: `https://inkflowbrasil.com/api/mp-ipn`

Se URL diferente / vazia → **Ação A**.

### 2. CF Pages tá recebendo as requests?

```bash
wrangler pages deployment tail --project-name=inkflow-saas | grep -i "mp-ipn"
```

Cenários:
- **Zero requests chegando:** problema de delivery do MP → seguir Ação A.
- **Requests chegando + erro 5xx:** problema do endpoint → seguir Ação B.
- **Requests chegando + 401:** assinatura inválida → seguir Ação C.
- **Requests chegando + 200 mas comportamento errado:** seguir Ação D (parsing/lógica).

### 3. MP dashboard mostra delivery falhando?

MP Dashboard → **Webhooks** → **Histórico de notificações** (últimas 24h).

Esperado: status `Sucesso (200)`. Se `Erro 4xx/5xx`, anotar código + timestamp e correlacionar com logs CF Pages.

### 4. Compare `payment_logs` com MP

```sql
-- Últimos 10 eventos em payment_logs
SELECT created_at, tenant_id, evento, raw_payload->'status' AS mp_status
FROM payment_logs
ORDER BY created_at DESC
LIMIT 10;
```

```bash
# Subscriptions ativas no MP (compare com payment_logs)
curl -s -H "Authorization: Bearer $MP_ACCESS_TOKEN" \
  "https://api.mercadopago.com/preapproval/search?status=authorized&limit=20" \
  | jq '.results[] | {id, payer_email, status, last_modified}'
```

Discrepância grande (ex: MP tem 50 subs ativas, `payment_logs` parou há 2 dias) → confirma webhook breakdown.

## Ação A — Webhook URL não configurado / errado

1. MP Dashboard → **Webhooks** → **Editar**.
2. URL: `https://inkflowbrasil.com/api/mp-ipn`.
3. Eventos: marcar `payment` E `subscription_authorized_payment` E `subscription_preapproval` (todos os 3).
4. Salvar.
5. Trigger teste no próprio dashboard (botão "Enviar notificação de teste").
6. Verificar chegada nos logs CF Pages:
   ```bash
   wrangler pages deployment tail --project-name=inkflow-saas | grep "mp-ipn"
   ```

## Ação B — Endpoint retorna 5xx

```bash
# Logs últimas 24h filtrando erros
wrangler pages deployment tail --project-name=inkflow-saas | grep -E "mp-ipn.*(error|500|exception)" | head -30
```

Causas comuns + remediação:

- **Schema mudou em `payment_logs` ou `tenants`:** migration nova quebrou insert. Verificar última migration aplicada (Supabase dashboard → Migrations). Se for o caso: revert migration (ver `rollback.md`) ou ajustar handler em `functions/api/mp-ipn.js` + redeploy.
- **`MP_ACCESS_TOKEN` expirou/foi revogado:** `GET /preapproval/<id>` falha 401. Rotacionar token (ver `../secrets.md` → seção *Procedure de rotação*).
- **`SUPABASE_SERVICE_KEY` revogada:** PATCH/INSERT no Supabase falha 401. Rotacionar e redeploy.
- **Bug de código novo:** se houve deploy recente, `git log --oneline -5` e considerar `rollback.md`.

Resolver root cause e redeploy:
```bash
git push origin main  # se fix em código
# Ou pra hotfix imediato com env var:
echo "<novo-valor>" | wrangler pages secret put NOME_DA_VAR --project-name=inkflow-saas
```

## Ação C — Assinatura inválida (401)

Endpoint `/api/mp-ipn` valida HMAC SHA-256 com `MP_WEBHOOK_SECRET`. Se MP rotacionou o secret no dashboard, nossa env fica desalinhada.

```bash
# Confirmar valor atual no MP dashboard
# MP Dashboard → Webhooks → Editar → "Chave secreta" (clicar em "Mostrar")

# Atualizar em CF Pages
echo "<novo-webhook-secret>" | wrangler pages secret put MP_WEBHOOK_SECRET --project-name=inkflow-saas

# Forçar redeploy (secret novo só vale após reload do isolate)
git commit --allow-empty -m "chore: redeploy pra pegar novo MP_WEBHOOK_SECRET"
git push origin main
```

Após redeploy:
```bash
# Trigger teste do MP dashboard
# Verificar nos logs
wrangler pages deployment tail --project-name=inkflow-saas | grep "mp-ipn" | tail -5
# Esperado: "200" e payload aceito
```

## Ação D — 200 OK mas comportamento errado

Endpoint aceita request mas não atualiza `tenants` / `payment_logs` corretamente.

Investigar:
```bash
# Logs com payload completo
wrangler pages deployment tail --project-name=inkflow-saas | grep -A 5 "mp-ipn"

# Casos comuns:
# - type=payment com external_reference de agendamento (sinal): roteado pra processMpSinal — OK, não toca tenants
# - type=preapproval mas tenant não encontrado em mp_subscription_id: pagamento órfão — investigar
# - status MP novo não mapeado (ex: "in_process"): adicionar mapeamento em mp-ipn.js
```

## Reprocessar eventos perdidos (backfill)

MP guarda histórico. Pra ressincronizar tenants após resolver webhook:

```bash
# Listar todas subscriptions ativas
curl -s -H "Authorization: Bearer $MP_ACCESS_TOKEN" \
  "https://api.mercadopago.com/preapproval/search?status=authorized&limit=100" \
  | jq -r '.results[] | [.id, .payer_email, .status, .last_modified] | @tsv' > mp_subs.tsv

# Para cada linha, comparar com Supabase via SQL
# (script manual ou query direta no Supabase dashboard)

# Estratégia simplificada: forçar PATCH no Supabase pra cada tenant ativo no MP
# matchando por mp_subscription_id ou email
```

Decisão:
- **Backfill completo:** insert em `payment_logs` cada evento perdido (mais correto auditavelmente, mais trabalho).
- **Realinhar status apenas:** PATCH `tenants.status_pagamento` pra refletir estado MP atual (mais barato, perde histórico granular).

Em outage curto (<24h): realinhar status. Em outage longo (>3d): backfill se for crítico pra auditoria fiscal.

## Verificação

```bash
# 1. Trigger webhook teste do MP dashboard
# (botão "Enviar notificação de teste" no MP)

# 2. Conferir chegada
wrangler pages deployment tail --project-name=inkflow-saas | grep "mp-ipn" | tail -5
# Esperado: 200 + log de processamento

# 3. payment_logs registra
# Supabase dashboard → SQL editor:
# SELECT * FROM payment_logs ORDER BY created_at DESC LIMIT 5;

# 4. Aguardar pagamento real (ou simular via cartão sandbox MP) e ver chegada
```

## Critério de "resolvido"

- ✅ Webhook teste do MP dashboard chega + retorna 200 nos logs CF Pages
- ✅ `payment_logs` registra evento teste (linha nova com `created_at` recente)
- ✅ Webhook delivery history MP dashboard sem erros novos por 30 minutos
- ✅ `tenants.status_pagamento` realinhado com MP (counts batem ou diferença explicada)

## Pós-incidente

- [ ] Nota incidente: `incident_inkflow_<YYYY-MM-DD>_mp-webhook-down.md` (causa-raiz, duração, tenants afetados, valor financeiro impactado se aplicável).
- [ ] Atualizar `[[InkFlow — Painel]]` seção 🐛 Bugs / Incidentes.
- [ ] Telegram: `[mp-webhook-resolved] backfill: <N tenants ressincronizados>. Causa: <breve>. Duração: <X>.`
- [ ] Se causa-raiz é gap de validação (ex: secret rotacionado sem aviso): documentar em backlog "alerta proativo MP secret expiry".
- [ ] Se causa-raiz é deploy buggy: avaliar adicionar smoke test pós-deploy (`curl /api/mp-ipn` com payload mínimo aceito).
- [ ] Se backfill foi necessário: criar issue/nota com lista de tenants tocados pra auditoria.
