---
title: Cutover total do n8n — código livre de n8n + limpeza
date: 2026-05-14
status: ready-to-plan
branch: feat/cutover-total-n8n
---

# Cutover total do n8n (código + limpeza)

## Contexto

O n8n já saiu do hot path em termos de **processamento** — os dois fluxos que importam
rodam code-first em Cloudflare Pages Functions:

- **Entrada (WhatsApp → bot):** `/api/whatsapp/inbound` + `functions/_lib/whatsapp-pipeline.js` (migrado no Sub-4.1, validado E2E em prod 13/05).
- **Reentrada (tatuador → cliente):** `/api/telegram/reentrada`, chamado por `functions/api/telegram/webhook.js` via `disparaReentrada()`.
- **Crons** (expirar trial, reset agendamentos, monitor WhatsApp): migrados pra Cloudflare Worker desde 21/04.

Mas o n8n ainda está **amarrado ao código** por pontos residuais que impedem chamar o cutover de "completo":

1. `functions/api/evo-create-instance.js` configura o webhook da Evolution de **todo tenant novo** apontando pra `env.N8N_WEBHOOK_URL`, e **falha de propósito** se essa variável estiver ausente (linha ~35). Todo cliente novo nasceria ligado num n8n que não processa mais nada.
2. O parser `functions/_lib/evolution-parser.js` não trata o formato `@lid` (`addressingMode: 'lid'`) usado por números WhatsApp Business novos — mensagens nesse formato são descartadas como `no-telefone`.
3. Variáveis de ambiente mortas (`N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `N8N_REENTRADA_WEBHOOK_URL`), comentários desatualizados em ~8 arquivos, e endpoints que só o n8n chamava e hoje ninguém usa.

**Estado de produção:** existe **1 tenant** — `inkflow_test_sub4` (tenant de teste). Zero cliente real. O risco do cutover é quase nulo.

**Workflow n8n:** `MEU NOVO WORK - SAAS` (id `PmCMHTaTi07XGgWh`), 98 nós, `active: true`, webhook em `https://n8n.inkflowbrasil.com/webhook/inkflow`. Ligado mas sem tráfego real.

## Objetivo

Deixar o **código 100% livre de n8n** e limpo, mantendo o n8n de pé (ocioso) como rede de
segurança. O desligamento físico (desativar workflow + parar container na VPS) é **passo separado**,
fora do escopo desta feature, autorizado pelo Leandro após validação por smoke.

## Não-objetivos (fora de escopo — confirmado com o Leandro)

- Desativar o workflow `MEU NOVO WORK - SAAS` no n8n.
- Parar o container n8n na VPS (`root@104.207.145.47`).
- Remover as env vars `N8N_*` do dashboard CF Pages.

Esses três entram num **runbook entregue por esta feature** (componente 6), prontos pra execução
quando o Leandro autorizar — mas a execução não acontece aqui.

## Decisões de design

### D1 — Fonte da URL do webhook: reaproveitar `AGENT_INTERNAL_BASE_URL`

`evo-create-instance.js` passa a montar a URL do webhook a partir de variáveis que **já existem
e já estão sincronizadas em produção**:

- `AGENT_INTERNAL_BASE_URL` — a URL pública desta aplicação (hoje `https://inkflow-saas.pages.dev`).
- `WEBHOOK_SECRET` — o secret que `/api/whatsapp/inbound` já valida no header `x-webhook-secret`.

URL final do webhook = `${AGENT_INTERNAL_BASE_URL}/api/whatsapp/inbound`.

**Por quê:** zero variável nova pra criar/sincronizar; uma única fonte da verdade pra "onde está
esta aplicação" — quando o domínio migrar pro root `inkflowbrasil.com`, muda-se um lugar só.

Alternativas descartadas: variável dedicada nova `INKFLOW_WEBHOOK_URL` (mais explícito, mais
superfície de gerência); só renomear `N8N_WEBHOOK_URL` → `INKFLOW_WEBHOOK_URL` mantendo a
estrutura (diff mínimo, mas não limpa de verdade).

### D2 — Trava de segurança muda de alvo, não some

`evo-create-instance.js` hoje retorna erro 503 se faltar `N8N_WEBHOOK_URL`. A trava **permanece**
com a mesma intenção protetora (não criar instância Evolution sem webhook válido), mas o alvo
muda: falha se faltar `AGENT_INTERNAL_BASE_URL` ou `WEBHOOK_SECRET`.

### D3 — Lógica de 3 formatos de webhook fica

O bloco que tenta 3 formatos de payload (`WEBHOOK_FORMATS` A/B/C) é quirk da **Evolution API**,
não do n8n. Permanece intacto — só muda a URL/secret que ele usa.

### D4 — Código morto: investigar com rigor antes de remover

`functions/api/kill-switch-detect.js` e `functions/api/tools/prompt.js` são endpoints que só o
workflow n8n chamava. Os endpoints `functions/api/tools/guardrails/pre.js` e `.../post.js` estão
na mesma suspeita. **Antes de remover**, aplicar o método de verificação multi-vetor do PR #64
(imports dinâmicos, grafo intra-dir, barris, refs não-JS, entry points, CI, chamadas internas
via `callTool`). Remover apenas o que for confirmado órfão; o que estiver vivo, fica e tem o
comentário de n8n corrigido.

## Componentes

### C1 — Religar o webhook de onboarding

**Arquivo:** `functions/api/evo-create-instance.js`

- Trocar `N8N_WEBHOOK = env.N8N_WEBHOOK_URL` por URL derivada de `AGENT_INTERNAL_BASE_URL` + `/api/whatsapp/inbound`.
- Trocar `WEBHOOK_SECRET = env.N8N_WEBHOOK_SECRET` por `env.WEBHOOK_SECRET`.
- Atualizar a trava de validação (D2) e a mensagem de log de env vars ausentes.
- Atualizar o comentário de cabeçalho (linha ~6) pra refletir o destino code-first.
- `WEBHOOK_FORMATS` e o fluxo `trySetWebhook`/`findWebhook`/`webhookIsCorrect` ficam.

### C2 — Endurecer o parser pro `@lid`

**Arquivo:** `functions/_lib/evolution-parser.js`

- Quando `key.addressingMode === 'lid'` (ou `key.remoteJid` termina em `@lid`), extrair o telefone
  real de `key.remoteJidAlt` em vez de `key.remoteJid`.
- Manter o skip de grupo (`@g.us`) e o skip `no-telefone` como rede final.

### C3 — Limpeza de variáveis e comentários de n8n

- Remover `N8N_WEBHOOK_URL` e `N8N_WEBHOOK_SECRET` do código (após C1) e de `.env.production.example`.
- Remover `N8N_REENTRADA_WEBHOOK_URL` de `.env.production.example`.
- Corrigir o comentário enganoso em `functions/api/telegram/webhook.js` (~linha 18) que descreve a
  reentrada como fluxo n8n — hoje é `/api/telegram/reentrada` code-first.
- Varrer e corrigir comentários desatualizados de n8n em: `functions/_lib/guardrails.js`,
  `functions/_lib/prompts/index.js`, `functions/api/tools/acionar-handoff.js`,
  `functions/api/tools/enviar-portfolio.js`, `functions/api/cleanup-tenants.js`,
  `functions/api/cron/monitor-whatsapp.js`, `functions/api/cron/reset-agendamentos.js`,
  `functions/api/cron/expira-trial.js`. Comentário deve refletir a realidade code-first (ou sair, se não agregar).

### C4 — Remover código morto que só o n8n usava

- Investigar (D4): `functions/api/kill-switch-detect.js`, `functions/api/tools/prompt.js`,
  `functions/api/tools/guardrails/pre.js`, `functions/api/tools/guardrails/post.js`.
- Remover os confirmados órfãos. Documentar no PR quais foram verificados e por quais vetores.

### C5 — Migrar o tenant de teste

- **Verificar** (não assumir) o webhook Evolution atual do `inkflow_test_sub4` via Evolution API
  (`GET /webhook/find/{instance}`).
- Se ainda apontar pro n8n, re-apontar pro `/api/whatsapp/inbound` com `WEBHOOK_SECRET`.
- Se já estiver correto (patch manual de 13/05), só registrar a verificação.

### C6 — Runbook do desligamento ("desliga depois")

**Arquivo novo:** `docs/canonical/runbooks/decommission-n8n.md`

Passos prontos pra execução manual pós-smoke, na ordem segura:

1. Exportar o JSON do workflow `MEU NOVO WORK - SAAS` (id `PmCMHTaTi07XGgWh`) pra arquivo morto versionado.
2. Desativar o workflow no n8n (`active: false`).
3. Parar o container n8n na VPS (`root@104.207.145.47`).
4. Remover as env vars `N8N_WEBHOOK_URL` / `N8N_WEBHOOK_SECRET` do dashboard CF Pages (prod + preview).
5. Critério de rollback: se algo quebrar antes do passo 3, re-ativar o workflow + re-apontar webhook.

### C7 — Testes

- `tests/_lib/evolution-parser.test.mjs`: casos novos pra `@lid` (com `remoteJidAlt` válido,
  `@lid` sem `remoteJidAlt` → skip, `addressingMode` ausente → comportamento atual intacto).
- Teste novo focado no bloco de configuração de webhook do `evo-create-instance.js` (hoje sem
  cobertura): monta a URL correta a partir de `AGENT_INTERNAL_BASE_URL`, usa `WEBHOOK_SECRET` no
  header, falha cedo se faltar env var (D2).
- Suíte completa tem que continuar verde.

## Fluxo de dados (depois do cutover)

```
Onboarding tenant novo
  → evo-create-instance.js cria instância Evolution
  → configura webhook Evolution → ${AGENT_INTERNAL_BASE_URL}/api/whatsapp/inbound
                                   header x-webhook-secret: WEBHOOK_SECRET

Cliente manda mensagem no WhatsApp
  → Evolution → POST /api/whatsapp/inbound (valida WEBHOOK_SECRET)
  → parseEvolutionPayload (trata @lid via remoteJidAlt)
  → waitUntil(processMessage) → pipeline code-first → resposta via Evolution

Tatuador clica botão no Telegram
  → /api/telegram/webhook → disparaReentrada() → /api/telegram/reentrada → Evolution

n8n: nenhum caminho de código aponta pra ele. Fica de pé, ocioso, como rollback.
```

## Tratamento de erro

- `evo-create-instance.js`: trava de env var (D2) retorna 503 com mensagem clara antes de criar
  qualquer instância. O fluxo `trySetWebhook` já retorna 502 se nenhum formato configurar o
  webhook corretamente — comportamento mantido.
- `evolution-parser.js`: `@lid` sem `remoteJidAlt` cai no skip `no-telefone` existente (rede final).

## Critérios de aceitação

1. Nenhuma referência a `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` ou `N8N_REENTRADA_WEBHOOK_URL` no
   código ou em `.env.production.example`.
2. `grep -ri "n8n" functions/` retorna apenas: o nome de tabela `n8n_chat_histories` e comentários
   que descrevem corretamente a história ("migrado do n8n") — nenhum comentário que descreva n8n
   como dependência viva.
3. `evo-create-instance.js` configura o webhook da Evolution pra `/api/whatsapp/inbound`.
4. Parser trata `@lid` corretamente (coberto por teste).
5. Endpoints órfãos confirmados removidos; sobreviventes com comentário corrigido.
6. Webhook do `inkflow_test_sub4` verificado (e re-apontado se necessário).
7. `docs/canonical/runbooks/decommission-n8n.md` existe e está completo.
8. Suíte de testes verde, incluindo os casos novos.

## Riscos

- **Reuso de `AGENT_INTERNAL_BASE_URL`:** se essa variável estiver errada/ausente em prod, o
  webhook de tenants novos quebra. Mitigado pela trava D2 + teste C7. Verificar valor em prod
  durante o plano.
- **Remoção de código morto:** risco de remover algo vivo. Mitigado por D4 (verificação multi-vetor).
- **`@lid`:** sem número WhatsApp Business real pra testar end-to-end agora — cobertura via teste
  unitário do parser; validação real fica pro smoke quando houver um número Business.

## Verificação

- Suíte de testes (`npm test`) verde.
- `grep -ri "n8n" functions/ .env.production.example` revisado manualmente contra o critério 2.
- Smoke prod (passo separado, já na fila): mensagem real no `inkflow_test_sub4` chega via
  `/api/whatsapp/inbound` e é respondida.
