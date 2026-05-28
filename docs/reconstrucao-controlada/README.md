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

Status: novo repo `inkflow-platform` criado localmente com contratos funcionais isolados, `services/bot-orchestrator`, adapters simulados, entrega simulada outbox->receipt, audit store local integrado, `packages/persistence-contracts`, skeleton inicial de `apps/admin`, modulos locais de configuracao do estudio, controle operacional do bot premium, knowledge admin, contrato de rotas/permissoes do painel, renderizacao estatica inicial, equipe/usuarios, billing/entitlements, legal/LGPD, checkpoint estrutural do admin, contrato Supabase local, schema draft local com fixtures/testes, contrato auth identity, checkpoint Supabase policy harness, guard local, dry-run, tool detection, plano operacional, tooling readiness checkpoint, static policy coverage gate, runner real local do policy harness e policy de promocao de migrations/staging/rollback, com Supabase CLI + Docker local via Colima, sem canais reais, sem Supabase remoto, sem secrets e sem deploy.

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
00a4dba docs: add supabase tooling readiness checkpoint
4304223 feat: add supabase static policy coverage
4042732 docs: record supabase local tooling enabled
8b1d729 feat: add supabase local policy runner
8f392c9 docs: add migration promotion policy
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

- `npm test` PASS, 254/254;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:guard` PASS;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:dry-run` PASS com 11 cenarios;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:detect-tools` PASS com `supabase-cli-local`;
- `INKFLOW_ENV=local SUPABASE_ENV=local npm run supabase:policy:static-coverage` PASS;
- `INKFLOW_ENV=local SUPABASE_ENV=local SUPABASE_POLICY_RUNNER_EXECUTE=1 npm run supabase:policy:local-runner` PASS com 142 etapas, cenarios RLS e rollback drill;
- policy de promocao de migrations/staging/rollback registrada e testada;
- git limpo no repo novo apos commit.

Proxima decisao: implementar checker/gerador local de package de migration, sem conectar staging/producao. Nao iniciar adapter real de WhatsApp/Supabase remoto/Telegram, migration real, deploy ou secrets sem checkpoint explicito.

Regra reforcada: informacoes que podem quebrar a reconstrucao exigem double check por pelo menos dois anchors antes de virar decisao/codigo.

Frente futura obrigatoria: `knowledge-service`/RAG por tenant para informacoes personalizadas de cada estudio. Esta frente deve entrar como biblioteca consultiva do bot premium, nao como autoridade de workflow. Deve servir FAQ, politicas, portfolio textual, cuidados, regras comerciais e contexto curado do estudio, com fontes versionadas, escopo por tenant, observabilidade, redacao segura e fallback quando a confianca for baixa. Nao deve decidir estado, preco, menoridade, cobertura, handoff ou conclusao de orcamento.

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
