# Fix Eval Instrumentation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar eval harness onde duas rodadas com prompt cravado dão nat dentro de ±0.3 e zero falso-positivo `tamanho_cm` em 15 runs, pra que sub-specs C futuras tenham instrumento confiável.

**Architecture:** Hardener cirúrgico em 3 pontos (judge prompt P2 anti-tamanho_cm, pin temperature do judge Anthropic, pin temperature do bot OpenAI gated por `EVAL_MODE` env var) + infra nova de baseline (shell wrapper N×3 + variance helper JS). Branch nova cortada de `main`, PR final pra `main`. Prod fica intocado (gate `EVAL_MODE` ausente em prod = comportamento de produção preservado).

**Tech Stack:** Node.js (`node:test`), Anthropic API (Claude Haiku/Sonnet 4.x judge), OpenAI Responses API (gpt-4o bot), Cloudflare Pages Functions (`functions/_lib/agent-runtime/runtime.js`), Cloudflare Pages dashboard pra preview-only `EVAL_MODE`, Zod schemas.

**Spec:** `docs/superpowers/specs/2026-05-18-fix-eval-instrumentation-design.md`

**Estado atual confirmado (2026-05-18):**
- Baseline test suite: **450/450 PASS**
- `evals/inkflow-agent/_harness/run.mjs` já tem `temperature: 0` (line 86) e `JUDGE_MODEL` env var (lines 34, 84) — **D2 do spec já foi implementado em commit anterior**. Este plano não tem task dedicada pra D2; sanity check inline está embutido na Task 2 step 1.
- `functions/_lib/agent-runtime/runtime.js` está pristine (sem `temperature` nem `EVAL_MODE`) — D3 é edit real
- Judge prompt `manifesto-adherence.txt` ainda na versão "old" (linhas 6-7) — D1 é edit real
- Branch atual antes do plano: `feat/sub-spec-b-tattoo-pivot-naturalidade` (necessário voltar pra `main` antes de cortar nova branch — coberto na Task 1)

**Riscos críticos sinalizados:**
- **Secrets — escopo crítico:** `EVAL_MODE=true` setado APENAS no environment **Preview** do Cloudflare Pages. Prod NUNCA recebe. Decisão de plano: usar **dashboard CF Pages** (não CLI/sync-secrets) — o dashboard tem seletor explícito Preview vs Production por env var, eliminando risco de vazar pra prod. Referência: `[[feedback_secrets_via_vault_pessoal]]` continua válida pra outros secrets (CF API, SB_PAT, etc.); aqui o escopo é diferente porque `EVAL_MODE` não é credencial e fica permanente no preview.
- **Breaking change risk em prod:** zero por design (gate `EVAL_MODE` ausente preserva comportamento atual), validado manualmente em DoD #3.
- **Migrations:** nenhuma.
- **Variância LLM:** se temp=0 não bastar pra cravar ≤0.6 range, escala pra Opção 3 (documentado no spec §5 "Path se falhar").

**Custo previsto:** ~$1.05 (baseline $0.75 + spike sonnet $0.30). Cap = $2.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `evals/inkflow-agent/_harness/judge-prompts/manifesto-adherence.txt` | Modify | Hardener P2 contra falso-positivo `tamanho_cm` (D1) |
| `evals/inkflow-agent/_harness/run.mjs` | Sanity check only | Confirmar `temperature: 0` + `JUDGE_MODEL` env var já presentes (D2 — sem edit) |
| `functions/_lib/agent-runtime/runtime.js` | Modify | Adicionar `temperature` gated por `EVAL_MODE` env (D3) |
| `tests/_lib/agent-runtime/runtime.test.mjs` | Modify | Tests pra D3 (temp pin gated) |
| `evals/inkflow-agent/_harness/run-baseline.sh` | Create | Shell wrapper que roda N×3 personas + chama variance (D4) |
| `evals/inkflow-agent/_harness/compute-variance.mjs` | Create | Lê reports JSON do dir, agrega per-persona, output JSON + grava aggregate (D4) |
| `tests/_lib/eval-harness/compute-variance.test.mjs` | Create | TDD pra compute-variance.mjs |
| `docs/inkflow-agent/reports/2026-05-18-eval-instrumentation-baseline.md` | Create | Output baseline + DoD validation (após execução) |

---

## Task 1: Branch cut + housekeeping

**Files:**
- N/A (git operations)

- [ ] **Step 1: Stash report.json uncommitted**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git status -s
```
Expected: `M evals/inkflow-agent/report.json` (transient report do eval anterior).

Run:
```bash
git stash push -m "transient eval report.json pre-fix-eval-instrumentation" -- evals/inkflow-agent/report.json
```
Expected: `Saved working directory and index state On feat/sub-spec-b-...: transient eval report.json pre-fix-eval-instrumentation`

- [ ] **Step 2: Checkout main + pull**

Run:
```bash
git checkout main && git pull origin main
```
Expected: working tree clean, em `main`, up to date with origin.

- [ ] **Step 3: Cut branch `feat/fix-eval-instrumentation`**

Run:
```bash
git checkout -b feat/fix-eval-instrumentation
```
Expected: `Switched to a new branch 'feat/fix-eval-instrumentation'`

- [ ] **Step 4: Commit do plano**

Spec já está em main (commit `cf43dbd`). Apenas o plano precisa de commit.

Run:
```bash
ls docs/superpowers/specs/2026-05-18-fix-eval-instrumentation-design.md docs/superpowers/plans/2026-05-18-fix-eval-instrumentation.md
git add docs/superpowers/plans/2026-05-18-fix-eval-instrumentation.md
git commit -m "docs(plan): fix eval instrumentation"
```
Expected: 1 file changed (plan).

---

## Task 2: D1 — Hardener judge-prompt manifesto-adherence + sanity check D2

**Files:**
- Modify: `evals/inkflow-agent/_harness/judge-prompts/manifesto-adherence.txt:6-7`
- Sanity check (no edit): `evals/inkflow-agent/_harness/run.mjs:34, 84, 86`

- [ ] **Step 1: Sanity check D2 (run.mjs já tem temp=0 + JUDGE_MODEL)**

Run:
```bash
sed -n '34p;83,90p' evals/inkflow-agent/_harness/run.mjs
```
Expected (entre o output):
```
const JUDGE_MODEL = process.env.JUDGE_MODEL || 'claude-haiku-4-5-20251001';
    body: JSON.stringify({
      model: JUDGE_MODEL,
      max_tokens: 1024,
      temperature: 0,
```

Se divergir (ex: arquivo foi alterado após o plano), **parar a execução** e re-ler o spec §4.D2 antes de prosseguir. Não há edit; este é só guard.

- [ ] **Step 2: Verificar conteúdo atual do judge-prompt (linhas 6-7)**

Run:
```bash
sed -n '6,7p' evals/inkflow-agent/_harness/judge-prompts/manifesto-adherence.txt
```
Expected:
```
**P2 — Coletar 4 OBR: descricao_curta, local_corpo, altura_cm, estilo. tamanho_cm opcional.**
Bot que pede tamanho_cm como obrigatório ou ignora um dos 4 OBR VIOLA P2.
```

- [ ] **Step 3: Substituir linhas 6-7 pelo hardener**

Use Edit tool. Old (exato, 2 linhas):
```
**P2 — Coletar 4 OBR: descricao_curta, local_corpo, altura_cm, estilo. tamanho_cm opcional.**
Bot que pede tamanho_cm como obrigatório ou ignora um dos 4 OBR VIOLA P2.
```

New (block expandido, ~17 linhas):
```
**P2 — Coletar 4 OBR: descricao_curta, local_corpo, altura_cm, estilo. tamanho_cm OPCIONAL.**

**ATENÇÃO CRÍTICA:** tamanho_cm NUNCA reduz score P2. Bot pode fazer handoff sem
tamanho_cm — é comportamento CORRETO. Só conte P2 violation se:
(a) faltar um dos 4 OBR REAIS (descricao_curta, local_corpo, altura_cm, estilo) ao
fazer handoff, OU
(b) bot PEDIR tamanho_cm proativamente como obrigatório.

Exemplo P2=1.0 (correto): bot coletou descrição + local + altura + estilo, fez handoff
sem mencionar tamanho_cm. ✅
Exemplo P2=0.5 (parcial): bot pulou pergunta de estilo e fez handoff. ❌
Exemplo P2=0.0 (violação): bot perguntou "qual o tamanho exato em cm?" sem foto. ❌

NÃO conte como P2 violation: "bot fez handoff sem tamanho_cm" — esse é fluxo válido.
```

- [ ] **Step 4: Sanity check com diff**

Run:
```bash
git diff evals/inkflow-agent/_harness/judge-prompts/manifesto-adherence.txt | head -40
```
Expected: 2 linhas removidas, ~17 linhas adicionadas. P2 marker mudou de "opcional" pra "OPCIONAL" + bloco de exemplos.

- [ ] **Step 5: Suite local mantém verde**

Run:
```bash
npm test 2>&1 | tail -5
```
Expected: `ℹ pass 450` `ℹ fail 0`. Judge-prompt edit não afeta unit tests (judge só roda no harness remoto).

- [ ] **Step 6: Commit**

Run:
```bash
git add evals/inkflow-agent/_harness/judge-prompts/manifesto-adherence.txt
git commit -m "fix(eval-judge): hardener P2 anti-falso-positivo tamanho_cm"
```

---

## Task 3: D3 (TDD) — Bot temperature gated por EVAL_MODE em runtime.js

**Files:**
- Test: `tests/_lib/agent-runtime/runtime.test.mjs` (append 3 tests)
- Modify: `functions/_lib/agent-runtime/runtime.js:38-46`

- [ ] **Step 1: Write failing tests (append ao final do file)**

Adicionar ao final de `tests/_lib/agent-runtime/runtime.test.mjs` (antes do EOF, depois do último `test(...)`):

```javascript
test('runtime.run: EVAL_MODE=true seta temperature=0 no payload', async () => {
  const prev = process.env.EVAL_MODE;
  process.env.EVAL_MODE = 'true';
  try {
    const fake = makeFakeClient({ parsed: { proxima_acao: 'pergunta', resposta_cliente: 'x' } });
    await runtime.run({
      openaiClient: fake,
      model: 'gpt-4o-mini',
      instructions: 'i',
      input: [{ role: 'user', content: 'oi' }],
      outputSchema: SimpleSchema,
      schemaName: 'simple',
      retryConfig: { maxRetries: 0, baseMs: 1 },
    });
    assert.equal(fake._lastParams().temperature, 0);
  } finally {
    if (prev === undefined) delete process.env.EVAL_MODE;
    else process.env.EVAL_MODE = prev;
  }
});

test('runtime.run: sem EVAL_MODE, temperature ausente do payload (default OpenAI)', async () => {
  const prev = process.env.EVAL_MODE;
  delete process.env.EVAL_MODE;
  try {
    const fake = makeFakeClient({ parsed: { proxima_acao: 'pergunta', resposta_cliente: 'x' } });
    await runtime.run({
      openaiClient: fake,
      model: 'gpt-4o-mini',
      instructions: 'i',
      input: [{ role: 'user', content: 'oi' }],
      outputSchema: SimpleSchema,
      schemaName: 'simple',
      retryConfig: { maxRetries: 0, baseMs: 1 },
    });
    assert.equal(fake._lastParams().temperature, undefined);
  } finally {
    if (prev !== undefined) process.env.EVAL_MODE = prev;
  }
});

test('runtime.run: EVAL_MODE=false (string) NÃO seta temperature (gate só aceita "true" exato)', async () => {
  const prev = process.env.EVAL_MODE;
  process.env.EVAL_MODE = 'false';
  try {
    const fake = makeFakeClient({ parsed: { proxima_acao: 'pergunta', resposta_cliente: 'x' } });
    await runtime.run({
      openaiClient: fake,
      model: 'gpt-4o-mini',
      instructions: 'i',
      input: [{ role: 'user', content: 'oi' }],
      outputSchema: SimpleSchema,
      schemaName: 'simple',
      retryConfig: { maxRetries: 0, baseMs: 1 },
    });
    assert.equal(fake._lastParams().temperature, undefined);
  } finally {
    if (prev === undefined) delete process.env.EVAL_MODE;
    else process.env.EVAL_MODE = prev;
  }
});
```

- [ ] **Step 2: Run tests, confirm 3 new fail**

Run:
```bash
node --test tests/_lib/agent-runtime/runtime.test.mjs 2>&1 | tail -15
```
Expected: 3 new tests FAIL (`expected 0 == undefined` ou similar — porque runtime.js ainda não inclui `temperature` no payload).

- [ ] **Step 3: Implementar gate em runtime.js**

Edit `functions/_lib/agent-runtime/runtime.js`. Old (linhas 38-46):
```javascript
    const response = await runWithRetry(
      () => client.responses.parse({
        model,
        instructions,
        input,
        text: { format },
      }),
      retryConfig,
    );
```

New:
```javascript
    const response = await runWithRetry(
      () => client.responses.parse({
        model,
        instructions,
        input,
        text: { format },
        ...(process.env.EVAL_MODE === 'true' ? { temperature: 0 } : {}),
      }),
      retryConfig,
    );
```

> Por quê spread condicional em vez de `temperature: ... ? 0 : undefined`: passar `undefined` explicit ainda envia a key. Spread garante que sem `EVAL_MODE=true` a key nunca aparece no payload — assertable via `lastParams().temperature === undefined`.

- [ ] **Step 4: Run runtime tests, todos passam**

Run:
```bash
node --test tests/_lib/agent-runtime/runtime.test.mjs 2>&1 | tail -5
```
Expected: `pass X` (X = total anterior + 3), `fail 0`.

- [ ] **Step 5: Run suite completa**

Run:
```bash
npm test 2>&1 | tail -5
```
Expected: `ℹ pass 453` (450 baseline + 3 novos), `ℹ fail 0`.

- [ ] **Step 6: Commit**

Run:
```bash
git add functions/_lib/agent-runtime/runtime.js tests/_lib/agent-runtime/runtime.test.mjs
git commit -m "feat(runtime): pin temperature=0 gated por EVAL_MODE"
```

---

## Task 4: D4 (TDD) — compute-variance.mjs helper

**Files:**
- Test: `tests/_lib/eval-harness/compute-variance.test.mjs` (create)
- Create: `evals/inkflow-agent/_harness/compute-variance.mjs`

- [ ] **Step 1: Criar diretório tests/_lib/eval-harness**

Run:
```bash
mkdir -p tests/_lib/eval-harness
ls tests/_lib/eval-harness
```
Expected: diretório criado (vazio).

- [ ] **Step 2: Escrever tests primeiro**

Create `tests/_lib/eval-harness/compute-variance.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { computeAggregate } from '../../../evals/inkflow-agent/_harness/compute-variance.mjs';

async function makeTmpDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'eval-variance-test-'));
}

async function writeReport(dir, name, results) {
  await fs.writeFile(
    path.join(dir, name),
    JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2),
  );
}

test('computeAggregate: agrupa por persona e calcula min/max/range/média de nat', async () => {
  const dir = await makeTmpDir();
  try {
    await writeReport(dir, 'per-001-r1.json', [{
      id: 'per-001',
      status: 'pass',
      scores: { naturalidade: { media: 4.2 }, manifesto: { m1_manifesto_adherence: 0.95 }, state: { pass: true } },
    }]);
    await writeReport(dir, 'per-001-r2.json', [{
      id: 'per-001',
      status: 'pass',
      scores: { naturalidade: { media: 4.8 }, manifesto: { m1_manifesto_adherence: 0.9 }, state: { pass: true } },
    }]);
    const agg = await computeAggregate(dir);
    assert.equal(agg['per-001'].nat.min, 4.2);
    assert.equal(agg['per-001'].nat.max, 4.8);
    assert.equal(Number(agg['per-001'].nat.range.toFixed(4)), 0.6);
    assert.equal(Number(agg['per-001'].nat.media.toFixed(4)), 4.5);
    assert.equal(agg['per-001'].state_pass_rate, 1);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});

test('computeAggregate: conta violations citando tamanho_cm', async () => {
  const dir = await makeTmpDir();
  try {
    await writeReport(dir, 'per-010-r1.json', [{
      id: 'per-010',
      status: 'fail',
      scores: {
        naturalidade: { media: 4.0 },
        manifesto: { m1_manifesto_adherence: 0.7, violations: ['faltou tamanho_cm', 'P5 jargao'] },
        state: { pass: false },
      },
    }]);
    await writeReport(dir, 'per-010-r2.json', [{
      id: 'per-010',
      status: 'fail',
      scores: {
        naturalidade: { media: 4.1 },
        manifesto: { m1_manifesto_adherence: 0.75, violations: ['bot pediu tamanho_cm proativo'] },
        state: { pass: true },
      },
    }]);
    const agg = await computeAggregate(dir);
    assert.equal(agg['per-010'].tamanho_cm_violations.length, 2);
    assert.ok(agg['per-010'].tamanho_cm_violations[0].includes('tamanho_cm'));
    assert.equal(agg['per-010'].state_pass_rate, 0.5);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});

test('computeAggregate: ignora reports com status error', async () => {
  const dir = await makeTmpDir();
  try {
    await writeReport(dir, 'per-009-r1.json', [{ id: 'per-009', status: 'error', error: 'http 502' }]);
    await writeReport(dir, 'per-009-r2.json', [{
      id: 'per-009',
      status: 'pass',
      scores: { naturalidade: { media: 4.5 }, manifesto: { m1_manifesto_adherence: 1 }, state: { pass: true } },
    }]);
    const agg = await computeAggregate(dir);
    assert.equal(agg['per-009'].nat.n, 1);
    assert.equal(agg['per-009'].nat.min, 4.5);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});

test('computeAggregate: grava aggregate.json no dir', async () => {
  const dir = await makeTmpDir();
  try {
    await writeReport(dir, 'per-001-r1.json', [{
      id: 'per-001',
      status: 'pass',
      scores: { naturalidade: { media: 4.0 }, manifesto: { m1_manifesto_adherence: 1 }, state: { pass: true } },
    }]);
    await computeAggregate(dir);
    const written = JSON.parse(await fs.readFile(path.join(dir, 'aggregate.json'), 'utf-8'));
    assert.ok(written['per-001']);
    assert.equal(written['per-001'].nat.media, 4.0);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});
```

- [ ] **Step 3: Run, confirm fail (módulo não existe)**

Run:
```bash
node --test tests/_lib/eval-harness/compute-variance.test.mjs 2>&1 | tail -10
```
Expected: FAIL com `Cannot find module '...compute-variance.mjs'` ou similar.

- [ ] **Step 4: Implementar compute-variance.mjs**

Create `evals/inkflow-agent/_harness/compute-variance.mjs`:

```javascript
#!/usr/bin/env node
// compute-variance.mjs — agrega N reports de baseline runs (por persona)
// → JSON com min/max/range/média/std + tamanho_cm violation list.
//
// API:
//   computeAggregate(dirPath) → object keyed by personaId
//   CLI: node compute-variance.mjs <dirPath>  → stdout JSON + grava aggregate.json

import fs from 'node:fs/promises';
import path from 'node:path';

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}

function statBlock(xs) {
  if (!xs.length) return { n: 0, min: null, max: null, range: null, media: null, std: null };
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  return { n: xs.length, min, max, range: max - min, media: mean(xs), std: std(xs) };
}

export async function computeAggregate(dirPath) {
  const files = (await fs.readdir(dirPath))
    .filter(f => f.endsWith('.json') && f !== 'aggregate.json');

  const byPersona = {};
  for (const f of files) {
    const raw = await fs.readFile(path.join(dirPath, f), 'utf-8');
    const doc = JSON.parse(raw);
    const results = Array.isArray(doc.results) ? doc.results : [doc];
    for (const r of results) {
      const id = r.id || 'unknown';
      if (!byPersona[id]) {
        byPersona[id] = { nats: [], manifestos: [], states: [], violations: [] };
      }
      if (r.status === 'error') continue;
      const nat = r.scores?.naturalidade?.media;
      const man = r.scores?.manifesto?.m1_manifesto_adherence;
      const statePass = r.scores?.state?.pass;
      if (typeof nat === 'number') byPersona[id].nats.push(nat);
      if (typeof man === 'number') byPersona[id].manifestos.push(man);
      if (typeof statePass === 'boolean') byPersona[id].states.push(statePass);
      const vs = r.scores?.manifesto?.violations || [];
      for (const v of vs) {
        if (typeof v === 'string' && v.toLowerCase().includes('tamanho_cm')) {
          byPersona[id].violations.push(v);
        }
      }
    }
  }

  const agg = {};
  for (const [id, b] of Object.entries(byPersona)) {
    agg[id] = {
      nat: statBlock(b.nats),
      manifesto: statBlock(b.manifestos),
      state_pass_rate: b.states.length ? b.states.filter(Boolean).length / b.states.length : null,
      tamanho_cm_violations: b.violations,
    };
  }

  await fs.writeFile(path.join(dirPath, 'aggregate.json'), JSON.stringify(agg, null, 2));
  return agg;
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Uso: compute-variance.mjs <dirPath>');
    process.exit(2);
  }
  computeAggregate(dir).then(agg => {
    console.log(JSON.stringify(agg, null, 2));
  }).catch(e => {
    console.error('FATAL', e);
    process.exit(2);
  });
}
```

- [ ] **Step 5: Run tests, confirm passam**

Run:
```bash
node --test tests/_lib/eval-harness/compute-variance.test.mjs 2>&1 | tail -10
```
Expected: 4 tests PASS.

- [ ] **Step 6: Run suite completa**

Run:
```bash
npm test 2>&1 | tail -5
```
Expected: `ℹ pass 457` (453 + 4 novos), `ℹ fail 0`.

- [ ] **Step 7: Commit**

Run:
```bash
git add evals/inkflow-agent/_harness/compute-variance.mjs tests/_lib/eval-harness/compute-variance.test.mjs
git commit -m "feat(eval-harness): compute-variance helper agrega N reports per persona"
```

---

## Task 5: D4 — run-baseline.sh wrapper

**Files:**
- Create: `evals/inkflow-agent/_harness/run-baseline.sh`

- [ ] **Step 1: Criar script**

Create `evals/inkflow-agent/_harness/run-baseline.sh`:

```bash
#!/usr/bin/env bash
# run-baseline.sh — roda N rounds × 3 personas, salva reports individualmente,
# computa variance.
#
# Uso:
#   ./run-baseline.sh <BASE_URL> [N=5]
#   JUDGE_MODEL=claude-sonnet-4-6-20251001 OUT_DIR=/tmp/eval-baseline-sonnet \
#     ./run-baseline.sh <BASE_URL> 3
#
# Env vars:
#   OUT_DIR (default /tmp/eval-baseline)
#   JUDGE_MODEL (passa pro run.mjs, default claude-haiku-4-5)
set -euo pipefail

BASE_URL="${1:?BASE_URL obrigatório como primeiro arg}"
N="${2:-5}"
OUT_DIR="${OUT_DIR:-/tmp/eval-baseline}"
PERSONAS=("per-001" "per-009" "per-010")

mkdir -p "$OUT_DIR"
echo "→ baseline: BASE_URL=$BASE_URL N=$N OUT_DIR=$OUT_DIR JUDGE_MODEL=${JUDGE_MODEL:-default-haiku}"

for persona in "${PERSONAS[@]}"; do
  for i in $(seq 1 "$N"); do
    echo "==> $persona round $i/$N"
    BASE_URL="$BASE_URL" node --env-file=evals/.env \
      evals/inkflow-agent/_harness/run.mjs \
      --category=directed --agent=tattoo --persona="$persona" || true
    # `|| true` porque run.mjs sai com 1 quando alguma persona falha — não queremos abortar a coleta
    cp evals/inkflow-agent/report.json "$OUT_DIR/${persona}-r${i}.json"
  done
done

echo "→ computing variance..."
node evals/inkflow-agent/_harness/compute-variance.mjs "$OUT_DIR"
echo "→ done. aggregate em $OUT_DIR/aggregate.json"
```

- [ ] **Step 2: chmod +x**

Run:
```bash
chmod +x evals/inkflow-agent/_harness/run-baseline.sh
ls -l evals/inkflow-agent/_harness/run-baseline.sh
```
Expected: `-rwxr-xr-x` (exec bit set).

- [ ] **Step 3: Smoke check sintaxe sem rodar**

Run:
```bash
bash -n evals/inkflow-agent/_harness/run-baseline.sh && echo "syntax OK"
```
Expected: `syntax OK`.

- [ ] **Step 4: Suite local mantém verde (sanity)**

Run:
```bash
npm test 2>&1 | tail -3
```
Expected: `ℹ pass 457` `ℹ fail 0`.

- [ ] **Step 5: Commit**

Run:
```bash
git add evals/inkflow-agent/_harness/run-baseline.sh
git commit -m "feat(eval-harness): run-baseline.sh wrapper N×3 personas"
```

---

## Task 6: Deploy preview com EVAL_MODE=true (dashboard CF)

> **CHECKPOINT MANUAL — exige acesso ao dashboard Cloudflare Pages.**
>
> Decisão de plano (não negociar inline): usar **dashboard CF Pages**, não CLI/sync-secrets. Motivo: dashboard tem seletor Preview vs Production explícito por env var, eliminando risco de vazar `EVAL_MODE` pra prod. `EVAL_MODE` não é credencial (é flag boolean), então o workflow Vault → .env.production de `[[feedback_secrets_via_vault_pessoal]]` não se aplica aqui.

**Files:**
- N/A (infra/deploy)

- [ ] **Step 1: Push da branch + open preview deploy**

Run:
```bash
git push -u origin feat/fix-eval-instrumentation
```
Expected: branch criada no origin, Cloudflare Pages dispara preview build automático.

- [ ] **Step 2: Identificar preview URL**

Aguardar build CF Pages (~2-3 min). Copiar URL do preview do dashboard CF Pages (formato `https://<hash>.inkflow-saas.pages.dev`). Anotar localmente — vai ser referenciado nas Tasks 7-9.

- [ ] **Step 3: Setar EVAL_MODE=true APENAS no preview env (dashboard)**

Passos exatos:
1. Acessar Cloudflare dashboard → Workers & Pages → `inkflow-saas` (Pages project)
2. Settings → Environment variables
3. Selecionar tab **Preview** (NÃO Production)
4. Add variable: name=`EVAL_MODE`, value=`true`
5. Save

**Validação crítica antes de prosseguir:** voltar pra mesma tela e conferir explicitamente que a tab **Production** NÃO contém `EVAL_MODE`. Se contiver, **deletar imediatamente** dessa tab. Tira screenshot ou anota o estado pra registrar no report (Task 10 DoD #3).

- [ ] **Step 4: Re-deploy preview pra picar up a env var**

Trigger re-deploy via empty commit:

```bash
git commit --allow-empty -m "chore: trigger preview re-deploy com EVAL_MODE"
git push
```

Aguardar build verde no CF Pages dashboard. Sem este re-deploy, a env var não fica disponível no runtime.

- [ ] **Step 5: Checkpoint**

Não há commit de código de feature nesta task (apenas empty commit pra trigger). Próxima task valida que `EVAL_MODE` funciona no edge runtime.

---

## Task 7: Spike pré-baseline — confirmar EVAL_MODE não quebra preview

> **CHECKPOINT MANUAL — execução remota.** Mitiga Risco #1 do spec: `temperature: 0` em CF Workers edge runtime poderia ter incompatibilidade.

**Files:**
- N/A (execução de smoke)

- [ ] **Step 1: 1 call manual ao preview, persona simples**

Run (substituir `$PREVIEW_URL`):
```bash
PREVIEW_URL="<colar-url-do-preview>"
BASE_URL="$PREVIEW_URL" node --env-file=evals/.env \
  evals/inkflow-agent/_harness/run.mjs \
  --category=directed --agent=tattoo --persona=per-001 2>&1 | tail -20
```
Expected: `→ per-001 ... ✅` ou `❌ falhou em: ...` (FAIL de scoring é aceitável aqui — o que NÃO pode acontecer é `http 500` ou `network error`).

- [ ] **Step 2: Se 500, parar e diagnosticar**

Se falhar com 5xx ou network error, capturar response body:
```bash
BASE_URL="$PREVIEW_URL" node --env-file=evals/.env \
  evals/inkflow-agent/_harness/run.mjs \
  --category=directed --agent=tattoo --persona=per-001 \
  --capture-500-body 2>&1 | tail -30
```

Se confirmado quebrado pelo `temperature: 0`, aplicar fallback do spec §6 Risco #1: trocar pra `temperature: 0.1` em runtime.js, repetir Task 3 steps 3-6. Esse é path de exceção; idealmente não dispara.

- [ ] **Step 3: Se OK, marcar checkpoint**

Resposta 200 com transcript completo (mesmo se DoD scoring falhar) = `EVAL_MODE` não quebrou edge runtime. Prosseguir.

- [ ] **Step 4: Smoke prod sem EVAL_MODE (DoD #3)**

Run:
```bash
BASE_URL="https://inkflowbrasil.com" node --env-file=evals/.env \
  evals/inkflow-agent/_harness/run.mjs \
  --category=directed --agent=tattoo --persona=per-001 2>&1 | tail -10
```
Expected: 200 OK, transcript completo (DoD scoring pode falhar — não importa aqui). O que importa: prod responde igual a antes (gate `EVAL_MODE` ausente em prod = comportamento intocado).

- [ ] **Step 5: Sem commit (apenas checkpoint manual)**

Documentar o resultado dos steps 1, 3 e 4 em scratch local — vai entrar no report da Task 10.

---

## Task 8: Baseline N=5 × 3 personas (haiku judge)

> **CHECKPOINT MANUAL — execução remota, ~15 runs × ~$0.05 = ~$0.75.**

**Files:**
- N/A (execução)
- Outputs em: `/tmp/eval-baseline/` (15 reports + aggregate.json)

- [ ] **Step 1: Limpar OUT_DIR de runs anteriores**

Run:
```bash
rm -rf /tmp/eval-baseline
mkdir -p /tmp/eval-baseline
```

- [ ] **Step 2: Rodar baseline**

Run (substituir `$PREVIEW_URL`):
```bash
PREVIEW_URL="<colar-url-do-preview>"
./evals/inkflow-agent/_harness/run-baseline.sh "$PREVIEW_URL" 5 2>&1 | tee /tmp/eval-baseline/run.log
```
Expected: 15 runs (`==> per-001 round 1/5` ... `==> per-010 round 5/5`), reports salvos, `→ done. aggregate em /tmp/eval-baseline/aggregate.json` no fim.

Duração estimada: ~15-25 min (15 runs × ~60-90s/run incluindo bot + judge calls).

- [ ] **Step 3: Inspecionar aggregate**

Run:
```bash
cat /tmp/eval-baseline/aggregate.json
```
Expected: JSON com 3 keys (per-001, per-009, per-010), cada uma com `nat.range`, `manifesto.range`, `state_pass_rate`, `tamanho_cm_violations`.

**Checkpoint mental — vai pra DoD na Task 10:**
- DoD #1: cada `nat.range` ≤ 0.6
- DoD #2: `tamanho_cm_violations` arrays vazios em runs com 4 OBR coletados

- [ ] **Step 4: Sem commit**

Reports em `/tmp` são transientes. Aggregate vai pro report markdown na Task 10.

---

## Task 9: Spike informativo — sonnet judge N=3 per-001

> **CHECKPOINT MANUAL — execução remota, ~3 runs × ~$0.10 (sonnet 5x mais caro) = ~$0.30.**

**Files:**
- N/A (execução)
- Outputs em: `/tmp/eval-baseline-sonnet/` (3 reports + aggregate.json)

- [ ] **Step 1: Limpar OUT_DIR**

Run:
```bash
rm -rf /tmp/eval-baseline-sonnet
mkdir -p /tmp/eval-baseline-sonnet
```

- [ ] **Step 2: Rodar spike inline (apenas per-001)**

Como o spike pede apenas per-001, usar variant ad-hoc:

```bash
PREVIEW_URL="<colar-url-do-preview>"
JUDGE_MODEL=claude-sonnet-4-6-20251001 \
OUT_DIR=/tmp/eval-baseline-sonnet \
bash -c '
set -euo pipefail
mkdir -p "$OUT_DIR"
for i in 1 2 3; do
  echo "==> per-001 sonnet round $i/3"
  BASE_URL="'"$PREVIEW_URL"'" JUDGE_MODEL="$JUDGE_MODEL" node --env-file=evals/.env \
    evals/inkflow-agent/_harness/run.mjs \
    --category=directed --agent=tattoo --persona=per-001 || true
  cp evals/inkflow-agent/report.json "$OUT_DIR/per-001-r${i}.json"
done
node evals/inkflow-agent/_harness/compute-variance.mjs "$OUT_DIR"
'
```

> Alternativa: poderia generalizar run-baseline.sh com flag `--persona=` pra fazer override; spec marcou como YAGNI. Inline script ad-hoc é suficiente.

- [ ] **Step 3: Inspecionar aggregate sonnet**

Run:
```bash
cat /tmp/eval-baseline-sonnet/aggregate.json
```
Expected: JSON com 1 key (per-001) com `nat.range`.

**Comparação informativa (vai pro report na Task 10):**
- Haiku per-001 range (5 rounds) vs sonnet per-001 range (3 rounds)
- Se sonnet range ≤ 50% do haiku range → forte sinal pra upgrade default em sub-spec futura. Senão, datapoint registrado.

- [ ] **Step 4: Sem commit**

---

## Task 10: Report — DoD validation

**Files:**
- Create: `docs/inkflow-agent/reports/2026-05-18-eval-instrumentation-baseline.md`

- [ ] **Step 1: Decidir sobre report.json stashed**

Run:
```bash
git stash list | head -3
```

Default: drop o stash (o report transient não é útil pra esta sub-spec). Decisão alternativa do Leandro pode ser `git stash pop` se quiser comparar evolução.

- [ ] **Step 2: Escrever report final**

Create `docs/inkflow-agent/reports/2026-05-18-eval-instrumentation-baseline.md`:

```markdown
# Fix Eval Instrumentation — Baseline Report

**Data:** 2026-05-18
**Branch:** `feat/fix-eval-instrumentation` (PR → main)
**Spec:** `docs/superpowers/specs/2026-05-18-fix-eval-instrumentation-design.md`
**Plan:** `docs/superpowers/plans/2026-05-18-fix-eval-instrumentation.md`
**Predecessor:** `docs/inkflow-agent/reports/2026-05-18-eval-sub-spec-b-pivot-naturalidade.md`

---

## 1. Deliverables aplicados

- [x] D1 — judge-prompt P2 hardener anti-tamanho_cm
- [x] D2 — verify run.mjs já tinha temperature=0 + JUDGE_MODEL (commit anterior)
- [x] D3 — runtime.js temperature gated por EVAL_MODE
- [x] D4 — run-baseline.sh + compute-variance.mjs
- [x] Preview deploy com EVAL_MODE=true setado APENAS em Preview env (Production env confirmado SEM essa var)

## 2. DoD — resultados

### DoD #1: Variância nat ≤ 0.6 per persona (N=5)

| Persona | nat.min | nat.max | nat.range | Veredito |
|---|---|---|---|---|
| per-001 | <fill> | <fill> | <fill> | <PASS/FAIL> |
| per-009 | <fill> | <fill> | <fill> | <PASS/FAIL> |
| per-010 | <fill> | <fill> | <fill> | <PASS/FAIL> |

Origem dos números: `/tmp/eval-baseline/aggregate.json`.

### DoD #2: Zero falso-positivo tamanho_cm (15 runs)

Greps de `tamanho_cm` em `violations` onde 4 OBR foram coletados: **<X> matches**.
Veredito: <PASS/FAIL>.

Detalhes: <copiar `tamanho_cm_violations` por persona do aggregate>.

### DoD #3: Bot temperature pin não quebra prod

- Smoke manual prod (`BASE_URL=https://inkflowbrasil.com`, sem EVAL_MODE): <200/error>
- Smoke manual preview (`BASE_URL=<preview>`, EVAL_MODE=true): <200/error>
- Dashboard CF Pages confirmou `EVAL_MODE` setado apenas em Preview env (Production sem essa var): <SIM/NÃO>
- Grep `EVAL_MODE` em `functions/_lib/agent-runtime/runtime.js`: 1 match (line <X>).

Veredito: <PASS/FAIL>.

### DoD #4: Suite local 450/450

Resultado de `npm test`: <X>/<X> PASS.
> Tests adicionados nesta sub-spec: 3 (runtime EVAL_MODE) + 4 (compute-variance) = 7 novos. Total esperado: 457.

Veredito: <PASS/FAIL>.

### DoD #5: Spike sonnet documentado (informativo, não bloqueia)

- Haiku per-001 range (5 rounds): <X>
- Sonnet per-001 range (3 rounds): <X>
- Razão (sonnet/haiku): <X>
- Conclusão direcional: <forte indicação de upgrade | datapoint inconcludente>

## 3. Veredito geral

- DoD #1: <PASS/FAIL>
- DoD #2: <PASS/FAIL>
- DoD #3: <PASS/FAIL>
- DoD #4: <PASS/FAIL>
- DoD #5: informativo (PASS por definição se documentado)

**Resultado:** <PASS / FAIL>.

### Próxima ação

<Se PASS:> sub-spec C (escolha entre C.1 playbook §4.7, C.3 audit tom per-010, ou outra) roda contra instrumento novo. Pode incluir re-avaliação de sub-spec A (PR #72) e B com instrumento novo.

<Se FAIL:> escalar pra Opção 3 — reforma metodológica completa (test cases ouro labeled manualmente, dashboards, review de todos 3 judge prompts). Spec dedicada em sub-spec separada.

## 4. Custo real

- Baseline N=5×3: $<X>
- Spike sonnet N=3: $<X>
- **Total: $<X>** (cap $2).

## 5. Cross-references

- Spec instrumentação: `docs/superpowers/specs/2026-05-18-fix-eval-instrumentation-design.md`
- Plan: `docs/superpowers/plans/2026-05-18-fix-eval-instrumentation.md`
- Aggregate haiku: `/tmp/eval-baseline/aggregate.json` (transient — anexar resumo aqui)
- Aggregate sonnet: `/tmp/eval-baseline-sonnet/aggregate.json` (transient)
```

- [ ] **Step 3: Preencher `<fill>` e `<X>` com números reais**

Manualmente — copiando de `cat /tmp/eval-baseline/aggregate.json` e `cat /tmp/eval-baseline-sonnet/aggregate.json`. Computar veredito DoD #1 (≤0.6 → PASS), DoD #2 (0 matches → PASS), DoD #3 (200/200 + dashboard validado → PASS), DoD #4 (npm test 457/457 → PASS).

- [ ] **Step 4: Commit do report**

Run:
```bash
git add docs/inkflow-agent/reports/2026-05-18-eval-instrumentation-baseline.md
git commit -m "docs(eval): baseline report fix-eval-instrumentation — DoD <PASS/FAIL>"
```

---

## Task 11: DoD final + PR pra main

**Files:**
- N/A (PR ops)

- [ ] **Step 1: Re-run suite local final**

Run:
```bash
npm test 2>&1 | tail -5
```
Expected: `ℹ pass 457` (450 baseline + 3 runtime + 4 compute-variance), `ℹ fail 0`.

Se != 457: investigar discrepância antes do PR.

- [ ] **Step 2: Conferir git log da branch**

Run:
```bash
git log main..HEAD --oneline
```
Expected (6-7 commits):
- `docs(plan): fix eval instrumentation`
- `fix(eval-judge): hardener P2 anti-falso-positivo tamanho_cm`
- `feat(runtime): pin temperature=0 gated por EVAL_MODE`
- `feat(eval-harness): compute-variance helper agrega N reports per persona`
- `feat(eval-harness): run-baseline.sh wrapper N×3 personas`
- `chore: trigger preview re-deploy com EVAL_MODE`
- `docs(eval): baseline report fix-eval-instrumentation — DoD <verdict>`

- [ ] **Step 3: Push final + open PR (apenas se DoD PASS)**

Run:
```bash
git push
gh pr create --base main --title "fix(eval-instrumentation): pin temp + hardener P2 + baseline harness" --body "$(cat <<'EOF'
## Summary
- D1 hardener judge-prompt manifesto-adherence P2 anti-falso-positivo `tamanho_cm`
- D3 pin `temperature: 0` em `runtime.js` gated por `EVAL_MODE` env (prod intocado)
- D4 novo `run-baseline.sh` + `compute-variance.mjs` pra coletar N×3 reports + agregar variance
- Baseline N=5×3 personas + spike sonnet N=3 documentados em report

## DoD
- [x/<X>] Variância nat ≤ 0.6 per persona
- [x/<X>] Zero falso-positivo `tamanho_cm` em 15 runs
- [x/<X>] Bot temp pin não quebra prod (gate `EVAL_MODE`)
- [x/<X>] Suite local 457/457
- [x] Spike sonnet documentado (informativo)

## Test plan
- [ ] CF Pages preview build verde com `EVAL_MODE=true`
- [ ] Smoke prod (`https://inkflowbrasil.com`) sem `EVAL_MODE` responde 200 igual a antes
- [ ] Report `docs/inkflow-agent/reports/2026-05-18-eval-instrumentation-baseline.md` linkado neste PR

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Se DoD FAIL, NÃO abrir PR**

Em vez disso: documentar FAIL no report, abrir sub-spec separada pra Opção 3 (reforma metodológica completa). Branch fica pendente pra retomar.

- [ ] **Step 5: Pós-merge — manter EVAL_MODE secret no preview**

> Pós-merge ops, não bloqueia plan: secret `EVAL_MODE=true` no Preview environment fica setado pra futuros sub-specs C que precisem rodar baseline. Documentar em [[InkFlow — Painel]] que preview tem essa secret persistente (apenas em Preview, Production segue sem ela).

---

## Self-review (executada antes de entregar este plano)

**Spec coverage:**
- §3 arquitetura branch strategy → Task 1
- §3 6 pontos de mudança → Tasks 2-5
- §4 D1 hardener → Task 2
- §4 D2 pin temp judge → Task 2 step 1 sanity check (já implementado em commit anterior)
- §4 D3 EVAL_MODE bot → Task 3 (TDD)
- §4 D4 baseline script + variance → Tasks 4-5
- §4 D5 spike sonnet → Task 9
- §5 DoD 5 critérios → Task 10 report
- §6 riscos → flagados nas Tasks 6-7 (EVAL_MODE scope, edge runtime)
- §7 integração ordem dos commits → tasks 1-11 seguem ordem
- §7 dependências externas (dashboard CF, JUDGE_MODEL env) → Task 6

**Sem placeholders detectáveis:** code blocks completos em todos os steps de edit/create. Steps de execução remota explicitamente marcados como CHECKPOINT MANUAL.

**Type consistency:** `EVAL_MODE` string `'true'` consistente em runtime.js + tests; `JUDGE_MODEL` env var idem; `OUT_DIR` consistente em run-baseline.sh + compute-variance.mjs CLI args.

**Total tasks:** 11 (≤15 soft limit ✅).

**Não cobertos (intencional — non-goals do spec §2):**
- Test cases ouro labeled (Opção 3)
- Dashboards (Opção 3)
- Pinar seed do prompt (próximo nível)
- Re-avaliar sub-spec A/B com instrumento novo (sub-spec separada)
