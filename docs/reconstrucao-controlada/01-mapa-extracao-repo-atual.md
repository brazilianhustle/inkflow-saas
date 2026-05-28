# Mapa De Extracao Do Repo Atual

Data: 2026-05-27

Objetivo: classificar o repo atual para uma reconstrucao controlada do InkFlow SaaS, sem perder conhecimento, sem herdar divida tecnica desnecessaria e sem depender da memoria da conversa.

## Legenda

```text
COPIAR      = pode migrar com poucos ajustes, preservando comportamento/testes.
REESCREVER  = valor de produto existe, mas implementacao atual nao deve virar base.
ARQUIVAR    = manter como historico, nao como fundacao ativa.
REFERENCIAR = usar como fonte de decisao/documentacao, sem migrar codigo cru.
INVESTIGAR  = precisa auditoria antes de decidir.
```

## Classificacao Executiva

| Area | Destino | Motivo |
| --- | --- | --- |
| `functions/_lib/conversation-router.js` | COPIAR/REVISAR | Ja expressa camada premium de intent, motivo, risco e mutacao. Precisa virar pacote `conversation-engine`. |
| `functions/_lib/conversation-policy.js` | COPIAR/REVISAR | Camada deterministica importante. Deve sair do hot path monolitico e virar policy central. |
| `functions/_lib/workflow-manager.js` | COPIAR/REVISAR | Autoridade de transicao. Deve virar modulo de workflow com contratos explicitos. |
| `functions/_lib/escalation-manager.js` | COPIAR/REVISAR | Handoff humano e risco operacional ja oficializados. Precisa integracao com casos de produto/tenant. |
| `functions/api/agent/_lib/tenant-context-manager.js` | REESCREVER COM BASE | Conceito correto; precisa virar `packages/tenant-config` com schema, versionamento e validacao. |
| `functions/_lib/whatsapp-pipeline.js` | REESCREVER | Hot path real, mas concentra responsabilidades demais. Deve ser decomposto em gateway/orquestrador. |
| `functions/api/agent/route.js` | REESCREVER COM BASE | Orquestracao e agents sao valiosos, mas arquivo concentra muita regra e fallback. |
| `functions/_lib/budget-items-manager.js` | COPIAR/REVISAR | Base para multiplas tattoos/orcamentos. Precisa virar dominio `BudgetRequest/BudgetItem`. |
| `functions/_lib/budget-proposal-manager.js` | COPIAR/REVISAR | Base para proposta agregada e resposta de valores. Precisa suportar sessoes e pacote. |
| `functions/_lib/foto-classifier.js` | REESCREVER COM CONTRATO | Area critica. Precisa contrato de media intelligence: local limpo, referencia, tattoo existente, cobertura, duvida. |
| `functions/_lib/telegram*.js` | COPIAR/REVISAR | Integracao real provada. Precisa virar pacote `integrations/telegram`. |
| `functions/_lib/evolution*.js` | COPIAR/REVISAR | Integracao real provada. Precisa pacote `integrations/evolution` e mocks fortes. |
| `functions/_lib/mp-*`, `plans.js` | COPIAR/REVISAR | Billing existe, mas precisa entitlements, dunning e estados formais. |
| `functions/_lib/telemetry/*` | COPIAR/EXPANDIR | Base de observabilidade existe. Precisa virar evento padronizado de decisao. |
| `functions/api/update-tenant.js` | REESCREVER | Valor funcional alto, mas permissao/campos/config precisam contrato forte e RBAC. |
| `functions/api/create-tenant.js` e onboarding APIs | REESCREVER COM BASE | Fluxo existe; precisa separar onboarding, auth, billing e provisioning. |
| `functions/api/evo-*` | COPIAR/REVISAR | Provisionamento WhatsApp real. Precisa isolamento por tenant e lifecycle formal. |
| `functions/api/cron/*` | COPIAR/REVISAR | Rotinas importantes. Devem virar `services/scheduler`/`audit-worker`. |
| `functions/_middleware.js` | REESCREVER | Sentry existe, mas DSN/config e taxonomia de erro precisam padrao limpo. |
| `supabase/migrations/` | REFERENCIAR/RECONSTRUIR | Historico util, mas novo repo precisa baseline restorable e migrations limpas. |
| `supabase/baseline-schema.sql` | REFERENCIAR | Inventario narrativo, nao dump restorable. Usar para desenho de novo schema. |
| `tests/` | COPIAR/REORGANIZAR | Maior ativo de qualidade. Migrar por contrato, nao por path atual. |
| `evals/` | COPIAR/REVISAR | Base de avaliacao util para bot premium. Integrar com test matrix nova. |
| `scripts/smoke/` | COPIAR/REVISAR | Metodologia real e diferencial. Deve virar framework oficial de validacao. |
| `docs/atendimento-premium/` | VAULT/REFERENCIAR | Memoria principal do bot. Levar como vault curado, nao como docs soltas. |
| `docs/canonical/` | REFERENCIAR/COPIAR PARCIAL | Stack/runbooks/decisions sao base de operacao. Atualizar para plataforma nova. |
| `docs/auditoria/` | REFERENCIAR | Evidencia historica e achados. Usar em risk register. |
| `docs/superpowers/` | ARQUIVAR/REFERENCIAR | Muitos planos longos e historicos. Curar somente decisoes relevantes. |
| `index.html` | REESCREVER | Landing atual nao deve ser base do produto novo. |
| `studio.html` | REESCREVER | Painel deve nascer componentizado e contrato-first. |
| `onboarding.html` | REESCREVER | Fluxo importante, mas implementacao grande estatica nao escala. |
| `admin.html` | REESCREVER | Admin precisa RBAC, auditoria e componentes. |
| `termos.html` | REFERENCIAR/REESCREVER LEGAL | Conteudo inicial, mas precisa trilha legal formal e revisao LGPD. |
| `web/` | INVESTIGAR/BASE PARCIAL | App Next existe, mas nao e producao atual. Avaliar se serve como seed. |
| `cron-worker/` | COPIAR/REVISAR | Dispatcher cron util. Pode virar service separado ou Worker dentro infra. |
| `.github/workflows/` | COPIAR/REVISAR | CI/deploy/evals ja trazem gates importantes. Adaptar para novo monorepo. |
| `n8n` e `docs/canonical/n8n/` | ARQUIVAR | Legado/deprecating. Nao guiar arquitetura nova. |
| `.smoke-evidence`/evidencias brutas | ARQUIVAR/CURAR | Nao importar bruto. Gerar sumarios por wave/cenario. |

## Mapa Por Frente Da Nova Plataforma

### 1. Bot Premium

Extrair de:

- `functions/_lib/conversation-*`
- `functions/_lib/workflow-manager.js`
- `functions/_lib/escalation-manager.js`
- `functions/api/agent/**`
- `functions/_lib/prompts/**`
- `tests/_lib/*conversation*`
- `tests/agent/**`
- `tests/prompts/**`
- `docs/atendimento-premium/**`

Destino novo:

```text
packages/conversation-engine/
packages/workflow/
services/bot-runtime/
vault/bot-premium/
tests/evals/
tests/whatsapp-real/
```

Condicao para migrar: manter WhatsApp real como validacao definitiva.

### 2. Painel Do Estudio

Extrair de:

- `studio.html`
- `onboarding.html`
- `admin.html`
- `functions/api/get-tenant.js`
- `functions/api/update-tenant.js`
- APIs de onboarding, billing e Evolution.

Destino novo:

```text
apps/studio-panel/
apps/onboarding/
apps/admin-console/
packages/tenant-config/
packages/security-auth/
```

Regra: nao copiar HTML grande como fundacao. O painel deve nascer de contratos de configuracao.

### 3. Tenant Config

Extrair de:

- `tenant-context-manager.js`
- `update-tenant.js`
- `pricing.js`
- `tenants.config_agente`
- `tenants.config_precificacao`
- docs canonical e smoke scenarios.

Destino novo:

```text
packages/tenant-config/
packages/domain/
supabase/migrations/
```

Contrato minimo:

- identidade do estudio;
- voz/tom;
- servicos aceitos;
- estilos aceitos/recusados;
- politicas de cobertura;
- precificacao;
- horarios;
- canais;
- Telegram;
- WhatsApp;
- legal/consentimento;
- flags de automacao.

### 4. Orcamento E Proposta

Extrair de:

- `budget-items-manager.js`
- `budget-proposal-manager.js`
- `handoff-package.js`
- Telegram callbacks;
- smoke real de uma tattoo, multiplas tattoos e sessoes.

Destino novo:

```text
packages/domain/budget/
packages/pricing/
services/notifications/
services/bot-runtime/
```

Contrato alvo:

- `BudgetRequest` pode ter 1 ou N `BudgetItem`.
- Cada `BudgetItem` pode ter 1 valor unico ou N sessoes.
- Telegram do tatuador precisa responder item/sessao de forma estruturada.
- Bot precisa responder ao cliente em uma mensagem agregada com intro, valores e CTA.

### 5. Media Intelligence

Extrair de:

- `foto-classifier.js`
- pipeline de midia;
- testes de foto local/referencia;
- evidencias recentes de regressao.

Destino novo:

```text
packages/media-intelligence/
tests/evals/media/
tests/whatsapp-real/media/
```

Contrato alvo:

- local do corpo limpo;
- local do corpo com tattoo existente;
- referencia de desenho;
- duvida controlada;
- cobertura possivel;
- imagem irrelevante.

Nao aceitar resposta generica automatica quando a imagem e claramente local limpo.

### 6. Billing

Extrair de:

- `functions/_lib/plans.js`
- `mp-token.js`
- `mp-sinal-handler.js`
- `create-subscription`
- `mp-ipn`
- `payment_logs`
- auditorias billing.

Destino novo:

```text
services/billing/
packages/integrations/mercadopago/
packages/domain/billing/
```

Contrato alvo:

- trial;
- assinatura ativa;
- inadimplencia;
- cancelamento;
- bloqueio/desbloqueio;
- entitlements por plano;
- historico auditavel.

### 7. Dados E LGPD

Extrair de:

- `termos.html`;
- tabelas `conversas`, `chat_messages`, `dados_cliente`, `audit_*`;
- docs canonical/runbooks;
- politicas de cleanup.

Destino novo:

```text
packages/legal-data-governance/
docs/legal/
docs/security/
supabase/migrations/
```

Contrato alvo:

- inventario de dados;
- finalidade/base legal;
- retencao;
- exportacao/exclusao;
- consentimento;
- suboperadores;
- incidente;
- encarregado/canal de contato;
- trilha de auditoria.

### 8. Observabilidade E Auditoria

Extrair de:

- `agent-turn-logger.js`;
- `audit-state.js`;
- `auditors/**`;
- `docs/canonical/auditores.md`;
- scripts de tail/smoke.

Destino novo:

```text
packages/observability/
services/audit-worker/
docs/operations/
```

Contrato alvo:

- decision event por turno;
- router reason/confidence;
- policy decision;
- workflow transition;
- resolver/agent usado;
- tenant config snapshot;
- media classification;
- side effects;
- Telegram trace;
- smoke evidence id.

### 9. Infra E Operacao

Extrair de:

- `wrangler.toml`;
- `cron-worker/`;
- `.github/workflows/`;
- `scripts/preflight-envvars.sh`;
- `scripts/sync-secrets.sh`;
- runbooks canonical.

Destino novo:

```text
infra/cloudflare/
infra/supabase/
infra/evolution/
docs/operations/runbooks/
```

Contrato alvo:

- staging;
- preview;
- production;
- rollback;
- secrets registry;
- deploy gate;
- health checks;
- auditoria automatica;
- backup/restore.

## O Que Nao Migrar Como Base

Nao usar como fundacao direta:

- HTML monolitico de painel/onboarding/admin.
- n8n como hot path.
- evidencias brutas sem indice.
- migrations antigas como baseline unica.
- config JSONB livre sem schema.
- prompts como autoridade de regra critica.

## Criterio De Pronto Deste Mapa

Este mapa fica completo quando cada frente tiver:

- arquivos fonte atuais;
- destino no repo novo;
- decisao de migracao;
- riscos;
- testes obrigatorios;
- criterio de pronto;
- dono operacional.

