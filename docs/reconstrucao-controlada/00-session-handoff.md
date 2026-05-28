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

## Proximo Passo Logico

Decidir com o usuario se vamos executar a criacao do novo repo `inkflow-platform`.

Objetivo do proximo artefato:

- se aprovado, criar repo/pasta novo fora do repo atual;
- scaffold vazio, sem produto e sem secrets;
- commit inicial;
- atualizar handoff no repo atual apontando para o novo repo.

## Regra Anti-Poluicao

Enquanto a reconstrucao estiver em fase de arquitetura e extracao:

- qualquer arquivo novo deve ficar em `docs/reconstrucao-controlada/`, salvo decisao explicita;
- nenhuma alteracao em `functions/`, `supabase/`, `scripts/`, `web/`, HTML raiz ou secrets sem plano aprovado;
- nenhum smoke real deve ser rodado para esta frente, porque ainda nao ha mudanca funcional;
- nenhum deploy deve ser feito;
- commits desta frente devem usar escopo `docs(reconstrucao)` ou equivalente.
