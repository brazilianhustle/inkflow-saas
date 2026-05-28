# Matriz De Extracao Operacional

Data: 2026-05-27

Objetivo: transformar o mapa de extracao em uma matriz operacional para a reconstrucao controlada do InkFlow Platform.

Esta matriz define o que extrair do repo atual, qual decisao tomar, para onde levar no novo repo, qual risco controlar, qual teste exigir e qual criterio de pronto usar.

## Legenda

```text
COPIAR      = migrar com revisao e testes.
REESCREVER  = preservar conceito, nao a implementacao atual.
ARQUIVAR    = manter como historico, nao como base ativa.
REFERENCIAR = usar como fonte de entendimento/decisao.
INVESTIGAR  = auditar antes de decidir.
```

## Matriz Executiva

| Frente | Origem Atual | Decisao | Destino Alvo | Risco Principal | Teste Obrigatorio | Criterio De Pronto | Dependencias |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bot Premium | `functions/_lib/conversation-*`, `workflow-manager`, `escalation-manager`, `functions/api/agent/**`, prompts, tests agent/prompt, `docs/atendimento-premium/**` | COPIAR/REESCREVER por camada | `services/bot-runtime`, `packages/conversation-engine`, `packages/workflow`, `vault/bot-premium` | Migrar comportamento sem preservar validacao real | Unit + contract + HTTP radar + WhatsApp real | Bot tem contratos, vault curado e smoke real como gate definitivo | Tenant Config, Observability, Workflow, Media |
| Tenant Config | `tenant-context-manager.js`, `update-tenant.js`, `pricing.js`, `tenants.config_agente`, `tenants.config_precificacao` | REESCREVER COM BASE | `packages/tenant-config`, `packages/domain`, schema Supabase novo | JSON livre continuar mandando no produto | Unit + contract + fixture por tenant | Schema versionado cobre voz, servicos, estilos, horarios, canais, pricing e handoff | Domain, Painel, Bot |
| Painel Do Estudio | `studio.html`, APIs de tenant, billing, evolution | REESCREVER | `apps/studio-panel` | Herdar HTML monolitico e UI sem contrato | Component/e2e + auth/RBAC + contract com tenant config | Painel edita config via schema, com validacao e permissao | Tenant Config, Auth, Billing |
| Onboarding | `onboarding.html`, `create-tenant`, `evo-create-instance`, billing/start trial | REESCREVER COM BASE | `apps/onboarding`, `services/provisioning` | Criar tenant parcialmente configurado | Integration + provisioning dry-run + rollback checklist | Tenant nasce com config minima, billing/trial e WhatsApp lifecycle claros | Billing, Evolution, Tenant Config |
| Admin Console | `admin.html`, audit endpoints, tenant tools | REESCREVER | `apps/admin-console`, `packages/security-auth` | Admin sem RBAC/auditoria | RBAC tests + audit log tests | Admin tem papeis, trilha de auditoria e acesso minimo necessario | Auth, Observability |
| Billing | `plans.js`, `mp-token.js`, `mp-sinal-handler.js`, `create-subscription`, `mp-ipn`, `payment_logs` | COPIAR/REVISAR | `services/billing`, `packages/integrations/mercadopago`, `packages/domain/billing` | Status de pagamento solto controlar produto de forma inconsistente | Unit + integration mock/sandbox + auditor billing | Entitlements formais: trial, ativo, inadimplente, cancelado, bloqueado | Tenant, Admin, Onboarding |
| Dados/LGPD | `termos.html`, `conversas`, `chat_messages`, `dados_cliente`, `audit_*`, cleanup docs | REESCREVER GOVERNANCA | `packages/legal-data-governance`, `docs/legal`, `docs/security`, migrations novas | LGPD virar pagina estatica sem operacao | Checklist LGPD + data flow + retention tests | Inventario de dados, retencao, export/delete, consentimento e incidente documentados | Supabase, Auth, Observability |
| Observabilidade/Auditoria | `agent-turn-logger.js`, `audit-state.js`, `auditors/**`, `docs/canonical/auditores.md`, tail/smoke | COPIAR/EXPANDIR | `packages/observability`, `services/audit-worker`, `docs/operations` | Nao saber por que o bot decidiu algo | Unit + event contract + auditor tests | Evento minimo por turno com trace, router, policy, workflow, resolver, side effects | Bot, Workflow, Supabase |
| Media Intelligence | `foto-classifier.js`, media pipeline, tests/evidencias de imagem | REESCREVER COM CONTRATO | `packages/media-intelligence`, `tests/evals/media`, `tests/whatsapp-real/media` | Classificacao generica/alucinada de imagem | Eval media + WhatsApp real media + contract | Categorias explicitas: local limpo, tattoo existente, referencia, cobertura, duvida, irrelevante | Bot, OpenAI/Vision, Observability |
| Orcamento/Proposta | `budget-items-manager.js`, `budget-proposal-manager.js`, `handoff-package.js`, Telegram callbacks | COPIAR/REVISAR | `packages/domain/budget`, `packages/pricing`, `services/notifications` | Multiplos itens/sessoes virarem respostas quebradas | Unit + Telegram real + WhatsApp real proposta | Suporta 1/N tattoos, 1/N sessoes, resposta agregada ao cliente | Telegram, Bot, Pricing |
| WhatsApp/Evolution | `evolution-parser.js`, `evolution-send.js`, `evo-*`, `whatsapp-pipeline.js`, SessionQueue | COPIAR/REESCREVER | `services/bot-gateway`, `packages/integrations/evolution` | Gateway manter regra de negocio demais | Integration mock + real smoke central->bot | Gateway so normaliza, enfileira e entrega turnos; dominio fica fora dele | Bot Runtime, Observability |
| Telegram | `telegram.js`, `telegram-media.js`, webhook/callback endpoints | COPIAR/REVISAR | `packages/integrations/telegram`, `services/notifications` | Handoff/orcamento chegar sem estrutura ou duplicado | Integration + Telegram real | Mensagens e callbacks usam trace, referencias e contrato de budget/handoff | Budget, Escalation, Observability |
| Supabase | `supabase/migrations`, `baseline-schema.sql`, schema atual | REFERENCIAR/RECONSTRUIR | `infra/supabase`, migrations novas, baseline restorable | Migrar divida de schema/RLS sem perceber | Migration test + RLS check + restore drill | Baseline restorable, RLS por tenant, migrations ordenadas, rollback | Domain, Legal, Auth |
| CI/CD | `.github/workflows`, `wrangler.toml`, deploy scripts, eval gates | COPIAR/REVISAR | `.github/workflows`, `infra/cloudflare`, repo novo | CI dar falso verde sem gates reais | CI + build + test + contract gates | Pipeline separa docs, unit, contract, eval, preview e deploy | Stack decision |
| Smoke Real | `scripts/smoke/**`, `smoke-inbound`, `smoke-verify`, evidencias | COPIAR/REVISAR | `tests/whatsapp-real`, `tools/smoke`, `docs/operations/smoke` | Voltar a validar conversa so por HTTP | HTTP radar + WhatsApp real + evidence summary | Nenhum comportamento conversacional fecha sem prova real quando aplicavel | Bot, Evolution, Observability |
| Vault/Docs | `docs/atendimento-premium`, `docs/canonical`, `docs/auditoria`, `docs/superpowers` | REFERENCIAR/CURAR/ARQUIVAR | `vault/bot-premium`, `docs/decisions`, `docs/operations`, `archive` | Levar excesso de historico e consumir contexto | Review manual + index resumido | Vault ensina estado atual sem depender de ler logs brutos | Todos |

## Detalhamento Por Frente

### 1. Bot Premium

Decisao: migrar por camada, nao como copia direta do hot path.

O que aproveitar:

- contratos de router/policy/workflow/escalation;
- testes que protegem comportamento;
- metodologia de WhatsApp real;
- prompts/evals como referencia.

O que nao aproveitar cru:

- `whatsapp-pipeline.js` como centro de toda decisao;
- `route.js` como arquivo concentrador de fallback;
- prompts como autoridade de regra critica.

Pronto quando:

- bot runtime tiver fronteiras claras;
- cada transicao vier do Workflow Manager;
- cada decisao tiver evento observavel;
- WhatsApp real continuar gate definitivo.

### 2. Tenant Config

Decisao: primeira frente recomendada para implementacao real futura.

Motivo:

- destrava bot e painel;
- reduz configuracao solta;
- aumenta personalizacao premium;
- permite testes sem tocar producao.

Contrato minimo:

- `tenant_identity`;
- `studio_services`;
- `style_policy`;
- `pricing_policy`;
- `schedule_policy`;
- `handoff_policy`;
- `voice_policy`;
- `channel_policy`;
- `legal_policy`;
- `automation_flags`.

Pronto quando:

- schema versionado existir;
- fixtures representarem estudio padrao e estudio customizado;
- painel e bot puderem consumir o mesmo contrato.

### 3. Painel Do Estudio

Decisao: reescrever depois dos contratos.

Regra:

```text
UI nasce dos contratos; nao contratos da UI.
```

Pronto quando:

- editar configuracao sem quebrar bot;
- validar campos antes de salvar;
- registrar audit event de mudanca importante;
- separar configuracao operacional, billing, WhatsApp e legal.

### 4. Onboarding

Decisao: reescrever com base no fluxo atual.

Risco:

- tenant criado sem config minima;
- Evolution provisionado sem billing/trial coerente;
- falha no meio deixar sujeira operacional.

Pronto quando:

- onboarding tiver etapas idempotentes;
- cada etapa tiver status;
- rollback/cleanup for claro;
- trial/billing/provisioning forem separados.

### 5. Admin

Decisao: reescrever com RBAC.

Pronto quando:

- founder/admin/suporte tiverem permissoes diferentes;
- toda acao sensivel gerar audit event;
- nenhum acesso depender de token legado solto.

### 6. Billing

Decisao: copiar integracao, reestruturar dominio.

Contrato alvo:

- `Plan`;
- `Subscription`;
- `Entitlement`;
- `PaymentEvent`;
- `DunningState`;
- `FeatureAccess`.

Pronto quando:

- produto pergunta "o que este tenant pode fazer?";
- nao apenas "status_pagamento e igual a X?".

### 7. Dados/LGPD

Decisao: transformar legal em sistema operacional.

Pronto quando:

- houver inventario de dados;
- cada dado tiver finalidade e retencao;
- exclusao/exportacao tiver fluxo;
- termos/privacidade refletirem o que o sistema realmente faz;
- PostHog/Sentry/terceiros estiverem listados corretamente quando aplicavel.

### 8. Observabilidade

Decisao: expandir para evento padrao.

Evento minimo:

```text
trace_id
tenant_id
conversation_id
turn_id
router_intent
router_confidence
router_reason
policy_decision
workflow_from
workflow_to
resolver
media_classification
side_effects
response_summary
```

Pronto quando:

- cada smoke conseguir explicar o comportamento sem ler codigo;
- cada falha tiver trace recuperavel.

### 9. Media Intelligence

Decisao: reescrever com contrato e eval.

Categorias alvo:

- `body_location_clean`;
- `body_location_with_existing_tattoo`;
- `tattoo_reference`;
- `possible_cover_up`;
- `ambiguous`;
- `irrelevant`.

Pronto quando:

- foto de braco limpo nao gerar duvida automatica;
- tattoo existente abrir pergunta de cobertura/referencia;
- referencia nao for confundida com local;
- duvida so ocorrer quando o modelo realmente nao tiver confianca.

### 10. Orcamento/Proposta

Decisao: consolidar dominio antes de UI.

Contrato alvo:

- `BudgetRequest`;
- `BudgetItem`;
- `BudgetSession`;
- `QuoteReply`;
- `ProposalMessage`.

Pronto quando:

- uma tattoo, varias tattoos e varias sessoes forem casos nativos;
- Telegram pedir/responder valores de forma estruturada;
- WhatsApp devolver uma resposta agregada, nao mensagens quebradas.

### 11. WhatsApp/Evolution

Decisao: gateway deve ser fino.

Responsabilidades permitidas:

- autenticar origem;
- parsear payload;
- agrupar mensagens;
- baixar midia;
- criar TurnContext;
- chamar runtime;
- enviar resposta.

Responsabilidades proibidas no gateway novo:

- decidir regra de negocio;
- interpretar tenant policy;
- calcular proposta;
- decidir handoff sozinho.

### 12. Telegram

Decisao: notification service com contratos.

Pronto quando:

- callback sabe qual budget/handoff esta respondendo;
- mensagem tem trace;
- multiplos itens/sessoes sao respondidos de forma estruturada;
- falha de callback nao duplica proposta.

### 13. Supabase

Decisao: reconstruir schema alvo com base no historico.

Pronto quando:

- baseline for restorable;
- migrations forem lineares;
- RLS por tenant for default;
- dados sensiveis tiverem politica;
- views/functions tiverem security model revisado.

### 14. CI/CD

Decisao: levar gates, nao acoplamento antigo.

Pronto quando:

- PR de docs nao dispara deploy funcional;
- PR de bot exige tests/evals;
- PR de conversa exige WhatsApp real quando aplicavel;
- PR de DB exige migration/RLS;
- release tem rollback claro.

### 15. Smoke Real

Decisao: preservar como arma principal de validacao conversacional.

Regra:

```text
HTTP production smoke = radar inicial
WhatsApp real = validacao definitiva
Telegram real = validacao definitiva de orcamento/handoff
```

Pronto quando:

- cada scenario gera transcript, julgamento e prova curta Cliente/Bot;
- evidence summary basta para retomar sem ler logs brutos.

### 16. Vault/Docs

Decisao: curar, nao despejar.

Pronto quando:

- houver indice executivo;
- waves tiverem resumo;
- decisoes tiverem link;
- gaps conhecidos estiverem visiveis;
- logs brutos ficarem fora do caminho principal.

## Gaps Que Bloqueiam Criar Repo Novo

Antes de criar repo novo, ainda falta:

- contratos formais da plataforma;
- contrato de tenant config;
- contrato de dados/LGPD;
- contrato de teste;
- decisao de stack;
- criterio de migracao do bot premium;
- politica de freeze/cutover do legado.

## Proximo Artefato

Criar:

```text
06-contratos-plataforma.md
```

Objetivo:

- definir entidades de dominio;
- definir contratos compartilhados;
- preparar `07-tenant-config-contract.md`;
- evitar que o novo repo nasca antes da modelagem.
