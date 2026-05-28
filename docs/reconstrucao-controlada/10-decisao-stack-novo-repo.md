# Decisao De Stack E Novo Repo

Data: 2026-05-28

Objetivo: decidir o formato tecnico do novo repo antes de cria-lo, mantendo a reconstrucao controlada reversivel e sem impacto na producao atual.

## Decisao Recomendada

Criar um novo monorepo:

```text
inkflow-platform
```

Stack recomendada:

```text
TypeScript
npm workspaces
React + Vite para apps de painel
Cloudflare Workers para APIs e runtime
Cloudflare static assets/Pages para frontends
Supabase Postgres + RLS para dados
Vitest para unit/contract
Cloudflare Workers Vitest pool para runtime Workers
Playwright para e2e de painel quando houver UI
```

Racional:

- o produto e um SaaS operacional, nao um blog;
- painel precisa ser previsivel, seguro e testavel;
- bot/runtime precisa ficar separado da UI;
- contratos precisam viver em packages compartilhados;
- Cloudflare continua alinhado ao stack atual;
- Supabase continua como fonte de verdade relacional;
- npm workspaces reduzem mudanca operacional em relacao ao repo atual.

## Nao Recomendado Agora

### Nao reconstruir dentro do repo atual

Motivo:

- risco de contaminar producao;
- legado e docs ainda vivem no mesmo terreno;
- dificil separar vault, runtime e painel novo;
- aumenta chance de mexer em bot atual sem querer.

### Nao criar varios repos agora

Motivo:

- aumenta coordenacao;
- piora onboarding mental;
- fragmenta contratos;
- dificulta manter bot, painel e dominio falando a mesma linguagem.

### Nao comecar com Next.js full-stack como centro

Motivo:

- o painel nao precisa de SSR para provar valor;
- aumenta complexidade de deploy/runtime;
- mistura UI e backend cedo demais;
- o core do produto e dominio, bot, workflow, dados e configuracao.

Observacao:

```text
Next/Astro podem ser reavaliados para public-site/marketing depois. Nao devem comandar o core SaaS.
```

## Estrutura Inicial Do Novo Repo

```text
inkflow-platform/
  apps/
    public-site/
    studio-panel/
    admin-console/
    onboarding/
  services/
    bot-gateway/
    bot-runtime/
    billing/
    notifications/
    scheduler/
    audit-worker/
  packages/
    domain/
    tenant-config/
    conversation-engine/
    workflow/
    pricing/
    media-intelligence/
    security-auth/
    observability/
    integrations/
      evolution/
      telegram/
      mercadopago/
      openai/
      supabase/
  infra/
    cloudflare/
    supabase/
    evolution/
  vault/
    bot-premium/
    legacy-current-repo/
  docs/
    architecture/
    product/
    legal/
    security/
    operations/
    decisions/
  tests/
    unit/
    contract/
    integration/
    whatsapp-real/
    evals/
```

## Package Manager

Decisao:

```text
npm workspaces
```

Motivo:

- repo atual ja usa npm;
- menor curva operacional;
- menos dependencia de ferramenta nova;
- suficiente para monorepo inicial;
- facil para CI.

Condicao para mudar:

```text
se build/test ficar lento ou workspaces exigirem orquestracao mais forte, avaliar pnpm/turborepo depois.
```

## Linguagem

Decisao:

```text
TypeScript first
```

Motivo:

- contratos compartilhados precisam tipos;
- painel e backend compartilham entidades;
- reduz regressao em config/dominio;
- melhora testes de contrato.

Regra:

```text
docs primeiro, types depois, implementacao depois.
```

## Frontend

Decisao inicial:

```text
React + Vite
```

Apps:

- `studio-panel`;
- `admin-console`;
- `onboarding`;
- `public-site` inicialmente simples.

Motivo:

- painel SaaS e app operacional;
- SSR nao e requisito inicial;
- build simples;
- deploy simples;
- bom encaixe com componentes e e2e.

Design system:

```text
componentes proprios + biblioteca leve quando definida
```

Nao decidir ainda:

- visual final;
- landing definitiva;
- biblioteca visual final;
- copy final.

## Backend/API

Decisao:

```text
Cloudflare Workers por servico
```

Servicos:

- `bot-gateway`;
- `bot-runtime`;
- `billing`;
- `notifications`;
- `scheduler`;
- `audit-worker`.

Motivo:

- runtime atual ja e Cloudflare;
- APIs e webhooks precisam edge/server;
- separa responsabilidades;
- facilita teste por servico;
- evita Pages Functions gigantes.

Regra:

```text
gateway fino, dominio em packages, side effects em integrations.
```

## Banco

Decisao:

```text
Supabase Postgres
```

Motivo:

- ja existe base operacional;
- relacional encaixa bem com tenant, conversation, budget, payments, audit;
- RLS e obrigatorio para multi-tenant;
- migracao controlada pode usar historico atual.

Regra:

```text
novo repo precisa baseline restorable, migrations lineares e RLS por padrao.
```

## Storage

Decisao inicial:

```text
Supabase Storage ou R2 a decidir por contrato de media
```

Recomendacao:

- comecar desenhando interface `MediaStorage`;
- nao acoplar bot diretamente ao provider;
- decidir provider no contrato de media/infra.

## Autenticacao E RBAC

Decisao inicial:

```text
Supabase Auth como candidato principal
```

Motivo:

- integra com Supabase/RLS;
- reduz sistema auth proprio;
- facilita painel multi-tenant.

Pendente:

- confirmar estrategia de magic link/senha/OAuth;
- definir roles e claims;
- mapear acesso admin/founder/suporte.

## Observabilidade

Decisao:

```text
DecisionEvent + AuditEvent como contratos internos
```

Provider externo:

- Sentry/logs podem continuar como integracoes, mas nao definem o dominio.

Regra:

```text
o sistema precisa explicar decisao mesmo sem abrir provider externo.
```

## Testes

Decisao:

```text
Vitest para unit/contract
Cloudflare Workers Vitest pool para Workers
Playwright para painel
smoke real separado para WhatsApp/Telegram
```

Base:

- Cloudflare recomenda Vitest integration para testar Workers no runtime Workers;
- Supabase RLS deve ter testes/gates proprios;
- WhatsApp real continua validacao definitiva conversacional.

## CI/CD

Decisao inicial:

```text
GitHub Actions
```

Pipelines minimos:

- docs lint/check;
- unit;
- contract;
- worker runtime tests;
- build apps;
- security checks;
- preview deploy;
- release/deploy manual ou gateado.

Regra:

```text
docs-only nao dispara deploy funcional.
```

## Ambientes

Ambientes alvo:

```text
local
preview
staging
production
```

Regra:

- novo repo nasce sem production deploy;
- primeiro deploy, quando existir, deve ser preview/staging;
- producao atual nao muda durante scaffold.

## Secrets

Regra:

```text
nenhum secret real entra no novo repo.
```

Antes de qualquer runtime real:

- criar `secrets.example`;
- documentar nomes;
- separar local/preview/staging/production;
- validar preflight;
- usar provider seguro.

## Comparativo De Opcoes

| Opcao | Resolve Objetivo | Risco | Esforco | Reversibilidade | Decisao |
| --- | --- | --- | --- | --- | --- |
| Novo monorepo TS/npm/Cloudflare | Sim | Medio controlado | Medio | Alta | Recomendado |
| Refatorar repo atual | Parcial | Alto | Alto | Baixa | Rejeitado |
| Multi-repo desde inicio | Sim, mas complexo | Alto | Alto | Media | Adiar |
| Next.js full-stack como core | Parcial | Medio/Alto | Medio | Media | Nao agora |
| Manter static HTML | Nao | Alto | Baixo agora, caro depois | Baixa | Rejeitado |

## Primeiro Slice Mecanico

Quando aprovado criar o novo repo, o primeiro slice deve ser:

```text
scaffold vazio + docs + package workspaces + CI minimo + packages/domain placeholder + packages/tenant-config placeholder
```

Fora de escopo do primeiro slice:

- bot funcional;
- painel funcional;
- secrets reais;
- deploy production;
- migracao de banco;
- importacao completa do vault;
- WhatsApp real.

Gate do primeiro slice:

- repo criado;
- README explica objetivo;
- estrutura de pastas existe;
- `npm test` ou placeholder equivalente passa;
- CI minimo passa;
- nenhum segredo;
- nenhum impacto na producao atual.

## Condicoes Antes De Criar O Repo

Antes de executar criacao:

- confirmar nome final;
- confirmar se repo sera GitHub privado/publico;
- confirmar owner/org;
- definir branch principal;
- decidir se criaremos worktree separado local;
- decidir se o primeiro commit tera apenas scaffold/docs.

## Decisao Atual

Recomendacao final:

```text
Criar novo repo privado chamado inkflow-platform, em monorepo TypeScript com npm workspaces, React/Vite para apps e Cloudflare Workers para APIs/runtime.
```

Ainda nao executar criacao ate o usuario aprovar explicitamente.

## Proximo Artefato

Criar:

```text
11-primeiro-slice-novo-repo.md
```

Objetivo:

- transformar esta decisao em checklist executavel;
- definir comandos permitidos;
- definir arquivos iniciais;
- definir criterio de commit;
- garantir criacao reversivel e isolada.
