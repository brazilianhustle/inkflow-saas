# Modo Coleta — PR 1 (Refactor-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar o gerador monolítico `functions/_lib/generate-prompt.js` em `functions/_lib/prompts/{_shared,faixa,exato}/*` atrás de um dispatcher `prompts/index.js`, adicionar migração SQL + validações novas em `update-tenant.js` e uma bateria Tier 1 de testes de higiene (snapshots, contracts, invariants, contamination linter, pre-commit hook, CI) — **zero mudança de comportamento em produção**.

**Architecture:** Golden-master approach. Capturamos o prompt atual como snapshot ANTES de mexer; refatoração se limita a mover código pra arquivos separados preservando output bit-identical. `faixa/` e `exato/` começam como cópias idênticas do código atual (texto do prompt cobre os dois casos pela instrução `valor_tipo === 'faixa'|'exato'`); diferenciação real vem no PR 2. Dispatcher baseado em `tenant.config_precificacao.modo` ainda não tem branch `coleta` aqui — só valida entrada (rejeitada por feature flag).

**Tech Stack:** JavaScript ES modules (Node 20+), `node --test` + `node:assert/strict`, Supabase Postgres, Cloudflare Pages Functions. Sem package.json / npm / husky — git hooks nativos via `.githooks/`.

---

## File Structure

**Novos arquivos:**

```
migrations/
└── 2026-04-22-modo-coleta-schema.sql          ← colunas novas + índice parcial

functions/_lib/prompts/
├── index.js                                    ← dispatcher público `generateSystemPrompt`
├── _shared/
│   ├── identidade.js                           ← §1 (movido do generate-prompt.js)
│   ├── checklist-critico.js                    ← §0
│   ├── tom.js                                  ← §2
│   ├── contexto.js                             ← §5
│   └── faq.js                                  ← §6
├── faixa/
│   ├── generate.js                             ← compõe prompt Faixa
│   ├── fluxo.js                                ← §3 (cópia)
│   ├── regras.js                               ← §4 (cópia)
│   ├── few-shot.js                             ← §7 base (cópia)
│   └── few-shot-tenant.js                      ← §7b tenant (cópia)
└── exato/
    ├── generate.js                             ← compõe prompt Exato
    ├── fluxo.js                                ← idêntico ao faixa/fluxo.js no PR 1
    ├── regras.js                               ← idêntico ao faixa/regras.js
    ├── few-shot.js                             ← idêntico ao faixa/few-shot.js
    └── few-shot-tenant.js                      ← idêntico ao faixa/few-shot-tenant.js

tests/prompts/
├── fixtures/
│   ├── tenant-canonico.js                      ← tenant completo "feliz"
│   └── tenant-contaminado.js                   ← FAQ/few-shots com R$, preço, sinal
├── snapshots/
│   ├── faixa.txt                               ← baseline pós-refactor
│   └── exato.txt
├── contracts/
│   ├── faixa.js                                ← must_contain/must_not_contain/max_tokens
│   └── exato.js
├── snapshot.test.mjs                           ← comparação com snapshot
├── contracts.test.mjs                          ← valida must_contain/not_contain
├── invariants.test.mjs                         ← regras cross-mode
└── contamination.test.mjs                      ← linter com fixture contaminado

tests/
└── update-tenant-validations.test.mjs          ← validações novas

.githooks/
└── pre-commit                                  ← roda bateria local

.github/workflows/
└── test.yml                                    ← CI roda `node --test`
```

**Arquivos modificados:**

- `functions/_lib/generate-prompt.js` — **deletado** ao final (conteúdo migrou)
- `functions/api/tools/prompt.js:9` — import de `../../_lib/prompts/index.js`
- `functions/api/tools/simular-conversa.js:18` — mesmo import
- `functions/api/update-tenant.js` — aceita `modo='coleta'`, `coleta_submode`, `trigger_handoff`, `fewshots_por_modo`; limpa campos coleta quando modo muda

**Arquivos de referência (NÃO modificar):**

- `functions/_lib/generate-prompt.js` (baseline — só após golden-master capturado)
- `docs/superpowers/specs/2026-04-22-modo-coleta-design.md` (spec desta feature)

---

## Task 1: Migração SQL — novas colunas e índice

**Files:**
- Create: `migrations/2026-04-22-modo-coleta-schema.sql`

- [ ] **Step 1: Criar diretório migrations e arquivo SQL**

```bash
mkdir -p /Users/brazilianhustler/Documents/inkflow-saas/migrations
```

Conteúdo do arquivo `migrations/2026-04-22-modo-coleta-schema.sql`:

```sql
-- Migration: 2026-04-22 Modo Coleta — schema changes
-- Adiciona colunas novas em tenants e conversas pra suportar modo Coleta.
-- Zero breaking change: colunas têm defaults, código antigo continua funcionando.

-- 1. tenants.fewshots_por_modo — few-shots escopadas por modo
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS fewshots_por_modo JSONB
  NOT NULL DEFAULT '{"faixa":[],"exato":[],"coleta_info":[],"coleta_agendamento":[]}'::jsonb;

-- 2. conversas.estado_agente — máquina de estados do agente
--    (Faixa/Exato ignoram hoje; Coleta usa no PR 2)
ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS estado_agente TEXT
  NOT NULL DEFAULT 'ativo';

-- 3. Índice parcial em estados não-ativos (queries filtram por "conversas pendentes")
CREATE INDEX IF NOT EXISTS idx_conversas_estado_agente
  ON conversas(estado_agente)
  WHERE estado_agente != 'ativo';

-- NOTA: Backfill de tenants.fewshots (se existir essa coluna legada) fica pra decidir
-- manualmente com o user. Tabelas de produção não têm a coluna atualmente — este
-- bloco é só documentação:
--
-- UPDATE tenants SET fewshots_por_modo = jsonb_set(
--   fewshots_por_modo,
--   ARRAY[config_precificacao->>'modo'],
--   COALESCE(fewshots, '[]'::jsonb)
-- ) WHERE fewshots IS NOT NULL;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS fewshots;
```

- [ ] **Step 2: Aplicar migração via Supabase MCP — PEDIR CONFIRMAÇÃO DO USER ANTES**

Antes de rodar, apresentar ao user:

> "Vou aplicar a migração SQL em `migrations/2026-04-22-modo-coleta-schema.sql` no Supabase prod via MCP. Três statements: ADD COLUMN em `tenants`, ADD COLUMN em `conversas`, CREATE INDEX. Todos com `IF NOT EXISTS` e defaults — zero breaking change. OK aplicar? (responde 'ok' pra prosseguir ou 'só commita o arquivo e aplica eu depois')."

Se user aprovar, executar via `mcp__plugin_supabase_supabase__apply_migration`:

- `name`: `2026_04_22_modo_coleta_schema`
- `query`: conteúdo do SQL acima (sem os comentários `-- NOTA:` em diante, só os 3 statements executáveis)

Se user disser pra não aplicar agora, pular pro Step 3 (arquivo já fica versionado).

- [ ] **Step 3: Verificar colunas aplicadas (se Step 2 rodou)**

Via MCP `execute_sql`:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE (table_name = 'tenants' AND column_name = 'fewshots_por_modo')
   OR (table_name = 'conversas' AND column_name = 'estado_agente');
```

Expected: 2 linhas. Se 0 linhas e Step 2 foi aprovado, falhou — parar e investigar.

- [ ] **Step 4: Commit**

```bash
git add migrations/2026-04-22-modo-coleta-schema.sql
git commit -m "$(cat <<'EOF'
feat(db): adiciona fewshots_por_modo e conversas.estado_agente (modo Coleta PR 1)

Colunas novas com defaults — zero breaking change. Código atual ignora
ambas. Base pra PRs 2+ de modo Coleta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Validações novas em update-tenant.js

**Files:**
- Modify: `functions/api/update-tenant.js` (add `fewshots_por_modo` to ALLOWED_FIELDS + novas validações de `config_precificacao`)
- Create: `tests/update-tenant-validations.test.mjs`
- Create: `functions/api/_validate-config-precificacao.js` (módulo isolado pra permitir teste unit)

> **Nota de design:** `update-tenant.js` hoje mistura parsing, auth e DB call num handler único — difícil testar direto. Vamos extrair a validação pura (sem I/O) pra `_validate-config-precificacao.js`, testar isolada, e importar no handler. Padrão já usado por `_auth-helpers.js` e `_tool-helpers.js`.

- [ ] **Step 1: Criar módulo de validação**

Conteúdo de `functions/api/_validate-config-precificacao.js`:

```javascript
// ── Validação do payload config_precificacao (modo Coleta) ─────────────────
// Função pura. Retorna { ok, erro?, cleanedCfg? } onde cleanedCfg é o config
// com campos coleta removidos se modo != 'coleta' (defensive cleanup).

const MODOS_VALIDOS = ['faixa', 'exato', 'coleta'];
const SUBMODES_COLETA = ['puro', 'reentrada'];

export function validarConfigPrecificacao(cfg, { enableColetaMode = false } = {}) {
  if (cfg === undefined || cfg === null) return { ok: true, cleanedCfg: cfg };
  if (typeof cfg !== 'object' || Array.isArray(cfg)) {
    return { ok: false, erro: 'config_precificacao deve ser objeto JSON' };
  }

  const out = { ...cfg };

  // modo
  if (out.modo !== undefined && !MODOS_VALIDOS.includes(out.modo)) {
    return { ok: false, erro: `config_precificacao.modo deve ser um de: ${MODOS_VALIDOS.join(', ')}` };
  }

  // Feature flag: modo='coleta' só passa se ENABLE_COLETA_MODE on
  if (out.modo === 'coleta' && !enableColetaMode) {
    return { ok: false, erro: 'modo=coleta ainda não disponível (feature flag OFF)' };
  }

  // coleta_submode — obrigatório quando modo=coleta
  if (out.modo === 'coleta') {
    if (!out.coleta_submode) {
      return { ok: false, erro: 'coleta_submode obrigatório quando modo=coleta' };
    }
    if (!SUBMODES_COLETA.includes(out.coleta_submode)) {
      return { ok: false, erro: `coleta_submode deve ser um de: ${SUBMODES_COLETA.join(', ')}` };
    }
  }

  // trigger_handoff — obrigatório + bounded quando submode=reentrada
  if (out.modo === 'coleta' && out.coleta_submode === 'reentrada') {
    const trig = out.trigger_handoff;
    if (typeof trig !== 'string' || trig.length < 2 || trig.length > 50) {
      return { ok: false, erro: 'trigger_handoff deve ser string entre 2 e 50 caracteres' };
    }
  }

  // Defensive cleanup: remove campos coleta se modo != coleta
  if (out.modo && out.modo !== 'coleta') {
    delete out.coleta_submode;
    delete out.trigger_handoff;
  }
  // Se modo=coleta mas submode=puro, remove trigger_handoff
  if (out.modo === 'coleta' && out.coleta_submode !== 'reentrada') {
    delete out.trigger_handoff;
  }

  return { ok: true, cleanedCfg: out };
}

export function validarFewshotsPorModo(val) {
  if (val === undefined || val === null) return { ok: true };
  if (typeof val !== 'object' || Array.isArray(val)) {
    return { ok: false, erro: 'fewshots_por_modo deve ser objeto JSON' };
  }
  const keysEsperadas = ['faixa', 'exato', 'coleta_info', 'coleta_agendamento'];
  for (const k of keysEsperadas) {
    if (val[k] !== undefined && !Array.isArray(val[k])) {
      return { ok: false, erro: `fewshots_por_modo.${k} deve ser array` };
    }
  }
  return { ok: true };
}
```

- [ ] **Step 2: Escrever testes — módulo puro**

Conteúdo de `tests/update-tenant-validations.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarConfigPrecificacao,
  validarFewshotsPorModo,
} from '../functions/api/_validate-config-precificacao.js';

// ── validarConfigPrecificacao ──────────────────────────────────────────────

test('aceita undefined/null sem erro', () => {
  assert.deepEqual(validarConfigPrecificacao(undefined), { ok: true, cleanedCfg: undefined });
  assert.deepEqual(validarConfigPrecificacao(null), { ok: true, cleanedCfg: null });
});

test('rejeita tipo não-objeto', () => {
  const r = validarConfigPrecificacao('string');
  assert.equal(r.ok, false);
  assert.match(r.erro, /objeto JSON/);
});

test('aceita modo=faixa sem campos coleta', () => {
  const r = validarConfigPrecificacao({ modo: 'faixa', sinal_percentual: 30 });
  assert.equal(r.ok, true);
  assert.equal(r.cleanedCfg.modo, 'faixa');
});

test('aceita modo=exato sem campos coleta', () => {
  const r = validarConfigPrecificacao({ modo: 'exato' });
  assert.equal(r.ok, true);
});

test('rejeita modo=coleta quando feature flag OFF (default)', () => {
  const r = validarConfigPrecificacao({ modo: 'coleta', coleta_submode: 'puro' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /feature flag OFF/);
});

test('aceita modo=coleta + submode=puro com feature flag ON', () => {
  const r = validarConfigPrecificacao(
    { modo: 'coleta', coleta_submode: 'puro' },
    { enableColetaMode: true },
  );
  assert.equal(r.ok, true);
  assert.equal(r.cleanedCfg.coleta_submode, 'puro');
});

test('rejeita modo=coleta sem coleta_submode', () => {
  const r = validarConfigPrecificacao({ modo: 'coleta' }, { enableColetaMode: true });
  assert.equal(r.ok, false);
  assert.match(r.erro, /coleta_submode obrigatório/);
});

test('rejeita coleta_submode inválido', () => {
  const r = validarConfigPrecificacao(
    { modo: 'coleta', coleta_submode: 'xxx' },
    { enableColetaMode: true },
  );
  assert.equal(r.ok, false);
  assert.match(r.erro, /coleta_submode deve ser/);
});

test('aceita submode=reentrada com trigger_handoff válido', () => {
  const r = validarConfigPrecificacao(
    { modo: 'coleta', coleta_submode: 'reentrada', trigger_handoff: 'Lina, assume' },
    { enableColetaMode: true },
  );
  assert.equal(r.ok, true);
  assert.equal(r.cleanedCfg.trigger_handoff, 'Lina, assume');
});

test('rejeita submode=reentrada sem trigger_handoff', () => {
  const r = validarConfigPrecificacao(
    { modo: 'coleta', coleta_submode: 'reentrada' },
    { enableColetaMode: true },
  );
  assert.equal(r.ok, false);
  assert.match(r.erro, /trigger_handoff deve ser string/);
});

test('rejeita trigger_handoff curto (< 2 chars)', () => {
  const r = validarConfigPrecificacao(
    { modo: 'coleta', coleta_submode: 'reentrada', trigger_handoff: 'x' },
    { enableColetaMode: true },
  );
  assert.equal(r.ok, false);
});

test('rejeita trigger_handoff longo (> 50 chars)', () => {
  const r = validarConfigPrecificacao(
    { modo: 'coleta', coleta_submode: 'reentrada', trigger_handoff: 'x'.repeat(51) },
    { enableColetaMode: true },
  );
  assert.equal(r.ok, false);
});

test('limpa campos coleta quando modo muda pra faixa', () => {
  const r = validarConfigPrecificacao({
    modo: 'faixa',
    coleta_submode: 'reentrada',
    trigger_handoff: 'Lina, assume',
  });
  assert.equal(r.ok, true);
  assert.equal(r.cleanedCfg.coleta_submode, undefined);
  assert.equal(r.cleanedCfg.trigger_handoff, undefined);
});

test('limpa trigger_handoff quando submode=puro', () => {
  const r = validarConfigPrecificacao(
    { modo: 'coleta', coleta_submode: 'puro', trigger_handoff: 'lixo' },
    { enableColetaMode: true },
  );
  assert.equal(r.ok, true);
  assert.equal(r.cleanedCfg.coleta_submode, 'puro');
  assert.equal(r.cleanedCfg.trigger_handoff, undefined);
});

// ── validarFewshotsPorModo ─────────────────────────────────────────────────

test('fewshots: aceita undefined/null', () => {
  assert.deepEqual(validarFewshotsPorModo(undefined), { ok: true });
  assert.deepEqual(validarFewshotsPorModo(null), { ok: true });
});

test('fewshots: rejeita array', () => {
  const r = validarFewshotsPorModo([]);
  assert.equal(r.ok, false);
});

test('fewshots: aceita objeto vazio', () => {
  assert.deepEqual(validarFewshotsPorModo({}), { ok: true });
});

test('fewshots: aceita as 4 keys com arrays', () => {
  const r = validarFewshotsPorModo({
    faixa: [],
    exato: [],
    coleta_info: [{ cliente: 'oi', agente: 'oii' }],
    coleta_agendamento: [],
  });
  assert.equal(r.ok, true);
});

test('fewshots: rejeita key com não-array', () => {
  const r = validarFewshotsPorModo({ faixa: 'oops' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /faixa deve ser array/);
});
```

- [ ] **Step 3: Rodar testes — esperar falhar**

```bash
node --test tests/update-tenant-validations.test.mjs
```

Expected: FAIL com erro de import (`_validate-config-precificacao.js` ainda não existe).

- [ ] **Step 4: Criar arquivo `_validate-config-precificacao.js`**

Já definido no Step 1. Criar com aquele conteúdo.

- [ ] **Step 5: Rodar testes — devem passar**

```bash
node --test tests/update-tenant-validations.test.mjs
```

Expected: todos os tests verdes (19 tests).

- [ ] **Step 6: Integrar no handler `update-tenant.js`**

Modificar `functions/api/update-tenant.js`:

Adicionar import no topo (após linha 12):

```javascript
import { validarConfigPrecificacao, validarFewshotsPorModo } from './_validate-config-precificacao.js';
```

Adicionar `'fewshots_por_modo'` em `ALLOWED_FIELDS` (linha 25-42). Inserir depois de `'config_precificacao',`:

```javascript
  'fewshots_por_modo',      // JSONB: { faixa:[], exato:[], coleta_info:[], coleta_agendamento:[] }
```

Atualizar `validateFieldTypes(fields)` pra chamar os validadores novos. Substituir a função inteira por:

```javascript
function validateFieldTypes(fields, { enableColetaMode = false } = {}) {
  const jsonbFields = ['config_agente', 'horario_funcionamento'];  // config_precificacao e fewshots_por_modo têm validators dedicados
  const arrayFields = ['gatilhos_handoff', 'portfolio_urls'];
  const intFields = ['duracao_sessao_padrao_h', 'sinal_percentual'];

  for (const f of jsonbFields) {
    if (fields[f] !== undefined) {
      if (typeof fields[f] !== 'object' || Array.isArray(fields[f])) {
        return { ok: false, erro: `${f} deve ser objeto JSON` };
      }
    }
  }
  for (const f of arrayFields) {
    if (fields[f] !== undefined) {
      if (!Array.isArray(fields[f])) return { ok: false, erro: `${f} deve ser array` };
      if (fields[f].some(x => typeof x !== 'string')) return { ok: false, erro: `${f} deve conter apenas strings` };
    }
  }
  for (const f of intFields) {
    if (fields[f] !== undefined) {
      const n = Number(fields[f]);
      if (!Number.isFinite(n) || n < 0 || n > 10000) return { ok: false, erro: `${f} deve ser numero entre 0 e 10000` };
    }
  }
  if (fields.modo_atendimento !== undefined && !MODOS_ATENDIMENTO.includes(fields.modo_atendimento)) {
    return { ok: false, erro: `modo_atendimento deve ser um de: ${MODOS_ATENDIMENTO.join(', ')}` };
  }

  // config_precificacao — validação rica + cleanup
  if (fields.config_precificacao !== undefined) {
    const r = validarConfigPrecificacao(fields.config_precificacao, { enableColetaMode });
    if (!r.ok) return { ok: false, erro: r.erro };
    fields.config_precificacao = r.cleanedCfg;  // substitui pelo cleaned
  }

  // fewshots_por_modo
  if (fields.fewshots_por_modo !== undefined) {
    const r = validarFewshotsPorModo(fields.fewshots_por_modo);
    if (!r.ok) return { ok: false, erro: r.erro };
  }

  return { ok: true };
}
```

Atualizar a chamada em `onRequest` (linha ~172) pra passar o flag:

```javascript
  // Valida tipos dos novos campos agente/precificacao (evita JSON malformado no DB)
  const enableColetaMode = env.ENABLE_COLETA_MODE === 'true' || env.ENABLE_COLETA_MODE === true;
  const typeCheck = validateFieldTypes(safeFields, { enableColetaMode });
  if (!typeCheck.ok) {
    return json({ error: typeCheck.erro, code: 'invalid_field_type' }, 400);
  }
```

- [ ] **Step 7: Rodar testes — devem continuar passando**

```bash
node --test tests/update-tenant-validations.test.mjs
```

Expected: 19 green.

- [ ] **Step 8: Commit**

```bash
git add functions/api/_validate-config-precificacao.js functions/api/update-tenant.js tests/update-tenant-validations.test.mjs
git commit -m "$(cat <<'EOF'
feat(update-tenant): valida modo=coleta, coleta_submode, trigger_handoff, fewshots_por_modo

- Extrai validação em módulo puro _validate-config-precificacao.js (testável).
- update-tenant.js aceita fewshots_por_modo + valida config_precificacao estruturalmente.
- modo='coleta' exige coleta_submode; submode='reentrada' exige trigger_handoff (2-50 chars).
- Feature flag ENABLE_COLETA_MODE barra modo=coleta em prod até PR 4.
- Defensive cleanup: campos coleta sumem do payload quando modo muda pra faixa/exato.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Golden-master snapshot do prompt atual

> **Objetivo:** Antes de mexer em `generate-prompt.js`, capturar seu output atual pra tenants canônicos e salvar como `snapshots/faixa.txt` e `snapshots/exato.txt`. A refatoração dos Tasks 5-8 deve preservar esses outputs bit-identical — snapshots servem de regression gate.

**Files:**
- Create: `tests/prompts/fixtures/tenant-canonico.js`
- Create: `tests/prompts/fixtures/tenant-contaminado.js`
- Create: `tests/prompts/snapshot.test.mjs`
- Create: `tests/prompts/snapshots/.gitkeep` (diretório inicialmente vazio — snapshots serão gravados)

- [ ] **Step 1: Criar fixture canônico**

Conteúdo de `tests/prompts/fixtures/tenant-canonico.js`:

```javascript
// Tenant "feliz" — todos os campos preenchidos, sem contaminação.
// Usado pra gerar snapshots de baseline dos prompts por modo.

export const tenantCanonicoFaixa = {
  id: '00000000-0000-0000-0000-000000000001',
  nome_agente: 'Lina',
  nome_estudio: 'Estudio Teste',
  plano: 'individual',
  sinal_percentual: 30,
  duracao_sessao_padrao_h: 3,
  gatilhos_handoff: ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'],
  horario_funcionamento: { 'seg-sex': '10:00-19:00', 'sab': '10:00-15:00' },
  faq_texto: 'Atendemos de terca a sabado. Duracao media de sessao 3h.',
  config_agente: {
    persona_livre: 'Brasileira, direta, atende com carinho sem formalidade excessiva.',
    tom: 'amigavel',
    emoji_level: 'raro',
    usa_giria: true,
    usa_identificador: false,
    aceita_cobertura: true,
    estilos_aceitos: ['fineline', 'realismo', 'blackwork'],
    estilos_recusados: ['tribal'],
    expressoes_proibidas: ['meu bem'],
    frases_naturais: {
      saudacao: ['Oii', 'Olá'],
      confirmacao: ['Show', 'Fechou'],
      encerramento: ['Até mais', 'Valeu'],
    },
  },
  config_precificacao: {
    modo: 'faixa',
    sinal_percentual: 30,
    tamanho_maximo_sessao_cm: 35,
    observacoes_tatuador: '',
  },
};

export const tenantCanonicoExato = {
  ...tenantCanonicoFaixa,
  id: '00000000-0000-0000-0000-000000000002',
  config_precificacao: {
    ...tenantCanonicoFaixa.config_precificacao,
    modo: 'exato',
  },
};

export const conversaVazia = null;

export const clientContextPrimeiroContato = {
  is_first_contact: true,
  eh_recorrente: false,
  total_sessoes: 0,
  nome_cliente: null,
};
```

- [ ] **Step 2: Criar fixture contaminado (usado no Task 11)**

Conteúdo de `tests/prompts/fixtures/tenant-contaminado.js`:

```javascript
// Tenant "sujo" — FAQ e few-shots com valores monetários.
// Usado pra validar que regras de supressão (PR 2) bloqueiam vazamento.
// No PR 1 este fixture ainda não tem asserts fortes — é baseline pra Task 11.

import { tenantCanonicoFaixa } from './tenant-canonico.js';

export const tenantContaminado = {
  ...tenantCanonicoFaixa,
  id: '00000000-0000-0000-0000-000000000099',
  faq_texto: 'Valor mínimo R$ 300. Sinal de 30% via PIX. Tatuagem grande tem desconto R$ 100.',
  config_agente: {
    ...tenantCanonicoFaixa.config_agente,
    few_shot_exemplos: [
      { cliente: 'quanto fica?', agente: 'Fica R$ 500, paga R$ 150 de sinal' },
      { cliente: 'aceita PIX?', agente: 'Aceito. O sinal é R$ 150 — 30% do valor' },
    ],
  },
};
```

- [ ] **Step 3: Criar teste de snapshot (modo "gerar baseline")**

Conteúdo de `tests/prompts/snapshot.test.mjs`:

```javascript
// Snapshot tests — comparam prompt gerado contra baseline comitado.
// Pra regerar: UPDATE_SNAPSHOTS=1 node --test tests/prompts/snapshot.test.mjs
//
// Este arquivo importa do dispatcher novo em functions/_lib/prompts/index.js.
// Na primeira execução (Task 3) o dispatcher ainda não existe — ajustamos o
// import em Task 8 pra apontar pro dispatcher. Por enquanto, importa direto do
// legado pra capturar baseline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// IMPORT PROVISÓRIO — Task 8 muda pra ../../functions/_lib/prompts/index.js
import { generateSystemPrompt } from '../../functions/_lib/generate-prompt.js';

import {
  tenantCanonicoFaixa,
  tenantCanonicoExato,
  conversaVazia,
  clientContextPrimeiroContato,
} from './fixtures/tenant-canonico.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = resolve(__dirname, 'snapshots');
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

function ensureDir() {
  if (!existsSync(SNAP_DIR)) mkdirSync(SNAP_DIR, { recursive: true });
}

function compareOrWrite(name, actual) {
  ensureDir();
  const path = resolve(SNAP_DIR, `${name}.txt`);
  if (UPDATE || !existsSync(path)) {
    writeFileSync(path, actual, 'utf8');
    return { wrote: true };
  }
  const expected = readFileSync(path, 'utf8');
  assert.equal(
    actual,
    expected,
    `Snapshot ${name} divergiu. Rode UPDATE_SNAPSHOTS=1 pra regerar se a mudança for intencional.`,
  );
  return { wrote: false };
}

test('snapshot: modo faixa — primeiro contato', () => {
  const prompt = generateSystemPrompt(
    tenantCanonicoFaixa,
    conversaVazia,
    clientContextPrimeiroContato,
  );
  compareOrWrite('faixa', prompt);
});

test('snapshot: modo exato — primeiro contato', () => {
  const prompt = generateSystemPrompt(
    tenantCanonicoExato,
    conversaVazia,
    clientContextPrimeiroContato,
  );
  compareOrWrite('exato', prompt);
});

test('invariante inicial: faixa e exato têm mesmo prompt (não diferenciados no PR 1)', () => {
  const pFaixa = generateSystemPrompt(tenantCanonicoFaixa, conversaVazia, clientContextPrimeiroContato);
  const pExato = generateSystemPrompt(tenantCanonicoExato, conversaVazia, clientContextPrimeiroContato);
  // No código atual (antes do PR 1) o prompt não depende de config_precificacao.modo.
  // Capturamos isso pra garantir que o refactor preserva a propriedade.
  assert.equal(pFaixa, pExato, 'fixtures diferem só em modo; prompts devem ser idênticos no PR 1');
});
```

Criar também o marcador:

```bash
touch /Users/brazilianhustler/Documents/inkflow-saas/tests/prompts/snapshots/.gitkeep
```

- [ ] **Step 4: Rodar teste pra capturar baseline (primeira execução escreve os snapshots)**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && UPDATE_SNAPSHOTS=1 node --test tests/prompts/snapshot.test.mjs
```

Expected: 3 tests pass. Arquivos `tests/prompts/snapshots/faixa.txt` e `tests/prompts/snapshots/exato.txt` criados.

- [ ] **Step 5: Rodar teste sem UPDATE — deve passar lendo os snapshots**

```bash
node --test tests/prompts/snapshot.test.mjs
```

Expected: 3 tests pass.

- [ ] **Step 6: Inspeção manual — confirmar snapshots fazem sentido**

```bash
wc -l tests/prompts/snapshots/faixa.txt tests/prompts/snapshots/exato.txt
head -20 tests/prompts/snapshots/faixa.txt
diff tests/prompts/snapshots/faixa.txt tests/prompts/snapshots/exato.txt
```

Expected: os dois arquivos são idênticos (`diff` vazio), tamanho esperado ~200-400 linhas.

- [ ] **Step 7: Commit**

```bash
git add tests/prompts/fixtures/ tests/prompts/snapshots/ tests/prompts/snapshot.test.mjs
git commit -m "$(cat <<'EOF'
test(prompts): snapshots de baseline do gerador atual (Faixa/Exato)

Golden master antes da refatoração em functions/_lib/prompts/. Qualquer
mudança em prompts futura precisa passar por UPDATE_SNAPSHOTS=1 explícito
e aparecer como diff textual no PR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extrair blocos shared (identidade, checklist, tom, contexto, faq)

> **Estratégia:** Mover cada função do `generate-prompt.js` atual pra arquivo dedicado em `functions/_lib/prompts/_shared/`. Zero mudança de lógica — é literalmente copy-paste + `export`. `generate-prompt.js` original continua intacto até Task 8.

**Files:**
- Create: `functions/_lib/prompts/_shared/identidade.js`
- Create: `functions/_lib/prompts/_shared/checklist-critico.js`
- Create: `functions/_lib/prompts/_shared/tom.js`
- Create: `functions/_lib/prompts/_shared/contexto.js`
- Create: `functions/_lib/prompts/_shared/faq.js`

- [ ] **Step 1: Criar `_shared/identidade.js`**

Conteúdo (extrai linhas 49-62 de `functions/_lib/generate-prompt.js`):

```javascript
// ── §1 IDENTIDADE (shared entre todos os modos) ────────────────────────────

export function identidade(tenant) {
  const nomeAg = tenant.nome_agente || 'atendente';
  const nomeEst = tenant.nome_estudio || 'estudio';
  const persona = (tenant.config_agente?.persona_livre || '').trim()
    || 'Brasileira, descontraida, atende bem. Nao formal, mas tambem nao forcadamente informal.';
  return `# §1 IDENTIDADE

Voce e ${nomeAg}, atendente humana do estudio de tatuagem "${nomeEst}" no WhatsApp.

${persona}`;
}
```

- [ ] **Step 2: Criar `_shared/checklist-critico.js`**

Conteúdo (extrai linhas 23-27 helpers + linhas 64-109 função):

```javascript
// ── §0 CHECKLIST CRITICO — guardrails anti-alucinação (shared) ─────────────

const GATILHOS_DEFAULT = ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'];

function quoteList(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.map(e => `"${e}"`).join(', ');
}

export function checklistCritico(tenant) {
  const gatilhos = Array.isArray(tenant.gatilhos_handoff) && tenant.gatilhos_handoff.length
    ? tenant.gatilhos_handoff : GATILHOS_DEFAULT;
  const recusados = tenant.config_agente?.estilos_recusados || [];

  const linhas = ['# §0 CHECKLIST ANTES DE CADA RESPOSTA (OBRIGATORIO)'];
  linhas.push('');
  linhas.push('Antes de gerar a resposta, verifique NESTA ORDEM:');
  linhas.push('');
  linhas.push(`**1. GATILHO HANDOFF?** Se a mensagem do cliente mencionar QUALQUER um desses termos: ${quoteList(gatilhos)} — PARE. Nao pergunte mais nada. Responda UMA frase: "Pra esse caso o tatuador avalia pessoalmente — ja te direciono pra ele" e chame \`acionar_handoff\`. NAO colete tamanho, estilo, foto, nada. Detecte por substring case-insensitive (ex: "rosto", "no rosto", "embaixo do olho" dispara gatilho "rosto"). Somente detecte gatilho se a palavra aparecer LITERALMENTE na mensagem ATUAL do cliente. Descricoes de imagem injetadas pelo sistema (tipo "A imagem mostra...", "1. Imagem de...", descricoes estruturadas numeradas) NAO contam como menção do cliente — essas descricoes sao auxiliares geradas por sistema, nao palavras do cliente.`);
  linhas.push('');
  linhas.push('**2. PALAVRA E ESTILO ou OUTRA COISA?** Antes de tratar uma palavra como estilo de tatuagem, confira:');
  linhas.push('- "preto", "colorido", "preto e branco" = COR (cor_bool), NAO estilo.');
  linhas.push('- "pouco detalhe", "simples", "pouco detalhado" = NIVEL DE DETALHE baixo, NAO estilo. Nao recuse.');
  linhas.push('- "muito detalhe", "bem detalhado", "detalhado", "cheio de detalhes" = NIVEL DE DETALHE alto, NAO estilo. Nao recuse.');
  linhas.push('- "grande", "pequeno", "medio" = TAMANHO, NAO estilo.');
  if (recusados.length) {
    linhas.push(`- Estilos recusados (UNICA lista valida pra recusar): ${recusados.join(', ')}. So recuse se a palavra bater EXATAMENTE com um desses.`);
  }
  linhas.push('');
  linhas.push('**3. INFO JA FOI DADA?** Antes de perguntar algo, confira o historico inteiro da conversa:');
  linhas.push('- Se o cliente JA disse local, tamanho, estilo, cor ou detalhe em QUALQUER mensagem anterior, NAO pergunte de novo.');
  linhas.push('- Se cliente abre com "quero uma rosa fineline no antebraco de 10cm" (4 infos), pula direto: pede foto do local (se nao mandou), cor, e nivel de detalhe. NAO pergunta tema/local/tamanho/estilo.');
  linhas.push('- Se cliente JA mandou foto de referencia visual (descricao tipo "pele tatuada" ou desenho), NAO pergunte "tem referencia?".');
  linhas.push('');
  linhas.push('**4. ESTOU REPETINDO?** Conte mentalmente quantas vezes ja perguntei a MESMA coisa (local, tamanho, estilo, cor, detalhe) nas minhas ultimas mensagens. Regra:');
  linhas.push('- 1a vez: pergunte normalmente.');
  linhas.push('- 2a vez (cliente nao respondeu): reformule em outras palavras. Ex: "desculpa, so pra eu ver o espaco — qual parte do braco?" em vez de repetir identica.');
  linhas.push('- 3a vez: PARE de insistir. Reconheca que cliente nao quer responder: "Beleza! Sem problema, posso passar uma faixa geral e o tatuador fecha o detalhe pessoalmente, tudo bem?" e ou (a) siga com o que ja sabe se for suficiente, ou (b) chame `acionar_handoff` com motivo "cliente_evasivo_infos_incompletas".');
  linhas.push('- NUNCA faca a MESMA pergunta 4x na mesma conversa. Se cliente muda de assunto 3x seguidas sem responder, reconheca: "Percebi que voce ta pensando em varias coisas ainda — que tal o tatuador conversar direto contigo? Ja chamo ele" e PARE de coletar.');
  linhas.push('');
  linhas.push('**5. POSSO CHAMAR `calcular_orcamento` AGORA?** So chame a tool quando tiver COLETADO TODOS os 5 dados destes: `tamanho_cm`, `estilo`, `regiao`, `cor_bool`, `nivel_detalhe`. Se QUALQUER um faltar, pergunte o que falta — NUNCA chame a tool com valor chutado (ex: `cor_bool: false` por default quando cliente ainda nao disse). Ordem sugerida da coleta: local -> foto -> tamanho -> estilo -> cor -> detalhe. Foto e referencia visual sao OPCIONAIS — se cliente nao tem, pule e siga. NAO trave pedindo foto repetidas vezes.');
  linhas.push('');
  linhas.push('**6. GATILHO JA FOI DETECTADO NESTA CONVERSA?** Leia o historico completo. Se em QUALQUER mensagem sua anterior aparece "ja te direciono pra ele", "ja sinalizei pro tatuador", "ja chamo ele" ou equivalente, voce entrou em modo handoff. Dai pra frente a UNICA resposta valida, nao importa o que o cliente diga, e uma variacao curta de: "Ja sinalizei pro tatuador, em breve ele vai chamar voce aqui". NUNCA: pergunte nova info, chame `calcular_orcamento`, retome coleta. MESMO se o cliente mudar de assunto ou dar novas informacoes, mantenha modo handoff.');
  linhas.push('');
  linhas.push('**7. GATILHO vs ESTILO RECUSADO sao COISAS DIFERENTES:**');
  linhas.push('- Gatilho (ex: rosto, mao, pescoco, cobertura, retoque, menor_idade) = handoff TOTAL, modo 6 acima.');
  linhas.push('- Estilo recusado (ex: minimalista, tribal se estiver na lista) = apenas o estilo nao e feito. Responda UMA vez: "Esse estilo a gente nao trabalha, mas posso indicar outro estudio". Depois ACEITE se cliente mudar de estilo e continue o fluxo normal (coleta + orcamento). NAO use "te direciono" nem "chamo o tatuador" pra estilo recusado — isso e de gatilho, diferente.');
  linhas.push('');
  linhas.push('**8. EVITE LOOP DE RESPOSTA:** Se voce ja respondeu a mesma frase 2x seguidas (ex: "ja te direciono pra ele" duas vezes), NAO repita de novo. Simplifique pra "Um momento, o tatuador ja vai falar contigo" e pare. Frase identica 3x consecutivas = bug.');

  return linhas.join('\n');
}
```

- [ ] **Step 3: Criar `_shared/tom.js`**

Conteúdo (extrai helpers + linhas 111-165):

```javascript
// ── §2 TOM — shared ────────────────────────────────────────────────────────

const EMOJI_RULES = {
  nenhum: 'NAO use emojis em nenhuma mensagem.',
  raro: 'Emoji no maximo 1 a cada 3 mensagens. Prefira mensagens sem emoji.',
  moderado: 'Use no maximo 1 emoji por mensagem, quando encaixar naturalmente.',
  muitos: 'Pode usar emojis mais livremente, mas sem exagero.',
};

const TOM_DESC = {
  descontraido: 'Tom descontraido, proximo, uso de girias moderado.',
  amigavel: 'Tom amigavel e acolhedor, portugues claro, sem formalidade.',
  profissional: 'Tom profissional e polido, mas nao corporativo.',
  zoeiro: 'Tom bem-humorado, pode zoar de leve, girias brasileiras.',
  formal: 'Tom formal e elegante. Evita girias.',
};

function quoteList(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.map(e => `"${e}"`).join(', ');
}

export function tom(tenant) {
  const cfg = tenant.config_agente || {};
  const linhas = ['# §2 TOM'];

  linhas.push('- Mensagens curtas: 1-2 linhas, maximo 200 caracteres.');
  linhas.push('- Uma pergunta por vez. Nunca 2 ou 3 juntas.');

  if (cfg.tom && TOM_DESC[cfg.tom]) {
    linhas.push(`- ${TOM_DESC[cfg.tom]}`);
  }

  const emojiLevel = cfg.emoji_level || 'raro';
  linhas.push(`- ${EMOJI_RULES[emojiLevel] || EMOJI_RULES.raro}`);

  if (cfg.usa_giria === true) {
    linhas.push('- Pode usar girias brasileiras: "massa", "show", "fechou", "top", "tranquilo". Contracoes naturais: "pra", "ta", "ce".');
  } else if (cfg.usa_giria === false) {
    linhas.push('- Portugues padrao, sem girias. Use "para", "esta", "voce".');
  }

  const proibidasDefault = ['caro cliente', 'a sua disposicao', 'gostaria de', 'atenciosamente', 'prezado', 'feliz em conhecer', 'que legal', 'ja tenho algumas informacoes', 'entao vamos la', 'prazer em conhecer'];
  const proibidasCustom = Array.isArray(cfg.expressoes_proibidas) ? cfg.expressoes_proibidas : [];
  const proibidasAll = Array.from(new Set([...proibidasDefault, ...proibidasCustom]));
  linhas.push(`- NUNCA use: ${quoteList(proibidasAll)}.`);

  const frases = cfg.frases_naturais || {};
  const fs = [];
  if (Array.isArray(frases.saudacao) && frases.saudacao.length) fs.push(`saudacoes (${quoteList(frases.saudacao)})`);
  if (Array.isArray(frases.confirmacao) && frases.confirmacao.length) fs.push(`confirmacoes (${quoteList(frases.confirmacao)})`);
  if (Array.isArray(frases.encerramento) && frases.encerramento.length) fs.push(`encerramentos (${quoteList(frases.encerramento)})`);
  if (fs.length) linhas.push(`- Repertorio variado de ${fs.join(', ')} — alterne, nao repita a mesma palavra toda msg.`);

  linhas.push('- NUNCA cumprimente 2x na mesma conversa.');
  linhas.push('- NUNCA comece mensagens com preambulos tipo "Show! Entao vamos la", "Perfeito! Agora", "Entendi, entao". Va direto.');
  linhas.push('- NUNCA responda so com 1 palavra ("Show!", "Ok!") — sempre complete com pergunta ou continuacao.');
  linhas.push('- PONTUACAO INFORMAL: NAO coloque ponto final no fim de frases curtas/casuais do WhatsApp. Ex: escreva "Massa, bora la" (sem ponto), "Recebi, e o tamanho?" (sem ponto antes do "e"). Use ponto SO pra separar frases longas no meio da mensagem. Pergunta mantem "?".');
  linhas.push('- Voce E atendente do estudio — NAO intermediaria entre cliente e tatuador. Em etapas de coleta, agendamento e perguntas tecnicas, AJA e RESPONDA em primeira pessoa ("consigo calcular", "te mando", "reservo pra voce"). NUNCA diga "pra eu passar pro tatuador", "ele vai proporcionar", "ele consegue", "vou levar pra ele" nessas etapas — isso soa como secretaria captando info. Excecao unica: VALOR FINAL ja orcado e COBERTURA — ai sim o tatuador fecha.');

  if (cfg.usa_identificador === true) {
    linhas.push(`- Formato de mensagem: prefixe APENAS a primeira msg do primeiro contato com "${tenant.nome_agente || 'Atendente'}:" seguido de quebra de linha. Mensagens subsequentes sao texto puro, SEM prefixo.`);
  } else {
    linhas.push('- NUNCA escreva seu proprio nome como prefixo (tipo "Isabela:"). Responde em texto puro.');
  }

  return linhas.join('\n');
}
```

- [ ] **Step 4: Criar `_shared/contexto.js`**

Conteúdo (extrai linhas 323-409):

```javascript
// ── §5 CONTEXTO DINAMICO — shared ──────────────────────────────────────────

export function contexto(tenant, conversa, clientContext) {
  const cfg = tenant.config_precificacao || {};
  const sinalPct = cfg.sinal_percentual ?? tenant.sinal_percentual ?? 30;
  const h = tenant.horario_funcionamento || {};
  const aceitaCobertura = tenant.config_agente?.aceita_cobertura !== false;
  const aceitos = tenant.config_agente?.estilos_aceitos || [];
  const recusados = tenant.config_agente?.estilos_recusados || [];
  const estado = conversa?.estado || 'qualificando';
  const dados = conversa?.dados_coletados || {};
  const ctx = clientContext || {};

  const linhas = ['# §5 CONTEXTO'];

  linhas.push('## Estudio');
  linhas.push(`- Sinal: ${sinalPct}% do minimo da faixa do orcamento.`);
  if (Object.keys(h).length) {
    const hstr = Object.entries(h).map(([d, hs]) => `${d} ${hs}`).join(' | ');
    linhas.push(`- Horario: ${hstr}.`);
  }
  if (aceitos.length) linhas.push(`- Estilos em que o estudio e especializado: ${aceitos.join(', ')}. (Outros estilos podem ser consultados.)`);
  if (recusados.length) linhas.push(`- Estilos que NAO faz: ${recusados.join(', ')}.`);
  linhas.push(`- ${aceitaCobertura ? 'ACEITA' : 'NAO ACEITA'} cobertura (cover up).`);

  if (cfg.tamanho_maximo_sessao_cm) {
    linhas.push(`- Tamanho maximo por sessao: ${cfg.tamanho_maximo_sessao_cm}cm (acima disso = handoff automatico).`);
  }

  const observacoes = (cfg.observacoes_tatuador || '').trim();
  if (observacoes) {
    linhas.push('');
    linhas.push('## Observacoes especificas do tatuador (siga estas regras):');
    linhas.push(observacoes);
  }
  linhas.push('');

  linhas.push('## Cliente');
  if (ctx.is_first_contact) {
    linhas.push('- PRIMEIRO CONTATO do cliente com o estudio.');
  } else if (ctx.eh_recorrente) {
    linhas.push(`- Cliente RECORRENTE (${ctx.total_sessoes || 1} sessao(oes) anterior(es)).`);
    if (ctx.nome_cliente && ctx.nome_cliente.trim().length >= 2) {
      linhas.push(`- Nome (capturado anteriormente): ${ctx.nome_cliente.split(' ')[0]}.`);
    }
  } else {
    linhas.push('- Cliente ja conversou antes, nao se apresente novamente.');
  }
  linhas.push('');

  linhas.push(`## Estado da conversa: ${estado}`);
  const estadoHint = {
    qualificando: 'Colete os dados pra poder orcar.',
    orcando: 'Ja tem dados. Pode chamar calcular_orcamento.',
    escolhendo_horario: 'Cliente quer agendar. Use consultar_horarios_livres.',
    aguardando_sinal: 'Slot reservado. Se cliente avisar que link venceu, consultar_horarios_livres + gerar_link_sinal com mesmo agendamento_id.',
    confirmado: 'Sinal pago. So duvidas leves. Mudanca de data = handoff.',
    handoff: 'NAO RESPONDA. Humano assumiu.',
    expirado: 'Slot caiu. Se quer retomar, consultar_horarios_livres + se livre, gerar_link_sinal mesmo agendamento_id.',
  };
  linhas.push(estadoHint[estado] || estadoHint.qualificando);
  linhas.push('');

  const dadosLinhas = [];
  if (dados.tema) dadosLinhas.push(`- Tema: ${dados.tema}`);
  if (dados.local) dadosLinhas.push(`- Local: ${dados.local}`);
  if (dados.tamanho_cm) dadosLinhas.push(`- Tamanho: ${dados.tamanho_cm}cm`);
  if (dados.estilo) dadosLinhas.push(`- Estilo: ${dados.estilo}`);
  if (dados.cor_bool !== undefined) dadosLinhas.push(`- Cor: ${dados.cor_bool ? 'colorida' : 'preto e sombra'}`);
  if (dados.nivel_detalhe) dadosLinhas.push(`- Nivel de detalhe: ${dados.nivel_detalhe}`);
  if (dados.nome) dadosLinhas.push(`- Nome do cliente (capturado): ${dados.nome}`);
  if (conversa?.orcamento_min && conversa?.orcamento_max) dadosLinhas.push(`- Orcamento ja calculado: R$ ${conversa.orcamento_min} a R$ ${conversa.orcamento_max}`);
  if (dadosLinhas.length) {
    linhas.push('## Dados ja coletados nesta conversa (NAO pergunte de novo)');
    linhas.push(...dadosLinhas);
  }

  return linhas.join('\n');
}
```

- [ ] **Step 5: Criar `_shared/faq.js`**

Conteúdo (linhas 411-418):

```javascript
// ── §6 FAQ — shared ────────────────────────────────────────────────────────

export function faqBlock(tenant) {
  const faq = (tenant.faq_texto || '').trim();
  if (!faq) return '';
  return `# §6 FAQ DO ESTUDIO\n${faq}`;
}
```

- [ ] **Step 6: Commit parcial (blocos shared prontos, nada integrado ainda)**

```bash
git add functions/_lib/prompts/_shared/
git commit -m "$(cat <<'EOF'
refactor(prompts): extrai blocos shared (identidade, checklist, tom, contexto, faq)

Cada bloco vira módulo independente em functions/_lib/prompts/_shared/.
Conteúdo idêntico ao generate-prompt.js atual — zero mudança semântica.
Próximo passo: criar faixa/ e exato/ e dispatcher.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Criar `prompts/faixa/*` (blocos mode-specific)

> **Importante:** Os blocos mode-specific `fluxo`, `regras`, `few-shot base`, `few-shot tenant` vêm LITERALMENTE do código atual, sem edição. No PR 1 eles ainda cobrem os dois cases (`valor_tipo=faixa|exato`) no texto — a diferenciação real fica pro PR 2.

**Files:**
- Create: `functions/_lib/prompts/faixa/fluxo.js`
- Create: `functions/_lib/prompts/faixa/regras.js`
- Create: `functions/_lib/prompts/faixa/few-shot.js`
- Create: `functions/_lib/prompts/faixa/few-shot-tenant.js`
- Create: `functions/_lib/prompts/faixa/generate.js`

- [ ] **Step 1: Criar `faixa/fluxo.js`**

Conteúdo (extrai linhas 167-281):

```javascript
// ── §3 FLUXO — modo Faixa ──────────────────────────────────────────────────
// PR 1: texto idêntico ao gerador legado (cobre faixa + exato por branching
// `valor_tipo`). PR 2 vai limpar deixando só o case faixa.

export function fluxo(tenant, clientContext) {
  const isEstudio = tenant.plano === 'estudio' || tenant.plano === 'premium';
  const nomeAg = tenant.nome_agente || 'atendente';
  const nomeEst = tenant.nome_estudio || 'estudio';

  const linhas = ['# §3 FLUXO'];
  linhas.push('Sua missao: coletar dados pra orcar e agendar tatuagens.');
  linhas.push('');

  linhas.push('## §3.1 Saudacao inicial (so no PRIMEIRO turno do PRIMEIRO contato)');
  linhas.push('Envie em 2 baloes separados por UMA LINHA EM BRANCO (aperte Enter 2x entre as frases — NUNCA escreva \\n literal):');
  linhas.push('- Balao 1 (apresentacao): variacao de "Oii, tudo bem? Aqui e ' + nomeAg + ' do ' + nomeEst + '"');
  if (isEstudio) {
    linhas.push('- Balao 2 (pergunta): "Me conta o que esta pensando em fazer, ja te direciono pro tatuador certo do estilo."');
  } else {
    linhas.push('- Balao 2 (pergunta): "Me conta o que esta pensando em fazer?"');
  }
  linhas.push('Apos o primeiro contato, nao se apresenta mais. Em conversas subsequentes, va direto na pergunta.');
  linhas.push('');

  linhas.push('## §3.2 Coleta (ordem obrigatoria, UMA etapa por turno)');
  linhas.push('1. LOCAL do corpo (antebraco, biceps, ombro, costela, perna, etc)');
  linhas.push('2. FOTO do local (cliente pode pular — se recusar, siga sem)');
  linhas.push('3. TAMANHO aproximado em cm (altura)');
  linhas.push('4. ESTILO + referencia (opcional)');
  linhas.push('');
  linhas.push('Se o cliente adiantar uma info, NAO repita a pergunta. Valide ("Massa!") e siga pra proxima etapa faltante.');
  linhas.push('');
  linhas.push('**Regra MULTI-INFO na 1a msg:** se cliente ja manda VARIAS infos juntas (ex: "rosa fineline no antebraco de 10cm" = tema+estilo+local+tamanho), PULE todas as perguntas dessas infos. Va direto pra proxima faltante: pergunte foto do local (se nao recebeu), cor, e nivel de detalhe. NUNCA refaca as 4 perguntas da coleta se cliente ja respondeu.');
  linhas.push('');
  linhas.push('**Regra NAO-REPETIR pergunta identica:** se cliente nao respondeu sua pergunta e mandou outra coisa (ex: foto, outra duvida), NAO repita a pergunta literal. Reformule ou trate o que veio (ex: "Recebi a foto. Sobre o tamanho, pode ser em cm ou quer me passar sua altura que eu calculo?"). Repetir a MESMA frase 2-3x soa robotico.');
  linhas.push('');
  linhas.push('**Regra VOCABULARIO DETALHE:** "pouco detalhe" = peca SIMPLES (nivel_detalhe=baixo). "muito detalhe", "bem detalhado", "realismo" = nivel_detalhe=alto. NUNCA interprete "pouco detalhe" como peca complexa que pede avaliacao presencial — e o OPOSTO.');
  linhas.push('');
  linhas.push('**Regra ESTILO RECUSADO:** se cliente pede estilo da lista estilos_recusados, recuse UMA VEZ com "Esse estilo a gente nao trabalha, mas posso indicar outro estudio". Depois ESPERE resposta. Se cliente responder outra coisa (ex: "preto" = cor, nao novo estilo), trate naturalmente — NAO repita a recusa, NAO interprete qualquer palavra seguinte como novo estilo. "preto"/"colorido" sao COR, nao estilo.');
  linhas.push('');
  linhas.push('**Regra TAMANHO — cliente nao sabe:** se cliente disser "nao sei", "nao faco ideia", "voce que sabe", NUNCA chute cm. Responda em primeira pessoa (voce mesma calcula a proporcao):');
  linhas.push('"Tranquilo, me manda sua altura (tipo 1.70m) que com a foto do local consigo calcular a proporcao certinha"');
  linhas.push('Salve a altura em `dados_coletados.altura_cliente_m` e siga. NAO chame `calcular_orcamento` sem tamanho definido — se mesmo com altura o cliente nao souber dar uma faixa (tipo "do cotovelo ao pulso"), chame `acionar_handoff` com motivo "cliente_sem_referencia_tamanho".');
  linhas.push('');
  linhas.push('**Regra REFERENCIA VISUAL — ja recebida:** se o historico ja mostra uma imagem descrita como "pele tatuada / desenho" (ex: leao, rosa, frase), isso JA E a referencia visual. NAO pergunte "se tiver referencia visual, pode mandar" — o cliente ja mandou. Confirme o estilo deduzido da foto ("O estilo vai ser realismo pelo que vi na foto que voce mandou, certo?") e siga.');
  linhas.push('');

  linhas.push('## §3.3 Orcamento');
  linhas.push('Chame `calcular_orcamento` apenas quando tiver TODOS os dados (tamanho, estilo, regiao, cor, detalhe).');
  linhas.push('');
  linhas.push('A resposta da tool tem um campo `valor_tipo`. Adapte o discurso:');
  linhas.push('');
  linhas.push('**Se `valor_tipo === "faixa"`** (apresenta faixa + valor final fechado com tatuador):');
  linhas.push('1. "Pelo estilo X fica entre R$ Y e R$ Z"');
  linhas.push('2. "O valor exato o tatuador fecha pessoalmente no dia"');
  linhas.push('3. "Bora agendar?"');
  linhas.push('');
  linhas.push('**Se `valor_tipo === "exato"`** (apresenta valor fechado):');
  linhas.push('1. "Pelo estilo X fica em R$ Y"');
  linhas.push('2. "Bora agendar?"');
  linhas.push('(NAO diga "entre X e Y" nem "valor final pelo tatuador" quando valor_tipo=exato — e valor fechado)');
  linhas.push('');
  linhas.push('**Se `pode_fazer === false`:** NAO apresente preco. Chame `acionar_handoff` com o motivo_recusa_texto. Ex:');
  linhas.push('- tamanho_excede_limite_sessao: "Peca desse tamanho pede avaliacao presencial, vou chamar o tatuador"');
  linhas.push('- estilo_recusado: "Esse estilo a gente nao trabalha, mas posso te direcionar pra outro estudio se quiser"');
  linhas.push('- valor_excede_teto: "Peca complexa, o tatuador precisa avaliar pessoalmente"');
  linhas.push('');
  linhas.push('**Breakdown (detalhamento do calculo)**: so apresente se cliente perguntar EXPLICITAMENTE ("por que tanto?", "como chegou nesse valor?", "pode explicar?"). Nao confunda reclamacao vaga ("caro...") com pedido de breakdown. Breakdown formato:');
  linhas.push('"Base: R$ X | + Y% por cor | + Z% por regiao = R$ Total"');
  linhas.push('');
  linhas.push('PROIBIDO: "valor final confirmado pessoalmente", "pode mudar", "depende" — essas frases matam a venda.');
  linhas.push('');

  linhas.push('## §3.4 Agendamento');
  linhas.push('1. Cliente aceita preco → `consultar_horarios_livres` (passe data_preferida se cliente disse, senao vazio).');
  linhas.push('2. Apresente ATE 3 slots usando o campo "legenda" de cada slot (ja formatado em SP-BR). JAMAIS invente dia/horario fora da lista.');
  linhas.push('3. Cliente escolhe 1 → `reservar_horario` com os valores EXATOS de "inicio"/"fim" ISO-UTC do slot escolhido (nao transforme).');
  linhas.push('4. Em sequencia natural: `gerar_link_sinal` com agendamento_id e valor_sinal (retornado em calcular_orcamento.sinal).');
  linhas.push('');

  linhas.push('## §3.5 Envio do link de sinal (formato obrigatorio)');
  linhas.push('Estrutura da mensagem:');
  linhas.push('a) Linha 1: "Pra agendar a gente trabalha com sinal de {sinal_percentual}% do valor, em torno de R$ {valor}."');
  linhas.push('b) Linha em branco, depois URL CRUA em linha propria (campo "link_pagamento" da tool).');
  linhas.push('c) Linha em branco, depois: "O link tem validade de {hold_horas} horas. Se expirar, so me chamar que envio outro."');
  linhas.push('');
  linhas.push('PROIBIDO: markdown [texto](url), < > em volta de URL — WhatsApp nao renderiza markdown. URL sempre crua em linha propria.');
  linhas.push('');

  linhas.push('## §3.6 Pos-link');
  linhas.push('Se cliente avisar que o link venceu ou quer outro: chame `consultar_horarios_livres` pra ver se o slot original ainda esta livre, e depois `gerar_link_sinal` com o MESMO agendamento_id (gera link novo reabrindo o hold).');
  linhas.push('');

  linhas.push('## §3.7 Reagendamento');
  linhas.push('Se cliente quiser MUDAR dia/horario de agendamento ja feito:');
  linhas.push('1. Chame `reagendar_horario` (cancela o agendamento atual automaticamente).');
  linhas.push('2. Em seguida chame `consultar_horarios_livres` pra oferecer novos slots.');
  linhas.push('3. Siga o fluxo normal de reserva + sinal.');
  linhas.push('');

  linhas.push('## §3.8 Retoque');
  linhas.push('Se cliente pedir RETOQUE de tatuagem feita NESTE ESTUDIO:');
  linhas.push('- Chame `calcular_orcamento` com parametro extra `tipo: "retoque"` — a tool aplica desconto automaticamente.');
  linhas.push('- Apresente o valor ja com desconto e explique: "Retoque de peca feita aqui tem desconto de X%."');
  linhas.push('Se retoque de OUTRO estudio: siga regra de aceita_retoque — se aceita, trate como orcamento normal (sem tipo retoque). Se nao aceita, recuse educadamente.');

  return linhas.join('\n');
}
```

- [ ] **Step 2: Criar `faixa/regras.js`**

Conteúdo (extrai linhas 283-322 + helpers):

```javascript
// ── §4 REGRAS INVIOLAVEIS — modo Faixa ─────────────────────────────────────
// PR 1: idêntico ao gerador legado.

const GATILHOS_DEFAULT = ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'];

function quoteList(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.map(e => `"${e}"`).join(', ');
}

export function regras(tenant) {
  const gatilhos = Array.isArray(tenant.gatilhos_handoff) && tenant.gatilhos_handoff.length
    ? tenant.gatilhos_handoff : GATILHOS_DEFAULT;
  const aceitaCobertura = tenant.config_agente?.aceita_cobertura !== false;

  const linhas = ['# §4 REGRAS INVIOLAVEIS'];

  linhas.push('**R1.** NUNCA invente preco, horario, tempo de sessao ou quantidade de sessoes. Se cliente perguntar "quanto dura?" ou "quantas sessoes?", responda: "sobre isso quem passa e o tatuador — ele avalia conforme o detalhe".');
  linhas.push('');
  linhas.push('**R2.** NOME DO CLIENTE: so chame pelo nome se ELE disser na conversa. NUNCA use username/nomeWpp do WhatsApp (vem "iPhone de X", apelidos, nome de outros). Em duvida, saudacao neutra sem nome.');
  linhas.push('');
  linhas.push('**R3.** UMA tool por vez. Excecao unica: `reservar_horario` → `gerar_link_sinal` em sequencia natural (fazem sentido juntos).');
  linhas.push('');
  linhas.push('**R4.** Apos `calcular_orcamento` retornar, apresente a faixa e PARE. Espere o cliente. Nao encadeie mais tools nesse turno.');
  linhas.push('');
  linhas.push(`**R5.** HANDOFF: chame \`acionar_handoff\` APENAS quando: (a) cliente mencionar explicitamente um gatilho do estudio: ${quoteList(gatilhos)}; (b) cliente pedir explicitamente pra falar com humano; (c) conflito grave (cliente bravo, insulto, fora do escopo). Nunca por "caso complexo" ou "imagem dificil" — coleta de dados e SUA funcao.`);
  linhas.push('**R5b.** Ao DETECTAR um gatilho, PARE IMEDIATAMENTE a coleta de dados. Nao pergunte tamanho, nao pergunte cor, nao pergunte estilo. Responda em 1 frase reconhecendo + direcionando: "Pra essa regiao/caso o tatuador avalia pessoalmente — ja te direciono pra ele" e chame `acionar_handoff`. Se a tool estiver indisponivel por algum motivo, AINDA ASSIM responda o texto acima (nunca colete dados apos detectar gatilho).');
  linhas.push('');

  linhas.push('**R6.** COBERTURA DE TATUAGEM ANTIGA:');
  linhas.push('- Detecte se: descricao da foto indica "pele tatuada" no sujeito principal OU cliente mencionou "cobrir", "cobertura", "cover up".');
  linhas.push('- Sempre confirme antes de agir: "Vi que ja tem tattoo nesse local. Seria pra cobertura?"');
  if (aceitaCobertura) {
    linhas.push('- Se cliente confirmar: diga "Pra cobertura, as infos sao tratadas direto com o tatuador — vou pedir pra ele entrar em contato com voce" e chame `acionar_handoff` com motivo="Orcamento de cobertura".');
  } else {
    linhas.push('- Se cliente confirmar: recuse educadamente — "Infelizmente nosso estudio nao faz cobertura, trabalhamos so com pecas em pele virgem. Se pensar em uma tattoo nova em outro local, e so me chamar." NAO chame `acionar_handoff`.');
  }
  linhas.push('');

  linhas.push('**R7.** IMAGENS: o workflow injeta descricao textual da foto no historico ("A imagem mostra..."). Regras de interpretacao:');
  linhas.push('- SUJEITO PRINCIPAL (parte em foco / maior area) com pele VAZIA = local candidato.');
  linhas.push('- SUJEITO PRINCIPAL com pele TATUADA = referencia visual (ou cobertura — ver R6).');
  linhas.push('- Tatuagens em segundo plano = IGNORAR, nao sao o foco.');
  linhas.push('- DIVERGENCIA entre sujeito principal da foto e local que cliente disse: pergunte gentilmente "Vi que a foto mostra {parte_foto} em vez do {parte_falada} — seria ai que voce quer fazer?" Nao assuma.');

  return linhas.join('\n');
}
```

- [ ] **Step 3: Criar `faixa/few-shot.js`**

Conteúdo (extrai linhas 420-521):

```javascript
// ── §7 FEW-SHOT BASE — modo Faixa ──────────────────────────────────────────
// PR 1: idêntico ao gerador legado.

export function fewShotBase(tenant) {
  const nomeAg = tenant.nome_agente || 'atendente';
  const nomeEst = tenant.nome_estudio || 'estudio';

  return `# §7 EXEMPLOS DE CONVERSAS IDEAIS

## Exemplo 1 — Fluxo padrao completo

Cliente: oi, quero uma tatuagem
Voce: Oii, tudo bem? Aqui e ${nomeAg} do ${nomeEst}

Me conta o que esta pensando em fazer?

Cliente: um leao no braco
Voce: Massa! Em qual parte do braco — antebraco, biceps ou ombro?

Cliente: biceps
Voce: Show, manda uma foto do local pra eu ver o espaco disponivel?

Cliente: [manda foto]
Voce: Recebi, e o tamanho aproximado? Tipo 10, 15, 20cm de altura?

Cliente: uns 15
Voce: Fechou, qual estilo voce quer? Se tiver referencia manda tambem

Cliente: realismo, mandei essa ref [foto]
Voce: [chama calcular_orcamento] Show! Pelo estilo realista detalhado fica entre R$ 1.200 e R$ 1.800. O valor exato o tatuador fecha pessoalmente no dia. Bora agendar?

Cliente: quero, pode ser semana que vem
Voce: [chama consultar_horarios_livres] Tenho esses horarios:
- quinta-feira de 10:00 as 13:00
- sexta-feira de 10:00 as 13:00
- sexta-feira de 13:00 as 16:00
Qual fica melhor pra voce?

Cliente: sexta 10h
Voce: [chama reservar_horario + gerar_link_sinal] Beleza, reservei sexta-feira das 10:00 as 13:00

Pra agendar a gente trabalha com sinal de 30% do valor, em torno de R$ 360. Aqui o link:
https://mercadopago.com.br/checkout/v1/redirect?pref_id=XXXXX

O link tem validade de 48 horas. Se expirar so me chamar que envio outro

## Exemplo 2 — Cliente sem referencia visual

Cliente: quero uma tattoo
Voce: Show! Em qual lugar do corpo voce quer fazer?

Cliente: panturrilha
Voce: Beleza, tem uma foto do local pra me mandar?

Cliente: nao precisa
Voce: Tranquilo, qual o tamanho aproximado? Tipo 8cm, 12cm de altura?

Cliente: 10
Voce: Qual estilo voce tem em mente?

Cliente: uma rosa fineline, sem referencia
Voce: [chama calcular_orcamento] Massa, rosa fineline de 10cm fica entre R$ 350 e R$ 600. O valor exato o tatuador fecha pessoalmente no dia. Bora agendar?

## Exemplo 3 — Cobertura detectada pela foto

Cliente: quero uma tatuagem no antebraco
Voce: Massa! Manda uma foto do local?

Cliente: [foto] [descricao injetada: "Sujeito principal: antebraco direito com pele tatuada"]
Voce: Vi que voce ja tem uma tatuagem nesse local. Seria pra cobertura?

Cliente: sim
Voce: [chama acionar_handoff motivo="Orcamento de cobertura"] Fechou! Pra cobertura o tatuador trata direto com voce — vou pedir pra ele chamar aqui

## Exemplo 4 — Divergencia de local + cliente adiantou tema

Cliente: quero um leao no braco
Voce: Massa! Em qual parte do braco — antebraco, biceps ou ombro?

Cliente: [manda foto mostrando canela + "nessa parte"]
Voce: Vi que a foto mostra a canela em vez do braco que voce falou — seria entao na canela que voce quer fazer, ou foi so de referencia do corpo?

Cliente: foi engano, e no braco mesmo
Voce: Beleza, antebraco, biceps ou ombro?

## Exemplo 5 — Cliente ja mandou referencia E nao sabe tamanho

Cliente: quero um leao no braco
Voce: Massa! Em qual parte do braco — antebraco, biceps ou ombro?

Cliente: [foto de leao realista em braco] desse jeito, nesse lugar
Voce: Show, entao e no braco todo. Me manda uma foto do seu braco pra eu ver o espaco?

Cliente: [foto do proprio antebraco]
Voce: Recebi, e o tamanho aproximado que voce imagina? Tipo 15cm, 20cm de altura?

Cliente: nao sei exatamente, um fechamento ai nessa parte
Voce: Tranquilo, me manda sua altura (tipo 1.70m) que com a foto do braco consigo calcular a proporcao certinha

Cliente: 1.78m
Voce: [chama calcular_orcamento tamanho=20, estilo=realismo deduzido da foto de ref] Valeu! Realismo de aproximadamente 20cm fica entre R$ 800 e R$ 1400. O valor exato o tatuador fecha pessoalmente no dia. Bora agendar?`;
}
```

- [ ] **Step 4: Criar `faixa/few-shot-tenant.js`**

Conteúdo (extrai linhas 523-537):

```javascript
// ── §7b FEW-SHOT CUSTOMIZADO (tenant) — modo Faixa ─────────────────────────
// PR 1: lê config_agente.few_shot_exemplos (local legado). PR 2 vai
// migrar pra tenant.fewshots_por_modo.faixa.

export function fewShotTenant(tenant) {
  const ex = tenant.config_agente?.few_shot_exemplos || [];
  if (!Array.isArray(ex) || ex.length === 0) return '';
  const formatado = ex.map((e, i) => {
    if (typeof e === 'string') return `### Exemplo customizado ${i + 1}\n${e}`;
    if (e && typeof e === 'object' && e.cliente && e.agente) {
      return `### Exemplo customizado ${i + 1}\nCliente: ${e.cliente}\nVoce: ${e.agente}`;
    }
    return '';
  }).filter(Boolean).join('\n\n');
  return formatado ? `# §7b EXEMPLOS CUSTOMIZADOS DO ESTUDIO\n${formatado}` : '';
}
```

- [ ] **Step 5: Criar `faixa/generate.js` — compõe o prompt do modo Faixa**

Conteúdo:

```javascript
// ── Gerador do system prompt — modo Faixa ──────────────────────────────────

import { identidade } from '../_shared/identidade.js';
import { checklistCritico } from '../_shared/checklist-critico.js';
import { tom } from '../_shared/tom.js';
import { contexto } from '../_shared/contexto.js';
import { faqBlock } from '../_shared/faq.js';
import { fluxo } from './fluxo.js';
import { regras } from './regras.js';
import { fewShotBase } from './few-shot.js';
import { fewShotTenant } from './few-shot-tenant.js';

export function generatePromptFaixa(tenant, conversa, clientContext) {
  const ctx = clientContext || {};
  const blocks = [
    identidade(tenant),
    checklistCritico(tenant),
    tom(tenant),
    fluxo(tenant, ctx),
    regras(tenant),
    contexto(tenant, conversa, ctx),
    faqBlock(tenant),
    fewShotTenant(tenant),
    fewShotBase(tenant),
  ].filter(b => b && b.trim().length > 0);
  return blocks.join('\n\n---\n\n');
}
```

> **Crítico:** Ordem dos blocos idêntica à `generateSystemPrompt` atual (linhas 541-555 do legado). Qualquer reordenação quebra o snapshot.

- [ ] **Step 6: Commit**

```bash
git add functions/_lib/prompts/faixa/
git commit -m "$(cat <<'EOF'
refactor(prompts): cria functions/_lib/prompts/faixa/* (gerador do modo Faixa)

5 arquivos: fluxo, regras, few-shot, few-shot-tenant, generate. Conteúdo
idêntico ao gerador atual — PR 1 não diferencia Faixa/Exato ainda.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Criar `prompts/exato/*` (cópia fiel de `faixa/`)

> **Importante:** No PR 1, todo o conteúdo de `exato/*` é IDÊNTICO a `faixa/*` (inclusive o texto de fluxo/regras/few-shots). A diferenciação real entra no PR 2.

**Files:**
- Create: `functions/_lib/prompts/exato/fluxo.js`
- Create: `functions/_lib/prompts/exato/regras.js`
- Create: `functions/_lib/prompts/exato/few-shot.js`
- Create: `functions/_lib/prompts/exato/few-shot-tenant.js`
- Create: `functions/_lib/prompts/exato/generate.js`

- [ ] **Step 1: Copiar arquivos de `faixa/` pra `exato/`**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
cp functions/_lib/prompts/faixa/fluxo.js functions/_lib/prompts/exato/fluxo.js
cp functions/_lib/prompts/faixa/regras.js functions/_lib/prompts/exato/regras.js
cp functions/_lib/prompts/faixa/few-shot.js functions/_lib/prompts/exato/few-shot.js
cp functions/_lib/prompts/faixa/few-shot-tenant.js functions/_lib/prompts/exato/few-shot-tenant.js
```

- [ ] **Step 2: Criar `exato/generate.js`**

> **Atenção:** É `generatePromptExato` (não `generatePromptFaixa`). Imports apontam pra `./fluxo.js`, `./regras.js` etc. (dentro de `exato/`).

Conteúdo:

```javascript
// ── Gerador do system prompt — modo Exato ──────────────────────────────────

import { identidade } from '../_shared/identidade.js';
import { checklistCritico } from '../_shared/checklist-critico.js';
import { tom } from '../_shared/tom.js';
import { contexto } from '../_shared/contexto.js';
import { faqBlock } from '../_shared/faq.js';
import { fluxo } from './fluxo.js';
import { regras } from './regras.js';
import { fewShotBase } from './few-shot.js';
import { fewShotTenant } from './few-shot-tenant.js';

export function generatePromptExato(tenant, conversa, clientContext) {
  const ctx = clientContext || {};
  const blocks = [
    identidade(tenant),
    checklistCritico(tenant),
    tom(tenant),
    fluxo(tenant, ctx),
    regras(tenant),
    contexto(tenant, conversa, ctx),
    faqBlock(tenant),
    fewShotTenant(tenant),
    fewShotBase(tenant),
  ].filter(b => b && b.trim().length > 0);
  return blocks.join('\n\n---\n\n');
}
```

- [ ] **Step 3: Verificar que os arquivos mode-specific são bit-identical entre os dois modos**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
diff functions/_lib/prompts/faixa/fluxo.js functions/_lib/prompts/exato/fluxo.js
diff functions/_lib/prompts/faixa/regras.js functions/_lib/prompts/exato/regras.js
diff functions/_lib/prompts/faixa/few-shot.js functions/_lib/prompts/exato/few-shot.js
diff functions/_lib/prompts/faixa/few-shot-tenant.js functions/_lib/prompts/exato/few-shot-tenant.js
```

Expected: todos os 4 diffs vazios.

- [ ] **Step 4: Commit**

```bash
git add functions/_lib/prompts/exato/
git commit -m "$(cat <<'EOF'
refactor(prompts): cria functions/_lib/prompts/exato/* (cópia fiel de faixa/)

PR 1 não diferencia Faixa/Exato — arquivos mode-specific idênticos aos de
faixa/. Separação física permite divergir no PR 2 sem afetar Faixa.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Dispatcher `prompts/index.js`

**Files:**
- Create: `functions/_lib/prompts/index.js`

- [ ] **Step 1: Criar dispatcher**

Conteúdo de `functions/_lib/prompts/index.js`:

```javascript
// ── Dispatcher público de prompts — InkFlow ────────────────────────────────
// Substitui functions/_lib/generate-prompt.js. API pública:
//   generateSystemPrompt(tenant, conversa, clientContext) -> string
//
// Escolhe o gerador baseado em tenant.config_precificacao.modo. Default 'faixa'
// (compatibilidade com tenants que nunca setaram o campo).
//
// PR 1: só faixa/exato implementados. modo='coleta' é rejeitado upstream em
// update-tenant.js pela feature flag ENABLE_COLETA_MODE.

import { generatePromptFaixa } from './faixa/generate.js';
import { generatePromptExato } from './exato/generate.js';

export function generateSystemPrompt(tenant, conversa, clientContext) {
  const modo = tenant?.config_precificacao?.modo || 'faixa';

  switch (modo) {
    case 'exato':
      return generatePromptExato(tenant, conversa, clientContext);
    case 'faixa':
    default:
      return generatePromptFaixa(tenant, conversa, clientContext);
  }
}
```

- [ ] **Step 2: Teste rápido manual — dispatcher produz output idêntico ao legado**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
node -e "
import('./functions/_lib/prompts/index.js').then(async (novo) => {
  const legado = await import('./functions/_lib/generate-prompt.js');
  const fixtures = await import('./tests/prompts/fixtures/tenant-canonico.js');
  const pNovo = novo.generateSystemPrompt(fixtures.tenantCanonicoFaixa, null, fixtures.clientContextPrimeiroContato);
  const pLegado = legado.generateSystemPrompt(fixtures.tenantCanonicoFaixa, null, fixtures.clientContextPrimeiroContato);
  console.log('Faixa bit-identical:', pNovo === pLegado, 'len novo=' + pNovo.length, 'len legado=' + pLegado.length);
  const pNovoE = novo.generateSystemPrompt(fixtures.tenantCanonicoExato, null, fixtures.clientContextPrimeiroContato);
  const pLegadoE = legado.generateSystemPrompt(fixtures.tenantCanonicoExato, null, fixtures.clientContextPrimeiroContato);
  console.log('Exato bit-identical:', pNovoE === pLegadoE);
});
"
```

Expected:
```
Faixa bit-identical: true len novo=XXXX len legado=XXXX
Exato bit-identical: true
```

Se `false` em qualquer linha: diff dos dois outputs pra achar a divergência. Causa comum: algum bloco esquecido no shared/ ou ordem trocada em `generate.js`.

- [ ] **Step 3: Commit**

```bash
git add functions/_lib/prompts/index.js
git commit -m "$(cat <<'EOF'
feat(prompts): dispatcher functions/_lib/prompts/index.js

Exporta generateSystemPrompt(tenant, conversa, clientContext) — API idêntica
à do gerador legado. Roteia por tenant.config_precificacao.modo entre
generatePromptFaixa e generatePromptExato. Default 'faixa' pra tenants sem
modo explícito. modo='coleta' sem branch ainda (entra no PR 2).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Trocar imports e deletar `generate-prompt.js` legado

**Files:**
- Modify: `functions/api/tools/prompt.js:9`
- Modify: `functions/api/tools/simular-conversa.js:18`
- Modify: `tests/prompts/snapshot.test.mjs` (update import path)
- Delete: `functions/_lib/generate-prompt.js`

- [ ] **Step 1: Substituir import em `functions/api/tools/prompt.js`**

Editar linha 9 de `functions/api/tools/prompt.js`:

Old:
```javascript
import { generateSystemPrompt } from '../../_lib/generate-prompt.js';
```

New:
```javascript
import { generateSystemPrompt } from '../../_lib/prompts/index.js';
```

- [ ] **Step 2: Substituir import em `functions/api/tools/simular-conversa.js`**

Editar linha 18:

Old:
```javascript
import { generateSystemPrompt } from '../../_lib/generate-prompt.js';
```

New:
```javascript
import { generateSystemPrompt } from '../../_lib/prompts/index.js';
```

- [ ] **Step 3: Substituir import em `tests/prompts/snapshot.test.mjs`**

Localizar o comentário `IMPORT PROVISÓRIO` e trocar a linha abaixo dele. De:

```javascript
import { generateSystemPrompt } from '../../functions/_lib/generate-prompt.js';
```

Para:

```javascript
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
```

Remover o comentário `IMPORT PROVISÓRIO — Task 8 muda pra ../../functions/_lib/prompts/index.js`.

- [ ] **Step 4: Rodar snapshot tests — devem passar com dispatcher novo (bit-identical)**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
node --test tests/prompts/snapshot.test.mjs
```

Expected: 3 tests pass. Snapshots lidos da pasta match o output do dispatcher novo.

Se falhar: o output do dispatcher difere do legado. NÃO use UPDATE_SNAPSHOTS=1 — investigar a divergência primeiro (diff entre novo output e snapshot). Provável causa: algum bloco `_shared/*` divergiu do original ou ordem em `generate.js`.

- [ ] **Step 5: Verificar que nada mais importa de `generate-prompt.js`**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
grep -r "generate-prompt" --include="*.js" --include="*.mjs" functions/ tests/ scripts/ 2>/dev/null
```

Expected: 0 resultados (ou só o próprio arquivo em `functions/_lib/generate-prompt.js` que ainda existe).

- [ ] **Step 6: Deletar `generate-prompt.js` legado**

```bash
rm /Users/brazilianhustler/Documents/inkflow-saas/functions/_lib/generate-prompt.js
```

- [ ] **Step 7: Rodar snapshot tests mais uma vez**

```bash
node --test tests/prompts/snapshot.test.mjs
```

Expected: 3 tests pass (já não depende do arquivo deletado — o import provisório foi removido no Step 3).

- [ ] **Step 8: Rodar a bateria de testes existente pra garantir que nada quebrou**

```bash
node --test tests/telegram.test.mjs tests/trial-helpers.test.mjs tests/update-tenant-validations.test.mjs tests/prompts/snapshot.test.mjs
```

Expected: todos verdes.

- [ ] **Step 9: Commit**

```bash
git add functions/api/tools/prompt.js functions/api/tools/simular-conversa.js tests/prompts/snapshot.test.mjs
git rm functions/_lib/generate-prompt.js
git commit -m "$(cat <<'EOF'
refactor(prompts): consumers apontam pro dispatcher novo; remove legado

- functions/api/tools/prompt.js e simular-conversa.js importam de
  _lib/prompts/index.js.
- Snapshot tests migram pro import novo.
- Deleta functions/_lib/generate-prompt.js — código migrou integral pra
  prompts/_shared/ + prompts/{faixa,exato}/.

Output bit-identical ao legado — verificado pelos snapshots Faixa e Exato.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Contract tests por modo

> **Objetivo:** Cada modo declara tokens que **devem** estar no prompt (`must_contain`) e tokens proibidos (`must_not_contain`), além de um teto de tamanho. No PR 1 os contratos de Faixa e Exato são idênticos (já que os prompts também são). Em PRs futuros cada um diverge.

**Files:**
- Create: `tests/prompts/contracts/faixa.js`
- Create: `tests/prompts/contracts/exato.js`
- Create: `tests/prompts/contracts.test.mjs`

- [ ] **Step 1: Criar contrato Faixa**

Conteúdo de `tests/prompts/contracts/faixa.js`:

```javascript
// Contrato do prompt Faixa. Consumido por contracts.test.mjs.

export const contratoFaixa = {
  modo: 'faixa',
  must_contain: [
    '§0 CHECKLIST',
    '§1 IDENTIDADE',
    '§2 TOM',
    '§3 FLUXO',
    '§4 REGRAS',
    '§5 CONTEXTO',
    '§7 EXEMPLOS',
    'calcular_orcamento',
    'acionar_handoff',
    'consultar_horarios_livres',
    'gerar_link_sinal',
    'reservar_horario',
  ],
  must_not_contain: [
    // Metainstruções que não devem vazar pro LLM
    '{{',
    '}}',
    'TODO',
    'FIXME',
    // No PR 1 ainda não há tokens Coleta-specific a banir; esse array
    // cresce no PR 2 quando faixa realmente se diferencia de coleta.
  ],
  max_tokens: 8000,  // aproximação: 1 token ≈ 4 chars em pt-br. 8000 tokens ≈ 32k chars.
};
```

- [ ] **Step 2: Criar contrato Exato**

Conteúdo de `tests/prompts/contracts/exato.js`:

```javascript
// Contrato do prompt Exato. No PR 1 é idêntico ao Faixa (prompts idênticos).
// PR 2 vai diferenciar.

export const contratoExato = {
  modo: 'exato',
  must_contain: [
    '§0 CHECKLIST',
    '§1 IDENTIDADE',
    '§2 TOM',
    '§3 FLUXO',
    '§4 REGRAS',
    '§5 CONTEXTO',
    '§7 EXEMPLOS',
    'calcular_orcamento',
    'acionar_handoff',
    'consultar_horarios_livres',
    'gerar_link_sinal',
    'reservar_horario',
  ],
  must_not_contain: [
    '{{',
    '}}',
    'TODO',
    'FIXME',
  ],
  max_tokens: 8000,
};
```

- [ ] **Step 3: Criar runner `contracts.test.mjs`**

Conteúdo:

```javascript
// Valida cada contrato contra o prompt gerado pro modo correspondente.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import { contratoFaixa } from './contracts/faixa.js';
import { contratoExato } from './contracts/exato.js';
import {
  tenantCanonicoFaixa,
  tenantCanonicoExato,
  conversaVazia,
  clientContextPrimeiroContato,
} from './fixtures/tenant-canonico.js';

// Aproximação simples: ~4 chars por token (OpenAI BPE pt-br fica em 3-4).
// Só usamos pra teto, não pra métrica fina.
function estimarTokens(str) {
  return Math.ceil(str.length / 4);
}

function validarContrato(prompt, contrato) {
  for (const token of contrato.must_contain) {
    assert.ok(
      prompt.includes(token),
      `prompt modo ${contrato.modo} deveria conter "${token}" mas não contém`,
    );
  }
  for (const token of contrato.must_not_contain) {
    assert.ok(
      !prompt.includes(token),
      `prompt modo ${contrato.modo} contém "${token}" mas deveria não conter`,
    );
  }
  const tokens = estimarTokens(prompt);
  assert.ok(
    tokens <= contrato.max_tokens,
    `prompt modo ${contrato.modo} excedeu max_tokens: ${tokens} > ${contrato.max_tokens}`,
  );
}

test('contrato modo faixa — tenant canônico', () => {
  const prompt = generateSystemPrompt(tenantCanonicoFaixa, conversaVazia, clientContextPrimeiroContato);
  validarContrato(prompt, contratoFaixa);
});

test('contrato modo exato — tenant canônico', () => {
  const prompt = generateSystemPrompt(tenantCanonicoExato, conversaVazia, clientContextPrimeiroContato);
  validarContrato(prompt, contratoExato);
});
```

- [ ] **Step 4: Rodar contracts**

```bash
node --test tests/prompts/contracts.test.mjs
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/prompts/contracts/ tests/prompts/contracts.test.mjs
git commit -m "$(cat <<'EOF'
test(prompts): contratos must_contain/must_not_contain/max_tokens por modo

PR 1 — Faixa e Exato têm contratos idênticos já que os prompts são idênticos.
Diferenciação entra no PR 2. Teto de 8000 tokens com aproximação 1:4 chars.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Invariants cross-mode

**Files:**
- Create: `tests/prompts/invariants.test.mjs`

- [ ] **Step 1: Criar teste de invariantes**

Conteúdo de `tests/prompts/invariants.test.mjs`:

```javascript
// Invariantes que TODO modo deve respeitar, não importa o tenant.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import {
  tenantCanonicoFaixa,
  tenantCanonicoExato,
  conversaVazia,
  clientContextPrimeiroContato,
} from './fixtures/tenant-canonico.js';

const MODOS_SUPORTADOS = [
  { nome: 'faixa', tenant: tenantCanonicoFaixa },
  { nome: 'exato', tenant: tenantCanonicoExato },
];

for (const { nome, tenant } of MODOS_SUPORTADOS) {
  test(`invariante [${nome}]: prompt tem identidade, checklist, tom, contexto, regras, fluxo`, () => {
    const p = generateSystemPrompt(tenant, conversaVazia, clientContextPrimeiroContato);
    assert.ok(p.includes('§0 CHECKLIST'), 'falta §0');
    assert.ok(p.includes('§1 IDENTIDADE'), 'falta §1');
    assert.ok(p.includes('§2 TOM'), 'falta §2');
    assert.ok(p.includes('§3 FLUXO'), 'falta §3');
    assert.ok(p.includes('§4 REGRAS'), 'falta §4');
    assert.ok(p.includes('§5 CONTEXTO'), 'falta §5');
  });

  test(`invariante [${nome}]: prompt não contém metainstruções placeholder`, () => {
    const p = generateSystemPrompt(tenant, conversaVazia, clientContextPrimeiroContato);
    assert.ok(!p.includes('{{'), 'contém {{');
    assert.ok(!p.includes('}}'), 'contém }}');
    assert.ok(!/\bTODO\b/.test(p), 'contém TODO');
    assert.ok(!/\bFIXME\b/.test(p), 'contém FIXME');
  });

  test(`invariante [${nome}]: nome do agente aparece no prompt (identidade)`, () => {
    const p = generateSystemPrompt(tenant, conversaVazia, clientContextPrimeiroContato);
    assert.ok(p.includes(tenant.nome_agente), `nome_agente "${tenant.nome_agente}" não aparece`);
    assert.ok(p.includes(tenant.nome_estudio), `nome_estudio "${tenant.nome_estudio}" não aparece`);
  });

  test(`invariante [${nome}]: gatilhos de handoff aparecem literalmente em §4`, () => {
    const p = generateSystemPrompt(tenant, conversaVazia, clientContextPrimeiroContato);
    for (const gat of tenant.gatilhos_handoff) {
      assert.ok(p.includes(gat), `gatilho "${gat}" não aparece no prompt`);
    }
  });
}

test('invariante cross-mode: Faixa e Exato produzem prompts idênticos no PR 1', () => {
  // PR 1 não diferencia modos. Em PR 2 este teste passa a permitir diferenças
  // específicas (ex: few-shots distintos) e é reescrito pra validar só os
  // shared blocks.
  const pFaixa = generateSystemPrompt(tenantCanonicoFaixa, conversaVazia, clientContextPrimeiroContato);
  const pExato = generateSystemPrompt(tenantCanonicoExato, conversaVazia, clientContextPrimeiroContato);
  assert.equal(pFaixa, pExato);
});
```

- [ ] **Step 2: Rodar invariants**

```bash
node --test tests/prompts/invariants.test.mjs
```

Expected: 9 tests pass (4 por modo × 2 modos + 1 cross-mode).

- [ ] **Step 3: Commit**

```bash
git add tests/prompts/invariants.test.mjs
git commit -m "$(cat <<'EOF'
test(prompts): invariantes cross-mode (seções obrigatórias, no placeholders)

Valida que todo modo contém §0-§5, não tem {{,}},TODO,FIXME, traz
nome_agente/nome_estudio/gatilhos literalmente, e no PR 1 Faixa==Exato.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Contamination linter

> **Objetivo:** Smoke test que valida que tenants com FAQ/few-shots sujos geram prompts com o ruído visível. No PR 1 esse linter apenas documenta o estado atual (valores do FAQ VAZAM pro prompt — isso vai ser resolvido no PR 2 pela regra R3 do modo Coleta). Aqui registramos o comportamento pra detectar regressão.

**Files:**
- Create: `tests/prompts/contamination.test.mjs`

- [ ] **Step 1: Criar teste de contaminação**

Conteúdo de `tests/prompts/contamination.test.mjs`:

```javascript
// Contamination linter — usa tenant com FAQ/few-shots sujos pra validar
// como cada modo lida com valores monetários vindos do tenant.
//
// PR 1: Faixa e Exato DEIXAM passar o conteúdo sujo (comportamento atual;
// é um prompt de vendas que pode até falar em R$ porque vai calcular valor
// no futuro). O teste documenta isso.
//
// PR 2: modo coleta_info deve bloquear. Esse mesmo arquivo ganha um assert
// negativo pra coleta_info. Mantemos a estrutura simétrica pra facilitar.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import { tenantContaminado } from './fixtures/tenant-contaminado.js';
import { conversaVazia, clientContextPrimeiroContato } from './fixtures/tenant-canonico.js';

test('contaminação [faixa]: FAQ com R$ aparece no prompt (comportamento atual, OK)', () => {
  // Faixa usa FAQ como-é. Se mudar, algo no shared/faq.js regrediu.
  const tenant = { ...tenantContaminado, config_precificacao: { modo: 'faixa' } };
  const p = generateSystemPrompt(tenant, conversaVazia, clientContextPrimeiroContato);
  assert.ok(p.includes('R$ 300'), 'FAQ contaminado deveria aparecer no prompt Faixa');
  assert.ok(p.includes('R$ 500'), 'few-shot contaminado deveria aparecer no prompt Faixa');
});

test('contaminação [exato]: FAQ com R$ aparece no prompt (idem Faixa no PR 1)', () => {
  const tenant = { ...tenantContaminado, config_precificacao: { modo: 'exato' } };
  const p = generateSystemPrompt(tenant, conversaVazia, clientContextPrimeiroContato);
  assert.ok(p.includes('R$ 300'));
  assert.ok(p.includes('R$ 500'));
});

// No PR 2, adicionar:
// test('contaminação [coleta_info]: R$ bloqueado pela regra R3', () => {
//   const tenant = { ...tenantContaminado, config_precificacao: { modo: 'coleta', coleta_submode: 'puro' } };
//   const p = generateSystemPrompt(tenant, null, { is_first_contact: true });
//   assert.ok(p.includes('NÃO repete nem apresenta qualquer valor monetário'));
//   // Asserção importante: mesmo que FAQ mencione R$, o prompt tem regra de topo
//   // que instrui LLM a suprimir. Teste não-determinístico do output do LLM
//   // fica pra evals.
// });
```

- [ ] **Step 2: Rodar contamination**

```bash
node --test tests/prompts/contamination.test.mjs
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/prompts/contamination.test.mjs
git commit -m "$(cat <<'EOF'
test(prompts): contamination linter — documenta comportamento atual

Tenant com FAQ suja (R$/sinal/pix) é renderizado tal qual em Faixa/Exato
no PR 1 (esperado — são modos de vendas que operam com valor). Teste
serve de base pra PR 2 adicionar assert negativo pro modo coleta_info.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Pre-commit hook + CI workflow

> **Sem package.json:** o repo não usa npm/husky. Vamos usar git hooks nativos via `.githooks/` versionado + um README que avisa o dev a rodar `git config core.hooksPath .githooks` uma vez na clonagem. Em paralelo, CI garante que um PR nunca passa com testes vermelhos mesmo se alguém esqueceu o hook local.

**Files:**
- Create: `.githooks/pre-commit`
- Create: `.githooks/README.md`
- Create: `.github/workflows/test.yml`

- [ ] **Step 1: Criar script `.githooks/pre-commit`**

Conteúdo (arquivo executável):

```bash
#!/usr/bin/env bash
# Pre-commit hook InkFlow — roda bateria mínima de testes.
# Instalação (uma vez por clone): git config core.hooksPath .githooks

set -e

# Só roda se o commit toca arquivos relacionados a prompts ou validações.
CHANGED=$(git diff --cached --name-only --diff-filter=ACM)

NEEDS_TESTS=0
for f in $CHANGED; do
  case "$f" in
    functions/_lib/prompts/*|functions/_lib/generate-prompt.js|functions/api/_validate-config-precificacao.js|functions/api/update-tenant.js|tests/prompts/*|tests/update-tenant-validations.test.mjs)
      NEEDS_TESTS=1
      ;;
  esac
done

if [ $NEEDS_TESTS -eq 0 ]; then
  echo "pre-commit: nenhuma mudança relevante a testar. OK."
  exit 0
fi

echo "pre-commit: rodando testes de prompts + validações..."
node --test \
  tests/prompts/snapshot.test.mjs \
  tests/prompts/contracts.test.mjs \
  tests/prompts/invariants.test.mjs \
  tests/prompts/contamination.test.mjs \
  tests/update-tenant-validations.test.mjs
```

- [ ] **Step 2: Tornar o hook executável**

```bash
chmod +x /Users/brazilianhustler/Documents/inkflow-saas/.githooks/pre-commit
```

- [ ] **Step 3: Criar `.githooks/README.md`**

Conteúdo:

```markdown
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
```

- [ ] **Step 4: Criar CI workflow `.github/workflows/test.yml`**

Conteúdo:

```yaml
name: Tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    name: node --test (prompts + validations)
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run test suites
        run: |
          node --test \
            tests/telegram.test.mjs \
            tests/trial-helpers.test.mjs \
            tests/update-tenant-validations.test.mjs \
            tests/prompts/snapshot.test.mjs \
            tests/prompts/contracts.test.mjs \
            tests/prompts/invariants.test.mjs \
            tests/prompts/contamination.test.mjs
```

- [ ] **Step 5: Testar o hook localmente simulando um commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git config core.hooksPath .githooks
# Cria um staged change em arquivo relevante (dummy touch)
echo "" >> functions/_lib/prompts/_shared/faq.js
git add functions/_lib/prompts/_shared/faq.js
.githooks/pre-commit
git reset HEAD functions/_lib/prompts/_shared/faq.js
git checkout -- functions/_lib/prompts/_shared/faq.js
```

Expected: hook imprime `pre-commit: rodando testes...` e todos os 5 arquivos de teste passam.

- [ ] **Step 6: Commit hook + CI**

```bash
git add .githooks/pre-commit .githooks/README.md .github/workflows/test.yml
git commit -m "$(cat <<'EOF'
ci(tests): pre-commit hook + GitHub Actions rodando bateria de prompts

- .githooks/pre-commit só roda se a mudança toca prompts/update-tenant
  (usa core.hooksPath — dev ativa com 'git config core.hooksPath .githooks').
- test.yml roda em push/PR pra main a suíte completa (telegram + trial +
  validations + prompts).
- Deploy workflow existente não muda.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13 (verificação final): Bateria completa + push

- [ ] **Step 1: Rodar TODA a suíte de testes**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
node --test \
  tests/telegram.test.mjs \
  tests/trial-helpers.test.mjs \
  tests/update-tenant-validations.test.mjs \
  tests/prompts/snapshot.test.mjs \
  tests/prompts/contracts.test.mjs \
  tests/prompts/invariants.test.mjs \
  tests/prompts/contamination.test.mjs
```

Expected: tudo verde. Conte os testes — espera ~35+ (19 validations + 3 snapshot + 2 contracts + 9 invariants + 2 contamination + testes pré-existentes de telegram/trial).

- [ ] **Step 2: Grep por imports/refs ao arquivo deletado**

```bash
grep -r "generate-prompt" --include="*.js" --include="*.mjs" --include="*.html" /Users/brazilianhustler/Documents/inkflow-saas/ 2>/dev/null | grep -v node_modules | grep -v docs/
```

Expected: 0 matches fora de `docs/`.

- [ ] **Step 3: Revisar git log do PR**

```bash
git log --oneline origin/main..HEAD
```

Expected: 11-12 commits bem nomeados (`feat(db)`, `feat(update-tenant)`, `test(prompts)`, `refactor(prompts)`, `feat(prompts)`, `ci(tests)`), todos com Co-Authored-By do Claude Opus 4.7.

- [ ] **Step 4: Confirmar com user se pode abrir PR**

Apresentar ao user:

> "PR 1 pronto. 11-12 commits, todos os testes verdes, zero mudança de comportamento (snapshots bit-identical confirmados). Posso (a) abrir PR pra `main`, (b) dar push na branch atual sem PR, ou (c) pausar aqui pra você revisar localmente primeiro?"

Aguardar resposta do user antes de proceder.

- [ ] **Step 5: Abrir PR (se user aprovar opção a)**

```bash
git push -u origin HEAD
gh pr create --title "feat(prompts): Modo Coleta PR 1 — refactor + migration + tier 1 tests" --body "$(cat <<'EOF'
## Summary
- Migração SQL: `tenants.fewshots_por_modo` + `conversas.estado_agente` + índice parcial.
- Refatora `functions/_lib/generate-prompt.js` (556 linhas monolítico) em `functions/_lib/prompts/_shared/` + `{faixa,exato}/` atrás de um dispatcher `prompts/index.js`.
- **Zero mudança de comportamento em prod:** snapshots bit-identical validam que o output Faixa/Exato é idêntico ao legado pros mesmos tenants.
- Validações novas em `update-tenant.js`: aceita `fewshots_por_modo` e valida `config_precificacao.{modo,coleta_submode,trigger_handoff}` com feature flag `ENABLE_COLETA_MODE` barrando `modo=coleta` até PR 4.
- Tier 1 de higiene: snapshots, contracts, invariants, contamination linter, pre-commit hook (`.githooks/`), CI workflow (`.github/workflows/test.yml`).

Base pros PRs 2-4 de modo Coleta. Spec: `docs/superpowers/specs/2026-04-22-modo-coleta-design.md`. Plan: `docs/superpowers/plans/2026-04-22-modo-coleta-pr1-refactor.md`.

## Test plan
- [x] `node --test tests/prompts/snapshot.test.mjs` — 3 testes (faixa, exato, cross-mode invariant)
- [x] `node --test tests/prompts/contracts.test.mjs` — 2 testes (must_contain/must_not_contain/max_tokens)
- [x] `node --test tests/prompts/invariants.test.mjs` — 9 testes (seções §0-§5, no placeholders, nome agente, gatilhos, faixa==exato)
- [x] `node --test tests/prompts/contamination.test.mjs` — 2 testes (fixture contaminado documenta pass-through atual)
- [x] `node --test tests/update-tenant-validations.test.mjs` — 19 testes do validador puro
- [x] `node --test tests/telegram.test.mjs tests/trial-helpers.test.mjs` — suítes pré-existentes continuam verdes
- [x] CI workflow `.github/workflows/test.yml` roda a bateria completa
- [x] Pre-commit hook `.githooks/pre-commit` roda só quando muda prompts/update-tenant

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes

**Spec coverage (PR 1, secções "Ordem de implementação" e "PR 1 — Refactor-only"):**

- [x] 1.1 Migração SQL (fewshots_por_modo, estado_agente + índice parcial) → Task 1
- [x] 1.2 Validações em update-tenant.js → Task 2
- [x] 1.3 Criar functions/_lib/prompts/ com _shared/, faixa/, exato/ → Tasks 4-6
- [x] 1.4 Dispatcher prompts/index.js comportamento idêntico → Task 7
- [x] 1.5 Substituir imports em prompt.js e simular-conversa.js → Task 8
- [x] 1.6 Testes Tier 1: snapshots, contratos, invariantes, fixtures canonico+contaminado, linter → Tasks 3, 9, 10, 11
- [x] 1.7 Pre-commit hook + CI → Task 12

**Decisões conscientes sobre "pre-commit hook (Husky)":** spec menciona Husky, mas o repo não tem package.json. Substituímos por `.githooks/pre-commit` + `git config core.hooksPath`. Mesma semântica, sem dependência npm.

**Feature flag:** validações em update-tenant.js leem `env.ENABLE_COLETA_MODE`. Produção deploya com flag OFF por default — modo=coleta retornado como erro 400 até flag ligar no PR 4.

**Golden-master risk:** Task 3 captura baseline antes de Task 4-8 mexer em nada. Se refactor divergir, snapshot test falha — bloqueia o commit.

---

**Plano salvo em `docs/superpowers/plans/2026-04-22-modo-coleta-pr1-refactor.md`.**

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-22-modo-coleta-pr1-refactor.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
