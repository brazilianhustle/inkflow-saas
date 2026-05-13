# Sub-4.1 Bug #2 — Continuidade do TattooAgent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir que TattooAgent sempre faça pergunta de follow-up quando `proxima_acao='pergunta'` E `campos_faltando` não-vazio — prompt R8 (primária) + validator (safety net).

**Architecture:** Defesa em profundidade additiva. Camada 1: regra **R8** no prompt `decisao.js §4.3` (guia 95% dos turnos). Camada 2: terceiro bloco em `validateTattooOutputInvariant` (DEFCON pra escapes raros). Workflow baseline-first — confirma bug em eval antes de aplicar fix.

**Tech Stack:** Node test runner, Zod, `@openai/agents` SDK, gpt-4o-mini, Cloudflare Workers (route.js).

**Spec:** `docs/superpowers/specs/2026-05-13-sub4-1-bug2-continuidade-agente-design.md`
**Branch:** `feat/sub4-cutover-n8n` (existente, 7 commits ahead — não abre PR ainda, acumula até Sub-4.2)

**Riscos cravados:**
- Baseline eval pode NÃO reproduzir o bug → **stop-gap explícito** no Task 2 (parar, reportar, decidir).
- Snapshot `coleta-tattoo.txt` muda (R8 adicionada) → regenerar via `scripts/update-prompt-snapshots.sh`.
- Custo OpenAI total: ~$0.05 ($0.020 baseline + $0.020 post-fix + retries).
- Hard-fail HTTP 500 em prod já é pattern (paridade Sub-3.1/3.2/3.3) — sem mudança no `route.js`.

---

## File Structure

**6 arquivos modificados, 0 novos:**

| # | File | Tipo | Responsabilidade |
|---|------|------|------------------|
| 1 | `tests/agent/_fixtures/scenarios.json` | EDIT | Adicionar TC-11 + assertion `resposta_contains_question` em TC-03, TC-04, TC-11 |
| 2 | `tests/agent/tattoo-agent.eval.mjs` | EDIT | Handler da assertion `resposta_contains_question` (~5 linhas no for-loop) |
| 3 | `tests/agent/tattoo-agent.test.mjs` | EDIT | 4 unit tests novos (TDD do validator) |
| 4 | `functions/api/agent/agents/tattoo.js` | EDIT | Terceiro bloco em `validateTattooOutputInvariant` (pergunta + campos_faltando + sem `?` → invalid) |
| 5 | `functions/_lib/prompts/coleta/tattoo/decisao.js` | EDIT | **R8** em §4.3 (~8 linhas: regra + 2 exemplos OK/ERRADO + exceção conflito) |
| 6 | `tests/prompts/snapshots/coleta-tattoo.txt` | REGEN | Regenerado via `scripts/update-prompt-snapshots.sh` |

**Boundary:** zero mudança em `route.js`, `whatsapp-pipeline.js`, schema `TattooOutputSchema`, ou pipeline. Tudo additivo.

---

## Ordem (dependências)

```
Task 1  Eval scaffolding (TC-11 + assertion)        ────┐
Task 2  Baseline eval run (manual, evidence)            ├─ confirma reprodução
                                                        │
Task 3  Unit tests (TDD: write failing tests)       ────┤
Task 4  Validator extension (3º bloco) — unit verde     ├─ fix camada 2
                                                        │
Task 5  Prompt R8 (decisao.js §4.3)                 ────┤
Task 6  Snapshot regen + suite total (409/409)          ├─ fix camada 1
                                                        │
Task 7  Post-fix eval run + comparação                  ├─ acceptance evidence
Task 8  Commit final + push                         ────┘
```

Folhas por último: prompt R8 (Task 5) depois do validator (Task 4) porque validator é safety net que captura escapes do prompt — se inverter, validator falha em eval baseline mesmo sem o prompt mudar (`includes('?')` fica como única defesa antes do prompt guiar).

---

## Task 1: Eval Scaffolding — TC-11 + Assertion Handler

**Files:**
- Modify: `tests/agent/_fixtures/scenarios.json`
- Modify: `tests/agent/tattoo-agent.eval.mjs`

- [ ] **Step 1: Adicionar TC-11 + `resposta_contains_question` em TC-03, TC-04**

Em `tests/agent/_fixtures/scenarios.json`:

**(a)** No objeto TC-03 (`"id": "TC-03"`), dentro de `"expected"`, adicionar a propriedade `"resposta_contains_question": true` (mantendo as outras propriedades):

```json
"expected": {
  "proxima_acao": "pergunta",
  "dados_completos": false,
  "campos_faltando_inclui": ["tamanho_cm"],
  "dados_persistidos_NAO_inclui": ["tamanho_cm"],
  "tools_NUNCA_chamadas": ["handoff_to_cadastro"],
  "resposta_contains_question": true
}
```

**(b)** No objeto TC-04, adicionar a mesma propriedade:

```json
"expected": {
  "proxima_acao": "pergunta",
  "dados_completos": false,
  "tools_NUNCA_chamadas": ["handoff_to_cadastro", "calcular_orcamento", "consultar_horarios"],
  "resposta_contains_question": true
}
```

**(c)** Depois do objeto TC-10 (último elemento), adicionar TC-11 como novo elemento do array `scenarios` (lembre da vírgula após `}` de TC-10):

```json
,
{
  "id": "TC-11",
  "descricao": "2/3 OBR faltando local_corpo — agent DEVE perguntar (bug #2 smoke 09/05)",
  "hipoteses": ["bug2-continuidade"],
  "input": {
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "telefone": "+5511900000011",
    "mensagens": [
      { "role": "user", "content": "quero tatuar um leão de 20cm" }
    ],
    "estado_atual": "tattoo",
    "dados_acumulados": {},
    "historico": []
  },
  "expected": {
    "proxima_acao": "pergunta",
    "dados_completos": false,
    "campos_faltando_inclui": ["local_corpo"],
    "dados_persistidos_inclui": ["descricao_curta", "tamanho_cm"],
    "resposta_contains_question": true
  }
}
```

- [ ] **Step 2: Adicionar handler `resposta_contains_question` em `tattoo-agent.eval.mjs`**

Em `tests/agent/tattoo-agent.eval.mjs`, ao final do bloco `test(...)` (logo após o `if (Array.isArray(scenario.expected.dados_persistidos_inclui))`, antes do `}` que fecha o `test(...)` na linha 130), inserir:

```javascript
    if (scenario.expected.resposta_contains_question === true) {
      assert.ok(
        typeof out.resposta_cliente === 'string' && out.resposta_cliente.includes('?'),
        `${scenario.id}: esperava resposta com '?' — got="${out.resposta_cliente}"`
      );
    }
```

- [ ] **Step 3: Validar JSON do scenarios.json (parse-check sem custo OpenAI)**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node -e "console.log(JSON.parse(require('fs').readFileSync('tests/agent/_fixtures/scenarios.json','utf8')).scenarios.length)"
```

Expected: `11` (10 + TC-11)

- [ ] **Step 4: Smoke-check do eval handler sem chamar OpenAI**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --check tests/agent/tattoo-agent.eval.mjs
```

Expected: silent OK (sem syntax error). `node --check` valida sintaxe sem executar.

- [ ] **Step 5: Commit scaffolding**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add tests/agent/_fixtures/scenarios.json tests/agent/tattoo-agent.eval.mjs && git commit -m "test(eval): TC-11 leão 20cm + assertion resposta_contains_question

Adiciona cenário fiel ao smoke 09/05 (bug #2 continuidade) e estende
TC-03/TC-04 com nova assertion. Handler valida resposta_cliente.includes('?')
quando expected.resposta_contains_question=true.

Refs: docs/superpowers/specs/2026-05-13-sub4-1-bug2-continuidade-agente-design.md"
```

---

## Task 2: Baseline Eval Run — Confirmar Reprodução do Bug

**Files:**
- Read-only: `tests/agent/_fixtures/scenarios.json`
- Append log: `docs/superpowers/plans/2026-05-13-sub4-1-bug2-continuidade-agente.md` (este arquivo, seção "Logs" no fim)

- [ ] **Step 1: Rodar eval baseline e capturar output**

Run (precisa de `OPENAI_API_KEY` exportada — usuário executa, pois custa ~$0.020):
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && OPENAI_API_KEY=$OPENAI_API_KEY npm run eval:tattoo 2>&1 | tee /tmp/eval-baseline.log
```

Expected:
- TC-11 **FAIL** com `esperava resposta com '?' — got="Leão de 20cm fica..."` (ou similar — modelo emite validação sem follow-up).
- TC-03/TC-04 podem passar ou falhar (intermitente — modelo às vezes inclui `?` por sorte).
- TC-01..TC-10 demais: pass (não foram alterados).

- [ ] **Step 2: Anexar log baseline ao plan (seção "Logs" no fim deste arquivo)**

Append ao final deste plan, criando a seção `## Logs — Baseline` se não existir, contendo:
- Data/hora da execução
- Comando completo
- Output completo do `/tmp/eval-baseline.log` (relevante: status de cada TC)
- Quais TCs falharam e qual `resposta_cliente` o modelo emitiu

- [ ] **Step 3: STOP-GAP — decisão sobre prosseguir**

Avaliar baseline:
- **TC-11 FAIL como esperado** → bug confirmado, prosseguir Task 3.
- **TC-11 PASS (não reproduz)** → STOP. Bug pode ter sido resolvido por refator anterior (PR #56/#57/#58) ou observação 09/05 foi flake. Reportar ao usuário, decidir: (a) cancelar plano, (b) tentar reproduzir com input mais agressivo, (c) prosseguir mesmo assim como defesa preventiva.

Não há commit nesta task — só evidência anexada.

---

## Task 3: Unit Tests — TDD do Validator (Failing Tests First)

**Files:**
- Modify: `tests/agent/tattoo-agent.test.mjs`

- [ ] **Step 1: Escrever os 4 failing tests**

Em `tests/agent/tattoo-agent.test.mjs`, ao final do arquivo (após o último `test(...)` na linha ~215), adicionar:

```javascript
// — Sub-4.1 Bug #2: invariant continuidade pergunta —————————————————————
test('validator rejeita pergunta com campos_faltando mas sem ? na resposta_cliente', () => {
  const invalid = {
    resposta_cliente: 'Leão de 20cm fica imponente!',
    dados_persistidos: { descricao_curta: 'leão', tamanho_cm: 20 },
    dados_completos: false,
    campos_faltando: ['local_corpo'],
    campos_conflitantes: [],
    proxima_acao: 'pergunta',
    payload_portfolio: null,
  };
  // Schema cru aceita (sem refine):
  assert.equal(TattooOutputSchema.safeParse(invalid).success, true);
  // Mas validator pos-parse rejeita:
  const r = validateTattooOutputInvariant(invalid);
  assert.equal(r.valid, false);
  assert.match(r.reason, /pergunta com campos_faltando.*resposta sem/);
});

test('validator aceita pergunta com campos_faltando + ? na resposta_cliente', () => {
  const valid = {
    resposta_cliente: 'Leão de 20cm fica imponente! Onde tu quer fazer?',
    dados_persistidos: { descricao_curta: 'leão', tamanho_cm: 20 },
    dados_completos: false,
    campos_faltando: ['local_corpo'],
    campos_conflitantes: [],
    proxima_acao: 'pergunta',
    payload_portfolio: null,
  };
  assert.equal(validateTattooOutputInvariant(valid).valid, true);
});

test('validator aceita pergunta com campos_faltando=[] e resposta sem ? (conflito/clarificação)', () => {
  const valid = {
    resposta_cliente: 'Tu disse pequena mas 25cm já é bem grande, me confirma.',
    dados_persistidos: { descricao_curta: 'rosa', local_corpo: 'antebraco' },
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: ['tamanho_cm'],
    proxima_acao: 'pergunta',
    payload_portfolio: null,
  };
  assert.equal(validateTattooOutputInvariant(valid).valid, true);
});

test('validator: regression — extensão pergunta NÃO quebra invariants handoff/enviar_portfolio', () => {
  const validHandoff = {
    resposta_cliente: 'Fechado, já anotei tudo',
    dados_persistidos: { descricao_curta: 'rosa', tamanho_cm: 8, local_corpo: 'antebraco' },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: [],
    proxima_acao: 'handoff',
    payload_portfolio: null,
  };
  assert.equal(validateTattooOutputInvariant(validHandoff).valid, true);

  const validPortfolio = {
    resposta_cliente: 'Show, te mando alguns trabalhos!',
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: [],
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: 'fineline', max: null, motivo: null },
  };
  assert.equal(validateTattooOutputInvariant(validPortfolio, { portfolio_disponivel: true }).valid, true);
});
```

- [ ] **Step 2: Rodar tests pra verificar que falham (TDD red phase)**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/tattoo-agent.test.mjs 2>&1 | tail -30
```

Expected:
- **FAIL** test "validator rejeita pergunta com campos_faltando mas sem ?" — `expected: false, actual: true` (validator atual retorna valid:true porque não tem o 3º bloco).
- Test "aceita pergunta com `?`" → **PASS** (validator não tem regra que rejeite, e schema aceita).
- Test "aceita pergunta com `campos_faltando=[]`" → **PASS** (validator não tem regra).
- Test regression → **PASS** (invariants antigos intactos).

Confirmar: pelo menos 1 fail (o "rejeita pergunta sem `?`") — esse é o sinal que TDD vai ficar verde após Task 4.

Não commitar ainda — testes ficam vermelhos até Task 4.

---

## Task 4: Validator Extension — Terceiro Bloco em `validateTattooOutputInvariant`

**Files:**
- Modify: `functions/api/agent/agents/tattoo.js:63-84`

- [ ] **Step 1: Estender validator com bloco `proxima_acao === 'pergunta'`**

Em `functions/api/agent/agents/tattoo.js`, dentro de `validateTattooOutputInvariant`, **antes** do `return { valid: true }` final (linha 83), adicionar o terceiro bloco:

```javascript
  if (out.proxima_acao === 'pergunta') {
    const faltando = Array.isArray(out.campos_faltando) ? out.campos_faltando : [];
    if (faltando.length > 0 && typeof out.resposta_cliente === 'string' && !out.resposta_cliente.includes('?')) {
      return {
        valid: false,
        reason: `pergunta com campos_faltando=[${faltando.join(',')}] mas resposta sem '?' — fragment="${out.resposta_cliente.slice(0, 80)}"`,
      };
    }
  }
```

Resultado esperado (função completa após edit):

```javascript
export function validateTattooOutputInvariant(out, clientContext = {}) {
  if (!out || typeof out !== 'object') {
    return { valid: false, reason: 'output ausente ou nao-objeto' };
  }
  if (out.proxima_acao === 'handoff') {
    if (out.dados_completos !== true) {
      return { valid: false, reason: 'handoff com dados_completos=false' };
    }
    if (Array.isArray(out.campos_conflitantes) && out.campos_conflitantes.length > 0) {
      return { valid: false, reason: `handoff com campos_conflitantes nao-vazio: ${out.campos_conflitantes.join(',')}` };
    }
  }
  if (out.proxima_acao === 'enviar_portfolio') {
    if (!clientContext?.portfolio_disponivel) {
      return { valid: false, reason: 'enviar_portfolio com portfolio_disponivel=false' };
    }
    if (!out.payload_portfolio) {
      return { valid: false, reason: 'enviar_portfolio sem payload_portfolio' };
    }
  }
  if (out.proxima_acao === 'pergunta') {
    const faltando = Array.isArray(out.campos_faltando) ? out.campos_faltando : [];
    if (faltando.length > 0 && typeof out.resposta_cliente === 'string' && !out.resposta_cliente.includes('?')) {
      return {
        valid: false,
        reason: `pergunta com campos_faltando=[${faltando.join(',')}] mas resposta sem '?' — fragment="${out.resposta_cliente.slice(0, 80)}"`,
      };
    }
  }
  return { valid: true };
}
```

- [ ] **Step 2: Rodar unit tests do TattooAgent → verde**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --test tests/agent/tattoo-agent.test.mjs 2>&1 | tail -20
```

Expected: **all PASS**, incluindo os 4 novos (test runner reporta `# pass <N>` igual ao total).

- [ ] **Step 3: Rodar suite completa pra zero regressão**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && npm test 2>&1 | tail -30
```

Expected: 409/409 pass (405 prévios + 4 novos). Se algum teste falhar, investigar — regressão real ou snapshot test (`tests/prompts/snapshot.test.mjs`) — snapshot ainda não foi tocado, deve passar.

- [ ] **Step 4: Commit validator + unit tests (camada 2)**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add functions/api/agent/agents/tattoo.js tests/agent/tattoo-agent.test.mjs && git commit -m "feat(tattoo): invariant pergunta com campos_faltando exige '?' na resposta

Terceiro bloco em validateTattooOutputInvariant: quando
proxima_acao='pergunta' E campos_faltando.length>0, resposta_cliente
DEVE conter '?'. Hard-fail HTTP 500 + alert Telegram (paridade
Sub-3.1/3.2/3.3). 4 unit tests cobrem rejeita/aceita/edge-conflict/regression.

Bug observado em smoke 09/05: cliente 'leão 20cm' recebia 'Leão fica
imponente!' sem follow-up sobre local_corpo. Validator é camada 2 (safety
net) — R8 no prompt vem na próxima commit (camada 1).

Refs: docs/superpowers/specs/2026-05-13-sub4-1-bug2-continuidade-agente-design.md"
```

---

## Task 5: Prompt R8 — Camada 1 de Prevenção

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/decisao.js` (§4.3, entre R7 e §4.4)

- [ ] **Step 1: Adicionar R8 no §4.3 do prompt**

Em `functions/_lib/prompts/coleta/tattoo/decisao.js`, localizar o bloco do **R7** (termina em `Resolva conflitos primeiro (R6).`). Logo após o R7 e ANTES do `## §4.4 Mensagem-ponte (handoff — linha 8 da tabela)`, inserir:

```javascript
**R8.** **PERGUNTA com campos faltando — INCLUI a pergunta na \`resposta_cliente\`.**

Quando \`proxima_acao='pergunta'\` E \`campos_faltando\` nao-vazio, \`resposta_cliente\` DEVE conter pergunta explicita sobre o(s) campo(s) faltando — termine ou inclua \`?\` na frase. NUNCA emita so validacao substantiva ("Leao de 20cm fica imponente!") sem fechar com follow-up — o cliente fica esperando e a conversa morre.

- **OK:** "Leao de 20cm fica imponente! Onde tu quer fazer?" (valida + pergunta)
- **ERRADO:** "Leao de 20cm fica imponente!" (valida e para — cliente em silencio)
- **ERRADO:** "Da pra trabalhar bem nessa regiao" (sem persistir + sem perguntar)

Excecao: se \`campos_faltando=[]\` (conflito puro, linhas 6/10/11 da tabela), \`resposta_cliente\` pode ser declarativa sem \`?\` final — devolve contradicao em 1 frase (R6).

```

(Atenção: o ` ``` ` no início é dentro do template literal `return \`...\``, então as crases precisam ser escapadas com `\``. As variáveis `${...}` permanecem como template-literal placeholders. A regra R8 não usa interpolação — texto puro.)

- [ ] **Step 2: Validar sintaxe JS do arquivo modificado**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node --check functions/_lib/prompts/coleta/tattoo/decisao.js
```

Expected: silent OK.

- [ ] **Step 3: Smoke-check do prompt gerado**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && node -e "
import('./functions/_lib/prompts/coleta/tattoo/decisao.js').then(m => {
  const out = m.decisaoTattoo({ config_agente: { aceita_cobertura: true } });
  if (!out.includes('R8.')) { console.error('FAIL: R8 nao encontrada'); process.exit(1); }
  if (!out.includes('campos_faltando') || !out.includes('Excecao')) { console.error('FAIL: corpo do R8 incompleto'); process.exit(1); }
  console.log('OK — R8 presente no prompt');
});
"
```

Expected: `OK — R8 presente no prompt`.

Não commit ainda — snapshot test vai falhar até Task 6 regenerar.

---

## Task 6: Snapshot Regen + Suite Completa

**Files:**
- Regen: `tests/prompts/snapshots/coleta-tattoo.txt` (via script)

- [ ] **Step 1: Rodar suite e confirmar que o snapshot test FALHA (esperado)**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && npm test 2>&1 | grep -A 2 "snapshot\|coleta-tattoo" | head -20
```

Expected: snapshot test do `coleta-tattoo` FAIL com diff mostrando R8 nova. Isso é o comportamento desejado — força o PR a tornar a mudança de prompt explícita.

- [ ] **Step 2: Regenerar snapshot**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && bash scripts/update-prompt-snapshots.sh
```

Expected:
```
OK — 4 snapshots regenerados (coleta-tattoo, coleta-cadastro, coleta-proposta, exato).
```

Verificar que apenas `coleta-tattoo.txt` mudou (R8 adicionada) e os outros 3 ficaram idênticos:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git diff --stat tests/prompts/snapshots/
```

Expected: apenas `tests/prompts/snapshots/coleta-tattoo.txt | <N> +<count>` na lista (cadastro/proposta/exato sem mudança).

- [ ] **Step 3: Rodar suite completa — zero regressão**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && npm test 2>&1 | tail -10
```

Expected: 409/409 pass. Se outro snapshot mudou (cadastro/proposta/exato), investigar — pode indicar que `R8` foi adicionada em local errado ou que o template foi quebrado em outro agent. Reverter e refazer Task 5.

- [ ] **Step 4: Commit prompt + snapshot (camada 1)**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add functions/_lib/prompts/coleta/tattoo/decisao.js tests/prompts/snapshots/coleta-tattoo.txt && git commit -m "feat(prompt): R8 — pergunta com campos_faltando exige '?' (camada 1)

Adiciona R8 em decisao.js §4.3: quando proxima_acao='pergunta' e
campos_faltando nao-vazio, resposta_cliente deve incluir pergunta
explicita (\`?\`). Exemplos OK/ERRADO + excecao pra conflito puro
(campos_faltando=[], R6).

Camada 1 (prompt) guia ~95% dos turnos. Camada 2 (validator, commit
anterior) e DEFCON. Snapshot coleta-tattoo regenerado via
scripts/update-prompt-snapshots.sh.

Refs: docs/superpowers/specs/2026-05-13-sub4-1-bug2-continuidade-agente-design.md"
```

---

## Task 7: Post-Fix Eval Run + Comparação Baseline vs Post-Fix

**Files:**
- Append log: este arquivo de plan (seção "Logs — Post-Fix")

- [ ] **Step 1: Rodar eval post-fix**

Run (usuário executa, custa ~$0.020):
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && OPENAI_API_KEY=$OPENAI_API_KEY npm run eval:tattoo 2>&1 | tee /tmp/eval-postfix.log
```

Expected:
- **TC-11 PASS** (não passava em baseline — bug corrigido).
- **TC-03, TC-04 PASS** com nova assertion `resposta_contains_question`.
- TC-01..TC-10 demais: pass (R8 não afeta cenários sem `pergunta + campos_faltando`).

- [ ] **Step 2: Anexar log post-fix ao plan**

Append a este plan, seção `## Logs — Post-Fix`:
- Data/hora
- Comando
- Output do `/tmp/eval-postfix.log` (status de cada TC)
- **Tabela comparativa baseline vs post-fix** (TC-11, TC-03, TC-04 — antes/depois).

- [ ] **Step 3: Verificar acceptance criteria**

Conferir contra spec §"Acceptance criteria":
- ✅ TC-11 PASS pós-fix (FAIL em baseline)
- ✅ TC-03/TC-04 PASS com `resposta_contains_question`
- ✅ 4 unit tests verdes (Task 4)
- ✅ `npm test` 409/409 (Task 6)
- ✅ Snapshot regenerado (Task 6)
- ✅ Log baseline vs post-fix anexado (este step)
- ✅ Signature do validator inalterada `(out, clientContext = {})` (Task 4)

Se algum item falhar, investigar antes de prosseguir Task 8.

- [ ] **Step 4: Commit do log (evidência)**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git add docs/superpowers/plans/2026-05-13-sub4-1-bug2-continuidade-agente.md && git commit -m "docs(plan): log baseline vs post-fix bug #2 continuidade

Evidência empírica: TC-11 + TC-03 + TC-04 antes (baseline) e depois
(post-fix). Custo total ~\$0.05 (2 runs eval).

Refs: docs/superpowers/specs/2026-05-13-sub4-1-bug2-continuidade-agente-design.md"
```

---

## Task 8: Push (sem PR — branch acumula até Sub-4.2)

**Files:**
- None (git push)

- [ ] **Step 1: Confirmar 3 commits novos no branch**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git log --oneline -10
```

Expected: ver 4 commits novos no topo (eval scaffolding, validator, prompt+snapshot, plan log).

- [ ] **Step 2: Push pro remote**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && git push origin feat/sub4-cutover-n8n
```

Expected: push OK. Sem PR — branch acumula até Sub-4.2 estar pronto (decisão cravada no spec §"Contexto").

- [ ] **Step 3: Atualizar Painel + Mapa geral do Obsidian**

Conforme regra `[[feedback_atualizar_painel_e_mapa_geral_sempre]]`: editar `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md` marcando bug #2 resolvido com referência aos commits, e mover do "current" pra "estado anterior". Atualizar `~/Documents/vault/Mapa geral.md` se relevante.

---

## Logs — Baseline

**Data/hora:** 2026-05-13
**Comando:** `npm run eval:tattoo 2>&1 | tee /tmp/eval-baseline.log`
**Duração:** 42.07s
**Custo estimado:** ~$0.020

**Resultado:** 11/11 PASS — incluindo TC-11 (não reproduziu o bug observado em 09/05).

```
✔ TC-01 — Happy path: cliente fornece todos OBR em 1 msg (5164ms)
✔ TC-02 — Coleta progressiva: cliente fornece campos aos poucos (3 turns) (3513ms)
✔ TC-03 — Cliente vago: 'quero uma rosa pequena' — agent NAO infere tamanho_cm (2680ms)
✔ TC-04 — Pula fase: cliente pergunta preco E disponibilidade sem dar dados (4544ms)
✔ TC-05 — Conflito: 'rosa pequena de 25cm' — agent devolve contradicao (R9) (2659ms)
✔ TC-06 — Foto via descricao externa simulada — persiste foto_local (4171ms)
✔ TC-07 — Validacao JSON output: schema sempre matches (3915ms)
✔ TC-08 — Tools whitelist: prompt malicioso pedindo tool fora (2511ms)
✔ TC-09 — Handoff condicional: chamada APENAS quando dados_completos=true (3394ms)
✔ TC-10 — Multi-turn handoff: cliente fecha 3 OBR no 3o turno apos 2 turnos previos (3024ms)
✔ TC-11 — 2/3 OBR faltando local_corpo — agent DEVE perguntar (bug #2 smoke 09/05) (5465ms)
ℹ tests 11 — pass 11 — fail 0
```

**Análise:** input "quero tatuar um leão de 20cm" produziu `resposta_cliente` contendo `?` (assertion passou). Bug é intermitente — observação 09/05 pode ter sido flake do modelo OU refator anterior (PR #56-58) reduziu probabilidade de escape. TC-03 e TC-04 também passaram com `resposta_contains_question:true`.

**STOP-GAP ativado.** Tentativas de reprodução com inputs agressivos:

| # | Variação | Runs | Resultado |
|---|----------|------|-----------|
| 1 | `"leão 20cm"` (literal smoke, sem histórico) | 5 | 5/5 PASS |
| 2 | `"leão 20cm"` (2º turno, com histórico de saudação) | 5 | 5/5 PASS |

**Total:** 10/10 — bug não reproduz determinísticamente.

**Hipótese forte:** refator `19d9c17` (12/05 — `historico whitelist status=eq.processed`) resolveu indiretamente. Em 09/05 o histórico podia incluir mensagens não-processadas que confundiam o LLM ("history poisoning"). O fix dessa whitelist passa ao modelo apenas mensagens `status=processed`, eliminando o ruído que provavelmente disparava o escape.

**Custo total baseline + variações:** ~$0.035.

Decisão pendente do usuário antes de prosseguir Task 3+.



## Logs — Post-Fix

**Skipped.** Tasks 5/6/7 não foram executadas — user escolheu fix mínimo (só validator camada 2) após STOP-GAP confirmar que bug não reproduz determinísticamente. Sem prompt R8 → sem snapshot regen → sem post-fix eval (baseline já passou 11/11).

---

## Resumo da execução (2026-05-13)

**Escopo final:** só Camada 2 (validator). Sem Camada 1 (prompt R8). Sem eval scaffolding.

**Commits no branch `feat/sub4-cutover-n8n`:**
- `d82f6d5` test(eval): TC-11 + assertion resposta_contains_question
- `9658f3b` Revert "test(eval): TC-11..." (após STOP-GAP)
- `c268c89` feat(tattoo): invariant pergunta com campos_faltando exige '?'

**Decisão de escopo:** baseline eval passou 11/11 incluindo TC-11. Variações com input mais agressivo (5 runs `"leão 20cm"` literal + 5 runs com histórico de cumprimento) = 10/10 pass. Bug observado em smoke 09/05 não reproduz determinísticamente. Hipótese forte: refator `19d9c17` (history whitelist `status=eq.processed`, 12/05) resolveu indiretamente — passa ao modelo apenas mensagens processadas, eliminando "history poisoning".

User optou por implementar só o validator (safety net) como defesa preventiva contra escapes futuros — zero risco de regressão no prompt, sem custo de regen de snapshot, sem post-fix eval.

**Testes:** 409/409 pass (405 prévios + 4 novos).

**Custo OpenAI total:** ~$0.035 (baseline + 10 runs de variação).

**Acceptance criteria revisados:**
- ✅ Validator pos-parse rejeita pergunta+campos_faltando+sem `?` (4 unit tests cobrem)
- ✅ Signature `validateTattooOutputInvariant(out, clientContext={})` inalterada
- ✅ Zero regressão `npm test` 409/409
- ⏭ Prompt R8 — pulado (defesa preventiva sem reprodução, YAGNI)
- ⏭ Snapshot regen — pulado (prompt não mudou)
- ⏭ Eval scaffolding (TC-11) — revertido (sem cenário reproduzível, mantém suite em 10 cenários)
- ⏭ Post-fix eval — pulado (baseline já passou 11/11)
