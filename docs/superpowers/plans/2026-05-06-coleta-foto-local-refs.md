# Coleta foto_local + altura_cliente + estilo + R9 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refator da fase TATTOO do Modo Coleta v2 — promover foto_local + altura_cm + estilo a OBR_RECOMENDADO via single shots pós-3 OBR técnicos, criar campo `altura_cm` persistido, cravar princípio R9 + T7 ("devolver contradições, nunca decidir pelo cliente"), atualizar payload Telegram com altura.

**Architecture:** Mudanças contidas no prompt da fase tattoo (3 files: fluxo, regras, few-shot) + 3 backend tools (dados-coletados, enviar-orcamento-tatuador, guardrails). Sem migration (JSONB livre). Sem feature flag (rollback = revert PR). TDD task-by-task: test fail → impl → test pass → commit.

**Tech Stack:** Cloudflare Pages Functions (JS ESM), `node:test` + `node:assert/strict` test runner, snapshot tests via `scripts/update-prompt-snapshots.sh`, n8n workflow inalterado nesta sessão.

**Spec:** `inkflow-saas/docs/superpowers/specs/2026-05-06-coleta-foto-local-refs-design.md`

**Branch:** `feat/coleta-foto-local-refs` (já criada, spec commitada em `42196b0`)

**Tests baseline:** Suite `bash scripts/test-prompts.sh` precisa estar 100% verde antes de começar (~315/315 ou current count). Após plano: ~327/327 (12 novos).

**Calibração subagent-driven** (referência por task — pipeline-completa = brainstorm + implementer + 2 reviewers; implementer-only = só dispatch implementer; direto = Claude principal sem subagent):

| Task | Complexidade | Calibração |
|---|---|---|
| T1 | trivial | direto |
| T2, T3 | médio (mecânico) | implementer-only |
| T4 | trivial | direto |
| T5 | denso (prompt refator crítico) | pipeline-completa |
| T6 | denso (R9 princípio crítico) | pipeline-completa |
| T7 | denso (alto risco pseudo-código) | pipeline-completa |
| T8 | trivial (audit) | direto |
| T9 | mecânico | implementer-only |
| T10, T11, T12 | trivial | direto |
| T13 | manual (Leandro) | direto Leandro |
| T14 | trivial | direto |

---

## File Structure

| File | Action |
|---|---|
| `functions/_lib/prompts/coleta/tattoo/fluxo.js` | Reescrita (§3.2 + §3.3 + remove §3.3c + §3.4 + §3.5) |
| `functions/_lib/prompts/coleta/tattoo/regras.js` | Adiciona R9 + T7, reescreve T2/T3 |
| `functions/_lib/prompts/coleta/tattoo/few-shot.js` | Substitui 5 cenários antigos por 10 cenários novos (cobre OBR_RECOMENDADO + R9 contradições) |
| `functions/_lib/prompts/coleta/tattoo/few-shot-tenant.js` | Audit (sem mudança, apenas verifica não-contradição com R9) |
| `functions/api/tools/dados-coletados.js` | Adiciona `altura_cm` ao CAMPOS_TATTOO + helper `normalizarAltura()` + bloco de validação |
| `functions/api/tools/enviar-orcamento-tatuador.js` | Adiciona linha condicional `altura cliente: ${cm}cm` no payload |
| `functions/_lib/guardrails.js` | Adiciona regex de detecção altura (1 linha na `extrairCamposCitados`) |
| `tests/prompts/invariants.test.mjs` | Adiciona 5 invariants novos |
| `tests/tools/dados-coletados.test.mjs` | Adiciona 6 tests pra `altura_cm` |
| `tests/tools/enviar-orcamento-tatuador.test.mjs` | Adiciona 2 tests pra payload com altura |
| `tests/prompts/snapshots/coleta-tattoo.txt` | Regenerado via `bash scripts/update-prompt-snapshots.sh` |

---

### Task 1: Pre-flight + baseline

**Files:** (read-only checks)

- [ ] **Step 1: Confirmar branch correta**

Run: `git branch --show-current`
Expected: `feat/coleta-foto-local-refs`

- [ ] **Step 2: Confirmar working tree limpa (apenas spec commitada)**

Run: `git status`
Expected: `nothing to commit, working tree clean`. HEAD em `42196b0` (spec commit).

- [ ] **Step 3: Rodar suite baseline**

Run: `bash scripts/test-prompts.sh`
Expected: `✓ Todos os tests passaram.` no fim. Anote o número de tests count pra comparar depois.

- [ ] **Step 4: Verificar paths críticos existem**

Run: `ls functions/_lib/prompts/coleta/tattoo/{fluxo,regras,few-shot,few-shot-tenant}.js && ls functions/api/tools/{dados-coletados,enviar-orcamento-tatuador}.js && ls functions/_lib/guardrails.js && ls tests/prompts/{invariants.test.mjs,snapshots/coleta-tattoo.txt} && ls tests/tools/{dados-coletados,enviar-orcamento-tatuador}.test.mjs`
Expected: todos paths listados sem erro.

- [ ] **Step 5: Sem commit nesta task** — pre-flight é validação, não muda código.

---

### Task 2: Backend `altura_cm` em dados-coletados.js (TDD)

**Files:**
- Modify: `functions/api/tools/dados-coletados.js` (adicionar campo + helper + validação)
- Test: `tests/tools/dados-coletados.test.mjs` (adicionar 6 tests novos)

- [ ] **Step 1: Escrever tests novos pra altura_cm (FAIL primeiro)**

Adicione no FIM de `tests/tools/dados-coletados.test.mjs` (depois do último `test(...)` existente). O arquivo usa pattern de mock global de `fetch` via `mockSuccessFlow()` + `buildContext()` + `onRequest(ctx)` (já presentes no arquivo). **Cada test deve seguir o mesmo padrão dos tests existentes**: salvar `origFetch`, chamar `mockSuccessFlow()`, `try { ... } finally { globalThis.fetch = origFetch; }`.

```javascript
// ── altura_cm — formatos aceitos ───────────────────────────────────────
test('dados_coletados: altura_cm aceita number 170 (cm direto)', async () => {
  const origFetch = globalThis.fetch;
  mockSuccessFlow();
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, campo: 'altura_cm', valor: 170 });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.valor, 170);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: altura_cm aceita string "1.70" (m com ponto)', async () => {
  const origFetch = globalThis.fetch;
  mockSuccessFlow();
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, campo: 'altura_cm', valor: '1.70' });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.valor, 170);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: altura_cm aceita string "1,70" (m com vírgula pt-BR)', async () => {
  const origFetch = globalThis.fetch;
  mockSuccessFlow();
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, campo: 'altura_cm', valor: '1,70' });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.valor, 170);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: altura_cm aceita string "1m70" (informal pt-BR)', async () => {
  const origFetch = globalThis.fetch;
  mockSuccessFlow();
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, campo: 'altura_cm', valor: '1m70' });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.valor, 170);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: altura_cm rejeita formato inválido ("altura média")', async () => {
  const origFetch = globalThis.fetch;
  mockSuccessFlow();
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, campo: 'altura_cm', valor: 'altura média' });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.ok, false);
    assert.match(body.error, /altura_cm formato/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: altura_cm rejeita range fora 50-250 (350cm)', async () => {
  const origFetch = globalThis.fetch;
  mockSuccessFlow();
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, campo: 'altura_cm', valor: 350 });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.ok, false);
    assert.match(body.error, /range/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('dados_coletados: altura_cm NAO bloqueia auto_transition (3 OBR técnicos sem altura ainda transicionam)', async () => {
  // RPC vai retornar new_estado='coletando_cadastro' quando 3 OBR técnicos
  // ficarem completos. Testa que altura_cm é independente — chama local_corpo
  // como o 3º OBR técnico e verifica que proxima_fase aparece mesmo sem altura.
  const origFetch = globalThis.fetch;
  // initialRow já tem descrição+tamanho — vai completar com local_corpo
  const initial = {
    id: CONVERSA_ID, tenant_id: TENANT_ID, telefone: TELEFONE,
    estado_agente: 'coletando_tattoo', estado: 'qualificando',
    dados_coletados: { descricao_tattoo: 'rosa', tamanho_cm: 10 },
    dados_cadastro: {},
  };
  mockSuccessFlow(initial);
  try {
    const ctx = buildContext({ tenant_id: TENANT_ID, telefone: TELEFONE, campo: 'local_corpo', valor: 'antebraço' });
    const res = await onRequest(ctx);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.proxima_fase, 'cadastro');
  } finally {
    globalThis.fetch = origFetch;
  }
});
```

**Nota:** os helpers `mockSuccessFlow`, `buildContext`, `onRequest`, e os constants `TENANT_ID`/`TELEFONE`/`CONVERSA_ID` já existem no início do arquivo. Não há necessidade de adicionar imports novos.

- [ ] **Step 2: Rodar tests pra confirmar FAIL**

Run: `node --test tests/tools/dados-coletados.test.mjs 2>&1 | tail -30`
Expected: 6 tests novos FAIL com `altura_cm formato invalido` ou `campo invalido: altura_cm` (porque ainda não está em `CAMPOS_TATTOO`).

- [ ] **Step 3: Implementar `altura_cm` em dados-coletados.js**

Em `functions/api/tools/dados-coletados.js`:

3a. Atualizar `CAMPOS_TATTOO` (linha ~36):

```javascript
const CAMPOS_TATTOO = ['descricao_tattoo', 'tamanho_cm', 'local_corpo', 'estilo', 'foto_local', 'refs_imagens', 'altura_cm'];
```

3b. Adicionar helper `normalizarAltura()` logo APÓS a função `isoFromParts` (em torno da linha 96, antes de `calcularIdade`):

```javascript
// Aceita: 170, "170", "1.70", "1,70", "1.70m", "170cm", "1m70" (informal pt-BR).
// Retorna cm inteiro (50-250 range válido) ou null.
function normalizarAltura(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input < 3 ? Math.round(input * 100) : Math.round(input);
  }
  const s = String(input).toLowerCase().trim()
    .replace(/cm/g, '').replace(/\s/g, '')
    .replace(',', '.');
  // "1m70" → 170
  const mMatch = s.match(/^(\d+)m(\d+)$/);
  if (mMatch) {
    return Number(mMatch[1]) * 100 + Number(mMatch[2].padEnd(2, '0').slice(0, 2));
  }
  const cleaned = s.replace(/m$/, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 3 ? Math.round(n * 100) : Math.round(n);
}
```

3c. Adicionar bloco de validação `altura_cm` no handle (em `handle({ env, input })`, dentro do bloco "7. Campo de tattoo", logo APÓS o bloco `else if (campo === 'tamanho_cm')` que termina por volta da linha 240):

```javascript
} else if (campo === 'altura_cm') {
  const cm = normalizarAltura(valor);
  if (cm === null) {
    return { status: 400, body: { ok: false, error: `altura_cm formato invalido: ${valor}` } };
  }
  if (cm < 50 || cm > 250) {
    return { status: 400, body: { ok: false, error: `altura_cm fora do range esperado (50-250cm): ${cm}` } };
  }
  patch = { altura_cm: cm };
}
```

3d. Adicionar `normalizarAltura` ao bloco de exports no final do arquivo:

```javascript
export { normalizarData, calcularIdade, normalizarAltura, CAMPOS_TATTOO, CAMPOS_CADASTRO, OBR_TATTOO };
```

- [ ] **Step 4: Rodar tests pra confirmar PASS**

Run: `node --test tests/tools/dados-coletados.test.mjs 2>&1 | tail -20`
Expected: TODOS tests PASS (existentes + 6 novos). Sem failures.

- [ ] **Step 5: Commit**

```bash
git add functions/api/tools/dados-coletados.js tests/tools/dados-coletados.test.mjs
git commit -m "$(cat <<'EOF'
feat(coleta-tattoo): adiciona campo altura_cm em dados-coletados

altura_cm vira campo próprio persistido em conversas.dados_coletados.
Aceita formatos: 170 (cm), "1.70" (m), "1,70" (m pt-BR), "1m70".
Helper normalizarAltura converte tudo pra cm inteiro.
Validação: range 50-250cm; rejeita formato/range inválido.

altura_cm NÃO bloqueia auto_transition_to_cadastro — RPC continua
disparando em OBR_TATTOO original (descrição/tamanho/local).

6 tests novos cobrindo formatos aceitos, formato inválido, range, e
não-bloqueio de transição.

Spec: docs/superpowers/specs/2026-05-06-coleta-foto-local-refs-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Backend payload Telegram com altura (TDD)

**Files:**
- Modify: `functions/api/tools/enviar-orcamento-tatuador.js` (adicionar linha de altura no `montarTextoOrcamento`)
- Test: `tests/tools/enviar-orcamento-tatuador.test.mjs` (adicionar 2 tests novos)

- [ ] **Step 1: Atualizar import + escrever tests novos (FAIL primeiro)**

`montarTextoOrcamento` já é exportado em `enviar-orcamento-tatuador.js` (linha 197 atual: `export { gerarOrcid, montarTextoOrcamento, inlineKeyboard };`) MAS ainda **não está importado** no test file. Atualizar o import no topo do `tests/tools/enviar-orcamento-tatuador.test.mjs`:

De:
```javascript
import { onRequest } from '../../functions/api/tools/enviar-orcamento-tatuador.js';
```

Para:
```javascript
import { onRequest, montarTextoOrcamento } from '../../functions/api/tools/enviar-orcamento-tatuador.js';
```

Adicionar no FIM do arquivo (após o último `test(...)`):

```javascript
// ── Payload Telegram inclui altura_cm condicional ─────────────────────
test('montarTextoOrcamento: inclui linha "altura cliente: 170cm" quando altura_cm preenchida', () => {
  const conv = {
    dados_coletados: { descricao_tattoo: 'rosa', tamanho_cm: 10, local_corpo: 'antebraço', altura_cm: 170 },
    dados_cadastro: { nome: 'Maria Silva', data_nascimento: '1995-03-12' },
  };
  const texto = montarTextoOrcamento('orc_abc123', conv);
  assert.match(texto, /altura cliente: 170cm/);
});

test('montarTextoOrcamento: omite linha de altura quando altura_cm vazia', () => {
  const conv = {
    dados_coletados: { descricao_tattoo: 'rosa', tamanho_cm: 10, local_corpo: 'antebraço' },
    dados_cadastro: { nome: 'Maria Silva', data_nascimento: '1995-03-12' },
  };
  const texto = montarTextoOrcamento('orc_abc123', conv);
  assert.doesNotMatch(texto, /altura cliente/);
});
```

**Nota:** `montarTextoOrcamento` é função pura (recebe orcid + conv, retorna string) — não precisa de mock de fetch. Tests acima são síncronos (sem `async`).

- [ ] **Step 2: Rodar tests pra confirmar FAIL**

Run: `node --test tests/tools/enviar-orcamento-tatuador.test.mjs 2>&1 | tail -20`
Expected: 2 tests novos FAIL — primeiro test não encontra `altura cliente:` no texto.

- [ ] **Step 3: Implementar linha condicional**

Em `functions/api/tools/enviar-orcamento-tatuador.js`, na função `montarTextoOrcamento` (em torno da linha 71-77), adicionar 1 linha após `if (estilo) linhas.push(\`   • estilo: ${estilo}\`);`:

```javascript
if (estilo) linhas.push(`   • estilo: ${estilo}`);
if (dat.altura_cm) linhas.push(`   • altura cliente: ${dat.altura_cm}cm`);  // ⚡ NOVO
linhas.push('');
linhas.push(`📸 Fotos: ${fotos} do local, ${refs} referência${refs === 1 ? '' : 's'}`);
```

- [ ] **Step 4: Rodar tests pra confirmar PASS**

Run: `node --test tests/tools/enviar-orcamento-tatuador.test.mjs 2>&1 | tail -20`
Expected: TODOS tests PASS (existentes + 2 novos).

- [ ] **Step 5: Commit**

```bash
git add functions/api/tools/enviar-orcamento-tatuador.js tests/tools/enviar-orcamento-tatuador.test.mjs
git commit -m "$(cat <<'EOF'
feat(coleta-tattoo): payload Telegram inclui altura_cm condicional

montarTextoOrcamento adiciona linha "altura cliente: {cm}cm" quando
dados_coletados.altura_cm está preenchida. Omite quando ausente.

Estilo (já existente) mantido inalterado. Foto real continua não
anexada — escopo B (backlog P0 coleta-fotos-no-telegram-storage).

2 tests novos cobrindo presença + omissão.

Spec: docs/superpowers/specs/2026-05-06-coleta-foto-local-refs-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Backend guardrails — detecção altura

**Files:**
- Modify: `functions/_lib/guardrails.js` (1 linha na função `extrairCamposCitados`)

- [ ] **Step 1: Adicionar regex de detecção**

Em `functions/_lib/guardrails.js`, na função `extrairCamposCitados` (linha 64 atual tem detecção de `foto_local`), adicione 1 linha após a regex de foto_local:

```javascript
if (/\bfoto do local\b|\bmanda uma foto\b/.test(t)) keys.push('foto_local');
if (/\baltura\b|\bquanto.*alto\b|\bm de altura\b/.test(t)) keys.push('altura_cm');  // ⚡ NOVO
```

- [ ] **Step 2: Smoke check manual** (sem test dedicado — guardrails é hint passivo, não muda comportamento)

Run: `node -e "const m = await import('./functions/_lib/guardrails.js'); console.log(m.extrairCamposCitados('Manda tua altura pra eu calcular a proporção'));"`
Expected: array contém `'altura_cm'`.

- [ ] **Step 3: Rodar suite completa pra garantir não-regressão**

Run: `bash scripts/test-prompts.sh 2>&1 | tail -10`
Expected: `✓ Todos os tests passaram.` no fim.

- [ ] **Step 4: Commit**

```bash
git add functions/_lib/guardrails.js
git commit -m "$(cat <<'EOF'
feat(coleta-tattoo): guardrails detecta menção a altura

Regex adicionada em extrairCamposCitados detecta cliente perguntando
sobre/mencionando altura ("manda tua altura", "1.70m de altura",
"quanto tu é alto"). Hint passivo pro contexto LLM.

Spec: docs/superpowers/specs/2026-05-06-coleta-foto-local-refs-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Reescrever `fluxo.js` da fase tattoo

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/fluxo.js` (reescrita completa, mantém formato `linhas.push`)

> **Calibração:** PIPELINE-COMPLETA (refator denso de prompt crítico). Quando rodar via subagent-driven-development, dispatch implementer + 2 reviewers. Em executing-plans inline, leia spec inteiro antes de mexer.

- [ ] **Step 1: Reescrever `fluxo.js` inteiro**

Substituir conteúdo de `functions/_lib/prompts/coleta/tattoo/fluxo.js` por:

```javascript
// ── §3 FLUXO — modo Coleta v2, fase TATTOO ─────────────────────────────────
// Fase 1 do Modo Coleta. Coleta os 3 OBR técnicos da tattoo
// (descricao_tattoo, tamanho_cm, local_corpo) + 3 OBR_RECOMENDADO via single
// shots pós-3 OBR técnicos (foto_local, altura_cm, estilo). NÃO chama
// calcular_orcamento. NÃO fala valor. NÃO pede dados de cadastro nesta fase.
// Após 3 OBR técnicos coletados, a tool `dados_coletados` transiciona estado
// pra `coletando_cadastro` automaticamente, mas o BOT continua percorrendo
// (ou pulando) os single shots OBR_RECOMENDADO ANTES de enviar a §3.4
// mensagem-ponte de cadastro.
export function fluxo(tenant, clientContext) {
  const nomeAg = tenant.nome_agente || 'atendente';
  const nomeEst = tenant.nome_estudio || 'estudio';

  const linhas = ['# §3 FLUXO'];
  linhas.push('Sua missão nesta fase: coletar 3 OBR técnicos da tattoo (descrição, tamanho, local) + 3 OBR_RECOMENDADO via single shots (foto, altura, estilo). Você NÃO orça, NÃO fala valor, NÃO agenda. Você também NÃO pede dados de cadastro nesta fase — isso vem depois.');
  linhas.push('');

  // §3.1 Saudação inicial
  linhas.push('## §3.1 Saudacao inicial (so no PRIMEIRO turno do PRIMEIRO contato)');
  linhas.push('Envie em 2 baloes separados por UMA LINHA EM BRANCO (aperte Enter 2x — NUNCA escreva \\n literal):');
  linhas.push(`- Balao 1: variacao de "Oii, tudo bem? Aqui e ${nomeAg} do ${nomeEst}"`);
  linhas.push('- Balao 2: "Me conta o que esta pensando em fazer?"');
  linhas.push('Em conversas subsequentes, va direto na pergunta sem se apresentar.');
  linhas.push('');

  // §3.2 OBR técnicos + soft re-ask + estimativa via referência visual
  linhas.push('## §3.2 OBR TECNICOS — coleta com soft re-ask');
  linhas.push('Os 3 OBR técnicos sao OBRIGATORIOS pra concluir a fase:');
  linhas.push('1. **descricao_tattoo** — o que o cliente quer tatuar (tema/ideia, ex: "rosa fineline", "leao realismo")');
  linhas.push('2. **tamanho_cm** — altura aproximada da TATTOO em cm (ex: 10, 15, 20). NAO confunda com altura do cliente.');
  linhas.push('3. **local_corpo** — onde no corpo (antebraco, biceps, costela, perna, etc)');
  linhas.push('');
  linhas.push('Persistencia: pra cada info coletada, chame `dados_coletados(conversa_id, campo, valor)`.');
  linhas.push('');
  linhas.push('### Soft re-ask (1 reformulacao + handoff se evade de novo)');
  linhas.push('Se cliente EVADE uma pergunta OBR (muda de assunto, "sei la", "qualquer coisa", silencio), reformule a pergunta com angulo DIFERENTE — NAO repita a mesma frase. Se cliente evadir DE NOVO o MESMO OBR (ja reformulado 1x), chame `acionar_handoff(motivo="cliente_evasivo_infos_incompletas")`. Tracking via historico: leia se voce ja reformulou esta pergunta UMA vez nesta conversa.');
  linhas.push('');
  linhas.push('### Estimativa de tamanho via referencia visual');
  linhas.push('Se cliente nao sabe `tamanho_cm` em numero, ofereca referencia visual no soft re-ask:');
  linhas.push('- "do pulso ao cotovelo" → ~25cm');
  linhas.push('- "tipo palma da mao" → ~10cm');
  linhas.push('- "tamanho de uma moeda" → ~3cm');
  linhas.push('- "altura de telefone" → ~15cm');
  linhas.push('- "umas 3 letras pequenas" → ~5cm');
  linhas.push('Quando cliente confirmar uma referencia, ESTIME um cm e CONFIRME com cliente: "Show, entao uns 25cm ta legal?". Se concorda, chame `dados_coletados(tamanho_cm, 25)`. Se discorda, ajuste. Se cliente fica em duvida 2x, chame `acionar_handoff(motivo="cliente_evasivo_infos_incompletas")`.');
  linhas.push('');
  linhas.push('Quando os 3 OBR tecnicos estao completos, a tool `dados_coletados` sinaliza transicao automatica via `proxima_fase: "cadastro"` — voce NAO envia a mensagem-ponte (§3.4) ainda. Primeiro percorra os single shots OBR_RECOMENDADO da §3.3.');
  linhas.push('');

  // §3.3 OBR_RECOMENDADO — single shots em sequência
  linhas.push('## §3.3 OBR_RECOMENDADO — single shots pos-3 OBR tecnicos');
  linhas.push('Apos os 3 OBR tecnicos completos, percorra os 3 single shots em ORDEM. Cada single shot tem PRE-CONDICAO — pula se ja satisfeita. Cada single shot e UMA tentativa SO (sem soft re-ask). Se cliente recusa/pula/ignora, SEGUE pro proximo.');
  linhas.push('');
  linhas.push('### §3.3-foto — single shot foto_local');
  linhas.push('- **Pre-condicao:** `foto_local` ainda nao preenchido (R8 pode ter populado se cliente mandou foto espontanea — entao PULA).');
  linhas.push('- **Pergunta:** "Show, {validacao substantiva}. Manda uma foto rapidinha do {local} pra eu mostrar pro tatuador? Ajuda demais ele cravar valor justo."');
  linhas.push('- Cliente manda foto → chame `dados_coletados(foto_local, <descricao_textual_da_imagem>)`. Cliente recusa/pula → segue.');
  linhas.push('');
  linhas.push('### §3.3-altura — single shot altura_cm');
  linhas.push('- **Pre-condicao:** `altura_cm` ainda nao preenchido (cliente pode ter dito altura na 1a msg via multi-info — entao PULA).');
  linhas.push('- **Pergunta:** "Manda tua altura tambem? Ajuda o tatuador cravar a proporcao certa."');
  linhas.push('- Cliente responde altura → chame `dados_coletados(altura_cm, <valor>)` (formatos aceitos: 170, "1.70", "1,70", "1m70"). Cliente "nao sei"/recusa → segue.');
  linhas.push('');
  linhas.push('### §3.3-estilo — single shot CONDICIONAL');
  linhas.push('- **Pre-condicao A:** estilo NAO inferido do contexto. Se descricao ja cita estilo ("rosa fineline" → estilo=fineline), ou refs visuais tem estilo claro (R8), ou cliente declarou estilo antes — PULA.');
  linhas.push('- **Pergunta:** "Tem algum estilo em mente? Tipo fineline, realismo, blackwork, traditional?"');
  linhas.push('- Cliente responde estilo → chame `dados_coletados(estilo, <valor>)`. Cliente "nao sei"/recusa → segue.');
  linhas.push('');

  // §3.3b Multi-info na 1a msg + verificação de contradição
  linhas.push('## §3.3b Multi-info na 1a msg + verificacao de contradicao');
  linhas.push('Se cliente abre com varias infos juntas (ex: "rosa fineline 10cm no antebraco [foto]" = descricao+estilo+tamanho+local+foto), persista TODAS via dados_coletados em sequencia E PULE os single shots da §3.3 cujas pre-condicoes ficaram satisfeitas. NUNCA pergunte algo que ja foi dito.');
  linhas.push('');
  linhas.push('**ANTES de pular um single shot pulavel, verifique CONTRADICAO entre os campos coletados** (R9 aplica). Se ha contradicao, devolva (R9) ANTES de pular ou transicionar pra mensagem-ponte. Exemplos:');
  linhas.push('- estilo declarado "realismo" + foto fineline clara → devolva R9');
  linhas.push('- local declarado "antebraco" + foto da perna → devolva R9');
  linhas.push('- descricao "simples" + foto detalhada → devolva R9');
  linhas.push('');

  // §3.4 Mensagem-ponte cadastro (Balão 1 condicional)
  linhas.push('## §3.4 Mensagem-ponte pra fase Cadastro (estrutura intacta, Balao 1 condicional)');
  linhas.push('Apos percorrer (ou pular) os 3 single shots OBR_RECOMENDADO da §3.3, envie a mensagem-ponte. Estrutura:');
  linhas.push('- **Balao 1: validacao substantiva** — comente UMA caracteristica baseada nos campos coletados. Mais campos coletados = validacao mais rica:');
  linhas.push('  - Minimo (so 3 OBR tecnicos): "Rosa de 10cm no antebraco fica top — bem visivel, da pra trabalhar bons detalhes"');
  linhas.push('  - Com altura: "Rosa de 10cm no antebraco, considerando tua altura 1.70m, fica numa proporcao bem equilibrada"');
  linhas.push('  - Com estilo+altura: "Rosa fineline de 10cm no antebraco, com tua altura 1.70m, fica delicada e bem proporcional"');
  linhas.push('  - Escolha naturalmente baseado no que tem.');
  linhas.push('- **Balao 2 (linha em branco entre baloes): peca os 2 OBR cadastro em UMA frase em texto corrido — JAMAIS lista bullet.** Ex: "Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve".');
  linhas.push('');
  linhas.push('Lista bullet (- Nome completo / - Data de nascimento) e PROIBIDA — soa como formulario, nao conversa. Texto corrido com expectativa positiva ("orcamento personalizado", "tatuador retorna em breve") gera coopreacao do cliente.');
  linhas.push('');
  linhas.push('Apos esta mensagem, PARE. Nao chame mais tools nesse turno. Aguarde resposta do cliente.');
  linhas.push('');

  // §3.5 Gatilhos imediatos de handoff
  linhas.push('## §3.5 Gatilhos imediatos (PARE a coleta e chame `acionar_handoff`)');
  linhas.push('Se detectar QUALQUER um destes durante a coleta, PARE imediatamente e chame `acionar_handoff(motivo=<motivo>)` UMA vez:');
  linhas.push('- Cover-up (cliente menciona "cobrir/tapar/disfarcar tattoo antiga" OU foto mostra pele tatuada no local pretendido) → `cover_up_detectado`');
  linhas.push('- Menor de idade (cliente diz idade <18 OU peca em local sensivel pra menor) → `menor_idade`');
  linhas.push('- Area restrita (rosto, pescoco, maos, dedos, genital, intimas) → `area_restrita`');
  linhas.push('- Retoque de tattoo antiga → `retoque`');
  linhas.push('- Cliente agressivo / insultos → `cliente_agressivo`');
  linhas.push('- Idioma diferente do portugues → `idioma_nao_suportado`');
  linhas.push('- Fora do escopo (procedimento medico, piercing, etc) → `fora_escopo`');
  linhas.push('- Cliente evasivo nos 3 OBR tecnicos (ja reformulou 1x e cliente continua sem resposta) → `cliente_evasivo_infos_incompletas`');
  linhas.push('- Contradicao nao resolvida (ja devolveu R9 1x e cliente continua contraditorio/evasivo) → `contradicao_nao_resolvida`');
  linhas.push('- Dado implausivel confirmado (cliente confirma "3.50m de altura" como real) → `dado_implausivel`');

  return linhas.join('\n');
}
```

- [ ] **Step 2: Smoke validar via node**

Run: `node -e "import('./functions/_lib/prompts/coleta/tattoo/fluxo.js').then(m => { const out = m.fluxo({ nome_agente: 'Lina', nome_estudio: 'TestEstudio' }, {}); console.log(out.length, 'chars'); console.log('§3.3:', out.includes('§3.3 OBR_RECOMENDADO')); console.log('§3.3c removido:', !out.includes('§3.3c')); console.log('R9 menciona:', out.includes('R9')); }).catch(e => { console.error(e); process.exit(1); });"`
Expected: output contém `§3.3: true`, `§3.3c removido: true`. (R9 ainda não é mencionada aqui — está em regras.js).

- [ ] **Step 3: Rodar invariants e snapshot pra ver impacto (vai falhar — esperado)**

Run: `node --test tests/prompts/snapshot.test.mjs 2>&1 | tail -10`
Expected: snapshot `coleta-tattoo` FAIL (esperado — snapshot ainda velho). Vamos regenerar na Task 10.

- [ ] **Step 4: Commit**

```bash
git add functions/_lib/prompts/coleta/tattoo/fluxo.js
git commit -m "$(cat <<'EOF'
feat(coleta-tattoo): reescreve fluxo.js — §3.3 OBR_RECOMENDADO single shots

Reestrutura fase tattoo:
- §3.2: 3 OBR técnicos + soft re-ask explícito + estimativa via
  referência visual (substitui §3.3c removida)
- §3.3: 3 OBR_RECOMENDADO via single shots (foto → altura → estilo
  condicional). Cada um tem pré-condição com pulagem inteligente.
- §3.3b: multi-info + verificação de contradição (R9) antes de pular
- §3.3c: REMOVIDA — altura migrou pra OBR_RECOMENDADO próprio
- §3.4: mensagem-ponte estrutura intacta, Balão 1 condicional aos
  campos coletados
- §3.5: gatilhos handoff atualizados com cliente_evasivo_infos_incompletas
  + contradicao_nao_resolvida + dado_implausivel

R9 referenciada (definição em regras.js — Task 6).

Spec: docs/superpowers/specs/2026-05-06-coleta-foto-local-refs-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Adicionar R9 + T7 e reescrever T2/T3 em `regras.js`

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/regras.js` (adiciona R9, T7; reescreve T2, T3)

> **Calibração:** PIPELINE-COMPLETA. R9 é princípio crítico — texto preciso pro LLM. Reviewer deve validar que R9 e R8 (interpretação visual) NÃO entram em conflito.

- [ ] **Step 1: Adicionar R9 antes de R8**

Em `functions/_lib/prompts/coleta/tattoo/regras.js`, ANTES da linha que começa com `linhas.push('**R8.** IMAGENS: ...');` (em torno da linha 37), inserir o bloco R9 abaixo. **NOTA:** R9 conceitualmente vem APÓS R8 mas eu vou inserir R9 LOGO APÓS R8 pra manter ordem numérica. Adapte o ponto de inserção pra ser **após** o último `linhas.push` da R8 (em torno da linha 41) e **antes** do `linhas.push('');` que precede `# §4b TOOLS`:

```javascript
linhas.push('');
linhas.push('**R9.** DEVOLVER CONTRADICOES, NUNCA DECIDIR PELO CLIENTE.');
linhas.push('Sempre que detectar contradicao entre o que o cliente disse, mandou em foto, ou implicito no contexto, devolva a contradicao em UMA pergunta soft sem julgamento. NAO escolha por ele. NAO ignore um lado da contradicao. Exemplos tipicos:');
linhas.push('- estilo declarado ≠ estilo inferido da foto/ref (ex: "quero realismo" + foto fineline → "Vi que tu falou em realismo e mandou foto de uma rosa fineline delicada. Tu queria tipo essa da foto, ou um estilo mais realista mesmo?")');
linhas.push('- local declarado ≠ local mostrado na foto (ex: declarou antebraco + foto da perna → "Vi que mandou foto da perna — confirma que e na perna mesmo, nao no antebraco?")');
linhas.push('- descricao "simples" + foto detalhada (ou vice-versa) → "Vi que tu mandou foto de uma rosa bem detalhada — tu queria uma assim, ou algo mais simples?"');
linhas.push('- altura/tamanho fora de range comum (ex: cliente diz 3.50m de altura → "3.50m e uma altura bem fora do comum, foi erro de digitacao?")');
linhas.push('- cliente diz tamanho impossivel pra local (ex: 50cm no pulso → "50cm e bem grande pro pulso — foi erro? Pulso comporta no maximo uns 8-10cm de altura")');
linhas.push('');
linhas.push('Apos UMA devolucao, se cliente continuar evasivo ou contraditorio, chame `acionar_handoff(motivo="contradicao_nao_resolvida")`.');
```

- [ ] **Step 2: Reescrever T2 em §4b**

Substituir o bloco T2 atual (em torno da linha 47) por:

```javascript
linhas.push('**T2.** `dados_coletados`:');
linhas.push('- **T2.1** — chame APOS cliente fornecer cada campo OBR tecnico (descricao_tattoo, tamanho_cm, local_corpo). Uma chamada por campo. Pode encadear no MESMO turno se cliente mandou multi-info ("rosa de 10cm no antebraco" = 3 chamadas).');
linhas.push('- **T2.2** — quando 3 OBR tecnicos completos (tool retorna `proxima_fase: "cadastro"`), NAO envie ainda a mensagem-ponte (§3.4). Primeiro percorra os 3 OBR_RECOMENDADO em ordem: foto_local → altura_cm → estilo. Cada single shot tem pre-condicao (campo ainda nao preenchido / inferido). Pula se ja satisfeita.');
linhas.push('- **T2.3** — so APOS percorrer (ou pular) os 3 single shots, envie a §3.4 mensagem-ponte de cadastro com Balao 1 condicional aos campos coletados.');
```

- [ ] **Step 3: Reescrever T3**

Substituir o bloco T3 atual por:

```javascript
linhas.push('**T3.** §3.4 Mensagem-ponte: Balao 1 (validacao substantiva) cita os campos OBR_RECOMENDADO coletados (mais campos = validacao mais rica). Balao 2 INTACTO: "Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve". JAMAIS lista bullet (PR #29 fix mantido).');
```

- [ ] **Step 4: Adicionar T7 no FIM do §4b**

Adicionar após o último `linhas.push` do bloco T4 (final do arquivo, antes do `return linhas.join`):

```javascript
linhas.push('');
linhas.push('**T7.** TRACKING DE TENTATIVAS via historico (LLM stateless le o historico):');
linhas.push('- Soft re-ask 3 OBR tecnicos: se voce JA reformulou esta pergunta UMA vez nesta conversa, proxima evasao = `acionar_handoff(motivo="cliente_evasivo_infos_incompletas")`.');
linhas.push('- Devolucao de contradicao (R9): se voce JA devolveu UMA contradicao sobre o mesmo assunto, proxima inconsistencia = `acionar_handoff(motivo="contradicao_nao_resolvida")`. NAO devolva de novo.');
linhas.push('- Tracking concreto: leia se voce ja fez essa pergunta antes nesta conversa. Se sim, e e a 2a ocorrencia, dispare handoff em vez de repetir.');
```

- [ ] **Step 5: Smoke validar via node**

Run: `node -e "import('./functions/_lib/prompts/coleta/tattoo/regras.js').then(m => { const out = m.regras({}); console.log('R9:', out.includes('R9')); console.log('T7:', out.includes('T7')); console.log('T2.1:', out.includes('T2.1')); console.log('T2.2:', out.includes('T2.2')); console.log('T2.3:', out.includes('T2.3')); console.log('contradicao_nao_resolvida:', out.includes('contradicao_nao_resolvida')); }).catch(e => { console.error(e); process.exit(1); });"`
Expected: TODOS `true`.

- [ ] **Step 6: Commit**

```bash
git add functions/_lib/prompts/coleta/tattoo/regras.js
git commit -m "$(cat <<'EOF'
feat(coleta-tattoo): adiciona R9 + T7, reescreve T2/T3

R9 (princípio): "DEVOLVER CONTRADICOES, NUNCA DECIDIR PELO CLIENTE".
Bot identifica contradições (estilo declarado ≠ estilo da foto, local
declarado ≠ local da foto, descrição vs foto, dado implausível) e
devolve UMA pergunta soft. Após 1 devolução sem resolução, handoff
contradicao_nao_resolvida.

T7 (tracking): LLM stateless lê histórico pra contar tentativas. Soft
re-ask 3 OBR técnicos (já reformulou 1x → handoff cliente_evasivo).
R9 (já devolveu 1x → handoff contradicao_nao_resolvida).

T2 reescrita: T2.1 (3 OBR técnicos), T2.2 (single shots
foto→altura→estilo pós-transição), T2.3 (mensagem-ponte só após
percorrer single shots).

T3 reescrita: Balão 1 condicional aos campos coletados.

Spec: docs/superpowers/specs/2026-05-06-coleta-foto-local-refs-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Reescrever `few-shot.js` da fase tattoo (10 cenários)

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/few-shot.js` (substitui 5 cenários antigos por 10 cenários novos)

> **Calibração:** PIPELINE-COMPLETA. Alto risco de pseudo-código (PR #28 já fez fix global mas refator novo pode reintroduzir). Reviewer deve validar Format A (zero pseudo-código) + Tom B (validação substantiva, primeira pessoa).

- [ ] **Step 1: Substituir conteúdo de few-shot.js**

Substituir conteúdo de `functions/_lib/prompts/coleta/tattoo/few-shot.js` por:

```javascript
// ── §7 FEW-SHOT BASE — modo Coleta v2, fase TATTOO ─────────────────────────
// Exemplos de conversa ideal pra fase de coleta da tattoo.
// Format A (canonical Anthropic Tool Use): conversa pura CLIENTE ↔ AGENTE,
// zero pseudo-codigo de tool. Tools sao invocadas pelo LLM com base nas
// descriptions do n8n + secao §4b TOOLS QUANDO INVOCAR em regras.js.
// Tom B: validacao substantiva 1× antes de pedir cadastro + cadastro em
// texto corrido (nao lista bullet) + R9 devolve contradicoes.
//
// 10 cenarios cobrem:
// 1. Cliente abre completo (multi-info) — pula single shots foto/estilo
// 2. Cliente goteja info — percorre 3 single shots
// 3. Cliente recusa foto — segue
// 4. Cliente recusa altura — segue
// 5. Cliente ja citou estilo na descricao — pula single shot estilo
// 6. Cliente evade tamanho 1x, da referencia visual no soft re-ask
// 7. Cliente evade tamanho 2x — handoff cliente_evasivo_infos_incompletas
// 8. Estilo conflitante (R9) — devolve contradicao
// 9. Local conflitante (R9) — devolve contradicao
// 10. Altura implausivel (R9) — devolve contradicao + handoff dado_implausivel
export function fewShotBase(tenant) {
  const nomeAg = tenant.nome_agente || 'Lina';
  const nomeEst = tenant.nome_estudio || 'NomeEstudio';

  const linhas = ['# §7 EXEMPLOS DE CONVERSAS IDEAIS (fase Tattoo)'];
  linhas.push('');

  // Exemplo 1 — multi-info na 1a msg, pula single shots foto/estilo
  linhas.push('## Exemplo 1 — Cliente abre completo (multi-info)');
  linhas.push('```');
  linhas.push('CLIENTE: oi quero uma rosa fineline 10cm no antebraco [foto: antebraco direito pele clara]');
  linhas.push(`AGENTE: Oii, tudo bem? Aqui e ${nomeAg} do ${nomeEst}`);
  linhas.push('');
  linhas.push('AGENTE: Show, anotei tudo. Manda tua altura tambem? Ajuda o tatuador cravar a proporcao certa.');
  linhas.push('CLIENTE: 1.70m');
  linhas.push('AGENTE: Rosa fineline de 10cm no antebraco, com tua altura 1.70m, fica delicada e bem proporcional');
  linhas.push('');
  linhas.push('AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 2 — Cliente goteja info, percorre 3 single shots
  linhas.push('## Exemplo 2 — Cliente goteja info, percorre 3 single shots');
  linhas.push('```');
  linhas.push('CLIENTE: oi');
  linhas.push(`AGENTE: Oii, tudo bem? Aqui e ${nomeAg} do ${nomeEst}`);
  linhas.push('');
  linhas.push('AGENTE: Me conta o que esta pensando em fazer?');
  linhas.push('CLIENTE: uma rosa');
  linhas.push('AGENTE: Massa! Tem ideia de tamanho e onde no corpo?');
  linhas.push('CLIENTE: uns 10cm');
  linhas.push('AGENTE: Show. E onde no corpo?');
  linhas.push('CLIENTE: antebraco');
  linhas.push('AGENTE: Show, rosa de 10cm no antebraco fica bem visivel. Manda uma foto rapidinha do antebraco pra eu mostrar pro tatuador? Ajuda demais ele cravar valor justo.');
  linhas.push('CLIENTE: [foto: antebraco direito pele clara]');
  linhas.push('AGENTE: Manda tua altura tambem? Ajuda o tatuador cravar a proporcao certa.');
  linhas.push('CLIENTE: 1.78m');
  linhas.push('AGENTE: Tem algum estilo em mente? Tipo fineline, realismo, blackwork, traditional?');
  linhas.push('CLIENTE: fineline');
  linhas.push('AGENTE: Rosa fineline de 10cm no antebraco, com tua altura 1.78m, fica delicada e bem proporcional');
  linhas.push('');
  linhas.push('AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 3 — Cliente recusa foto
  linhas.push('## Exemplo 3 — Cliente recusa foto, segue');
  linhas.push('```');
  linhas.push('CLIENTE: rosa 10cm antebraco');
  linhas.push('AGENTE: Show, rosa de 10cm no antebraco. Manda uma foto rapidinha do antebraco pra eu mostrar pro tatuador? Ajuda demais ele cravar valor justo.');
  linhas.push('CLIENTE: nao tenho como tirar agora');
  linhas.push('AGENTE: Tranquilo. Manda tua altura entao? Ajuda o tatuador cravar a proporcao certa.');
  linhas.push('CLIENTE: 1.65m');
  linhas.push('AGENTE: Tem algum estilo em mente? Tipo fineline, realismo, blackwork, traditional?');
  linhas.push('CLIENTE: nao manjo nada disso');
  linhas.push('AGENTE: Rosa de 10cm no antebraco, com tua altura 1.65m, fica numa proporcao bem equilibrada');
  linhas.push('');
  linhas.push('AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 4 — Cliente recusa altura, pula altura, segue
  linhas.push('## Exemplo 4 — Cliente recusa altura, pula');
  linhas.push('```');
  linhas.push('CLIENTE: leao realismo 15cm peitoral [foto: peitoral pele clara]');
  linhas.push('AGENTE: Show, leao realismo de 15cm no peitoral. Manda tua altura tambem? Ajuda o tatuador cravar a proporcao certa.');
  linhas.push('CLIENTE: nao sei minha altura exata');
  linhas.push('AGENTE: Tranquilo. Leao realismo de 15cm no peitoral fica imponente, da pra detalhar bem a juba');
  linhas.push('');
  linhas.push('AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 5 — Estilo já citado na descrição, pula single shot estilo
  linhas.push('## Exemplo 5 — Estilo ja inferido da descricao, pula single shot estilo');
  linhas.push('```');
  linhas.push('CLIENTE: queria uma frase em fineline no pulso, umas 5cm');
  linhas.push('AGENTE: Show, frase em fineline de 5cm no pulso. Manda uma foto rapidinha do pulso pra eu mostrar pro tatuador?');
  linhas.push('CLIENTE: [foto: pulso pele clara]');
  linhas.push('AGENTE: Manda tua altura tambem? Ajuda o tatuador cravar a proporcao certa.');
  linhas.push('CLIENTE: 1.60m');
  linhas.push('AGENTE: Frase em fineline de 5cm no pulso, com tua altura 1.60m, fica delicada e elegante');
  linhas.push('');
  linhas.push('AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 6 — Cliente evade tamanho 1x, da referencia visual no soft re-ask
  linhas.push('## Exemplo 6 — Cliente evade tamanho, da referencia visual no soft re-ask');
  linhas.push('```');
  linhas.push('CLIENTE: quero uma rosa no antebraco');
  linhas.push('AGENTE: Massa! Tem ideia de tamanho? Tipo uns cm');
  linhas.push('CLIENTE: sei la, medio');
  linhas.push('AGENTE: Tipo do pulso ao cotovelo sao uns 25cm. Manda uma referencia tipo "tamanho de palma da mao" ou "altura de telefone" que eu cravo');
  linhas.push('CLIENTE: tipo do pulso ao cotovelo');
  linhas.push('AGENTE: Show, entao uns 25cm ta legal?');
  linhas.push('CLIENTE: pode ser');
  linhas.push('AGENTE: Rosa de 25cm no antebraco fica bem visivel, da pra trabalhar muitos detalhes. Manda uma foto rapidinha do antebraco pra eu mostrar pro tatuador?');
  linhas.push('CLIENTE: [foto: antebraco direito]');
  linhas.push('AGENTE: Manda tua altura tambem?');
  linhas.push('CLIENTE: 1.70m');
  linhas.push('AGENTE: Tem algum estilo em mente?');
  linhas.push('CLIENTE: nao sei');
  linhas.push('AGENTE: Rosa de 25cm no antebraco, com tua altura 1.70m, fica imponente e cobre uma boa area');
  linhas.push('');
  linhas.push('AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 7 — Cliente evade tamanho 2x — handoff
  linhas.push('## Exemplo 7 — Cliente evade tamanho 2x, handoff cliente_evasivo_infos_incompletas');
  linhas.push('```');
  linhas.push('CLIENTE: quero uma rosa no antebraco');
  linhas.push('AGENTE: Tem ideia de tamanho?');
  linhas.push('CLIENTE: sei la');
  linhas.push('AGENTE: Tipo do pulso ao cotovelo sao uns 25cm. Manda uma referencia tipo "tamanho de palma da mao" ou "altura de telefone" que eu cravo');
  linhas.push('CLIENTE: ta dificil');
  linhas.push('AGENTE: Pra cravar o tamanho certinho o tatuador conversa direto contigo — ja sinalizei pra ele');
  linhas.push('```');
  linhas.push('');

  // Exemplo 8 — Estilo conflitante (R9)
  linhas.push('## Exemplo 8 — Estilo conflitante (R9 — devolve contradicao)');
  linhas.push('```');
  linhas.push('CLIENTE: quero uma rosa em realismo, 10cm no antebraco [foto: rosa fineline delicada]');
  linhas.push('AGENTE: Vi que tu falou em realismo e me mandou foto de uma rosa fineline delicada. Tu queria tipo essa da foto, ou um estilo mais realista mesmo?');
  linhas.push('CLIENTE: ah, tipo a da foto');
  linhas.push('AGENTE: Show, rosa fineline de 10cm no antebraco. Manda tua altura tambem? Ajuda o tatuador cravar a proporcao certa.');
  linhas.push('CLIENTE: 1.65m');
  linhas.push('AGENTE: Rosa fineline de 10cm no antebraco, com tua altura 1.65m, fica delicada e bem proporcional');
  linhas.push('');
  linhas.push('AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 9 — Local conflitante (R9)
  linhas.push('## Exemplo 9 — Local conflitante (R9 — devolve contradicao)');
  linhas.push('```');
  linhas.push('CLIENTE: rosa 10cm antebraco [foto: perna direita pele clara]');
  linhas.push('AGENTE: Vi que mandou foto da perna — confirma que e na perna mesmo, nao no antebraco?');
  linhas.push('CLIENTE: opa, vai ser na perna');
  linhas.push('AGENTE: Show, rosa de 10cm na perna. Manda tua altura tambem? Ajuda o tatuador cravar a proporcao certa.');
  linhas.push('CLIENTE: 1.72m');
  linhas.push('AGENTE: Tem algum estilo em mente?');
  linhas.push('CLIENTE: fineline');
  linhas.push('AGENTE: Rosa fineline de 10cm na perna, com tua altura 1.72m, fica delicada e bem proporcional');
  linhas.push('');
  linhas.push('AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 10 — Altura implausivel (R9 + handoff dado_implausivel)
  linhas.push('## Exemplo 10 — Altura implausivel confirmada (R9 + handoff dado_implausivel)');
  linhas.push('```');
  linhas.push('CLIENTE: leao 20cm peitoral');
  linhas.push('AGENTE: Show, leao de 20cm no peitoral. Manda uma foto rapidinha do peitoral pra eu mostrar pro tatuador?');
  linhas.push('CLIENTE: [foto: peitoral]');
  linhas.push('AGENTE: Manda tua altura tambem?');
  linhas.push('CLIENTE: 3.50m');
  linhas.push('AGENTE: 3.50m e uma altura bem fora do comum, foi erro de digitacao?');
  linhas.push('CLIENTE: nao, e isso mesmo');
  linhas.push('AGENTE: Pra esse caso o tatuador valida pessoalmente — ja sinalizei pra ele');
  linhas.push('```');

  return linhas.join('\n');
}
```

- [ ] **Step 2: Smoke validar via node**

Run: `node -e "import('./functions/_lib/prompts/coleta/tattoo/few-shot.js').then(m => { const out = m.fewShotBase({ nome_agente: 'Lina', nome_estudio: 'TestEstudio' }); console.log('10 exemplos:', (out.match(/## Exemplo \d/g) || []).length); console.log('zero pseudo-codigo:', !/\\[chama [a-z_]+\\(/.test(out) && !/\\[invoca [a-z_]+\\(/.test(out)); console.log('R9 cenarios (8,9,10):', out.includes('Vi que tu falou em realismo') && out.includes('confirma que e na perna') && out.includes('3.50m e uma altura bem fora')); }).catch(e => { console.error(e); process.exit(1); });"`
Expected: `10 exemplos: 10`, `zero pseudo-codigo: true`, `R9 cenarios: true`.

- [ ] **Step 3: Commit**

```bash
git add functions/_lib/prompts/coleta/tattoo/few-shot.js
git commit -m "$(cat <<'EOF'
feat(coleta-tattoo): substitui few-shots por 10 cenários novos

10 cenários cobrindo refator completo:
1. Cliente abre completo (multi-info) — pula foto/estilo
2. Cliente goteja info — percorre 3 single shots
3. Cliente recusa foto — segue
4. Cliente recusa altura — pula
5. Estilo já inferido da descrição — pula single shot estilo
6. Cliente evade tamanho 1x, dá referência visual ("pulso ao cotovelo")
7. Cliente evade tamanho 2x — handoff cliente_evasivo
8. Estilo conflitante (R9) — devolve contradição
9. Local conflitante (R9) — devolve contradição
10. Altura implausível (R9 + handoff dado_implausivel)

Format A canonical (zero pseudo-código). Tom B mantido.
PR #28 fix anti-pseudo-código preservado.

Spec: docs/superpowers/specs/2026-05-06-coleta-foto-local-refs-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Audit `few-shot-tenant.js`

**Files:**
- Audit (potencialmente modify): `functions/_lib/prompts/coleta/tattoo/few-shot-tenant.js`

> **Calibração:** Direto. Audit visual. Spec diz: PR #28 já limpou pseudo-código; verificar não-contradição com R9.

- [ ] **Step 1: Ler e auditar**

Run: `cat functions/_lib/prompts/coleta/tattoo/few-shot-tenant.js`

Verificar:
1. Sem pseudo-código `[chama X()]` ou `[invoca X()]`
2. Sem few-shots que mostrem bot DECIDINDO em contradição (ex: foto contradiz texto e bot escolhe um lado silenciosamente)
3. Sem few-shots que mostrem bot pedindo refs_imagens ativamente
4. Sem few-shots que mostrem bot pedindo foto na mensagem-ponte de cadastro (deve ficar em §3.3 single shot)

- [ ] **Step 2: Se algo estiver inconsistente, corrigir e commitar**

Se houver inconsistência, edite o arquivo aplicando o mesmo padrão dos few-shots novos do Task 7. Commit:

```bash
git add functions/_lib/prompts/coleta/tattoo/few-shot-tenant.js
git commit -m "fix(coleta-tattoo): few-shot-tenant alinhado com R9 + OBR_RECOMENDADO"
```

Se estiver tudo OK, **pular Step 2 sem commit** (sem mudança).

- [ ] **Step 3: Documentar achado**

Mesmo sem commit, anote em `inkflow-saas/docs/superpowers/plans/2026-05-06-coleta-foto-local-refs.md` no fim do plano (seção "Audit log") se foi necessário ou não. Use comentário em `git log` opcional. (Sem step de commit dedicado pra este — captura inline.)

---

### Task 9: Adicionar 5 invariants tests novos

**Files:**
- Modify: `tests/prompts/invariants.test.mjs` (adicionar 5 tests no FIM)

- [ ] **Step 1: Ler estrutura atual de invariants.test.mjs pra adaptar imports**

Run: `head -30 tests/prompts/invariants.test.mjs`

Anote: import paths, helpers usados (provável `extractSection` ou `findInPrompt`), fixtures (provável `TENANT_CANONICO`, `CONVERSA_COLETA_TATTOO`).

- [ ] **Step 2: Adicionar 5 invariants no FIM do arquivo**

Antes de qualquer linha final do arquivo (ex: `// fim do arquivo` ou simplesmente no último ponto após existing tests), adicione:

```javascript
// ── Invariants do refator coleta foto_local + altura_cm + R9 ─────────
test('§3.3 OBR_RECOMENDADO menciona apenas foto_local, altura_cm, estilo (sem refs_imagens ativo)', () => {
  const prompt = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO);
  // Extract section §3.3 (até §3.3b ou §3.4)
  const m = prompt.match(/## §3\.3 OBR_RECOMENDADO[\s\S]*?(?=## §3\.3b|## §3\.4)/);
  assert.ok(m, '§3.3 OBR_RECOMENDADO section nao encontrada');
  const sec = m[0];
  assert.match(sec, /foto_local/);
  assert.match(sec, /altura_cm/);
  assert.match(sec, /estilo/);
  // refs_imagens NAO deve ser perguntado ativamente em §3.3
  assert.doesNotMatch(sec, /Pergunta:[^"]*refs_imagens/);
});

test('§3.3c (fallback altura→tamanho) foi removida', () => {
  const prompt = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO);
  assert.doesNotMatch(prompt, /## §3\.3c/);
});

test('R9 (devolver contradições) explícita em regras tattoo', () => {
  const prompt = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO);
  assert.match(prompt, /\*\*R9\.\*\*/);
  assert.match(prompt, /DEVOLVER CONTRADICOES/);
  assert.match(prompt, /contradicao_nao_resolvida/);
});

test('§4b T2 menciona sequência foto_local → altura_cm → estilo', () => {
  const prompt = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO);
  // T2 deve mencionar T2.1, T2.2, T2.3 com a sequência
  const m = prompt.match(/\*\*T2\.\*\*[\s\S]*?(?=\*\*T3\.\*\*)/);
  assert.ok(m, 'T2 section nao encontrada');
  const sec = m[0];
  assert.match(sec, /T2\.1/);
  assert.match(sec, /T2\.2/);
  assert.match(sec, /T2\.3/);
  assert.match(sec, /foto_local.*altura_cm.*estilo/s);
});

test('Soft re-ask + cliente_evasivo_infos_incompletas explícitos no prompt', () => {
  const prompt = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO);
  assert.match(prompt, /soft re-ask|reformul/i);
  assert.match(prompt, /cliente_evasivo_infos_incompletas/);
});
```

**Nota:** se o nome do helper de extract section diferir (ex: `extractSection` em vez de inline regex), adapte.

- [ ] **Step 3: Rodar invariants pra confirmar PASS**

Run: `node --test tests/prompts/invariants.test.mjs 2>&1 | tail -20`
Expected: TODOS tests PASS (existentes + 5 novos).

Se algum FAIL, **NÃO ajuste o invariant pra acomodar texto errado** — verifique se o prompt está faltando o que o invariant pede e ajuste o prompt em fluxo.js / regras.js.

- [ ] **Step 4: Commit**

```bash
git add tests/prompts/invariants.test.mjs
git commit -m "$(cat <<'EOF'
test(coleta-tattoo): 5 invariants novos pro refator R9 + OBR_RECOMENDADO

Cobrem:
- §3.3 OBR_RECOMENDADO menciona foto_local + altura_cm + estilo
  (sem pergunta ativa de refs_imagens)
- §3.3c removida (anti-regression)
- R9 explícita em regras
- §4b T2 sequência T2.1/T2.2/T2.3 foto→altura→estilo
- Soft re-ask + cliente_evasivo_infos_incompletas explícitos

Spec: docs/superpowers/specs/2026-05-06-coleta-foto-local-refs-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Re-snapshot `coleta-tattoo`

**Files:**
- Regen: `tests/prompts/snapshots/coleta-tattoo.txt`

- [ ] **Step 1: Rodar update-prompt-snapshots.sh**

Run: `bash scripts/update-prompt-snapshots.sh`
Expected: `OK — 4 snapshots regenerados (coleta-tattoo, coleta-cadastro, coleta-proposta, exato).`

- [ ] **Step 2: Verificar diff visual do snapshot tattoo**

Run: `git diff tests/prompts/snapshots/coleta-tattoo.txt | head -80`
Expected: diff mostra reestruturação §3 (novas seções §3.3-foto/§3.3-altura/§3.3-estilo, §3.3c removida, R9, T7).

Outros snapshots (cadastro, proposta, exato): não devem ter mudança (apenas tattoo). Se houver diff em cadastro/proposta/exato, INVESTIGAR — mudança lateral inesperada.

- [ ] **Step 3: Rodar snapshot test pra confirmar PASS**

Run: `node --test tests/prompts/snapshot.test.mjs 2>&1 | tail -10`
Expected: 4/4 snapshot tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/prompts/snapshots/coleta-tattoo.txt
git commit -m "test(coleta-tattoo): regen snapshot pós-refator R9 + OBR_RECOMENDADO"
```

Se outros snapshots também tiveram mudança esperada (laterais), incluir todos no `git add`. Se mudança lateral foi inesperada, **PARE** e investigue antes de commitar.

---

### Task 11: Suite completa + fix se algo quebrar

**Files:** (read-only — só rodar)

- [ ] **Step 1: Rodar suite completa**

Run: `bash scripts/test-prompts.sh 2>&1 | tee /tmp/inkflow-suite-output.txt | tail -30`
Expected: `✓ Todos os tests passaram.` no fim. Tests count = baseline (Task 1) + 13 (6 altura + 2 payload + 5 invariants).

- [ ] **Step 2: Se algo FAIL, investigar e fixar**

Se algum test FAIL:
1. Leia o output completo: `cat /tmp/inkflow-suite-output.txt`
2. Identifique qual test e qual file precisa ajuste
3. Faça o fix mínimo
4. Re-rode `bash scripts/test-prompts.sh`
5. Itere até PASS total

**NÃO PROSSEGUIR pra Task 12 sem suite 100% verde.**

- [ ] **Step 3: Sem commit nesta task** se nenhum fix foi necessário. Se houve fix, commit dedicado:

```bash
git add <files-fixed>
git commit -m "fix(coleta-tattoo): <descrição-do-fix>"
```

---

### Task 12: Push branch + abrir PR

**Files:** (git ops)

- [ ] **Step 1: Push da branch**

Run: `git push -u origin feat/coleta-foto-local-refs`
Expected: branch publicada no remote, output `* [new branch] ... -> feat/coleta-foto-local-refs`.

- [ ] **Step 2: Abrir PR via gh**

Run:
```bash
gh pr create --title "feat(coleta-tattoo): foto_local + altura_cm + estilo + R9 (refator OBR_RECOMENDADO)" --body "$(cat <<'EOF'
## Summary

Refator da fase TATTOO do Modo Coleta v2 cobrindo gaps descobertos no smoke E2E pós-PR #29:

- Promove `foto_local` + `altura_cm` + `estilo` a OBR_RECOMENDADO via single shots pós-3 OBR técnicos
- Cria campo `altura_cm` persistido (hoje só fallback)
- Crava princípio R9 + T7: "devolver contradições, nunca decidir pelo cliente"
- Soft re-ask explícito pros 3 OBR técnicos + estimativa via referência visual
- `refs_imagens` vira passive only (R8 mantém aceitar passivo)
- Mensagem-ponte §3.4 estrutura intacta (Balão 1 condicional)
- Payload Telegram inclui `altura cliente: {cm}cm` quando preenchida

**Fora do escopo (vira backlog P0):** anexar foto REAL no Telegram (exige Storage Supabase + signed URL).

## Test plan

- [x] Suite local 100% PASS (`bash scripts/test-prompts.sh`)
- [x] 6 tests novos `dados-coletados` (altura_cm formatos + range + não-bloqueio)
- [x] 2 tests novos `enviar-orcamento-tatuador` (payload com/sem altura)
- [x] 5 invariants novos (§3.3 OBR_RECOMENDADO, §3.3c removida, R9 explícita, T2 sequência, soft re-ask)
- [x] Snapshot `coleta-tattoo` regenerado intencionalmente
- [ ] Smoke E2E manual via WhatsApp (pós-deploy):
  - Cenário 1: cliente completo + foto espontânea → pula single shots foto/estilo
  - Cenário 2: cliente goteja → percorre 3 single shots
  - Cenário 3: foto da perna ≠ antebraço declarado → R9 devolução
  - Cenário 6: altura 3.50m → handoff `dado_implausivel` quando confirmado
  - Cenário 8: estilo conflitante → R9 devolução
  - Cenário 11: tamanho via referência visual → bot estima e confirma
  - Cenário 12: cliente evasivo 2× → handoff funciona

## Backlog follow-ups (criar pós-merge)

- P0 `coleta-fotos-no-telegram-storage` (escopo B: anexar foto REAL no Telegram, exige Storage Supabase)
- P1 review contradições prompt pós-implementação (procurar divergências metodologia nova × antiga)

## Spec

`docs/superpowers/specs/2026-05-06-coleta-foto-local-refs-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR criado, URL retornada.

- [ ] **Step 3: Anotar URL do PR pra memory anchors (Task 14)**

Capture a URL do PR retornada pelo `gh pr create` pra usar em logs/memory.

---

### Task 13: Smoke E2E manual via WhatsApp (Leandro)

**Files:** (manual — Leandro testa via WhatsApp real)

> **Calibração:** Direto Leandro. Claude principal NÃO pode rodar smoke E2E (precisa interação WhatsApp real).

- [ ] **Step 1: Aguardar deploy Cloudflare Pages**

Após push (Task 12), Cloudflare Pages auto-deploya em ~30-60s. Verificar deploy completo via dashboard ou via curl:

Run: `curl -s "https://inkflowbrasil.com/api/tools/dados-coletados" -X POST -H "X-Inkflow-Tool-Secret: $INKFLOW_TOOL_SECRET" -H "Content-Type: application/json" -d '{"tenant_id":"<tid>","telefone":"<phone>","campo":"altura_cm","valor":170}' | jq`
Expected: `{ok: true, valor: 170, ...}` (smoke isolado do tool — confirma deploy live).

- [ ] **Step 2: Leandro roda smoke via WhatsApp tenant de teste**

Cenários a executar (ver lista no PR description). Pra cada:
1. Iniciar conversa nova via WhatsApp
2. Seguir o roteiro do cenário
3. Verificar via Supabase `execute_sql` MCP que estado/dados estão como esperado:
   ```sql
   SELECT estado_agente, dados_coletados, dados_cadastro, valor_proposto, orcid
   FROM conversas
   WHERE tenant_id = '<tid>' AND telefone = '<phone>';
   ```
4. Pra handoff: verificar `dados.handoff_motivo` correto
5. Pra orçamento: verificar Telegram do tatuador chegou com texto incluindo `altura cliente: 170cm`

- [ ] **Step 3: Documentar resultado**

Atualize esta task com tabela de cenários + resultado:

| # | Cenário | Status | Notas |
|---|---|---|---|
| 1 | Cliente completo + foto | ✓/✗ | ... |
| 2 | Cliente goteja | ✓/✗ | ... |
| ... | ... | ... | ... |

Se algum cenário FAIL, abrir issue/PR de hotfix antes do merge final.

- [ ] **Step 4: Sem commit nesta task** — smoke é validação, não muda código (a menos que precise hotfix).

---

### Task 14: Merge + backlog updates + memory anchors

**Files:**
- Merge PR
- Modify: `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Pendências (backlog).md` (adiciona 2 entries)
- Modify: `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md` (estado atual)
- Modify: `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Modo Coleta v2 principal (2026-05-02).md` (decisões cravadas)

- [ ] **Step 1: Merge PR (Leandro confirma)**

Após smoke 100% PASS, Leandro confirma merge. Run:

```bash
gh pr merge <PR-NUMBER> --squash --delete-branch
```
Expected: PR merged, branch deletada local + remote.

- [ ] **Step 2: Atualizar branch local**

Run: `git checkout main && git pull origin main`
Expected: HEAD em main com squash commit do PR.

- [ ] **Step 3: Adicionar entry P0 no backlog (escopo B)**

Editar `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Pendências (backlog).md`. Inserir entry nova logo APÓS a entry atual `P0 — Coleta com foto_local + encaminhar refs visuais ao tatuador` (que será marcada como ✅ RESOLVIDO):

1. Marcar entry atual como resolvida:

```markdown
## ~~P0 — Coleta com foto_local + encaminhar refs visuais ao tatuador~~ ✅ RESOLVIDO 2026-05-06 (PR #<num>)

**Status:** RESOLVIDO via PR #<num>. foto_local + altura_cm + estilo viraram OBR_RECOMENDADO via single shots; R9 + T7 cravados; payload Telegram inclui altura. Refs visuais passive only (R8 mantém aceitar passivo).

Mover entry inteira pra `[[InkFlow — Backlog histórico (resolvidos)]]` no próximo `/daily-end`.
```

2. Adicionar entry nova substituindo:

```markdown
## P0 — Coleta fotos REAIS no Telegram (Storage Supabase) — descoberto 2026-05-06

**Contexto:** PR #<num> (refator OBR_RECOMENDADO) entregou foto_local como descrição textual da imagem (Vision-generated). Tatuador no Telegram recebe payload com TEXTO descritivo, não a foto real. Decisão estratégica do Leandro (cravada smoke 06/05): tatuador deve receber TODAS as fotos REAIS no Telegram junto com orçamento — texto descritivo é insuficiente pra ele cravar valor com confiança total.

**Decisões pendentes** (precisam brainstorm dedicado):
1. Storage: Supabase Storage vs Cloudflare R2 vs Evolution URL direta
2. Schema: campo novo `foto_local_url` ou rename de `foto_local` (que hoje guarda descrição textual)
3. Signed URL TTL: tatuador pode abrir Telegram dias depois — TTL ≥ 30 dias?
4. Retenção LGPD: cliente cancelou → apaga foto?
5. Custo: Storage Supabase pricing pra projetar volume esperado

**Files prováveis afetados:**
- n8n workflow (upload base64 → Storage signed URL)
- Schema/migration: campo URL persistido
- `functions/api/tools/enviar-orcamento-tatuador.js` Telegram `sendPhoto` ou `sendMediaGroup`
- Política de retenção (cron worker?)

**Trigger pra atacar:** próxima sessão livre via `/nova-feature coleta-fotos-no-telegram-storage`.

**Estimativa:** 5-7h (brainstorm + spec + implementação + smoke).

---

## P1 — Review contradições prompt Coleta v2 pós-refator OBR_RECOMENDADO — descoberto 2026-05-06

**Contexto:** PR #<num> introduziu R9 + T7 + reescreveu T2/T3 + refator §3 fluxo + 10 few-shots novos. Pode haver contradições com regras antigas (R1-R8, T1-T6) que sobreviveram sem update, ou com few-shots em outras fases (cadastro, proposta) e few-shot-tenant.js, e com tom.js. A pedido explícito do Leandro pós-implementação.

**Escopo da review:**
- Contradições R9 ↔ R1-R8 e T1-T6 (especialmente R8 interpretação visual)
- Few-shots cadastro/proposta com tom inconsistente com R9
- few-shot-tenant.js (auditoria já feita por sample em PR #28, não exhaustiva)
- Inconsistências prompt ↔ tools (campo X mencionado mas tool não suporta?)
- Validação que R8 e R9 são complementares (R8 = como interpretar imagem; R9 = quando devolver contradição)

**Trigger:** 1-2 dias após merge do PR refator, idealmente após 1 smoke real adicional.

**Estimativa:** 2-3h (auditoria + fix inline se houver).

---
```

- [ ] **Step 4: Atualizar Painel — estado atual**

Editar `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md`:

1. Atualizar `last_updated` no frontmatter pra `"2026-05-06"` (já é).
2. Atualizar `last_session_focus` no frontmatter com resumo da sessão.
3. Adicionar nova seção "Onde estamos agora" com resumo desta sessão (PR #num + decisões cravadas R9/T7/altura).
4. Empurrar estado anterior pra "Estado anterior" (mantém max 2 estados ativos no Painel).

Use o padrão dos resumos anteriores (dia/noite/madrugada do 06/05).

- [ ] **Step 5: Atualizar memory anchor [[InkFlow — Modo Coleta v2 principal]]**

Editar `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Modo Coleta v2 principal (2026-05-02).md`:

Adicionar entry nova no historico de mudanças com:
- Data 2026-05-06
- PR #<num> (refator OBR_RECOMENDADO)
- Decisões cravadas: R9 (devolver contradições) + T7 (tracking) + altura_cm como campo próprio + foto_local OBR_RECOMENDADO + refs_imagens passive only

- [ ] **Step 6: Commit das memory updates**

Memory tem hook auto-sync que commita automaticamente, mas pode forçar:

```bash
cd ~/.claude/projects/-Users-brazilianhustler/memory
git add "InkFlow — Pendências (backlog).md" "InkFlow — Painel.md" "InkFlow — Modo Coleta v2 principal (2026-05-02).md"
git commit -m "memory: PR #<num> coleta-foto-local-refs MERGED + backlog updates"
git push origin main
```

- [ ] **Step 7: Sem commit no repo inkflow-saas** — Task 14 só toca memory + GitHub PR.

---

## Self-Review

**1. Spec coverage:** Cada item do spec mapeado pra task? Verificado:
- [x] Promoção foto_local/altura_cm/estilo a OBR_RECOMENDADO → T5 (fluxo.js §3.3)
- [x] altura_cm persistido como campo → T2 (dados-coletados.js)
- [x] R9 + T7 cravados → T6 (regras.js)
- [x] Soft re-ask 3 OBR técnicos → T5 (fluxo.js §3.2) + T6 (regras.js T7)
- [x] Estimativa via referência visual → T5 (fluxo.js §3.2)
- [x] §3.3c removida → T5 (fluxo.js)
- [x] §3.4 Balão 1 condicional → T5 (fluxo.js §3.4)
- [x] refs_imagens passive only → T5 (fluxo.js §3.3 não menciona) + T9 (invariants test verifica)
- [x] Payload Telegram com altura → T3 (enviar-orcamento-tatuador.js)
- [x] Guardrails detecção altura → T4
- [x] 10 few-shots novos → T7
- [x] 5 invariants novos → T9
- [x] Re-snapshot tattoo → T10
- [x] Suite full validate → T11
- [x] Push + PR → T12
- [x] Smoke E2E → T13
- [x] Backlog follow-ups (B + review contradições) → T14
- [x] Memory anchors → T14

**2. Placeholder scan:** Sem TBDs/TODOs/vague. Cada step tem código exato ou comando exato. ✓

**3. Type consistency:** Verificado:
- `normalizarAltura()` usado em T2 e exportado consistentemente
- `altura_cm` referenciado em T2/T3/T5/T6/T7/T9/T10 com mesmo nome
- `montarTextoOrcamento` referenciado consistentemente em T3
- `cliente_evasivo_infos_incompletas` (motivo handoff) usado consistentemente em T5/T7/T9
- `contradicao_nao_resolvida` (motivo handoff) usado consistentemente em T6/T7/T9

✓ Sem inconsistências.

**4. Bite-sized:** Cada step é 2-5 minutos. Tasks 5/6/7 são maiores (refator de prompt) — calibração pipeline-completa cobre. ✓

**5. Frequent commits:** Cada task tem commit no fim. ✓

**6. TDD:** Tasks 2/3 são TDD strict (test fail → impl → test pass). ✓

**7. Risks flagged:**
- Schema migration: NÃO HÁ (JSONB livre). ✓
- Secrets: NENHUM novo. ✓
- Breaking changes: NENHUM (foto_local agora persistido com semântica string igual; altura_cm é campo novo; refs_imagens semantics inalterada). ✓
- Feature flag: NÃO (rollback = revert PR). ✓

**8. Total tasks: 14.** Dentro do limite de <15. ✓

---

## Audit log (Task 8 — preencher inline durante execução)

- [ ] `few-shot-tenant.js` audit result: [PREENCHER — sem mudança / mudança X / Y]

---

## Status

- [x] Plano escrito
- [ ] Plano revisado e aprovado por Leandro
- [ ] Execution mode escolhido (subagent-driven vs inline)
- [ ] T1-T14 executadas
- [ ] PR mergeado
- [ ] Smoke E2E PASS
- [ ] Backlog updates
- [ ] Memory anchors atualizadas
