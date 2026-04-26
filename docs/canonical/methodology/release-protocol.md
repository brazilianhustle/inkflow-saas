---
last_reviewed: 2026-04-25
owner: leandro
status: stable
related: [index.md, matrix.md, incident-response.md, ../runbooks/deploy.md, ../runbooks/rollback.md]
---
<!-- index.md é criado em Task 4 deste plano (docs/superpowers/plans/2026-04-25-metodologia-fabrica.md). Forward-reference intencional. -->

# Release Protocol

Como publicar mudança em prod: ritual organizacional ao redor do deploy (versionamento, changelog, comunicação, janelas). Operação atômica de **deploy** propriamente dita mora em `../runbooks/deploy.md`.

## 7.1 Versionamento por componente

| Artefato | Versionamento | Tag git |
|---|---|---|
| **Worker** (`inkflow-cron`) | git SHA + tag semver manual | `worker-vX.Y.Z` |
| **CF Pages** (`inkflow-saas`) | git SHA do commit deployed (auto via GHA) | `pages-vX.Y.Z` no merge |
| **Supabase migrations** | timestamp sequencial (já existe no repo) | `supabase-MMDD` no merge da PR de migration |
| **n8n workflows** | versão do n8n SDK + export commitado em `n8n/workflows/` | `n8n-MMDD` |

Não usamos semver global (não tem cliente público que precise saber "InkFlow 1.2.3"). Cada componente versiona independentemente.

## 7.2 Pre-flight checklist

**Entry point: `/deploy-check`** — slash existente. Esse documento expande os critérios que o slash valida.

Antes de qualquer release prod:

- [ ] DoD do trabalho fechado (`/dod`)
- [ ] Testes passando (CI verde)
- [ ] Migration ✅ via Telegram (se houver migration nova)
- [ ] Changelog draft pronto (gerado por §7.3)
- [ ] Janela OK (não estamos em horário de pico — sábado tarde, domingo manhã)
- [ ] Runbook de rollback acessível ([`runbooks/rollback.md`](../runbooks/rollback.md))

## 7.3 Changelog automático

Geração: `git log <tag-anterior>..HEAD --pretty="- %s (%h)"` filtrado por convenção de commit (feat/fix/breaking).

Formato:
```markdown
### worker-v0.3.2 (2026-04-25)

**Mudanças:**
- feat: novo campo X em Y (#123)
- fix: erro Z no fluxo W (#125)

**Breaking changes:** nenhum
**Migration:** nenhum
**Action requerida do tenant:** nenhum
```

Localização: `CHANGELOG.md` (raiz do repo `inkflow-saas`). Atualizado no merge da PR de release. Quando tiver cliente pagante: replicar trecho relevante em comunicação ao cliente.

## 7.4 Comunicação (estado MVP)

Hoje, sem cliente pagante ativo, comunicação é **interna**:

- Entrada nova em `[[InkFlow — Painel]]` seção "Releases recentes" — formato:
  > `2026-04-25 — worker-v0.3.2 — adicionado campo X (link PR #123)`
- Nota mãe atualizada se houver impacto operacional (ex: `[[InkFlow — Arquitetura]]`).

Quando surgir cliente pagante: expandir comunicação (email, in-app banner, status page). **Fora de escopo desse spec** — abrir sub-spec quando ocorrer.

## 7.5 Janela de release

> **Janela real ainda não validada empiricamente.** A tabela abaixo é hipótese inicial baseada em padrão de salão de tatuagem (clientes reservam mais final de semana). Refinar após primeiro mês de telemetria com cliente pagante: olhar `wrangler tail` + dashboards de uso pra identificar pico real de requests do bot. Atualizar essa seção e remover este aviso quando dados existirem.

| Tipo de release | Janela permitida | Gate |
|---|---|---|
| Worker — feat/fix sem migration | qualquer hora útil de Leandro | `/deploy-check` |
| Worker — com migration não-destrutiva | qualquer hora | `/deploy-check` + Telegram ✅ migration |
| Migration destrutiva (drop table/coluna lida) | madrugada (00h-06h BRT) | `/deploy-check` + Telegram ✅ + backup recente confirmado |
| Mudança em pico estimado (hipótese: sábado 14h-22h, domingo 10h-14h) | **adiar** salvo P0 — validar quando tiver dados | n/a |
| Hotfix P0 | imediato | `/hotfix` (bypass parcial do checklist — runbook do hotfix documenta o que pular) |
