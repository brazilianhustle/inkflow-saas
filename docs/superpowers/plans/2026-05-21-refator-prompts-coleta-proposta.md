# Refator Prompts Coleta + Proposta — 4 bugs do smoke do Pix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os 4 bugs de comportamento do bot (2 na coleta/TattooAgent, 2 na proposta/PropostaAgent) achados no smoke do Pix, cada um com cenário de eval que falha antes e passa depois, fechando com smoke E2E real.

**Architecture:** Prompt + 2 travas leves (abordagem B do spec). Os 4 bugs são corrigidos no prompt; os 2 mais teimosos (Bug 1 e Bug 2) ganham uma trava barata na causa-raiz, **sem refatorar a máquina de estados nem o schema strict**. A trava do Bug 1 (handoff só após foto pedida ≥1x) vive em `route.js` + `whatsapp-pipeline.js`; a do Bug 2 ("valor já apresentado") vive em `proposta.js` + `contexto.js`.

**Tech Stack:** CF Workers (Pages Functions), OpenAI Responses API (gpt-4o-mini, schema strict), Zod, Supabase (PostgREST), Node.js built-in test runner (`node --test`), snapshots de prompt byte-a-byte.

---

## ⚠️ Riscos e decisões cravadas (ler antes de começar)

1. **SEM migration. O contador `tentativas_foto_local` vai em `dados_coletados`, NÃO em `estado_extra`.**
   O spec dizia "decidir entre `dados_coletados` ou `estado_extra` no /plan". **Decisão: `dados_coletados`** — porque `estado_extra` **não existe como coluna** na tabela `conversas` (confirmado em `tests/_lib/whatsapp-pipeline.test.mjs:117` — pedir essa coluna dava PostgREST 400). Logo:
   - Os reads atuais que apontam pra `conversa.estado_extra?.tentativas_foto_local` (`contexto.js:46`, `whatsapp-pipeline.js:233`) sempre veem `undefined` — é a segunda causa do contador estar dormente. Vamos **repointar** pra `dados_coletados`.
   - `dados_coletados` já é PATCHeado todo turno (Etapa 5 do pipeline), então o write é barato e não exige schema novo.

2. **Regressão conhecida:** o gate do Bug 1 (handoff→pergunta quando foto nunca pedida) quebra `tests/integration/agent-tattoo-handoff.test.mjs` (teste 1 faz handoff com `dados_coletados:{}` + `foto_local:null`). A Task 1 **atualiza esse teste** (adiciona `tentativas_foto_local: 1` ao conversa fixture). Sem isso, `npm test` fica vermelho.

3. **Evals chamam gpt-4o-mini real e são probabilísticos.** Rodam fora do `npm test` (precisam `OPENAI_API_KEY` em `.dev.vars`). "Falha antes / passa depois" pode exigir 1-2 reruns; não são determinísticos. Não bloqueiam CI.

4. **Snapshots de prompt são byte-a-byte.** Toda edição em `decisao.js`/`exemplos.js`/`fluxo.js`/`contexto.js` (tattoo e proposta) quebra `tests/prompts/snapshot.test.mjs`. Cada task que edita prompt termina rodando `scripts/update-prompt-snapshots.sh` e re-verde.

5. **Sem breaking change de schema.** As travas são heurísticas em `route.js`/`pipeline`/`proposta.js`. O `TattooOutputSchema`, o `proposta-schema.js` e os contratos cross-agent (`tattoo-handoff.js`, `proposta-actions.js`) ficam intactos.

6. **`OPENAI_API_KEY` pra evals:** `OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2)`.

---

## File Structure

**Edição de prompt (mudam snapshot):**
- `functions/_lib/prompts/coleta/tattoo/decisao.js` — Bug 1 (§4.2/§4.4 foto 1x), Bug 3 (R10 altura×tamanho, R11 multi-campo, R12 foto-tema)
- `functions/_lib/prompts/coleta/tattoo/exemplos.js` — Bug 3 (Exemplo 10 multi-campo)
- `functions/_lib/prompts/coleta/tattoo/contexto.js` — Bug 1 (repoint estado_extra→dados_coletados + sinal "AINDA NAO PEDIDA")
- `functions/_lib/prompts/coleta/proposta/decisao.js` — Bug 2 (§4.1 gatilhos + R10), Bug 4 (R2)
- `functions/_lib/prompts/coleta/proposta/fluxo.js` — Bug 2 (§3.1 "valor já apresentado")
- `functions/_lib/prompts/coleta/proposta/exemplos.js` — Bug 2 (Exemplo 2 reescrito + Exemplo 11), Bug 4 (Exemplo 12)
- `functions/_lib/prompts/coleta/proposta/contexto.js` — Bug 2 (injeta "Valor já apresentado: sim/não")

**Travas estruturais (não mudam snapshot):**
- `functions/api/agent/route.js` — Bug 1 gate (handoff→pergunta) + retorna `pediu_foto_local`
- `functions/_lib/whatsapp-pipeline.js` — Bug 1 write (incrementa contador em `dados_coletados`)
- `functions/api/agent/agents/proposta.js` — Bug 2 (deriva `valor_apresentado` do histórico, injeta no ctx)

**Testes:**
- `tests/agent/_fixtures/scenarios.json` — TC-11 (Bug 1), TC-12 (Bug 3)
- `tests/agent/_fixtures/scenarios-proposta.json` — TC-P12 (Bug 2), TC-P13 (Bug 4)
- `tests/agent/tattoo-agent.eval.mjs` — novo assert `dados_persistidos_valores`
- `tests/agent/proposta-agent.eval.mjs` — novo assert `resposta_cliente_not_matches`
- `tests/agent/route-runagent.test.mjs` — testes do gate Bug 1
- `tests/_lib/whatsapp-pipeline.test.mjs` — teste do write do contador
- `tests/agent/run-proposta-agent.test.mjs` — teste do sinal `valor_apresentado`
- `tests/integration/agent-tattoo-handoff.test.mjs` — fix do conversa fixture (regressão do gate)
- `tests/prompts/snapshots/coleta-tattoo.txt`, `coleta-proposta.txt` — regen

---

## Task 1: Bug 1 — trava estrutural (contador em `dados_coletados` + gate de handoff)

**Por quê primeiro:** o eval do Bug 1 (Task 2) depende do sinal "AINDA NAO PEDIDA" injetado no contexto, que é parte desta task. Folha-dependência: estrutura antes do prompt.

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/contexto.js:45-49`
- Modify: `functions/api/agent/route.js` (const nova ~linha 36; hoist ~linha 134; gate ~linha 156; return ~linha 313)
- Modify: `functions/_lib/whatsapp-pipeline.js:210-223` (write) e `:233` (cleanup read morto)
- Test: `tests/agent/route-runagent.test.mjs`, `tests/_lib/whatsapp-pipeline.test.mjs`, `tests/integration/agent-tattoo-handoff.test.mjs`

- [ ] **Step 1: Escrever os testes do gate em `route-runagent.test.mjs`**

Adicionar ao fim do arquivo (`tests/agent/route-runagent.test.mjs`). Reusa o pattern `fakeOpenAI`/`fakeOpenAI(cap)` já presente, mas com saída de handoff:

```javascript
// ─── Bug 1: gate handoff só após foto pedida >=1x ──────────────────────
const HANDOFF_OUT = {
  proxima_acao: 'handoff',
  resposta_cliente: 'Show, anotei tudo!',
  dados_persistidos: {
    descricao_curta: 'rosa', local_corpo: 'antebraco', altura_cm: 170,
    estilo: 'fineline', tamanho_cm: null, cor_preferencia: null, foto_local: null,
  },
  dados_completos: true,
  campos_faltando: [],
  campos_conflitantes: [],
  payload_portfolio: null,
  analise_imagens: null,
  cobertura_suspeita: null,
};

function fakeHandoff() {
  return {
    responses: {
      parse: async () => ({ status: 'completed', id: 'r', output_parsed: { output: HANDOFF_OUT } }),
    },
  };
}

test('Bug1 gate: handoff sem foto pedida (contador 0, sem foto) → força pergunta + pediu_foto_local', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'isso, pode ser',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: fakeHandoff(),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'pergunta', 'gate deve rebaixar handoff→pergunta');
  assert.equal(r.estado_novo, 'tattoo', 'estado permanece tattoo (sem handoff)');
  assert.equal(r.pediu_foto_local, true);
  assert.match(r.resposta_cliente, /foto/i);
});

test('Bug1 gate: handoff com contador=1 → handoff passa', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'tattoo',
    dados_coletados: { tentativas_foto_local: 1 }, dados_cadastro: {} };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'isso',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: fakeHandoff(),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'handoff');
  assert.equal(r.estado_novo, 'cadastro');
  assert.ok(!r.pediu_foto_local);
});

test('Bug1 gate: handoff com foto_local presente → handoff passa mesmo sem contador', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} };
  const comFoto = {
    responses: { parse: async () => ({ status: 'completed', id: 'r',
      output_parsed: { output: { ...HANDOFF_OUT, dados_persistidos: { ...HANDOFF_OUT.dados_persistidos, foto_local: 'msg-123' } } } }) },
  };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'mandei a foto',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: comFoto,
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'handoff');
});
```

- [ ] **Step 2: Rodar os testes do gate — esperado FALHAR**

Run: `node --test --test-name-pattern='Bug1 gate' tests/agent/route-runagent.test.mjs`
Expected: FAIL (gate ainda não existe — handoff passa direto, `r.pediu_foto_local` é `undefined`).

- [ ] **Step 3: Implementar o gate em `route.js`**

3a. Adicionar a const da copy depois de `PROPOSTA_SUBSTATES` (após linha 36):

```javascript
// Bug 1: copy canônica do pedido de foto do local (espelha §4.4 do prompt tattoo).
// Usada como backstop quando o LLM tenta handoff sem nunca ter pedido a foto.
const PEDIDO_FOTO_LOCAL = 'Fechou! Consegue mandar também uma foto do local? É importante pro tatuador ter noção do espaço e passar o valor certinho.';
```

3b. Hoist do flag — depois de `let invariantCheck = { valid: true };` (linha 134):

```javascript
  let pediuFotoLocal = false;
```

3c. Inserir o gate entre a linha 155 (`}` que fecha o catch do `runTattooAgent`) e a linha 156 (comentário "Valida payload do handoff"):

```javascript
    // ─── Bug 1: trava leve foto do local pedida >=1x antes do handoff ───
    // Contador vive em dados_coletados.tentativas_foto_local (estado_extra
    // NAO existe na tabela conversas). Se o LLM tentar handoff sem nunca ter
    // pedido a foto e sem foto presente, forca um turno pergunta pedindo a
    // foto (a foto continua OPCIONAL — basta ter sido pedida 1x).
    const dadosApos = { ...(conversa?.dados_coletados || {}), ...(out.dados_persistidos || {}) };
    const tentativasFoto = conversa?.dados_coletados?.tentativas_foto_local || 0;
    const temFotoLocal = !!dadosApos.foto_local;
    const obrCompletos = ['descricao_curta', 'local_corpo', 'altura_cm', 'estilo']
      .every(k => dadosApos[k] != null && dadosApos[k] !== '');
    if (out.proxima_acao === 'handoff' && tentativasFoto === 0 && !temFotoLocal) {
      out = {
        ...forcePergunta(out, PEDIDO_FOTO_LOCAL),
        dados_completos: false,
        campos_faltando: ['foto_local'],
      };
      pediuFotoLocal = true;
    } else if (out.proxima_acao === 'pergunta' && obrCompletos && tentativasFoto === 0
               && !temFotoLocal && (out.campos_conflitantes?.length ?? 0) === 0) {
      // LLM ja pediu a foto organicamente neste turno (4 OBR completos, sem conflito).
      pediuFotoLocal = true;
    }
```

3d. Adicionar `pediu_foto_local` ao objeto de retorno (dentro do `return { ok: true, ... }`, ~linha 325, junto de `cobertura_suspeita`):

```javascript
    cobertura_suspeita: finalOut.cobertura_suspeita ?? null,
    pediu_foto_local: estado_atual === 'tattoo' ? pediuFotoLocal : undefined,
```

- [ ] **Step 4: Rodar os testes do gate — esperado PASSAR**

Run: `node --test --test-name-pattern='Bug1 gate' tests/agent/route-runagent.test.mjs`
Expected: PASS (3 testes verdes).

- [ ] **Step 5: Corrigir a regressão em `agent-tattoo-handoff.test.mjs`**

O teste 1 (`runAgent estado=tattoo handoff valido`) faz handoff com `FAKE_CONVERSA.dados_coletados:{}` + `foto_local:null` → o gate agora rebaixaria pra pergunta. Atualizar o conversa fixture (linhas 21-25) pra refletir que a foto já foi pedida:

```javascript
const FAKE_CONVERSA = {
  id: 'c1', telefone: '+5511999999999',
  estado_agente: 'coletando_tattoo',
  dados_coletados: { tentativas_foto_local: 1 }, dados_cadastro: {},
};
```

Run: `node --test tests/integration/agent-tattoo-handoff.test.mjs`
Expected: PASS (3 testes — handoff válido continua handoff porque contador=1).

- [ ] **Step 6: Escrever o teste do write do contador em `whatsapp-pipeline.test.mjs`**

Adicionar ao fim (`tests/_lib/whatsapp-pipeline.test.mjs`), usando os helpers `batchSupaFetch`/`mockDeps`/`rowsFor`/`baseBatch` já presentes:

```javascript
test('Bug1: pediu_foto_local incrementa dados_coletados.tentativas_foto_local', async () => {
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  let patchBody = null;
  const deps = mockDeps({
    runAgent: async () => ({
      ok: true, resposta_cliente: 'manda a foto do local?', estado_novo: 'tattoo',
      dados_persistidos: { descricao_curta: 'rosa', local_corpo: 'perna', altura_cm: 170, estilo: 'fineline' },
      proxima_acao: 'pergunta', agent_usado: 'tattoo', pediu_foto_local: true,
    }),
    supaFetch: batchSupaFetch({
      conversa,
      rows: rowsFor([{ id: 201, content: 'rosa fineline na perna, sou 1.70' }]),
      onPatch: (path, body) => { if (body.dados_coletados) patchBody = body; },
    }),
  });
  await processBatch({}, baseBatch({ msgRowIds: [201] }), deps);
  assert.ok(patchBody, 'deve ter PATCH com dados_coletados');
  assert.equal(patchBody.dados_coletados.tentativas_foto_local, 1);
});

test('Bug1: sem pediu_foto_local NAO escreve contador', async () => {
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {} };
  let patchBody = null;
  const deps = mockDeps({
    runAgent: async () => ({
      ok: true, resposta_cliente: 'qual o local?', estado_novo: 'tattoo',
      dados_persistidos: { descricao_curta: 'rosa' },
      proxima_acao: 'pergunta', agent_usado: 'tattoo',
    }),
    supaFetch: batchSupaFetch({
      conversa, rows: rowsFor([{ id: 202, content: 'quero uma rosa' }]),
      onPatch: (path, body) => { if (body.dados_coletados) patchBody = body; },
    }),
  });
  await processBatch({}, baseBatch({ msgRowIds: [202] }), deps);
  assert.ok(patchBody);
  assert.equal(patchBody.dados_coletados.tentativas_foto_local, undefined);
});
```

- [ ] **Step 7: Rodar os testes do pipeline — esperado FALHAR**

Run: `node --test --test-name-pattern='Bug1' tests/_lib/whatsapp-pipeline.test.mjs`
Expected: FAIL (write ainda não existe — `tentativas_foto_local` fica `undefined`).

- [ ] **Step 8: Implementar o write do contador em `whatsapp-pipeline.js`**

8a. Na Etapa 5 (entre linha 213 que monta `novoDadosColetados` e a linha 214 `novoDadosCadastro`), adicionar o incremento:

```javascript
    const novoDadosColetados = isCadastro
      ? (conversa.dados_coletados || {})
      : { ...(conversa.dados_coletados || {}), ...(agentOut.dados_persistidos || {}) };
    // Bug 1: incrementa contador de foto pedida. Persiste em dados_coletados
    // (estado_extra nao existe na tabela). route.js sinaliza via pediu_foto_local.
    if (agentOut.pediu_foto_local && !isCadastro) {
      novoDadosColetados.tentativas_foto_local = (conversa.dados_coletados?.tentativas_foto_local || 0) + 1;
    }
```

8b. Cleanup do read morto na linha 233 — remover o fallback pra `estado_extra` (coluna inexistente):

```javascript
        let tentativas = dadosPreMerge.tentativas_foto_local || 0;
```

- [ ] **Step 9: Rodar os testes do pipeline — esperado PASSAR**

Run: `node --test --test-name-pattern='Bug1' tests/_lib/whatsapp-pipeline.test.mjs`
Expected: PASS (2 testes verdes).

- [ ] **Step 10: Repointar o read do contexto.js (estado_extra→dados_coletados) + sinal "AINDA NAO PEDIDA"**

Substituir o bloco `tests/.../contexto.js` linhas 45-49 (atual):

```javascript
  // Status foto pedida ate 2x (refator manifesto P3)
  const tentativasFoto = conversa?.estado_extra?.tentativas_foto_local || 0;
  if (tentativasFoto > 0 && !dados.foto_local) {
    dadosLinhas.push(`- foto_local: pedida ${tentativasFoto}x sem resposta`);
  }
```

por (arquivo real: `functions/_lib/prompts/coleta/tattoo/contexto.js`):

```javascript
  // Status foto do local (refator manifesto P3 + Bug 1). Contador vive em
  // dados_coletados.tentativas_foto_local (estado_extra nao existe na tabela).
  // Sinal "AINDA NAO PEDIDA" so aparece quando ja ha algum OBR coletado, pra
  // nao poluir o turno 1 — o bot so pede a foto perto do handoff (§4.4).
  const tentativasFoto = dados.tentativas_foto_local || 0;
  if (!dados.foto_local && (dadosLinhas.length > 0 || tentativasFoto > 0)) {
    dadosLinhas.push(tentativasFoto > 0
      ? `- foto_local: pedida ${tentativasFoto}x sem resposta`
      : `- foto_local: AINDA NAO PEDIDA — peca 1x antes do handoff (§4.4)`);
  }
```

- [ ] **Step 11: Regenerar snapshots e rodar suíte completa**

Run: `bash scripts/update-prompt-snapshots.sh`
(O fixture `CONVERSA_COLETA_TATTOO` tem `dados_coletados:{}` → o bloco foto não dispara → `coleta-tattoo.txt` provavelmente não muda; rodar mesmo assim por segurança.)

Run: `npm test`
Expected: PASS (todos verdes, incluindo os novos testes do gate, do write, o handoff fixture corrigido e os snapshots).

- [ ] **Step 12: Commit**

```bash
git add functions/api/agent/route.js functions/_lib/whatsapp-pipeline.js \
  functions/_lib/prompts/coleta/tattoo/contexto.js \
  tests/agent/route-runagent.test.mjs tests/_lib/whatsapp-pipeline.test.mjs \
  tests/integration/agent-tattoo-handoff.test.mjs tests/prompts/snapshots/
git commit -m "fix(coleta): Bug 1 — trava handoff só após foto do local pedida 1x (contador em dados_coletados)"
```

---

## Task 2: Bug 1 — prompt (padroniza foto 1x) + eval

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/decisao.js:54` (§4.2) e `:122-133` (§4.4)
- Modify: `tests/agent/_fixtures/scenarios.json` (novo TC-11)
- Modify: `tests/prompts/snapshots/coleta-tattoo.txt` (regen)

- [ ] **Step 1: Adicionar o cenário de eval TC-11 em `scenarios.json`**

Adicionar como novo objeto no array `scenarios` (depois do último cenário existente):

```json
{
  "id": "TC-11",
  "descricao": "Bug 1: 4 OBR completos, foto nunca pedida -> pede foto (pergunta), NAO handoff",
  "hipoteses": ["Bug1"],
  "input": {
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "telefone": "+5511900000011",
    "mensagens": [
      { "role": "user", "content": "isso, pode ser" }
    ],
    "estado_atual": "tattoo",
    "dados_acumulados": {
      "descricao_curta": "rosa",
      "local_corpo": "antebraco direito",
      "altura_cm": 170,
      "estilo": "fineline"
    },
    "historico": [
      { "role": "assistant", "content": "Top! Rosa fineline no antebraco direito, 170cm. Fechou?" }
    ]
  },
  "expected": {
    "proxima_acao": "pergunta",
    "dados_completos": false
  }
}
```

- [ ] **Step 2: Rodar o eval do TC-11 — esperado FALHAR (antes do fix)**

Run: `OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) node --test --test-name-pattern='TC-11' tests/agent/tattoo-agent.eval.mjs`
Expected: FAIL — com §4.2 dizendo "2x" e sem reforço, o LLM tende a emitir `handoff` (pula a foto). Se passar de primeira (eval probabilístico), rodar 2x pra confirmar a tendência antes de seguir.

- [ ] **Step 3: Padronizar "1x" no §4.2 do `decisao.js`**

Em `functions/_lib/prompts/coleta/tattoo/decisao.js`, linha 54, trocar:

```
- \`foto_local\`: foto do local do corpo. **Pedida ate 2x** (ver §4.4).
```

por:

```
- \`foto_local\`: foto do local do corpo. **Pedida 1x** (ver §4.4).
```

- [ ] **Step 4: Reforçar o §4.4 como passo obrigatório pré-handoff**

No `decisao.js`, logo após a linha 124 (`**ANTES de emitir \`proxima_acao='handoff'\`:**`), inserir uma linha de invariante:

```
**Este passo e OBRIGATORIO antes de QUALQUER handoff.** O servidor bloqueia o handoff e forca um turno \`pergunta\` se a foto do local nunca foi pedida (contador=0) e nao ha foto. Veja no §2 CONTEXTO o status "foto_local: AINDA NAO PEDIDA".
```

- [ ] **Step 5: Rodar o eval do TC-11 — esperado PASSAR (depois do fix)**

Run: `OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) node --test --test-name-pattern='TC-11' tests/agent/tattoo-agent.eval.mjs`
Expected: PASS (`proxima_acao=pergunta`, `dados_completos=false`).

- [ ] **Step 6: Regenerar snapshot + suíte completa**

Run: `bash scripts/update-prompt-snapshots.sh` (decisao.js mudou → `coleta-tattoo.txt` muda)
Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add functions/_lib/prompts/coleta/tattoo/decisao.js tests/agent/_fixtures/scenarios.json tests/prompts/snapshots/coleta-tattoo.txt
git commit -m "fix(coleta): Bug 1 — prompt padroniza foto 1x e marca §4.4 obrigatório pré-handoff (eval TC-11)"
```

---

## Task 3: Bug 3 — altura×tamanho + multi-campo + foto-tema (prompt) + eval

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/decisao.js` (§4.3, adiciona R10/R11/R12 após R9 na linha 118)
- Modify: `functions/_lib/prompts/coleta/tattoo/exemplos.js` (Exemplo 10, após linha 97)
- Modify: `tests/agent/tattoo-agent.eval.mjs` (novo assert `dados_persistidos_valores`)
- Modify: `tests/agent/_fixtures/scenarios.json` (novo TC-12)
- Modify: `tests/prompts/snapshots/coleta-tattoo.txt` (regen)

- [ ] **Step 1: Estender o runner do eval com assert de valores exatos**

O runner atual só checa "campo preenchido" (não o valor), então não dá pra validar altura=181 vs tamanho=5. Adicionar em `tests/agent/tattoo-agent.eval.mjs`, após o bloco `dados_persistidos_inclui` (linha 89, antes do `});`):

```javascript
    if (scenario.expected.dados_persistidos_valores) {
      for (const [k, v] of Object.entries(scenario.expected.dados_persistidos_valores)) {
        assert.equal((out.dados_persistidos || {})[k], v,
          `${scenario.id}: ${k} esperado=${v} got=${JSON.stringify((out.dados_persistidos || {})[k])}`);
      }
    }
```

- [ ] **Step 2: Adicionar o cenário TC-12 em `scenarios.json`**

```json
{
  "id": "TC-12",
  "descricao": "Bug 3: multi-campo numa msg + altura(1.81) vs tamanho(5cm) — persiste tudo, classifica certo",
  "hipoteses": ["Bug3"],
  "input": {
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "telefone": "+5511900000012",
    "mensagens": [
      { "role": "user", "content": "quero uma rosa fineline na perna, 5cm, sou 1.81" }
    ],
    "estado_atual": "tattoo",
    "dados_acumulados": {},
    "historico": []
  },
  "expected": {
    "dados_persistidos_inclui": ["descricao_curta", "estilo", "local_corpo", "tamanho_cm", "altura_cm"],
    "dados_persistidos_valores": { "altura_cm": 181, "tamanho_cm": 5 }
  }
}
```

- [ ] **Step 3: Rodar o eval do TC-12 — esperado FALHAR (antes do fix)**

Run: `OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) node --test --test-name-pattern='TC-12' tests/agent/tattoo-agent.eval.mjs`
Expected: FAIL — sem a regra de magnitude, o LLM tende a confundir 1.81 (re-perguntar altura) ou classificar errado.

- [ ] **Step 4: Adicionar R10/R11/R12 ao §4.3 do `decisao.js`**

Em `functions/_lib/prompts/coleta/tattoo/decisao.js`, após a linha 118 (fim da R9, antes do `## §4.4`), inserir:

```
**R10. ALTURA × TAMANHO (Manifesto P1/P3 — desambiguacao por magnitude).** Numeros que o cliente manda podem ser ALTURA da pessoa (\`altura_cm\`) ou TAMANHO da tattoo (\`tamanho_cm\`). Classifique:
- Normalize "1.81", "1,81", "1.81m", "1,81 m" -> 181 (\`altura_cm\`). "181" -> 181.
- numero **≤ 50** (com ou sem "cm") -> SEMPRE \`tamanho_cm\` (tamanho da tattoo, opcional). NUNCA e altura.
- numero em **metros** (1,40–2,49) OU inteiro **≥ 140** -> \`altura_cm\` (altura da pessoa).
- **zona morta rara** (51–139): caso raríssimo -> na duvida, PERGUNTE se e altura ou tamanho.
- Se voce **acabou de perguntar a altura**, o numero da resposta e altura.
Exemplo: "5cm, sou 1.81" -> \`tamanho_cm=5\`, \`altura_cm=181\`.

**R11. EXTRACAO MULTI-CAMPO.** Se o cliente fornece VARIOS campos numa unica mensagem ("rosa fineline na perna, 5cm, sou 1.81"), persista TODOS de uma vez em \`dados_persistidos\` no MESMO turno (descricao_curta, local_corpo, estilo, altura_cm, tamanho_cm). NUNCA re-pergunte um campo que o cliente ja deu — so pergunte o que realmente falta.

**R12. FOTO COMO TEMA.** Se o cliente manda uma foto de REFERENCIA (a arte que quer tatuar) e NAO descreveu o tema em texto, use a descricao visual da referencia como \`descricao_curta\` (ex: "rosa fineline" a partir da imagem). NAO fique pedindo "tema/ideia" quando a referencia ja mostra o desenho.
```

- [ ] **Step 5: Adicionar o Exemplo 10 ao `exemplos.js`**

Em `functions/_lib/prompts/coleta/tattoo/exemplos.js`, após a linha 97 (fim do Exemplo 9) e antes do `` ` `` de fechamento (linha 98), inserir:

```
## Exemplo 10 — R10/R11: multi-campo numa msg + altura vs tamanho
\`\`\`
CLIENTE: quero uma rosa fineline na perna, 5cm, sou 1.81
AGENTE: Show! Rosa fineline na perna, 5cm. Consegue mandar uma foto do local?
\`\`\`
(persiste descricao_curta='rosa', estilo='fineline', local_corpo='perna', tamanho_cm=5, altura_cm=181 — TODOS de uma vez. 5cm->tamanho, 1.81->altura(181). 4 OBR completos -> pede foto 1x antes do handoff, NAO re-pergunta nada)
```

- [ ] **Step 6: Rodar o eval do TC-12 — esperado PASSAR (depois do fix)**

Run: `OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) node --test --test-name-pattern='TC-12' tests/agent/tattoo-agent.eval.mjs`
Expected: PASS (`altura_cm=181`, `tamanho_cm=5`, todos os 4 OBR + tamanho preenchidos).

- [ ] **Step 7: Regenerar snapshot + suíte completa**

Run: `bash scripts/update-prompt-snapshots.sh`
Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add functions/_lib/prompts/coleta/tattoo/decisao.js functions/_lib/prompts/coleta/tattoo/exemplos.js \
  tests/agent/tattoo-agent.eval.mjs tests/agent/_fixtures/scenarios.json tests/prompts/snapshots/coleta-tattoo.txt
git commit -m "fix(coleta): Bug 3 — altura×tamanho por magnitude + multi-campo + foto-tema (eval TC-12)"
```

---

## Task 4: Bug 2 — trava estrutural ("valor já apresentado" derivado do histórico)

**Por quê antes da Task 5:** o eval do Bug 2 depende do sinal "Valor já apresentado: sim/não" injetado no contexto, implementado aqui.

**Files:**
- Modify: `functions/api/agent/agents/proposta.js` (helper + injeção no ctx)
- Modify: `functions/_lib/prompts/coleta/proposta/contexto.js` (lê `ctx.valor_apresentado`, renderiza)
- Test: `tests/agent/run-proposta-agent.test.mjs`
- Modify: `tests/prompts/snapshots/coleta-proposta.txt` (regen)

- [ ] **Step 1: Escrever os testes do sinal em `run-proposta-agent.test.mjs`**

Adicionar ao fim, reusando `makeFakeClient` (que captura `params.instructions`) e `FAKE_TENANT`/`FAKE_CONVERSA` do arquivo:

```javascript
test('Bug2: valor no historico -> instructions diz "Valor ja apresentado ao cliente: sim"', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'oferecendo_horario', resposta_cliente: 'show, tenho ter e qui',
    slot_inicio: null, slot_fim: null, valor_pedido_cliente: null, payload_portfolio: null,
  });
  await runPropostaAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA,
    clientContext: { valor_proposto: 750, horarios_livres: [] },
    mensagem: 'bora',
    historico: [{ role: 'assistant', content: 'Show! Pelo trabalho ficou em R$ 750. Bora marcar?' }],
    estado_atual: 'propondo_valor',
    openaiClient: fake,
  });
  assert.match(fake._captured().instructions, /Valor ja apresentado ao cliente: sim/);
});

test('Bug2: historico vazio -> "Valor ja apresentado ao cliente: nao"', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'x',
    slot_inicio: null, slot_fim: null, valor_pedido_cliente: null, payload_portfolio: null,
  });
  await runPropostaAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA,
    clientContext: { valor_proposto: 750, horarios_livres: [] },
    mensagem: 'oi', historico: [],
    estado_atual: 'propondo_valor', openaiClient: fake,
  });
  assert.match(fake._captured().instructions, /Valor ja apresentado ao cliente: nao/);
});

test('Bug2: pos-desconto valor novo nao apresentado -> "nao" (historico so tem valor antigo)', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'oferecendo_horario', resposta_cliente: 'ele topou em 600',
    slot_inicio: null, slot_fim: null, valor_pedido_cliente: null, payload_portfolio: null,
  });
  await runPropostaAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA,
    clientContext: { valor_proposto: 600, decisao_desconto: 'aceito', horarios_livres: [] },
    mensagem: 'e ai, o tatuador topou?',
    historico: [{ role: 'assistant', content: 'Show! Pelo trabalho ficou em R$ 750. Bora marcar?' }],
    estado_atual: 'propondo_valor', openaiClient: fake,
  });
  // valor atual = 600 (novo, pos-desconto); historico so tem 750 -> ainda nao apresentado.
  assert.match(fake._captured().instructions, /Valor ja apresentado ao cliente: nao/);
});
```

- [ ] **Step 2: Rodar os testes — esperado FALHAR**

Run: `node --test --test-name-pattern='Bug2' tests/agent/run-proposta-agent.test.mjs`
Expected: FAIL (a linha "Valor ja apresentado" ainda não existe no prompt).

- [ ] **Step 3: Implementar o helper + injeção em `proposta.js`**

3a. Adicionar o helper após `normalizeHistoryItem` (linha 29) em `functions/api/agent/agents/proposta.js`:

```javascript
// Bug 2: o valor ATUAL ja foi mostrado ao cliente? Deriva do historico —
// procura o numero do valor numa fala do assistant. Self-contained (sem flag
// persistida). Pos-desconto: valor muda (ex: 600); historico so tem o antigo
// (750) -> retorna false -> bot re-apresenta o novo valor.
function valorJaApresentado(historico, valor) {
  if (valor == null) return false;
  const alvo = String(valor);
  return (historico || []).some(item => {
    const norm = normalizeHistoryItem(item);
    return norm.role === 'assistant' && String(norm.content ?? '').includes(alvo);
  });
}
```

3b. Em `runPropostaAgent`, trocar as linhas 51-52:

```javascript
  const ctx = clientContext || {};
  const instructions = generatePromptColetaProposta(tenant, conversa, ctx);
```

por:

```javascript
  const ctx = clientContext || {};
  const valorAtual = ctx.valor_proposto ?? conversa?.valor_proposto;
  const ctxComFlag = { ...ctx, valor_apresentado: valorJaApresentado(historico, valorAtual) };
  const instructions = generatePromptColetaProposta(tenant, conversa, ctxComFlag);
```

- [ ] **Step 4: Renderizar a linha no `contexto.js` da proposta**

Em `functions/_lib/prompts/coleta/proposta/contexto.js`:

4a. Após a linha 13 (`const portfolio_status = ...`), adicionar:

```javascript
  const valor_apresentado = ctx?.valor_apresentado === true ? 'sim' : 'nao';
```

4b. No template (linha 40, após `Decisao desconto previa: ...`), adicionar a linha:

```
Decisao desconto previa: ${decisao_desconto}
Valor ja apresentado ao cliente: ${valor_apresentado}
```

- [ ] **Step 5: Rodar os testes — esperado PASSAR**

Run: `node --test --test-name-pattern='Bug2' tests/agent/run-proposta-agent.test.mjs`
Expected: PASS (3 testes).

- [ ] **Step 6: Regenerar snapshot + suíte completa**

Run: `bash scripts/update-prompt-snapshots.sh` (contexto.js proposta mudou → `coleta-proposta.txt` muda; com fixture sem flag, renderiza "nao")
Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add functions/api/agent/agents/proposta.js functions/_lib/prompts/coleta/proposta/contexto.js \
  tests/agent/run-proposta-agent.test.mjs tests/prompts/snapshots/coleta-proposta.txt
git commit -m "fix(proposta): Bug 2 — sinal 'valor já apresentado' derivado do histórico (reflete valor pós-desconto)"
```

---

## Task 5: Bug 2 — prompt (aceitação ≠ pechincha) + eval

**Files:**
- Modify: `functions/_lib/prompts/coleta/proposta/decisao.js` (§4.1 linhas 9-10 + nova R10 após linha 40)
- Modify: `functions/_lib/prompts/coleta/proposta/fluxo.js` (§3.1, após linha 20)
- Modify: `functions/_lib/prompts/coleta/proposta/exemplos.js` (Exemplo 2 reescrito + Exemplo 11)
- Modify: `tests/agent/proposta-agent.eval.mjs` (novo assert `resposta_cliente_not_matches`)
- Modify: `tests/agent/_fixtures/scenarios-proposta.json` (novo TC-P12)
- Modify: `tests/prompts/snapshots/coleta-proposta.txt` (regen)

- [ ] **Step 1: Adicionar o assert `resposta_cliente_not_matches` ao runner da proposta**

Em `tests/agent/proposta-agent.eval.mjs`, dentro do loop de `sc.assertions` (após o bloco `resposta_cliente_contains_slots`, linha 84, antes do `}` que fecha o `for`):

```javascript
        } else if (a.type === 'resposta_cliente_not_matches') {
          assert.ok(!new RegExp(a.value, 'i').test(out.resposta_cliente || ''),
            `${sc.id}: resposta NAO deveria casar /${a.value}/ — "${out.resposta_cliente}"`);
```

- [ ] **Step 2: Adicionar o cenário TC-P12 em `scenarios-proposta.json`**

Adicionar como novo objeto no array raiz (o arquivo é um array JSON, não `{scenarios:[...]}`):

```json
{
  "id": "TC-P12",
  "descricao": "Bug 2: valor ja apresentado + cliente 'bora' -> oferecendo_horario, NAO re-pergunta valor",
  "estado_atual": "propondo_valor",
  "valor_proposto": 750,
  "decisao_desconto": null,
  "horarios_livres": [
    { "inicio": "2026-05-12T17:00:00Z", "fim": "2026-05-12T20:00:00Z", "legenda": "ter 12/05 14h-17h" },
    { "inicio": "2026-05-14T13:00:00Z", "fim": "2026-05-14T16:00:00Z", "legenda": "qui 14/05 10h-13h" }
  ],
  "historico": [
    { "role": "assistant", "content": "Show! Pelo trabalho ficou em R$ 750. Bora marcar?" }
  ],
  "mensagem": "bora",
  "assertions": [
    { "type": "proxima_acao_equals", "value": "oferecendo_horario" },
    { "type": "resposta_cliente_not_matches", "value": "quanto tu tava pensando" }
  ]
}
```

- [ ] **Step 3: Rodar o eval do TC-P12 — esperado FALHAR (antes do fix)**

Run: `OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) node --test --test-name-pattern='TC-P12' tests/agent/proposta-agent.eval.mjs`
Expected: FAIL — o LLM trata "bora" como pechincha e copia "Quanto tu tava pensando?" (linha 2 da tabela).

- [ ] **Step 4: Desambiguar gatilhos no §4.1 + nova R10 do `decisao.js` (proposta)**

Em `functions/_lib/prompts/coleta/proposta/decisao.js`:

4a. Trocar a linha 9 (linha 1 da tabela) — explicitar que são aceitação:

```
| 1 | propondo_valor | "fechou", "topo", "vamos", "sim", "ok", "bora", "pode ser", "isso" (ACEITACAO) | oferecendo_horario | — | "Show! Tenho {slots da lista}. Qual prefere?" |
```

4b. Trocar a linha 10 (linha 2 da tabela) — restringir ao caso de reclamação:

```
| 2 | propondo_valor | "caro", "salgado", "menos" SEM aceitar e SEM valor | pergunta | — | "Quanto tu tava pensando?" |
```

4c. Adicionar R10 após a R9 (após a linha 40, antes do `## §4.3 Closing`):

```
R10. ACEITACAO ≠ PECHINCHA. "fechou/topo/vamos/sim/ok/bora/pode ser/isso/aceito" = ACEITACAO do valor -> \`oferecendo_horario\`. JAMAIS pergunte "quanto tu tava pensando" quando o cliente ACEITA. "Quanto tu tava pensando?" (linha 2) SO vale quando o cliente RECLAMA do preco ("ta caro", "ta salgado") SEM aceitar e SEM dar valor. Se no contexto "Valor ja apresentado ao cliente: sim", NAO re-apresente o valor nem re-pergunte — interprete a resposta como decisao (aceita/pechincha/adia).
```

- [ ] **Step 5: Reforçar o §3.1 do `fluxo.js` (proposta)**

Em `functions/_lib/prompts/coleta/proposta/fluxo.js`, após a linha 20 (`Apos enviar, AGUARDE resposta do cliente.`), inserir:

```
Se no contexto "Valor ja apresentado ao cliente: sim", NAO re-apresente o valor — o cliente ja viu. Interprete a mensagem dele como decisao: aceitou ("bora/sim/fechou") -> oferecendo_horario; reclamou do preco sem valor -> pergunta; pediu valor X -> pediu_desconto; adiou -> adiou.
```

- [ ] **Step 6: Reescrever o Exemplo 2 + adicionar Exemplo 11 no `exemplos.js` (proposta)**

Em `functions/_lib/prompts/coleta/proposta/exemplos.js`:

6a. Trocar o Exemplo 2 (linhas 11-15):

```
## Exemplo 2 — Caminho B: reclama do preco SEM aceitar (unico caso de "quanto tu tava pensando")
[estado=propondo_valor, valor_proposto=750, valor ja apresentado=sim]
CLIENTE: ta um pouco caro
AGENTE: Quanto tu tava pensando?
// proxima_acao=pergunta — cliente RECLAMOU e NAO aceitou. Se ele dissesse "bora", seria oferecendo_horario.
```

6b. Adicionar Exemplo 11 ao fim do template (antes do `` ` `` de fechamento, linha 64):

```

## Exemplo 11 — Aceitacao apos valor ja apresentado (NAO re-perguntar valor — Bug 2)
[estado=propondo_valor, valor_proposto=750, valor ja apresentado=sim, slots=ter 14h, qui 10h]
CLIENTE: bora
AGENTE: Show! Tenho ter 14h ou qui 10h. Qual prefere?
// proxima_acao=oferecendo_horario — "bora" = aceitacao. JAMAIS "quanto tu tava pensando".
```

- [ ] **Step 7: Rodar o eval do TC-P12 — esperado PASSAR (depois do fix)**

Run: `OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) node --test --test-name-pattern='TC-P12' tests/agent/proposta-agent.eval.mjs`
Expected: PASS (`oferecendo_horario`, resposta sem "quanto tu tava pensando").

- [ ] **Step 8: Regenerar snapshot + suíte completa**

Run: `bash scripts/update-prompt-snapshots.sh`
Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add functions/_lib/prompts/coleta/proposta/decisao.js functions/_lib/prompts/coleta/proposta/fluxo.js \
  functions/_lib/prompts/coleta/proposta/exemplos.js tests/agent/proposta-agent.eval.mjs \
  tests/agent/_fixtures/scenarios-proposta.json tests/prompts/snapshots/coleta-proposta.txt
git commit -m "fix(proposta): Bug 2 — aceitação ('bora') vai pra horário, não re-pergunta valor (eval TC-P12)"
```

---

## Task 6: Bug 4 — não rebaixa orçamento verbalmente (prompt) + eval

**Files:**
- Modify: `functions/_lib/prompts/coleta/proposta/decisao.js` (R2, linha 26)
- Modify: `functions/_lib/prompts/coleta/proposta/exemplos.js` (Exemplo 12)
- Modify: `tests/agent/_fixtures/scenarios-proposta.json` (novo TC-P13)
- Modify: `tests/prompts/snapshots/coleta-proposta.txt` (regen)

(Depende do assert `resposta_cliente_not_matches` adicionado na Task 5, Step 1.)

- [ ] **Step 1: Adicionar o cenário TC-P13 em `scenarios-proposta.json`**

```json
{
  "id": "TC-P13",
  "descricao": "Bug 4: cliente 'faz por R$2' -> pediu_desconto, resposta NAO confirma o valor pechinchado",
  "estado_atual": "propondo_valor",
  "valor_proposto": 750,
  "decisao_desconto": null,
  "horarios_livres": [],
  "historico": [
    { "role": "assistant", "content": "Show! Pelo trabalho ficou em R$ 750. Bora marcar?" }
  ],
  "mensagem": "faz por 2 reais?",
  "assertions": [
    { "type": "proxima_acao_equals", "value": "pediu_desconto" },
    { "type": "payload_includes", "value": { "valor_pedido_cliente": 2 } },
    { "type": "resposta_cliente_not_matches", "value": "(topou|fechou|fica|deixa)\\D{0,8}(2|dois)" }
  ]
}
```

- [ ] **Step 2: Rodar o eval do TC-P13 — esperado FALHAR (antes do fix)**

Run: `OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) node --test --test-name-pattern='TC-P13' tests/agent/proposta-agent.eval.mjs`
Expected: FAIL — o LLM verbaliza "topou em R$2" / "fechou em 2" na `resposta_cliente`.

- [ ] **Step 3: Reforçar a R2 do `decisao.js` (proposta)**

Em `functions/_lib/prompts/coleta/proposta/decisao.js`, trocar a linha 26:

```
R2. PROIBIDO: oferecer desconto sem o tatuador. Cliente pediu menos? Voce SO emite \`pediu_desconto\` — JAMAIS confirma valor menor.
```

por:

```
R2. PROIBIDO oferecer/aceitar desconto sem o tatuador. Cliente pediu menos ("faz por X", "deixa por X", "consegue X")? Voce SO emite \`pediu_desconto\` (payload valor_pedido_cliente=X) e a \`resposta_cliente\` NAO confirma o valor pechinchado. PROIBIDO escrever "topou em X", "fechou em X", "fica em X", "deixa em X" pra qualquer valor diferente de \`valor_proposto\`. So o tatuador decide — voce consulta e responde "Anotado! Vou consultar com o tatuador e te retorno.".
```

- [ ] **Step 4: Adicionar o Exemplo 12 no `exemplos.js` (proposta)**

Em `functions/_lib/prompts/coleta/proposta/exemplos.js`, após o Exemplo 11 (adicionado na Task 5), antes do `` ` `` de fechamento:

```

## Exemplo 12 — R2: pechincha agressiva (NAO verbaliza aceite — Bug 4)
[estado=propondo_valor, valor_proposto=750]
CLIENTE: faz por 2 reais?
AGENTE: Anotado! Vou consultar com o tatuador e te retorno.
// proxima_acao=pediu_desconto, payload valor_pedido_cliente=2. JAMAIS "topou em R$2" / "fechou em 2".
```

- [ ] **Step 5: Rodar o eval do TC-P13 — esperado PASSAR (depois do fix)**

Run: `OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) node --test --test-name-pattern='TC-P13' tests/agent/proposta-agent.eval.mjs`
Expected: PASS (`pediu_desconto`, `valor_pedido_cliente=2`, resposta sem confirmar R$2).

- [ ] **Step 6: Regenerar snapshot + suíte completa**

Run: `bash scripts/update-prompt-snapshots.sh`
Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add functions/_lib/prompts/coleta/proposta/decisao.js functions/_lib/prompts/coleta/proposta/exemplos.js \
  tests/agent/_fixtures/scenarios-proposta.json tests/prompts/snapshots/coleta-proposta.txt
git commit -m "fix(proposta): Bug 4 — R2 reforça que bot nunca verbaliza aceite de valor pechinchado (eval TC-P13)"
```

---

## Task 7: Validação consolidada (suíte completa + todos os evals + snapshots)

**Files:** nenhum (só execução). Commit só se houver drift de snapshot.

- [ ] **Step 1: Suíte completa verde**

Run: `npm test`
Expected: PASS — ~1003 testes existentes + os novos (gate, write, sinal valor, snapshots). Zero falhas.

- [ ] **Step 2: Eval TattooAgent completo (sem regressão)**

Run: `OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) npm run eval:tattoo`
Expected: PASS — TC-01..TC-12, incluindo os novos TC-11 (Bug 1) e TC-12 (Bug 3). Se algum cenário antigo regredir por causa das novas regras R10/R11/R12, investigar (provável: prompt ficou contraditório — ajustar o texto, não o cenário antigo).

- [ ] **Step 3: Eval PropostaAgent completo (sem regressão)**

Run: `OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) npm run eval:proposta`
Expected: PASS — TC-P01..TC-P13, incluindo TC-P12 (Bug 2) e TC-P13 (Bug 4). Atenção especial ao TC-P01 (aceitação já existente) e aos cenários de desconto — confirmar que o sinal "valor já apresentado" não os quebrou.

- [ ] **Step 4: Confirmar snapshots sem drift**

Run: `git status --porcelain tests/prompts/snapshots/`
Expected: vazio (já commitados nas tasks anteriores). Se houver diff, rodar `bash scripts/update-prompt-snapshots.sh`, `npm test`, e:

```bash
git add tests/prompts/snapshots/ && git commit -m "chore(snapshots): regen consolidado pós-refator coleta+proposta"
```

---

## Task 8: Smoke E2E real (DoD final)

**Files:** nenhum código. Validação manual + registro de resultados.

**Pré-requisitos:** tenant de teste com banco limpo (usar `scripts/cleanup-conversa-teste.sh`), deploy da branch no ambiente de teste, WhatsApp do tenant conectado.

- [ ] **Step 1: Zerar a conversa de teste**

Run: `bash scripts/cleanup-conversa-teste.sh` (confirmar o telefone/tenant de teste no script antes).

- [ ] **Step 2: Smoke Bug 1 (foto do local antes do handoff)**

Conversa real: fornecer os 4 OBR (tema, local, altura, estilo) sem mandar foto do local.
Esperado: o bot **pede a foto do local 1x** antes de pedir o cadastro (não pula direto pro handoff). Ao dizer "não tenho", o handoff acontece no turno seguinte.

- [ ] **Step 3: Smoke Bug 3 (multi-campo + altura×tamanho + foto-tema)**

Mandar numa só mensagem: "quero uma rosa fineline na perna, 5cm, sou 1.81" (+ opcional foto de referência sem dar tema em texto).
Esperado: bot capta tema, estilo, local, **tamanho_cm=5**, **altura_cm=181** de uma vez, **não re-pergunta** nenhum desses, e (se veio foto-ref sem tema) usa a descrição da imagem como tema.

- [ ] **Step 4: Smoke Bug 2 (aceitação não re-pergunta valor)**

Chegar na proposta, bot apresenta o valor, responder "bora".
Esperado: bot vai pra oferta de horários, **não** responde "Qual o valor que tu tinha em mente?".

- [ ] **Step 5: Smoke Bug 4 (pechincha não rebaixa verbalmente)**

Na proposta, responder "faz por R$2?".
Esperado: bot responde "Anotado! Vou consultar com o tatuador..." (`pediu_desconto`), **sem** dizer "topou em R$2" / "fechou em 2".

- [ ] **Step 6: Registrar resultados e atualizar memória**

Documentar os 4 resultados (ok/ajuste) no spec ou numa nota. Atualizar a memória `project_bugs_coleta_proposta` marcando os 4 bugs de prompt como resolvidos (Bug 5 batching segue em sessão separada). Sem commit de código.

---

## Self-Review (writing-plans)

**1. Cobertura do spec:**
- Bug 1 (foto local) → Task 1 (trava: contador `dados_coletados` + gate + write) + Task 2 (prompt 1x + eval TC-11). ✅ DoD "contador escrito/incrementado" + "handoff bloqueado sem foto pedida ≥1x" cobertos.
- Bug 2 (valor pós-aceito) → Task 4 (sinal "valor já apresentado", reflete pós-desconto) + Task 5 (prompt + eval TC-P12). ✅ Self-review do spec (interação `decisao_desconto`) resolvido derivando o sinal do valor ATUAL no histórico (Task 4, Step 3 helper + teste Step 1 caso pós-desconto).
- Bug 4 (rebaixa orçamento) → Task 6 (R2 + eval TC-P13). ✅
- Bug 3 (altura/multi-campo/foto-tema) → Task 3 (R10/R11/R12 + Exemplo 10 + eval TC-12 com valores exatos). ✅ Regra §5.3 (magnitude) implementada na R10.
- Estratégia de validação (§6): eval por bug ✅, snapshots ✅, suíte completa ✅ (Task 7), smoke E2E ✅ (Task 8).
- Non-goal Bug 5 (batching) → fora de escopo, citado na Task 8 Step 6. ✅

**2. Placeholder scan:** todos os steps de código têm o código real; todos os comandos têm `Run:` + `Expected:`. Sem TBD/TODO. ✅

**3. Type consistency:**
- `pediu_foto_local` — escrito em `route.js` (return), lido em `whatsapp-pipeline.js` (`agentOut.pediu_foto_local`) e nos testes. Nome idêntico em todos. ✅
- `tentativas_foto_local` — em `dados_coletados` (não `estado_extra`); read em `contexto.js` (`dados.tentativas_foto_local`), `route.js` (`conversa.dados_coletados.tentativas_foto_local`), `pipeline:233` (`dadosPreMerge.tentativas_foto_local`); write em `pipeline` Etapa 5. Consistente. ✅
- `valor_apresentado` — escrito em `proposta.js` (`ctxComFlag.valor_apresentado`), lido em `contexto.js` (`ctx.valor_apresentado`). Render "Valor ja apresentado ao cliente: sim/nao" idêntico no prompt e nos asserts de teste. ✅
- Asserts novos: `dados_persistidos_valores` (tattoo runner, Task 3) e `resposta_cliente_not_matches` (proposta runner, Task 5) — usados só por cenários novos, aditivos. ✅

**Ordem de dependências (folhas por último):** estrutura→prompt por agente (1→2→3 tattoo; 4→5→6 proposta), validação consolidada (7), smoke (8). ✅
**Contagem:** 8 tasks (< 15). ✅
