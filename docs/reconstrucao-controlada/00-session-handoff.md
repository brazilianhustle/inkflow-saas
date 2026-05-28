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

## Estado Executivo Atual

Novo repo:

```text
/Users/brazilianhustler/Documents/inkflow-platform
```

Ultimo commit validado:

```text
3c784c9 feat: send artist quote responses locally
```

Bloco fechado:

- `services/artist-quote-intake` integrado ao `services/notifications` para envio local de `quote_response`;
- caminho provado: artist quote intake service -> processAndNotify -> notifications service -> provider-aware whatsapp adapter -> provider runtime resolution -> simulated whatsapp delivery -> redacted receipt/audit;
- multiplos itens viram uma proposta unica ao cliente, nao mensagens separadas;
- orcamento por sessao vira linhas de sessao, sem valor flat indevido;
- item/sessao sem valor falha e nao chama notifications;
- notification service ausente falha de forma segura sem provider real;
- raw Telegram free-text parsing continua fora do service, como preocupacao futura de adapter;
- checkpoint `artist-quote-intake-checkpoint` registrado e testado.

Validacoes do ultimo bloco:

- `npm test` PASS 361/361;
- `npm run lint` PASS placeholder;
- `npm run typecheck` PASS placeholder;
- scan focado de seguranca em artist-quote-intake/notifications/pricing/response-composer/checkpoint PASS sem hits.

Proximo passo seguro: decidir entre parser/adaptador normalizador de resposta Telegram local-only ou preparar runbook de promocao real-provider sem execucao. Staging, producao, providers reais, secrets, deploy e migrations reais continuam bloqueados.

Gate metodologico ativo: aplicar Strategic Review Gate em fechamento de bloco, troca de frente, promocao de automacao/ambiente/provider real, regressao ou repeticao de micro slices. Se os gates estiverem verdes e o proximo passo for da mesma frente, registrar a decisao no handoff/changelog e continuar, sem documento extra.

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
13. Ler `12-crosswalk-repo-original-arquitetura.md`.
14. Ler `CHANGELOG.md`.
15. Checar `git status --short`.
16. So entao propor ou executar o proximo passo.

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

Evoluir a persistencia local em contrato de schema/testes antes de qualquer adapter real.

Opcoes coerentes para o proximo slice:

- `supabase-schema-draft`: criar SQL draft, fixtures locais e testes de politica ainda desconectados de producao.
- `auth-identity-contract`: aprofundar fluxo de convite/login/roles antes de SQL executavel.
- `admin-app-shell-framework`: iniciar shell React/Vite somente depois de checkpoint explicito.

Decisao recomendada: implementar `supabase-schema-draft` como slice local-only, sem conectar Supabase real, sem rodar migration de producao e sem adicionar secrets.

## Supabase Local Contract Registrado

Documento no novo repo:

```text
docs/architecture/supabase-local-contract.md
```

Commit:

```text
ba87e55 docs: add supabase local contract
```

Escopo:

- contrato de tenancy, auth identity e RLS;
- mapa de tabelas para conversas, mensagens, midias, budget request, budget items, sessoes, quotes e proposals;
- contrato de admin para knowledge, audit, billing, legal/LGPD e retencao;
- boundary de secrets para impedir tokens em tabelas tenant-facing;
- contrato de storage para midias e knowledge assets;
- gates de migration, rollback, fixtures e testes;
- mapeamento dos modulos locais atuais para futuras tabelas;
- sem Supabase real, migration real, secrets, deploy, provider real ou UI visual.

Validacoes:

- `npm test` PASS, 187/187;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Supabase Schema Draft Implementado

Artefatos no novo repo:

```text
docs/architecture/supabase-schema-draft.md
infra/supabase/draft/001_initial_schema.sql
infra/supabase/draft/001_rollback.sql
infra/supabase/draft/fixtures/local-fixtures.json
tests/architecture/supabase-schema-draft.test.mjs
```

Commit:

```text
8f21329 feat: add supabase schema draft
```

Escopo:

- SQL draft inicial para tenancy, identity, admin, conversas, mensagens, midias, decisions, budget, quotes, proposals, billing, legal, provider metadata, outbox e receipts;
- rollback draft correspondente;
- fixtures locais cobrindo estilos default/restrito, roles, single tattoo, multi tattoo, quote por sessao, midia limpa/ambigua, usuario revogado e DSR;
- teste estatico garantindo `tenant_id` nas tabelas tenant-scoped, RLS habilitado, audit append-only, ausencia de campos de secrets crus e cobertura de rollback/fixtures;
- sem Supabase real, sem migracao executada, sem secrets, sem provider real, sem deploy e sem UI visual.

Validacoes:

- `npm test` PASS, 193/193;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Auth Identity Contract Implementado

Artefatos no novo repo:

```text
docs/architecture/auth-identity-contract.md
tests/architecture/auth-identity-contract.test.mjs
```

Commit:

```text
0549802 feat: add auth identity contract
```

Escopo:

- contrato de identidade separando Supabase Auth de autorizacao InkFlow;
- fluxo de convite, login, revogacao e service boundary;
- regras para roles `owner`, `admin`, `artist`, `assistant`, `viewer`;
- regras para statuses `invited`, `active`, `disabled`, `revoked`;
- teste alinhando contrato, domain roles, admin-access e schema draft;
- correcao estrutural de roles antigas no repo novo: `support/readonly` foi alinhado para `assistant/viewer`;
- sem auth real, sem Supabase local/producao, sem email real, sem secrets, sem deploy e sem provider real.

Validacoes:

- `npm test` PASS, 199/199;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Crosswalk Repo Original x Arquitetura Alvo Registrado

Documento:

```text
docs/reconstrucao-controlada/12-crosswalk-repo-original-arquitetura.md
```

Escopo:

- cruzamento do repo original com a arquitetura alvo atual do novo repo;
- classificacao por frente: bot premium, Evolution, SessionQueue, tenant config, media, orcamento, Telegram, observabilidade, Supabase, auth/RBAC, painel, billing, legal, smoke real, CI/CD e vault;
- identificacao do que ja esta coberto no novo repo;
- gaps que ainda nao podem ser ignorados;
- stop conditions para evitar copiar divida tecnica;
- decisao de seguir para checkpoint do `supabase-policy-test-harness`.

## Supabase Policy Harness Checkpoint Registrado

Artefatos no novo repo:

```text
docs/architecture/supabase-policy-harness-checkpoint.md
tests/architecture/supabase-policy-harness-checkpoint.test.mjs
```

Commit:

```text
4696121 docs: add supabase policy harness checkpoint
```

Escopo:

- decisao segura para provar RLS/auth local sem tocar producao;
- comparacao de opcoes Supabase CLI local, Postgres container e testes estaticos;
- environment guard obrigatorio contra URL/chaves de producao;
- cenarios obrigatorios: tenant isolation, revoked/disabled/invited denial, viewer/artist restrictions, audit append-only e backend-only service boundary;
- stop conditions antes de qualquer comando Supabase local;
- sem Supabase executado, sem Docker/CLI rodado, sem secrets, sem deploy e sem provider real.

Validacoes:

- `npm test` PASS, 203/203;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Local Policy Harness Guard Implementado

Artefatos no novo repo:

```text
infra/supabase/local-policy-harness/README.md
infra/supabase/local-policy-harness/guard.mjs
infra/supabase/local-policy-harness/run-guard.mjs
infra/supabase/local-policy-harness/policy-scenarios.json
tests/architecture/supabase-local-policy-harness.test.mjs
```

Commit:

```text
33a5cb4 feat: add local policy harness guard
```

Escopo:

- environment guard para `supabase-policy-harness`;
- bloqueio de URL HTTPS de projeto Supabase;
- bloqueio de `SUPABASE_SERVICE_ROLE_KEY`;
- exigencia de ambiente `local` ou `test`;
- exigencia de anon key marcada como local quando existir;
- bloqueio de caminhos de migrations de producao;
- scan de env files contra provider secrets;
- manifesto de cenarios RLS/auth obrigatorios;
- script `npm run supabase:policy:guard`;
- sem execucao Supabase, sem Docker/CLI, sem SQL real, sem secrets, sem provider real e sem deploy.

Validacoes:

- `npm test` PASS, 209/209;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:guard` PASS;
- git limpo no novo repo apos commit.

## Local Policy Harness Dry-Run Implementado

Artefatos no novo repo:

```text
infra/supabase/local-policy-harness/dry-run.mjs
infra/supabase/local-policy-harness/run-dry-run.mjs
```

Commit:

```text
f11af8c feat: add local policy harness dry run
```

Escopo:

- comando `npm run supabase:policy:dry-run`;
- valida guard + schema draft + rollback + manifesto de cenarios;
- garante que o dry-run nao executa comandos de banco;
- adiciona teste para loader resolver arquivos dentro do repo;
- cobre bug corrigido: dry-run estava procurando schema fora de `inkflow-platform`;
- sem execucao Supabase, sem Docker/CLI, sem SQL real, sem secrets, sem provider real e sem deploy.

Validacoes:

- `npm test` PASS, 213/213;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:dry-run` PASS com 11 cenarios;
- git limpo no novo repo apos commit.

## Local Policy Harness Tool Detection Implementado

Artefatos no novo repo:

```text
infra/supabase/local-policy-harness/detect-tools.mjs
infra/supabase/local-policy-harness/run-detect-tools.mjs
```

Commit:

```text
a080bc5 feat: add local policy harness tool detection
```

Escopo:

- comando `npm run supabase:policy:detect-tools`;
- detector faz double check de guard, dry-run e presenca de ferramentas locais;
- recomendacao automatica entre `supabase-cli-local`, `postgres-container-fallback` e `static-only-fallback`;
- nao inicia Supabase, Docker, Postgres nem executa SQL;
- corrigido warning tecnico do detector e bloqueada entrada insegura em nome de comando.

Resultado local:

```text
strategy: static-only-fallback
tools: supabase=false docker=false psql=false
```

Validacoes:

- `npm test` PASS, 218/218;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:detect-tools` PASS;
- git limpo no novo repo apos commit.

## Policy Harness Operational Plan Registrado

Artefatos no novo repo:

```text
docs/architecture/supabase-policy-harness-operational-plan.md
tests/architecture/supabase-policy-harness-operational-plan.test.mjs
```

Commit:

```text
354a288 docs: add policy harness operational plan
```

Escopo:

- plano de ataque para validar RLS/auth local de verdade;
- checkpoints operacionais por fase;
- regra de double check para informacoes capazes de quebrar a reconstrucao;
- fase de tooling readiness;
- ambiente local boundary;
- bootstrap de DB local;
- fixture seed;
- cenarios RLS reais;
- rollback drill;
- evidence report;
- regras de promocao e stop conditions.

Validacoes:

- `npm test` PASS, 222/222;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Supabase Tooling Readiness Checkpoint Registrado

Artefatos no novo repo:

```text
docs/architecture/supabase-tooling-readiness-checkpoint.md
tests/architecture/supabase-tooling-readiness-checkpoint.test.mjs
```

Commit:

```text
00a4dba docs: add supabase tooling readiness checkpoint
```

Escopo:

- decisao operacional para habilitar validacao real local do policy harness;
- caminho correto definido: Supabase CLI local + Docker;
- registro do bloqueio atual: `supabase=false docker=false psql=false`;
- classificacao do bloqueio como ambiente, nao arquitetura;
- paths aprovados: Supabase CLI + Docker, fallback estatico temporario, Postgres fallback apenas se necessario;
- checklist de habilitacao de tooling;
- comandos proibidos ate runner explicito existir;
- stop conditions.

Validacoes:

- `npm test` PASS, 226/226;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no novo repo apos commit.

## Supabase Static Policy Coverage

Commit no novo repo:

```text
4304223 feat: add supabase static policy coverage
```

Escopo:

- adiciona `infra/supabase/local-policy-harness/static-coverage.mjs`;
- adiciona `npm run supabase:policy:static-coverage`;
- checa schema, rollback, manifesto, tenant boundaries, roles/status, service_role em writes runtime, audit append-only e provider secret boundary;
- registra `docs/architecture/supabase-static-coverage-checkpoint.md`;
- explicita que nao executa SQL e nao substitui validacao real de RLS.

Validacoes:

- `npm test` PASS, 234/234;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:static-coverage` PASS;
- git limpo no novo repo apos commit.

Decisao:

```text
static coverage e protecao temporaria, nao gate final
```

O gate real continua sendo Supabase CLI local + Docker, com RLS executado em banco local. Enquanto `supabase=false docker=false psql=false`, nao promover migrations nem chamar isso de validacao final.

## Supabase Local Tooling Enabled

Commit no novo repo:

```text
4042732 docs: record supabase local tooling enabled
```

Tooling habilitado no ambiente local:

```text
supabase CLI: 2.101.0
docker CLI: 29.5.2
docker daemon: 29.2.1 on Colima / Ubuntu 24.04.4 LTS
docker-compose: 5.1.4
```

Detector atual:

```text
strategy: supabase-cli-local
reason: supabase_cli_and_docker_available
tools: supabase=true docker=true psql=false
```

Validacoes:

- `npm test` PASS, 235/235;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:guard` PASS;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:dry-run` PASS;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:static-coverage` PASS;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:detect-tools` PASS com `supabase-cli-local`.

Decisao:

```text
tooling pronto, runner real ainda nao implementado
```

Proximo passo correto e implementar `supabase-cli-local-runner` com guard-first, workspace local isolado, schema apply local, fixtures locais, cenarios RLS, rollback drill e evidence report. Ainda nao promover migrations, nao usar Supabase remoto e nao tocar secrets.

## Supabase Local Runner PASS

Commit no novo repo:

```text
8b1d729 feat: add supabase local policy runner
```

Escopo:

- adiciona `infra/supabase/local-policy-harness/local-runner.mjs`;
- adiciona `npm run supabase:policy:local-runner`;
- executa guard, dry-run, static coverage e tool detection antes de SQL real;
- cria workspace temporario isolado;
- inicia Supabase local via Docker/Colima;
- aplica schema draft statement-by-statement;
- aplica seed fake local;
- executa cenarios RLS reais;
- executa rollback drill;
- para Supabase local com `--no-backup`;
- sanitiza ambiente dos subprocessos para nao herdar tokens/secrets nao relacionados.

Falha real encontrada:

```text
query error: ERROR: stack depth limit exceeded
```

Causa:

```text
active_tenant_ids/active_tenant_role consultavam studio_user_identities enquanto policies da propria tabela dependiam desses helpers.
```

Correcao:

```text
helpers agora usam security definer com search_path = public
```

Evidencia real final:

```text
Supabase CLI local policy runner executed 142 steps.
RLS scenarios and rollback drill passed in local Supabase.
```

Validacoes:

- `npm test` PASS, 249/249;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:guard` PASS;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:dry-run` PASS;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:static-coverage` PASS;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:detect-tools` PASS com `supabase-cli-local`;
- `INKFLOW_ENV=local SUPABASE_ENV=local SUPABASE_POLICY_RUNNER_EXECUTE=1 npm run supabase:policy:local-runner` PASS.

Decisao:

```text
RLS local validado, producao ainda bloqueada
```

Antes de qualquer migration real ainda falta definir policy de empacotamento de migrations, staging/prod backup, rollback operacional e manuseio de secrets.

## Supabase Migration Promotion Policy

Commit do novo repo:

```text
8f392c9 docs: add migration promotion policy
```

Escopo:

- registra `docs/architecture/supabase-migration-promotion-policy.md`;
- adiciona teste de arquitetura para o checkpoint;
- define ladder obrigatorio de promocao;
- exige package de migration com forward SQL, rollback/forward-fix, impacto tenant/auth/grants, evidencias local/staging e checklist de producao;
- torna staging obrigatorio antes de producao;
- bloqueia producao ate backup/export, rollback/forward-fix, aprovacao explicita e pos-checks;
- reforca boundary de secrets por ambiente;
- exige revisao de grants caso browser clients acessem tabelas diretamente.

Validacoes:

- `npm test` PASS, 254/254;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder.

Decisao:

```text
runner local prova RLS, mas promocao exige package + staging + rollback + aprovacao explicita
```

Proximo passo correto:

```text
implementar checker/gerador local de package de migration, sem conectar staging/producao
```

## Supabase Migration Package Checker

Commit do novo repo:

```text
9003d02 feat: add migration package checker
```

Escopo:

- adiciona `infra/supabase/migration-package/package-checker.mjs`;
- adiciona `npm run supabase:migration:package-check`;
- cria checkpoint `docs/architecture/supabase-migration-package-checkpoint.md`;
- le draft SQL, rollback SQL e policy scenarios;
- roda guard local e static coverage;
- cria package review-only com inventario de tabelas, functions, policies e grants;
- registra evidencias do local runner;
- mantem staging como `blocked_until_staging_checkpoint`;
- mantem checklist de producao falso;
- valida rollback strategy, browser grant review e scanner de secrets;
- nao conecta staging, nao conecta producao, nao executa SQL remoto e nao cria migration produtiva.

Evidencia:

```text
Supabase migration package supabase_20260528_initial_platform_schema is review-ready.
table_count: 25
policy_count: 49
staging_status: blocked_until_staging_checkpoint
production_ready: false
```

Validacoes:

- `npm test` PASS, 260/260;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:migration:package-check` PASS.

Decisao:

```text
package local esta pronto para revisao; staging/producao continuam bloqueados
```

Proximo passo correto:

```text
planejar staging package checkpoint sem executar staging ainda
```

## Supabase Staging Package Plan

Commit do novo repo:

```text
9e37a63 docs: add staging package plan
```

Escopo:

- adiciona `docs/architecture/supabase-staging-package-plan.md`;
- adiciona teste de arquitetura do plano;
- define inputs obrigatorios antes de qualquer staging;
- define boundary contra producao: sem service-role key de producao, URL de producao, Evolution de producao, Telegram token de producao, dados reais ou webhook produtivo;
- exige backup/export antes de migration staging;
- define smoke RLS staging com fixtures fake;
- exige evidence storage e aprovacao operacional;
- lista stop conditions;
- nao conecta staging, nao roda SQL remoto, nao sincroniza secrets e nao faz deploy.

Validacoes:

- `npm test` PASS, 265/265;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder.

Decisao:

```text
staging ainda esta bloqueado; agora existe plano testado para preparar readiness
```

Proximo passo correto:

```text
implementar staging readiness checker local sem conectar staging
```

## Supabase Staging Readiness Checker

Commit do novo repo:

```text
fcb13d1 feat: add staging readiness checker
```

Escopo:

- adiciona `infra/supabase/staging-readiness/readiness-checker.mjs`;
- adiciona `npm run supabase:staging:readiness`;
- cria checkpoint `docs/architecture/supabase-staging-readiness-checkpoint.md`;
- valida package id, staging label, nomes de secret sources, backup/export, rollback/forward-fix, fixtures fake, smoke RLS, post-checks e approval record;
- rejeita ambiente/valores production-like;
- rejeita valores com cara de segredo real;
- mantem `staging_execution_authorized=false`;
- mantem `production_execution_authorized=false`;
- nao conecta staging, nao conecta producao, nao sincroniza secrets, nao executa SQL e nao faz deploy.

Evidencia:

```text
Supabase staging readiness plan supabase_20260528_initial_platform_schema is ready for operator review.
ready_for_operator_review: true
staging_execution_authorized: false
production_execution_authorized: false
smoke_count: 9
secret_source_count: 3
```

Validacoes:

- `npm test` PASS, 271/271;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:staging:readiness` PASS.

Decisao:

```text
staging readiness esta pronto para revisao operacional, mas staging real continua bloqueado
```

Proximo passo correto:

```text
decidir entre hardening local adicional ou runbook manual de execucao staging com aprovacao explicita
```

## Supabase Staging Execution Runbook/Gate

Commit do novo repo:

```text
a68a9be feat: add staging execution gate
```

Escopo:

- adiciona `docs/architecture/supabase-staging-execution-runbook.md`;
- adiciona `infra/supabase/staging-execution-gate/execution-gate.mjs`;
- adiciona `npm run supabase:staging:execution-gate`;
- adiciona checkpoint `docs/architecture/supabase-staging-execution-gate-checkpoint.md`;
- valida que o runbook e staging-only;
- valida que producao e proibida;
- exige package check, staging readiness e execution gate como precondicoes;
- exige backup antes de migration;
- exige rollback ou forward-fix;
- exige smoke RLS staging;
- exige aprovacao humana explicita;
- exige stop conditions;
- exige `STAGING_EXECUTION_AUTHORIZED=false`;
- exige `PRODUCTION_EXECUTION_AUTHORIZED=false`;
- bloqueia `supabase db push`, `supabase link`, secrets inline e URLs production-like no runbook.

Evidencia:

```text
Supabase staging execution runbook is ready for manual review.
ready_for_manual_review: true
staging_execution_authorized: false
production_execution_authorized: false
connects_to_staging: false
connects_to_production: false
```

Validacoes:

- `npm test` PASS, 277/277;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:migration:package-check` PASS;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:staging:readiness` PASS;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:staging:execution-gate` PASS.

Decisao:

```text
runbook esta pronto para revisao manual; staging real segue bloqueado
```

Proximo passo correto:

```text
pausar para decisao operacional antes de qualquer staging real ou preparar checkpoint de aprovacao humana
```

## Frente Futura Obrigatoria - Knowledge Service / RAG

Status:

```text
implementado local-only, integrar ao runtime depois
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

## Knowledge Service Local-Only

Commit do novo repo:

```text
0ffa38f feat: add knowledge service
```

Escopo:

- adiciona `packages/knowledge-service`;
- adiciona `docs/architecture/knowledge-service-checkpoint.md`;
- le documentos publicados via persistence contracts;
- filtra por tenant;
- ignora drafts e archived;
- aplica scoring local deterministico;
- retorna answer text, confidence e source trace;
- redige trechos via redaction;
- retorna fallback quando nao ha fonte confiavel;
- bloqueia query com valor secret-like;
- expõe authority `consultative_only`;
- garante `can_mutate_workflow=false`, `can_set_price=false`, `can_trigger_handoff=false`.

Limites:

- sem LLM;
- sem embeddings;
- sem vector DB;
- sem Supabase;
- sem storage;
- sem WhatsApp/Telegram/Evolution;
- sem rede;
- sem secrets;
- sem deploy.

Validacoes:

- `npm test` PASS, 285/285;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder.

Decisao:

```text
knowledge-service e biblioteca consultiva; nao decide workflow, preco, safety, handoff ou conclusao de orcamento
```

Proximo passo correto:

```text
integrar knowledge-service ao bot runtime como contexto consultivo opcional
```

## Knowledge Runtime Integration

Commit do novo repo:

```text
110624b feat: wire knowledge context into bot runtime
```

Escopo:

- `packages/bot-runtime-contract` passa a aceitar `knowledge_context`;
- `services/bot-orchestrator` repassa `knowledge_context` opcional ao runtime;
- respostas laterais podem usar `knowledge_context.answer_text`;
- planos preservam source trace no `knowledge_context`;
- runtime valida que knowledge continua `consultative_only`;
- runtime bloqueia resposta se knowledge tentar `can_mutate_workflow`, `can_set_price` ou `can_trigger_handoff`;
- sem retrieval direto no runtime;
- sem Supabase, LLM, embeddings, vector DB, rede, storage, secrets, WhatsApp, Telegram, Evolution ou deploy.

Validacoes:

- `npm test` PASS, 288/288;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder.

Decisao:

```text
knowledge pode enriquecer resposta lateral, mas workflow/policy/pricing continuam autoridades
```

## Auth Session Runtime Local-Only

Commit do novo repo:

```text
360d249 feat: add auth session runtime
```

Escopo:

- adiciona `packages/auth-session`;
- adiciona `docs/architecture/auth-session-runtime-checkpoint.md`;
- resolve sessao local por `studio_users` via persistence contracts;
- bloqueia identidades `invited`, `disabled` e `revoked`;
- bloqueia acesso cross-tenant;
- deriva permissoes e rotas pela matriz canonica `admin-access`;
- autoriza rotas e acoes administrativas;
- exige evidencia de auditoria para acoes sensiveis/perigosas;
- rejeita role claim diferente do papel salvo no tenant;
- rejeita metadata secret-like.

Limites:

- sem Supabase Auth real;
- sem JWT/cookies/browser storage;
- sem staging remoto;
- sem migration real;
- sem WhatsApp/Telegram/Evolution;
- sem secrets;
- sem deploy.

Validacoes:

- `npm test` PASS, 296/296;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder.

Decisao:

```text
provider auth pode identificar a pessoa no futuro; permissao vem de studio_users tenant-scoped
```

Proximo passo correto:

```text
conectar auth-session ao shell/view-model do admin em modo local-only
```

## Admin Auth Session Integration Local-Only

Commit do novo repo:

```text
1c4a142 feat: connect admin to auth session
```

Escopo:

- `apps/admin/src/view-model.mjs` resolve `auth_session` antes de expor access surface;
- `access_control` fica explicito no model do admin;
- papel e permissoes passam a vir da identidade persistida em `studio_users`;
- role claim divergente e negada;
- identidade inativa nao recebe rotas nem permissoes;
- fixture local inclui usuario viewer para cobrir matriz de acesso;
- testes cobrem sessao viewer valida, usuario inativo negado e role claim negada.

Limites:

- sem Supabase Auth real;
- sem JWT/cookies/browser storage;
- sem staging remoto;
- sem migration real;
- sem UI framework final;
- sem secrets;
- sem deploy.

Validacoes:

- `npm test` PASS, 298/298;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder.

Decisao:

```text
admin pode renderizar sessao/acesso local, mas nao autentica usuario; provider futuro deve passar pelo auth-session
```

Proximo passo correto:

```text
adicionar wrappers de autorizacao em actions administrativas local-only
```

## Admin Action Authorization Local-Only

Commit do novo repo:

```text
8fbf682 feat: require auth for admin actions
```

Escopo:

- adiciona `apps/admin/src/modules/admin-action-auth.mjs`;
- writes de studio settings exigem `studio.edit_settings` + audit evidence;
- comandos de bot control exigem `bot.execute_control` + audit evidence;
- drafts de knowledge exigem `knowledge.edit_draft`;
- publish/archive de knowledge exigem `knowledge.publish` + audit evidence;
- billing exige `billing.manage` + audit evidence;
- legal/LGPD exige `legal.manage_requests` + audit evidence;
- team invite/role/status exige `team.manage` + audit evidence;
- session tenant mismatch bloqueia antes de validacao de comando ou mutacao no repository;
- testes cobrem ausencia de sessao, ausencia de audit evidence e permissao insuficiente.

Limites:

- sem Supabase Auth real;
- sem JWT/cookies/browser storage;
- sem staging remoto;
- sem migration real;
- sem provider real;
- sem secrets;
- sem deploy.

Validacoes:

- `npm test` PASS, 299/299;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder.

Decisao:

```text
mutacoes administrativas passam por auth-session antes de tocar persistence contracts
```

Proximo passo correto:

```text
modelar provider connection settings/secrets boundary local-only
```

## Provider Connections Secret Boundary Local-Only

Commit do novo repo:

```text
edd0551 feat: add provider secret boundary
```

Escopo:

- adiciona `packages/provider-connections`;
- modela providers `evolution`, `telegram`, `mercado_pago`, `openai`, `email` e `supabase`;
- aceita apenas `secret_binding_id` opaco (`secbind_*`, `binding_*`, `vaultref_*`);
- rejeita campos/valores de segredo bruto como API key, token, bot token, service-role, access token, refresh token, password e webhook secret;
- public view nunca expoe `secret_binding_id`;
- readiness summary e tenant-scoped e nunca inclui binding ID;
- real provider connection segue bloqueado por `can_connect_real_providers=false`.

Limites:

- sem leitura de `.env`;
- sem Cloudflare Secrets;
- sem Supabase Vault;
- sem arquivos;
- sem rede;
- sem Evolution/Telegram/Mercado Pago/OpenAI/email real;
- sem staging;
- sem deploy;
- sem sync de secrets.

Double check de seguranca:

- scanner local encontrou apenas nomes bloqueados dentro da denylist e testes negativos ficticios;
- `npm test` PASS valida rejeicao de segredo bruto e ausencia de binding ID em public views/summaries.

Validacoes:

- `npm test` PASS, 305/305;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder.

Decisao:

```text
tenant/admin ve metadata segura; segredo real fica fora do produto ate existir secret manager aprovado
```

Proximo passo correto:

```text
conectar summaries publicos de provider-connections ao admin shell local-only
```

Recomendacao:

```text
evoluir apps/admin em slices funcionais usando persistence contracts locais
```

Objetivo do proximo artefato:

- expor apenas provider public summaries no admin, sem binding ID ou segredo bruto;
- manter tudo local e desconectado de producao;
- manter Supabase/staging real bloqueados sem aprovacao explicita;
- manter sem WhatsApp real, Telegram real, Supabase, Evolution, deploy, secrets e LLM real;
- validar por unit/contract antes de qualquer adapter real.

## Admin Provider Summaries Local-Only

Commit do novo repo:

```text
21da8f0 feat: expose provider summaries in admin
```

Escopo:

- `apps/admin` injeta fixtures internas de provider connections somente em modo local;
- `createAdminViewModel` converte provider connections internas para summaries publicos via `summarizeProviderConnections`;
- `apps/admin` renderiza secao `providers` e rota read-only `/providers`;
- matriz de acesso ganhou permissao `providers.view`;
- admin mostra apenas label, provider, identificador redigido, health status, readiness e contadores;
- `secret_binding_id` e `secbind_` ficam fora do view-model publico e fora do HTML;
- checkpoint registrado em `docs/architecture/admin-provider-summary-checkpoint.md`.

Limites:

- sem ler `.env`;
- sem Cloudflare Secrets;
- sem Supabase Vault;
- sem provider real;
- sem Evolution/Telegram/Mercado Pago/OpenAI real;
- sem rede;
- sem staging;
- sem deploy;
- sem sync de secrets.

Double check de seguranca:

- `npm test` PASS, 306/306;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- render direto confirmou `href="#providers"` e `id="providers"`;
- render direto confirmou `hasSecretBindingId=false` e `hasSecbind=false`;
- readiness manteve `can_connect_real_providers=false`;
- varredura focada em admin encontrou apenas checks negativos nos testes e guard no view-model.

Decisao:

```text
admin pode exibir readiness/metadata de providers, mas nao pode receber segredo real nem conectar provider real
```

Proximo passo correto:

```text
criar modulo/action local-only para administrar metadata de provider connection com auth-session/audit
```

Regras do proximo passo:

- manter secrets fora do browser e fora dos fixtures publicos;
- aceitar apenas binding opaco como referencia interna;
- qualquer write precisa passar por auth-session, permissao e audit quando aplicavel;
- ainda nao conectar Evolution, Telegram, Mercado Pago, OpenAI, Supabase remoto, staging ou deploy.

## Provider Metadata Admin Local-Only

Commit do novo repo:

```text
f73d496 feat: add provider metadata admin module
```

Escopo:

- adiciona `providerConnections` aos persistence contracts locais;
- salva provider metadata por tenant com `getById`, `listByTenant` e bloqueio cross-tenant;
- rejeita segredo bruto e aceita apenas `secret_binding_id` opaco;
- adiciona permissao `providers.manage`;
- cria modulo `apps/admin/src/modules/providers`;
- cria actions para `upsert_provider_connection`, `disable_provider_connection` e `mark_provider_health`;
- actions exigem auth-session, tenant match, permissao e audit evidence;
- audit payload nao inclui `secret_binding_id` nem valor `secbind_*`;
- admin view-model consome provider metadata do store local;
- checkpoint registrado em `docs/architecture/provider-admin-local-metadata-checkpoint.md`.

Limites:

- sem ler `.env`;
- sem Cloudflare Secrets;
- sem Supabase Vault;
- sem provider real;
- sem Evolution/Telegram/Mercado Pago/OpenAI real;
- sem rede;
- sem staging;
- sem deploy;
- sem sync de secrets.

Double check de seguranca:

- `npm test` PASS, 314/314;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- render direto confirmou `htmlHasSecretBindingId=false` e `htmlHasSecbind=false`;
- action auditada confirmou `auditHasSecretBindingId=false`, `auditHasSecbind=false` e `realConnected=false`;
- varredura focada encontrou `secret_binding_id` apenas em contratos internos, testes negativos/fixtures internas e docs de boundary, nao em HTML/audit publico.

Decisao:

```text
provider metadata pode ser administrada localmente, mas provider real e secret manager real seguem bloqueados
```

Proximo passo correto:

```text
atualizar schema draft/checkers Supabase para refletir provider metadata e policies, sem migration real nem staging
```

Regras do proximo passo:

- alterar apenas artefatos locais/review-only de schema/checker;
- nao executar Supabase remoto;
- nao criar migration produtiva;
- nao inserir secrets;
- manter browser grants e RLS coerentes com provider metadata.

## Regra Anti-Poluicao

Enquanto a reconstrucao estiver em fase de arquitetura e extracao:

- qualquer arquivo novo deve ficar em `docs/reconstrucao-controlada/`, salvo decisao explicita;
- nenhuma alteracao em `functions/`, `supabase/`, `scripts/`, `web/`, HTML raiz ou secrets sem plano aprovado;
- nenhum smoke real deve ser rodado para esta frente, porque ainda nao ha mudanca funcional;
- nenhum deploy deve ser feito;
- commits desta frente devem usar escopo `docs(reconstrucao)` ou equivalente.
