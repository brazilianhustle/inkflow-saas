# Git hooks — InkFlow

Hooks versionados, ativados por `git config core.hooksPath .githooks`.

## Instalação (uma vez por clone)

```
git config core.hooksPath .githooks
```

## pre-commit

Roda `node --test` nas suítes de prompts e validações **se e somente se** a
mudança toca arquivos relevantes (`functions/_lib/prompts/*`, `update-tenant`,
`tests/prompts/*` etc). Commits em docs/HTML não disparam testes.

Se a suíte falhar, o commit é bloqueado. Use `git commit --no-verify` só em
emergência e avise no PR — CI vai travar de novo.

## Atualizar um snapshot intencionalmente

```
UPDATE_SNAPSHOTS=1 node --test tests/prompts/snapshot.test.mjs
git add tests/prompts/snapshots/
git commit
```

O diff do snapshot aparece no PR e exige revisão explícita.
