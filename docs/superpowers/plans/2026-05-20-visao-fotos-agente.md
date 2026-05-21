# Visão de fotos no agente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o TattooAgent **ver** todas as fotos que o cliente manda (referência E corpo), comentar a arte em vez de re-pedir, detectar cover-up perguntando antes de assumir, e persistir a descrição da arte como memória de recall futuro.

**Architecture:** As fotos do lote já chegam à pipeline em base64. Hoje elas nunca chegam ao LLM. Este plano cria um caminho `imagens` (base64+mimetype+msgRowId) da pipeline → `route.js` → `tattoo.js`, onde viram `content` multimodal (`input_image`) no turno de chegada via a Responses API (`responses.parse`, que já aceita content array). O modelo passa a classificar ref-vs-corpo e analisar a pele num campo novo do schema (`analise_imagens`), com o `foto-classifier.js` heurístico virando **fallback**. A descrição da arte de referência é persistida em `conversa_mensagens.message.descricao_visual` via uma RPC SQL targeted (`set_descricao_visual`, mesmo padrão da `zerar_media_base64`).

**Tech Stack:** Cloudflare Pages Functions (JS, ESM), `openai` SDK v4 (Responses API + `responses.parse`), `zod` v3 (discriminated union strict via `zodTextFormat`), Supabase Postgres (PostgREST + RPC SECURITY DEFINER), `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-05-20-visao-fotos-agente-design.md` (status `ready-to-plan`).

**Branch:** `feat/visao-fotos-agente` (já é a branch atual).

**Decisão de planejamento (cravada com o Leandro antes do plano):** persistência via **RPC nova `set_descricao_visual`** (jsonb_set targeted), reconciliando a contradição do spec ("sem migration" vs "jsonb_set sem race"). É uma migration de **função** (zero `ALTER TABLE`), additive, mesmo padrão/segurança da `zerar_media_base64`.

---

## Riscos & Flags

- **MIGRATION (Task A6):** nova RPC `set_descricao_visual`. **Ordem de deploy:** aplicar a migration em prod **ANTES** do Pages que a chama. Se o Pages subir primeiro, a chamada retorna 404 — mas a escrita está dentro do try/catch da Etapa 4.5 → degrada gracioso (memória não persiste naquele turno, cliente não é afetado). Mesmo assim: migration primeiro.
- **BREAKING (schema, Task A1):** `analise_imagens` e `cobertura_suspeita` são `required+nullable` em **todos os 4 branches** do discriminated union. Toda fixture de teste que faz `safeParse` de um output completo precisa ganhar as 2 chaves (`null`), senão quebra. Coberto na Task A1.
- **CUSTO:** imagens entram na visão só no turno de chegada, `detail:'low'` (~85 tokens/img), cap 4/turno. Custo aceito pelo Leandro no spec.
- **EVAL com fotos reais (Task B2):** o eval semântico (cover-up etc.) precisa de **fotos reais** que o Leandro precisa dropar em `tests/agent/_fixtures/images/`. O harness **pula** cenários cujo arquivo de imagem não existe — não quebra CI quando as fotos estão ausentes.
- **SECRETS:** nenhum secret novo. Eval usa `OPENAI_API_KEY` já existente (gate idêntico ao eval atual).
- **CHECKPOINT A→B:** ao fim da Fase A, decisão consciente — shippar Fase A como PR próprio (UX fix em prod mais cedo) OU emendar tudo num PR. Decidir **no** checkpoint, não antes (spec).

## File Structure

**Modificados:**
- `functions/api/agent/agents/tattoo-schema.js` — `analise_imagens` (array de `{tipo,descricao,corpo_tem_tattoo,corpo_tem_marcacao}`) + `cobertura_suspeita`, em todos os 4 branches.
- `functions/api/agent/agents/tattoo.js` — param `imagens`; `content` multimodal no turno atual (texto + `input_image`), texto-only quando sem imagens; cap 4.
- `functions/api/agent/route.js` — `runAgent` aceita+repassa `imagens` só pro TattooAgent; surfacia `analise_imagens`/`cobertura_suspeita` no retorno.
- `functions/_lib/whatsapp-pipeline.js` — monta `imagens` (cap 4) e passa ao `runAgent`; Etapa 4.5 roteia por `analise_imagens` com fallback heurístico; grava `descricao_visual` das refs via RPC.
- `functions/_lib/agent-runtime/fallbacks.js` — fallback do tattoo ganha `analise_imagens:null` + `cobertura_suspeita:null` (consistência de shape).
- `functions/_lib/prompts/coleta/tattoo/decisao.js` — reescreve R4 (hoje mente); ajusta §4.2/§4.4.
- `tests/prompts/contracts/coleta-tattoo.mjs` — âncora must_contain/must_not_contain do novo R4.
- `package.json` — script `eval:tattoo-vision`.

**Criados:**
- `supabase/migrations/2026-05-20-add-set-descricao-visual-rpc.sql` — RPC targeted.
- `tests/agent/tattoo-vision.eval.mjs` — eval harness multimodal.
- `tests/agent/_fixtures/scenarios-visao.json` — cenários de visão.
- `tests/agent/_fixtures/images/README.md` — naming das fotos reais (asset do Leandro).

**Inalterado (fallback):** `functions/_lib/foto-classifier.js` — vira fallback, sem mudança funcional.

---

# FASE A — Fundação (fecha o bug do smoke)

Imagens chegam ao modelo, bot comenta a referência e para de re-pedir, classificação ref-vs-corpo pelo modelo com fallback heurístico, captura da memória. O schema `analise_imagens` é landado **completo já aqui** (incluindo `corpo_tem_tattoo`/`corpo_tem_marcacao`), mesmo que o fluxo de cover-up só seja ativado na Fase B.

---

## Task A1: Schema `analise_imagens` + `cobertura_suspeita`

**Files:**
- Modify: `functions/api/agent/agents/tattoo-schema.js`
- Modify: `functions/_lib/agent-runtime/fallbacks.js`
- Test: `tests/agent/tattoo-schema.test.mjs`

- [ ] **Step 1: Write the failing tests (novos campos de visão)**

Em `tests/agent/tattoo-schema.test.mjs`, adicione uma constante compartilhada logo após `DADOS_VAZIOS` (linha 8):

```js
// Campos de visao (Fase A): required+nullable em todos os branches.
const VISAO_VAZIA = { analise_imagens: null, cobertura_suspeita: null };
```

E adicione ao final do arquivo (antes da última linha) estes 4 testes novos:

```js
// ─── Campos de visao (analise_imagens + cobertura_suspeita) ──────────────

test('pergunta com analise_imagens populado passa', () => {
  const ok = TattooOutputSchema.safeParse({
    proxima_acao: 'pergunta',
    resposta_cliente: 'Vi a foto — rosa fineline delicada!',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: false,
    campos_faltando: ['local_corpo'],
    campos_conflitantes: [],
    payload_portfolio: null,
    analise_imagens: [
      { tipo: 'referencia', descricao: 'rosa fineline delicada', corpo_tem_tattoo: false, corpo_tem_marcacao: false },
    ],
    cobertura_suspeita: null,
  });
  assert.equal(ok.success, true);
});

test('analise_imagens null (turno sem imagem) passa', () => {
  const ok = TattooOutputSchema.safeParse({
    proxima_acao: 'pergunta',
    resposta_cliente: 'qual o local?',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: false,
    campos_faltando: ['local_corpo'],
    campos_conflitantes: [],
    payload_portfolio: null,
    analise_imagens: null,
    cobertura_suspeita: null,
  });
  assert.equal(ok.success, true);
});

test('analise_imagens com tipo invalido e REJEITADO', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'pergunta',
    resposta_cliente: 'x',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: false,
    campos_faltando: ['local_corpo'],
    campos_conflitantes: [],
    payload_portfolio: null,
    analise_imagens: [{ tipo: 'banana', descricao: 'x', corpo_tem_tattoo: false, corpo_tem_marcacao: false }],
    cobertura_suspeita: null,
  });
  assert.equal(r.success, false);
});

test('output sem analise_imagens e REJEITADO (campo required)', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'pergunta',
    resposta_cliente: 'x',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: false,
    campos_faltando: ['local_corpo'],
    campos_conflitantes: [],
    payload_portfolio: null,
    // analise_imagens AUSENTE de proposito + cobertura_suspeita ausente
  });
  assert.equal(r.success, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/agent/tattoo-schema.test.mjs`
Expected: FAIL — os 2 testes "passa" falham (campos não existem no schema, `safeParse` rejeita o objeto que tem chaves a mais? NÃO — zod por default faz strip de chaves desconhecidas, então o objeto com `analise_imagens` parseia mas o campo some; o teste "tipo invalido" passa indevidamente como success:true). Concretamente: `pergunta com analise_imagens populado passa` ✅ (strip), `analise_imagens com tipo invalido e REJEITADO` ❌ (esperava false, recebe true por strip), `output sem analise_imagens e REJEITADO` ❌ (esperava false, recebe true). Pelo menos 2 falham → vermelho.

- [ ] **Step 3: Add the vision fields to the schema**

Em `functions/api/agent/agents/tattoo-schema.js`, após o import (linha 17) e antes de `DadosParciais` (linha 20), adicione:

```js
// Sub-shape: uma entrada de analise por imagem (1:1 com imagens[i], na ordem recebida).
const AnaliseImagem = z.object({
  tipo: z.enum(['referencia', 'corpo', 'incerto']),
  descricao: z.string(),
  corpo_tem_tattoo: z.boolean(),   // so relevante se tipo='corpo'
  corpo_tem_marcacao: z.boolean(), // brush/caneta = posicao/tamanho, NAO tattoo existente
});

// Campos de visao compartilhados por TODOS os 4 branches do discriminated union.
// Strict mode (zodTextFormat) exige toda chave em `required`; semantica "opcional"
// vem do .nullable() (mesmo padrao dos opcionais ja existentes em DadosParciais).
const camposVisao = {
  analise_imagens: z.array(AnaliseImagem).nullable(),
  cobertura_suspeita: z.boolean().nullable(),
};
```

Agora adicione `...camposVisao,` como última propriedade de cada um dos 4 branches. Exemplo no `PerguntaOutput`:

```js
const PerguntaOutput = z.object({
  proxima_acao: z.literal('pergunta'),
  resposta_cliente: z.string().min(1),
  dados_persistidos: DadosParciais,
  dados_completos: z.literal(false),
  campos_faltando: z.array(z.string()).min(1),
  campos_conflitantes: z.array(z.string()),
  payload_portfolio: z.null(),
  ...camposVisao,
});
```

Repita o mesmo `...camposVisao,` (última propriedade) em `HandoffOutput`, `EnviarPortfolioOutput` e `ErroOutput`.

- [ ] **Step 4: Update existing fixtures (required+nullable quebra os antigos)**

Em `tests/agent/tattoo-schema.test.mjs`, adicione `...VISAO_VAZIA,` como propriedade de **cada um dos objetos passados a `safeParse`** (são os 12 testes pré-existentes nas linhas 12–182). Exemplo no primeiro:

```js
test('pergunta valido com campos_faltando nao-vazio passa', () => {
  const ok = TattooOutputSchema.safeParse({
    proxima_acao: 'pergunta',
    resposta_cliente: 'Qual o local da tatuagem?',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: false,
    campos_faltando: ['local_corpo'],
    campos_conflitantes: [],
    payload_portfolio: null,
    ...VISAO_VAZIA,
  });
  assert.equal(ok.success, true);
});
```

Faça a adição idêntica de `...VISAO_VAZIA,` nos outros 11 fixtures pré-existentes (linhas 25, 38, 53, 74, 90, 104, 119, 136, 147, 160, 173). (Não toque nos 4 testes novos do Step 1 — eles já trazem os campos explícitos.)

- [ ] **Step 5: Update the tattoo fallback shape**

Em `functions/_lib/agent-runtime/fallbacks.js`, no objeto retornado por `buildFallbackOutput` (linhas 12–20), adicione as 2 chaves no fim:

```js
  return {
    proxima_acao: 'pergunta',
    resposta_cliente: FALLBACK_MESSAGE,
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: [],
    payload_portfolio: null,
    analise_imagens: null,
    cobertura_suspeita: null,
  };
```

- [ ] **Step 6: Run the schema tests + the strict-format conversion to verify they pass**

Run: `node --test tests/agent/tattoo-schema.test.mjs`
Expected: PASS (todos, incluindo os 4 novos).

Valide que o schema continua convertível pra strict JSON Schema (não quebra `zodTextFormat`):

Run: `node -e "import('./functions/api/agent/agents/tattoo-schema.js').then(async m=>{const {toResponseFormat}=await import('./functions/_lib/agent-runtime/schema-to-json.js');const {z}=await import('zod');const f=toResponseFormat(z.object({output:m.TattooOutputSchema}),'tattoo_output');console.log('strict=',f.strict,'has analise=', JSON.stringify(f.schema).includes('analise_imagens'));})"`
Expected: `strict= true has analise= true`

- [ ] **Step 7: Commit**

```bash
git add functions/api/agent/agents/tattoo-schema.js functions/_lib/agent-runtime/fallbacks.js tests/agent/tattoo-schema.test.mjs
git commit -m "feat(tattoo-schema): add analise_imagens + cobertura_suspeita (visao fase A)"
```

---

## Task A2: `tattoo.js` content multimodal

**Files:**
- Modify: `functions/api/agent/agents/tattoo.js:43-69`
- Test: `tests/agent/run-tattoo-agent.test.mjs`

- [ ] **Step 1: Write the failing tests**

Em `tests/agent/run-tattoo-agent.test.mjs`, adicione ao final do arquivo:

```js
test('runTattooAgent: monta content multimodal quando imagens presentes', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'vi a ref',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
    payload_portfolio: null, analise_imagens: null, cobertura_suspeita: null,
  });
  await runTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'olha essa ref',
    historico: [],
    imagens: [{ base64: 'AAAA', mimetype: 'image/jpeg', msgRowId: 7 }],
    openaiClient: fake,
  });
  const captured = fake._captured();
  const last = captured.input[captured.input.length - 1];
  assert.equal(last.role, 'user');
  assert.ok(Array.isArray(last.content), 'content deve ser array multimodal');
  assert.equal(last.content[0].type, 'input_text');
  assert.equal(last.content[0].text, 'olha essa ref');
  assert.equal(last.content[1].type, 'input_image');
  assert.equal(last.content[1].image_url, 'data:image/jpeg;base64,AAAA');
  assert.equal(last.content[1].detail, 'low');
});

test('runTattooAgent: content string (texto-only) quando sem imagens', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'x',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
    payload_portfolio: null, analise_imagens: null, cobertura_suspeita: null,
  });
  await runTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'so texto', historico: [], openaiClient: fake,
  });
  const captured = fake._captured();
  const last = captured.input[captured.input.length - 1];
  assert.equal(typeof last.content, 'string');
  assert.equal(last.content, 'so texto');
});

test('runTattooAgent: cap de 4 imagens no content', async () => {
  const fake = makeFakeClient({
    proxima_acao: 'pergunta', resposta_cliente: 'x',
    dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
    dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
    payload_portfolio: null, analise_imagens: null, cobertura_suspeita: null,
  });
  const seis = Array.from({ length: 6 }, (_, i) => ({ base64: `B${i}`, mimetype: 'image/png', msgRowId: i }));
  await runTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test' },
    tenant: FAKE_TENANT, conversa: FAKE_CONVERSA, clientContext: {},
    mensagem: 'varias', historico: [], imagens: seis, openaiClient: fake,
  });
  const captured = fake._captured();
  const last = captured.input[captured.input.length - 1];
  const imgs = last.content.filter(c => c.type === 'input_image');
  assert.equal(imgs.length, 4);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/agent/run-tattoo-agent.test.mjs`
Expected: FAIL — `imagens` é ignorado hoje; `content` é sempre a string `mensagem`. O teste multimodal falha em `Array.isArray(last.content)`.

- [ ] **Step 3: Implement multimodal content**

Substitua a função `runTattooAgent` em `functions/api/agent/agents/tattoo.js` (linhas 43-69) por:

```js
// Cap de imagens enviadas ao modelo por turno (custo). A pipeline tambem capa
// no envio; este cap e defesa-em-profundidade no render do content.
const MAX_IMAGENS_VISAO = 4;

export async function runTattooAgent({
  env,
  tenant,
  conversa,
  clientContext,
  mensagem,
  historico,
  imagens,
  openaiClient,
}) {
  const ctx = clientContext || {};
  const instructions = generatePromptColetaTattoo(tenant, conversa, ctx);

  // Content do turno ATUAL: array multimodal so quando ha imagens neste turno.
  // Turnos seguintes nao re-enviam imagem (historico carrega comentario + descricao).
  const imgs = Array.isArray(imagens) ? imagens.slice(0, MAX_IMAGENS_VISAO) : [];
  const turnoContent = imgs.length > 0
    ? [
        { type: 'input_text', text: mensagem },
        ...imgs.map((img) => ({
          type: 'input_image',
          image_url: `data:${img.mimetype};base64,${img.base64}`,
          detail: 'low',
        })),
      ]
    : mensagem;

  const input = [
    ...((historico || []).map(normalizeHistoryItem)),
    { role: 'user', content: turnoContent },
  ];

  return await runtime.run({
    apiKey: env.OPENAI_API_KEY,
    openaiClient,
    model: 'gpt-4o-mini',
    instructions,
    input,
    outputSchema: TattooOutputSchema,
    schemaName: 'tattoo_output',
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/agent/run-tattoo-agent.test.mjs`
Expected: PASS (incluindo os 3 testes pré-existentes — `content` string sem imagens é preservado).

- [ ] **Step 5: Commit**

```bash
git add functions/api/agent/agents/tattoo.js tests/agent/run-tattoo-agent.test.mjs
git commit -m "feat(tattoo): content multimodal (input_image) no turno de chegada"
```

---

## Task A3: `route.js` repassa `imagens` + surfacia `analise_imagens`

**Files:**
- Modify: `functions/api/agent/route.js` (destructure de `runAgent`, branch tattoo, return, `onRequest`)
- Test: `tests/agent/route-runagent.test.mjs`

- [ ] **Step 1: Write the failing test**

Em `tests/agent/route-runagent.test.mjs`, adicione ao final:

```js
const PERGUNTA_OUT_VISAO = {
  proxima_acao: 'pergunta',
  resposta_cliente: 'Vi a foto — rosa fineline!',
  dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
  dados_completos: false,
  campos_faltando: ['local_corpo'],
  campos_conflitantes: [],
  payload_portfolio: null,
  analise_imagens: [{ tipo: 'referencia', descricao: 'rosa fineline', corpo_tem_tattoo: false, corpo_tem_marcacao: false }],
  cobertura_suspeita: null,
};

function fakeOpenAI(captureRef) {
  return {
    responses: {
      parse: async (params) => {
        captureRef.params = params;
        return { status: 'completed', id: 'resp_fake', output_parsed: { output: PERGUNTA_OUT_VISAO } };
      },
    },
  };
}

const TENANT_STUB = { id: 't', nome_estudio: 'Stub', config_agente: {}, gatilhos_handoff: [], faqs: [], fewshots: [], portfolio_urls: [] };
const CONVERSA_STUB = { id: 'c', telefone: '5511', estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} };

test('runAgent (tattoo): repassa imagens como content multimodal ao TattooAgent', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const cap = {};
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'olha',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa: CONVERSA_STUB, clientContext: {},
    imagens: [{ base64: 'ZZ', mimetype: 'image/png', msgRowId: 1 }],
    openaiClient: fakeOpenAI(cap),
  });
  assert.equal(r.ok, true);
  const last = cap.params.input[cap.params.input.length - 1];
  assert.ok(Array.isArray(last.content));
  assert.equal(last.content[1].type, 'input_image');
});

test('runAgent (tattoo): surfacia analise_imagens no retorno', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const cap = {};
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'olha',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa: CONVERSA_STUB, clientContext: {},
    imagens: [{ base64: 'ZZ', mimetype: 'image/png', msgRowId: 1 }],
    openaiClient: fakeOpenAI(cap),
  });
  assert.equal(r.ok, true);
  assert.equal(r.analise_imagens[0].tipo, 'referencia');
  assert.equal(r.cobertura_suspeita, null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/agent/route-runagent.test.mjs`
Expected: FAIL — `runAgent` não desestrutura `imagens` (não chega ao agent) e o retorno não inclui `analise_imagens` (`r.analise_imagens` é `undefined`).

- [ ] **Step 3: Add `imagens` to the runAgent destructure**

Em `functions/api/agent/route.js`, no destructure de `runAgent` (linhas 94-107), adicione `imagens,` (ex.: logo após `historico,`):

```js
export async function runAgent({
  env,
  ctx,
  tenant_id,
  telefone,
  mensagem,
  estado_atual,
  dados_acumulados,
  historico,
  imagens,
  tenant,
  conversa,
  clientContext,
  openaiClient,
}) {
```

- [ ] **Step 4: Pass `imagens` only to the tattoo path**

Na chamada de `runTattooAgent` (linhas 141-145), adicione `imagens,`:

```js
      out = await runTattooAgent({
        env, tenant, conversa, clientContext: mergedClientContext,
        mensagem, historico, imagens,
        openaiClient,
      });
```

(NÃO adicione a `runCadastroAgent` nem `runPropostaAgent` — só o tattoo enxerga.)

- [ ] **Step 5: Surface `analise_imagens` + `cobertura_suspeita` in the return**

No objeto de retorno de sucesso de `runAgent` (linhas 312-324), adicione 2 campos antes do fechamento:

```js
  return {
    ok: true,
    resposta_cliente: finalOut.resposta_cliente,
    estado_novo: getNextState(estado_atual, finalOut),
    dados_persistidos: finalOut.dados_persistidos,
    dados_completos: finalOut.dados_completos,
    campos_faltando: finalOut.campos_faltando,
    campos_conflitantes: finalOut.campos_conflitantes,
    proxima_acao: finalOut.proxima_acao,
    agent_usado: estado_atual,
    side_effects: PROPOSTA_SUBSTATES.has(estado_atual) ? sideEffects : undefined,
    urls_portfolio,
    analise_imagens: finalOut.analise_imagens ?? null,
    cobertura_suspeita: finalOut.cobertura_suspeita ?? null,
  };
```

(Para cadastro/proposta `finalOut.analise_imagens` é `undefined` → `null`. OK.)

- [ ] **Step 6: Forward `imagens` from the HTTP wrapper**

Em `onRequest`, na chamada de `runAgent` (linhas 364-376), adicione:

```js
    historico,
    imagens: Array.isArray(body?.imagens) ? body.imagens : undefined,
    tenant,
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tests/agent/route-runagent.test.mjs`
Expected: PASS (incluindo os 3 testes pré-existentes 501).

- [ ] **Step 8: Commit**

```bash
git add functions/api/agent/route.js tests/agent/route-runagent.test.mjs
git commit -m "feat(route): repassa imagens ao TattooAgent + surfacia analise_imagens no retorno"
```

---

## Task A4: Pipeline monta `imagens` e passa ao `runAgent`

**Files:**
- Modify: `functions/_lib/whatsapp-pipeline.js:99-110` (montagem) e `:186-194` (Etapa 4 runAgent)
- Test: `tests/_lib/whatsapp-pipeline.test.mjs`

- [ ] **Step 1: Write the failing test**

Em `tests/_lib/whatsapp-pipeline.test.mjs`, adicione ao final do arquivo:

```js
test('pipeline: passa imagens (base64+mimetype+msgRowId) ao runAgent, cap 4', async () => {
  let capturedRunAgent;
  const rows = rowsFor([
    { id: 1, content: 'olha essas', media_base64: 'A0', media_mimetype: 'image/jpeg' },
    { id: 2, content: '', media_base64: 'A1', media_mimetype: 'image/jpeg' },
    { id: 3, content: '', media_base64: 'A2', media_mimetype: 'image/png' },
    { id: 4, content: '', media_base64: 'A3', media_mimetype: 'image/jpeg' },
    { id: 5, content: '', media_base64: 'A4', media_mimetype: 'image/jpeg' },
    { id: 6, content: '', media_base64: 'A5', media_mimetype: 'image/jpeg' },
  ]);
  const conversa = { id: CONVERSA_ID, estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {}, estado_extra: {} };
  const deps = mockDeps({
    runAgent: async (args) => {
      capturedRunAgent = args;
      return { ok: true, resposta_cliente: 'oi', estado_novo: 'tattoo', dados_persistidos: {}, proxima_acao: 'pergunta', agent_usado: 'tattoo' };
    },
    supaFetch: batchSupaFetch({ conversa, rows }),
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, baseBatch({ msgRowIds: [1, 2, 3, 4, 5, 6] }), deps);
  assert.equal(capturedRunAgent.imagens.length, 4, 'cap de 4 imagens');
  assert.deepEqual(capturedRunAgent.imagens[0], { base64: 'A0', mimetype: 'image/jpeg', msgRowId: 1 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/_lib/whatsapp-pipeline.test.mjs`
Expected: FAIL — `runAgent` é chamado sem `imagens` (`capturedRunAgent.imagens` é `undefined`).

- [ ] **Step 3: Build the `imagens` array (com cap)**

Em `functions/_lib/whatsapp-pipeline.js`, substitua o comentário stale (linhas 100-101) e o bloco de `fotos` por (mantendo `fotos` igual, adicionando `imagens` logo depois):

```js
  // Montagem do lote → 1 turno.
  // Lote so-foto (sem caption) → texto='' (mesmo comportamento do processMessage antigo).
  // As fotos do lote vao AO MODELO via `imagens` (visao) E sao classificadas/persistidas
  // na Etapa 4.5 (correlacao por indice imagens[i] <-> fotos[i] <-> msgRowId).
  const texto = rows.map(r => r.message?.content).filter(c => c && c.trim()).join('\n');
  const fotos = rows
    .filter(r => r.message?.media_base64 && r.message?.media_mimetype?.startsWith('image/'))
    .map(r => ({
      msgRowId: r.id, mediaBase64: r.message.media_base64, mediaMimetype: r.message.media_mimetype,
      // caption PROPRIA da foto — classificacao usa o texto DELA, nao o texto concatenado do
      // lote (senao um keyword numa msg vaza pra todas as fotos → todas viram 'local').
      caption: r.message.content || '',
    }));
  // Cap pro modelo (custo). A Etapa 4.5 ainda classifica/persiste TODAS as fotos do lote.
  const MAX_IMAGENS_VISAO = 4;
  const imagens = fotos.slice(0, MAX_IMAGENS_VISAO).map(f => ({
    base64: f.mediaBase64, mimetype: f.mediaMimetype, msgRowId: f.msgRowId,
  }));
```

- [ ] **Step 4: Pass `imagens` in the Etapa 4 runAgent call**

Na Etapa 4 (linhas 190-194), adicione `imagens,`:

```js
      agentOut = await deps.runAgent({
        tenant_id: tenantId, telefone, mensagem: texto, imagens,
        estado_atual: estadoAgente, dados_acumulados: conversa.dados_coletados || {},
        historico, tenant, conversa: { ...conversa, estado_agente: estadoAgente }, clientContext: {},
      });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/_lib/whatsapp-pipeline.test.mjs`
Expected: PASS (todos os pré-existentes seguem verdes — `imagens` é additive).

- [ ] **Step 6: Commit**

```bash
git add functions/_lib/whatsapp-pipeline.js tests/_lib/whatsapp-pipeline.test.mjs
git commit -m "feat(pipeline): monta imagens (cap 4) e passa ao runAgent"
```

---

## Task A5: Etapa 4.5 roteia por `analise_imagens` (fallback heurístico)

**Files:**
- Modify: `functions/_lib/whatsapp-pipeline.js:214-244` (Etapa 4.5)
- Test: `tests/integration/pipeline-classifier.test.mjs`

- [ ] **Step 1: Write the failing tests (roteamento por modelo + fallback)**

Em `tests/integration/pipeline-classifier.test.mjs`, adicione ao final do arquivo:

```js
test('Cenario E: analise_imagens tipo=corpo → foto_local_msg_id', async () => {
  const conversaInicial = { id: 'c1', estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {}, estado_extra: {} };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: {
      ok: true, agent_usado: 'tattoo', dados_persistidos: {},
      analise_imagens: [{ tipo: 'corpo', descricao: 'antebraco pele limpa', corpo_tem_tattoo: false, corpo_tem_marcacao: false }],
    },
    capturedPatches: patches,
    texto: 'aqui o local', // keyword existe, mas o modelo manda — modelo vence
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, makeBatch(), deps);
  const fotoPatch = patches.find(p => p.body?.dados_coletados?.foto_local_msg_id === MSG_ROW_ID);
  assert.ok(fotoPatch, 'tipo=corpo deve virar foto_local');
});

test('Cenario F: analise_imagens tipo=referencia → refs (nao local)', async () => {
  const conversaInicial = { id: 'c1', estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {}, estado_extra: {} };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: {
      ok: true, agent_usado: 'tattoo', dados_persistidos: {},
      analise_imagens: [{ tipo: 'referencia', descricao: 'rosa fineline', corpo_tem_tattoo: false, corpo_tem_marcacao: false }],
    },
    capturedPatches: patches,
    texto: 'no braço', // keyword 'braço' existe, mas modelo diz referencia → vence
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, makeBatch(), deps);
  const refPatch = patches.find(p => Array.isArray(p.body?.dados_coletados?.refs_imagens_msg_ids));
  assert.ok(refPatch);
  assert.deepEqual(refPatch.body.dados_coletados.refs_imagens_msg_ids, [MSG_ROW_ID]);
  const fotoPatch = patches.find(p => p.body?.dados_coletados?.foto_local_msg_id === MSG_ROW_ID);
  assert.equal(fotoPatch, undefined, 'referencia nunca vira foto_local');
});

test('Cenario G: analise_imagens tipo=incerto → refs (nunca dropa)', async () => {
  const conversaInicial = { id: 'c1', estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {}, estado_extra: {} };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: {
      ok: true, agent_usado: 'tattoo', dados_persistidos: {},
      analise_imagens: [{ tipo: 'incerto', descricao: 'foto ambigua', corpo_tem_tattoo: false, corpo_tem_marcacao: false }],
    },
    capturedPatches: patches,
    texto: 'olha',
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, makeBatch(), deps);
  const refPatch = patches.find(p => Array.isArray(p.body?.dados_coletados?.refs_imagens_msg_ids));
  assert.ok(refPatch, 'incerto roteia como ref por padrao');
});

test('Cenario H (fallback): sem analise_imagens → heuristico (L2 keyword)', async () => {
  const conversaInicial = { id: 'c1', estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {}, estado_extra: {} };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    // runAgentOut SEM analise_imagens (visao degradou / fallback) — heuristico assume
    runAgentOut: { ok: true, agent_usado: 'tattoo', dados_persistidos: { local_corpo: 'pulso' } },
    capturedPatches: patches,
    texto: 'aqui no pulso',
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, makeBatch(), deps);
  const fotoPatch = patches.find(p => p.body?.dados_coletados?.foto_local_msg_id === MSG_ROW_ID);
  assert.ok(fotoPatch, 'fallback heuristico L2 classifica pulso como local');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/integration/pipeline-classifier.test.mjs`
Expected: FAIL — Cenário E falha (hoje o `texto:'aqui o local'` cairia em heurístico, mas como `tentativas=0` e sem L1, o L2 da keyword "local"? não há keyword "local" em KEYWORDS_LOCAL — então hoje viraria 'ref', não 'foto_local'). Cenário E espera `foto_local` via `tipo=corpo` que ainda não é lido → falha. Cenário H (fallback) passa desde já (comportamento atual preservado).

- [ ] **Step 3: Rewrite Etapa 4.5 to consume `analise_imagens` with fallback**

Em `functions/_lib/whatsapp-pipeline.js`, substitua o corpo do loop da Etapa 4.5 (linhas 214-244) por:

```js
    // Etapa 4.5: rotear CADA foto do lote. Fonte de verdade = analise_imagens do
    // modelo (que VIU a foto). Fallback = foto-classifier heuristico quando a visao
    // falhou/ausente. Correlacao por indice: fotos[i] <-> analise[i] <-> msgRowId.
    // 1 PATCH final acumulado.
    if (fotos.length > 0) {
      try {
        const dadosPreMerge = conversa.dados_coletados || {};
        let dadosAcc = isCadastro ? { ...dadosPreMerge } : { ...novoDadosColetados };
        let tentativas = dadosPreMerge.tentativas_foto_local || conversa.estado_extra?.tentativas_foto_local || 0;
        let fotoLocalAtual = dadosPreMerge.foto_local;
        const analise = Array.isArray(agentOut.analise_imagens) ? agentOut.analise_imagens : null;
        // No maximo UMA foto_local por lote: a 1ª 'local' vence; demais viram ref.
        let localAtribuidaNoLote = false;
        for (let i = 0; i < fotos.length; i++) {
          const foto = fotos[i];
          let tipo; // 'local' | 'ref'
          const a = analise && analise[i];
          if (a) {
            // Modelo viu a imagem: corpo→local; referencia/incerto→ref (incerto nunca dropa).
            tipo = a.tipo === 'corpo' ? 'local' : 'ref';
          } else {
            // Fallback heuristico (visao ausente p/ esta foto).
            tipo = deps.classificarFoto({ tentativas_foto_local: tentativas, foto_local_atual: fotoLocalAtual, texto_turno: foto.caption });
          }
          if (tipo === 'local' && !localAtribuidaNoLote) {
            dadosAcc = { ...dadosAcc, foto_local_msg_id: foto.msgRowId };
            fotoLocalAtual = foto.msgRowId; // proximas fotos do lote ja veem local presente
            localAtribuidaNoLote = true;
          } else {
            const ids = Array.isArray(dadosAcc.refs_imagens_msg_ids) ? dadosAcc.refs_imagens_msg_ids : [];
            dadosAcc = { ...dadosAcc, refs_imagens_msg_ids: [...ids, foto.msgRowId] };
          }
        }
        await deps.supaFetch(`/rest/v1/conversas?id=eq.${conversa.id}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ dados_coletados: dadosAcc }),
        });
      } catch (e) {
        console.warn(`[pipeline] etapa-4.5 classificador falhou: ${e.message}`);
      }
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/integration/pipeline-classifier.test.mjs`
Expected: PASS (Cenários A–D pré-existentes seguem verdes via fallback; E–H novos passam).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/whatsapp-pipeline.js tests/integration/pipeline-classifier.test.mjs
git commit -m "feat(pipeline): Etapa 4.5 roteia por analise_imagens com fallback heuristico"
```

---

## Task A6: RPC `set_descricao_visual` + persistência da memória

**Files:**
- Create: `supabase/migrations/2026-05-20-add-set-descricao-visual-rpc.sql`
- Modify: `functions/_lib/whatsapp-pipeline.js` (Etapa 4.5 — coleta + grava descrições)
- Test: `tests/integration/pipeline-classifier.test.mjs`

- [ ] **Step 1: Create the migration**

Crie `supabase/migrations/2026-05-20-add-set-descricao-visual-rpc.sql`:

```sql
-- set_descricao_visual: grava message.descricao_visual targeted (jsonb_set) sem
-- clobber das demais chaves do `message` (preserva media_base64/content).
-- Memoria de recall da arte de referencia (feature visao-fotos-agente Fase A).
-- Mesmo padrao/seguranca do zerar_media_base64 (SECURITY DEFINER + grants restritos):
-- coexiste com zerar_media_base64 sem race read-modify-write porque AMBAS usam
-- jsonb_set targeted em chaves disjuntas.
CREATE OR REPLACE FUNCTION public.set_descricao_visual(p_msg_id BIGINT, p_descricao TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.conversa_mensagens
  SET message = jsonb_set(message, '{descricao_visual}', to_jsonb(p_descricao))
  WHERE id = p_msg_id;
$$;

-- Supabase concede EXECUTE a anon/authenticated por default privileges.
-- Como a funcao e SECURITY DEFINER (bypassa RLS), revogar de TODOS menos service_role
-- pra evitar que qualquer holder de anon key escreva descricao em mensagens arbitrarias.
REVOKE ALL ON FUNCTION public.set_descricao_visual(BIGINT, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_descricao_visual(BIGINT, TEXT) TO service_role;
```

- [ ] **Step 2: Write the failing test**

Em `tests/integration/pipeline-classifier.test.mjs`, o helper `makeDeps` precisa capturar chamadas RPC. O `supaFetch` mock (linhas 37-65) já cai no `return new Response(null, { status: 204 })` final pra POSTs não-mapeados. Adicione, **antes** desse return final, a captura da RPC:

```js
      // RPC set_descricao_visual (memoria da arte de referencia)
      if (init.method === 'POST' && path.includes('/rpc/set_descricao_visual')) {
        capturedPatches.push({ path, body: JSON.parse(init.body) });
        return new Response(null, { status: 204 });
      }
```

E adicione o teste ao final do arquivo:

```js
test('Cenario I: referencia com descricao → grava descricao_visual via RPC', async () => {
  const conversaInicial = { id: 'c1', estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {}, estado_extra: {} };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: {
      ok: true, agent_usado: 'tattoo', dados_persistidos: {},
      analise_imagens: [{ tipo: 'referencia', descricao: 'rosa fineline delicada', corpo_tem_tattoo: false, corpo_tem_marcacao: false }],
    },
    capturedPatches: patches,
    texto: 'olha essa',
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, makeBatch(), deps);
  const rpc = patches.find(p => p.path.includes('/rpc/set_descricao_visual'));
  assert.ok(rpc, 'esperava chamada RPC set_descricao_visual');
  assert.equal(rpc.body.p_msg_id, MSG_ROW_ID);
  assert.equal(rpc.body.p_descricao, 'rosa fineline delicada');
});

test('Cenario J: corpo NAO gera descricao_visual (recall e so da arte)', async () => {
  const conversaInicial = { id: 'c1', estado_agente: 'coletando_tattoo', dados_coletados: {}, dados_cadastro: {}, estado_extra: {} };
  const patches = [];
  const deps = makeDeps({
    conversaInicial,
    runAgentOut: {
      ok: true, agent_usado: 'tattoo', dados_persistidos: {},
      analise_imagens: [{ tipo: 'corpo', descricao: 'antebraco com tattoo', corpo_tem_tattoo: true, corpo_tem_marcacao: false }],
    },
    capturedPatches: patches,
    texto: 'meu braço',
  });
  await processBatch({ INKFLOW_TELEGRAM_BOT_TOKEN: 't' }, makeBatch(), deps);
  const rpc = patches.find(p => p.path.includes('/rpc/set_descricao_visual'));
  assert.equal(rpc, undefined, 'foto de corpo nao gera memoria de recall');
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/integration/pipeline-classifier.test.mjs`
Expected: FAIL — Cenário I falha (nenhuma RPC `set_descricao_visual` é chamada hoje). Cenário J passa desde já (nada chama a RPC).

- [ ] **Step 4: Collect + persist descriptions in Etapa 4.5**

Em `functions/_lib/whatsapp-pipeline.js`, na Etapa 4.5 (a versão reescrita na Task A5), faça 3 edits:

(a) Declare o acumulador de descrições logo após `let localAtribuidaNoLote = false;`:

```js
        let localAtribuidaNoLote = false;
        // Memoria de recall: descricao da arte SO de fotos 'referencia' (nao 'corpo').
        const descricoesRef = [];
```

(b) Dentro do loop, no ramo `else` (ref), capture a descrição quando o modelo classificou como `referencia` com descrição não-vazia:

```js
          } else {
            const ids = Array.isArray(dadosAcc.refs_imagens_msg_ids) ? dadosAcc.refs_imagens_msg_ids : [];
            dadosAcc = { ...dadosAcc, refs_imagens_msg_ids: [...ids, foto.msgRowId] };
            if (a && a.tipo === 'referencia' && a.descricao && a.descricao.trim()) {
              descricoesRef.push({ msgRowId: foto.msgRowId, descricao: a.descricao.trim() });
            }
          }
```

(c) Após o PATCH de `dados_coletados` (ainda dentro do `try`), grave cada descrição via RPC targeted (cada uma em try/catch — memória é best-effort, não pode abortar as demais):

```js
        await deps.supaFetch(`/rest/v1/conversas?id=eq.${conversa.id}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ dados_coletados: dadosAcc }),
        });
        // Persiste descricao da arte de referencia (jsonb_set targeted, preserva
        // demais chaves do message + coexiste com zerar_media_base64).
        for (const d of descricoesRef) {
          try {
            await deps.supaFetch(`/rest/v1/rpc/set_descricao_visual`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ p_msg_id: d.msgRowId, p_descricao: d.descricao }),
            });
          } catch (e) {
            console.warn(`[pipeline] set_descricao_visual falhou (msg ${d.msgRowId}): ${e.message}`);
          }
        }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/integration/pipeline-classifier.test.mjs`
Expected: PASS (Cenários A–J).

- [ ] **Step 6: Run the full suite (regressão da Fase A)**

Run: `npm test`
Expected: PASS — toda a suíte verde (978+ testes existentes + os novos).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/2026-05-20-add-set-descricao-visual-rpc.sql functions/_lib/whatsapp-pipeline.js tests/integration/pipeline-classifier.test.mjs
git commit -m "feat(pipeline): persiste descricao_visual da arte de referencia via RPC set_descricao_visual"
```

---

## ⛳ CHECKPOINT A→B (decisão consciente — spec)

**Fase A está completa: o bug do smoke está fechado** (bot vê e comenta a referência, para de re-pedir; classificação ref-vs-corpo pelo modelo; memória capturada). Antes de seguir pra Fase B, decida:

- **Opção 1 — Shippar Fase A como PR próprio:** UX fix em produção mais cedo. Aplicar a migration `set_descricao_visual` em prod **primeiro**, depois deploy do Pages (cron-worker → Pages, conforme runbook). Smoke E2E rápido só da Fase A (referência → comentário; conferir `message.descricao_visual` gravado). Depois abrir nova branch/PR pra Fase B.
- **Opção 2 — Emendar tudo num PR só:** seguir direto pra Fase B na mesma branch; um PR único com cover-up incluso.

**Não decida antes deste ponto.** Registrar a decisão (e o motivo) no PR / daily note.

---

# FASE B — Cover-up (requisito crítico)

R4 reescrito pro fluxo de tattoo/marcação + perguntar-antes-de-assumir + "na dúvida, pergunta"; eval com fixtures de corpo-com-tattoo / marcação-de-brush / ambíguo. O schema já suporta tudo (Fase A); aqui é prompt + eval.

---

## Task B1: Reescreve R4 + ajusta §4.2/§4.4 (decisao.js)

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/decisao.js` (R4 linhas 83-87; §4.2 linha 52-55; §4.4 linhas 122-133)
- Modify: `tests/prompts/contracts/coleta-tattoo.mjs` (âncoras)
- Test: `tests/prompts/contracts.test.mjs` (contract) + `tests/prompts/snapshot.test.mjs` (snapshot)

- [ ] **Step 1: Write the failing contract anchors**

Em `tests/prompts/contracts/coleta-tattoo.mjs`, adicione âncoras ao contrato:

```js
  must_contain: [
    'IDENTIDADE',
    'CONTEXTO',
    'OBJETIVO',
    'DECISAO',
    'descricao_curta',
    'tamanho_cm',
    'local_corpo',
    'dados_persistidos',
    'proxima_acao',
    'recebe as imagens',   // novo R4: o modelo VE a imagem neste turno
    'cobertura',           // novo R4: fluxo cover-up perguntar-antes-de-assumir
  ],
  must_not_contain: [
    // ... entradas existentes preservadas ...
    'descricao_tattoo',
    'injeta descricao textual', // R4 antigo MENTIA — garante que a frase saiu
  ],
```

(Mantenha todas as entradas `must_not_contain` já existentes; só adicione a última.)

- [ ] **Step 2: Run the contract test to verify it fails**

Run: `node --test tests/prompts/contracts.test.mjs`
Expected: FAIL — `must_contain "recebe as imagens" ausente` e `must_not_contain "injeta descricao textual" presente` (o R4 atual tem a frase mentirosa).

- [ ] **Step 3: Rewrite R4 in decisao.js**

Em `functions/_lib/prompts/coleta/tattoo/decisao.js`, substitua o bloco **R4** (linhas 83-87) por:

```js
**R4. IMAGENS (voce VE a foto).** Voce **recebe as imagens diretamente** neste turno — analise o conteudo visual de verdade, nao peca uma foto que ja esta na tela. **Diferencie** pelo contexto da conversa + a propria imagem:
- **Referencia** (a arte que o cliente quer tatuar): comente algo concreto e util ("rosa fineline delicada, vai ficar otima"). Registre em \`dados_persistidos\` o que ajudar (estilo/descricao) e siga coletando os OBR.
- **Local do corpo** (onde vai tatuar): leia a pele.
  - **Pele VAZIA** = candidato a \`local_corpo\`/\`foto_local\`. Se cliente nao disse o local, infira pela imagem e confirme.
  - **Tatuagem EXISTENTE no local pretendido** E cliente **nao** mencionou cobertura: **pergunte sutilmente** se e cobertura ANTES de assumir — ex.: "Vi que tem uma tatuagem e uma marcacao na foto que voce me mandou — seria uma cobertura nessa parte do braco marcada?". Use \`proxima_acao='pergunta'\` e marque \`cobertura_suspeita=true\`. So trate como cover-up (R5) apos o cliente CONFIRMAR.
  - **Marcacao de caneta/brush** (rabisco que o cliente desenhou sobre a foto) = ele indicando **posicao/tamanho**. **NAO** e tatuagem existente, **NAO** dispare cobertura.
- **Na DUVIDA** sobre o tipo da foto (referencia vs corpo) OU sobre cobertura: **pergunte sutilmente** (\`proxima_acao='pergunta'\`). **Nunca assuma.** Tatuagens em segundo plano (nao no local pretendido) = ignore.
- Preencha \`analise_imagens\` com **uma entrada por imagem, na ordem recebida** (\`tipo\`: referencia/corpo/incerto; \`descricao\` curta do que voce ve; \`corpo_tem_tattoo\`/\`corpo_tem_marcacao\` so relevantes p/ corpo). Sem imagem no turno → \`analise_imagens=null\`.
```

- [ ] **Step 4: Adjust §4.2 (OPCIONAIS) and §4.4 (pedido de foto do local)**

Em §4.2, ajuste a linha de `foto_local` (linha 54) pra refletir que o modelo enxerga:

```js
- \`foto_local\`: foto do local do corpo. **Pedida ate 2x** (ver §4.4). Quando o cliente manda, voce VE a foto e confirma o local pela imagem.
```

Em §4.4, ajuste o parágrafo de pedido de foto (perto da linha 126-133) pra deixar claro que, recebida a foto, o modelo confirma o local pela imagem:

```js
- Manda a foto → voce VE a imagem, confirma o local, persista em \`foto_local\` + handoff no proximo turno.
```

(Mantenha R5, R8 e o manifesto intactos.)

- [ ] **Step 5: Run the contract test to verify it passes**

Run: `node --test tests/prompts/contracts.test.mjs`
Expected: PASS (incluindo `max_tokens <= 6000` — se estourar, enxugue R4; deve sobrar folga).

- [ ] **Step 6: Regenerate + eyeball the prompt snapshot**

Run: `bash scripts/update-prompt-snapshots.sh`
Then: `git --no-pager diff tests/prompts/snapshots/coleta-tattoo.txt`
Expected: o diff mostra **apenas** o novo R4 + ajustes §4.2/§4.4 (nada inesperado em outros blocos). Confira que o texto do cover-up e o "na duvida, pergunta" estão presentes e legíveis.

- [ ] **Step 7: Run the snapshot test to verify it passes**

Run: `node --test tests/prompts/snapshot.test.mjs`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add functions/_lib/prompts/coleta/tattoo/decisao.js tests/prompts/contracts/coleta-tattoo.mjs tests/prompts/snapshots/coleta-tattoo.txt
git commit -m "feat(prompt): reescreve R4 do TattooAgent — modelo VE a foto + cover-up perguntar-antes-de-assumir"
```

---

## Task B2: Eval harness multimodal + fixtures de imagem

**Files:**
- Create: `tests/agent/_fixtures/scenarios-visao.json`
- Create: `tests/agent/tattoo-vision.eval.mjs`
- Create: `tests/agent/_fixtures/images/README.md`
- Modify: `package.json` (script `eval:tattoo-vision`)

- [ ] **Step 1: Define the vision scenarios**

Crie `tests/agent/_fixtures/scenarios-visao.json`:

```json
{
  "scenarios": [
    {
      "id": "VIS-01",
      "descricao": "Referencia: bot comenta a arte e NAO re-pede a foto",
      "imagem": "referencia-rosa.jpg",
      "caption": "queria fazer essa",
      "dados_acumulados": {},
      "expected": { "analise_tipo": "referencia", "proxima_acao": "pergunta", "resposta_nao_match": "tem (uma )?foto" }
    },
    {
      "id": "VIS-02",
      "descricao": "Corpo pele limpa: segue coleta normal",
      "imagem": "corpo-limpo-antebraco.jpg",
      "caption": "ia ser aqui no antebraco",
      "dados_acumulados": { "descricao_curta": "rosa fineline", "estilo": "fineline" },
      "expected": { "analise_tipo": "corpo", "analise_corpo_tem_tattoo": false }
    },
    {
      "id": "VIS-03",
      "descricao": "Corpo com tattoo existente + cliente nao mencionou cobertura → bot pergunta",
      "imagem": "corpo-com-tattoo-antebraco.jpg",
      "caption": "queria fazer aqui",
      "dados_acumulados": {},
      "expected": { "analise_tipo": "corpo", "analise_corpo_tem_tattoo": true, "proxima_acao": "pergunta", "cobertura_suspeita": true, "resposta_match": "cobertura|cobrir|tatuagem" }
    },
    {
      "id": "VIS-04",
      "descricao": "Corpo com marcacao de brush (sem tattoo) → trata como posicao, NAO pergunta cobertura",
      "imagem": "corpo-brush-antebraco.jpg",
      "caption": "marquei mais ou menos onde",
      "dados_acumulados": { "descricao_curta": "leao", "estilo": "realismo" },
      "expected": { "analise_tipo": "corpo", "analise_corpo_tem_marcacao": true, "cobertura_suspeita_nao": true }
    },
    {
      "id": "VIS-05",
      "descricao": "Foto ambigua → bot pergunta sutilmente o que e",
      "imagem": "ambigua.jpg",
      "caption": "olha",
      "dados_acumulados": {},
      "expected": { "proxima_acao": "pergunta" }
    }
  ]
}
```

- [ ] **Step 2: Document the required photo assets (human step)**

Crie `tests/agent/_fixtures/images/README.md`:

```markdown
# Fixtures de imagem — eval de visão (tattoo-vision.eval.mjs)

O eval semântico precisa de **fotos reais** (o modelo precisa ver pele/tattoo de verdade).
Dropar nesta pasta, com EXATAMENTE estes nomes (referenciados em `scenarios-visao.json`):

- `referencia-rosa.jpg` — print/foto de uma arte de referência (ex.: rosa fineline).
- `corpo-limpo-antebraco.jpg` — antebraço com pele limpa, sem tattoo.
- `corpo-com-tattoo-antebraco.jpg` — antebraço com uma tatuagem existente bem visível.
- `corpo-brush-antebraco.jpg` — antebraço limpo com um rabisco de caneta/brush (marcação de posição).
- `ambigua.jpg` — foto onde não dá pra cravar se é referência ou corpo.

JPG ou PNG, <2MB cada (vão como base64 `detail:'low'`). Fotos faltando → o cenário é **pulado** (não quebra).
Não commitar fotos com rosto/dados pessoais identificáveis.
```

- [ ] **Step 3: Write the eval harness**

Crie `tests/agent/tattoo-vision.eval.mjs`:

```js
// Eval multimodal do TattooAgent — visao em fotos reais (referencia/corpo/cover-up).
// Cenarios cujo arquivo de imagem nao existe sao PULADOS (nao quebram CI sem fotos).
//
// Run: OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) \
//      node --test tests/agent/tattoo-vision.eval.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { runTattooAgent } from '../../functions/api/agent/agents/tattoo.js';
import { TattooOutputSchema } from '../../functions/api/agent/agents/tattoo-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { scenarios } = JSON.parse(readFileSync(join(__dirname, '_fixtures', 'scenarios-visao.json'), 'utf8'));
const IMAGES_DIR = join(__dirname, '_fixtures', 'images');

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY ausente — eval de visao nao pode rodar');
  process.exit(1);
}

const FAKE_TENANT = {
  id: 'tenant-eval', nome_estudio: 'Estudio Eval',
  config_agente: { aceita_cobertura: true },
  gatilhos_handoff: [], faqs: [], fewshots: [],
};

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

for (const sc of scenarios) {
  test(`${sc.id} — ${sc.descricao}`, async (t) => {
    const imgPath = join(IMAGES_DIR, sc.imagem);
    if (!existsSync(imgPath)) {
      t.skip(`fixture ausente: ${sc.imagem} (ver _fixtures/images/README.md)`);
      return;
    }
    const base64 = readFileSync(imgPath).toString('base64');
    const mimetype = MIME[extname(sc.imagem).toLowerCase()] || 'image/jpeg';

    const conversa = {
      id: `conv-${sc.id}`, telefone: '+5511900000000', estado_agente: 'coletando_tattoo',
      dados_coletados: sc.dados_acumulados || {}, dados_cadastro: {},
    };
    const out = await runTattooAgent({
      env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
      tenant: FAKE_TENANT, conversa, clientContext: {},
      mensagem: sc.caption || '',
      historico: [],
      imagens: [{ base64, mimetype, msgRowId: 1 }],
    });

    const parsed = TattooOutputSchema.safeParse(out);
    assert.equal(parsed.success, true, `${sc.id}: schema invalido — ${parsed.error?.issues?.[0]?.message || ''}`);
    assert.ok(Array.isArray(out.analise_imagens) && out.analise_imagens.length >= 1,
      `${sc.id}: analise_imagens deve ter >=1 entrada`);

    const a0 = out.analise_imagens[0];
    const e = sc.expected || {};
    if (e.analise_tipo) {
      assert.equal(a0.tipo, e.analise_tipo, `${sc.id}: tipo esperado=${e.analise_tipo} got=${a0.tipo}`);
    }
    if (e.analise_corpo_tem_tattoo !== undefined) {
      assert.equal(a0.corpo_tem_tattoo, e.analise_corpo_tem_tattoo, `${sc.id}: corpo_tem_tattoo`);
    }
    if (e.analise_corpo_tem_marcacao !== undefined) {
      assert.equal(a0.corpo_tem_marcacao, e.analise_corpo_tem_marcacao, `${sc.id}: corpo_tem_marcacao`);
    }
    if (e.proxima_acao) {
      assert.equal(out.proxima_acao, e.proxima_acao, `${sc.id}: proxima_acao esperado=${e.proxima_acao} got=${out.proxima_acao}`);
    }
    if (e.cobertura_suspeita === true) {
      assert.equal(out.cobertura_suspeita, true, `${sc.id}: esperava cobertura_suspeita=true`);
    }
    if (e.cobertura_suspeita_nao === true) {
      assert.notEqual(out.cobertura_suspeita, true, `${sc.id}: NAO devia suspeitar cobertura (marcacao de brush)`);
    }
    if (e.resposta_match) {
      assert.match(out.resposta_cliente, new RegExp(e.resposta_match, 'i'), `${sc.id}: resposta_cliente devia casar /${e.resposta_match}/i`);
    }
    if (e.resposta_nao_match) {
      assert.doesNotMatch(out.resposta_cliente, new RegExp(e.resposta_nao_match, 'i'), `${sc.id}: resposta NAO devia re-pedir foto (/${e.resposta_nao_match}/i)`);
    }
  });
}
```

- [ ] **Step 4: Add the npm script**

Em `package.json`, no bloco `scripts`, adicione após `eval:proposta`:

```json
    "eval:tattoo-vision": "node --test tests/agent/tattoo-vision.eval.mjs",
```

- [ ] **Step 5: Verify the harness runs (skip-when-absent path)**

Sem dropar fotos ainda, rode:

Run: `OPENAI_API_KEY=stub node --test tests/agent/tattoo-vision.eval.mjs`
Expected: todos os 5 cenários reportam **skipped** (fixtures ausentes) — harness não quebra. (Se `OPENAI_API_KEY` não estiver setado, o harness sai com erro proposital antes; por isso o `stub`.)

- [ ] **Step 6: Run the real eval (após o Leandro dropar as 5 fotos)**

Drop as 5 fotos em `tests/agent/_fixtures/images/` (nomes do README), então:

Run: `OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) node --test tests/agent/tattoo-vision.eval.mjs`
Expected: VIS-01..05 passam (≥4/5 aceitável p/ eval semântico; VIS-03 cover-up e VIS-04 brush são os críticos — ambos devem passar). Se falhar, iterar no R4 (Task B1) — NÃO afrouxar a assertion.

- [ ] **Step 7: Commit**

```bash
git add tests/agent/tattoo-vision.eval.mjs tests/agent/_fixtures/scenarios-visao.json tests/agent/_fixtures/images/README.md package.json
git commit -m "test(eval): harness multimodal de visao do TattooAgent (cover-up/brush/ambiguo)"
```

> Nota: as fotos reais (`*.jpg`) são assets do Leandro. Decidir no PR se entram no repo (sem rosto/dados) ou ficam só local + `.gitignore`.

---

## Verificação final (antes do PR)

- [ ] `npm test` — suíte completa verde.
- [ ] `node --test tests/agent/tattoo-vision.eval.mjs` com as fotos reais — cover-up (VIS-03) e brush (VIS-04) passam.
- [ ] Migration `set_descricao_visual` aplicada em prod **antes** do deploy do Pages.
- [ ] Smoke E2E manual (pós-deploy): conversa real → manda referência (bot comenta, não re-pede) → foto do braço limpo (coleta normal) → foto do braço com tattoo (bot pergunta cobertura sutilmente). Conferir `message.descricao_visual` gravado nas refs (query por `session_id`).
- [ ] `/dod` antes de abrir PR.

---

## Spec Coverage (self-review)

| Requisito do spec | Task |
|---|---|
| Imagens chegam ao modelo (pipeline→route→tattoo) | A2, A3, A4 |
| Bot vê/comenta referência e para de re-pedir | A2 + B1 (R4) + VIS-01 |
| Classificação ref-vs-corpo pelo modelo | A1 (schema), A5 (consumo), B1 (R4) |
| Fallback heurístico quando visão falha | A5 (Cenário H), fallbacks.js (A1) |
| `incerto` → pergunta / rota como ref, nunca dropa | A5 (Cenário G), B1 (R4) |
| Cover-up: tattoo existente + não mencionou → pergunta sutil | A1 (`corpo_tem_tattoo`/`cobertura_suspeita`), B1 (R4), VIS-03 |
| Marcação de brush ≠ tattoo existente | A1 (`corpo_tem_marcacao`), B1 (R4), VIS-04 |
| Schema `analise_imagens` completo na Fase A | A1 |
| `cobertura_suspeita` p/ telemetria | A1, A3 (surface), B1 (set no R4) |
| Memória: `descricao_visual` das refs (não corpo) | A6 (Cenários I/J) |
| Persistência targeted sem race (jsonb_set) | A6 (RPC) |
| Imagens só no turno de chegada, cap 4, `detail:'low'` | A2, A4 |
| Visão nunca trava o cliente (degrada) | route.js try/catch (existente) + A5 fallback + A6 try/catch |
| R4 reescrito + §4.2/§4.4 | B1 |
| Eval com fixtures de imagem | B2 |
| Recall (usar memória) | **fora de escopo** (próxima feature) — só captura aqui |
| Enviar descrição ao Telegram | **fora de escopo** (descartado) |
