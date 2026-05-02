# Changelog

> Atualizado conforme `docs/canonical/methodology/release-protocol.md` §7.3. Cada release de Worker / CF Pages / Supabase migration / n8n workflow ganha uma seção aqui com o formato definido no protocolo.

## 2026-04-30 — Modo Coleta PR 1: Refactor zero-mudança

- Quebra `functions/_lib/generate-prompt.js` (556 linhas, monolítico) em estrutura modular `prompts/{_shared,faixa,exato}/` com dispatcher equivalente. Saída byte-a-byte idêntica ao baseline (snapshot tests garantem).
- Adiciona schema migration: `tenants.fewshots_por_modo` (JSONB) + `conversas.estado_agente` (TEXT) + index parcial. Defaults garantem zero breaking pros tenants existentes.
- Adiciona Tier 1 de higiene de prompts: snapshots, contracts (`must_contain`/`must_not_contain`/`max_tokens`), invariants cross-mode, contamination smoke test.
- CI workflow `prompts-ci.yml` roda bateria em PRs tocando `prompts/` ou `tests/prompts/`.
- `update-tenant.js` aceita `fewshots_por_modo` e valida `coleta_submode`/`trigger_handoff` (forward compat). `modo='coleta'` REJEITADO até PR 2 wirar feature flag `ENABLE_COLETA_MODE`.
- Sem mudança de comportamento em prod — PR 2 ativa o caminho Coleta.

## Histórico

_Nenhuma release em produção registrada ainda._ A primeira entrada virá no merge da próxima PR de release prod, com bloco no formato §7.3:

```
### worker-vX.Y.Z (YYYY-MM-DD)

**Mudanças:**
- feat: ... (#PR)
- fix: ... (#PR)

**Breaking changes:** nenhum
**Migration:** nenhum
**Action requerida do tenant:** nenhum
```

(Esse exemplo é template — substituir nos releases reais.)
