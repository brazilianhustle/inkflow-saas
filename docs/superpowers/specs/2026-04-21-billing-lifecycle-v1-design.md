# InkFlow Billing Lifecycle v1 — Design

**Date:** 2026-04-21
**Status:** Approved for implementation
**Author:** Claude + Leandro

## Context

Hoje o site InkFlow tem 4 planos a R$ 1 (valores de teste) e o "plano teste" é usado ambiguamente como trial/dev. Não há expiração automática, não há notificação de pagamento, e a precificação real ainda não entrou no ar. Enquanto isso, o site está ao vivo e pode receber signups reais a qualquer momento.

Este spec define a v1 do ciclo de vida de billing: precificação real, free trial limpo, expiração automática com feedback, e notificação operacional ao fundador.

## Goals

1. Corrigir a precificação exibida no site (risco de venda a R$ 1 por bug)
2. Substituir "plano teste" por free trial 7 dias sem cartão
3. Desativar automaticamente após 7 dias + enviar mensagem profissional pedindo feedback e oferecendo continuar
4. Notificar o fundador (Leandro) via Telegram a cada pagamento autorizado
5. Grandfathering dos primeiros 100 clientes (preservar preço original pra sempre)

## Non-goals (fora do escopo v1)

- Migração de planos (upgrade/downgrade entre tiers)
- Cobrança anual com desconto
- Dunning management (retry em cartão falhado)
- Multi-currency
- Referral / cupons

## Key decisions

### D1 — Precificação

Preços reais: **R$ 197 / 497 / 997/mês** (individual / estúdio / premium).

**Rationale:** Valores já presentes como comentários no código (`create-subscription.js`). Padrão brasileiro pra SaaS mid-market com mensagem "me atende clientes". Alternativa descartada: preços agressivos (97/247/497) sacrifica MRR por conversão que ainda não está provada.

### D2 — Grandfathering

Primeiros 100 clientes mantêm preço contratado "pra sempre", usando comportamento natural do Mercado Pago: `transaction_amount` fica travado na `preapproval` no momento da assinatura. Mudar `PLANOS[plano].valor` no código só afeta novos clientes.

**Reforço defensivo:** nova coluna `tenants.preco_mensal INTEGER` grava o valor contratado explicitamente no schema, não derivado do nome do plano. Isso protege contra erro humano (alguém muda o objeto `PLANOS` sem pensar) e dá observabilidade.

### D3 — Cláusula de reajuste nos Termos

Adicionar ao `termos.html`: reajuste anual opcional por IPCA a partir do 13º mês, com aviso prévio de 30 dias e direito de rescisão sem multa. Preserva flexibilidade futura sem prometer reajuste obrigatório.

### D4 — Free trial sem cartão (7 dias)

Rationale: público do InkFlow é dono de estúdio de tatuagem — pequeno empresário, desconfiado de SaaS. Fricção no cadastro derruba conversão de signup drasticamente. Card-upfront (padrão Pipedrive/Hubspot) converte trial→pago mais alto mas perde volume no topo do funil.

Trade-off aceito: conversão trial→pago mais baixa (20-30% vs 60-80%) em troca de volume de signups maior.

**Rename operacional:** `plano='teste'` → `plano='trial'`. Código aceita ambos por 2 semanas (transição), depois remove `teste`.

### D5 — Canal de mensagem de expiração

**Email via MailerLite** (grátis até 1.000 subscribers / 12.000 emails/mês).

Alternativas descartadas:
- **WhatsApp outbound pro celular do dono**: requer instância Evolution dedicada, risco alto de banimento por WhatsApp quando escala, open rate alto mas vira spam
- **Ambos (email + WhatsApp)**: dobra trabalho sem ganho proporcional

MailerLite free tier cobre uso até o SaaS atingir 1.000 estúdios ativos, ponto em que R$ 9/mês de infra é irrelevante.

### D6 — Notificação Telegram

Bot `@inkflow_alerts_bot` (chat_id `8529665470`, privado). Disparado em `mp-ipn.js` quando `status === 'authorized'`. Fail-open: timeout/erro não bloqueia o IPN (pagamento é mais importante que notificação).

## Architecture

### Data flow — trial lifecycle

```
[1] Signup sem cartão (dia 0)
     create-tenant.js grava:
       plano='trial', trial_ate=now+7d,
       status_pagamento='trial', ativo=true
     MailerLite: subscriber → grupo "Trial Ativo"
     → dispara automation Dia 2 (warm-up) e Dia 5 (warning)

[2] Dia 5 — MailerLite automation
     Email: "faltam 2 dias, viu esses resultados?"

[3] Dia 7+ — cron /api/cron/expira-trial roda 09:00 BRT diário
     SELECT tenants WHERE status_pagamento='trial' AND trial_ate < NOW()
     PATCH: ativo=false, status_pagamento='trial_expirado'
     MailerLite: unassign do grupo "Trial Ativo", assign no "Trial Expirou"
     → dispara automation de expiração imediato

[4] Dia 14 — MailerLite automation (dia 7 após expiração)
     Email: "last chance, desconto 10% se voltar esta semana"

[5] Signup paga (qualquer momento)
     mp-ipn.js recebe preapproval → status='authorized':
       ativo=true, status_pagamento='authorized', trial_ate=null,
       preco_mensal=<PLANOS[plano].valor>
     MailerLite: move pra "Clientes Ativos"
     Telegram: POST 🟢 Novo pagamento
```

### Componentes novos

| Componente | Responsabilidade | Interface |
|---|---|---|
| `functions/_lib/telegram.js` | Helper `sendTelegramAlert(env, text)` — POST pra Bot API, fail-open | `async sendTelegramAlert(env, text: string): Promise<{ok: boolean}>` |
| `functions/api/cron/expira-trial.js` | Cron diário. Query trials vencidos + PATCH + MailerLite group move | Auth header `Bearer <CRON_SECRET>`, POST sem body |
| `functions/_lib/trial-helpers.js` | Helpers compartilhados: `calculateTrialEnd()`, `moveToMailerLiteGroup()` | Puro, testável |

### Componentes alterados

| Arquivo | Mudança |
|---|---|
| `functions/api/create-subscription.js` | `PLANOS` volta pra valores reais. Quando `plano==='trial'`: grava `trial_ate`, `status_pagamento='trial'`, add MailerLite grupo Trial Ativo. Quando pago: grava `preco_mensal`. |
| `functions/api/create-tenant.js` | Aceita `plano='trial'` além dos existentes |
| `functions/api/public-start.js` | Aceita `plano='trial'` |
| `functions/api/evo-create-instance.js` | `isFreeTrial = plano === 'trial' \|\| plano === 'teste'` (transição) |
| `functions/api/mp-ipn.js` | Quando `authorized`: Telegram alert, grava `preco_mensal`, zera `trial_ate`, move MailerLite |
| `functions/_lib/mp-sinal-handler.js` | Nenhuma (só SaaS billing afeta) |
| `index.html` | Linha ~455: `price-value` 1 → 197. Linha ~476: 1 → 497. Linha ~496: 1 → 997. Badge "7 dias grátis" em cada card. Novo CTA "Começar grátis 7 dias" antes do "Começar agora". |
| `termos.html` | Adiciona cláusula de reajuste IPCA (seção nova) |
| `admin.html` | Adiciona coluna "Trial até" visível no listing (já existe em edit, só replicar no grid) |

### Schema changes

**1 migration:**

```sql
ALTER TABLE public.tenants
  ADD COLUMN preco_mensal INTEGER;

COMMENT ON COLUMN public.tenants.preco_mensal IS
  'Valor mensal contratado em BRL (centavos ou inteiros — definir). Travado no momento da assinatura MP. Protege grandfathering.';
```

Unidade: inteiros em reais (197 = R$ 197). Não centavos. Motivação: planos não têm centavos, aritmética simples, legível no DB browser.

Valores de `status_pagamento` não precisam de migration (coluna é `text`): adicionamos `'trial'` e `'trial_expirado'` no código apenas.

## Backend implementation — detail

### `functions/_lib/telegram.js` (novo)

```js
// Helper pra notificações Telegram. Fail-open: não quebra caller se timeout.
export async function sendTelegramAlert(env, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('telegram: env vars ausentes, pulando alert');
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      signal: AbortSignal.timeout(3000),
    });
    return { ok: res.ok };
  } catch (e) {
    console.error('telegram: send failed:', e.message);
    return { ok: false, error: e.message };
  }
}
```

### `functions/api/cron/expira-trial.js` (novo)

Estrutura espelha `cleanup-tenants.js` (auth via CRON_SECRET, fetch do Supabase, loop, log).

Pseudo:
```
1. Auth header Bearer CRON_SECRET
2. SELECT tenants WHERE status_pagamento='trial' AND trial_ate < now() AND ativo=true
3. Pra cada tenant:
   a. PATCH ativo=false, status_pagamento='trial_expirado'
   b. Remove do MailerLite grupo "Trial Ativo" (via API)
   c. Add ao MailerLite grupo "Trial Expirou"
4. Retorna { expired: N, failures: [...] }
```

Trigger externo: UptimeRobot ou n8n cron 09:00 BRT diário POSTando com header CRON_SECRET. (O user configura no lado dele depois — spec não obriga plataforma específica.)

### `functions/api/mp-ipn.js` — diff proposto

Dentro do bloco `if (type === 'preapproval' ...)`, após o PATCH no tenant, adicionar:

```js
if (ativo) {
  // 1. Move MailerLite de Trial Expirou/Ativo → Clientes Ativos
  await moveToMailerLiteGroup(env, tenantId, 'clientes_ativos');

  // 2. Grava preco_mensal (trava grandfathering)
  const PLANOS_PRECO = { trial: 0, individual: 197, estudio: 497, premium: 997 };
  const tenant = await fetchTenant(env, tenantId); // lê nome_estudio, email, plano
  await patchTenant(env, tenantId, { preco_mensal: PLANOS_PRECO[tenant.plano] });

  // 3. Telegram alert
  const msg = [
    `🟢 *Novo pagamento InkFlow*`,
    `━━━━━━━━━━━━━━━`,
    `Estúdio: ${tenant.nome_estudio || '?'}`,
    `Plano: ${tenant.plano} (R$ ${PLANOS_PRECO[tenant.plano] ?? '?'})`,
    `Email: ${tenant.email || sub.payer_email || '?'}`,
    `Sub ID: \`${id}\``,
  ].join('\n');
  await sendTelegramAlert(env, msg);
}
```

### `functions/api/create-subscription.js` — mudança

```diff
 const PLANOS = {
-  teste:      { nome: 'InkFlow Teste',       valor:   1.00 },
-  individual: { nome: 'InkFlow Individual',  valor:   1.00 },
-  estudio:    { nome: 'InkFlow Estúdio',     valor:   1.00 },
-  premium:    { nome: 'InkFlow Estúdio VIP', valor:   1.00 },
+  individual: { nome: 'InkFlow Individual',  valor: 197.00 },
+  estudio:    { nome: 'InkFlow Estúdio',     valor: 497.00 },
+  premium:    { nome: 'InkFlow Estúdio VIP', valor: 997.00 },
 };
```

Path `plano === 'trial'` (equivalente ao antigo `'free'`): early return sem ir pro MP, só grava tenant no modo trial.

### Pricing page — HTML diff

Linhas 455, 476, 496 em `index.html`:
```diff
-<span class="price-value">1</span>
+<span class="price-value">197</span>
```
(e 497, 997)

Adicionar badge "7 dias grátis sem cartão" antes do `price-amount` em cada card. CTA duplicado: botão principal "Assinar agora" + secundário "Começar 7 dias grátis" que chama `startCheckout('trial')`.

### Termos — cláusula de reajuste

Nova seção em `termos.html`:

```
8. REAJUSTE DE VALORES

8.1 As mensalidades poderão ser reajustadas anualmente a partir do
décimo terceiro (13º) mês de contrato, com base no IPCA/IBGE acumulado
dos últimos 12 meses.

8.2 O reajuste será comunicado ao CONTRATANTE com antecedência mínima
de 30 (trinta) dias, por email cadastrado.

8.3 O CONTRATANTE poderá rescindir o contrato sem multa nos 30 dias
entre a notificação e a data de vigência do novo valor.

8.4 Clientes que aderiram ao plano durante a fase de lançamento
(primeiros 100 estúdios ativos) terão o valor original preservado
pelo tempo que mantiverem a assinatura ativa e contínua.
```

## MailerLite setup (via MCP, sem código)

### Grupos

- **Trial Ativo** — novos signups com `plano='trial'`
- **Trial Expirou** — após cron dia 7
- **Clientes Ativos** — após MP authorized

### Automations (4)

1. **[Trigger: joined Trial Ativo] → +2 dias → email "Como está indo?"**
   - Subject suggestion via `suggest_subject_lines`
   - Body: onboarding leve, link pra admin, 1 tip de uso

2. **[Trigger: joined Trial Ativo] → +5 dias → email "Faltam 2 dias"**
   - Subject: "Ainda dá tempo — seu trial acaba em 2 dias"
   - Body: recap do que o bot fez (N conversas, N orçamentos), CTA "assinar agora"

3. **[Trigger: joined Trial Expirou] → imediato → email expiração**
   - Subject: "Seu trial InkFlow expirou — o que achou?"
   - Body: profissional, pede feedback honesto (textarea link), CTA "quero continuar"
   - Link de feedback: form curto (talvez Typeform ou MailerLite survey)

4. **[Trigger: joined Trial Expirou] → +7 dias → email last-chance**
   - Subject: "Última chance — 10% off se voltar esta semana"
   - Body: desconto promocional, CTA forte

Copy é gerada via `generate_email_content` do MCP, revisada por mim antes de publicar.

## Env vars necessárias (Cloudflare Pages)

Novas:
- `TELEGRAM_BOT_TOKEN=8774271336:AAHNv4A2Kr49FLmnaxoW1pb4pukmPbilJBk`
- `TELEGRAM_CHAT_ID=8529665470`
- `CRON_SECRET` (nova, se ainda não existir) — pro endpoint `/api/cron/expira-trial`
- `MAILERLITE_GROUP_TRIAL_ATIVO` — ID do grupo (preenchido após MCP criar)
- `MAILERLITE_GROUP_TRIAL_EXPIROU` — idem
- `MAILERLITE_GROUP_CLIENTES_ATIVOS` — idem (já existe como `184387920768009398` no código hardcoded; mover pra env var)

Existentes usadas:
- `MAILERLITE_API_KEY` ✓
- `SUPABASE_SERVICE_KEY` ✓
- `MP_ACCESS_TOKEN` ✓
- `SITE_URL` ✓

## Testing plan

### Unit (local)

- `telegram.js`: mock fetch, valida payload format (chat_id, parse_mode, text com `\n`)
- `trial-helpers.js`: `calculateTrialEnd()` retorna ISO 7 dias no futuro

### Integration (staging / manual)

1. **Signup trial:** POST `/api/create-tenant` com plano=trial → confirma `trial_ate` correto, subscriber criado no MailerLite grupo "Trial Ativo"
2. **Cron expiração:** manipula `trial_ate` pra passado em tenant teste → POST `/api/cron/expira-trial` → confirma PATCH + group move
3. **IPN pagamento:** curl simula IPN MP com external_reference=tenant_id → confirma Telegram recebido, `preco_mensal` gravado, grupo MailerLite movido

### Smoke test pós-deploy

- Signup real via landing com plano trial → confirma email dia 0 chegou
- Aguarda 2 dias → confirma email dia 2 chegou
- Admin força `trial_ate` pra passado → força cron → confirma expiration email chega

### E2E

Cadastro novo no ambiente real com email próprio, deixa correr 7 dias, confirma cada touchpoint.

## Rollback plan

**Feature flag:** env var `ENABLE_TRIAL_V2`. Default `true`, mas código checa:

- Se `false`, `create-subscription.js` mantém comportamento antigo (planos a R$1, sem MailerLite automation novo)
- Se `false`, cron endpoint retorna 503 imediato ("disabled")
- Se `false`, mp-ipn pula Telegram

Permite desligar em incidente sem revert de commit. Remove a flag após 30 dias de estabilidade.

## Security

- Token Telegram em env var Cloudflare Pages (não no código)
- CRON_SECRET protege `/api/cron/expira-trial` de invocação externa não autorizada
- `payment_logs` preserva auditoria de mudanças de status
- MailerLite groups não expõem PII além do que já tem no Supabase

## Open questions (para depois da v1, não bloqueiam)

1. Formulário de feedback: Typeform (pago) ou MailerLite survey (free)? Spec assume MailerLite survey.
2. Email dia 2 "warm-up": worth it ou só ruído? **V1 ship com 4 emails (dia 2, dia 5, dia 7+0, dia 7+7)**; se engagement do dia 2 ficar abaixo de 30% open rate após 20 trials, remover.
3. Desconto last-chance (10%): **V1 não cria cupom MP automático.** Email do dia 14 diz "responde esse email e eu libero o desconto" — handoff manual pra Leandro via reply. Cupom automático vira v2.

## Success metrics (primeiros 30 dias)

- Signups trial: baseline
- Emails delivered: ≥ 95% (MailerLite normal)
- Taxa trial→pago: target 25%+ (benchmark B2B no-card)
- Tempo médio de expiração→pagamento: ≤ 48h (mostra que CTA funciona)
- Zero pagamentos sem notificação Telegram (100% reliability)

## Timeline

- Hoje: spec commitado, MailerLite configurado via MCP (~30min), backend changes (~45min), HTML changes (~15min), teste local (~15min). **Total: ~1h45.**
- Deploy: `wrangler pages deploy` com feature flag ON
- Monitoramento: 48h de observação antes de remover `teste` plan legacy

## MailerLite group IDs (capturado 2026-04-21)

- **Trial Ativo**: `185330994354586770`
- **Trial Expirou**: `185330997199373672`
- **Clientes Ativos** (reutilizado do grupo existente "Clientes InkFlow"): `184387920768009398`

## Grupos MailerLite legados (não tocar)

- `184440232841578230` "Donos de Estúdio" — função não-billing, preservar
- `183216843189651148` "InkFlow — Clientes Ativos" — duplicata semântica do `184387920768009398`, deixar quieto (não usar)
