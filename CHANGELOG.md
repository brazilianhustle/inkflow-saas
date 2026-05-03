# Changelog

> Atualizado conforme `docs/canonical/methodology/release-protocol.md` §7.3. Cada release de Worker / CF Pages / Supabase migration / n8n workflow ganha uma seção aqui com o formato definido no protocolo.

## 2026-05-03 — Modo Coleta v2: Modo principal + Telegram tatuador (em execução)

**Status:** Branch `feat/modo-coleta-v2-principal` em desenvolvimento (Fases 0-6 + 8 done; Fases 7, 9, 10 pendentes). Não mergeado ainda.

**Decisão estratégica de produto** (sessão de conselho LLM 2026-05-02):
- Coleta vira modo PRINCIPAL/default do SaaS
- Faixa removido completamente (sem tenants pagantes — sem migração)
- Exato vira beta secundário
- Telegram do tatuador é o canal de comunicação tatuador↔IA (canal paralelo, cliente nunca vê tatuador no chat)

**Spec:** `docs/superpowers/specs/2026-05-02-modo-coleta-v2-principal.md` (supersede `2026-04-22-modo-coleta-design.md`).
**Plano:** `docs/superpowers/plans/2026-05-02-modo-coleta-v2-principal.md` (10 fases, ~30 tasks).

**Mudanças até o momento:**

- **Schema (migration `2026-05-02-modo-coleta-v2.sql`):**
  - `tenants.tatuador_telegram_chat_id` + `tatuador_telegram_username` (TEXT)
  - `conversas.valor_proposto` + `valor_pedido_cliente` (NUMERIC)
  - `conversas.orcid` (TEXT UNIQUE) — identificador curto do orçamento
  - `conversas.dados_cadastro` (JSONB) — nome, data_nascimento, email
  - `tenants.fewshots_por_modo` chaves migradas: `coleta_tattoo`, `coleta_cadastro`, `coleta_proposta`, `exato` (faixa removido)
  - Tenants em modo='faixa' migrados pra 'coleta' automaticamente
- **`update-tenant.js`:** `MODOS_VALIDOS = ['coleta','exato']` (faixa rejeitado), default coleta. `tatuador_telegram_*` em ALLOWED_FIELDS.
- **Prompts:** `functions/_lib/prompts/faixa/` deletado. `functions/_lib/prompts/coleta/{tattoo,cadastro,proposta}/` criados (15 arquivos: generate, fluxo, regras, few-shot, few-shot-tenant cada × 3 fases). Dispatcher state-machine via `conversas.estado_agente` (9 estados, 4 retornam null pra bot não responder).
- **Tools novas (4):** `dados-coletados`, `enviar-orcamento-tatuador`, `enviar-objecao-tatuador`, `consultar-proposta-tatuador`. Todas validam `X-Inkflow-Tool-Secret`.
- **Endpoints novos (2):** `/api/telegram/webhook` (recebe updates do bot Telegram, valida secret token), `/api/check-telegram-connected` (polling do onboarding UI).
- **Tier 1 testes:** 50 testes verde (4 snapshots + 4 contracts + 10 invariants + 4 contamination + 12 update-tenant validation + 16 tool helpers).
- **Shared blocks mode-aware:** `_shared/checklist-critico.js` e `_shared/contexto.js` reescritos pra trocar wording/instructions baseado em `modo=coleta` vs `modo=exato`.
- **Vocabulário objeção:** sem palavras "contraproposta"/"contra-oferta". Variações naturais sobre "tatuador analisar".

**Breaking changes:**
- `modo='faixa'` rejeitado pelo validador. Tenants legados migram pra coleta automaticamente.
- Workflow n8n principal precisa entender `prompt:null` (estados de espera) e curto-circuitar LLM (Fase 9 pendente).

**Action requerida do tenant:**
- Conectar Telegram do tatuador via deep link no onboarding (sem isso modo Coleta não funciona).
- Estúdios em modo Exato continuam como hoje (beta).

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
