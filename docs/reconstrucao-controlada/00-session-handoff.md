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

## Proximo Passo Logico

Definir e implementar o proximo dominio no novo repo.

Recomendacao:

```text
packages/observability
```

Objetivo do proximo artefato:

- criar builders/validators para DecisionEvent e AuditEvent;
- padronizar evidence summary interno;
- permitir que futuros runtime/integracoes expliquem decisoes;
- manter pacote sem side effects, sem banco, sem APIs, sem secrets e sem deploy.

## Regra Anti-Poluicao

Enquanto a reconstrucao estiver em fase de arquitetura e extracao:

- qualquer arquivo novo deve ficar em `docs/reconstrucao-controlada/`, salvo decisao explicita;
- nenhuma alteracao em `functions/`, `supabase/`, `scripts/`, `web/`, HTML raiz ou secrets sem plano aprovado;
- nenhum smoke real deve ser rodado para esta frente, porque ainda nao ha mudanca funcional;
- nenhum deploy deve ser feito;
- commits desta frente devem usar escopo `docs(reconstrucao)` ou equivalente.
