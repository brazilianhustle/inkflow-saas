# Changelog - Reconstrucao Controlada

## 2026-05-31

### Executado

- Construido Provider staging real smoke executor no novo repo em `infra/provider-staging-real-smoke-executor/`.
- Adicionado wrapper `npm run provider:staging:real-smoke-executor` no repo atual.
- O executor valida readiness, evidencia health/webhook, aprovacao `APPROVE_PROVIDER_STAGING_SMOKE_ONLY`, fake actors, plano redigido e flag explicita antes de qualquer execucao.

### Validado

- `node --test tests/architecture/provider-staging-real-smoke-executor.test.mjs` PASS 6/6.
- `PROVIDER_STAGING_SMOKE_APPROVAL=APPROVE_PROVIDER_STAGING_SMOKE_ONLY npm run provider:staging:real-smoke-executor` PASS em modo plano, com `connects_to_provider=false`, `executable_provider_commands=false`, `redacts_provider_handles=true`.
- `PROVIDER_STAGING_SMOKE_APPROVAL=APPROVE_PROVIDER_STAGING_SMOKE_ONLY npm run provider:staging:real-smoke-executor -- --execute` falha corretamente por `explicit_provider_staging_smoke_execute_flag_required`.
- `npm test` PASS 507/507 no novo repo.
- `npm run typecheck` PASS placeholder no novo repo.
- `npm run lint` PASS placeholder no novo repo.

### Bloqueios Mantidos

- O runner real de staging ainda precisa ser conectado/revisado antes de executar qualquer trafego Provider staging.
- Provider production, webhook update, secret sync, deploy, billing e customer migration continuam bloqueados.

### Executado

- Capturada evidencia operacional Provider staging health/webhook em `docs/evidence/provider-staging/provider-health-webhook-isolation-2026-05-31T000000000Z.md` no novo repo.
- A evidencia registra operador, timestamp, resultado `configured for staging smoke`, confirmacoes redigidas de Evolution/Telegram staging, isolamento de webhook, rollback owner, fake actors e confirmacao de que nenhum segredo foi impresso.

### Validado

- `PROVIDER_STAGING_SMOKE_APPROVAL=APPROVE_PROVIDER_STAGING_SMOKE_ONLY npm run provider:staging:smoke-approval-readiness` PASS via wrapper do repo atual.
- Resultado: `ready_for_real_provider_staging_smoke_executor_build=true`, `approval_present=true`, `evidence_present=true`, `evidence_validated=true`, `health_webhook_checkpoint_ready=true`, `connects_to_provider=false`, `executable_provider_commands=false`, `next_checkpoint=build_real_provider_staging_smoke_executor`.

### Bloqueios Mantidos

- Provider staging smoke ainda nao foi executado.
- Provider real execution, webhook update, secret sync, deploy, producao, billing e customer migration continuam bloqueados ate o proximo executor/gate explicito.

### Executado

- Criado Provider staging smoke approval readiness no novo repo.
- Adicionado wrapper `npm run provider:staging:smoke-approval-readiness` no repo atual.
- Criado template seguro `docs/evidence/provider-staging/provider-health-webhook-isolation.template.md`.
- Registrada a aprovacao recebida nesta sessao: `APPROVE_PROVIDER_STAGING_SMOKE_ONLY`.

### Validado

- `node --test tests/architecture/provider-staging-smoke-approval-readiness.test.mjs` PASS 5/5.
- `npm test` PASS 501/501 no novo repo.
- `PROVIDER_STAGING_SMOKE_APPROVAL=APPROVE_PROVIDER_STAGING_SMOKE_ONLY npm run provider:staging:smoke-approval-readiness` falha corretamente por `provider_health_webhook_evidence_missing`, com `approval_present=true`, `evidence_present=false`, `health_webhook_checkpoint_ready=true`, `connects_to_provider=false`, `executable_provider_commands=false`.

### Bloqueios Mantidos

- A aprovacao existe, mas o executor real nao deve ser construido/executado ate a evidencia operacional health/webhook ser preenchida e validada.
- Provider real, webhook update, secret sync, deploy, producao, billing e customer migration continuam bloqueados.

### Executado

- Criado Provider staging health/webhook isolation checkpoint no novo repo.
- Adicionado wrapper `npm run provider:staging:health-webhook-isolation` no repo atual.
- O checkpoint define as evidencias obrigatorias para o operador aprovar o primeiro smoke Provider staging real: provider health, fake Evolution/Telegram, webhook isolation, rollback path, rollback owner, fake actor confirmation, evidence location e confirmacao de que secrets nao foram impressos.

### Validado

- `node --test tests/architecture/provider-staging-health-webhook-isolation.test.mjs` PASS 5/5.
- `INKFLOW_ENV=local PROVIDER_ENV=local npm run provider:staging:health-webhook-isolation` PASS no novo repo.
- `npm run provider:staging:health-webhook-isolation` PASS via wrapper do repo atual.
- `npm test` PASS 496/496 no novo repo.
- Resultado do gate: `ready_for_operator_evidence_collection=true`, `connects_to_provider=false`, `executable_provider_commands=false`, `provider_staging_smoke_execution_authorized=false`, `provider_webhook_update_authorized=false`, `approval_phrase_required_after_evidence=APPROVE_PROVIDER_STAGING_SMOKE_ONLY`, `next_checkpoint=operator_provides_provider_staging_smoke_approval`.

### Bloqueios Mantidos

- Provider real, webhook update, secret sync, deploy, producao, billing e customer migration seguem bloqueados ate aprovacao explicita do operador.

### Executado

- Criado Provider staging smoke execution turn em modo plano no novo repo.
- Adicionado wrapper `npm run provider:staging:smoke-execution-turn` no repo atual.
- O turno gera plano redigido para a futura sequencia fake client inbound -> bot WhatsApp response -> Telegram quote request -> artist quote reply -> final WhatsApp quote response -> rollback disable check, sem comandos executaveis e sem provider real.

### Validado

- `node --test tests/architecture/provider-staging-smoke-execution-turn.test.mjs` PASS 5/5.
- `INKFLOW_ENV=local PROVIDER_ENV=local npm run provider:staging:smoke-execution-turn` PASS no novo repo.
- `npm run provider:staging:smoke-execution-turn` PASS via wrapper do repo atual.
- `npm test` PASS 491/491 no novo repo.
- Resultado do gate: `connects_to_provider=false`, `executable_provider_commands=false`, `executed=false`, `evidence_written=false`, `redacts_provider_handles=true`, `next_checkpoint=collect_provider_health_and_webhook_isolation_evidence`.

### Bloqueios Mantidos

- `--execute` e qualquer provider real continuam bloqueados neste checkpoint.
- Proximo passo seguro: coletar/registrar provider health e webhook isolation evidence sem imprimir secrets e sem atualizar webhook real automaticamente.

### Executado

- Criado checkpoint local-only de Provider staging approval no novo repo.
- Adicionado wrapper `npm run provider:staging:approval-checkpoint` no repo atual.
- O checkpoint define o envelope de aprovacao humana para o primeiro smoke Provider staging real, exigindo fake actors, provider health evidence, webhook isolation, rollback owner, evidence location e secret source names sem valores.

### Validado

- `node --test tests/architecture/provider-staging-approval-checkpoint.test.mjs` PASS 5/5.
- `INKFLOW_ENV=local PROVIDER_ENV=local npm run provider:staging:approval-checkpoint` PASS no novo repo.
- `npm run provider:staging:approval-checkpoint` PASS via wrapper do repo atual.
- `npm test` PASS 486/486 no novo repo.
- Resultado do gate: `ready_for_human_approval=true`, `connects_to_provider=false`, `provider_staging_smoke_execution_authorized=false`, `provider_webhook_update_authorized=false`, `provider_secret_sync_authorized=false`, `approval_phrase_required=APPROVE_PROVIDER_STAGING_SMOKE_ONLY`.

### Bloqueios Mantidos

- O gate de aprovacao nao executa Evolution, WhatsApp, Telegram, webhook update, secret sync, deploy nem producao.
- Proximo passo seguro: preparar o executor/turno de Provider staging smoke em modo plano, ainda bloqueado ate aprovacao humana especifica.

### Executado

- Criado checkpoint local-only de Provider staging isolation no novo repo.
- Adicionado wrapper `npm run provider:staging:isolation-checkpoint` no repo atual.
- O checkpoint valida pacote de evidencia Provider staging, promotion gate de provider real, evidencia RLS smoke staging, atores fake e bloqueios contra provider real, webhook update, secret sync, deploy e producao.

### Validado

- `node --test tests/architecture/provider-staging-isolation-checkpoint.test.mjs` PASS 6/6.
- `INKFLOW_ENV=local PROVIDER_ENV=local npm run provider:staging:isolation-checkpoint` PASS no novo repo.
- `npm run provider:staging:isolation-checkpoint` PASS via wrapper do repo atual.
- Resultado do gate: `connects_to_provider=false`, `provider_staging_smoke_execution_authorized=false`, `provider_webhook_update_authorized=false`, `provider_secret_sync_authorized=false`, `required_approval_phrase=APPROVE_PROVIDER_STAGING_SMOKE_ONLY`.

### Bloqueios Mantidos

- Evolution, WhatsApp, Telegram, webhook update, secret sync, deploy e producao seguem bloqueados ate aprovacao operacional especifica para Provider staging smoke.

### Executado

- Executada a Supabase staging manual migration no projeto `inkflow-staging` pelo runner oficial, apos aprovacao explicita `APPROVE_SUPABASE_STAGING_MANUAL_MIGRATION_EXECUTION`.
- Aplicado rollback versionado antes da execucao oficial para garantir staging limpo.
- Usada DB URL direta apenas em memoria porque a URL pooler local falhou com `tenant/user postgres.<project-ref> not found`; nenhum segredo foi registrado em docs, output ou commit.
- Criada e validada a evidencia `docs/evidence/supabase-staging/migration-execution-manual-2026-05-31T000000000Z.md`.
- Validado inventario real pos-migration: 25 tabelas publicas, 49 policies e RLS ativo em 25 tabelas.

### Validado

- `npm run supabase:staging:manual-migration-execution-turn -- --execute` PASS com `evidence_written=true`, `evidence_validated=true` e `redacts_db_url=true`.
- `npm run supabase:staging:validate-migration-execution-evidence -- docs/evidence/supabase-staging/migration-execution-manual-2026-05-31T000000000Z.md` PASS via wrapper do repo atual.
- `node --test tests/architecture/supabase-staging-manual-migration-execution-turn.test.mjs` PASS 5/5.
- `npm test` PASS 468/468 no novo repo.

### Bloqueios Mantidos

- Producao, secret sync, provider real, deploy, billing activation e customer data migration seguem bloqueados.
- Proximo gate seguro: RLS smoke em staging com fixture fake e evidence propria.

## 2026-05-27

### Adicionado

- Criada trilha `docs/reconstrucao-controlada/`.
- Registrado handoff oficial da frente.
- Criado mapa inicial de extracao do repo atual.
- Criada arquitetura total alvo da plataforma InkFlow.
- Criada governanca de versionamento e regra anti-poluicao.
- Criado plano de acao faseado da reconstrucao controlada.
- Criada matriz de extracao operacional por frente, com origem, decisao, destino, risco, teste, pronto e dependencias.
- Criados contratos base da plataforma: entidades canonicas, estados, relacoes entre modulos e validacoes obrigatorias.
- Criado Tenant Config Contract com blocos, defaults, snapshots, invariantes, fixtures e testes obrigatorios.
- Criado Data Governance Contract com inventario de dados, papeis, direitos do titular, retencao, suboperadores, incidentes e testes obrigatorios.
- Criado Test Strategy Contract com niveis de teste, matriz por mudanca, gates, evidencias e stop conditions.
- Criada decisao de stack para o novo repo: monorepo TypeScript, npm workspaces, React/Vite para apps, Cloudflare Workers para APIs/runtime e Supabase Postgres/RLS.
- Criado checklist do primeiro slice do novo repo, com escopo permitido, arquivos iniciais, CI minimo, gate e rollback.
- Criado scaffold local do novo repo `inkflow-platform` em `/Users/brazilianhustler/Documents/inkflow-platform`.
- Commit inicial do novo repo: `b815ccb chore: scaffold inkflow platform monorepo`.
- Validacoes do scaffold: `npm test`, `npm run typecheck` e `npm run lint` passaram.
- Implementado primeiro dominio funcional no novo repo: `packages/tenant-config`.
- Commit do novo repo: `2dbccef feat: implement tenant config contract`.
- Validacoes atuais do novo repo: `npm test` PASS 12/12, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado segundo dominio funcional no novo repo: `packages/domain`.
- Commit do novo repo: `266fb02 feat: implement domain contracts`.
- Validacoes atuais do novo repo: `npm test` PASS 22/22, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado terceiro dominio funcional no novo repo: `packages/workflow`.
- Commit do novo repo: `23a00ef feat: implement workflow transitions`.
- Validacoes atuais do novo repo: `npm test` PASS 35/35, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado quarto dominio funcional no novo repo: `packages/pricing`.
- Commit do novo repo: `daf54f3 feat: implement pricing foundation`.
- Validacoes atuais do novo repo: `npm test` PASS 45/45, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado quinto dominio funcional no novo repo: `packages/observability`.
- Commit do novo repo: `9c1e812 feat: implement observability contracts`.
- Validacoes atuais do novo repo: `npm test` PASS 54/54, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado sexto dominio funcional no novo repo: `packages/media-intelligence`.
- Commit do novo repo: `9fb7fac feat: implement media classification contract`.
- Validacoes atuais do novo repo: `npm test` PASS 62/62, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado setimo dominio funcional no novo repo: `packages/conversation-engine`.
- Commit do novo repo: `2aa9cb0 feat: implement conversation engine contracts`.
- Validacoes atuais do novo repo: `npm test` PASS 74/74, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado oitavo dominio funcional no novo repo: `packages/response-composer`.
- Commit do novo repo: `4dcb87b feat: implement response composer contracts`.
- Validacoes atuais do novo repo: `npm test` PASS 83/83, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado nono dominio funcional no novo repo: `packages/bot-runtime-contract`.
- Commit do novo repo: `2e49930 feat: implement bot runtime contract`.
- Validacoes atuais do novo repo: `npm test` PASS 91/91, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado primeiro service local-only no novo repo: `services/bot-orchestrator`.
- Commit do novo repo: `2de30cb feat: implement local bot orchestrator`.
- Validacoes atuais do novo repo: `npm test` PASS 97/97, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado primeiro adapter simulado no novo repo: `packages/integrations/channel-adapters`.
- Commit do novo repo: `73e18d2 feat: implement simulated channel adapters`.
- Validacoes atuais do novo repo: `npm test` PASS 105/105, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Integrado `services/bot-orchestrator` com `packages/integrations/channel-adapters` em modo simulado.
- Commit do novo repo: `87d2310 feat: wire orchestrator to simulated channel adapter`.
- Validacoes atuais do novo repo: `npm test` PASS 107/107, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado audit store local em memoria no novo repo: `packages/integrations/local-audit-store`.
- Commit do novo repo: `115025f feat: implement local audit store`.
- Validacoes atuais do novo repo: `npm test` PASS 113/113, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Integrado `services/bot-orchestrator` com `packages/integrations/local-audit-store`.
- Commit do novo repo: `a75b7df feat: record orchestrator runs in local audit store`.
- Validacoes atuais do novo repo: `npm test` PASS 115/115, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado pacote de contratos de persistencia no novo repo: `packages/persistence-contracts`.
- Commit do novo repo: `ec76454 feat: implement persistence contracts`.
- Validacoes atuais do novo repo: `npm test` PASS 125/125, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado skeleton inicial do painel no novo repo: `apps/admin`.
- Commit do novo repo: `7434586 feat: scaffold admin app shell`.
- Validacoes atuais do novo repo: `npm test` PASS 129/129, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado primeiro modulo funcional do painel no novo repo: `apps/admin/src/modules/studio-settings`.
- Commit do novo repo: `d098d1f feat: add admin studio settings module`.
- Validacoes atuais do novo repo: `npm test` PASS 136/136, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado modulo de controle operacional do bot premium no novo repo: `apps/admin/src/modules/bot-control`.
- Commit do novo repo: `836fbef feat: add admin bot control module`.
- Validacoes atuais do novo repo: `npm test` PASS 142/142, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado modulo local de knowledge admin no novo repo: `apps/admin/src/modules/knowledge-admin`.
- Commit do novo repo: `382c5a8 feat: add admin knowledge module`.
- Validacoes atuais do novo repo: `npm test` PASS 150/150, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado contrato local de rotas e permissoes do painel no novo repo: `apps/admin/src/modules/admin-access`.
- Commit do novo repo: `244fa4d feat: add admin access contract`.
- Validacoes atuais do novo repo: `npm test` PASS 157/157, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementada renderizacao estatica inicial dos modulos locais no novo repo: `apps/admin`.
- Commit do novo repo: `52276de feat: render admin local modules`.
- Validacoes atuais do novo repo: `npm test` PASS 158/158, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado modulo local de equipe/usuarios no novo repo: `apps/admin/src/modules/team-admin`, com `StudioUser` no dominio e `studioUsers` nos persistence contracts.
- Commit do novo repo: `d7ae443 feat: add admin team module`.
- Validacoes atuais do novo repo: `npm test` PASS 167/167, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado modulo local de billing/entitlements no novo repo: `apps/admin/src/modules/billing-admin`, com `Payment`/`Entitlement` no dominio e `payments`/`entitlements` nos persistence contracts.
- Commit do novo repo: `c393f7c feat: add admin billing module`.
- Validacoes atuais do novo repo: `npm test` PASS 177/177, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado modulo local de Legal/LGPD no novo repo: `apps/admin/src/modules/legal-admin`, com `ConsentRecord`/`DataSubjectRequest` no dominio e `consentRecords`/`dataSubjectRequests` nos persistence contracts.
- Commit do novo repo: `c3178bf feat: add admin legal module`.
- Validacoes atuais do novo repo: `npm test` PASS 187/187, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Registrado checkpoint estrutural do admin no novo repo: `docs/architecture/admin-structural-checkpoint.md`.
- Commit do novo repo: `06d8f97 docs: add admin structural checkpoint`.
- Validacoes atuais do novo repo: `npm test` PASS 187/187, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Registrado contrato Supabase local no novo repo: `docs/architecture/supabase-local-contract.md`.
- Commit do novo repo: `ba87e55 docs: add supabase local contract`.
- Escopo do contrato: tenancy, auth identity, RLS, tabelas de bot/admin, audit, secrets boundary, storage, migrations, rollback, fixtures e gates de teste, sem Supabase real.
- Validacoes atuais do novo repo: `npm test` PASS 187/187, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado schema draft Supabase local no novo repo: SQL draft inicial, rollback, fixtures e teste estatico em `tests/architecture/supabase-schema-draft.test.mjs`.
- Commit do novo repo: `8f21329 feat: add supabase schema draft`.
- Validacoes atuais do novo repo: `npm test` PASS 193/193, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado contrato auth identity no novo repo: convite, login, revogacao, service boundary e alinhamento de roles entre domain/admin/schema.
- Commit do novo repo: `0549802 feat: add auth identity contract`.
- Validacoes atuais do novo repo: `npm test` PASS 199/199, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Registrado crosswalk repo original x arquitetura alvo em `docs/reconstrucao-controlada/12-crosswalk-repo-original-arquitetura.md`.
- Registrado checkpoint Supabase policy harness no novo repo: `docs/architecture/supabase-policy-harness-checkpoint.md`.
- Commit do novo repo: `4696121 docs: add supabase policy harness checkpoint`.
- Validacoes atuais do novo repo: `npm test` PASS 203/203, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado guard local do Supabase policy harness no novo repo: `infra/supabase/local-policy-harness`.
- Commit do novo repo: `33a5cb4 feat: add local policy harness guard`.
- Validacoes atuais do novo repo: `npm test` PASS 209/209, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:guard` PASS.
- Implementado dry-run local do Supabase policy harness no novo repo.
- Commit do novo repo: `f11af8c feat: add local policy harness dry run`.
- Validacoes atuais do novo repo: `npm test` PASS 213/213, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:dry-run` PASS com 11 cenarios.
- Implementado detector de ferramentas locais do Supabase policy harness no novo repo.
- Commit do novo repo: `a080bc5 feat: add local policy harness tool detection`.
- Validacoes atuais do novo repo: `npm test` PASS 218/218, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:detect-tools` PASS com `static-only-fallback`.
- Registrado plano operacional do Supabase policy harness no novo repo.
- Commit do novo repo: `354a288 docs: add policy harness operational plan`.
- Validacoes atuais do novo repo: `npm test` PASS 222/222, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Registrado Supabase tooling readiness checkpoint no novo repo.
- Commit do novo repo: `00a4dba docs: add supabase tooling readiness checkpoint`.
- Validacoes atuais do novo repo: `npm test` PASS 226/226, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado static policy coverage gate no Supabase policy harness do novo repo.
- Commit do novo repo: `4304223 feat: add supabase static policy coverage`.
- Escopo: gate local nao executavel para checar cobertura estatica de policies, boundaries tenant, roles/status, service_role em writes runtime, audit append-only, provider secret boundary, rollback e cenarios.
- Validacoes atuais do novo repo: `npm test` PASS 234/234, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:static-coverage` PASS.
- Habilitado tooling local para Supabase policy harness no ambiente: Supabase CLI, Docker CLI, Docker Compose e Colima.
- Commit do novo repo: `4042732 docs: record supabase local tooling enabled`.
- Detector atual do novo repo: `supabase-cli-local`, com `supabase=true docker=true psql=false`.
- Validacoes atuais do novo repo: `npm test` PASS 235/235, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, guard/dry-run/static-coverage PASS.
- Implementado e executado runner real local do Supabase policy harness.
- Commit do novo repo: `8b1d729 feat: add supabase local policy runner`.
- Evidencia real: `Supabase CLI local policy runner executed 142 steps. RLS scenarios and rollback drill passed in local Supabase.`
- Falha real encontrada e corrigida: recursao RLS em `active_tenant_ids/active_tenant_role`, corrigida com `security definer` e `search_path = public`.
- Hardening adicional: subprocessos do runner agora recebem ambiente sanitizado, sem herdar tokens/secrets nao relacionados.
- Validacoes atuais do novo repo: `npm test` PASS 249/249, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, runner real local PASS.
- Registrada policy de promocao de migrations/staging/rollback no novo repo: `docs/architecture/supabase-migration-promotion-policy.md`.
- Commit do novo repo: `8f392c9 docs: add migration promotion policy`.
- Escopo da policy: ladder de promocao, package obrigatorio, staging gate, production gate, rollback doctrine, boundary de secrets, revisao de grants para browser e stop conditions.
- Validacoes atuais do novo repo: `npm test` PASS 254/254, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado checker/gerador local de package de migration no novo repo.
- Commit do novo repo: `9003d02 feat: add migration package checker`.
- Escopo: `npm run supabase:migration:package-check`, package review-only, inventario de tabelas/policies/functions/grants, evidencias local runner, staging bloqueado, checklist producao falso, scanner de secrets e garantia de zero conexao staging/producao.
- Evidencia: package `supabase_20260528_initial_platform_schema` review-ready, 25 tabelas, 49 policies, `connects_to_staging=false`, `connects_to_production=false`, `production_ready=false`.
- Validacoes atuais do novo repo: `npm test` PASS 260/260, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:migration:package-check` PASS.
- Registrado plano de staging package no novo repo: `docs/architecture/supabase-staging-package-plan.md`.
- Commit do novo repo: `9e37a63 docs: add staging package plan`.
- Escopo: inputs obrigatorios, boundary contra credenciais/endpoints de producao, backup/export, smoke RLS staging, readiness checklist e stop conditions, sem conectar staging.
- Validacoes atuais do novo repo: `npm test` PASS 265/265, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado checker local de staging readiness no novo repo.
- Commit do novo repo: `fcb13d1 feat: add staging readiness checker`.
- Escopo: `npm run supabase:staging:readiness`, valida package id, secret source names, backup/export, rollback/forward-fix, fixtures fake, smoke RLS, approval record e boundaries de execucao sempre false.
- Evidencia: ready_for_operator_review=true, staging_execution_authorized=false, production_execution_authorized=false, smoke_count=9, secret_source_count=3.
- Validacoes atuais do novo repo: `npm test` PASS 271/271, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:staging:readiness` PASS.
- Implementado runbook manual e gate local de execucao staging no novo repo.
- Commit do novo repo: `a68a9be feat: add staging execution gate`.
- Escopo: `docs/architecture/supabase-staging-execution-runbook.md`, `npm run supabase:staging:execution-gate`, validacao do runbook, precondicoes, backup, rollback/forward-fix, smoke RLS, aprovacao humana, stop conditions e bloqueios contra comando executavel/secret/production-like.
- Evidencia: ready_for_manual_review=true, staging_execution_authorized=false, production_execution_authorized=false, connects_to_staging=false, connects_to_production=false.
- Validacoes atuais do novo repo: `npm test` PASS 277/277, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, package-check PASS, staging-readiness PASS, staging-execution-gate PASS.
- Implementado `packages/knowledge-service` local-only no novo repo.
- Commit do novo repo: `0ffa38f feat: add knowledge service`.
- Escopo: retrieval deterministico local por tenant, published-only, source trace, confidence, redaction, fallback seguro, bloqueio de query com secret-like value e autoridade `consultative_only`.
- Limites: sem LLM, embeddings, vector DB, Supabase, storage, WhatsApp, Telegram, Evolution, rede, secrets ou deploy; nao decide workflow, preco, menoridade, cobertura, handoff, pagamento, agenda ou conclusao de orcamento.
- Validacoes atuais do novo repo: `npm test` PASS 285/285, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Integrado knowledge context ao bot runtime e orchestrator no novo repo.
- Commit do novo repo: `110624b feat: wire knowledge context into bot runtime`.
- Escopo: `planBotTurn` aceita `knowledge_context`, resposta lateral pode usar `answer_text`, plano preserva source trace e runtime rejeita knowledge que tenta mudar workflow/preco/handoff.
- Validacoes atuais do novo repo: `npm test` PASS 288/288, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado `packages/auth-session` local-only no novo repo.
- Commit do novo repo: `360d249 feat: add auth session runtime`.
- Escopo: resolucao de sessao por `studio_users`, bloqueio de identidades `invited/disabled/revoked`, bloqueio cross-tenant, derivacao de permissoes pela matriz `admin-access`, autorizacao de rotas/acoes, exigencia de evidencia de auditoria para acoes sensiveis e bloqueio de metadata secret-like.
- Limites: sem Supabase Auth real, JWT, cookies, browser storage, RLS remoto, staging migration, deploy, secrets, WhatsApp, Telegram ou Evolution.
- Validacoes atuais do novo repo: `npm test` PASS 296/296, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Conectado admin shell/view-model ao `packages/auth-session` no novo repo.
- Commit do novo repo: `1c4a142 feat: connect admin to auth session`.
- Escopo: `createAdminViewModel` resolve `auth_session`, expoe `access_control`, deriva papel/permissoes da identidade salva, nega identidade inativa, nega role claim divergente e remove rotas/permissoes quando a sessao e invalida.
- Limites: sem Supabase Auth real, JWT, cookies, browser storage, staging, deploy, secrets ou UI framework final.
- Validacoes atuais do novo repo: `npm test` PASS 298/298, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado gate local de autorizacao para actions administrativas no novo repo.
- Commit do novo repo: `8fbf682 feat: require auth for admin actions`.
- Escopo: helper central `admin-action-auth`, protecao de writes de studio settings, bot control, knowledge, billing, legal e team; exige `auth-session`, permissao correta, tenant match e evidencia de auditoria para acoes sensiveis antes de mutar persistence contracts.
- Limites: sem Supabase Auth real, JWT, cookies, browser storage, staging, deploy, secrets, providers reais ou UI framework final.
- Validacoes atuais do novo repo: `npm test` PASS 299/299, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado pacote local-only `packages/provider-connections` no novo repo.
- Commit do novo repo: `edd0551 feat: add provider secret boundary`.
- Escopo: modela conexoes Evolution, Telegram, Mercado Pago, OpenAI, email e Supabase com metadata segura; aceita apenas `secret_binding_id` opaco; rejeita campos/valores de segredo bruto; public view e summary nunca expoem binding ID.
- Limites: sem leitura de env, Cloudflare secrets, Supabase Vault, arquivos, rede, providers reais, staging, deploy ou sync de secrets.
- Validacoes atuais do novo repo: `npm test` PASS 305/305, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Conectados summaries publicos de provider-connections ao admin shell local-only no novo repo.
- Commit do novo repo: `21da8f0 feat: expose provider summaries in admin`.
- Escopo: `apps/admin` recebe provider connections internas, converte para summary publico, renderiza secao/rota read-only `/providers` com `providers.view`, mostra label/provider/redacted identifier/health/readiness e bloqueia `secret_binding_id`/`secbind_` no view-model e HTML.
- Ajuste de seguranca: scanner de secrets passou a permitir o metadado booleano seguro `requires_secret_manager`, sem liberar campos ou valores de segredo bruto.
- Double check: HTML renderizado contem `href="#providers"` e `id="providers"`, mas nao contem `secret_binding_id` nem `secbind_`; `can_connect_real_providers=false`.
- Limites: sem env, Cloudflare secrets, Supabase Vault, providers reais, Evolution, Telegram, Mercado Pago, OpenAI real, rede, staging, deploy ou sync de secrets.
- Validacoes atuais do novo repo: `npm test` PASS 306/306, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Implementado modulo/action local-only de administracao de provider metadata no novo repo.
- Commit do novo repo: `f73d496 feat: add provider metadata admin module`.
- Escopo: adiciona `providerConnections` aos persistence contracts, modulo `apps/admin/src/modules/providers`, permissao `providers.manage`, actions auditadas para upsert/disable/mark health, view-model publico e checkpoint `provider-admin-local-metadata-checkpoint`.
- Segurança: `secret_binding_id` continua apenas como referencia interna opaca; view-model, HTML e audit payload nao expoem `secret_binding_id` nem `secbind_`; payload usa `binding_configured` e `real_provider_connected=false`.
- Double check: render direto confirmou `htmlHasSecretBindingId=false`, `htmlHasSecbind=false`; action auditada confirmou `auditHasSecretBindingId=false`, `auditHasSecbind=false` e `realConnected=false`.
- Limites: sem env, Cloudflare secrets, Supabase Vault, providers reais, Evolution, Telegram, Mercado Pago, OpenAI real, rede, staging, deploy ou sync de secrets.
- Validacoes atuais do novo repo: `npm test` PASS 314/314, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder.
- Alinhado schema draft/checkers Supabase com provider metadata no novo repo.
- Commit do novo repo: `6153ff9 feat: harden provider metadata policies`.
- Commit de evidencia do novo repo: `865caae docs: record provider metadata rls evidence`.
- Escopo: `provider_connections` agora tem provider enum, health enum, `updated_at`, binding opaco `secbind|binding|vaultref`, unique por tenant/provider/label, cenarios RLS para owner/viewer em mutation e checkpoint `supabase-provider-metadata-policy-checkpoint`.
- Segurança: RLS de select da tabela interna ficou limitado a owner/admin/service_role porque RLS nao redige colunas; summaries seguros para leitura ampla devem vir por view-model/read model redigido, nao por SELECT direto em `provider_connections`.
- Double check: scan final encontrou apenas testes negativos/guardrails para secrets e comandos proibidos; nenhum secret real, staging/prod ou comando executavel de migration foi adicionado.
- Limites: sem migration real, staging, producao, Supabase remoto, providers reais, rede, deploy ou secrets.
- Validacoes atuais do novo repo: `npm test` PASS 315/315, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:dry-run` PASS com 13 cenarios, `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:static-coverage` PASS com 25 tabelas/13 cenarios, `INKFLOW_ENV=local SUPABASE_ENV=local SUPABASE_POLICY_RUNNER_EXECUTE=1 npm run supabase:policy:local-runner` PASS com 142 etapas/cenarios RLS/rollback drill, `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:migration:package-check` PASS review-ready com staging/producao false.
- Implementado provider runtime boundary local-only no novo repo.
- Commit do novo repo: `9270f5d feat: add provider runtime boundary`.
- Escopo: novo `packages/provider-runtime`, checkpoint `provider-runtime-boundary-checkpoint`, testes de contrato para resolucao server-side, bloqueio browser/admin/client, match tenant/provider/connection/binding, disabled connection, handle opaco para adapter e auditoria redigida.
- Segurança: `secret_binding_id` continua metadata opaca; runtime recebe apenas `runtime_handle_*`; audit event nao expoe `secret_binding_id`, `secbind_*`, binding opaco, credential handle ou segredo bruto; real secret manager segue bloqueado.
- Double check: scan focado em provider-runtime/checkpoint nao encontrou secrets, comandos staging/prod ou tokens estaticos.
- Limites: sem env, Cloudflare Secrets, Supabase Vault, provider real, rede, staging, producao, deploy ou secrets.
- Validacoes atuais do novo repo: `npm test` PASS 325/325, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, scan focado de seguranca PASS.
- Integrado provider runtime boundary aos adapters simulados no novo repo.
- Commit do novo repo: `3ae484c feat: wire provider runtime to simulated adapters`.
- Escopo: `createProviderRuntimeChannelAdapter` em `packages/integrations/channel-adapters`, mapeando WhatsApp->Evolution e Telegram->Telegram, resolvendo runtime credential antes do envio simulado e retornando receipt redigido.
- Segurança: browser/admin/client bloqueados antes do envio; missing binding, mismatch e disabled connection falham antes do envio; receipt/snapshot/audit nao expoem `secret_binding_id`, `secbind_*`, `vaultref_*`, `binding_*` ou `runtime_handle_*`.
- Limites: sem Evolution real, Telegram real, email real, Cloudflare Secrets, Supabase Vault, env secrets, rede, staging, producao ou deploy.
- Validacoes atuais do novo repo: `npm test` PASS 331/331, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, scan focado de seguranca PASS.
- Validado bot-orchestrator com delivery provider-aware local-only no novo repo.
- Commit do novo repo: `d66180e test: cover provider-aware bot delivery`.
- Escopo: testes do `services/bot-orchestrator` cobrem sucesso provider-aware com audit store, falha provider-runtime como failed delivery redigido e garantia de que turn invalido nao chama adapter.
- Segurança: snapshots/result/audit nao expoem `secret_binding_id`, `secbind_*`, `vaultref_*`, `binding_*`, `runtime_handle_*` ou segredo bruto.
- Limites: sem Evolution real, Telegram real, Cloudflare Secrets, Supabase Vault, env secrets, rede, staging, producao ou deploy.
- Validacoes atuais do novo repo: `npm test` PASS 336/336, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, scan focado de seguranca PASS.
- Implementado notification service local-only no novo repo.
- Commit do novo repo: `c2cac5f feat: add local notification service`.
- Escopo: novo `services/notifications` para roteamento de notificacoes operacionais por provider-aware adapters simulados, cobrindo WhatsApp/Evolution simulado, Telegram simulado, request validation, delivery receipt, audit event e snapshot local.
- Segurança: request metadata rejeita segredo bruto; result/audit nao expoem `secret_binding_id`, `secbind_*`, `vaultref_*` ou `runtime_handle_*`; adapter ausente e binding ausente falham seguro.
- Limites: sem Evolution real, Telegram real, Cloudflare Secrets, Supabase Vault, env secrets, rede, staging, producao ou deploy.
- Validacoes atuais do novo repo: `npm test` PASS 344/344, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, scan focado de seguranca PASS.
- Integrado bot-orchestrator ao notification service local-only no novo repo.
- Commit do novo repo: `2115aa1 feat: dispatch operational notifications locally`.
- Escopo: `receiveTurnAndDeliver` agora pode disparar side effects via `services/notifications`; `waiting_artist` emite `quote_request` para Telegram simulado e `create_handoff_package` emite `handoff_alert`; invalid turn nao dispara notificacao.
- Segurança: notifications continuam sem provider real; resultados/snapshots/audit nao expoem `secret_binding_id`, `secbind_*`, `vaultref_*` ou `runtime_handle_*`; workflow/policy seguem como autoridade de estado, preco, handoff e resposta ao cliente.
- Limites: sem Evolution real, Telegram real, Cloudflare Secrets, Supabase Vault, env secrets, rede, staging, producao ou deploy.
- Validacoes atuais do novo repo: `npm test` PASS 350/350, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, scan focado de seguranca PASS.
- Oficializado Strategic Review Gate na metodologia da reconstrucao controlada.
- Escopo: autoanalise leve obrigatoria em fechamento de bloco, troca de frente, promocao de automacao/ambiente/provider real, regressao ou repeticao de micro slices; proibida como pausa generica quando os gates estao verdes e o proximo passo continua na mesma frente.
- Limites: sem codigo, sem provider real, sem staging, sem deploy, sem secrets e sem novos testes obrigatorios para docs-only.
- Implementado artist quote intake service local-only no novo repo.
- Commit do novo repo: `86b1641 feat: add artist quote intake service`.
- Escopo: novo `services/artist-quote-intake` aceita resposta de orcamento normalizada do tatuador, valida cobertura via pricing, compoe proposta unica via response-composer e cria notification `quote_response` para WhatsApp simulado.
- Segurança: rejeita metadata secret-like; nao expoe `secret_binding_id`, `secbind_*`, `vaultref_*` ou `runtime_handle_*`; raw Telegram free-text parser fica explicitamente fora do service.
- Limites: sem Evolution real, Telegram real, parser bruto, Cloudflare Secrets, Supabase Vault, env secrets, rede, staging, producao ou deploy.
- Validacoes atuais do novo repo: `npm test` PASS 358/358, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, scan focado de seguranca PASS.
- Integrado artist quote intake ao notification service local-only no novo repo.
- Commit do novo repo: `3c784c9 feat: send artist quote responses locally`.
- Escopo: `createInMemoryArtistQuoteIntakeService` com `processAndNotify` processa quote normalizado e envia uma unica notification `quote_response` por WhatsApp simulado provider-aware; falhas de quote ou notification service ausente nao acionam provider real.
- Segurança: snapshots/result/audit nao expoem `secret_binding_id`, `secbind_*`, `vaultref_*` ou `runtime_handle_*`; nenhum parser bruto, provider real, rede, staging, producao ou secrets.
- Limites: sem Evolution real, Telegram real, parser bruto, Cloudflare Secrets, Supabase Vault, env secrets, rede, staging, producao ou deploy.
- Validacoes atuais do novo repo: `npm test` PASS 361/361, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, scan focado de seguranca PASS.
- Implementado artist quote Telegram adapter local-only no novo repo.
- Commit do novo repo: `573d46d feat: normalize artist telegram quotes locally`.
- Escopo: `services/artist-quote-telegram-adapter` valida envelope controlado de resposta Telegram, confere `reply_to_ref`, normaliza formatos estritos por item/sessao e aciona `artist-quote-intake` para entregar uma unica `quote_response` local.
- Segurança: texto livre amplo, ref divergente, valores ausentes e duplicados falham antes do intake/delivery; snapshots/result/audit nao expoem credencial real.
- Limites: sem Telegram real, Evolution real, parser amplo, Cloudflare Secrets, Supabase Vault, env secrets, rede, staging, producao ou deploy.
- Validacoes atuais do novo repo: `npm test` PASS 371/371, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, scan focado de seguranca PASS com apenas guards/fixtures.
- Integrado contexto/ref de quote request ao bot-orchestrator/notifications local-only no novo repo.
- Commit do novo repo: `1e42140 feat: attach quote request context locally`.
- Escopo: `quote_request` local agora pode carregar `quote_request_context` e `quote_request_ref`, com instrucoes estritas por item/sessao no texto ao tatuador e metadata segura preservada no notification result.
- Segurança: metadata continua bloqueando valores secret-like; scan focado encontrou apenas guards/fixtures, sem credencial real.
- Limites: sem Telegram real, Evolution real, parser amplo, Cloudflare Secrets, Supabase Vault, env secrets, rede, staging, producao ou deploy.
- Validacoes atuais do novo repo: `npm test` PASS 372/372, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, scan focado de seguranca PASS.
- Criado checkpoint de roundtrip local de orcamento do tatuador no novo repo.
- Commit do novo repo: `1d39a6d test: prove local artist quote roundtrip`.
- Escopo: prova local completa une bot-orchestrator `quote_request`, `quote_request_context/ref`, Telegram quote adapter, artist quote intake, notifications service e WhatsApp `quote_response` simulada, com recibos separados e auditoria redigida.
- Segurança: sem provider real, sem parser amplo, sem secrets; scan focado encontrou apenas guards/fixtures.
- Limites: sem Telegram real, Evolution real, Cloudflare Secrets, Supabase Vault, env secrets, rede, staging, producao ou deploy.
- Validacoes atuais do novo repo: `npm test` PASS 376/376, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, scan focado de seguranca PASS.
- Adicionado contrato local de persistencia para quote request contexts no novo repo.
- Commit do novo repo: `d113c19 feat: persist quote request contexts locally`.
- Escopo: `QuoteRequestContextRepository` salva `quote_request_ref`/`quote_request_context` tenant-scoped, valida tenant/conversation/ref/budget items/status, bloqueia metadata secret-like e oferece `getByRef`, `listByConversation` e `listPendingByTenant`.
- Segurança: sem Supabase real, migration real, provider real, secrets, staging ou deploy.
- Validacoes atuais do novo repo: `npm test` PASS 379/379, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, scan focado de seguranca PASS com apenas guards/fixtures.
- Integrado bot-orchestrator ao contrato local de quote request contexts no novo repo.
- Commit do novo repo: `6b99dbb feat: persist quote context from orchestrator`.
- Escopo: apos `quote_request` enviado com sucesso, o orchestrator salva `quote_request_context` em `QuoteRequestContextRepository`; falha de persistencia e registrada no snapshot sem rollback da notificacao.
- Segurança: sem Supabase real, migration real, provider real, secrets, staging ou deploy.
- Validacoes atuais do novo repo: `npm test` PASS 381/381, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, scan focado de seguranca PASS com apenas guards/fixtures.
- Atualizado roundtrip local para usar contexto persistido por ref no novo repo.
- Commit do novo repo: `95da063 test: use persisted quote context in roundtrip`.
- Escopo: teste/checkpoint agora validam quote_request enviado, contexto persistido, lookup por `quote_request_ref`, Telegram adapter, artist quote intake e WhatsApp `quote_response` simulada.
- Segurança: sem Supabase real, migration real, provider real, secrets, staging ou deploy.
- Validacoes atuais do novo repo: `npm test` PASS 381/381, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, scan focado de seguranca PASS com apenas guards/fixtures.
- Implementado runbook manual e gate local de promocao para provider real no novo repo.
- Commit do novo repo: `13f1d27 feat: add provider delivery promotion gate`.
- Escopo: `docs/architecture/provider-real-delivery-promotion-runbook.md`, `npm run provider:delivery:promotion-gate`, evidencias locais obrigatorias, secret source names, isolamento staging, smoke plan, rollback, stop conditions e bloqueios contra autorizacao automatica, production-like env, comando executavel de provider e secrets crus.
- Evidencia: `real_provider_execution_authorized=false`, `staging_execution_authorized=false`, `production_execution_authorized=false`, `connects_to_provider=false`.
- Validacoes atuais do novo repo: `node --test tests/architecture/provider-real-delivery-promotion-gate.test.mjs` PASS 5/5, `INKFLOW_ENV=local PROVIDER_ENV=local npm run provider:delivery:promotion-gate` PASS, `npm test` PASS 386/386, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `git diff --check` PASS, scan focado de seguranca PASS apenas com regex/fixtures negativos do proprio gate.
- Implementado pacote local de prontidao para Stage no novo repo.
- Commit do novo repo: `645e407 feat: add stage readiness package`.
- Escopo: `docs/architecture/stage-readiness-package.md`, `npm run stage:readiness-package`, Definition of Done para as tres lacunas restantes: Supabase staging, Provider staging e SaaS runtime staging.
- Evidencia: `stage_execution_authorized=false`, `production_execution_authorized=false`, `real_provider_execution_authorized=false`, `deploy_execution_authorized=false`, `connects_to_staging=false`, `connects_to_provider=false`, `deploys_now=false`.
- Validacoes atuais do novo repo: `node --test tests/architecture/stage-readiness-package.test.mjs` PASS 5/5, `INKFLOW_ENV=local STAGE_ENV=local npm run stage:readiness-package` PASS, `npm test` PASS 391/391, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `git diff --check` PASS, scan focado de seguranca PASS apenas com regex/fixtures negativos do proprio gate.
- Implementado pacote operacional de evidencia local para Supabase staging no novo repo.
- Commit do novo repo: `692930e feat: add supabase staging evidence package`.
- Escopo: `docs/architecture/supabase-staging-operational-evidence-package.md`, `npm run supabase:staging:evidence-package`, consolidando migration package, staging readiness e staging execution gate.
- Evidencia: `staging_execution_authorized=false`, `production_execution_authorized=false`, `secret_sync_authorized=false`, `connects_to_staging=false`, `executable_database_commands=false`, blockers esperados registrados.
- Validacoes atuais do novo repo: `node --test tests/architecture/supabase-staging-evidence-package.test.mjs` PASS 5/5, `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:staging:evidence-package` PASS, `npm test` PASS 396/396, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `git diff --check` PASS, scan focado de seguranca PASS apenas com regex/fixtures negativos do proprio gate.
- Implementado pacote operacional de evidencia local para Provider staging no novo repo.
- Commit do novo repo: `5ea6001 feat: add provider staging evidence package`.
- Escopo: `docs/architecture/provider-staging-operational-evidence-package.md`, `npm run provider:staging:evidence-package`, consolidando fake tenant/client/artist, promotion gate, secret source names, smoke coverage, rollback e blockers.
- Evidencia: `provider_staging_execution_authorized=false`, `provider_production_execution_authorized=false`, `provider_secret_sync_authorized=false`, `provider_webhook_update_authorized=false`, `connects_to_provider=false`, `deploys_now=false`, blockers esperados registrados.
- Validacoes atuais do novo repo: `node --test tests/architecture/provider-staging-evidence-package.test.mjs` PASS 5/5, `INKFLOW_ENV=local PROVIDER_ENV=local npm run provider:staging:evidence-package` PASS, `npm test` PASS 401/401, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `git diff --check` PASS, scan focado de seguranca PASS apenas com regex/fixtures negativos do proprio gate.
- Implementado pacote operacional de evidencia local para SaaS runtime staging no novo repo.
- Commit do novo repo: `3e9e9e9 feat: add saas runtime staging evidence package`.
- Escopo: `docs/architecture/saas-runtime-staging-operational-evidence-package.md`, `npm run saas:runtime:staging:evidence-package`, consolidando runtime target, admin smoke, bot smoke, audit, provider boundary, tenant config, legal, billing, observabilidade e rollback.
- Evidencia: `saas_runtime_staging_execution_authorized=false`, `saas_runtime_production_execution_authorized=false`, `saas_runtime_deploy_authorized=false`, `saas_runtime_secret_sync_authorized=false`, `connects_to_staging=false`, `connects_to_provider=false`, `deploys_now=false`, blockers esperados registrados.
- Validacoes atuais do novo repo: `node --test tests/architecture/saas-runtime-staging-evidence-package.test.mjs` PASS 5/5, `INKFLOW_ENV=local SAAS_RUNTIME_ENV=local npm run saas:runtime:staging:evidence-package` PASS, `npm test` PASS 406/406, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `git diff --check` PASS, scan focado de seguranca PASS apenas com regex/fixtures negativos do proprio gate.
- Implementado pacote final local de end-to-end fake staging smoke no novo repo.
- Commit do novo repo: `8302ebe feat: add e2e fake staging package`.
- Escopo: `docs/architecture/end-to-end-fake-staging-smoke-package.md`, `npm run e2e:fake-staging:package`, consolidando Stage readiness, Supabase staging evidence, Provider staging evidence e SaaS runtime staging evidence em uma decisao humana final.
- Evidencia: `ready_for_human_stage_decision=true`, `e2e_fake_staging_smoke_authorized=false`, `stage_execution_authorized=false`, `production_execution_authorized=false`, `real_provider_execution_authorized=false`, `deploy_execution_authorized=false`, `secret_sync_authorized=false`, gates todos true e blockers esperados registrados.
- Validacoes atuais do novo repo: `node --test tests/architecture/e2e-fake-staging-package.test.mjs` PASS 5/5, `INKFLOW_ENV=local E2E_FAKE_STAGE_ENV=local npm run e2e:fake-staging:package` PASS, `npm test` PASS 411/411, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `git diff --check` PASS, scan focado de seguranca PASS apenas com regex/fixtures negativos do proprio gate.
- Implementado Product Delivery Master Plan no novo repo.
- Commit do novo repo: `1c391bd feat: add product delivery master plan`.
- Escopo: `docs/architecture/product-delivery-master-plan.md`, `npm run product:delivery:master-plan`, definindo a trilha da fundacao ao produto final: data foundation, SaaS runtime foundation, provider staging foundation, end-to-end Stage, product completion e production pilot.
- Evidencia: `ready_for_supabase_staging_decision=true`, `recommended_next_candidate=approve_supabase_staging_only`, `product_delivery_execution_authorized=false`, `stage_execution_authorized=false`, `production_execution_authorized=false`, `real_provider_execution_authorized=false`, `deploy_execution_authorized=false`, `secret_sync_authorized=false`, `billing_activation_authorized=false` e `customer_data_migration_authorized=false`.
- Validacoes atuais do novo repo: `node --test tests/architecture/product-delivery-master-plan.test.mjs` PASS 5/5, `INKFLOW_ENV=local PRODUCT_DELIVERY_ENV=local npm run product:delivery:master-plan` PASS, `npm test` PASS 416/416, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `git diff --check` PASS, scan focado de seguranca PASS apenas com regex/fixtures negativos do proprio gate.
- Implementado Supabase staging approval checkpoint no novo repo.
- Commit do novo repo: `96d8dfc feat: add supabase staging approval checkpoint`.
- Escopo: `docs/architecture/supabase-staging-approval-checkpoint.md`, `npm run supabase:staging:approval-checkpoint`, formalizando a ultima decisao humana antes de qualquer Supabase staging real.
- Evidencia: `ready_for_human_approval=true`, `approval_phrase_required=APPROVE_SUPABASE_STAGING_ONLY`, `recommended_scope=supabase_staging_only`, `supabase_staging_execution_authorized=false`, `supabase_production_execution_authorized=false`, `supabase_secret_sync_authorized=false`, `real_provider_execution_authorized=false`, `deploy_execution_authorized=false`, `billing_activation_authorized=false` e `customer_data_migration_authorized=false`.
- Validacoes atuais do novo repo: `node --test tests/architecture/supabase-staging-approval-checkpoint.test.mjs` PASS 5/5, `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:staging:approval-checkpoint` PASS, `npm test` PASS 421/421, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `git diff --check` PASS, scan focado de seguranca PASS apenas com regex/fixtures negativos do proprio gate e nomes de secret source sem valores.
- Implementado Supabase staging secret source check no novo repo.
- Commit do novo repo: `7d2ac19 feat: add supabase staging secret source check`.
- Escopo: `npm run supabase:staging:secret-source-check`, validando presenca local de `SUPABASE_STAGING_URL`, `SUPABASE_STAGING_ANON_KEY` e `SUPABASE_STAGING_SERVICE_ROLE_KEY` sem imprimir valores, sem conectar staging, sem sync e sem autorizar execucao.
- Evidencia: no ambiente atual do Codex o comando falha de forma esperada com os tres names `missing`; isso confirma que secrets nao foram enviados pela conversa nem carregados no ambiente do agente.
- Validacoes atuais do novo repo: `node --test tests/architecture/supabase-staging-approval-checkpoint.test.mjs` PASS 7/7, `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:staging:approval-checkpoint` PASS, `npm test` PASS 423/423, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `git diff --check` PASS, scan focado de seguranca PASS apenas com regex/fixtures negativos, nomes de secret source e fixtures redigidos.
- Criado wrapper no repo atual `inkflow-saas`: `npm run supabase:staging:secret-source-check`, delegando para `/Users/brazilianhustler/Documents/inkflow-platform`.
- Evidencia do wrapper: com valores fake seguros, comando retorna `ok=true` e `value_redacted=[redacted]`; sem variaveis no shell, retorna `missing` esperado sem imprimir valores.
- Implementado Supabase staging execution package no novo repo.
- Commit do novo repo: `7a1469b feat: add supabase staging execution package`.
- Escopo: `docs/architecture/supabase-staging-execution-package.md`, `npm run supabase:staging:execution-package`, formalizando backup/export como primeiro checkpoint real antes de qualquer migration.
- Evidencia: `ready_for_backup_checkpoint=true`, `supabase_staging_backup_required=true`, `supabase_staging_migration_authorized=false`, gates approval/execution/secret-source true, next checkpoint `capture_staging_backup_export_evidence`.
- Validacoes atuais do novo repo: `node --test tests/architecture/supabase-staging-execution-package.test.mjs` PASS 5/5, `npm test` PASS 428/428, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `git diff --check` PASS, scan focado de seguranca PASS apenas com regex/fixtures negativos e nomes de secret source sem valores.
- Implementada Secret Storage Architecture no novo repo.
- Commit do novo repo: `ad0ebc2 docs: add secret storage architecture`.
- Escopo: `docs/architecture/secret-storage-architecture.md`, teste arquitetural dedicado e `.gitignore` fortalecido para `.dev.vars.*`.
- Evidencia: politica central da plataforma define que codigo, docs, testes, fixtures, banco, logs, UI, auditoria e handoff nunca armazenam segredo bruto; permite apenas source names, binding IDs opacos, runtime handles, redacted evidence e fixtures negativas controladas.
- Validacoes atuais do novo repo: `node --test tests/architecture/secret-storage-architecture.test.mjs` PASS 5/5, `npm test` PASS 433/433, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `git diff --check` PASS, scan focado de seguranca PASS apenas com fixtures negativas/regex de testes e placeholders controlados.
- Implementado Supabase staging backup evidence checkpoint no novo repo.
- Commit do novo repo: `3db0218 feat: add supabase staging backup evidence checkpoint`.
- Escopo: `docs/architecture/supabase-staging-backup-evidence-checkpoint.md`, `docs/evidence/supabase-staging/backup-export-evidence.template.md`, `npm run supabase:staging:backup-evidence`.
- Evidencia: checkpoint pronto para capturar evidence record de backup/export; `backup_evidence_captured=false`, `supabase_staging_migration_authorized=false`, `connects_to_staging=false`, `executable_database_commands=false`, proximo checkpoint `operator_captures_backup_export_evidence_record`.
- Validacoes atuais do novo repo: `node --test tests/architecture/supabase-staging-backup-evidence.test.mjs` PASS 5/5, `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:staging:backup-evidence` PASS com valores fake/redigidos, `npm test` PASS 438/438, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `git diff --check` PASS, scan focado de seguranca PASS apenas com fixtures negativas/regex de testes e placeholders controlados.
- Implementado backup evidence record validator no novo repo.
- Commit do novo repo: `9f46143 feat: add backup evidence record validator`.
- Escopo: `npm run supabase:staging:validate-backup-evidence -- docs/evidence/supabase-staging/<record>.md`, validando arquivo preenchido sem conectar staging e sem autorizar migration.
- Evidencia: record valido retorna `backup_evidence_captured=true`, mas mantem `supabase_staging_migration_authorized=false`, `supabase_production_execution_authorized=false`, `supabase_secret_sync_authorized=false`.
- Validacoes atuais do novo repo: `node --test tests/architecture/supabase-staging-backup-evidence.test.mjs` PASS 6/6, `npm test` PASS 439/439, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `git diff --check` PASS, scan focado de seguranca PASS apenas com fixtures negativas/regex de testes e placeholders controlados.
- Criados wrappers no repo atual `inkflow-saas`: `npm run supabase:staging:backup-evidence` e `npm run supabase:staging:validate-backup-evidence`, delegando para `/Users/brazilianhustler/Documents/inkflow-platform`.
- Implementado backup evidence record generator no novo repo.
- Commit do novo repo: `6a106f9 feat: add backup evidence record generator`.
- Escopo: `npm run supabase:staging:create-backup-evidence -- --timestamp <iso-timestamp>`, criando record padronizado com path canonico e migration bloqueada.
- Evidencia: record gerado passa no validator, mantem `SUPABASE_STAGING_MIGRATION_AUTHORIZED=false`, aceita `--output-file` para ambiente restrito e preserva `evidence file path` canonico.
- Validacoes atuais do novo repo: `node --test tests/architecture/supabase-staging-backup-evidence.test.mjs` PASS 8/8, `npm test` PASS 441/441, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `git diff --check` PASS, scan focado de seguranca PASS apenas com fixtures negativas/regex de testes e placeholders controlados.
- Criado wrapper no repo atual `inkflow-saas`: `npm run supabase:staging:create-backup-evidence`, delegando para `/Users/brazilianhustler/Documents/inkflow-platform`.
- Implementado Supabase staging backup export runbook no novo repo.
- Commit do novo repo: `1ef909a docs: add supabase staging backup runbook`.
- Escopo: `docs/operations/supabase-staging-backup-export-runbook.md`, cobrindo preflight, captura manual de backup/export, geracao/validacao de evidence record, required evidence e stop conditions.
- Evidencia: runbook mantem `SUPABASE_STAGING_MIGRATION_AUTHORIZED=false`, nao armazena comando executavel de migration, nao autoriza producao, secret sync, deploy, provider real, billing ou customer migration.
- Validacoes atuais do novo repo: `node --test tests/architecture/supabase-staging-backup-runbook.test.mjs` PASS 4/4, `npm test` PASS 445/445, `npm run typecheck` PASS placeholder, `npm run lint` PASS placeholder, `git diff --check` PASS, scan focado de seguranca PASS apenas com fixtures negativas/regex de testes e placeholders controlados.

### Decisoes

- Repo atual continua como legado operacional, vault e fonte de extracao.
- Novo repo futuro sera a fonte da verdade da plataforma SaaS.
- Bot premium vira modulo/vault dentro da plataforma, nao repo inteiro.
- Durante fase de arquitetura, apenas docs da frente podem ser alterados.
- Nenhum deploy, secret, smoke real, migration ou codigo funcional sera alterado nesta frente sem plano aprovado.
- `packages/tenant-config` foi implementado sem bot runtime, painel, deploy ou secrets.
- `packages/domain` foi implementado sem banco, APIs, runtime, painel, deploy ou secrets.
- `packages/workflow` foi implementado sem banco, APIs, runtime, painel, deploy ou secrets.
- `packages/pricing` foi implementado sem calculo automatico final, Telegram, WhatsApp, banco, APIs, runtime, painel, deploy ou secrets.
- `packages/observability` foi implementado sem log provider, banco, APIs, runtime, painel, deploy ou secrets.
- `packages/media-intelligence` foi implementado sem modelo vision, WhatsApp, Telegram, banco, APIs, runtime, painel, deploy ou secrets.
- `packages/conversation-engine` foi implementado sem LLM, WhatsApp, Telegram, banco, APIs, runtime, painel, deploy ou secrets.
- `packages/response-composer` foi implementado sem LLM, WhatsApp, Telegram, banco, APIs, runtime, painel, deploy ou secrets.
- `packages/bot-runtime-contract` foi implementado sem LLM, WhatsApp, Telegram, Supabase, Evolution, banco, APIs, runtime real, painel, deploy ou secrets.
- `services/bot-orchestrator` foi implementado como service local-only em memoria, sem LLM, WhatsApp, Telegram, Supabase, Evolution, banco, API externa, deploy ou secrets.
- `packages/integrations/channel-adapters` foi implementado como adapter simulado em memoria, sem Evolution, Telegram API, WhatsApp real, Supabase, rede, secrets, storage, deploy ou provider real.
- Integracao simulada outbox->adapter->receipt foi implementada sem rede, provider real, storage, secrets ou deploy.
- `packages/integrations/local-audit-store` foi implementado sem Supabase, banco, arquivo, rede, secrets, storage real, deploy ou provider real.
- Frente futura obrigatoria registrada: `knowledge-service`/RAG por tenant para informacoes personalizadas de estudio, como biblioteca consultiva e nao autoridade de workflow.
- Integracao do audit store local ao orchestrator foi implementada sem Supabase, banco real, arquivo, rede, secrets, storage real, provider real ou deploy.
- `packages/persistence-contracts` foi implementado sem Supabase, banco real, arquivo, rede, secrets, storage real, provider real ou deploy.
- `apps/admin` foi implementado como app estatico/skeleton sem React/Vite, Supabase, auth real, rede, secrets, canais reais, deploy ou design final.
- `apps/admin/src/modules/studio-settings` foi implementado como modulo local-only de schema/view-model/actions para configuracao do estudio, sem React/Vite obrigatorio, Supabase, auth real, rede, secrets, canais reais, deploy ou design final.
- `apps/admin/src/modules/bot-control` foi implementado como modulo local-only de schema/view-model/actions para controle operacional do bot premium, sem WhatsApp, Telegram, Evolution, Supabase, auth real, rede, secrets, deploy ou runtime real.
- `apps/admin/src/modules/knowledge-admin` foi implementado como modulo local-only de schema/view-model/actions para governanca de conhecimento por tenant e futuro RAG consultivo, sem embeddings, vector store, LLM, WhatsApp, Telegram, Evolution, Supabase, auth real, rede, secrets, deploy ou runtime real.
- `apps/admin/src/modules/admin-access` foi implementado como contrato local-only de rotas, papeis, permissoes, acoes perigosas e audit-required actions, sem auth real, Supabase, rede, secrets, deploy, UI final ou runtime real.
- `apps/admin` renderiza modulos locais na UI estatica respeitando `admin-access`, sem React/Vite, auth real, Supabase, rede, providers reais, secrets ou deploy.
- `apps/admin/src/modules/team-admin` foi implementado como modulo local-only de equipe/usuarios, convites, mudanca de papel/status e audit events, sem auth real, email real, Supabase, rede, secrets, deploy ou runtime real.
- `apps/admin/src/modules/billing-admin` foi implementado como modulo local-only de billing/entitlements, plano, status de cobranca, bloqueios operacionais e audit events, sem Mercado Pago, provider real, Supabase, rede, secrets, deploy ou runtime real.
- `apps/admin/src/modules/legal-admin` foi implementado como modulo local-only de Legal/LGPD, consentimentos, retencao, solicitações de titular e audit events, sem email real, automacao externa, Supabase, rede, secrets, deploy ou runtime real.
- Checkpoint estrutural do admin aprovado como local-only; nao iniciar React/Vite, Supabase real, auth real, providers, deploy ou design visual sem checkpoint dedicado.
- `supabase-local-contract` foi registrado como contrato local-only; nao iniciar SQL executavel, Supabase real, auth real, providers, deploy ou design visual sem checkpoint dedicado.
- `supabase-schema-draft` foi implementado como artefato local-only; nao executar SQL contra Supabase real nem promover migration sem harness local, RLS tests, rollback exercitado e plano de backup/producao.
- `auth-identity-contract` detectou gap estrutural de roles antigas e alinhou `support/readonly` para `assistant/viewer` no domain/admin-access/schema draft.
- Crosswalk confirmou que o proximo risco estrutural e provar RLS/auth local antes de UI framework, Evolution real, Telegram real ou migrations reais.
- Supabase policy harness checkpoint autoriza apenas desenho/guard local; nenhuma execucao Supabase local ou producao foi feita.
- Local policy harness guard foi implementado antes de qualquer execucao Supabase, bloqueando URL/chaves de producao e provider secrets.
- Local policy harness dry-run foi implementado sem executar banco; ele valida guard, schema, rollback e manifesto antes de qualquer Supabase local real.
- Detector confirmou ambiente sem `supabase`, `docker` e `psql`; execucao real do policy harness depende de instalar/habilitar tooling local ou seguir com fallback estatico aprimorado.
- Plano operacional definiu checkpoints para validacao real local: tooling readiness, boundary local, bootstrap DB, seed fixtures, cenarios RLS, rollback drill e evidence report.
- Regra de double check oficializada para informacoes que podem quebrar a reconstrucao.
- Tooling readiness checkpoint confirmou o caminho correto: Supabase CLI + Docker local. Ambiente atual permanece bloqueado por ausencia de `supabase`, `docker` e `psql`.
- Static policy coverage foi implementado como protecao temporaria enquanto o ambiente nao tem Supabase CLI/Docker/psql; ele nao substitui validacao real de RLS.
- Ambiente local agora tem Supabase CLI + Docker via Colima, mas o runner real de RLS ainda nao existe; proximo passo correto e implementar `supabase-cli-local-runner` com guard-first.
- Runner real local de RLS passou; isso valida comportamento de policies em Supabase local, mas ainda nao autoriza migration/producao.
- Policy de promocao confirma que staging e producao exigem package revisado, backup/rollback/forward-fix e aprovacao explicita; local runner nunca autoriza producao automaticamente.
- Checker de package transforma o draft em artefato review-ready, mas mantem staging/producao bloqueados e nao cria arquivo de migration produtiva.
- Plano de staging foi registrado como checkpoint nao executavel; proximo passo ainda e checker local de readiness, nao staging real.
- Checker de staging readiness autoriza somente revisao operacional, nao execucao. Staging real continua bloqueado sem aprovacao explicita.
- Runbook/gate de execucao staging esta pronto para revisao manual; ele nao armazena comando executavel de staging enquanto autorizacao for false.
- `knowledge-service` passa a ser a biblioteca consultiva local do bot/painel; o proximo passo e integracao controlada ao runtime sem entregar autoridade de estado/preco/handoff.
- Knowledge context agora esta integrado ao runtime/orchestrator apenas como contexto consultivo; workflow/policy/pricing seguem como autoridades.
- `packages/auth-session` consolida a regra de acesso: provider auth pode identificar a pessoa no futuro, mas quem decide permissao e a identidade tenant-scoped persistida em `studio_users`.
- `apps/admin` agora consome `auth-session` localmente; papel declarado nao pode abrir rotas se nao bater com `studio_users`.
- Actions administrativas agora tem gate central de autorizacao; nenhuma mutacao local de painel deve ocorrer sem sessao/permissao/audit quando aplicavel.
- Provider connection boundary define que admin/browser ve apenas status, label, provider e identificador redigido; binding de segredo fica interno e opaco.
- Admin provider summary e uma superficie read-only; cadastro/edicao de metadata de provider deve ser implementado como modulo/action local-only com auth-session/audit antes de qualquer provider real.
- Provider metadata agora pode ser administrada localmente, mas isso ainda nao autoriza provider real nem secret manager real.
- Provider runtime boundary existe para uso server-side futuro, mas ainda nao autoriza Cloudflare Secrets, Supabase Vault, Evolution, Telegram, Mercado Pago, OpenAI real, staging ou producao.
- Adapter provider-aware prova a rota operacional simulada, mas ainda nao autoriza delivery real, segredo real, staging ou producao.
- Bot-orchestrator ja prova o caminho provider-aware local completo; isso ainda nao autoriza delivery real, segredo real, staging ou producao.
- Notification service vira a fronteira local para mensagens operacionais de bot, handoff e orcamento; isso ainda nao autoriza delivery real, segredo real, staging ou producao.
- Bot-orchestrator pode acionar notifications locais como side effects, mas isso ainda nao autoriza delivery real, segredo real, staging ou producao.
- Strategic Review Gate entra como freio inteligente, nao burocracia: se nao revelar gap real nem mudar plano, a decisao padrao e seguir.
- Artist quote intake separa o contrato de orcamento normalizado do parser Telegram futuro; isso evita acoplar texto bruto de chat ao pricing/proposal.
- Fluxo local de quote response esta provado ate delivery simulado provider-aware; o proximo gap estrutural e normalizar a resposta Telegram antes do intake ou preparar runbook real-provider sem executar.
- Telegram quote adapter resolve o gap de normalizacao local sem liberar parser amplo nem provider real; o proximo gap estrutural e gerar/persistir o contexto/ref de quote_request localmente no fluxo do orchestrator/notifications.
- Quote request context fecha a preparacao da ida; o proximo gap estrutural e uma prova local de ida-e-volta completa usando esse contexto como input do Telegram adapter.
- Roundtrip local prova a cadeia funcional sem provider real; o proximo gap estrutural e decidir se o contexto/ref deve ser persistido agora ou se a frente deve preparar runbook/gate de provider real.
- Quote request context agora tem contrato de persistencia local; o proximo gap estrutural e o orchestrator gravar esse contexto no repositorio local quando emitir `quote_request`.
- Orchestrator agora grava o contexto/ref localmente; o proximo gap estrutural e provar o roundtrip usando busca por `quote_request_ref` persistido, nao apenas metadata em memoria.
- Roundtrip com lookup persistido fecha a cadeia local de orcamento do tatuador; o proximo passo exige Strategic Review Gate leve antes de preparar provider real.
- Provider real promotion gate esta pronto para revisao manual, mas nao autoriza execucao. O proximo passo exige decisao explicita entre pacote de evidencias local para revisao operacional ou aprovacao humana antes de qualquer staging/provider real.
- Stage Readiness Package fecha a definicao das tres lacunas restantes sem executar nada real; a proxima acao deve seguir a ladder: Supabase staging primeiro, depois Provider staging, depois SaaS runtime staging.
- Supabase staging agora tem evidencia operacional local consolidada; execucao real ainda depende de aprovacao humana, backup/export staging real e smoke RLS staging real.
- Provider staging agora tem evidencia operacional local consolidada; execucao real ainda depende de aprovacao humana, health check, secret sync, webhook isolation e smoke real com atores fake.
- SaaS runtime staging agora tem evidencia operacional local consolidada; execucao real ainda depende de aprovacao humana, runtime route, bindings de staging, deploy staging e smoke runtime.
- End-to-end fake staging package e o checkpoint local final antes de qualquer Stage real; a proxima acao e decisao humana entre manter bloqueado ou aprovar execucao Stage ordenada com checkpoints explicitos.
- Product Delivery Master Plan fixa a ordem estrategica para agilizar sem perder qualidade: Supabase staging primeiro, SaaS runtime depois, Provider staging em terceiro, E2E Stage, Product Completion e Production Pilot.
- Supabase staging approval checkpoint torna a proxima mensagem humana o unico desbloqueio valido; sem `APPROVE_SUPABASE_STAGING_ONLY` e campos completos, staging real segue bloqueado.
- Secret source check garante que o operador possa validar secrets por script local sem colar valores na conversa; sem PASS desse check, staging real segue bloqueado.
- Wrapper no repo atual evita erro operacional de rodar o comando no diretorio errado.
- Operador reportou `npm run supabase:staging:secret-source-check` com `ok=true`, tres secrets presentes, valores `[redacted]`, `prints_secret_values=false`, `connects_to_staging=false`, `syncs_secrets=false`, `staging_execution_authorized=false` e `production_execution_authorized=false`.
- Supabase staging execution package impede migration direta: proximo passo e backup/export evidence.
- Secret Storage Architecture vira a regra central para qualquer frente futura que toque credenciais; nenhum painel, runtime, provider adapter, log, banco, handoff ou teste pode salvar segredo bruto.
- Backup evidence checkpoint separa captura de backup de execucao de migration: backup aprovado prepara o proximo checkpoint, mas nao autoriza migration automaticamente.
- Backup evidence record validator e o gate obrigatorio entre backup real e qualquer preparacao de migration.
- Backup evidence generator reduz erro operacional na criacao do record, mas nao substitui a captura real do backup/export.
- Backup export runbook e o caminho operacional padrao para o operador executar a captura real sem pular preflight/evidence validator.
- Wrapper de Supabase staging no repo atual agora carrega `~/.inkflow-secrets/supabase-staging.env` automaticamente quando existir, mantendo secrets redigidos e evitando falha operacional por esquecer `source`.
- Supabase staging backup evidence record `docs/evidence/supabase-staging/backup-export-2026-05-31T025829067Z.md` foi gerado e validado; proximo checkpoint e preparar execucao dedicada de migration staging, ainda bloqueada.
- Supabase staging migration preflight foi criado e validado, garantindo backup evidence + package check antes de pedir aprovacao humana. O gate prepara somente `APPROVE_SUPABASE_STAGING_MIGRATION_EXECUTION`; migration segue bloqueada.
- Supabase staging migration execution readiness criado para verificar aprovacao exata e transporte de migration separado (`SUPABASE_STAGING_DB_URL`) antes de qualquer executor. O ambiente atual falha corretamente enquanto esses dois itens nao forem carregados no shell.
- Incidente de secret hygiene: loader local de staging deixou de usar `source` e passou a aceitar somente linhas `export NOME="valor"` com whitelist. Arquivo invalido agora falha fechado sem imprimir valores. Rotacao de secrets expostos e obrigatoria antes de qualquer migration real.
- Supabase staging migration execution readiness passou apos correcao do secret source local: aprovacao exata presente, transporte de migration presente, backup evidence e migration package validados; ainda sem conectar staging e sem comando executavel.
- Supabase staging migration executor plan criado e validado em modo `plan`: DB URL redigida, forward/rollback SQL identificados, evidence path definido, `execute_requested=false`, `executed=false`, `connects_to_staging=false` e `executable_database_commands=false`.
- Revisao rigorosa do executor plan removeu formato de comando executavel (`command`/`args`) do output e oficializou somente templates nao executaveis (`command_template`/`args_template`) com `executable_now=false` em todos os passos.
- Supabase staging migration execution evidence checkpoint criado e validado: contrato de evidencia real pos-migration esta pronto, mas a migration segue nao executada, sem conexao staging e sem comando de banco executavel.
- Supabase staging manual migration execution turn criado e validado em modo plano: wrapper carrega secrets pelo loader seguro, plano redige DB URL e execucao real exige `--execute` e `SUPABASE_STAGING_MANUAL_MIGRATION_EXECUTE=true`.
- Supabase staging manual migration execution turn executado apos aprovacao explicita, com rollback previo, evidencia validada e inventario real pos-migration de 25 tabelas publicas, 49 policies e 25 tabelas com RLS.
- Supabase staging RLS smoke criado e executado com fixture fake, cleanup automatico e evidencia `docs/evidence/supabase-staging/rls-smoke-2026-05-31T000000000Z.md`.
- O primeiro RLS smoke real encontrou gap estrutural de grants: `authenticated` nao tinha privilegios base para consultar `tenant_configs`, entao o banco falhava antes de avaliar RLS. O schema draft recebeu grants base para `authenticated`/`service_role`, e o forward-fix foi aplicado em staging.
- RLS smoke final passou com 13 cenarios, 9 obrigatorios, DB URL redigida, post-check `tables=25 policies=49 rls_tables=25 raw_secret_columns=0` e cleanup de fixtures fake confirmado com count 0.
- Cloudflare rotation registrada como follow-up: nao bloqueia Supabase staging porque nao havia token Cloudflare carregado no ambiente atual, mas deve ser feita antes de deploy/provider real/secret sync.

### Proximo Passo

- Preparar checkpoint de Provider staging sem provider real ainda, revisando isolamento de secrets/webhook/atores fake antes de qualquer trafego Evolution/Telegram real. Nao executar secret sync, provider real, deploy, producao, billing activation, customer data migration ou cliente real sem approval/checkpoint proprio.
