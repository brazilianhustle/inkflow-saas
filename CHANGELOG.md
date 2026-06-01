# Changelog

> Atualizado conforme `docs/canonical/methodology/release-protocol.md` §7.3. Cada release de Worker / CF Pages / Supabase migration / n8n workflow ganha uma seção aqui com o formato definido no protocolo.

## Unreleased — Provider staging roundtrip evidence gate

- Adicionado `provider:staging:review-roundtrip-source` para revisar `provider-roundtrip-source.json` antes de gerar o pacote canonico.
- O gate exige fonte operacional direta dos seis marcos WhatsApp/Telegram/rollback, bloqueando fonte apenas documental, valores crus, telefone real, URLs, tokens, secrets e paths inseguros.
- Adicionado `provider:staging:prepare-roundtrip-source` para criar a pasta `.smoke-evidence/<run>` com fonte bloqueada, placeholders redigidos e checklist operacional antes da observacao real.
- O template `provider:staging:build-roundtrip-package -- --init-source` agora orienta `source_review`, `evidence_origin`, `evidence_path` e `observed_at` por marco, permanecendo bloqueado ate confirmacao operacional redigida.
- Sem provider real, sem secret sync, sem deploy e sem evidencia formal automatica nesta mudanca.

## 2026-05-03 — Modo Coleta v2: Modo principal + Telegram tatuador  ⚠️ MERGEADO + DEPOIS PIVOTADO

**Status atualizado (2026-05-08):** trabalho **MERGEADO em prod** via PRs #17 (refactor), #19 (v2 principal), #20 (reentrada bot via CF Pages) em 2026-05-03. Modo Coleta v2 ficou em prod por ~4 dias.

**MAS depois pivotado:** auditoria 2026-05-07 cravou que **mono-agent dentro do n8n não escala** (PR #33 smoke E2E provou). Decisão: migrar pra **multi-agent via OpenAI Agents SDK em CF Workers** + remover n8n do hot path. PR #52 OPEN, Sub-1 IMPLEMENTED-PARTIAL. Spec+plan original (`2026-05-02-modo-coleta-v2-principal.md`) **deletados** de `docs/superpowers/`, mantidos apenas em `archive/` pra contexto histórico.

**Princípios cravados aqui foram absorvidos pelo refator multi-agent:** R9 (devolver contradições), foto OBR_RECOMENDADO, anti-pattern dos few-shots com pseudo-código de tools, FSM `estado_agente` com 9 estados (cada agent passa a usar 1 subset).

**Decisão estratégica de produto original** (sessão de conselho LLM 2026-05-02):
- Coleta vira modo PRINCIPAL/default do SaaS
- Faixa removido completamente (sem tenants pagantes — sem migração)
- Exato vira beta secundário
- Telegram do tatuador é o canal de comunicação tatuador↔IA (canal paralelo, cliente nunca vê tatuador no chat)

**Spec original (deletado, em archive):** `archive/InkFlow — Modo Coleta v2 principal (2026-05-02).md`.

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
