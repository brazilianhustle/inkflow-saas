# Changelog - Reconstrucao Controlada

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
- Proximo passo recomendado: checkpoint antes de qualquer adapter real; evoluir `apps/admin` em slices funcionais usando persistence contracts locais.

### Proximo Passo

- Fazer checkpoint antes de qualquer adapter real, preservando isolamento sem producao, secrets ou canais reais.
