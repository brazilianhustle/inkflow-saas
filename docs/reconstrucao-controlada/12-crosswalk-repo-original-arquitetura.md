# Crosswalk Repo Original x Arquitetura Alvo

Data: 2026-05-28

Status: checkpoint estrutural antes de Supabase policy harness, UI framework ou integracoes reais.

## Objetivo

Cruzar o repo original `inkflow-saas` com a arquitetura correta do novo `inkflow-platform`, agora que o novo repo ja possui contratos reais suficientes para comparar com mais precisao.

Este documento nao autoriza copiar codigo legado diretamente. Ele define o que o repo original prova, o que o novo repo ja cobriu, o que ainda falta construir e quais gates impedem avanço prematuro.

## Veredito Executivo

A reconstrucao controlada esta no caminho certo.

O repo original contem muito valor operacional, principalmente no bot premium, smoke real, Evolution, Telegram, Supabase, billing, auditorias e docs de guerra. Mas ele tambem mistura responsabilidades demais no hot path: WhatsApp, pipeline, prompt, banco, side effects, fallback, regra de negocio e validacao real convivem muito proximos.

O novo repo ja esta corrigindo isso com contratos isolados:

- dominio;
- tenant config;
- workflow;
- pricing;
- media intelligence;
- conversation engine;
- response composer;
- bot runtime contract;
- bot orchestrator local;
- adapters simulados;
- audit store local;
- persistence contracts;
- admin local;
- Supabase contract/schema draft;
- auth identity contract.

O ponto critico agora nao e visual. O ponto critico e transformar evidencias do repo original em contratos/testes no repo novo sem trazer acoplamento antigo.

## Regra De Ouro

```text
Repo original prova o comportamento e revela riscos.
Repo novo define a arquitetura e absorve apenas contratos validados.
```

## Crosswalk Por Frente

| Frente | Repo Original | Novo Repo Atual | Decisao | Proximo Gate |
| --- | --- | --- | --- | --- |
| Bot Premium runtime | `functions/_lib/conversation-*`, `functions/api/agent/**`, `workflow-manager`, `escalation-manager`, `guardrails`, prompts | `packages/conversation-engine`, `packages/workflow`, `packages/response-composer`, `packages/bot-runtime-contract`, `services/bot-orchestrator` | Reescrever por contrato, nao copiar hot path | Bot runtime service real local-only antes de Evolution |
| WhatsApp/Evolution | `functions/_lib/evolution-*`, `functions/api/whatsapp/**`, `scripts/smoke/run-real-whatsapp.sh` | `packages/integrations/channel-adapters` simulado | Copiar aprendizado, reescrever gateway fino | Evolution adapter contract + mock integration antes de real |
| SessionQueue/debounce | `cron-worker/src/session-queue.js`, `whatsapp-pipeline.js`, smoke burst 2/3 bolhas | `TurnContext` no contrato runtime, ainda sem gateway real | Reescrever como boundary de entrada | Teste de burst organico antes de WhatsApp real novo |
| Tenant config | `tenant-context-manager.js`, `update-tenant.js`, colunas/configs em Supabase atual | `packages/tenant-config`, `apps/admin/studio-settings`, `tenant_configs` draft | Reescrever com schema-first | Supabase local RLS + painel local persistente |
| Media intelligence | `foto-classifier.js`, testes/evidencias de imagem | `packages/media-intelligence` | Reescrever com categorias canonicas | Eval media + fixture real de braco limpo/tattoo existente/referencia |
| Orcamento/proposta | `budget-items-manager`, `budget-proposal-manager`, `handoff-package`, Telegram callbacks | `packages/pricing`, `response-composer`, `budget_*` draft | Copiar comportamento, reestruturar dominio | Telegram quote contract por item/sessao |
| Telegram/handoff | `telegram.js`, `telegram-media.js`, callbacks, tools de orcamento | Ainda sem adapter real; previsto em notifications/integrations | Reescrever provider como adapter | Notification service simulado antes de Telegram real |
| Observabilidade | `agent-turn-logger`, `audit-state`, auditors, tail/smoke | `packages/observability`, `local-audit-store`, decision events draft | Expandir como contrato obrigatorio | Audit event schema ligado ao runtime e persistence |
| Supabase | `supabase/baseline-schema.sql`, migrations historicas, RLS drift docs | `infra/supabase/draft`, `supabase-local-contract`, `supabase-schema-draft` | Referenciar/reconstruir | Policy test harness local, sem producao |
| Auth/RBAC | `_auth-helpers.js`, studio token endpoints, admin/studio legados | `auth-identity-contract`, `admin-access`, `studio_user_identities` draft | Reescrever | Supabase local auth/RLS simulation |
| Painel | `admin.html`, `studio.html`, endpoints API legados, `web/` Next inicial | `apps/admin` local static + modules | Reescrever depois de contratos | App shell framework so apos persistence/auth gates |
| Billing | `plans.js`, Mercado Pago endpoints, `mp-*`, subscription APIs | `apps/admin/billing-admin`, `payments`, `entitlements`, pricing | Reestruturar dominio, depois adapter | Billing adapter mock/sandbox separado |
| Legal/LGPD | `termos.html`, cleanup docs, audit, dados_cliente/conversas | `apps/admin/legal-admin`, consent/DSR/policy draft | Reescrever como operacao | DSR workflow local + retention jobs |
| Smoke real | `scripts/smoke/**`, docs `atendimento-premium/**`, evidencias | Ainda nao migrado; contrato reconhecido | Copiar metodologia, nao scripts crus | New smoke tools quando gateway real existir |
| CI/CD | `.github/workflows`, wrangler, deploy scripts | CI minimo no novo repo | Copiar com revisao | Gates separados: unit/contract/schema/eval/deploy |
| Docs/vault | `docs/atendimento-premium`, `docs/canonical`, `docs/inkflow-agent`, `docs/superpowers` | `docs/architecture`, `docs/operations`, futuro `vault/bot-premium` | Curar e resumir | Vault indexado por frente, nao dump bruto |

## O Que Ja Esta Estruturalmente Coberto No Novo Repo

### Plataforma base

Coberto:

- monorepo limpo;
- contratos de dominio;
- contratos de fluxo;
- contratos de pricing;
- contratos de resposta;
- contratos de media;
- contratos de observabilidade;
- runtime local sem provider real;
- adapter simulado;
- audit store local;
- persistence contracts.

Risco reduzido:

- regra de negocio deixar de morar no gateway WhatsApp;
- prompt virar autoridade unica;
- validacao depender apenas de smoke manual;
- estado mudar sem Workflow Manager.

### Admin/control plane

Coberto:

- admin local;
- rotas e permissoes;
- studio settings;
- bot control;
- knowledge admin;
- team admin;
- billing admin;
- legal admin;
- auth identity contract.

Risco reduzido:

- UI nascer sem contrato;
- painel editar JSON livre;
- roles divergirem de schema/RLS;
- billing/legal virarem penduricalhos finais.

### Data plane

Coberto:

- Supabase local contract;
- schema draft;
- rollback draft;
- fixtures locais;
- teste estatico de tenant_id/RLS/audit/secrets/rollback.

Risco reduzido:

- banco real nascer sem tenant isolation;
- secrets entrarem em tabela tenant-facing;
- audit ser mutavel;
- multi-tattoo/multi-sessao nao existir no modelo.

## Gaps Que Ainda Nao Podem Ser Ignorados

### 1. Supabase policy harness ainda nao existe

O schema draft e bom, mas ainda e estatico. Ele nao prova comportamento real de RLS.

Precisa provar localmente:

- tenant A nao le tenant B;
- usuario revogado perde acesso;
- viewer nao escreve;
- artist nao altera billing/legal/security;
- audit nao atualiza/deleta;
- service role fica restrito ao backend.

### 2. Bot gateway real ainda nao existe no novo repo

O repo novo tem runtime local e adapters simulados, mas ainda nao tem:

- Evolution parser real;
- webhook real;
- debounce real;
- media download real;
- smoke real central -> bot.

Isso e correto por enquanto. Nao deve ser atacado antes de persistence/auth ter checkpoint.

### 3. Telegram/notification service ainda nao existe

O dominio de budget ja suporta multi-item e per-session, mas o ciclo completo com tatuador ainda precisa:

- pacote de handoff estruturado;
- resposta por item/sessao;
- callback idempotente;
- proposta agregada ao cliente.

### 4. Vault do bot premium ainda nao foi curado no novo repo

Nao devemos copiar `docs/atendimento-premium/**` inteiro sem filtro.

Precisamos levar:

- arquitetura atual;
- metodologia de smoke;
- cenarios canonicos;
- failures reais;
- rubricas de naturalidade;
- evidencias essenciais.

E arquivar ou referenciar:

- waves antigas repetitivas;
- logs brutos;
- documentos superados.

### 5. UI framework ainda deve esperar

Ainda nao e hora de React/Vite visual.

Motivo:

- auth/RLS ainda nao foi provado;
- persistence real ainda nao existe;
- provider adapters ainda nao existem;
- app shell visual agora pode cristalizar fluxo errado.

## Sequencia Recomendada A Partir Daqui

### Passo 1 - Supabase Policy Harness Checkpoint

Antes de executar qualquer Supabase local, decidir:

- usar Supabase CLI/Docker local ou teste SQL estatico aprimorado;
- onde ficam envs locais;
- como garantir que nao toca producao;
- como registrar rollback;
- como rodar em CI depois.

Resultado esperado:

- documento de checkpoint;
- nenhum provider real;
- nenhuma migration em producao.

### Passo 2 - Supabase Policy Harness Local

Se aprovado:

- executar schema draft em ambiente local;
- criar usuarios/tenants fixture;
- testar RLS de verdade;
- testar audit append-only;
- testar revogacao;
- testar roles.

Resultado esperado:

- `npm test` cobrindo policy behavior real/local;
- schema draft promovivel para migration draft, ainda sem producao.

### Passo 3 - Notifications/Handoff Contract

Atacar Telegram sem provider real:

- contrato de handoff package;
- quote reply parser por item/sessao;
- proposta agregada;
- idempotencia de callback.

### Passo 4 - Bot Gateway Contract

So depois:

- Evolution inbound contract;
- debounce/burst contract;
- media ingestion contract;
- real WhatsApp smoke harness migrado com provas.

### Passo 5 - UI App Shell

Quando auth/persistence estiver provado:

- iniciar framework do painel;
- conectar a view models;
- manter design visual ainda contido.

## Stop Conditions

Parar se qualquer uma destas tentacoes aparecer:

- copiar `whatsapp-pipeline.js` como base do novo gateway;
- rodar migration real em Supabase atual;
- mover secrets para repo novo;
- criar painel visual antes de auth/RLS;
- adaptar UI ao schema antigo;
- validar fluxo conversacional novo sem WhatsApp real quando o gateway existir;
- copiar docs/waves inteiras sem curadoria.

## Decisao

Prosseguir com checkpoint do `supabase-policy-test-harness` antes de executar qualquer comando Supabase local.

O caminho esta coerente porque:

- o novo repo ja tem contratos suficientes para mapear banco;
- auth identity ja corrigiu gap real de roles;
- schema draft ainda precisa prova comportamental;
- executar provider real agora aumentaria risco sem ganho proporcional.
