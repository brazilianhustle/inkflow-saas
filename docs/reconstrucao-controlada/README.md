# Reconstrucao Controlada InkFlow

Esta pasta e a trilha oficial para planejar a reconstrucao controlada do InkFlow SaaS.

Objetivo: transformar o repo atual em fonte de extracao, memoria e validacao, enquanto um novo repo nasce como plataforma SaaS limpa, com bot premium como modulo/vault e nao como unico centro do sistema.

## Como Retomar A Frente

Ler nesta ordem:

1. `00-session-handoff.md`
2. `01-mapa-extracao-repo-atual.md`
3. `02-arquitetura-total-alvo.md`
4. `03-governanca-versionamento.md`
5. `04-plano-acao-reconstrucao.md`
6. `05-matriz-extracao-operacional.md`
7. `06-contratos-plataforma.md`
8. `07-tenant-config-contract.md`
9. `08-data-governance-contract.md`
10. `09-test-strategy-contract.md`
11. `10-decisao-stack-novo-repo.md`
12. `11-primeiro-slice-novo-repo.md`
13. `12-crosswalk-repo-original-arquitetura.md`
14. `CHANGELOG.md`
15. `docs/canonical/stack.md`
16. `docs/atendimento-premium/09-session-handoff.md`

Depois rodar:

```bash
git status --short
```

Se houver mudancas nao commitadas, entender antes de editar.

## Contrato Da Frente

- O repo atual continua operacional ate a nova arquitetura estar pronta para migracao controlada.
- Nada e copiado para o novo repo sem classificacao: copiar, reescrever, arquivar ou referenciar.
- O bot premium vira modulo/vault dentro da plataforma, mantendo metodologia de WhatsApp real como validacao definitiva.
- Static HTML legado nao vira base do painel novo sem decomposicao.
- Configuracao de tenant precisa virar contrato, nao JSON livre espalhado.
- Legal, dados, billing, seguranca, operacao e observabilidade sao partes do produto, nao tarefas finais.

## Estado Atual

Status: novo repo `inkflow-platform` criado localmente com contratos funcionais isolados, `services/bot-orchestrator`, adapters simulados, entrega simulada outbox->receipt, audit store local integrado, `services/notifications` local-only para WhatsApp/Evolution simulado e Telegram simulado, bot-orchestrator integrado a notifications para quote_request e handoff_alert locais, `services/artist-quote-intake` local-only para transformar resposta normalizada do tatuador em proposta unica `quote_response` e enviar via WhatsApp simulado provider-aware, `services/artist-quote-telegram-adapter` local-only para normalizar respostas controladas do Telegram antes do intake, `packages/persistence-contracts`, skeleton inicial de `apps/admin`, modulos locais de configuracao do estudio, controle operacional do bot premium, knowledge admin, contrato de rotas/permissoes do painel, renderizacao estatica inicial, equipe/usuarios, billing/entitlements, legal/LGPD, knowledge-service local-only, knowledge context integrado ao bot runtime, auth-session runtime local-only, admin conectado a auth-session local, actions administrativas protegidas por auth-session/audit, provider secret boundary local-only, summaries publicos de providers no admin, modulo/action local-only de provider metadata com auth-session/audit, schema draft/checkers Supabase alinhados a provider metadata com RLS owner/admin para tabela interna, provider runtime boundary local-only para resolver bindings apenas em runtime server-side, adapter simulado provider-aware com receipts/audit redigidos, bot-orchestrator validado com delivery provider-aware local-only, checkpoint estrutural do admin, contrato Supabase local, schema draft local com fixtures/testes, contrato auth identity, checkpoint Supabase policy harness, guard local, dry-run, tool detection, plano operacional, tooling readiness checkpoint, static policy coverage gate, runner real local do policy harness, policy de promocao de migrations/staging/rollback, checker local de package de migration, plano de staging package, checker local de staging readiness e runbook/gate local de execucao staging, com Supabase CLI + Docker local via Colima, sem canais reais, sem Supabase remoto, sem secrets e sem deploy.

Local:

```text
/Users/brazilianhustler/Documents/inkflow-platform
```

Commit inicial:

```text
b815ccb chore: scaffold inkflow platform monorepo
```

Commits principais do novo repo:

```text
6b99dbb feat: persist quote context from orchestrator
d113c19 feat: persist quote request contexts locally
1d39a6d test: prove local artist quote roundtrip
1e42140 feat: attach quote request context locally
573d46d feat: normalize artist telegram quotes locally
3c784c9 feat: send artist quote responses locally
86b1641 feat: add artist quote intake service
2115aa1 feat: dispatch operational notifications locally
c2cac5f feat: add local notification service
d66180e test: cover provider-aware bot delivery
3ae484c feat: wire provider runtime to simulated adapters
9270f5d feat: add provider runtime boundary
865caae docs: record provider metadata rls evidence
6153ff9 feat: harden provider metadata policies
f73d496 feat: add provider metadata admin module
21da8f0 feat: expose provider summaries in admin
00a4dba docs: add supabase tooling readiness checkpoint
4304223 feat: add supabase static policy coverage
4042732 docs: record supabase local tooling enabled
8b1d729 feat: add supabase local policy runner
8f392c9 docs: add migration promotion policy
9003d02 feat: add migration package checker
9e37a63 docs: add staging package plan
fcb13d1 feat: add staging readiness checker
a68a9be feat: add staging execution gate
360d249 feat: add auth session runtime
1c4a142 feat: connect admin to auth session
8fbf682 feat: require auth for admin actions
edd0551 feat: add provider secret boundary
0ffa38f feat: add knowledge service
110624b feat: wire knowledge context into bot runtime
354a288 docs: add policy harness operational plan
a080bc5 feat: add local policy harness tool detection
f11af8c feat: add local policy harness dry run
33a5cb4 feat: add local policy harness guard
4696121 docs: add supabase policy harness checkpoint
0549802 feat: add auth identity contract
8f21329 feat: add supabase schema draft
ba87e55 docs: add supabase local contract
06d8f97 docs: add admin structural checkpoint
c3178bf feat: add admin legal module
c393f7c feat: add admin billing module
d7ae443 feat: add admin team module
52276de feat: render admin local modules
244fa4d feat: add admin access contract
382c5a8 feat: add admin knowledge module
836fbef feat: add admin bot control module
d098d1f feat: add admin studio settings module
7434586 feat: scaffold admin app shell
ec76454 feat: implement persistence contracts
a75b7df feat: record orchestrator runs in local audit store
115025f feat: implement local audit store
87d2310 feat: wire orchestrator to simulated channel adapter
73e18d2 feat: implement simulated channel adapters
2de30cb feat: implement local bot orchestrator
2e49930 feat: implement bot runtime contract
4dcb87b feat: implement response composer contracts
2aa9cb0 feat: implement conversation engine contracts
9fb7fac feat: implement media classification contract
9c1e812 feat: implement observability contracts
daf54f3 feat: implement pricing foundation
23a00ef feat: implement workflow transitions
266fb02 feat: implement domain contracts
2dbccef feat: implement tenant config contract
b815ccb chore: scaffold inkflow platform monorepo
```

Validacoes atuais:

- `npm test` PASS, 381/381;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:guard` PASS;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:dry-run` PASS com 13 cenarios;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:detect-tools` PASS com `supabase-cli-local`;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:static-coverage` PASS com 25 tabelas e 13 cenarios;
- `INKFLOW_ENV=local SUPABASE_ENV=local SUPABASE_POLICY_RUNNER_EXECUTE=1 npm run supabase:policy:local-runner` PASS com 142 etapas, cenarios RLS e rollback drill apos provider metadata policies;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:migration:package-check` PASS, review-ready com 25 tabelas, 49 policies, staging bloqueado e producao nao pronta;
- plano de staging package registrado e testado, sem executar staging;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:staging:readiness` PASS, ready_for_operator_review=true, staging_execution_authorized=false, production_execution_authorized=false;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:staging:execution-gate` PASS, ready_for_manual_review=true, staging_execution_authorized=false, production_execution_authorized=false;
- `packages/knowledge-service` PASS em retrieval local tenant-scoped, published-only, fallback, redaction, source trace e authority consultative-only;
- knowledge context integrado ao runtime/orchestrator como resposta lateral consultiva, sem mutar estado, preco, handoff ou safety;
- auth-session runtime local-only resolve sessao por `studio_users`, bloqueia identidade inativa/cross-tenant, aplica matriz de permissoes do admin e exige evidencia de auditoria para acoes sensiveis;
- admin shell/view-model consome `auth-session`, nega role claim divergente e zera rotas/permissoes para sessao invalida;
- actions administrativas local-only exigem sessao, permissao e evidencia de auditoria antes de mutar persistence contracts;
- provider-connections local-only aceita apenas `secret_binding_id` opaco, rejeita segredo bruto e gera public views sem binding ID;
- admin shell renderiza summaries publicos de providers em `/providers`, com rota read-only `providers.view`, sem expor `secret_binding_id`/`secbind_` no view-model ou HTML;
- admin providers agora tem persistence local `providerConnections`, permissao `providers.manage`, actions auditadas para upsert/disable/health e audit payload sem binding ID;
- schema draft/checkers Supabase agora refletem provider metadata: provider enum, health enum, `updated_at`, binding opaco `secbind|binding|vaultref`, cenarios owner/viewer para mutation e RLS de tabela interna limitado a owner/admin/service_role por seguranca de coluna;
- provider-runtime local-only resolve binding apenas para runtime server-side, retorna `runtime_handle_*` para adapters e registra auditoria sem `secret_binding_id`, `secbind_*`, credential handle ou segredo bruto;
- channel-adapters agora tem adapter simulado provider-aware: resolve runtime antes de enviar, bloqueia browser/admin/client antes do envio, falha seguro em missing binding/disabled e nao expoe binding/handle em receipt/snapshot/audit;
- bot-orchestrator agora tem cobertura local-only do caminho provider-aware completo, com success/failure receipts e audit store redigidos;
- notifications service agora roteia notificacoes operacionais locais por WhatsApp/Evolution simulado e Telegram simulado usando adapter provider-aware, com request validation, receipt/audit redigidos e falha segura para adapter/binding ausente;
- bot-orchestrator agora dispara notifications locais como side effects de `waiting_artist` e `create_handoff_package`, sem dar ao notification service autoridade sobre workflow/preco/handoff;
- artist-quote-intake agora transforma quote normalizado do tatuador em pricing quote, proposal contract e notification `quote_response` unica, cobrindo multiplos itens e sessoes;
- artist-quote-intake agora tem `processAndNotify`, enviando uma unica `quote_response` por WhatsApp simulado provider-aware quando o quote e valido e nao chamando notifications quando o quote falha;
- artist-quote-telegram-adapter agora normaliza envelope controlado de resposta Telegram com `ref`, formatos estritos por item/sessao, rejeicao de texto livre/ref divergente/duplicados e entrega local unica via intake;
- bot-orchestrator/notifications agora anexam e preservam `quote_request_context`/`quote_request_ref` seguros no pedido ao tatuador, com instrucoes estritas por item/sessao;
- roundtrip local de orcamento do tatuador provado ponta a ponta: quote_request context/ref -> Telegram adapter -> artist quote intake -> WhatsApp quote_response simulada;
- persistence-contracts agora tem `QuoteRequestContextRepository` local tenant-scoped para salvar e buscar `quote_request_ref`/contexto seguro;
- bot-orchestrator agora persiste `quote_request_context` local apos `quote_request` enviado com sucesso, expondo resultado no snapshot sem rollback da notificacao;
- git limpo no repo novo apos commit.

Proxima decisao: atualizar o roundtrip local para buscar contexto persistido por `quote_request_ref` antes do Telegram adapter, mantendo staging/producao bloqueados. Nao executar staging, adapter real de WhatsApp/Supabase remoto/Telegram, migration real, deploy ou secrets sem aprovacao explicita.

Regra reforcada: informacoes que podem quebrar a reconstrucao exigem double check por pelo menos dois anchors antes de virar decisao/codigo.

Frente `knowledge-service`/RAG por tenant: implementada em modo local-only como biblioteca consultiva e integrada ao bot runtime como contexto opcional. Futuramente pode evoluir para RAG real com embeddings/vector store somente depois de contratos, staging e secrets apropriados.

## Limite De Ambiente

Enquanto esta frente estiver em fase de arquitetura:

- nao alterar codigo de producao;
- nao alterar secrets;
- nao rodar deploy;
- nao alterar smoke real;
- nao mover arquivos legados;
- nao criar repo novo sem plano aprovado.

Mudancas permitidas agora:

- docs dentro de `docs/reconstrucao-controlada/`;
- inventarios read-only;
- commits de documentacao da frente.
