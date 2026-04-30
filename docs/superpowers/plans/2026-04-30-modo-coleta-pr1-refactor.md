# Modo Coleta — PR 1: Refactor zero-mudança Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quebrar o monolito `functions/_lib/generate-prompt.js` (556 linhas) em estrutura modular `prompts/{_shared,faixa,exato}/` com dispatcher equivalente, adicionar schema migration pra colunas de Coleta (sem usar ainda), e cravar Tier 1 de higiene de prompts (snapshots + contracts + invariants + linter de contaminação) — tudo com **zero mudança de comportamento em prod**.

**Architecture:** Refactor mecânico: cada função existente vira um módulo isolado. Snapshot do output ATUAL é gerado ANTES de mover qualquer código (baseline). Cada movimentação re-roda o snapshot — bate byte-a-byte ou volta. Dispatcher `prompts/index.js` substitui `generate-prompt.js` mantendo assinatura pública `generateSystemPrompt(tenant, conversa, ctx)`. Faixa e Exato no MVP são **idênticos** (cópia bit-a-bit) — diferenciação real virá em PRs futuros se necessário; hoje a diferença Faixa/Exato vive no branching `valor_tipo` dentro de `§3.3 fluxo` que se preserva em ambos.

**Tech Stack:** Node.js (sem package.json no repo principal — usar `node:test` runner nativo, mesmo padrão dos auditores em `tests/audit-*.test.mjs`). Cloudflare Pages Functions ESM. Supabase migrations SQL. GitHub Actions pra CI.

**Decisão escopo PR 1.2 (validações):** Spec original diz "aceitar `modo='coleta'`" no PR 1.2, mas o feature flag `ENABLE_COLETA_MODE` que protege esse valor só nasce em PR 2.8. Pra evitar silent break (modo aceito sem dispatcher path = prompts quebrando), PR 1 aceita apenas os **schema fields novos** (`coleta_submode`, `trigger_handoff`, `fewshots_por_modo`) — `MODOS_VALIDOS` continua `['faixa', 'exato']` até PR 2 wirar o flag. Validação rejeita `modo='coleta'` com erro claro.

**Decisão sobre `generate-prompt.js` antigo:** Após dispatcher novo estar wired e snapshot batendo, o arquivo antigo é **deletado** (não re-export shim). Os 2 únicos consumers (`prompt.js`, `simular-conversa.js`) são atualizados no mesmo commit pra apontar pro `prompts/index.js`. Sem backwards-compat hack.

---

## Files Created/Modified

**Created:**
- `supabase/migrations/2026-04-30-modo-coleta-prep.sql` — schema migration (3 colunas + 1 index)
- `functions/_lib/prompts/index.js` — dispatcher
- `functions/_lib/prompts/_shared/identidade.js`
- `functions/_lib/prompts/_shared/checklist-critico.js`
- `functions/_lib/prompts/_shared/tom.js`
- `functions/_lib/prompts/_shared/contexto.js`
- `functions/_lib/prompts/_shared/faq.js`
- `functions/_lib/prompts/_shared/helpers.js` — utilitários compartilhados (`quoteList`, `GATILHOS_DEFAULT`, `EMOJI_RULES`, `TOM_DESC`)
- `functions/_lib/prompts/faixa/generate.js`
- `functions/_lib/prompts/faixa/fluxo.js`
- `functions/_lib/prompts/faixa/regras.js`
- `functions/_lib/prompts/faixa/few-shot.js`
- `functions/_lib/prompts/faixa/few-shot-tenant.js`
- `functions/_lib/prompts/exato/generate.js`
- `functions/_lib/prompts/exato/fluxo.js`
- `functions/_lib/prompts/exato/regras.js`
- `functions/_lib/prompts/exato/few-shot.js`
- `functions/_lib/prompts/exato/few-shot-tenant.js`
- `tests/prompts/fixtures/tenant-canonico.mjs` — tenant + conversa + clientContext "padrão"
- `tests/prompts/fixtures/tenant-contaminado.mjs` — fixture suja com FAQ/few-shots mencionando preço
- `tests/prompts/snapshots/faixa.txt` — snapshot baseline
- `tests/prompts/snapshots/exato.txt` — snapshot baseline
- `tests/prompts/contracts/faixa.mjs` — `must_contain` / `must_not_contain` / `max_tokens`
- `tests/prompts/contracts/exato.mjs`
- `tests/prompts/snapshot.test.mjs` — verifica saída == snapshot
- `tests/prompts/contracts.test.mjs` — verifica contratos por modo
- `tests/prompts/invariants.test.mjs` — verifica invariantes cross-mode
- `tests/prompts/contamination.test.mjs` — fixture suja não vaza valores em modos sensíveis (no PR 1, smoke test sobre Faixa/Exato; expandido em PR 2 pra Coleta)
- `scripts/test-prompts.sh` — runner local
- `scripts/update-prompt-snapshots.sh` — regenera snapshots quando mudança é intencional
- `.github/workflows/prompts-ci.yml` — CI roda tests em PRs tocando `prompts/` ou `tests/prompts/`

**Modified:**
- `functions/api/update-tenant.js` — adiciona validação dos novos campos schema, rejeita `modo='coleta'` ainda
- `functions/api/tools/prompt.js:9` — import `from '../../_lib/prompts/index.js'`
- `functions/api/tools/simular-conversa.js:18` — import `from '../../_lib/prompts/index.js'`
- `CHANGELOG.md` — entry pra PR 1

**Deleted:**
- `functions/_lib/generate-prompt.js` (após dispatcher wired e snapshot validar — última task)

---

## Bite-sized tasks

### Task 1: Schema migration — colunas pra Coleta + index parcial

**Files:**
- Create: `supabase/migrations/2026-04-30-modo-coleta-prep.sql`

- [ ] **Step 1: Verificar diretório de migrations**

Run: `ls /Users/brazilianhustler/Documents/inkflow-saas/supabase/`
Expected: lista contendo `migrations/` (ou similar). Se NÃO existir, criar com `mkdir -p supabase/migrations`.

- [ ] **Step 2: Criar migration SQL**

Conteúdo de `supabase/migrations/2026-04-30-modo-coleta-prep.sql`:

```sql
-- ── Modo Coleta — Schema preparation (PR 1) ─────────────────────────────────
-- Adiciona colunas pra suportar modo Coleta no PR 2. Defaults garantem
-- zero breaking pros tenants existentes. As colunas são populadas só quando
-- o tenant migrar pra modo='coleta' (não aceito ainda em PR 1).

-- 1. Few-shots escopadas por modo (top-level, fora de config_precificacao
--    — separação: config = regras de preço, fewshots = conteúdo de treino)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS fewshots_por_modo JSONB
  NOT NULL DEFAULT '{"faixa":[],"exato":[],"coleta_info":[],"coleta_agendamento":[]}'::jsonb;

-- 2. Estado da máquina de conversa (Coleta-Reentrada usa transições;
--    Faixa/Exato ignoram esse campo no MVP — continua 'ativo' default)
ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS estado_agente TEXT
  NOT NULL DEFAULT 'ativo';

-- 3. Index parcial pros estados não-ativos (queries futuras tipo
--    "todas conversas em handoff" não precisam scan completo)
CREATE INDEX IF NOT EXISTS idx_conversas_estado_agente
  ON conversas(estado_agente)
  WHERE estado_agente != 'ativo';

-- NOTA: campos `modo`, `coleta_submode`, `trigger_handoff` ficam dentro
-- do JSONB tenants.config_precificacao (sem ALTER, só código). Validação
-- desses campos é feita em functions/api/update-tenant.js (Task 2).
```

- [ ] **Step 3: Validar SQL parseable**

Run: `cat supabase/migrations/2026-04-30-modo-coleta-prep.sql | head -30`
Expected: arquivo aparece com 3 statements ALTER + 1 CREATE INDEX, sem erros visuais.

- [ ] **Step 4: Aplicar migration no Supabase**

A aplicação é feita pelo founder via Supabase Dashboard SQL Editor (ou MCP Supabase se ativado). Comando pra executar no Dashboard:

```sql
-- Cole o conteúdo de supabase/migrations/2026-04-30-modo-coleta-prep.sql
```

Verificar com:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name IN ('tenants', 'conversas')
  AND column_name IN ('fewshots_por_modo', 'estado_agente');
```

Expected: 2 rows retornadas.

```sql
SELECT indexname FROM pg_indexes
WHERE tablename='conversas' AND indexname='idx_conversas_estado_agente';
```

Expected: 1 row.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-04-30-modo-coleta-prep.sql
git commit -m "$(cat <<'EOF'
feat(modo-coleta): schema migration pra preparar PR 2

Adiciona tenants.fewshots_por_modo (JSONB) + conversas.estado_agente (TEXT)
+ index parcial. Defaults garantem zero breaking pros tenants existentes.
Aplicado no Supabase via Dashboard manualmente.

PR 1 task 1/12 do Modo Coleta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Validações em update-tenant.js — schema fields novos (NÃO modo='coleta' ainda)

**Files:**
- Modify: `functions/api/update-tenant.js:25-42` (ALLOWED_FIELDS) e `:53-82` (validateFieldTypes)
- Test: `tests/update-tenant-validation.test.mjs` (novo)

- [ ] **Step 1: Escrever test que falha**

Criar `tests/update-tenant-validation.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Importar a função interna validateFieldTypes via dynamic import depois
// que ela for exportada. Por enquanto, declarar shape esperado.

test('validateFieldTypes — fewshots_por_modo aceita objeto com 4 chaves esperadas', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const ok = validateFieldTypes({
    fewshots_por_modo: { faixa: [], exato: [], coleta_info: [], coleta_agendamento: [] }
  });
  assert.equal(ok.ok, true);
});

test('validateFieldTypes — fewshots_por_modo rejeita array', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ fewshots_por_modo: [] });
  assert.equal(r.ok, false);
  assert.match(r.erro, /fewshots_por_modo/);
});

test('validateFieldTypes — fewshots_por_modo rejeita chave desconhecida', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ fewshots_por_modo: { faixa: [], inventado: [] } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /chave/i);
});

test('validateConfigPrecificacao — modo=coleta REJEITADO em PR 1 (flag virá em PR 2)', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'coleta' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /modo coleta ainda nao disponivel/i);
});

test('validateConfigPrecificacao — modo=faixa OK', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'faixa' });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — modo invalido rejeitado', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'inventado' });
  assert.equal(r.ok, false);
});

test('validateConfigPrecificacao — coleta_submode aceito como schema (sem modo=coleta ainda)', async () => {
  // Campos forward-compat: persistem mas só ativam em PR 2.
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'faixa', coleta_submode: 'puro' });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — trigger_handoff length range 2-50', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  assert.equal(validateConfigPrecificacao({ modo: 'faixa', trigger_handoff: 'X' }).ok, false);
  assert.equal(validateConfigPrecificacao({ modo: 'faixa', trigger_handoff: 'A'.repeat(51) }).ok, false);
  assert.equal(validateConfigPrecificacao({ modo: 'faixa', trigger_handoff: 'Lina, assume' }).ok, true);
});
```

- [ ] **Step 2: Rodar test pra confirmar falha**

Run: `node --test tests/update-tenant-validation.test.mjs`
Expected: FAIL — funções não exportadas, ou validação não existe.

- [ ] **Step 3: Editar `functions/api/update-tenant.js`**

Adicionar `'fewshots_por_modo'` no `ALLOWED_FIELDS` (após linha 41, antes do fechamento do Set):

```javascript
  'modo_atendimento',       // TEXT: individual | tatuador_dono | recepcionista | artista_slot
  'fewshots_por_modo',      // JSONB: { faixa: [...], exato: [...], coleta_info: [...], coleta_agendamento: [...] } — preparação Modo Coleta PR 1
]);
```

Adicionar constantes acima de `validateFieldTypes`:

```javascript
const MODOS_VALIDOS = ['faixa', 'exato']; // 'coleta' adicionado em PR 2 quando ENABLE_COLETA_MODE wirar
const SUBMODES_COLETA = ['puro', 'reentrada'];
const FEWSHOT_KEYS_VALIDAS = ['faixa', 'exato', 'coleta_info', 'coleta_agendamento'];

// Valida o sub-objeto config_precificacao (campos relevantes pra Modo Coleta).
// Retorna { ok: boolean, erro?: string }.
export function validateConfigPrecificacao(cfg) {
  if (!cfg || typeof cfg !== 'object') return { ok: true }; // campo não enviado = sem validação
  if (cfg.modo !== undefined) {
    if (cfg.modo === 'coleta') {
      return { ok: false, erro: 'modo coleta ainda nao disponivel (feature flag chega em PR 2)' };
    }
    if (!MODOS_VALIDOS.includes(cfg.modo)) {
      return { ok: false, erro: `modo deve ser um de: ${MODOS_VALIDOS.join(', ')}` };
    }
  }
  if (cfg.coleta_submode !== undefined && !SUBMODES_COLETA.includes(cfg.coleta_submode)) {
    return { ok: false, erro: `coleta_submode deve ser um de: ${SUBMODES_COLETA.join(', ')}` };
  }
  if (cfg.trigger_handoff !== undefined) {
    if (typeof cfg.trigger_handoff !== 'string') {
      return { ok: false, erro: 'trigger_handoff deve ser string' };
    }
    if (cfg.trigger_handoff.length < 2 || cfg.trigger_handoff.length > 50) {
      return { ok: false, erro: 'trigger_handoff deve ter entre 2 e 50 caracteres' };
    }
  }
  return { ok: true };
}
```

Mudar `function validateFieldTypes(fields)` pra `export function validateFieldTypes(fields)` (linha 54).

Dentro de `validateFieldTypes`, adicionar bloco antes do `return { ok: true }`:

```javascript
  if (fields.fewshots_por_modo !== undefined) {
    const v = fields.fewshots_por_modo;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      return { ok: false, erro: 'fewshots_por_modo deve ser objeto' };
    }
    const keys = Object.keys(v);
    const invalidKey = keys.find(k => !FEWSHOT_KEYS_VALIDAS.includes(k));
    if (invalidKey) {
      return { ok: false, erro: `fewshots_por_modo: chave invalida "${invalidKey}" (validas: ${FEWSHOT_KEYS_VALIDAS.join(', ')})` };
    }
    for (const k of keys) {
      if (!Array.isArray(v[k])) {
        return { ok: false, erro: `fewshots_por_modo.${k} deve ser array` };
      }
    }
  }
  if (fields.config_precificacao !== undefined) {
    const r = validateConfigPrecificacao(fields.config_precificacao);
    if (!r.ok) return r;
  }
  return { ok: true };
```

- [ ] **Step 4: Rodar test pra confirmar passa**

Run: `node --test tests/update-tenant-validation.test.mjs`
Expected: PASS — 8 passing.

- [ ] **Step 5: Smoke regressão — outros tests não quebram**

Run: `node --test tests/audit-state.test.mjs tests/trial-helpers.test.mjs`
Expected: PASS — não tocamos nada que esses dependem.

- [ ] **Step 6: Commit**

```bash
git add functions/api/update-tenant.js tests/update-tenant-validation.test.mjs
git commit -m "$(cat <<'EOF'
feat(modo-coleta): aceitar schema fields novos em update-tenant

Adiciona fewshots_por_modo (JSONB com 4 chaves esperadas), valida
coleta_submode e trigger_handoff dentro de config_precificacao.
modo='coleta' fica REJEITADO ate PR 2 (quando ENABLE_COLETA_MODE wirar).

PR 1 task 2/12 do Modo Coleta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Setup test infra — fixtures + helpers

**Files:**
- Create: `tests/prompts/fixtures/tenant-canonico.mjs`
- Create: `tests/prompts/fixtures/tenant-contaminado.mjs`
- Create: `tests/prompts/helpers.mjs`

- [ ] **Step 1: Criar fixture canônica**

`tests/prompts/fixtures/tenant-canonico.mjs`:

```javascript
// Tenant canônico — exercita TODOS os ramos do generator atual.
// Mudanças aqui invalidam snapshots — atualize conscientemente.
export const TENANT_CANONICO = {
  id: '00000000-0000-0000-0000-000000000001',
  nome_agente: 'Lina',
  nome_estudio: 'Estudio Teste',
  plano: 'individual',
  faq_texto: 'Q: Tem estacionamento?\nA: Sim, gratuito ao lado.',
  gatilhos_handoff: ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'],
  sinal_percentual: 30,
  horario_funcionamento: { 'seg-sex': '10:00-19:00', 'sab': '10:00-15:00' },
  config_agente: {
    persona_livre: 'Atendente brasileira, descontraida.',
    tom: 'amigavel',
    emoji_level: 'raro',
    usa_giria: true,
    usa_identificador: false,
    aceita_cobertura: true,
    expressoes_proibidas: ['caro cliente'],
    frases_naturais: {
      saudacao: ['oii', 'olá'],
      confirmacao: ['fechou', 'massa'],
      encerramento: ['valeu', 'até mais'],
    },
    estilos_aceitos: ['blackwork', 'fineline', 'realismo'],
    estilos_recusados: ['tribal'],
    few_shot_exemplos: [
      { cliente: 'oi', agente: 'Oii, aqui e Lina do Estudio Teste.' },
    ],
  },
  config_precificacao: {
    modo: 'faixa',
    sinal_percentual: 30,
    tamanho_maximo_sessao_cm: 30,
    observacoes_tatuador: 'Sempre confirmar disponibilidade do tatuador antes de agendar.',
  },
};

export const TENANT_CANONICO_EXATO = {
  ...TENANT_CANONICO,
  config_precificacao: { ...TENANT_CANONICO.config_precificacao, modo: 'exato' },
};

export const CONVERSA_CANONICA = {
  id: 'conv-001',
  estado: 'qualificando',
  dados_coletados: {},
};

export const CLIENT_CONTEXT_CANONICO = {
  is_first_contact: true,
  eh_recorrente: false,
  total_sessoes: 0,
  nome_cliente: null,
};
```

- [ ] **Step 2: Criar fixture contaminada (FAQ + few-shots com valores monetários)**

`tests/prompts/fixtures/tenant-contaminado.mjs`:

```javascript
// Tenant contaminado — FAQ e few-shots mencionam valores.
// Em modos sensíveis (Coleta — chega em PR 2), regra R3 deve suprimir.
// Em PR 1, usado pra invariantes Faixa/Exato (que PODEM falar valor).
import { TENANT_CANONICO } from './tenant-canonico.mjs';

export const TENANT_CONTAMINADO = {
  ...TENANT_CANONICO,
  faq_texto: 'Q: Quanto custa?\nA: Em torno de R$ 500 a peca pequena.\nQ: Sinal?\nA: 30% pix.',
  config_agente: {
    ...TENANT_CANONICO.config_agente,
    few_shot_exemplos: [
      { cliente: 'quanto?', agente: 'Em torno de R$ 500 a R$ 800 pelo estilo.' },
      { cliente: 'pix?', agente: 'Sim, 30% de sinal.' },
    ],
  },
};
```

- [ ] **Step 3: Criar helpers**

`tests/prompts/helpers.mjs`:

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function snapshotPath(name) {
  return path.join(__dirname, 'snapshots', `${name}.txt`);
}

export function readSnapshot(name) {
  return fs.readFileSync(snapshotPath(name), 'utf8');
}

export function writeSnapshot(name, content) {
  fs.mkdirSync(path.dirname(snapshotPath(name)), { recursive: true });
  fs.writeFileSync(snapshotPath(name), content, 'utf8');
}

// Estimativa simples de tokens: 1 token ≈ 4 chars em pt-BR (suficiente
// pra contratos max_tokens — não precisa do tokenizer real).
export function approxTokens(text) {
  return Math.ceil(text.length / 4);
}
```

- [ ] **Step 4: Verificar arquivos criados**

Run: `ls tests/prompts/fixtures/ tests/prompts/helpers.mjs`
Expected: 3 arquivos listados.

- [ ] **Step 5: Commit**

```bash
git add tests/prompts/
git commit -m "$(cat <<'EOF'
test(modo-coleta): fixtures canonica + contaminada + helpers de snapshot

Canonica exercita todos os ramos do generator atual. Contaminada simula
FAQ/few-shots com valores monetarios pra futura validacao de R3 (Coleta
em PR 2). Helpers de snapshot pra comparar output byte-a-byte.

PR 1 task 3/12 do Modo Coleta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Baseline snapshot — captura output ATUAL antes do refactor

**Files:**
- Create: `tests/prompts/snapshots/faixa.txt`
- Create: `tests/prompts/snapshots/exato.txt`
- Create: `scripts/update-prompt-snapshots.sh`
- Create: `tests/prompts/snapshot.test.mjs`

> **Critical:** Esta task PRECEDE qualquer movimentação de código. O snapshot capturado AGORA reflete o output do `generate-prompt.js` original — vira o contrato de "zero mudança".

- [ ] **Step 1: Criar script update-prompt-snapshots.sh**

`scripts/update-prompt-snapshots.sh`:

```bash
#!/usr/bin/env bash
# Regenera snapshots de prompts. Use quando uma mudanca for INTENCIONAL.
# Sem este script, snapshot.test.mjs falha em mudancas — exatamente o
# comportamento desejado (forca PR a explicitar diff de prompt).
set -euo pipefail

cd "$(dirname "$0")/.."

node --input-type=module -e "
import { generateSystemPrompt } from './functions/_lib/generate-prompt.js';
import { TENANT_CANONICO, TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO } from './tests/prompts/fixtures/tenant-canonico.mjs';
import { writeSnapshot } from './tests/prompts/helpers.mjs';

writeSnapshot('faixa', generateSystemPrompt(TENANT_CANONICO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO));
writeSnapshot('exato', generateSystemPrompt(TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO));
console.log('OK — snapshots faixa.txt e exato.txt regenerados.');
"
```

- [ ] **Step 2: Rodar script — gera baseline**

Run:
```bash
chmod +x scripts/update-prompt-snapshots.sh && scripts/update-prompt-snapshots.sh
```

Expected: `OK — snapshots faixa.txt e exato.txt regenerados.`

- [ ] **Step 3: Verificar snapshots criados e não-vazios**

Run:
```bash
wc -l tests/prompts/snapshots/faixa.txt tests/prompts/snapshots/exato.txt
```

Expected: ambos com 200+ linhas. Faixa e Exato devem ser **idênticos** no MVP atual (modo `valor_tipo` afeta só response da tool, não prompt).

Run: `diff tests/prompts/snapshots/faixa.txt tests/prompts/snapshots/exato.txt`
Expected: diff vazio (ou diferença mínima conhecida — se houver, documentar como nota inline na próxima step).

- [ ] **Step 4: Criar snapshot.test.mjs**

`tests/prompts/snapshot.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import { TENANT_CANONICO, TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO } from './fixtures/tenant-canonico.mjs';
import { readSnapshot } from './helpers.mjs';

test('snapshot faixa: output bate com baseline (zero mudanca)', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
  const expected = readSnapshot('faixa');
  assert.strictEqual(out, expected,
    'Prompt Faixa divergiu do snapshot. Se intencional, rode scripts/update-prompt-snapshots.sh');
});

test('snapshot exato: output bate com baseline (zero mudanca)', () => {
  const out = generateSystemPrompt(TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
  const expected = readSnapshot('exato');
  assert.strictEqual(out, expected,
    'Prompt Exato divergiu do snapshot. Se intencional, rode scripts/update-prompt-snapshots.sh');
});
```

> Nota: este test importa de `prompts/index.js` que **ainda não existe**. Vai falhar nesta task — esperado. Vai começar a passar a partir da Task 8 quando dispatcher for criado. Antes disso, snapshot.test.mjs valida só os arquivos baseline (deixa o import comentado se quiser ver passar — mas TDD pede que falhe primeiro).

- [ ] **Step 5: Rodar — confirma que snapshot test FALHA por falta de dispatcher**

Run: `node --test tests/prompts/snapshot.test.mjs 2>&1 | head -20`
Expected: FAIL com `Cannot find module '../../functions/_lib/prompts/index.js'`. Isso é esperado.

- [ ] **Step 6: Commit baseline**

```bash
git add scripts/update-prompt-snapshots.sh tests/prompts/snapshots/ tests/prompts/snapshot.test.mjs
git commit -m "$(cat <<'EOF'
test(modo-coleta): captura snapshot baseline antes do refactor

Snapshots faixa.txt e exato.txt geradas via generate-prompt.js ATUAL.
Vira contrato de zero-mudanca pras tasks 5-9 (extracao de blocos).
snapshot.test.mjs falha intencionalmente ate Task 8 wirar dispatcher.

PR 1 task 4/12 do Modo Coleta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Extrair `_shared/` blocks (helpers + 5 funções)

**Files:**
- Create: `functions/_lib/prompts/_shared/helpers.js`
- Create: `functions/_lib/prompts/_shared/identidade.js`
- Create: `functions/_lib/prompts/_shared/checklist-critico.js`
- Create: `functions/_lib/prompts/_shared/tom.js`
- Create: `functions/_lib/prompts/_shared/contexto.js`
- Create: `functions/_lib/prompts/_shared/faq.js`

> **Princípio:** copiar código bit-a-bit de `generate-prompt.js`. Zero refactor cosmético, zero rename de variáveis. O snapshot test do Task 10 valida byte-a-byte.

- [ ] **Step 1: Criar `_shared/helpers.js` com utilitários compartilhados**

`functions/_lib/prompts/_shared/helpers.js`:

```javascript
// ── Helpers compartilhados ──────────────────────────────────────────────────
// Extraidos de generate-prompt.js (linhas 27-47) sem alteracao semantica.

export const GATILHOS_DEFAULT = ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'];

export const EMOJI_RULES = {
  nenhum: 'NAO use emojis em nenhuma mensagem.',
  raro: 'Emoji no maximo 1 a cada 3 mensagens. Prefira mensagens sem emoji.',
  moderado: 'Use no maximo 1 emoji por mensagem, quando encaixar naturalmente.',
  muitos: 'Pode usar emojis mais livremente, mas sem exagero.',
};

export const TOM_DESC = {
  descontraido: 'Tom descontraido, proximo, uso de girias moderado.',
  amigavel: 'Tom amigavel e acolhedor, portugues claro, sem formalidade.',
  profissional: 'Tom profissional e polido, mas nao corporativo.',
  zoeiro: 'Tom bem-humorado, pode zoar de leve, girias brasileiras.',
  formal: 'Tom formal e elegante. Evita girias.',
};

export function quoteList(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.map(e => `"${e}"`).join(', ');
}
```

- [ ] **Step 2: Criar `_shared/identidade.js`**

`functions/_lib/prompts/_shared/identidade.js`:

```javascript
// ── §1 IDENTIDADE — extraido de generate-prompt.js linhas 49-62 ─────────────
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

- [ ] **Step 3: Criar `_shared/checklist-critico.js`**

Copiar exatamente a função `checklistCritico` de `generate-prompt.js:67-109`. Substituir importação local de `GATILHOS_DEFAULT`/`quoteList` por imports:

`functions/_lib/prompts/_shared/checklist-critico.js`:

```javascript
// ── §0 CHECKLIST CRITICO — extraido de generate-prompt.js linhas 64-109 ─────
import { GATILHOS_DEFAULT, quoteList } from './helpers.js';

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

- [ ] **Step 4: Criar `_shared/tom.js`**

Copiar `tom()` de `generate-prompt.js:114-165` substituindo refs locais por imports:

`functions/_lib/prompts/_shared/tom.js`:

```javascript
// ── §2 TOM — extraido de generate-prompt.js linhas 111-165 ──────────────────
import { EMOJI_RULES, TOM_DESC, quoteList } from './helpers.js';

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

- [ ] **Step 5: Criar `_shared/contexto.js`**

`functions/_lib/prompts/_shared/contexto.js`:

```javascript
// ── §5 CONTEXTO — extraido de generate-prompt.js linhas 327-409 ─────────────
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

- [ ] **Step 6: Criar `_shared/faq.js`**

`functions/_lib/prompts/_shared/faq.js`:

```javascript
// ── §6 FAQ — extraido de generate-prompt.js linhas 414-418 ──────────────────
export function faqBlock(tenant) {
  const faq = (tenant.faq_texto || '').trim();
  if (!faq) return '';
  return `# §6 FAQ DO ESTUDIO\n${faq}`;
}
```

- [ ] **Step 7: Sanity check — todos arquivos parseable**

Run:
```bash
for f in functions/_lib/prompts/_shared/*.js; do
  node --input-type=module -e "import('./$f').then(m => console.log('OK $f:', Object.keys(m)))"
done
```

Expected: cada arquivo lista os exports (sem erro de parsing).

- [ ] **Step 8: Commit**

```bash
git add functions/_lib/prompts/_shared/
git commit -m "$(cat <<'EOF'
refactor(prompts): extrai blocos compartilhados pra _shared/

identidade, checklist-critico, tom, contexto, faq + helpers.
Copia bit-a-bit de generate-prompt.js — zero mudanca semantica.
generate-prompt.js continua intacto e em uso ate Task 9.

PR 1 task 5/12 do Modo Coleta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Criar `faixa/` generator (5 arquivos)

**Files:**
- Create: `functions/_lib/prompts/faixa/regras.js`
- Create: `functions/_lib/prompts/faixa/fluxo.js`
- Create: `functions/_lib/prompts/faixa/few-shot.js`
- Create: `functions/_lib/prompts/faixa/few-shot-tenant.js`
- Create: `functions/_lib/prompts/faixa/generate.js`

- [ ] **Step 1: Criar `faixa/regras.js`**

Copiar `regras()` de `generate-prompt.js:286-322` substituindo refs por imports:

`functions/_lib/prompts/faixa/regras.js`:

```javascript
// ── §4 REGRAS Faixa — extraido de generate-prompt.js linhas 283-322 ─────────
// MVP: identico ao Exato. Diferenciacao real chega em PRs futuros se preciso.
import { GATILHOS_DEFAULT, quoteList } from '../_shared/helpers.js';

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

- [ ] **Step 2: Criar `faixa/fluxo.js`**

Copiar `fluxo()` de `generate-prompt.js:170-281` SEM modificacoes (mantém branching `valor_tipo === "faixa"/"exato"` dentro pra preservar texto idêntico — refactor zero-mudança):

`functions/_lib/prompts/faixa/fluxo.js`:

```javascript
// ── §3 FLUXO Faixa — extraido de generate-prompt.js linhas 167-281 ──────────
// MVP: bit-a-bit identico ao Exato. Mantem branching valor_tipo dentro
// pra preservar texto exato do snapshot baseline. Diferenciacao real
// (ex: remover branch desnecessario por modo) fica pra PR futuro se preciso.
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

- [ ] **Step 3: Criar `faixa/few-shot.js`**

Copiar `fewShotBase()` de `generate-prompt.js:423-521`:

`functions/_lib/prompts/faixa/few-shot.js`:

```javascript
// ── §7 FEW-SHOT BASE Faixa — extraido de generate-prompt.js linhas 420-521 ──
// MVP: identico ao Exato.
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

Hoje few-shots customizadas vivem em `tenant.config_agente.few_shot_exemplos`. PR 1 NÃO migra ainda pra `tenant.fewshots_por_modo` (isso é PR 2 quando flag liga). Mantém leitura do path legado:

`functions/_lib/prompts/faixa/few-shot-tenant.js`:

```javascript
// ── §7b FEW-SHOT TENANT Faixa — extraido de generate-prompt.js linhas 526-537 ─
// PR 1: continua lendo de config_agente.few_shot_exemplos (path legado).
// PR 2: passa a ler tenant.fewshots_por_modo.faixa (com fallback ao legado).
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

- [ ] **Step 5: Criar `faixa/generate.js` — orquestrador do modo Faixa**

`functions/_lib/prompts/faixa/generate.js`:

```javascript
// ── Generator Faixa — agrega blocos shared + faixa-specific ─────────────────
// Espelha a montagem final de generate-prompt.js linhas 542-555 (zero diff).
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

- [ ] **Step 6: Sanity check parsing**

Run:
```bash
node --input-type=module -e "
import { generatePromptFaixa } from './functions/_lib/prompts/faixa/generate.js';
import { TENANT_CANONICO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO } from './tests/prompts/fixtures/tenant-canonico.mjs';
const out = generatePromptFaixa(TENANT_CANONICO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
console.log('Output length:', out.length, 'chars');
"
```

Expected: prints length > 5000. Sem erro de parsing/import.

- [ ] **Step 7: Verificar saída == snapshot baseline**

Run:
```bash
node --input-type=module -e "
import { generatePromptFaixa } from './functions/_lib/prompts/faixa/generate.js';
import { TENANT_CANONICO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO } from './tests/prompts/fixtures/tenant-canonico.mjs';
import { readSnapshot } from './tests/prompts/helpers.mjs';
const out = generatePromptFaixa(TENANT_CANONICO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
const baseline = readSnapshot('faixa');
if (out === baseline) {
  console.log('✓ Output bate com baseline.');
} else {
  console.error('✗ DIVERGE. Diff (primeiros 500 chars de cada):');
  console.error('--- baseline ---'); console.error(baseline.slice(0, 500));
  console.error('--- output ---'); console.error(out.slice(0, 500));
  process.exit(1);
}
"
```

Expected: `✓ Output bate com baseline.`

Se diverge: inspecionar o diff completo (`diff <(...) <(...)`) e corrigir o módulo extraído pra ficar bit-a-bit igual ao código original. Causas comuns: espaço extra, ordem de blocos errada, import errado.

- [ ] **Step 8: Commit**

```bash
git add functions/_lib/prompts/faixa/
git commit -m "$(cat <<'EOF'
refactor(prompts): cria faixa/ generator (5 modulos)

regras, fluxo, few-shot, few-shot-tenant, generate.
Saida bit-a-bit identica ao baseline (verificado contra snapshot).
generate-prompt.js continua intacto e em uso ate Task 9.

PR 1 task 6/12 do Modo Coleta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Criar `exato/` generator (5 arquivos — cópia idêntica de Faixa)

**Files:**
- Create: `functions/_lib/prompts/exato/regras.js`
- Create: `functions/_lib/prompts/exato/fluxo.js`
- Create: `functions/_lib/prompts/exato/few-shot.js`
- Create: `functions/_lib/prompts/exato/few-shot-tenant.js`
- Create: `functions/_lib/prompts/exato/generate.js`

> **Princípio:** No MVP atual, modo Exato usa o MESMO prompt do Faixa — `valor_tipo` na response da tool é que branch o discurso. Pra preservar essa equivalência, `exato/*` é cópia bit-a-bit de `faixa/*`. Diferenciação real chega num PR futuro se necessário (ex: enxugar branch `valor_tipo === "faixa"` em fluxo Exato).

- [ ] **Step 1: Copiar arquivos via cp**

Run:
```bash
mkdir -p functions/_lib/prompts/exato
for f in regras.js fluxo.js few-shot.js few-shot-tenant.js; do
  cp "functions/_lib/prompts/faixa/$f" "functions/_lib/prompts/exato/$f"
done
```

Expected: 4 arquivos copiados sem erro.

- [ ] **Step 2: Substituir export `regras` no header de `exato/regras.js` por nota explícita**

Os arquivos copiados ainda exportam funções com nomes genéricos (`regras`, `fluxo`, etc) — não precisa renomear (cada arquivo é namespace isolado via path de import). Adicionar header indicando origem:

Editar **apenas o comentário do topo** de cada arquivo em `exato/`:

```bash
sed -i.bak 's|// ── §4 REGRAS Faixa|// ── §4 REGRAS Exato|; s|MVP: identico ao Exato|MVP: identico ao Faixa (copia bit-a-bit)|' functions/_lib/prompts/exato/regras.js
sed -i.bak 's|// ── §3 FLUXO Faixa|// ── §3 FLUXO Exato|' functions/_lib/prompts/exato/fluxo.js
sed -i.bak 's|// ── §7 FEW-SHOT BASE Faixa|// ── §7 FEW-SHOT BASE Exato|' functions/_lib/prompts/exato/few-shot.js
sed -i.bak 's|// ── §7b FEW-SHOT TENANT Faixa|// ── §7b FEW-SHOT TENANT Exato|; s|tenant.fewshots_por_modo.faixa|tenant.fewshots_por_modo.exato|' functions/_lib/prompts/exato/few-shot-tenant.js
rm functions/_lib/prompts/exato/*.bak
```

- [ ] **Step 3: Criar `exato/generate.js`**

`functions/_lib/prompts/exato/generate.js`:

```javascript
// ── Generator Exato — espelha Faixa no MVP, paths exato/ ────────────────────
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

- [ ] **Step 4: Verificar saída == snapshot exato**

Run:
```bash
node --input-type=module -e "
import { generatePromptExato } from './functions/_lib/prompts/exato/generate.js';
import { TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO } from './tests/prompts/fixtures/tenant-canonico.mjs';
import { readSnapshot } from './tests/prompts/helpers.mjs';
const out = generatePromptExato(TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
const baseline = readSnapshot('exato');
if (out === baseline) {
  console.log('✓ Output Exato bate com baseline.');
} else {
  console.error('✗ DIVERGE.');
  process.exit(1);
}
"
```

Expected: `✓ Output Exato bate com baseline.`

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/prompts/exato/
git commit -m "$(cat <<'EOF'
refactor(prompts): cria exato/ generator (copia bit-a-bit de faixa)

No MVP atual modo Exato usa prompt identico ao Faixa — valor_tipo na
response da tool e que branch o discurso. Refactor preserva isso. Saida
identica ao baseline (verificado contra snapshot).

PR 1 task 7/12 do Modo Coleta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Criar dispatcher `prompts/index.js`

**Files:**
- Create: `functions/_lib/prompts/index.js`

- [ ] **Step 1: Criar dispatcher**

`functions/_lib/prompts/index.js`:

```javascript
// ── Dispatcher de prompts — substitui generate-prompt.js ────────────────────
// PR 1: roteia faixa/exato. Coleta (modo + estados) chega em PR 2 quando
// flag ENABLE_COLETA_MODE wirar.
import { generatePromptFaixa } from './faixa/generate.js';
import { generatePromptExato } from './exato/generate.js';

export function generateSystemPrompt(tenant, conversa, clientContext) {
  const modo = tenant?.config_precificacao?.modo || 'faixa';
  switch (modo) {
    case 'exato':
      return generatePromptExato(tenant, conversa, clientContext);
    case 'faixa':
    default:
      // Fallback intencional: tenants legados sem `modo` setado caem em Faixa
      // (que era o default historico). Se valor invalido chegar aqui, melhor
      // gerar prompt funcional do que crashar — validacao acontece em
      // update-tenant.js (Task 2).
      return generatePromptFaixa(tenant, conversa, clientContext);
  }
}
```

- [ ] **Step 2: Rodar snapshot test (agora deve passar)**

Run: `node --test tests/prompts/snapshot.test.mjs`
Expected: 2 passing — Faixa e Exato batem com baseline.

- [ ] **Step 3: Commit**

```bash
git add functions/_lib/prompts/index.js
git commit -m "$(cat <<'EOF'
feat(prompts): dispatcher prompts/index.js (faixa + exato)

Roteia faixa/exato baseado em config_precificacao.modo. Tenants legados
sem modo caem em Faixa (default historico). Coleta chega em PR 2.
Snapshot tests verdes — zero diff vs baseline.

PR 1 task 8/12 do Modo Coleta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Wire imports nos consumidores + deletar generate-prompt.js antigo

**Files:**
- Modify: `functions/api/tools/prompt.js:9`
- Modify: `functions/api/tools/simular-conversa.js:18`
- Delete: `functions/_lib/generate-prompt.js`

- [ ] **Step 1: Substituir import em `prompt.js`**

Editar `functions/api/tools/prompt.js:9` de:
```javascript
import { generateSystemPrompt } from '../../_lib/generate-prompt.js';
```
para:
```javascript
import { generateSystemPrompt } from '../../_lib/prompts/index.js';
```

- [ ] **Step 2: Substituir import em `simular-conversa.js`**

Editar `functions/api/tools/simular-conversa.js:18` de:
```javascript
import { generateSystemPrompt } from '../../_lib/generate-prompt.js';
```
para:
```javascript
import { generateSystemPrompt } from '../../_lib/prompts/index.js';
```

- [ ] **Step 3: Confirmar zero outros consumidores**

Run: `grep -rn "from.*generate-prompt" functions/ tests/ scripts/ 2>/dev/null`
Expected: vazio. Se aparecer outro import, atualizar antes de deletar.

- [ ] **Step 4: Deletar `generate-prompt.js`**

Run: `rm functions/_lib/generate-prompt.js`

- [ ] **Step 5: Atualizar script de regenerar snapshot pra apontar pro dispatcher**

Editar `scripts/update-prompt-snapshots.sh`, substituir:
```javascript
import { generateSystemPrompt } from './functions/_lib/generate-prompt.js';
```
por:
```javascript
import { generateSystemPrompt } from './functions/_lib/prompts/index.js';
```

- [ ] **Step 6: Re-rodar snapshot test**

Run: `node --test tests/prompts/snapshot.test.mjs`
Expected: 2 passing.

- [ ] **Step 7: Smoke import dos consumidores (parsing OK)**

Run:
```bash
node --input-type=module -e "import('./functions/api/tools/prompt.js').then(() => console.log('prompt.js OK'))"
node --input-type=module -e "import('./functions/api/tools/simular-conversa.js').then(() => console.log('simular-conversa.js OK'))"
```

Expected: ambos imprimem OK sem erro.

- [ ] **Step 8: Commit**

```bash
git add functions/api/tools/prompt.js functions/api/tools/simular-conversa.js scripts/update-prompt-snapshots.sh
git rm functions/_lib/generate-prompt.js
git commit -m "$(cat <<'EOF'
refactor(prompts): wire dispatcher + remove generate-prompt.js antigo

prompt.js e simular-conversa.js apontam pro novo prompts/index.js.
generate-prompt.js deletado — sem backwards-compat shim, os 2 consumers
foram atualizados no mesmo commit.

PR 1 task 9/12 do Modo Coleta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Tier 1 hygiene — contracts por modo

**Files:**
- Create: `tests/prompts/contracts/faixa.mjs`
- Create: `tests/prompts/contracts/exato.mjs`
- Create: `tests/prompts/contracts.test.mjs`

- [ ] **Step 1: Criar contract Faixa**

`tests/prompts/contracts/faixa.mjs`:

```javascript
// Contrato do prompt Faixa: o que DEVE/NAO DEVE aparecer + limite.
// CI bloqueia PR que quebra qualquer assertion.
export const CONTRACT_FAIXA = {
  must_contain: [
    'calcular_orcamento',
    'consultar_horarios_livres',
    'reservar_horario',
    'gerar_link_sinal',
    'acionar_handoff',
    'IDENTIDADE',
    'CHECKLIST',
    'REGRAS INVIOLAVEIS',
    'FLUXO',
    'CONTEXTO',
  ],
  must_not_contain: [
    // No PR 1, modo Coleta nao existe — nada de markers Coleta no Faixa.
    'coleta_completa',
    'coleta_completa_reentrada',
    'cliente_sem_referencia_tamanho',  // gatilho exclusivo Coleta
  ],
  max_tokens: 5000, // ~20K chars (atual ~10-15K)
};
```

- [ ] **Step 2: Criar contract Exato**

`tests/prompts/contracts/exato.mjs`:

```javascript
// Contrato Exato — MVP: identico ao Faixa.
export const CONTRACT_EXATO = {
  must_contain: [
    'calcular_orcamento',
    'consultar_horarios_livres',
    'reservar_horario',
    'gerar_link_sinal',
    'acionar_handoff',
    'IDENTIDADE',
    'CHECKLIST',
    'REGRAS INVIOLAVEIS',
    'FLUXO',
    'CONTEXTO',
  ],
  must_not_contain: [
    'coleta_completa',
    'coleta_completa_reentrada',
    'cliente_sem_referencia_tamanho',
  ],
  max_tokens: 5000,
};
```

- [ ] **Step 3: Criar `contracts.test.mjs`**

`tests/prompts/contracts.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import { TENANT_CANONICO, TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO } from './fixtures/tenant-canonico.mjs';
import { CONTRACT_FAIXA } from './contracts/faixa.mjs';
import { CONTRACT_EXATO } from './contracts/exato.mjs';
import { approxTokens } from './helpers.mjs';

function checkContract(name, output, contract) {
  for (const needle of contract.must_contain) {
    assert.match(output, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `[${name}] must_contain falhou: "${needle}" ausente`);
  }
  for (const forbidden of contract.must_not_contain) {
    assert.doesNotMatch(output, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `[${name}] must_not_contain falhou: "${forbidden}" presente`);
  }
  const tokens = approxTokens(output);
  assert.ok(tokens <= contract.max_tokens,
    `[${name}] max_tokens excedido: ${tokens} > ${contract.max_tokens}`);
}

test('contract Faixa: must_contain + must_not_contain + max_tokens', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
  checkContract('faixa', out, CONTRACT_FAIXA);
});

test('contract Exato: must_contain + must_not_contain + max_tokens', () => {
  const out = generateSystemPrompt(TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
  checkContract('exato', out, CONTRACT_EXATO);
});
```

- [ ] **Step 4: Rodar contracts test**

Run: `node --test tests/prompts/contracts.test.mjs`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add tests/prompts/contracts/ tests/prompts/contracts.test.mjs
git commit -m "$(cat <<'EOF'
test(prompts): contracts must_contain/not + max_tokens por modo

Faixa e Exato com contratos espelhados (MVP identicos). Bloqueia PR que
remova tools-callouts essenciais ou exceda limite de tokens.

PR 1 task 10/12 do Modo Coleta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Tier 1 hygiene — invariants cross-mode + contamination linter

**Files:**
- Create: `tests/prompts/invariants.test.mjs`
- Create: `tests/prompts/contamination.test.mjs`

- [ ] **Step 1: Criar invariants test**

`tests/prompts/invariants.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import { TENANT_CANONICO, TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO } from './fixtures/tenant-canonico.mjs';

const MODOS = [
  { nome: 'faixa', tenant: TENANT_CANONICO },
  { nome: 'exato', tenant: TENANT_CANONICO_EXATO },
];

test('invariante: todos modos contem IDENTIDADE', () => {
  for (const { nome, tenant } of MODOS) {
    const out = generateSystemPrompt(tenant, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §1 IDENTIDADE/, `[${nome}] sem secao IDENTIDADE`);
  }
});

test('invariante: todos modos contem CHECKLIST CRITICO', () => {
  for (const { nome, tenant } of MODOS) {
    const out = generateSystemPrompt(tenant, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §0 CHECKLIST/, `[${nome}] sem CHECKLIST`);
  }
});

test('invariante: todos modos contem CONTEXTO', () => {
  for (const { nome, tenant } of MODOS) {
    const out = generateSystemPrompt(tenant, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §5 CONTEXTO/, `[${nome}] sem CONTEXTO`);
  }
});

test('invariante: todos modos contem REGRAS INVIOLAVEIS', () => {
  for (const { nome, tenant } of MODOS) {
    const out = generateSystemPrompt(tenant, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §4 REGRAS INVIOLAVEIS/, `[${nome}] sem REGRAS`);
  }
});

test('invariante: nenhum modo vaza meta-instrucao "system prompt"', () => {
  for (const { nome, tenant } of MODOS) {
    const out = generateSystemPrompt(tenant, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
    assert.doesNotMatch(out, /system prompt|meta-instrucao|prompt engineering/i,
      `[${nome}] vazou meta-instrucao`);
  }
});

test('invariante: separator "---" presente entre blocos', () => {
  for (const { nome, tenant } of MODOS) {
    const out = generateSystemPrompt(tenant, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /\n---\n/, `[${nome}] sem separadores`);
  }
});
```

- [ ] **Step 2: Criar contamination test (smoke pra Faixa/Exato — Coleta vai em PR 2)**

`tests/prompts/contamination.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import { TENANT_CONTAMINADO } from './fixtures/tenant-contaminado.mjs';
import { CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO } from './fixtures/tenant-canonico.mjs';

// PR 1: Faixa/Exato PODEM falar valor — fixture suja vai vazar nos prompts
// e isso e ESPERADO (sao modos que orcam). Test garante que o pipeline NAO
// crasha com FAQ/few-shots contaminados.
//
// PR 2: vai expandir pra Coleta-Info (modo onde R3 deve suprimir R$/valor)
// e adicionar assertion que /R\$|reais|sinal/ NUNCA aparece em Coleta.

test('contaminacao Faixa: tenant sujo nao quebra geracao', () => {
  const tenantFaixa = { ...TENANT_CONTAMINADO, config_precificacao: { ...TENANT_CONTAMINADO.config_precificacao, modo: 'faixa' } };
  const out = generateSystemPrompt(tenantFaixa, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
  assert.ok(out.length > 1000, 'output suspeitamente curto');
  // Faixa PODE falar valor, entao R$ na FAQ EH esperado aparecer no prompt.
  assert.match(out, /R\$/, 'esperava R$ no prompt Faixa contaminado');
});

test('contaminacao Exato: tenant sujo nao quebra geracao', () => {
  const tenantExato = { ...TENANT_CONTAMINADO, config_precificacao: { ...TENANT_CONTAMINADO.config_precificacao, modo: 'exato' } };
  const out = generateSystemPrompt(tenantExato, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO);
  assert.ok(out.length > 1000, 'output suspeitamente curto');
  assert.match(out, /R\$/, 'esperava R$ no prompt Exato contaminado');
});
```

- [ ] **Step 3: Rodar invariants + contamination**

Run: `node --test tests/prompts/invariants.test.mjs tests/prompts/contamination.test.mjs`
Expected: 8 passing (6 invariants + 2 contamination).

- [ ] **Step 4: Commit**

```bash
git add tests/prompts/invariants.test.mjs tests/prompts/contamination.test.mjs
git commit -m "$(cat <<'EOF'
test(prompts): invariantes cross-mode + smoke contamination

Invariantes garantem que todos os modos tem secoes obrigatorias e
separadores. Contamination test (smoke PR 1) prova que pipeline aguenta
FAQ/few-shots sujas sem crashar — assertions Coleta-especificas chegam
em PR 2.

PR 1 task 11/12 do Modo Coleta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: CI integration — script + GHA workflow + CHANGELOG

**Files:**
- Create: `scripts/test-prompts.sh`
- Create: `.github/workflows/prompts-ci.yml`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Criar runner local**

`scripts/test-prompts.sh`:

```bash
#!/usr/bin/env bash
# Roda toda a bateria de tests de prompts. Use antes de commit/push.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▶ Snapshots..."
node --test tests/prompts/snapshot.test.mjs

echo "▶ Contracts..."
node --test tests/prompts/contracts.test.mjs

echo "▶ Invariants..."
node --test tests/prompts/invariants.test.mjs

echo "▶ Contamination..."
node --test tests/prompts/contamination.test.mjs

echo "✓ Todos os tests de prompts passaram."
```

- [ ] **Step 2: Tornar executável e testar**

Run:
```bash
chmod +x scripts/test-prompts.sh && scripts/test-prompts.sh
```

Expected: `✓ Todos os tests de prompts passaram.`

- [ ] **Step 3: Criar GHA workflow**

`.github/workflows/prompts-ci.yml`:

```yaml
name: Prompts CI

on:
  pull_request:
    paths:
      - 'functions/_lib/prompts/**'
      - 'tests/prompts/**'
      - 'scripts/test-prompts.sh'
      - 'scripts/update-prompt-snapshots.sh'
  push:
    branches: [main]
    paths:
      - 'functions/_lib/prompts/**'
      - 'tests/prompts/**'

jobs:
  prompts-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run prompts test suite
        run: bash scripts/test-prompts.sh
```

- [ ] **Step 4: Atualizar CHANGELOG**

Editar `CHANGELOG.md` adicionando entry no topo (mantendo formato existente):

```markdown
## 2026-04-30 — Modo Coleta PR 1: Refactor zero-mudança

- Quebra `functions/_lib/generate-prompt.js` (556 linhas, monolítico) em estrutura modular `prompts/{_shared,faixa,exato}/` com dispatcher equivalente. Saída byte-a-byte idêntica ao baseline (snapshot tests garantem).
- Adiciona schema migration: `tenants.fewshots_por_modo` (JSONB) + `conversas.estado_agente` (TEXT) + index parcial. Defaults garantem zero breaking pros tenants existentes.
- Adiciona Tier 1 de higiene de prompts: snapshots, contracts (`must_contain`/`must_not_contain`/`max_tokens`), invariants cross-mode, contamination smoke test.
- CI workflow `prompts-ci.yml` roda bateria em PRs tocando `prompts/` ou `tests/prompts/`.
- `update-tenant.js` aceita `fewshots_por_modo` e valida `coleta_submode`/`trigger_handoff` (forward compat). `modo='coleta'` REJEITADO até PR 2 wirar feature flag `ENABLE_COLETA_MODE`.
- Sem mudança de comportamento em prod — PR 2 ativa o caminho Coleta.
```

- [ ] **Step 5: Smoke regressão final — todos tests do projeto**

Run: `node --test tests/`
Expected: todos os tests passam (incluindo audit-* baseline). Se algum test não-prompt quebrar, investigar (não deveria — não tocamos esses arquivos).

- [ ] **Step 6: Commit**

```bash
git add scripts/test-prompts.sh .github/workflows/prompts-ci.yml CHANGELOG.md
git commit -m "$(cat <<'EOF'
ci(prompts): runner local + GHA workflow + CHANGELOG entry

scripts/test-prompts.sh roda snapshots + contracts + invariants +
contamination. Workflow GHA dispara em PRs tocando prompts/. CHANGELOG
documenta o refactor zero-mudanca + schema prep.

PR 1 task 12/12 do Modo Coleta — refactor completo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Push e abrir PR**

```bash
git push -u origin <branch-name>
gh pr create --title "Modo Coleta PR 1: Refactor zero-mudança" --body "$(cat <<'EOF'
## Summary
- Quebra `generate-prompt.js` em `prompts/{_shared,faixa,exato}/` + dispatcher. Saída byte-a-byte idêntica ao baseline (snapshot tests garantem zero regressão).
- Schema migration: `tenants.fewshots_por_modo` + `conversas.estado_agente` + index parcial (defaults seguros).
- Tier 1 hygiene: snapshots, contracts, invariants, contamination smoke. CI roda em PRs tocando prompts.
- `update-tenant.js` aceita schema fields novos. `modo='coleta'` rejeitado até PR 2 wirar flag.

## Test plan
- [x] `scripts/test-prompts.sh` localmente — todos passam
- [x] `node --test tests/` (regressão geral) — todos passam
- [x] Snapshots Faixa/Exato batem com baseline gerado pré-refactor
- [x] Migration aplicada manual no Supabase Dashboard
- [ ] Reviewer: confirmar que `git diff` no `prompts/` é só "mover/renomear" (zero cosmético)
- [ ] Smoke prod pós-merge: `prompt.js` endpoint responde igual antes/depois

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist (executar após escrever o plano)

**1. Spec coverage:** mapeei cada item da spec §6.1 PR 1?

| Spec PR 1 phase | Plan task |
|---|---|
| 1.1 Migração SQL: `fewshots_por_modo`, `estado_agente` + índice parcial | Task 1 ✓ |
| 1.2 Validações novas em `update-tenant.js` (aceitar coleta/submode/trigger/fewshots) | Task 2 ✓ (com decisão documentada: `modo='coleta'` rejeitado em PR 1) |
| 1.3 Criar `prompts/` com `_shared/`, `faixa/`, `exato/` — mover código | Tasks 5, 6, 7 ✓ |
| 1.4 Dispatcher `prompts/index.js` | Task 8 ✓ |
| 1.5 Substituir imports em `prompt.js` e `simular-conversa.js` | Task 9 ✓ |
| 1.6 Testes Tier 1: snapshots, contratos, invariantes, fixtures, linter | Tasks 3, 4, 10, 11 ✓ |
| 1.7 Pre-commit hook + CI rodando bateria completa | Task 12 (CI ✓; pre-commit hook adiado — sem package.json/Husky no repo, fica como follow-up P3) |

**Gap conhecido:** pre-commit hook (Husky) ficou adiado — repo principal não tem `package.json`. Documentado na intro do plan. Adicionar follow-up P3 em [[InkFlow — Pendências (backlog)]] após merge.

**2. Placeholder scan:** todos os steps têm código completo ou comando exato? Sim — verificado em cada Task.

**3. Type/signature consistency:**
- `generateSystemPrompt(tenant, conversa, clientContext)` — assinatura preservada do antigo, espelhada em todas as tasks.
- `validateConfigPrecificacao(cfg)` — exportada em Task 2, usada em test mesma task.
- `validateFieldTypes(fields)` — re-exportada em Task 2 (era interna), usada em test mesma task.
- Snapshot helpers (`readSnapshot`, `writeSnapshot`, `snapshotPath`, `approxTokens`) — definidos Task 3, usados Tasks 4, 6, 7, 10, 11.
- Contract structure (`must_contain`, `must_not_contain`, `max_tokens`) — definido Task 10 contracts/, consumido Task 10 contracts.test.mjs.

**4. Risco residual:**
- Task 7 step 2 (sed -i.bak): macOS BSD sed difere de GNU sed no flag `-i`. Comando uso `-i.bak` que funciona nos dois.
- Task 9 deleta `generate-prompt.js` no mesmo commit que rewires imports — atomicidade preserva bisectability. Bem.
- Migration (Task 1) é manual via Supabase Dashboard — founder precisa rodar antes do merge ou validation falha em prod. Documentado em CHANGELOG.

---

## Execution handoff

Plan completo e salvo em `docs/superpowers/plans/2026-04-30-modo-coleta-pr1-refactor.md`.

Duas opções de execução:

**1. Subagent-Driven (recomendado)** — dispatch fresh subagent per task, review entre tasks, iteração rápida. Vantagem pro PR 1: 12 tasks bem isoladas com snapshot-test como gate, perfeito pra subagent-per-task.

**2. Inline Execution** — executa em sessão única usando `superpowers:executing-plans`, batch com checkpoints.

**Qual?**
