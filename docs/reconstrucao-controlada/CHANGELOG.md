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

### Decisoes

- Repo atual continua como legado operacional, vault e fonte de extracao.
- Novo repo futuro sera a fonte da verdade da plataforma SaaS.
- Bot premium vira modulo/vault dentro da plataforma, nao repo inteiro.
- Durante fase de arquitetura, apenas docs da frente podem ser alterados.
- Nenhum deploy, secret, smoke real, migration ou codigo funcional sera alterado nesta frente sem plano aprovado.
- `packages/tenant-config` foi implementado sem bot runtime, painel, deploy ou secrets.
- Proximo dominio recomendado: `packages/domain`.

### Proximo Passo

- Implementar `packages/domain` no novo repo para consolidar entidades canonicas compartilhadas.
