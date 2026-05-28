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
13. `CHANGELOG.md`
14. `docs/canonical/stack.md`
15. `docs/atendimento-premium/09-session-handoff.md`

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

Status: novo repo `inkflow-platform` criado localmente com contratos funcionais isolados, `services/bot-orchestrator`, adapters simulados, entrega simulada outbox->receipt, audit store local integrado, `packages/persistence-contracts`, skeleton inicial de `apps/admin`, modulo funcional de configuracao do estudio e modulo local de controle operacional do bot premium, sem canais reais, sem Supabase real, sem secrets e sem deploy.

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

- `npm test` PASS, 142/142;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no repo novo.

Proxima decisao: evoluir `apps/admin` em slices funcionais de painel usando persistence contracts locais. Ja existem `apps/admin/src/modules/studio-settings` e `apps/admin/src/modules/bot-control`. Nao iniciar adapter real de WhatsApp/Supabase/Telegram nem Supabase real sem checkpoint explicito.

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
