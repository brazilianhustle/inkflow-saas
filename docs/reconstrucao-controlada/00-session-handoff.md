# Session Handoff - Reconstrucao Controlada

Este arquivo e o ponto de retomada rapido para Codex/Claude quando o contexto for compactado ou uma nova conversa iniciar.

## Objetivo Maior

Reconstruir o InkFlow como uma plataforma SaaS profissional, usando o repo atual como terreno de extracao e validacao.

O bot premium continua importante, mas deixa de ser tratado como o produto inteiro. Ele passa a ser um modulo dentro de uma plataforma com painel, tenant config, billing, legal/LGPD, observabilidade, operacao, auditoria, dados e testes reais.

## Decisao Estrategica Atual

Nao seguir apenas "refatorando o repo atual".

Linha escolhida:

```text
repo atual = legado operacional + vault + fonte de extracao
novo repo = fonte da verdade futura da plataforma
```

## Terreno Confirmado

Inventario observado no repo atual:

```text
1016 arquivos versionados
475 docs
169 functions
150 tests
72 evals
41 web
41 scripts
24 supabase
12 .claude
7 cron-worker
4 .github
```

Blocos vivos:

- `functions/`: backend Cloudflare Pages Functions, bot runtime, APIs, integracoes e libs.
- `tests/`: unitarios, integracao, agent, prompt/evals e endpoints.
- `docs/atendimento-premium/`: vault principal do bot premium e metodologia de validacao.
- `docs/canonical/`: stack, flows, runbooks, decisions e metodologia operacional.
- `supabase/`: migrations e baseline narrativo.
- `scripts/smoke/` e scripts de smoke: validacao HTTP, WhatsApp real, tail, cleanup e evidencias.
- `web/`: inicio de app Next, ainda nao e a raiz produtiva.
- arquivos HTML raiz: landing/admin/onboarding/studio/termos estaticos legados em producao.

## Diagnostico Estrategico

Fortalezas:

- Bot premium ja tem camadas fortes: router, policy, workflow, tenant context, escalation, response composer e observabilidade.
- Integracoes reais existem: Evolution, Supabase, Telegram, Mercado Pago, OpenAI, Cloudflare.
- Testes e gates sao maduros para a frente de atendimento.
- Existe memoria operacional rica em docs e waves.

Gaps estruturais:

- UI e painel ainda estao presos em static HTML grande e dificil de evoluir.
- Configuracao do tenant existe, mas precisa virar contrato de produto e dados.
- Hot path do WhatsApp ainda concentra muita responsabilidade.
- Legal/LGPD existe de forma inicial, mas nao como sistema de governanca.
- Evidencias e docs sao ricas, mas ainda precisam de indice executivo para nao consumir contexto demais.
- n8n ainda aparece como memoria/legado e nao deve guiar a arquitetura nova.

## Regra De Continuidade

Ao retomar, nao perguntar "onde paramos" se este arquivo estiver atualizado.

Sequencia obrigatoria:

1. Ler este arquivo.
2. Ler `01-mapa-extracao-repo-atual.md`.
3. Ler `02-arquitetura-total-alvo.md`.
4. Ler `03-governanca-versionamento.md`.
5. Ler `04-plano-acao-reconstrucao.md`.
6. Ler `05-matriz-extracao-operacional.md`.
7. Ler `06-contratos-plataforma.md`.
8. Ler `07-tenant-config-contract.md`.
9. Ler `08-data-governance-contract.md`.
10. Ler `09-test-strategy-contract.md`.
11. Ler `10-decisao-stack-novo-repo.md`.
12. Ler `11-primeiro-slice-novo-repo.md`.
13. Ler `CHANGELOG.md`.
14. Checar `git status --short`.
15. So entao propor ou executar o proximo passo.

## Novo Repo Criado

Local:

```text
/Users/brazilianhustler/Documents/inkflow-platform
```

Commit inicial:

```text
b815ccb chore: scaffold inkflow platform monorepo
```

Escopo executado:

- scaffold monorepo TypeScript/npm workspaces;
- estrutura de apps, services, packages, infra, vault, docs e tests;
- `packages/domain` placeholder;
- `packages/tenant-config` placeholder;
- CI minimo sem deploy;
- README e docs base;
- sem secrets;
- sem codigo legado;
- sem deploy;
- sem Supabase/Evolution;
- sem smoke real.

Validacoes:

- `npm test` PASS no novo repo;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Primeiro Dominio Implementado

Dominio:

```text
packages/tenant-config
```

Commit:

```text
2dbccef feat: implement tenant config contract
```

Escopo:

- defaults canonicos `tenant_config_v1`;
- validacao de enum/campos obrigatorios;
- regra de estilo: `accepted_styles` vazio significa sem restricao;
- `focus_styles` nao bloqueia estilo;
- `rejected_styles` bloqueia;
- snapshots seguros para bot e observabilidade;
- redaction de notas privadas, telefone, instance e chat ids;
- testes unit/contract.

Validacoes:

- `npm test` PASS, 12/12;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo.

## Segundo Dominio Implementado

Dominio:

```text
packages/domain
```

Commit:

```text
266fb02 feat: implement domain contracts
```

Escopo:

- constantes canonicas de estados e enums;
- builders side-effect-free para Tenant, ClientContact, Conversation, Message, MediaAsset, BudgetRequest, BudgetItem, BudgetSession, BudgetQuote e DecisionEvent;
- validacao basica de campos obrigatorios e enums;
- helper de transicao conhecida;
- testes unit/contract.

Validacoes:

- `npm test` PASS, 22/22;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo.

## Terceiro Dominio Implementado

Dominio:

```text
packages/workflow
```

Commit:

```text
23a00ef feat: implement workflow transitions
```

Escopo:

- tabela de transicoes canonicas para conversation, budget e tenant;
- bloqueio seguro de estados desconhecidos;
- transicao idempotente para retries;
- `applyTransition` sem side effects;
- `preserveState` para intents que nao podem mutar estado;
- razoes estruturadas para observabilidade;
- testes unit/contract.

Validacoes:

- `npm test` PASS, 35/35;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo.

## Quarto Dominio Implementado

Dominio:

```text
packages/pricing
```

Commit:

```text
daf54f3 feat: implement pricing foundation
```

Escopo:

- foundation de orcamento/pricing;
- suporte a quote de uma tattoo;
- suporte a multiplos BudgetItems;
- suporte a BudgetSessions por item;
- validacao de cobertura de valores por item/sessao;
- totalizacao estruturada;
- summary agregado para futuro composer;
- formatacao BRL;
- sem calculo automatico de preco final;
- sem Telegram, WhatsApp, banco, API, deploy ou secrets.

Validacoes:

- `npm test` PASS, 45/45;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo.

## Quinto Dominio Implementado

Dominio:

```text
packages/observability
```

Commit:

```text
9c1e812 feat: implement observability contracts
```

Escopo:

- builders/validators de DecisionEvent;
- builders/validators de AuditEvent;
- evidence summary para gates;
- exigencia de prova WhatsApp real quando gate=`whatsapp_real`;
- exigencia de prova Telegram real quando gate=`telegram_real`;
- redaction de telefone, email e secrets;
- sem log provider, banco, API, runtime, deploy ou secrets.

Validacoes:

- `npm test` PASS, 54/54;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo.

## Sexto Dominio Implementado

Dominio:

```text
packages/media-intelligence
```

Commit:

```text
9fb7fac feat: implement media classification contract
```

Escopo:

- contrato puro de classificacao de midia;
- categorias `body_location_clean`, `body_location_with_existing_tattoo`, `tattoo_reference`, `possible_cover_up`, `ambiguous`, `irrelevant`;
- derivacao de next_action;
- regra critica: local limpo com confianca alta vira `accept_as_local_photo`, nao pergunta generica;
- tattoo existente/cobertura pede esclarecimento entre cobertura/referencia;
- referencia vira `accept_as_reference`;
- validacao de confianca e acoes;
- sem modelo vision, WhatsApp, Telegram, banco, API, storage, deploy ou secrets.

Validacoes:

- `npm test` PASS, 62/62;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo.

## Setimo Dominio Implementado

Dominio:

```text
packages/conversation-engine
```

Commit:

```text
2aa9cb0 feat: implement conversation engine contracts
```

Escopo:

- contrato puro de TurnContext/Router/Policy;
- preservacao de multiplas bolhas reais de WhatsApp no turno;
- validacao de bubble_count para impedir drift entre coleta e processamento;
- router result com intent, familia, confianca, resolver, risco e permissao de mutar estado;
- policy decision com action, estado atual, proximo estado, side effects e response_kind;
- lateral answer preserva estado;
- mudanca de ideia pede confirmacao de escopo antes de alterar fluxo;
- handoff passa pelo Workflow Manager;
- transicao bloqueada vira `reject_turn`, sem salto indevido de estado;
- decision trace expoe router, policy, workflow e midia para observabilidade;
- sem LLM, WhatsApp, Telegram, banco, API, storage, deploy ou secrets.

Validacoes:

- `npm test` PASS, 74/74;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Oitavo Dominio Implementado

Dominio:

```text
packages/response-composer
```

Commit:

```text
4dcb87b feat: implement response composer contracts
```

Escopo:

- contrato puro de estrutura de resposta premium;
- controle de saudacao apenas no primeiro contato;
- preservacao de continuidade em conversa ativa;
- resposta de pergunta com acknowledgement + proxima pergunta;
- resposta de mudanca de ideia perguntando se adiciona ou troca a tattoo anterior;
- proposta de uma tattoo com intro, valor e CTA;
- proposta de multiplas tattoos em uma unica resposta;
- proposta por sessoes em uma unica resposta;
- detector de regressao de saudacao repetida;
- formatter basico de local para evitar `no perna`;
- sem LLM, WhatsApp, Telegram, banco, API, storage, deploy ou secrets.

Validacoes:

- `npm test` PASS, 83/83;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Nono Dominio Implementado

Dominio:

```text
packages/bot-runtime-contract
```

Commit:

```text
2e49930 feat: implement bot runtime contract
```

Escopo:

- contrato fino de orquestracao de turno;
- liga turn context, router, policy, response composer, pricing e observability trace;
- decide `can_send_response` e `can_persist_state`;
- lateral responde sem persistir estado;
- mudanca de ideia confirma escopo sem mutar estado;
- proposta multi-item renderiza uma unica resposta;
- handoff cria side effect logico `create_handoff_package`, sem acionar canal externo;
- contexto invalido bloqueia envio e persistencia;
- transicao bloqueada pelo workflow nao persiste estado;
- sem LLM, WhatsApp, Telegram, Supabase, Evolution, banco, API, storage, deploy ou secrets.

Validacoes:

- `npm test` PASS, 91/91;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Primeiro Service Local-Only Implementado

Service:

```text
services/bot-orchestrator
```

Commit:

```text
2de30cb feat: implement local bot orchestrator
```

Escopo:

- orquestrador local-only em memoria;
- recebe turno com multiplas bolhas;
- usa `packages/bot-runtime-contract`;
- cria outbox local quando `can_send_response=true`;
- persiste estado apenas em memoria quando `can_persist_state=true`;
- preserva estado em pergunta lateral;
- confirma mudanca de ideia sem mutar estado;
- mantem proposta multi-tattoo em uma unica mensagem de outbox;
- bloqueia outbox e state mutation quando o turno e invalido;
- gera resumo de execucao local;
- root `npm test` agora inclui `services/*/tests/**/*.test.mjs`;
- sem LLM, WhatsApp, Telegram, Supabase, Evolution, banco, API externa, storage, deploy ou secrets.

Validacoes:

- primeira execucao acusou erro de import relativo no service novo;
- corrigido import de `services/bot-orchestrator` para `../../../packages/...`;
- `npm test` PASS, 97/97;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Primeiro Adapter Simulado Implementado

Pacote:

```text
packages/integrations/channel-adapters
```

Commit:

```text
73e18d2 feat: implement simulated channel adapters
```

Escopo:

- contratos de envelope outbound e inbound;
- recibo de entrega;
- adapter em memoria para WhatsApp, Telegram e internal;
- simulacao de envio sem rede;
- simulacao de falha de provider sem rede;
- validacao de canal, direcao, tipo de mensagem e texto obrigatorio;
- bloqueio de valores com cara de secret em metadata;
- root `npm test` agora inclui `packages/integrations/*/tests/**/*.test.mjs`;
- sem Evolution, Telegram API, WhatsApp real, Supabase, rede, secrets, storage, deploy ou provider real.

Validacoes:

- `npm test` PASS, 105/105;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Integracao Simulada De Canal Implementada

Area:

```text
services/bot-orchestrator -> packages/integrations/channel-adapters
```

Commit:

```text
87d2310 feat: wire orchestrator to simulated channel adapter
```

Escopo:

- `services/bot-orchestrator` agora aceita `outboundAdapter` opcional;
- mantido `receiveTurn` local e sincrono;
- adicionado `receiveTurnAndDeliver` async para entrega simulada;
- entrega simulada so ocorre se o turno for valido e gerar outbox;
- outbound vira `createOutboundEnvelope`;
- adapter simulado devolve delivery receipt;
- snapshot do orchestrator passa a incluir `delivery_receipts`;
- summary passa a incluir `delivery_receipt_count`;
- teste garante que turno invalido nao chama adapter;
- sem Evolution, Telegram API, WhatsApp real, Supabase, rede, secrets, storage, deploy ou provider real.

Validacoes:

- `npm test` PASS, 107/107;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Audit Store Local Implementado

Pacote:

```text
packages/integrations/local-audit-store
```

Commit:

```text
115025f feat: implement local audit store
```

Escopo:

- store/audit log em memoria;
- contratos de audit record;
- registros para `bot_run`, `decision_trace`, `delivery_receipt` e `audit_event`;
- append de bot run, decision trace e delivery receipt;
- filtros por tenant, conversa e tipo de registro;
- summary de contagens e escopos;
- bloqueio de payload com cara de secret;
- sem Supabase, banco, arquivo, rede, secrets, storage real, deploy ou provider real.

Validacoes:

- `npm test` PASS, 113/113;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Audit Store Integrado Ao Orchestrator

Area:

```text
services/bot-orchestrator -> packages/integrations/local-audit-store
```

Commit:

```text
a75b7df feat: record orchestrator runs in local audit store
```

Escopo:

- `services/bot-orchestrator` agora aceita `auditStore` opcional;
- `receiveTurnAndDeliver` registra bot run no audit store;
- turno valido com entrega registra decision trace e delivery receipt;
- turno invalido registra tentativa/run sem receipt e sem chamar adapter;
- comportamento sem audit store permanece compativel;
- sem Supabase, banco real, arquivo, rede, secrets, storage real, provider real ou deploy.

Validacoes:

- `npm test` PASS, 115/115;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Persistence Contracts Implementado

Pacote:

```text
packages/persistence-contracts
```

Commit:

```text
ec76454 feat: implement persistence contracts
```

Escopo:

- contratos local-only de persistencia;
- repository contracts com `tenant_scoped`, required methods e forbidden behaviors;
- repositorios em memoria para tenants, tenant config, conversations, messages, audit records e knowledge documents;
- isolamento por tenant;
- tenant config validado antes de salvar;
- messages exigem conversation do mesmo tenant;
- audit records reaproveitam contrato do local audit store;
- knowledge documents preparados para RAG/knowledge-service futuro;
- versionamento de knowledge documents;
- filtro de published knowledge documents por tenant;
- bloqueio de valores com cara de secret;
- snapshot sem IO externo;
- sem Supabase, banco real, arquivo, rede, secrets, storage real, provider real ou deploy.

Validacoes:

- `npm test` PASS, 125/125;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Admin App Skeleton Implementado

App:

```text
apps/admin
```

Commit:

```text
7434586 feat: scaffold admin app shell
```

Escopo:

- skeleton estatico do painel admin;
- sem React/Vite ainda para evitar dependencias prematuras;
- `index.html`, `main.mjs`, `styles.css`, `sample-data.mjs`, `view-model.mjs`;
- view model derivado de `packages/persistence-contracts`;
- secoes iniciais: visao geral, estudio, bot premium, knowledge e auditoria;
- dados locais de exemplo via repositories em memoria;
- root `npm test` agora inclui `apps/*/tests/**/*.test.mjs`;
- testes de navegacao, tenant config, bot summary, knowledge, audit e metrics;
- sem Supabase, auth real, rede, secrets, canais reais, deploy ou design final.

Validacoes:

- `npm test` PASS, 129/129;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- app estatico: abrir `apps/admin/index.html` no navegador e suficiente nesta fase;
- git limpo no novo repo apos commit.

## Admin Studio Settings Implementado

Modulo:

```text
apps/admin/src/modules/studio-settings
```

Commit:

```text
d098d1f feat: add admin studio settings module
```

Escopo:

- primeiro modulo funcional do painel admin;
- schema `studio_settings_v1` com secoes de identidade, voz, servicos, estilos, pricing, handoff, canais, legal e flags de automacao;
- view model derivado de `packages/persistence-contracts` e `packages/tenant-config`;
- actions para salvar draft validado sem persistir automaticamente;
- action de publish que persiste somente draft validado;
- merge estrutural de patch em configuracao atual;
- rejeicao de enum invalido e valores com cara de secret;
- isolamento por tenant via repositorios locais;
- testes de leitura, draft, publish, validacao e isolamento;
- sem React/Vite ainda, Supabase, auth real, rede, secrets, canais reais, deploy ou design final.

Validacoes:

- `npm test` PASS, 136/136;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Admin Bot Control Implementado

Modulo:

```text
apps/admin/src/modules/bot-control
```

Commit:

```text
836fbef feat: add admin bot control module
```

Escopo:

- modulo local-only de controle operacional do bot premium por tenant;
- schema `bot_control_v1` com secoes de runtime, automation flags, production gates, carga operacional e audit health;
- comandos estruturados para habilitar/desabilitar bot, auto handoff, agregacao de resposta do tatuador, exigir validacao WhatsApp real e travar auto quote/auto booking;
- view model derivado de tenant, tenant config, conversations, messages e audit records locais;
- gates explicitos para tenant ativo, billing ok, bot enabled, validacao WhatsApp real obrigatoria e artist reply aggregation;
- action que prepara comando validado sem tocar em provider real;
- action que aplica comando em `tenant-config` local e registra `audit_event`;
- protecao contra mismatch de tenant e valores com cara de secret;
- integracao do modulo no view model principal do admin;
- testes de secoes, runtime, blockers, comando, aplicacao, audit e isolamento;
- sem WhatsApp, Telegram, Evolution, Supabase, auth real, rede, secrets, deploy ou runtime real.

Validacoes:

- `npm test` PASS, 142/142;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Admin Knowledge Implementado

Modulo:

```text
apps/admin/src/modules/knowledge-admin
```

Commit:

```text
382c5a8 feat: add admin knowledge module
```

Escopo:

- modulo local-only de governanca da base de conhecimento por tenant;
- schema `knowledge_admin_v1` com secoes de library health, documents, publication queue, RAG readiness e governance;
- draft de knowledge document com visibilidade: `public_answer`, `bot_context`, `artist_internal`;
- actions para salvar draft, preparar comando, publicar e arquivar documento;
- versionamento por persistence contract;
- audit event local para publish/archive;
- protecao contra mismatch de tenant, cross-tenant access e valores com cara de secret;
- readiness local para futuro RAG consultivo, exigindo fontes publicadas de FAQ, policy, aftercare e commercial_rule;
- view model integrado ao admin principal;
- testes de secoes, resumo, draft, secrets, tenant mismatch, publish, audit, cross-tenant e readiness;
- sem embeddings, vector store, LLM, WhatsApp, Telegram, Evolution, Supabase, auth real, rede, secrets, deploy ou runtime real.

Validacoes:

- `npm test` PASS, 150/150;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Admin Access Contract Implementado

Modulo:

```text
apps/admin/src/modules/admin-access
```

Commit:

```text
244fa4d feat: add admin access contract
```

Escopo:

- contrato local-only de rotas, papeis e permissoes do painel;
- schema `admin_access_v1`;
- rotas canonicas: overview, studio settings, bot control, knowledge, audit, billing, legal/LGPD e team;
- papeis canonicos reaproveitados de `packages/domain`: `owner`, `admin`, `artist`, `support`, `readonly`;
- matriz de permissoes por papel;
- diferenciacao entre permissao de leitura, escrita, acao perigosa e acao que exige audit;
- decisoes `canAccessRoute` e `canPerformAdminAction`;
- view model integrado ao admin principal para expor rotas permitidas por papel;
- testes de contrato, owner, artist, readonly, dangerous actions e view model;
- sem auth real, Supabase, rede, secrets, deploy, UI final ou runtime real.

Validacoes:

- `npm test` PASS, 157/157;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Admin Static Modules Render Implementado

App:

```text
apps/admin
```

Commit:

```text
52276de feat: render admin local modules
```

Escopo:

- renderizacao estatica inicial baseada em `admin_access.routes`;
- sidebar usa rotas permitidas pelo papel atual;
- renderizacao de `studio-settings`, `bot-control` e `knowledge-admin`;
- secoes estruturais para billing, legal/LGPD e team sem modulo funcional ainda;
- status, flags, gates, readiness e tabelas locais exibidos a partir dos view models;
- `main.mjs` ficou testavel em Node ao proteger boot dependente de `document`;
- teste de render estatico garantindo rotas e modulos locais no HTML;
- sem React/Vite, auth real, Supabase, rede, providers reais, secrets ou deploy.

Validacoes:

- `npm test` PASS, 158/158;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Admin Team Implementado

Modulo:

```text
apps/admin/src/modules/team-admin
```

Commit:

```text
d7ae443 feat: add admin team module
```

Escopo:

- `createStudioUser` adicionado ao dominio;
- `studioUsers` adicionado aos persistence contracts locais;
- modulo local-only de equipe no admin;
- schema `team_admin_v1` com health, members, invites e access governance;
- convites locais de membros;
- comandos para alterar papel, desabilitar e reativar usuario;
- audit event local para convite e mudancas de papel/status;
- protecao contra tenant mismatch, cross-tenant access e valores com cara de secret;
- view model integrado ao admin principal;
- renderizacao estatica da secao Equipe;
- testes de dominio, persistencia, resumo, convite, comando, auditoria, cross-tenant e render;
- sem auth real, email real, Supabase, rede, secrets, deploy ou runtime real.

Validacoes:

- `npm test` PASS, 167/167;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Admin Billing Implementado

Modulo:

```text
apps/admin/src/modules/billing-admin
```

Commit:

```text
c393f7c feat: add admin billing module
```

Escopo:

- `createPayment` e `createEntitlement` adicionados ao dominio;
- `payments` e `entitlements` adicionados aos persistence contracts locais;
- modulo local-only de billing no admin;
- schema `billing_admin_v1` com health, plano, entitlements, payments e operational blocks;
- comandos para trocar plano, alterar status de cobranca e alterar entitlement;
- audit event local para mudancas de plano/status/entitlement;
- resumo de bloqueio operacional para `past_due`, `suspended`, `cancelled` e entitlement ausente;
- view model integrado ao admin principal;
- renderizacao estatica da secao Billing;
- testes de dominio, persistencia, resumo, comando, audit, tenant mismatch e render;
- sem Mercado Pago, provider real, Supabase, rede, secrets, deploy ou runtime real.

Validacoes:

- `npm test` PASS, 177/177;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Admin Legal/LGPD Implementado

Modulo:

```text
apps/admin/src/modules/legal-admin
```

Commit:

```text
c3178bf feat: add admin legal module
```

Escopo:

- `createConsentRecord` e `createDataSubjectRequest` adicionados ao dominio;
- `consentRecords` e `dataSubjectRequests` adicionados aos persistence contracts locais;
- modulo local-only de Legal/LGPD no admin;
- schema `legal_admin_v1` com health, consents, data subject requests, retention e policy versions;
- comandos para registrar consentimento, criar solicitação de titular e atualizar status de solicitação;
- audit event local para consentimento e DSR;
- resumo de readiness legal baseado em versao de politica, termos e retencao;
- view model integrado ao admin principal;
- renderizacao estatica da secao Legal/LGPD;
- testes de dominio, persistencia, resumo, comandos, audit, tenant mismatch e render;
- sem email real, automacao externa, Supabase, rede, secrets, deploy ou runtime real.

Validacoes:

- `npm test` PASS, 187/187;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Admin Structural Checkpoint Registrado

Documento:

```text
docs/architecture/admin-structural-checkpoint.md
```

Commit:

```text
06d8f97 docs: add admin structural checkpoint
```

Veredito:

- a base do admin esta coerente para continuar;
- ainda deve permanecer local-only;
- nao iniciar React/Vite, Supabase real, auth real, provider real, deploy ou design visual sem checkpoint dedicado;
- proximo ataque recomendado: `supabase-local-contract`.

Motivo:

- o painel ja possui modulos locais para configuracao, bot control, knowledge, equipe, billing, legal/LGPD, rotas/permissoes e renderizacao estatica;
- o proximo risco estrutural nao e visual, e sim persistencia real, RLS, auth identity mapping, audit guarantees e migracao.

Validacoes:

- `npm test` PASS, 187/187;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Proximo Passo Logico

Evoluir o painel em slices funcionais locais antes de qualquer adapter real.

Opcoes coerentes para o proximo slice:

- `supabase-local-contract`: desenhar persistencia real/RLS sem migrar ainda.
- `admin-app-shell-framework`: iniciar shell React/Vite somente depois de checkpoint explicito;
- `admin-visual-design`: iniciar design visual somente depois de shell/framework e persistencia terem gates claros.

Decisao recomendada: implementar `supabase-local-contract` como design/contract slice apenas. Nao conectar Supabase real nem rodar migrations ainda.

## Frente Futura Obrigatoria - Knowledge Service / RAG

Status:

```text
registrado, nao implementar agora
```

Motivo:

- o produto precisa ter informacoes personalizadas por estudio;
- RAG e util para conhecimento variavel e consultivo;
- a arquitetura deve prever isso antes de fechar painel, tenant config final e bot premium runtime.

Escopo futuro:

- `knowledge-service` por tenant;
- base de FAQ do estudio;
- politicas de sinal, remarcacao, no-show, pagamento e cuidados;
- portfolio textual/curado;
- regras comerciais e operacionais do estudio;
- conteudo de suporte para perguntas laterais;
- fontes versionadas e rastreaveis;
- escopo por tenant;
- redacao/privacidade;
- observabilidade de consulta, fonte usada e confianca;
- fallback seguro quando nao houver resposta confiavel.

Limites:

- RAG nao deve decidir workflow;
- RAG nao deve definir preco;
- RAG nao deve decidir menoridade, cobertura, handoff ou conclusao de orcamento;
- RAG nao deve substituir `tenant-config`, `workflow`, `policy`, `pricing` ou `guardrails`;
- RAG entra como biblioteca consultiva, nao como comandante do fluxo.

Recomendacao:

```text
evoluir apps/admin em slices funcionais usando persistence contracts locais
```

Objetivo do proximo artefato:

- implementar proximo fluxo funcional do painel: supabase-local-contract;
- manter dados locais via persistence contracts;
- evitar acoplamento do painel ao Supabase real nesta fase;
- manter sem WhatsApp real, Telegram real, Supabase, Evolution, deploy, secrets e LLM real;
- validar por unit/contract antes de qualquer adapter real.

## Regra Anti-Poluicao

Enquanto a reconstrucao estiver em fase de arquitetura e extracao:

- qualquer arquivo novo deve ficar em `docs/reconstrucao-controlada/`, salvo decisao explicita;
- nenhuma alteracao em `functions/`, `supabase/`, `scripts/`, `web/`, HTML raiz ou secrets sem plano aprovado;
- nenhum smoke real deve ser rodado para esta frente, porque ainda nao ha mudanca funcional;
- nenhum deploy deve ser feito;
- commits desta frente devem usar escopo `docs(reconstrucao)` ou equivalente.
