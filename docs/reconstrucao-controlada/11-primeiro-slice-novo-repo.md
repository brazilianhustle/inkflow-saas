# Primeiro Slice Do Novo Repo

Data: 2026-05-28

Objetivo: transformar a decisao de stack em um checklist executavel para criar o novo repo `inkflow-platform` de forma reversivel, isolada e sem impacto na producao atual.

Este documento nao cria o repo. Ele define exatamente como criar quando houver aprovacao explicita.

## Decisao Base

Repo alvo:

```text
inkflow-platform
```

Tipo:

```text
monorepo TypeScript com npm workspaces
```

Primeiro slice:

```text
scaffold vazio + docs + package workspaces + CI minimo + placeholders de domain e tenant-config
```

## Regra De Execucao

Nao executar este slice sem confirmacao explicita do usuario.

Motivo:

- cria um novo ambiente;
- pode exigir GitHub/repo remoto;
- sai do limite atual de editar apenas `docs/reconstrucao-controlada/`;
- precisa ser reversivel e auditavel.

## Escopo Permitido Do Primeiro Slice

Permitido:

- criar pasta/repo novo;
- inicializar git;
- criar estrutura de diretorios;
- criar `README.md`;
- criar `package.json` com workspaces;
- criar `tsconfig.base.json`;
- criar placeholders de packages;
- criar teste placeholder;
- criar GitHub Actions minimo se repo remoto existir;
- criar docs base;
- commit inicial.

Proibido:

- migrar codigo do bot;
- copiar secrets;
- configurar producao;
- criar deploy production;
- alterar repo atual fora de docs de handoff;
- rodar smoke real;
- mexer em Supabase;
- mexer em Evolution;
- importar `.smoke-evidence` bruto.

## Localizacao Recomendada

Se for criar localmente antes do GitHub:

```text
/Users/brazilianhustler/Documents/inkflow-platform
```

Regra:

```text
nao criar dentro de /Users/brazilianhustler/Documents/inkflow-saas
```

Motivo:

- evita confundir git;
- evita poluir repo atual;
- facilita deletar se necessario.

## Estrutura Inicial

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
      src/
      tests/
    tenant-config/
      src/
      tests/
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

## Arquivos Iniciais

### `README.md`

Conteudo minimo:

- objetivo do repo;
- aviso de que e reconstrucao controlada;
- relacao com repo legado;
- regra de nao inserir secrets;
- status: scaffold.

### `package.json`

Conteudo minimo conceitual:

```json
{
  "name": "inkflow-platform",
  "private": true,
  "type": "module",
  "workspaces": [
    "apps/*",
    "services/*",
    "packages/*",
    "packages/integrations/*"
  ],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  }
}
```

### `tsconfig.base.json`

Conteudo minimo:

- target moderno;
- module moderno;
- strict true;
- noEmit para typecheck;
- paths futuros se necessario.

### `.gitignore`

Obrigatorio ignorar:

- `node_modules`;
- `.env`;
- `.env.*`;
- `!.env.example`;
- `.dev.vars`;
- logs;
- build outputs;
- coverage;
- local artifacts.

### `.env.example`

Permitido:

- nomes de variaveis;
- valores vazios ou placeholders.

Proibido:

- secrets reais;
- tokens;
- URLs privadas sensiveis.

### Packages placeholder

`packages/domain`:

- README;
- package.json;
- `src/index.ts`;
- `tests/domain.placeholder.test.ts`.

`packages/tenant-config`:

- README;
- package.json;
- `src/index.ts`;
- `tests/tenant-config.placeholder.test.ts`.

## CI Minimo

Arquivo:

```text
.github/workflows/ci.yml
```

Jobs iniciais:

- checkout;
- setup node;
- npm install;
- npm test;
- npm run typecheck se existir.

Regra:

```text
CI inicial nao deve deployar nada.
```

## Commit Inicial

Mensagem recomendada:

```text
chore: scaffold inkflow platform monorepo
```

Conteudo do commit:

- estrutura;
- README;
- package base;
- tsconfig;
- gitignore;
- placeholders;
- CI minimo.

Nao misturar:

- codigo legado;
- bot premium;
- docs extensas importadas;
- secrets;
- deploy.

## Gate De Pronto

O primeiro slice esta pronto quando:

- repo novo existe isolado;
- `git status --short` limpo no repo novo;
- `git status --short` limpo no repo atual;
- `npm test` passa ou nao ha testes funcionais ainda, mas script nao quebra;
- nenhum secret existe;
- nenhum deploy configurado;
- README explica estado;
- commit inicial feito;
- repo atual registra handoff apontando para o novo repo.

## Rollback

Se criado apenas local:

```text
deletar /Users/brazilianhustler/Documents/inkflow-platform
```

Se criado no GitHub:

- arquivar ou deletar repo remoto;
- registrar decisao no handoff;
- manter repo atual intacto.

Regra:

```text
rollback do primeiro slice nao pode afetar producao atual.
```

## Stop Conditions

Parar antes de criar se:

- nome do repo nao estiver aprovado;
- owner/org GitHub nao estiver decidido;
- usuario nao confirmou execucao;
- algum comando exigir secret;
- houver tentativa de copiar codigo legado;
- houver tentativa de configurar deploy;
- worktree do repo atual estiver sujo com mudanca nao relacionada.

## Handoff Apos Criacao

Depois de criar o repo, atualizar no repo atual:

- `00-session-handoff.md`;
- `CHANGELOG.md`;
- adicionar link/local do novo repo;
- registrar commit inicial do novo repo.

No repo novo, criar:

- `docs/decisions/0001-controlled-rebuild.md`;
- `docs/architecture/README.md`;
- `docs/operations/README.md`.

## Proximo Passo Depois Do Scaffold

Primeiro dominio implementavel:

```text
packages/tenant-config
```

Gate:

- implementar schemas TypeScript/Zod ou equivalente;
- defaults;
- fixtures;
- unit/contract tests;
- sem bot runtime;
- sem painel;
- sem deploy.

