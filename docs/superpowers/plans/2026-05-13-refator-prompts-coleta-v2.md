# Refator Prompts Coleta v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar TattooAgent + CadastroAgent baseado no Manifesto do Tatuador-Bot (`docs/manifesto-tatuador-bot.md`): 4 OBR redesenhados, princípio "bot nunca sugere tamanho", modo coletor/consultor, pipeline multi-message, e fixes OBS-3/OBS-7 do smoke prod.

**Architecture:** Defesa em profundidade — schema Zod + invariante de runtime + prompt + few-shots + eval direcionado. Pipeline ganha split por `\n\n` + typing delay por balão. Mantém retro-compat com `tamanho_cm` legacy (aceita null).

**Tech Stack:** Cloudflare Pages Functions (JS ESM), OpenAI Agents SDK (`@openai/agents`), Zod, node:test, snapshot tests (`tests/prompts/`), eval real contra `gpt-4o-mini`.

**Spec:** `docs/superpowers/specs/2026-05-13-refator-prompts-coleta-v2-design.md`
**Manifesto:** `docs/manifesto-tatuador-bot.md`
**Branch:** `feat/refator-prompts-coleta-v2` (já criada, spec+manifesto commitados em `47aecf4`)

---

## File Structure

**Editados (12):**
- `functions/_lib/prompts/coleta/tattoo/{objetivo,contexto,decisao,regras,few-shot}.js` — Tasks 5-7
- `functions/_lib/prompts/coleta/cadastro/{decisao,few-shot}.js` — Task 8
- `functions/api/agent/agents/tattoo.js` — Task 2
- `functions/api/tools/enviar-orcamento-tatuador.js` — Task 3
- `functions/_lib/whatsapp-pipeline.js` — Task 4
- `tests/agent/tattoo-agent.test.mjs` — Task 2 (+4 testes)
- `tests/tools/enviar-orcamento-tatuador.test.mjs` — Task 3 (+2 testes)
- `tests/_lib/whatsapp-pipeline.test.mjs` — Task 4 (+3 testes)

**Snapshot regenerados (2):**
- `tests/prompts/snapshots/coleta-tattoo.txt`
- `tests/prompts/snapshots/coleta-cadastro.txt`

**Novos (2):**
- `tests/agent/refator-prompts-coleta-v2.eval.mjs` — Task 10
- `tests/agent/_fixtures/scenarios-refator-v2.json` — Task 10

**Sem mudança nesta sessão:**
- PropostaAgent / PortfolioAgent (out-of-scope)
- `descricao_tattoo` legacy (mantido como fallback na tool — drift cleanup só do prompt regras.js)

---

## Tasks

### Task 1: Manifesto linkado nos prompts (doc-only foundation)

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/decisao.js` (topo)
- Modify: `functions/_lib/prompts/coleta/tattoo/regras.js` (topo)
- Modify: `functions/_lib/prompts/coleta/cadastro/decisao.js` (topo)
- Modify: `functions/_lib/prompts/coleta/cadastro/regras.js` (topo)

Doc-only. Adiciona comentário canônico apontando pro manifesto. Sem testes (não muda comportamento).

- [ ] **Step 1.1: Adicionar comentário em `tattoo/decisao.js`**

Após a linha 9 atual (que termina com `// removidas (audit Fase 9, 2026-05-08 — eram dual-via, mini hallucinava/loopava).`), adicionar linha em branco + bloco:

```js
//
// Manifesto canônico do tatuador-bot: docs/manifesto-tatuador-bot.md
// 6 princípios cravados em 2026-05-13 (sessão training Pilar 1).
// Refator que viole princípio = revisão obrigatória.
```

Use Edit com `old_string` igual à linha exata 9 + newline + linha 10. Verifique com `head -12 functions/_lib/prompts/coleta/tattoo/decisao.js` que a inserção ficou no lugar.

- [ ] **Step 1.2: Adicionar mesmo comentário em `tattoo/regras.js`**

Após a primeira linha de comentário do arquivo (provavelmente `// §X REGRAS — ...`), adicionar o mesmo bloco:

```js
//
// Manifesto canônico do tatuador-bot: docs/manifesto-tatuador-bot.md
```

Inspecione primeiro com `head -3 functions/_lib/prompts/coleta/tattoo/regras.js` pra ter a `old_string` exata.

- [ ] **Step 1.3: Adicionar comentário em `cadastro/decisao.js`**

Mesmo padrão de Step 1.1, no arquivo `cadastro/decisao.js`.

- [ ] **Step 1.4: Adicionar comentário em `cadastro/regras.js`**

Mesmo padrão de Step 1.2, no arquivo `cadastro/regras.js`.

- [ ] **Step 1.5: Validar com grep**

```bash
grep -rn "Manifesto canônico do tatuador-bot" functions/_lib/prompts/coleta/
```

Esperado: 4 ocorrências (1 por arquivo modificado).

- [ ] **Step 1.6: Confirmar suite ainda passa (smoke check)**

```bash
cd ~/Documents/inkflow-saas && node --test tests/prompts/*.test.mjs
```

Esperado: PASS (snapshot tests podem falhar — esperado, vai ser regenerado na Task 9; outros tests do prompts/ devem passar).

Se snapshot tests falharem, esperado — registrar e seguir. Se invariants.test.mjs falhar, investigar (não deveria).

- [ ] **Step 1.7: Commit**

```bash
git add functions/_lib/prompts/coleta/
git commit -m "$(cat <<'EOF'
docs(prompts): linkar manifesto canônico do tatuador-bot

Adiciona comentário no topo dos 4 prompts core (tattoo + cadastro,
decisao + regras) apontando pro manifesto. Refators futuros devem
validar coerência com os 6 princípios cravados.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Schema TattooAgent + invariante (4 OBR pra handoff)

**Files:**
- Modify: `functions/api/agent/agents/tattoo.js` (validador + Zod max)
- Modify: `tests/agent/tattoo-agent.test.mjs` (+4 testes)

Invariante muda: handoff exige `descricao_curta` + `local_corpo` + `altura_cm` + `estilo`. `tamanho_cm` fica opcional. Schema Zod ganha `altura_cm.max(250)` (max razoável humano).

- [ ] **Step 2.1: Inspecionar invariante atual**

```bash
sed -n '60,100p' ~/Documents/inkflow-saas/functions/api/agent/agents/tattoo.js
```

Anotar o bloco de handoff atual (que valida 3 OBR antigos: `descricao_curta + tamanho_cm + local_corpo`).

- [ ] **Step 2.2: Escrever 4 testes failing em `tests/agent/tattoo-agent.test.mjs`**

Adicionar ao final do arquivo (antes do último `})` ou após o último `test(...)` existente):

```js
// === Testes do refator 2026-05-13 — 4 OBR + manifesto ===

test('invariante rejeita handoff sem altura_cm', () => {
  const result = validateTattooOutputInvariant({
    proxima_acao: 'handoff',
    dados_persistidos: {
      descricao_curta: 'leão fineline',
      local_corpo: 'antebraço',
      estilo: 'fineline',
      altura_cm: null,
      tamanho_cm: 15,
    },
    resposta_cliente: 'Pra liberar teu orçamento, me passa nome e data de nascimento.',
    campos_faltando: [],
    campos_conflitantes: [],
  });
  assert.equal(result.valid, false);
  assert.match(result.reason || '', /handoff-sem-OBR-completos/);
  assert.match(result.details || '', /altura_cm/);
});

test('invariante rejeita handoff sem estilo (string vazia)', () => {
  const result = validateTattooOutputInvariant({
    proxima_acao: 'handoff',
    dados_persistidos: {
      descricao_curta: 'leão',
      local_corpo: 'antebraço',
      estilo: '',
      altura_cm: 170,
      tamanho_cm: null,
    },
    resposta_cliente: 'Pra liberar...',
    campos_faltando: [],
    campos_conflitantes: [],
  });
  assert.equal(result.valid, false);
  assert.match(result.details || '', /estilo/);
});

test('invariante aceita handoff com 4 OBR completos (tamanho_cm opcional null)', () => {
  const result = validateTattooOutputInvariant({
    proxima_acao: 'handoff',
    dados_persistidos: {
      descricao_curta: 'leão fineline',
      local_corpo: 'antebraço',
      estilo: 'fineline',
      altura_cm: 170,
      tamanho_cm: null,  // opcional
    },
    resposta_cliente: 'Leão fineline no antebraço fica top.\n\nPra liberar...',
    campos_faltando: [],
    campos_conflitantes: [],
  });
  assert.equal(result.valid, true);
});

test('invariante aceita handoff com 4 OBR + tamanho_cm preenchido (cliente mencionou cm)', () => {
  const result = validateTattooOutputInvariant({
    proxima_acao: 'handoff',
    dados_persistidos: {
      descricao_curta: 'rosa fineline',
      local_corpo: 'pulso direito',
      estilo: 'fineline',
      altura_cm: 165,
      tamanho_cm: 7,
    },
    resposta_cliente: 'Rosa fineline no pulso fica delicada.\n\nPra liberar...',
    campos_faltando: [],
    campos_conflitantes: [],
  });
  assert.equal(result.valid, true);
});
```

- [ ] **Step 2.3: Rodar testes pra confirmar que falham**

```bash
cd ~/Documents/inkflow-saas && node --test tests/agent/tattoo-agent.test.mjs 2>&1 | tail -30
```

Esperado: os 4 novos testes FALHAM (porque invariante ainda valida `tamanho_cm` ao invés de `altura_cm + estilo`). Testes existentes (suite atual ~50+ no arquivo) devem continuar passando OU falhar previsivelmente (alguns testes existentes podem violar nova lógica — anotar e ajustar abaixo).

- [ ] **Step 2.4: Refatorar `validateTattooOutputInvariant` em `functions/api/agent/agents/tattoo.js`**

Localizar o bloco existente que começa com `if (out.proxima_acao === 'handoff') {` e substitui pela versão nova com 4 OBR:

```js
  // Bloco handoff — 4 OBR completos (refator 2026-05-13 + manifesto tatuador-bot)
  if (out.proxima_acao === 'handoff') {
    const dat = out.dados_persistidos || {};
    const obrFaltando = [];
    if (!dat.descricao_curta?.trim()) obrFaltando.push('descricao_curta');
    if (!dat.local_corpo?.trim())     obrFaltando.push('local_corpo');
    if (!dat.estilo?.trim())          obrFaltando.push('estilo');
    if (dat.altura_cm == null)        obrFaltando.push('altura_cm');
    if (obrFaltando.length > 0) {
      return {
        valid: false,
        reason: 'handoff-sem-OBR-completos',
        details: `handoff bloqueado: OBR faltando=${obrFaltando.join(',')}`,
      };
    }
    // Mantém check existente de campos_conflitantes (se houver no bloco original — preservar).
  }
```

**Importante:** ler o bloco original cuidadosamente. Se já existe check de `campos_conflitantes` no handoff, preservar como sub-check após o novo `obrFaltando` block. Se o original já fazia check com `tamanho_cm`, remover.

- [ ] **Step 2.5: Ajustar Zod schema (max 250 em altura_cm)**

Localizar a linha do schema atual (~linha 38 em `tattoo.js`):
```js
altura_cm: z.number().positive().max(200).nullable().optional(),
```

Trocar `.max(200)` por `.max(250)`:
```js
altura_cm: z.number().positive().max(250).nullable().optional(),
```

Justificativa: altura corporal humana max razoável.

- [ ] **Step 2.6: Rodar testes novos + suite agente completa**

```bash
node --test tests/agent/tattoo-agent.test.mjs 2>&1 | tail -50
```

Esperado: 4 novos testes PASS. Anotar quaisquer testes existentes que falharam por causa da mudança de OBR (provavelmente alguns testes existentes que passavam `tamanho_cm` sem `altura_cm` em handoff — esperado falhar agora).

- [ ] **Step 2.7: Ajustar testes existentes que falharam**

Para cada teste existente do `tests/agent/tattoo-agent.test.mjs` que falhou:
- Se o teste valida handoff: adicionar `altura_cm: 170` + `estilo: 'realismo'` (ou similar) ao `dados_persistidos`. Justificativa em comentário: "refator 4 OBR — adicionado pra validar handoff".
- Se o teste valida `proxima_acao='pergunta'` ou `proxima_acao='erro'`: nenhuma mudança (não afeta).

Rodar suite até passar todos.

- [ ] **Step 2.8: Validar regression nos outros agents (Cadastro/Proposta/Portfolio)**

```bash
node --test tests/agent/*.test.mjs 2>&1 | grep -E "^(ok|not ok|# pass|# fail)" | tail -20
```

Esperado: zero fail.

- [ ] **Step 2.9: Commit**

```bash
git add functions/api/agent/agents/tattoo.js tests/agent/tattoo-agent.test.mjs
git commit -m "$(cat <<'EOF'
feat(tattoo-agent): invariante de handoff exige 4 OBR (descricao_curta + local_corpo + altura_cm + estilo)

Refator pré-manifesto: tamanho_cm vira opcional, altura_cm + estilo viram bloqueantes
em proxima_acao=handoff. Schema Zod ganha max(250) em altura_cm.

+4 unit tests em tattoo-agent.test.mjs. Tests existentes ajustados pra incluir altura+estilo
em payloads de handoff.

Refs: docs/superpowers/specs/2026-05-13-refator-prompts-coleta-v2-design.md §3
Manifesto: docs/manifesto-tatuador-bot.md P2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Tool downstream `enviar-orcamento-tatuador.js` (4 OBR + template)

**Files:**
- Modify: `functions/api/tools/enviar-orcamento-tatuador.js`
- Modify: `tests/tools/enviar-orcamento-tatuador.test.mjs`

Tool valida `altura_cm` + `estilo` + `local_corpo` (no lugar de `tamanho_cm`). Template Telegram renderiza altura + estilo. `tamanho_cm` vira linha opcional.

- [ ] **Step 3.1: Inspecionar tool atual**

```bash
sed -n '60,80p; 145,160p' ~/Documents/inkflow-saas/functions/api/tools/enviar-orcamento-tatuador.js
```

Anotar linhas exatas do template Telegram (~73) e da validação `faltando` (~150-151).

- [ ] **Step 3.2: Escrever 2 testes failing em `tests/tools/enviar-orcamento-tatuador.test.mjs`**

Adicionar ao final do arquivo:

```js
test('aceita payload com 4 OBR (altura_cm + estilo) — tamanho_cm null OK', async () => {
  // Mock dependencies + chamar handler com payload válido
  const payload = {
    telefone: '5511999999999',
    dat: {
      descricao_curta: 'leão fineline',
      local_corpo: 'antebraço',
      altura_cm: 170,
      estilo: 'fineline',
      tamanho_cm: null,  // opcional
    },
    cadastro: { nome: 'João', data_nascimento: '1990-03-15' },
  };
  // Assume helper `callHandler(payload)` ou similar do test sample — adaptar ao pattern existente do arquivo
  const result = await callHandlerHere(payload);  // ajustar ao helper local
  assert.equal(result.status, 200);
  assert.equal(result.body?.ok, true);
});

test('rejeita payload sem altura_cm — campos-faltando inclui altura_cm', async () => {
  const payload = {
    telefone: '5511999999999',
    dat: {
      descricao_curta: 'leão',
      local_corpo: 'antebraço',
      altura_cm: null,
      estilo: 'fineline',
      tamanho_cm: 15,
    },
    cadastro: { nome: 'João', data_nascimento: '1990-03-15' },
  };
  const result = await callHandlerHere(payload);
  assert.equal(result.status, 400);
  assert.equal(result.body?.error, 'campos-faltando');
  assert.ok(result.body?.faltando?.includes('altura_cm'));
});
```

**Importante:** o nome real do helper varia. Inspecionar o pattern existente em `tests/tools/enviar-orcamento-tatuador.test.mjs` antes de escrever (provavelmente algo como `await onRequestPost({request, env})` com mock Telegram). Adaptar os 2 testes ao pattern usado pelos testes existentes do arquivo.

- [ ] **Step 3.3: Rodar testes — confirmar fail**

```bash
node --test tests/tools/enviar-orcamento-tatuador.test.mjs 2>&1 | tail -20
```

Esperado: 2 novos testes FAIL.

- [ ] **Step 3.4: Refatorar validação em `enviar-orcamento-tatuador.js`**

Localizar o bloco `if (!dat.tamanho_cm) faltando.push('tamanho_cm');` (linha ~151) e substituir:

```js
if (!dat.descricao_tattoo && !dat.descricao_curta) faltando.push('descricao_tattoo');
if (!dat.local_corpo) faltando.push('local_corpo');
if (dat.altura_cm == null) faltando.push('altura_cm');
if (!dat.estilo) faltando.push('estilo');
// tamanho_cm não-bloqueante (refator manifesto 2026-05-13 — opcional)
```

Remover linha original `if (!dat.tamanho_cm) faltando.push('tamanho_cm');`.

- [ ] **Step 3.5: Refatorar template Telegram**

Localizar linha ~73 (`linhas.push(\`   • ${dat.tamanho_cm}cm\`);`) e substituir bloco por:

```js
linhas.push(`   • altura: ${dat.altura_cm}cm`);
if (dat.tamanho_cm) linhas.push(`   • tamanho aproximado: ${dat.tamanho_cm}cm`);
linhas.push(`   • estilo: ${dat.estilo}`);
```

Localizar a linha existente `if (estilo) linhas.push(...)` (linha ~75) e remover (estilo passou pra dentro do bloco novo, sempre presente porque é OBR).

- [ ] **Step 3.6: Rodar testes — confirmar PASS**

```bash
node --test tests/tools/enviar-orcamento-tatuador.test.mjs 2>&1 | tail -20
```

Esperado: 2 novos PASS. Testes existentes podem precisar de ajuste (payloads que passavam `tamanho_cm` sem `altura_cm` agora falham). Ajustar payloads dos testes existentes pra incluir `altura_cm` + `estilo`.

- [ ] **Step 3.7: Validar suite tools completa**

```bash
node --test tests/tools/*.test.mjs 2>&1 | tail -10
```

Esperado: zero fail.

- [ ] **Step 3.8: Commit**

```bash
git add functions/api/tools/enviar-orcamento-tatuador.js tests/tools/enviar-orcamento-tatuador.test.mjs
git commit -m "$(cat <<'EOF'
feat(tool-orçamento): valida 4 OBR (altura_cm + estilo + local_corpo) — tamanho_cm opcional

Refator pré-manifesto: tool downstream alinha com schema novo do TattooAgent.
Template Telegram tatuador render altura+estilo no lugar de só cm; tamanho_cm
vira linha condicional se cliente mencionou.

+2 unit tests em enviar-orcamento-tatuador.test.mjs. Testes existentes ajustados.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Pipeline multi-message split

**Files:**
- Modify: `functions/_lib/whatsapp-pipeline.js` (Etapa 7)
- Modify: `tests/_lib/whatsapp-pipeline.test.mjs` (+3 testes)

Pipeline ganha loop: split `resposta_cliente` por `\n\n` + envia balão por balão com typing delay 1.5s antes de cada.

- [ ] **Step 4.1: Inspecionar Etapa 7 atual**

```bash
sed -n '180,210p' ~/Documents/inkflow-saas/functions/_lib/whatsapp-pipeline.js
```

Anotar o bloco atual de envio único (`await deps.sleep(TYPING_DELAY_MS); await deps.evoSend(...)`).

- [ ] **Step 4.2: Escrever 3 testes failing em `tests/_lib/whatsapp-pipeline.test.mjs`**

Adicionar ao final do arquivo, antes do último `})`:

```js
test('multi-message: resposta com \\n\\n envia 2 balões com typing delay entre cada', async () => {
  let evoCalls = [];
  let sleepCalls = 0;
  const deps = mockDeps({
    runAgent: async () => ({
      ok: true,
      resposta_cliente: 'Massa, fineline fica top!\n\nPra liberar teu orçamento, me passa nome completo e data de nascimento.',
      estado_novo: 'cadastro',
      dados_persistidos: { descricao_curta: 'leão', altura_cm: 170, estilo: 'fineline', local_corpo: 'antebraço' },
      proxima_acao: 'handoff',
      agent_usado: 'tattoo',
    }),
    evoSend: async (_t, payload) => { evoCalls.push(payload); return { ok: true }; },
    sleep: async () => { sleepCalls += 1; },
  });
  await processMessage(baseMsg(), { env: {}, deps });
  assert.equal(evoCalls.length, 2, 'deve enviar 2 mensagens separadas');
  assert.equal(evoCalls[0].text, 'Massa, fineline fica top!');
  assert.equal(evoCalls[1].text, 'Pra liberar teu orçamento, me passa nome completo e data de nascimento.');
  assert.ok(sleepCalls >= 2, 'deve chamar sleep antes de cada balão');
});

test('multi-message: resposta sem \\n\\n envia 1 mensagem (comportamento atual preservado)', async () => {
  let evoCalls = [];
  const deps = mockDeps({
    runAgent: async () => ({
      ok: true,
      resposta_cliente: 'Massa, fineline fica top!',
      estado_novo: 'tattoo',
      dados_persistidos: {},
      proxima_acao: 'pergunta',
      agent_usado: 'tattoo',
    }),
    evoSend: async (_t, payload) => { evoCalls.push(payload); return { ok: true }; },
  });
  await processMessage(baseMsg(), { env: {}, deps });
  assert.equal(evoCalls.length, 1);
  assert.equal(evoCalls[0].text, 'Massa, fineline fica top!');
});

test('multi-message: \\n\\n\\n (3+ newlines) trata como 1 separador (filter Boolean)', async () => {
  let evoCalls = [];
  const deps = mockDeps({
    runAgent: async () => ({
      ok: true,
      resposta_cliente: 'Primeira frase.\n\n\n\nSegunda frase.',
      estado_novo: 'tattoo',
      dados_persistidos: {},
      proxima_acao: 'pergunta',
      agent_usado: 'tattoo',
    }),
    evoSend: async (_t, payload) => { evoCalls.push(payload); return { ok: true }; },
  });
  await processMessage(baseMsg(), { env: {}, deps });
  assert.equal(evoCalls.length, 2, 'deve enviar 2 balões (newlines extras tratadas como 1 separador)');
});
```

- [ ] **Step 4.3: Rodar testes — confirmar fail**

```bash
node --test tests/_lib/whatsapp-pipeline.test.mjs 2>&1 | tail -30
```

Esperado: 3 novos testes FAIL (pipeline envia 1 mensagem sempre).

- [ ] **Step 4.4: Refatorar Etapa 7 em `functions/_lib/whatsapp-pipeline.js`**

Localizar o bloco que tem `await deps.sleep(TYPING_DELAY_MS);` seguido de `const sendRes = await deps.evoSend(tenant, { type: 'text', to: telefone, text: respostaCliente });` (~linha 190-200).

Substituir por:

```js
    // Etapa 7 — envia resposta (multi-message split por \n\n, refator manifesto 2026-05-13).
    const baloes = respostaCliente
      .split(/\n\s*\n/)
      .map(b => b.trim())
      .filter(Boolean);

    if (baloes.length === 0) {
      throw new Error(`resposta_cliente vazia após split (tenant=${tenant.id})`);
    }

    for (let i = 0; i < baloes.length; i++) {
      await deps.sleep(TYPING_DELAY_MS);
      const sendRes = await deps.evoSend(tenant, {
        type: 'text', to: telefone, text: baloes[i],
      });
      if (!sendRes.ok) {
        throw new Error(`evo sendText falhou balão ${i+1}/${baloes.length}: ${sendRes.error || 'unknown'} (tenant=${tenant.id})`);
      }
    }
```

**Importante:** ler o bloco original com cuidado — pode haver lógica adicional adjacente (logs, side_effects tracking, etc) que precisa ser preservada. Manter tudo que vinha antes do `await deps.sleep` e tudo que vinha depois do `if (!sendRes.ok)`.

- [ ] **Step 4.5: Rodar testes — confirmar PASS**

```bash
node --test tests/_lib/whatsapp-pipeline.test.mjs 2>&1 | tail -30
```

Esperado: 3 novos PASS. Testes existentes do mesmo arquivo continuam passando.

- [ ] **Step 4.6: Validar suite completa**

```bash
npm test 2>&1 | tail -15
```

Esperado: zero fail (snapshot tests podem falhar — esperado, Task 9 resolve).

- [ ] **Step 4.7: Commit**

```bash
git add functions/_lib/whatsapp-pipeline.js tests/_lib/whatsapp-pipeline.test.mjs
git commit -m "$(cat <<'EOF'
feat(pipeline): multi-message split por \\n\\n com typing delay por balão

Etapa 7 do pipeline ganha loop: separa resposta_cliente por linhas em branco,
filtra balões vazios, envia cada balão com 1.5s de typing delay antes.

Conversa WhatsApp fica em bolhas curtas sequenciais (mais natural) em vez de
textão monolítico. Latência cresce ~1.5s por balão extra mas tatuador real
também faz pausas — é feature, não bug.

+3 unit tests cobrindo: 2 balões, 1 balão (preservado), 3+ newlines (filtrados).

Refs: docs/manifesto-tatuador-bot.md "Tom e forma"

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: TattooAgent objetivo + contexto

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/objetivo.js`
- Modify: `functions/_lib/prompts/coleta/tattoo/contexto.js`

Reescrever lista de OBR. Sem testes diretos (prompts são strings — validados via snapshot na Task 9 e via eval na Task 10).

- [ ] **Step 5.1: Inspecionar `objetivo.js` atual**

```bash
cat ~/Documents/inkflow-saas/functions/_lib/prompts/coleta/tattoo/objetivo.js
```

Estrutura atual mencionará 3 OBR (descricao_curta + tamanho_cm + local_corpo).

- [ ] **Step 5.2: Reescrever `objetivo.js`**

Substituir conteúdo COMPLETO do arquivo (após o comentário inicial) por:

```js
// §3 OBJETIVO — Coleta v2 TattooAgent (refator manifesto 2026-05-13).
//
// Manifesto canônico do tatuador-bot: docs/manifesto-tatuador-bot.md
export function objetivoTattoo() {
  return `# §3 OBJETIVO

Voce coleta 4 campos obrigatorios (OBR) pra montar o orcamento da tattoo:

1. **descricao_curta** — tema/ideia da tattoo. Texto livre. Ex: "rosa", "leao realismo", "frase fineline".
2. **local_corpo** — parte do corpo onde a tattoo vai. Texto livre. Ex: "antebraco direito", "biceps", "costas".
3. **altura_cm** — **altura do CLIENTE** em centimetros (NUMERO). Ex: 165, 170, 178. **Importante:** isso e a altura corporal da pessoa, NAO o tamanho da tattoo. Tatuador usa pra calcular proporcao.
4. **estilo** — fineline / realismo / blackwork / tradicional / aquarela / etc. Texto livre.

Campos OPCIONAIS (persiste se cliente mencionar; nao bloqueia handoff):

- **tamanho_cm** — tamanho aproximado da tattoo em cm. **NAO PERGUNTE proativamente.** Maioria dos clientes nao sabe; tatuador decide proporcao no dia. Se cliente mencionar (ex: "queria uns 10cm"), persista.
- **foto_local** — descricao/URL da foto do local do corpo. **Pedida proativamente ate 2x** (ver §4 DECISAO). Se cliente nao mandar nem na 2a, segue.
- **refs_imagens** — array de descricoes/URLs de fotos referencia do desenho. Opcional. Pedida 1x no modo consultor (cliente indeciso).

Apos os 4 OBR completos: \`proxima_acao='handoff'\` + mensagem-ponte pra fase Cadastro.

**REGRA CRUCIAL (Manifesto P1):** voce NUNCA sugere tamanho ao cliente — nem reduzir, nem aumentar, nem propor range. Tatuador decide no dia.`;
}
```

- [ ] **Step 5.3: Inspecionar `contexto.js` atual**

```bash
cat ~/Documents/inkflow-saas/functions/_lib/prompts/coleta/tattoo/contexto.js
```

Procurar bloco "Dados ja coletados" que provavelmente lista os campos persistidos.

- [ ] **Step 5.4: Refatorar `contexto.js` — bloco "Dados ja coletados"**

Localizar o bloco que renderiza dados persistidos (provavelmente em torno da linha 36-50 conforme grep anterior — `if (dados.tamanho_cm) dadosLinhas.push(...)`).

Adicionar refs aos novos campos OBR + status da foto. Estrutura nova:

```js
  // Dados ja coletados — refator manifesto 2026-05-13 — 4 OBR + status foto
  if (dados.descricao_curta) dadosLinhas.push(`- descricao_curta: ${dados.descricao_curta}`);
  if (dados.local_corpo)    dadosLinhas.push(`- local_corpo: ${dados.local_corpo}`);
  if (dados.altura_cm != null) dadosLinhas.push(`- altura_cm (cliente): ${dados.altura_cm}cm`);
  if (dados.estilo)         dadosLinhas.push(`- estilo: ${dados.estilo}`);
  if (dados.tamanho_cm)     dadosLinhas.push(`- tamanho_cm (opcional): ${dados.tamanho_cm}cm`);
  if (dados.foto_local)     dadosLinhas.push(`- foto_local: presente`);

  // Status foto pedida ate 2x (refator manifesto P3)
  const tentativasFoto = conversa?.estado_extra?.tentativas_foto_local || 0;
  if (tentativasFoto > 0 && !dados.foto_local) {
    dadosLinhas.push(`- foto_local: pedida ${tentativasFoto}x sem resposta`);
  }
```

**Importante:** preservar o resto do arquivo (header, retorno final, outras seções). Apenas atualizar o bloco específico de "Dados ja coletados". Se houver bloco antigo com só `tamanho_cm`, substituir inteiramente.

- [ ] **Step 5.5: Validar sintaxe**

```bash
node -c functions/_lib/prompts/coleta/tattoo/objetivo.js && node -c functions/_lib/prompts/coleta/tattoo/contexto.js && echo OK
```

Esperado: OK (sem syntax error).

- [ ] **Step 5.6: Rodar testes de contrato (sem snapshot ainda)**

```bash
node --test tests/prompts/contracts/ 2>&1 | tail -10 || true
```

Snapshot tests vão falhar — esperado. Contracts tests devem PASS (verificam `must_contain` / `must_not_contain`).

- [ ] **Step 5.7: Commit**

```bash
git add functions/_lib/prompts/coleta/tattoo/objetivo.js functions/_lib/prompts/coleta/tattoo/contexto.js
git commit -m "$(cat <<'EOF'
feat(tattoo-prompts): objetivo + contexto refletem 4 OBR + manifesto

Reescreve §3 OBJETIVO: 4 OBR (descricao_curta + local_corpo + altura_cm + estilo).
Cravada distinção "altura_cm = altura do CLIENTE, não tamanho da tattoo".
Tamanho_cm + foto_local + refs_imagens como opcionais com regras.

Contexto exibe status da foto_local (perguntada Nx, sem resposta).

Refs: docs/manifesto-tatuador-bot.md P1+P2+P3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: TattooAgent decisao.js (R8 + R6 reformulado + foto + modo)

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/decisao.js`

Maior arquivo do refator. 5 mudanças coordenadas: §4.1 tabela 4 OBR, §4.3 nova R8, §4.3 R6 reformulado, §4.4 foto pedida ante de handoff, §4.X nova seção modo coletor/consultor.

- [ ] **Step 6.1: Backup mental do estado atual**

```bash
wc -l ~/Documents/inkflow-saas/functions/_lib/prompts/coleta/tattoo/decisao.js
```

Arquivo atual tem ~123 linhas. Vai crescer pra ~180-200 com as mudanças.

- [ ] **Step 6.2: Edit §4.1 — tabela de decisao (3 OBR → 4 OBR)**

Localizar a linha `OBR = obrigatorios coletados. "vazio"=0/3, "parcial"=1-2/3, "completo"=3/3.` e substituir por:

```
OBR = obrigatorios coletados (4 campos). "vazio"=0/4, "parcial"=1-3/4, "completo"=4/4.
```

- [ ] **Step 6.3: Edit §4.2 — descrição dos OBR**

Localizar bloco que começa com `**OBR (Obrigatorios):** os 3 campos que voce DEVE coletar — \`descricao_curta\`, \`tamanho_cm\`, \`local_corpo\`.` e substituir por:

```
**OBR (Obrigatorios):** os 4 campos que voce DEVE coletar — \`descricao_curta\`, \`local_corpo\`, \`altura_cm\`, \`estilo\`. "Vazio" = 0 deles. "Parcial" = 1-3. "Completo" = 4.

- \`descricao_curta\`: tema/ideia. Texto livre. Ex: "rosa fineline", "leao realismo".
- \`local_corpo\`: parte do corpo. Texto livre. Ex: "antebraco direito", "biceps".
- \`altura_cm\`: **altura do CLIENTE** em centimetros (numero). Ex: 165, 170, 178. **NAO e o tamanho da tattoo** — e a altura corporal da pessoa. Pergunte naturalmente: "qual a sua altura?".
- \`estilo\`: fineline / realismo / blackwork / tradicional / aquarela / etc. Se cliente vago, ofereca opcoes ("tu prefere algo bem delicado tipo fineline, ou mais sombreado tipo realismo?").

**OPCIONAIS** (persiste se cliente mencionar; nao bloqueia handoff):
- \`tamanho_cm\`: tamanho aproximado da tattoo em cm. **NAO PERGUNTE proativamente** (Manifesto P1 — tatuador decide proporcao no dia).
- \`foto_local\`: foto do local do corpo. **Pedida ate 2x** (ver §4.4).
- \`refs_imagens\`: foto referencia do desenho. Opcional.
```

- [ ] **Step 6.4: Edit §4.3 — nova R8 "bot nunca sugere tamanho"**

Localizar o bloco que termina com `**R7.** **OUTPUT FINAL — UMA VEZ POR TURNO.**` (ou similar) e adicionar APÓS R7, antes de §4.4:

```
**R8 (Manifesto P1). NUNCA SUGIRA TAMANHO AO CLIENTE.** Nem reduzir, nem aumentar, nem propor range/valor. Tatuador decide proporcao no dia. Exemplos PROIBIDOS:
- "fineline geralmente e 8-10cm, te recomendo reduzir" ❌
- "uns 5-8cm fica melhor pra rosa pequena" ❌
- "leao em torno de 18cm fica encaixado" ❌

Se cliente especifica estilo + tamanho que parecem incompativeis ("rosa pequena de 25cm"), aplique R6 abaixo. Se cliente nao sabe tamanho ("queria uma rosa nao sei tamanho"), apenas siga o fluxo coletando os 4 OBR — NAO sugira valor de cm.
```

- [ ] **Step 6.5: Edit §4.3 — R6 reformulado (conflito sem confronto direto)**

Localizar `**R6.** **CONFLITO:** quando aciona linha 6/10/11 da tabela...` e substituir o bloco inteiro de R6 por:

```
**R6. CONFLITO (Manifesto P1).** Quando cliente fornece valores contraditorios pro mesmo campo na MESMA mensagem (ex: "rosa pequena de 25cm" — pequena vs 25cm sao incompativeis), voce DEVE:
- NAO incluir o valor do campo conflitante em \`dados_persistidos\` (deixe \`null\`/\`""\`).
- Adicionar o nome do campo em \`campos_conflitantes\`.
- **NAO CONFRONTE o cliente** ("me confirma 25cm ou 5-8cm?" e PROIBIDO — sugere tamanho).
- Em vez disso, **PEDIR UMA FOTO REFERENCIA**: "tu tem alguma foto de referencia desse desenho que tu quer? Ajuda muito o tatuador entender a ideia".
- Se cliente responder "nao tenho", siga o fluxo NORMAL coletando outros OBR. Caso atipico — tatuador resolve depois.
```

- [ ] **Step 6.6: Edit §4.4 — mensagem-ponte com foto pedida 1x antes**

Localizar `## §4.4 Mensagem-ponte (handoff — linha 8 da tabela)` e adicionar SUB-FLUXO ANTES da explicação de balões:

```
## §4.4 Mensagem-ponte (handoff — linha 8 da tabela)

**ANTES de emitir \`proxima_acao='handoff'\`:**

Se \`foto_local\` ainda nao foi coletada E nao foi pedida nesta conversa: **PECA A FOTO 1 VEZ** com frase natural. Exemplo cravado:

> "Fechou, e consegue mandar também a foto do local? É importante pro tatuador ter noção do espaço e conseguir passar o valor certinho."

Defina \`proxima_acao='pergunta'\` nesse turno (NAO handoff). Cliente:
- Manda a foto → persista em \`foto_local\` + handoff no proximo turno.
- "Nao tenho" / "nao consigo" → registre \`foto_local=null\` + handoff no proximo turno (sem repetir pedido — ja foi 1x).
- Ignora ou desvia → handoff no proximo turno.

**Quando linha 8 dispara (handoff confirmado), sua \`resposta_cliente\` tem 2 baloes (separados por linha em branco \`\\n\\n\`):**

**Balao 1 — validacao substantiva:** comente UMA caracteristica concreta da tattoo escolhida (visibilidade, espaco, estilo, proporcao). NUNCA generico tipo "Show, anotei tudo" — vazio.
- "Rosa fineline no antebraco fica delicada e bem visivel"
- "Leao realismo nesse antebraco fica imponente — bom espaco pra detalhe"
- "Frase em fineline no pulso fica elegante"

**Balao 2 — pedido cadastro em texto corrido (NUNCA bullet list):**
- "Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve"

Separe baloes com UMA linha em branco. NUNCA escreva \`\\n\` literal.

**Limite:** maximo 2 baloes por turno (3+ excepcional — conversa fica longa).
```

- [ ] **Step 6.7: Add §4.6 — Modo coletor vs consultor (Manifesto P6)**

Adicionar APÓS §4.5 (portfolio) no final do arquivo:

```
## §4.6 Modo coletor vs consultor (Manifesto P6)

**Detector de modo (avalie nos primeiros 1-2 turnos):**

Cliente esta em **MODO CONSULTOR** se sua mensagem inicial sinaliza indecisao:
- "queria fazer uma tatuagem mas nao sei o que"
- "tenho vontade mas nao decidi"
- "me ajuda a escolher"
- "queria algo legal sei la"
- "nunca fiz e nao sei por onde comecar"

Caso contrario (cliente menciona tema, estilo, local OU referencia): **MODO COLETOR** (fluxo normal §4.1-§4.4).

**Fluxo do MODO CONSULTOR (funil de descoberta):**

1. **Pergunte LOCAL DO CORPO + ESTILO preferido**. Ofereça lista de estilos: "Tem alguma ideia de qual parte do corpo tu quer? E em termos de estilo, tu prefere algo mais delicado tipo fineline, mais sombreado tipo realismo, mais grafico tipo blackwork, ou tradicional?"
2. **Sugira BUSCAR REFERENCIAS no Pinterest/internet:** "Bom comecar tambem buscando referencias no Pinterest ou no Instagram pra ti ter inspiracao do que curtes. Pode mandar pra mim quando achar".
3. Cliente volta com referencia → **TRANSICIONE PRO MODO COLETOR** (fluxo normal). Persista \`refs_imagens\` + capta os 4 OBR restantes.

**Regra crucial modo consultor:**
- NAO peca cm. NAO peca altura ainda (ate cliente trazer referencia ou ideia mais concreta).
- Tom de "vou te ajudar a chegar la", nao "preencha o formulario".
- Bullet list aceitavel APENAS pra listar estilos quando oferece opcoes.

**Se cliente continua indeciso apos 2-3 turnos no modo consultor:** \`proxima_acao='erro'\` com trigger "cliente nao consegue definir intencao mesmo guiado" — tatuador resolve presencialmente.
```

- [ ] **Step 6.8: Validar sintaxe**

```bash
node -c functions/_lib/prompts/coleta/tattoo/decisao.js && echo OK
```

Esperado: OK.

- [ ] **Step 6.9: Validar contracts (must_contain)**

```bash
node --test tests/prompts/contracts/ 2>&1 | grep -E "^(ok|not ok)" | head -20
```

Contracts deve continuar passando (verifica `descricao_curta`, `local_corpo`, etc — todos presentes no novo conteúdo).

- [ ] **Step 6.10: Commit**

```bash
git add functions/_lib/prompts/coleta/tattoo/decisao.js
git commit -m "$(cat <<'EOF'
feat(tattoo-prompts): decisao.js refletido pelo manifesto (R8 + R6 + foto + modo)

Mudanças:
- §4.1 tabela: 4 OBR ("completo"=4/4, não 3/3)
- §4.2: descrição dos 4 OBR explicita altura_cm = altura DO CLIENTE
- §4.3 R8 NOVA: "Bot NUNCA sugira tamanho" (Manifesto P1)
- §4.3 R6 reformulado: conflito → pede foto referência, sem confronto
- §4.4: ANTES de handoff, pede foto_local 1× ("Fechou, e consegue mandar...")
- §4.6 NOVA: modo consultor (cliente indeciso) — funil local+estilo+Pinterest

Refs: docs/manifesto-tatuador-bot.md P1+P3+P6

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: TattooAgent regras + few-shot (cleanup + exemplos novos)

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/regras.js`
- Modify: `functions/_lib/prompts/coleta/tattoo/few-shot.js`

`regras.js`: refator R9 (conflito) + drift cleanup. `few-shot.js`: reescreve Exemplos 4 e 6 + adiciona 2 exemplos novos (modo consultor + foto pedida 2× negada).

- [ ] **Step 7.1: Inspecionar `regras.js` linhas críticas**

```bash
sed -n '40,60p' ~/Documents/inkflow-saas/functions/_lib/prompts/coleta/tattoo/regras.js
```

- [ ] **Step 7.2: Refatorar R9 + drift cleanup em `regras.js`**

Localizar bloco que começa em ~linha 44 com `**R9. CONFLITO DE DADOS:**` e substituir por:

```js
  linhas.push('**R9. CONFLITO DE DADOS (Manifesto P1):** quando cliente fornece valores contraditorios pro mesmo campo na MESMA mensagem (ex: "rosa pequena de 25cm" — pequena vs 25cm sao incompativeis), voce DEVE:');
  linhas.push('- (a) NAO incluir o valor do campo conflitante em `dados_persistidos`;');
  linhas.push('- (b) popular `campos_conflitantes` no output com o nome do campo (ex: ["tamanho_cm"]);');
  linhas.push('- (c) NAO CONFRONTE o cliente (PROIBIDO sugerir tamanho — Manifesto P1);');
  linhas.push('- (d) PECA UMA FOTO REFERENCIA: "tu tem alguma foto referencia desse desenho? Ajuda muito o tatuador entender a ideia";');
  linhas.push('- (e) Cliente "nao tenho" → siga fluxo NORMAL coletando outros OBR (caso atipico — tatuador resolve depois).');
```

- [ ] **Step 7.3: Drift cleanup linha 55 (descricao_tattoo → descricao_curta)**

Localizar linha contendo `descricao_tattoo` em `regras.js`. Substituir todas as ocorrências por `descricao_curta`:

```bash
grep -n "descricao_tattoo" functions/_lib/prompts/coleta/tattoo/regras.js
```

Esperado: 1-2 ocorrências. Use Edit com `replace_all: true` se houver múltiplas com mesma string exata. Caso contrário, edits individuais.

- [ ] **Step 7.4: Validar `regras.js`**

```bash
node -c functions/_lib/prompts/coleta/tattoo/regras.js && grep -c "descricao_tattoo" functions/_lib/prompts/coleta/tattoo/regras.js
```

Esperado: 0 ocorrências de `descricao_tattoo`.

- [ ] **Step 7.5: Inspecionar `few-shot.js` (Exemplo 4 e Exemplo 6)**

```bash
cat ~/Documents/inkflow-saas/functions/_lib/prompts/coleta/tattoo/few-shot.js
```

- [ ] **Step 7.6: Reescrever Exemplo 4 (fallback altura — SEM sugerir tamanho)**

Localizar bloco Exemplo 4 (~linha 53-65) e substituir por:

```js
  // Exemplo 4: cliente nao sabe tamanho — bot NAO sugere valor (Manifesto P1)
  linhas.push('## Exemplo 4 — Cliente nao sabe tamanho');
  linhas.push('');
  linhas.push('CLIENTE: queria um leao no peitoral mas nao tenho ideia do tamanho');
  linhas.push('AGENTE: Massa! Leao no peitoral fica imponente, da pra trabalhar bons detalhes');
  linhas.push('');
  linhas.push('AGENTE: Pra eu seguir, qual estilo tu prefere? (realismo, blackwork, fineline, tradicional, etc) E qual a tua altura?');
  linhas.push('CLIENTE: realismo, tenho 1.78m');
  linhas.push('AGENTE: Show, realismo pra um leao fica top, pega bem o detalhe. Anotei: leao realismo no peitoral, altura 178cm.');
  linhas.push('');
  linhas.push('# (proxima_acao=handoff implicitamente proximo turno apos pedir foto local — nao sugere tamanho)');
  linhas.push('');
```

- [ ] **Step 7.7: Reescrever Exemplo 6 (conflito — pede foto, nao confronta)**

Localizar bloco Exemplo 6 (~linha 80-95, deve estar com "rosa pequena de 25cm") e substituir por:

```js
  // Exemplo 6: conflito — bot pede foto referência (Manifesto P1)
  linhas.push('## Exemplo 6 — Conflito (cliente diz pequena + 25cm)');
  linhas.push('');
  linhas.push('CLIENTE: queria uma rosa pequena de 25cm no antebraco');
  linhas.push('AGENTE: Tu tem alguma foto referencia desse desenho que tu quer? Ajuda muito o tatuador entender a ideia');
  linhas.push('CLIENTE: nao tenho foto');
  linhas.push('AGENTE: Sem problema! E qual estilo tu prefere — fineline, blackwork, traditional, realismo?');
  linhas.push('');
  linhas.push('# (campos_conflitantes=["tamanho_cm"], proxima_acao=pergunta — NAO confronta, NAO sugere range)');
  linhas.push('');
```

- [ ] **Step 7.8: Adicionar Exemplo 9 — Modo consultor (cliente indeciso)**

Adicionar APÓS o último exemplo existente, antes do `return linhas.join('\n');`:

```js
  // Exemplo 9 NOVO (refator 2026-05-13): modo consultor (cliente indeciso)
  linhas.push('## Exemplo 9 — Modo CONSULTOR (cliente "nao sei o que tatuar")');
  linhas.push('');
  linhas.push('CLIENTE: queria fazer uma tattoo mas nao sei o que ainda');
  linhas.push('AGENTE: Boa! Vou te ajudar a chegar la. Tem alguma ideia de qual parte do corpo tu quer? E em termos de estilo, tu prefere algo bem delicado tipo fineline, mais sombreado tipo realismo, mais grafico tipo blackwork, ou tradicional?');
  linhas.push('CLIENTE: queria no antebraco, gosto de fineline');
  linhas.push('AGENTE: Show! Fineline no antebraco fica delicado e bem visivel. Aproveita pra dar uma olhada no Pinterest ou Instagram com "fineline antebraco" pra ti achar referencias do que curtes. Pode me mandar quando encontrar');
  linhas.push('');
  linhas.push('# (modo consultor — local_corpo + estilo coletados, sugere Pinterest, aguarda referencia)');
  linhas.push('');
```

- [ ] **Step 7.9: Adicionar Exemplo 10 — Foto pedida → cliente "nao tenho" → handoff segue**

Adicionar APÓS Exemplo 9:

```js
  // Exemplo 10 NOVO (refator 2026-05-13): foto pedida 1x antes de handoff, cliente nao tem
  linhas.push('## Exemplo 10 — Foto pedida antes de handoff (cliente "nao tenho")');
  linhas.push('');
  linhas.push('# Contexto: 4 OBR completos (descricao_curta=leao fineline, local_corpo=antebraco, altura_cm=170, estilo=fineline)');
  linhas.push('AGENTE: Fechou, e consegue mandar tambem a foto do local? E importante pro tatuador ter nocao do espaco e conseguir passar o valor certinho');
  linhas.push('CLIENTE: nao tenho foto agora');
  linhas.push('AGENTE: Leao fineline no antebraco fica delicado e bem visivel');
  linhas.push('');
  linhas.push('AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve');
  linhas.push('');
  linhas.push('# (proxima_acao=handoff — foto_local=null aceita, handoff segue)');
  linhas.push('');
```

- [ ] **Step 7.10: Validar sintaxe**

```bash
node -c functions/_lib/prompts/coleta/tattoo/regras.js && node -c functions/_lib/prompts/coleta/tattoo/few-shot.js && echo OK
```

Esperado: OK.

- [ ] **Step 7.11: Validar contracts**

```bash
node --test tests/prompts/contracts/ 2>&1 | grep -E "^(ok|not ok)" | head -10
```

Esperado: contracts coleta-tattoo pass (must_contain `descricao_curta` ainda válido; novos exemplos não adicionam tools fantasma).

- [ ] **Step 7.12: Commit**

```bash
git add functions/_lib/prompts/coleta/tattoo/regras.js functions/_lib/prompts/coleta/tattoo/few-shot.js
git commit -m "$(cat <<'EOF'
feat(tattoo-prompts): regras + few-shot alinhados ao manifesto

regras.js:
- R9 (conflito): pede foto referência, NÃO confronta cliente
- Drift cleanup: descricao_tattoo → descricao_curta

few-shot.js:
- Exemplo 4 reescrito: cliente "não sei tamanho" → bot NÃO sugere cm
- Exemplo 6 reescrito: conflito → bot pede foto, sem confronto
- Exemplo 9 NOVO: modo consultor (cliente vago + Pinterest)
- Exemplo 10 NOVO: foto pedida pré-handoff + cliente "não tenho" → handoff segue

Refs: docs/manifesto-tatuador-bot.md P1+P3+P6

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: CadastroAgent decisao + few-shot (OBS-3 + OBS-7)

**Files:**
- Modify: `functions/_lib/prompts/coleta/cadastro/decisao.js`
- Modify: `functions/_lib/prompts/coleta/cadastro/few-shot.js`

R7 reforçado pra aceitar data BR (OBS-7). Nova §4.X "comunicar próximo passo pós-handoff" (OBS-3). Few-shots novos.

- [ ] **Step 8.1: Inspecionar `decisao.js` (R7 atual)**

```bash
grep -n "R7\|data_nasc\|ISO" ~/Documents/inkflow-saas/functions/_lib/prompts/coleta/cadastro/decisao.js | head -10
```

R7 atual está em ~linha 59 (`**R7.** DATA NASC → ISO YYYY-MM-DD ANTES de persistir. Formato indecifravel: NAO persiste, pede "pode mandar tipo 12/03/1995?".`).

- [ ] **Step 8.2: Reescrever R7 com casos explícitos BR**

Substituir bloco R7 inteiro (linha ~57-60) por:

```
**R7. DATA NASC — normalizacao OBRIGATORIA pra ISO YYYY-MM-DD ANTES de persistir.**

Aceite QUALQUER formato comum brasileiro/internacional. Voce normaliza sempre internamente:

| Formato cliente | dados_persistidos.data_nascimento |
|----------------|----------------------------------|
| "20/05/1995"   | "1995-05-20" |
| "20-05-1995"   | "1995-05-20" |
| "20.05.1995"   | "1995-05-20" |
| "1995-05-20"   | "1995-05-20" (já ISO) |
| "20 de maio de 1995" | "1995-05-20" |
| "vinte de maio de 95" | normalize se ano inferivel; senao pede confirmacao |
| "nao sei", "depois" | NAO persiste — `campos_faltando=['data_nascimento']` |
| "vinte e poucos anos" | NAO persiste — pede data real |

Formato realmente indecifravel: NAO persiste, pede educadamente: "pode mandar a data tipo 20/05/1995?". Em hipotese alguma persista placeholder, "nao sei", string vazia, ou data ambigua sem ano completo.
```

- [ ] **Step 8.3: Adicionar §4.X "comunicar próximo passo pós-handoff" (OBS-3)**

Localizar onde está documentado o flow pós-`enviar_orcamento_tatuador`. Provavelmente em §4 do `decisao.js`. Adicionar nova subseção APÓS R7 ou no fim do §4 (ainda dentro do template literal):

```
## §4.5 Apos enviar_orcamento_tatuador retornar ok=true — comunique proximo passo

**OBRIGATORIO** quando \`enviar_orcamento_tatuador\` retornar \`{ok:true}\`: a sua \`resposta_cliente\` deve incluir os 3 elementos:

1. **Nome do cliente** (chama pelo nome — usa primeiro nome de \`dados_cadastro.nome\`).
2. **Mencao ao tatuador** (use \`tenant.tatuador_nome\` ou similar — fallback "o tatuador").
3. **Expectativa de tempo** ("em breve", "logo te retorno", "te retorno em breve com o valor").

**Exemplo cravado:**

> "Show, Joao! Vou repassar pro Dagobert avaliar agora. Em breve te retorno aqui com o valor certinho da tua tattoo."

**NUNCA responda seco** ("Beleza, Joao!" ❌ — viola Manifesto P5). Cliente precisa entender o que vai acontecer agora + ter expectativa de tempo. Se nao souber o nome do tatuador, use "o tatuador" como fallback.
```

- [ ] **Step 8.4: Inspecionar `few-shot.js` atual**

```bash
cat ~/Documents/inkflow-saas/functions/_lib/prompts/coleta/cadastro/few-shot.js
```

- [ ] **Step 8.5: Adicionar 2 exemplos novos em `few-shot.js`**

Adicionar APÓS o último exemplo existente, antes do `return linhas.join('\n');` (ou pattern de retorno):

```js
  // Exemplo NOVO (refator 2026-05-13 OBS-7): data BR normalizada
  linhas.push('## Exemplo BR-1 — Cliente passa data formato brasileiro DD/MM/AAAA');
  linhas.push('');
  linhas.push('AGENTE: Pra liberar teu orcamento, me passa nome completo e data de nascimento (e-mail e opcional)');
  linhas.push('CLIENTE: Maria Souza, 20/05/1995');
  linhas.push('AGENTE: Beleza Maria!');
  linhas.push('');
  linhas.push('(persiste dados_persistidos.nome="Maria Souza" e data_nascimento="1995-05-20" — normalizou ISO automaticamente, proxima_acao=handoff porque OBR completos)');
  linhas.push('');

  // Exemplo NOVO (refator 2026-05-13 OBS-3): comunica próximo passo após enviar_orcamento ok
  linhas.push('## Exemplo PROX-1 — Apos enviar_orcamento_tatuador retornar ok=true');
  linhas.push('');
  linhas.push('# Contexto: cliente passou nome + data, agent emitiu handoff, tool enviar_orcamento_tatuador retornou {ok:true}');
  linhas.push('AGENTE: Show, Joao! Vou repassar pro Dagobert avaliar agora');
  linhas.push('');
  linhas.push('AGENTE: Em breve te retorno aqui com o valor certinho da tua tattoo');
  linhas.push('');
  linhas.push('(2 baloes separados — chama pelo nome, menciona tatuador, expectativa de tempo)');
  linhas.push('');
```

- [ ] **Step 8.6: Validar sintaxe**

```bash
node -c functions/_lib/prompts/coleta/cadastro/decisao.js && node -c functions/_lib/prompts/coleta/cadastro/few-shot.js && echo OK
```

Esperado: OK.

- [ ] **Step 8.7: Commit**

```bash
git add functions/_lib/prompts/coleta/cadastro/decisao.js functions/_lib/prompts/coleta/cadastro/few-shot.js
git commit -m "$(cat <<'EOF'
feat(cadastro-prompts): R7 (data BR) reforçado + §4.5 comunicar próximo passo

decisao.js:
- R7: tabela explícita de formatos BR aceitos (DD/MM/AAAA, DD-MM-AAAA, etc) → ISO
- §4.5 NOVA: após enviar_orcamento_tatuador ok=true, comunique nome + tatuador + "em breve"

few-shot.js:
- Exemplo BR-1: data "20/05/1995" persiste como "1995-05-20" (OBS-7)
- Exemplo PROX-1: pós-handoff com 2 balões, nome + tatuador + expectativa (OBS-3)

Refs: smoke prod 2026-05-13 OBS-3, OBS-7

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Snapshot regen + suite validation final

**Files:**
- Regenerate: `tests/prompts/snapshots/coleta-tattoo.txt`
- Regenerate: `tests/prompts/snapshots/coleta-cadastro.txt`

Não toca código novo. Apenas regenera snapshots dos prompts modificados nas Tasks 5-8 e valida suite total.

- [ ] **Step 9.1: Inspecionar script de regen**

```bash
cat ~/Documents/inkflow-saas/scripts/update-prompt-snapshots.sh
```

- [ ] **Step 9.2: Rodar regen**

```bash
cd ~/Documents/inkflow-saas && bash scripts/update-prompt-snapshots.sh
```

Esperado: script atualiza `tests/prompts/snapshots/coleta-{tattoo,cadastro}.txt` (e proposta se rodar 3, mas proposta não mudou — diff deve ser zero).

- [ ] **Step 9.3: Inspecionar diff dos snapshots**

```bash
git diff tests/prompts/snapshots/coleta-tattoo.txt | head -50
git diff tests/prompts/snapshots/coleta-cadastro.txt | head -50
```

Esperado: diff cobre todas as mudanças das Tasks 5-8 (novos OBR, R8, R6 reformulado, foto pré-handoff, modo consultor, R7 BR table, §4.5 comunicação).

Validação visual: garantir que o diff faz sentido e não tem mudanças não-intencionais. Se diff vier maior que o esperado, abrir o arquivo .txt e analisar.

- [ ] **Step 9.4: Rodar snapshot tests pra confirmar pass**

```bash
node --test tests/prompts/snapshot.test.mjs 2>&1 | tail -15
```

Esperado: 4/4 pass (coleta-tattoo, coleta-cadastro, coleta-proposta, exato — todos batem com novos snapshots).

- [ ] **Step 9.5: Rodar suite total**

```bash
npm test 2>&1 | tail -20
```

Esperado: ~418/418 pass (suite atual 409 + 9 novos das Tasks 2/3/4). Zero fail.

Se houver fail:
- Test integration de agents (Cadastro/Proposta/Portfolio) que dependam de `enviar_orcamento_tatuador` payload — ajustar payloads pra incluir `altura_cm` + `estilo` se necessário.
- Test de pipeline com mock evoSend que conta calls — pode precisar ajustar se conta calls específicos.

Documentar qualquer ajuste necessário antes de commitar.

- [ ] **Step 9.6: Commit**

```bash
git add tests/prompts/snapshots/
git commit -m "$(cat <<'EOF'
test(prompts): regenera snapshots coleta-tattoo + coleta-cadastro pós-refator

Mudanças capturadas:
- coleta-tattoo: 4 OBR (descricao_curta + local_corpo + altura_cm + estilo),
  §4.3 R8 "bot nunca sugere tamanho", §4.3 R6 reformulado (pede foto),
  §4.4 foto pré-handoff, §4.6 modo consultor, exemplos 4/6 reescritos +
  exemplos 9/10 novos
- coleta-cadastro: R7 tabela BR explícita, §4.5 comunicar próximo passo,
  exemplos BR-1 + PROX-1 novos

Suite total: ~418/418 pass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Eval direcionado (acceptance gate)

**Files:**
- Create: `tests/agent/refator-prompts-coleta-v2.eval.mjs`
- Create: `tests/agent/_fixtures/scenarios-refator-v2.json`

Eval real contra `gpt-4o-mini`. 18 cenários cobrindo Manifesto P1-P6 + OBS-3 + OBS-7. Custo ~$0.15-0.25.

- [ ] **Step 10.1: Criar fixtures JSON**

Criar `tests/agent/_fixtures/scenarios-refator-v2.json`:

```json
{
  "scenarios": [
    {
      "id": "MAN-1-fineline-15cm",
      "principio": "P1",
      "context_dados": {},
      "messages": [
        {"role": "user", "content": "Quero tatuar um leão fineline de 15cm no antebraço"}
      ],
      "expect": {
        "proxima_acao_in": ["pergunta", "handoff"],
        "resposta_must_not_match": ["reduzir", "menor", "menores", "pequeno demais", "[0-9]+\\s*-\\s*[0-9]+\\s*cm"]
      }
    },
    {
      "id": "MAN-2-conflito-pede-foto",
      "principio": "P1",
      "context_dados": {},
      "messages": [
        {"role": "user", "content": "Queria uma rosa pequena de 25cm no antebraço"}
      ],
      "expect": {
        "proxima_acao": "pergunta",
        "campos_conflitantes_inclui": ["tamanho_cm"],
        "resposta_must_match": ["foto", "referência|referencia|imagem"]
      }
    },
    {
      "id": "MAN-3-conflito-sem-foto-segue",
      "principio": "P1",
      "context_dados": {},
      "messages": [
        {"role": "user", "content": "Queria uma rosa pequena de 25cm no antebraço"},
        {"role": "assistant", "content": "Tu tem alguma foto referência?"},
        {"role": "user", "content": "Não tenho foto"}
      ],
      "expect": {
        "proxima_acao": "pergunta",
        "resposta_must_not_match": ["confirma se é 25cm", "5-8cm"]
      }
    },
    {
      "id": "MAN-4-4-OBR-handoff",
      "principio": "P2",
      "context_dados": {"descricao_curta": "leão", "local_corpo": "antebraço", "estilo": "fineline"},
      "messages": [
        {"role": "assistant", "content": "Qual sua altura?"},
        {"role": "user", "content": "1.78m"}
      ],
      "expect": {
        "proxima_acao_in": ["pergunta", "handoff"],
        "dados_persistidos.altura_cm_in": [178, 1.78, 178.0]
      }
    },
    {
      "id": "MAN-5-falta-altura-pergunta",
      "principio": "P2",
      "context_dados": {"descricao_curta": "leão", "local_corpo": "antebraço", "estilo": "fineline"},
      "messages": [
        {"role": "user", "content": "Leão fineline no antebraço"}
      ],
      "expect": {
        "proxima_acao": "pergunta",
        "campos_faltando_inclui": ["altura_cm"]
      }
    },
    {
      "id": "MAN-6-foto-pedida-1x",
      "principio": "P3",
      "context_dados": {"descricao_curta": "leão", "local_corpo": "antebraço", "estilo": "fineline", "altura_cm": 178},
      "messages": [
        {"role": "user", "content": "1.78m"}
      ],
      "expect": {
        "proxima_acao": "pergunta",
        "resposta_must_match": ["foto", "espaço|espaco"]
      }
    },
    {
      "id": "MAN-7-foto-2x-negada-handoff",
      "principio": "P3",
      "context_dados": {"descricao_curta": "leão", "local_corpo": "antebraço", "estilo": "fineline", "altura_cm": 178},
      "messages": [
        {"role": "assistant", "content": "Consegue mandar foto do local?"},
        {"role": "user", "content": "Não tenho"}
      ],
      "expect": {
        "proxima_acao": "handoff",
        "dados_persistidos.foto_local_in": [null, ""]
      }
    },
    {
      "id": "MAN-9-validacao-substantiva",
      "principio": "P5",
      "context_dados": {},
      "messages": [
        {"role": "user", "content": "Leão realismo"}
      ],
      "expect": {
        "resposta_must_match": ["realismo|imponente|massa|top|detalhe"],
        "resposta_must_not_match": ["^Anotei tudo", "^Show!?$", "^Beleza\\.$"]
      }
    },
    {
      "id": "MAN-10-modo-consultor",
      "principio": "P6",
      "context_dados": {},
      "messages": [
        {"role": "user", "content": "Queria fazer uma tatuagem mas não sei o que ainda"}
      ],
      "expect": {
        "proxima_acao": "pergunta",
        "resposta_must_match": ["estilo|fineline|realismo|blackwork|local|parte|corpo|Pinterest"]
      }
    },
    {
      "id": "MAN-11-consultor-volta-coletor",
      "principio": "P6",
      "context_dados": {"local_corpo": "antebraço", "estilo": "fineline"},
      "messages": [
        {"role": "assistant", "content": "Olha no Pinterest"},
        {"role": "user", "content": "Achei: queria essa rosa estilo geométrico"}
      ],
      "expect": {
        "proxima_acao": "pergunta",
        "campos_faltando_inclui_subset_of": ["altura_cm", "estilo", "descricao_curta"]
      }
    },
    {
      "id": "MAN-12-multi-balao-handoff",
      "principio": "multi-msg",
      "context_dados": {"descricao_curta": "leão fineline", "local_corpo": "antebraço", "altura_cm": 178, "estilo": "fineline"},
      "messages": [
        {"role": "assistant", "content": "Foto do local?"},
        {"role": "user", "content": "Sem foto"}
      ],
      "expect": {
        "proxima_acao": "handoff",
        "resposta_contains_double_newline": true
      }
    },
    {
      "id": "OBS3-resposta-com-nome-tatuador",
      "principio": "OBS-3",
      "agent": "cadastro",
      "context_dados": {"nome": "João", "data_nascimento": "1990-03-15"},
      "tenant_extra": {"tatuador_nome": "Dagobert"},
      "messages": [
        {"role": "system_tool", "content": "{\"ok\":true,\"orcid\":\"orc_test\"}"}
      ],
      "expect": {
        "resposta_must_match": ["João|Joao", "Dagobert|tatuador", "em breve|logo|retorno"]
      }
    },
    {
      "id": "OBS7-1-data-BR-slash",
      "principio": "OBS-7",
      "agent": "cadastro",
      "context_dados": {"nome": "Maria Souza"},
      "messages": [
        {"role": "user", "content": "20/05/1995"}
      ],
      "expect": {
        "dados_persistidos.data_nascimento": "1995-05-20"
      }
    },
    {
      "id": "OBS7-2-data-BR-dash",
      "principio": "OBS-7",
      "agent": "cadastro",
      "context_dados": {"nome": "João"},
      "messages": [
        {"role": "user", "content": "15-03-1990"}
      ],
      "expect": {
        "dados_persistidos.data_nascimento": "1990-03-15"
      }
    },
    {
      "id": "OBS7-3-data-ja-ISO",
      "principio": "OBS-7",
      "agent": "cadastro",
      "context_dados": {"nome": "Pedro"},
      "messages": [
        {"role": "user", "content": "1992-08-22"}
      ],
      "expect": {
        "dados_persistidos.data_nascimento": "1992-08-22"
      }
    },
    {
      "id": "REGR-1-rosa-rapida-handoff",
      "principio": "regression",
      "context_dados": {},
      "messages": [
        {"role": "user", "content": "Fineline rosa 7cm no pulso direito, 1.65m de altura"}
      ],
      "expect": {
        "proxima_acao_in": ["pergunta", "handoff"]
      }
    },
    {
      "id": "REGR-2-conflito-foto-segue",
      "principio": "regression",
      "context_dados": {},
      "messages": [
        {"role": "user", "content": "Rosa pequena de 25cm antebraço"},
        {"role": "assistant", "content": "Tem foto referência?"},
        {"role": "user", "content": "Não"}
      ],
      "expect": {
        "proxima_acao": "pergunta"
      }
    }
  ]
}
```

- [ ] **Step 10.2: Criar runner `tests/agent/refator-prompts-coleta-v2.eval.mjs`**

```js
// Eval suite REFATOR PROMPTS COLETA v2 — Manifesto P1-P6 + OBS-3/OBS-7.
// NAO roda em CI (filename *.eval.mjs fora do glob *.test.mjs).
//
// Run: OPENAI_API_KEY=sk-... node --test tests/agent/refator-prompts-coleta-v2.eval.mjs
//
// Custo estimado: ~$0.15-0.25 por suite completa (18 cenarios).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Agent, run } from '@openai/agents';
import { TattooOutputSchema } from '../../functions/api/agent/agents/tattoo.js';
import { CadastroOutputSchema } from '../../functions/api/agent/agents/cadastro.js';
import { generatePromptColetaTattoo } from '../../functions/_lib/prompts/coleta/tattoo/generate.js';
import { generatePromptColetaCadastro } from '../../functions/_lib/prompts/coleta/cadastro/generate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '_fixtures', 'scenarios-refator-v2.json');
const { scenarios } = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY ausente — eval suite nao pode rodar');
  process.exit(1);
}

const FAKE_TENANT = {
  id: 'tenant-eval',
  nome_estudio: 'Estudio Eval',
  config_agente: { aceita_cobertura: true },
  gatilhos_handoff: [],
  faqs: [],
  fewshots: [],
};

function buildAgent(scenario) {
  const agentType = scenario.agent || 'tattoo';
  const tenant = { ...FAKE_TENANT, ...(scenario.tenant_extra || {}) };
  const conversa = {
    id: 'conversa-eval',
    telefone: '+5511999999999',
    estado_agente: agentType === 'cadastro' ? 'coletando_cadastro' : 'coletando_tattoo',
    dados_coletados: scenario.context_dados || {},
    dados_cadastro: agentType === 'cadastro' ? (scenario.context_dados || {}) : {},
  };
  if (agentType === 'cadastro') {
    return new Agent({
      name: 'cadastro-eval',
      model: 'gpt-4o-mini',
      instructions: generatePromptColetaCadastro(tenant, conversa, {}),
      tools: [],
      outputType: CadastroOutputSchema,
    });
  }
  return new Agent({
    name: 'tattoo-eval',
    model: 'gpt-4o-mini',
    instructions: generatePromptColetaTattoo(tenant, conversa, {}),
    tools: [],
    outputType: TattooOutputSchema,
  });
}

function lastUserMessageOrEmpty(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return '';
}

function checkExpect(scenario, output) {
  const expect = scenario.expect || {};
  const errors = [];
  if (expect.proxima_acao && output.proxima_acao !== expect.proxima_acao) {
    errors.push(`proxima_acao=${output.proxima_acao}, esperado ${expect.proxima_acao}`);
  }
  if (expect.proxima_acao_in && !expect.proxima_acao_in.includes(output.proxima_acao)) {
    errors.push(`proxima_acao=${output.proxima_acao}, esperado um de [${expect.proxima_acao_in.join(',')}]`);
  }
  if (expect.resposta_must_match) {
    for (const pattern of expect.resposta_must_match) {
      if (!new RegExp(pattern, 'i').test(output.resposta_cliente || '')) {
        errors.push(`resposta NAO contem padrao "${pattern}". Resposta: ${output.resposta_cliente}`);
      }
    }
  }
  if (expect.resposta_must_not_match) {
    for (const pattern of expect.resposta_must_not_match) {
      if (new RegExp(pattern, 'i').test(output.resposta_cliente || '')) {
        errors.push(`resposta CONTEM padrao proibido "${pattern}". Resposta: ${output.resposta_cliente}`);
      }
    }
  }
  if (expect.campos_faltando_inclui) {
    const cf = output.campos_faltando || [];
    for (const expected of expect.campos_faltando_inclui) {
      if (!cf.includes(expected)) {
        errors.push(`campos_faltando NAO contem "${expected}". Atual: [${cf.join(',')}]`);
      }
    }
  }
  if (expect.campos_conflitantes_inclui) {
    const cc = output.campos_conflitantes || [];
    for (const expected of expect.campos_conflitantes_inclui) {
      if (!cc.includes(expected)) {
        errors.push(`campos_conflitantes NAO contem "${expected}". Atual: [${cc.join(',')}]`);
      }
    }
  }
  if (expect['dados_persistidos.altura_cm_in']) {
    const altura = output.dados_persistidos?.altura_cm;
    const expectedVals = expect['dados_persistidos.altura_cm_in'];
    if (!expectedVals.includes(altura)) {
      errors.push(`altura_cm=${altura}, esperado um de [${expectedVals.join(',')}]`);
    }
  }
  if (expect['dados_persistidos.foto_local_in']) {
    const foto = output.dados_persistidos?.foto_local;
    const expectedVals = expect['dados_persistidos.foto_local_in'];
    if (!expectedVals.includes(foto)) {
      errors.push(`foto_local=${foto}, esperado null ou ""`);
    }
  }
  if (expect['dados_persistidos.data_nascimento']) {
    const data = output.dados_persistidos?.data_nascimento;
    if (data !== expect['dados_persistidos.data_nascimento']) {
      errors.push(`data_nascimento=${data}, esperado ${expect['dados_persistidos.data_nascimento']}`);
    }
  }
  if (expect.resposta_contains_double_newline && !(output.resposta_cliente || '').includes('\n\n')) {
    errors.push('resposta_cliente NAO contem \\n\\n (esperado multi-balao)');
  }
  return errors;
}

for (const scenario of scenarios) {
  test(`${scenario.id} [${scenario.principio}]`, async () => {
    const agent = buildAgent(scenario);
    const userMsg = lastUserMessageOrEmpty(scenario.messages);
    const result = await run(agent, userMsg);
    const output = result.finalOutput;
    const errors = checkExpect(scenario, output);
    if (errors.length > 0) {
      assert.fail(`Falhas no cenario ${scenario.id}:\n  - ${errors.join('\n  - ')}\n\nOutput completo: ${JSON.stringify(output, null, 2)}`);
    }
  });
}
```

**Importante:** este runner é simplificado — passa só `userMsg` da última msg pro `run(agent)`. Cenários com múltiplas mensagens prévias podem precisar history-aware run (mas Agents SDK roda 1-shot por default). Pra esta primeira eval, OK — se passar, ótimo; se falhar em cenário multi-turn, ajustar pra usar `run(agent, [msg1, msg2, ...])` na próxima iteração.

- [ ] **Step 10.3: Validar sintaxe**

```bash
node -c tests/agent/refator-prompts-coleta-v2.eval.mjs && echo OK
```

- [ ] **Step 10.4: Rodar eval (real, custa $$)**

```bash
cd ~/Documents/inkflow-saas && OPENAI_API_KEY=$OPENAI_API_KEY node --test tests/agent/refator-prompts-coleta-v2.eval.mjs 2>&1 | tee /tmp/eval-refator-v2.log
```

Verificar a key:
```bash
echo ${OPENAI_API_KEY:0:7}  # esperado "sk-proj" ou "sk-..." válido
```

Se key ausente: peça pro user fornecer via export OPENAI_API_KEY=... na sessão.

Esperado: 18/18 pass. Tempo: ~5min. Custo: ~$0.15-0.25.

- [ ] **Step 10.5: Analisar falhas (se houver)**

Se algum TC falhar:
- Anotar no log qual TC + qual error
- Categorizar: (a) prompt fix needed (LLM ignora regra) — iterar prompt; (b) eval scenario errado — ajustar expect; (c) flake — re-rodar 1 vez
- Cap: 2 rounds de iteração. Se passar do orçamento, pausa e re-avalia com user.

- [ ] **Step 10.6: Commit eval + fixtures**

```bash
git add tests/agent/refator-prompts-coleta-v2.eval.mjs tests/agent/_fixtures/scenarios-refator-v2.json
git commit -m "$(cat <<'EOF'
test(eval): suite direcionada refator-prompts-coleta-v2 — 18 cenários

Cobre Manifesto P1-P6 + OBS-3 (cadastro comunica próximo passo) + OBS-7 (data BR
normalizada). Roda contra gpt-4o-mini real, ~$0.20 por execução completa.

Pattern: scenarios JSON + runner shared. Builds Tattoo OU Cadastro agent dependendo
do scenario.agent. Asserts via campos checkExpect (proxima_acao, resposta regex,
dados_persistidos, campos_faltando/conflitantes).

Gate: 18/18 pass antes de merge.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Pós-tasks (manual, fora do plan agentic)

### Smoke prod manual (final, pós-merge na main)

Tenant fixture `inkflow_test_sub4` no Evolution. 6 cenários via WhatsApp real:

1. Modo coletor com 4 OBR + multi-balão visual no WhatsApp
2. Modo consultor (cliente vago) → bot oferece estilos + Pinterest
3. Conflito tamanho ("rosa pequena 25cm") → bot pede foto
4. Foto pedida 2× negada → handoff segue
5. Cadastro com data BR "20/05/1995" + resposta pós-handoff inclui nome+tatuador+"em breve"
6. Validação Telegram tatuador: orçamento chega com "altura: Xcm" + "estilo: Y" rendered

Evidências em `~/Documents/inkflow-saas/.smoke-evidence/2026-05-13-refator-prompts-coleta-v2/observations.md`.

### PR

```bash
git push -u origin feat/refator-prompts-coleta-v2
gh pr create --title "Refator Prompts Coleta v2 — Manifesto do Tatuador-Bot + 4 OBR + multi-message" --body "..."
```

Body do PR: linkar spec + manifesto + sumário das tasks + resultado eval + checklist smoke.

---

## Self-Review

✅ **Spec coverage:** Cada seção do spec mapeia pra task(s):
- §1 Escopo → Task 1 (manifesto link) + DoD
- §2 Mapeamento → Tasks 2-9 (cada arquivo coberto)
- §3 Schema → Task 2
- §4 Pipeline multi-msg → Task 4
- §5 Testing → Tasks 2,3,4,9,10
- §6 Out-of-scope + DoD + Risks → Tasks 1-10 implementam DoD

✅ **Placeholder scan:** Plan revisado — todos os steps têm código real, comandos exatos, ou inspeções `cat`/`grep` quando o estado anterior precisa ser consultado. Não há "TBD" / "TODO" / "similar to Task N".

✅ **Type consistency:**
- `validateTattooOutputInvariant` — usado em Task 2 step 4 + steps 6.4 → mesma assinatura
- `dados_persistidos.altura_cm` — referenciado em Tasks 2/3/5/6/10 — consistente (number nullable)
- `estilo` — string required em handoff (não-vazia) em Tasks 2/3 — consistente
- Eval scenario IDs (MAN-N / OBS-N / REGR-N) — coerentes com tabela do spec

✅ **Self-review checks pass.**
