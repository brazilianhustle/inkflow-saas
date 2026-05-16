# Fix Eval Harness — pipeline real Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir 4 bugs do eval harness (endpoint legacy, output descartado, esperado mascarado, vocabulário judge) para que a baseline TattooAgent meça o pipeline multi-agent real (`/api/agent/route`) com `proxima_acao` correto, e refazer a baseline 3/3.

**Architecture:** Refactor cirúrgico de `evals/inkflow-agent/_harness/run.mjs` — swap do endpoint `/api/tools/simular-conversa` → `/api/agent/route`, propagação de `estado_atual` + `dados_acumulados` entre turns, captura de `proxima_acao` real, fetch do tenant `db686ef2` (InkFlow Sub4 Test) do Supabase, e atualização do judge prompt `state-transition.txt` pro vocabulário canonical do schema (`handoff` + valores Proposta granulares). 3 JSONs de eval ficam intactos.

**Tech Stack:** Node 22 ESM (`node --env-file=...`), fetch nativo, Supabase REST, Anthropic Messages API, Cloudflare Pages Functions.

**Spec:** `docs/superpowers/specs/2026-05-15-fix-eval-harness-pipeline-real-design.md`

---

## File Structure

**Modify:**
- `evals/.env` — adicionar `SUPABASE_SERVICE_KEY` (valor do Bitwarden / `.env.production`)
- `evals/.env.example` — documentar `SUPABASE_SERVICE_KEY` + `ANTHROPIC_API_KEY` (já no .env mas faltando no .example)
- `evals/inkflow-agent/_harness/judge-prompts/state-transition.txt` — atualizar vocabulário canonical
- `evals/inkflow-agent/_harness/run.mjs` — refactor `playConv()`, `judgeConv()`, novo `fetchTenant()`, captura de `proxima_acao`/`estado_novo` no transcript
- `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md` — sobrescrito pelo `run-baseline.mjs` no Task 8; backup pré-fix criado no Task 7

**Create (backup snapshots):**
- `evals/inkflow-agent/report-pre-fix-2026-05-15.json` — snapshot do report atual
- `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline-pre-fix.md` — snapshot do baseline md atual

**Do NOT modify (decisão do spec):**
- `functions/api/agent/route.js` (já tem tudo)
- `functions/api/tools/simular-conversa.js` (segue existindo pro Studio UI)
- `functions/api/agent/agents/{tattoo,cadastro,proposta}.js` (schemas canonical inalterados)
- `functions/api/agent/router.js` (state transition map inalterado)
- `evals/inkflow-agent/_harness/rubric.mjs` (scoring inalterado)
- `evals/inkflow-agent/_harness/judge-prompts/{naturalidade-v2,manifesto-adherence}.txt` (irrelevantes ao bug)
- `evals/inkflow-agent/directed/tattoo/per-*/01-*.json` (vocabulário `"handoff"` já é canonical)
- `scripts/inkflow-agent/run-baseline.mjs` (wrapper inalterado)

---

## Task 1: Backup do report pré-fix

**Files:**
- Create: `evals/inkflow-agent/report-pre-fix-2026-05-15.json`
- Create: `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline-pre-fix.md`

Backup defensivo. Re-baseline final (Task 8) **sobrescreve** o `report.json` e o `2026-05-15-tattoo-baseline.md` (caminho hardcoded em `run-baseline.mjs:19`). Sem backup, perde-se evidência empírica dos bugs originais.

- [ ] **Step 1: Copiar `report.json` atual pra backup**

Run:
```bash
cp evals/inkflow-agent/report.json evals/inkflow-agent/report-pre-fix-2026-05-15.json
```

Expected: novo arquivo `report-pre-fix-2026-05-15.json` criado com mesmo conteúdo de `report.json`.

- [ ] **Step 2: Copiar baseline report MD atual pra backup**

Run:
```bash
cp docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md docs/inkflow-agent/reports/2026-05-15-tattoo-baseline-pre-fix.md
```

Expected: novo arquivo `2026-05-15-tattoo-baseline-pre-fix.md` com mesmo conteúdo.

- [ ] **Step 3: Confirmar backups via diff**

Run:
```bash
diff evals/inkflow-agent/report.json evals/inkflow-agent/report-pre-fix-2026-05-15.json && echo "OK json identico"
diff docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md docs/inkflow-agent/reports/2026-05-15-tattoo-baseline-pre-fix.md && echo "OK md identico"
```

Expected: `OK json identico` e `OK md identico` impressos. Sem output de diff (arquivos iguais).

- [ ] **Step 4: Commit**

```bash
git add evals/inkflow-agent/report-pre-fix-2026-05-15.json docs/inkflow-agent/reports/2026-05-15-tattoo-baseline-pre-fix.md
git commit -m "$(cat <<'EOF'
chore(eval): backup baseline pre-fix-harness

Snapshot do report.json + baseline MD antes do re-baseline pos-fix.
Re-run sobrescreve esses paths (run-baseline.mjs:19 hardcoded em
2026-05-15-tattoo-baseline.md). Backup preserva evidencia empirica
dos bugs originais (state_transition 3/3 fail, naturalidade 2.6).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Adicionar `SUPABASE_SERVICE_KEY` ao `evals/.env` + atualizar `.env.example`

**Files:**
- Modify: `evals/.env` (não-tracked, fora do git)
- Modify: `evals/.env.example`

Variavel necessaria pro `fetchTenant()` chamar Supabase REST. Valor existe em `.env.production` na raiz do projeto.

- [ ] **Step 1: Copiar valor de SUPABASE_SERVICE_KEY do `.env.production`**

Run:
```bash
grep "^SUPABASE_SERVICE_KEY=" /Users/brazilianhustler/Documents/inkflow-saas/.env.production
```

Expected: linha `SUPABASE_SERVICE_KEY=eyJ...` (JWT). Copiar valor completo (sem o prefixo `SUPABASE_SERVICE_KEY=`).

- [ ] **Step 2: Adicionar ao `evals/.env`**

Editar manualmente (não commitar — `.env` é gitignored). Anexar ao fim do arquivo:

```bash
echo "" >> evals/.env
echo "# Service key Supabase pra fetch tenant config (Sub 1.A fix harness)" >> evals/.env
echo "SUPABASE_SERVICE_KEY=<COLE_VALOR_DO_STEP_1>" >> evals/.env
```

Expected: linhas adicionadas no final do `evals/.env`.

- [ ] **Step 3: Validar que a var carrega**

Run:
```bash
node --env-file=evals/.env -e 'console.log("SUPABASE_SERVICE_KEY length:", (process.env.SUPABASE_SERVICE_KEY || "").length)'
```

Expected: `SUPABASE_SERVICE_KEY length: 200+` (JWT real é ~200-300 chars). Se sair `0`, var não está sendo carregada — debugar.

- [ ] **Step 4: Atualizar `evals/.env.example` com SUPABASE_SERVICE_KEY + ANTHROPIC_API_KEY**

Editar `evals/.env.example`. Localizar bloco `# Opcionais` no fim do arquivo. ADICIONAR (antes ou após — não substituir o existente):

```bash
# Service key Supabase pra fetch tenant config (eval harness post Sub 1.A fix)
# Valor: o mesmo do .env.production na raiz. Pega via `bws secret get ...` ou copy.
SUPABASE_SERVICE_KEY=

# Anthropic key — usada pelo persona classifier (Sub 1.A) e pelo judge harness
# (Claude Haiku 4.5 default em _harness/run.mjs:34).
ANTHROPIC_API_KEY=
```

- [ ] **Step 5: Confirmar `.env` continua fora do git**

Run:
```bash
git check-ignore -v evals/.env
```

Expected: linha tipo `.gitignore:N:evals/.env	evals/.env` confirmando que está ignorado.

- [ ] **Step 6: Commit (só `.env.example`, `.env` fica fora)**

```bash
git add evals/.env.example
git commit -m "$(cat <<'EOF'
chore(eval): doc SUPABASE_SERVICE_KEY + ANTHROPIC_API_KEY em .env.example

SUPABASE_SERVICE_KEY: nova var pro fetchTenant() do harness post Sub 1.A
fix (carrega config real do tenant prod em vez de stub do route.js:275).
ANTHROPIC_API_KEY: ja era usada no run.mjs:33 mas faltava documentar.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Atualizar judge prompt `state-transition.txt` (vocabulário canonical)

**Files:**
- Modify: `evals/inkflow-agent/_harness/judge-prompts/state-transition.txt`

Substituir vocabulário antigo (`enviar_orcamento_tatuador` não existe no schema) pelo canonical real dos enum Zod dos agents.

- [ ] **Step 1: Substituir conteúdo completo do arquivo**

Substituir todo o conteúdo de `evals/inkflow-agent/_harness/judge-prompts/state-transition.txt` por:

```text
Você é avaliador de transição de estado em multi-agent system. Cada turn do agent emite `proxima_acao` no JSON output. Sua tarefa é julgar se a `proxima_acao` é consistente com o estado conversacional + o conteúdo da conversa.

Estados possíveis (TattooAgent):
- `coletando_tattoo`: bot está coletando os 4 OBR (descricao, local, altura, estilo)
- `aguardando_foto`: bot pediu foto, espera resposta

Estados possíveis (CadastroAgent):
- `coletando_cadastro`: bot coleta nome + data_nascimento

Estados possíveis (PropostaAgent):
- `propondo_valor`: bot enviou valor, espera resposta
- `aguardando_decisao_desconto`: cliente pediu desconto, tatuador foi consultado
- `escolhendo_horario`: cliente aceitou, está escolhendo slot
- `aguardando_sinal`: agendamento ok, espera link de sinal ser pago

Valores válidos de `proxima_acao` (canonical Zod enum dos agents):

TattooAgent + CadastroAgent emitem:
- `pergunta`: bot pergunta info ao cliente
- `handoff`: handoff pro próximo agent no fluxo
  (TattooAgent: handoff → estado='cadastro', via router.js)
  (CadastroAgent: handoff → estado='aguardando_tatuador', via router.js)
- `enviar_portfolio`: bot envia URLs de portfolio (intent transversal)
- `erro`: caso de erro educado (trigger handoff sem coleta)

PropostaAgent emite:
- `pergunta`: bot pergunta info ao cliente
- `oferecendo_horario`: bot mostra slots disponíveis
- `reservar_horario`: bot tem slot escolhido, reserva via tool
- `pediu_desconto`: cliente pediu desconto, escala pro tatuador via tool
- `adiou`: cliente quer pensar — sai sem fechar
- `reagendamento`: cliente pede mudar agendamento
- `cliente_agressivo`: handoff manual por tom hostil
- `enviar_portfolio`: bot envia URLs de portfolio (intent transversal)

Tarefa: dada a transcrição da conversa + estado_atual + output do agent (resposta_cliente + proxima_acao REAL retornada pelo bot no último turn), julgue se a proxima_acao é consistente.

- 1 = transição faz sentido pro estado + conteúdo
- 0 = transição errada (ex: bot ainda em `coletando_tattoo` com OBR vazio mas emitiu `handoff`)

Retorne SOMENTE JSON:
{"s1_state_transition_ok": <0|1>, "esperado_seria": "<proxima_acao que seria certa, se 0>", "razao": "<1 frase>"}
```

- [ ] **Step 2: Validar enum dos agents vs prompt**

Run:
```bash
grep "z.enum" functions/api/agent/agents/tattoo.js functions/api/agent/agents/cadastro.js
grep -A 12 "PROXIMA_ACAO_VALUES = " functions/api/agent/agents/proposta.js
```

Expected:
- tattoo + cadastro: `proxima_acao: z.enum(['pergunta', 'handoff', 'enviar_portfolio', 'erro'])`
- proposta: 8 valores no array (pergunta, oferecendo_horario, reservar_horario, pediu_desconto, adiou, reagendamento, cliente_agressivo, enviar_portfolio)

Confirmar 1-a-1 que o prompt atualizado lista EXATAMENTE esses valores (sem inventar nem esquecer).

- [ ] **Step 3: Commit**

```bash
git add evals/inkflow-agent/_harness/judge-prompts/state-transition.txt
git commit -m "$(cat <<'EOF'
fix(eval): judge state-transition vocabulario canonical schema-aligned

Antes: judge listava 'enviar_orcamento_tatuador' que NUNCA existiu nos
schemas Zod dos agents. Schemas reais (tattoo.js:48, cadastro.js:41,
proposta.js:17-26):
- TattooAgent + CadastroAgent: ['pergunta', 'handoff', 'enviar_portfolio', 'erro']
- PropostaAgent: 8 valores granulares (pergunta, oferecendo_horario, etc)

Agora prompt lista valores canonical exatos de cada agent + adiciona
nota sobre handoff via router.js (tattoo→cadastro, cadastro→aguardando_tatuador).

Bug origem: judge nascido com vocabulario de design proposto, nunca
refletiu schema implementado. Causa raiz do state_transition 3/3 fail
na baseline 2026-05-15 (combinado com run.mjs:105 passar 'handoff'
expected em vez do output real).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implementar `fetchTenant()` em `run.mjs`

**Files:**
- Modify: `evals/inkflow-agent/_harness/run.mjs` (adicionar helper + chamar antes do loop)

- [ ] **Step 1: Adicionar constants Supabase logo após o bloco de env vars existentes**

Editar `evals/inkflow-agent/_harness/run.mjs`. Localizar bloco linhas 28-34:

```js
const BASE_URL = process.env.BASE_URL || 'https://inkflowbrasil.com';
const EVAL_SECRET = process.env.EVAL_SECRET;
const BEARER = process.env.ADMIN_BEARER;
const TENANT_ID = process.env.TENANT_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const JUDGE_MODEL = process.env.JUDGE_MODEL || 'claude-haiku-4-5-20251001';
```

Adicionar logo abaixo:

```js
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
```

- [ ] **Step 2: Adicionar função `fetchTenant()`**

Após `parseArgs()` e antes de `loadJudgePrompt()`, adicionar:

```js
async function fetchTenant(tenantId) {
  if (!SUPABASE_KEY) {
    throw new Error('SUPABASE_SERVICE_KEY missing em evals/.env — adicione a variavel pra harness puxar config real do tenant.');
  }
  const fields = 'id,nome_agente,nome_estudio,plano,faq_texto,config_precificacao,' +
                 'config_agente,horario_funcionamento,duracao_sessao_padrao_h,' +
                 'sinal_percentual,gatilhos_handoff,portfolio_urls,modo_atendimento';
  const url = `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=${fields}`;
  const r = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`fetchTenant http ${r.status}: ${txt.slice(0, 200)}`);
  }
  const arr = await r.json();
  if (!arr.length) throw new Error(`fetchTenant: tenant ${tenantId} nao encontrado`);
  return arr[0];
}
```

- [ ] **Step 3: Smoke test do `fetchTenant()` isolado**

Run:
```bash
node --env-file=evals/.env -e "
import('./evals/inkflow-agent/_harness/run.mjs').catch(()=>{}); // suprime main()
import('./evals/inkflow-agent/_harness/run.mjs').then(async (m) => {
  console.log('Cannot import fetchTenant directly — main() roda ao import.');
});
"
```

Smoke test alternativo (mais simples — testa direto a chamada Supabase):

```bash
node --env-file=evals/.env -e "
const SB_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const TENANT_ID = process.env.TENANT_ID;
fetch(\`\${SB_URL}/rest/v1/tenants?id=eq.\${TENANT_ID}&select=id,nome_estudio,plano,config_agente,gatilhos_handoff\`, {
  headers: { apikey: SB_KEY, Authorization: \`Bearer \${SB_KEY}\` }
}).then(r => r.json()).then(arr => {
  if (!arr.length) { console.error('FAIL: tenant nao encontrado'); process.exit(1); }
  const t = arr[0];
  console.log('OK fetchTenant:', { id: t.id, nome: t.nome_estudio, plano: t.plano, has_config: !!t.config_agente, gatilhos: (t.gatilhos_handoff||[]).length });
});
"
```

Expected: `OK fetchTenant: { id: 'db686ef2-...', nome: 'InkFlow Sub4 Test' or similar, plano: '...', has_config: true, gatilhos: N }`.

Se 401/403: `SUPABASE_SERVICE_KEY` errada/expirada. Se array vazio: TENANT_ID errado.

- [ ] **Step 4: Modificar `main()` pra chamar `fetchTenant()` antes do loop**

Localizar `main()` (linha 133-168). Substituir o trecho de loop de evals (linhas 147-160) modificando o início. Especificamente, ANTES do `for (const conv of convs)`, adicionar:

```js
  // Sub 1.A fix harness: fetch tenant real do Supabase pra passar config no payload
  // do /api/agent/route (que aceita body.tenant override do stub default).
  let tenantResolved;
  try {
    tenantResolved = await fetchTenant(TENANT_ID);
    console.log(`   Tenant: ${tenantResolved.nome_estudio || tenantResolved.id} (plano=${tenantResolved.plano})\n`);
  } catch (e) {
    console.error(`FATAL fetchTenant: ${e.message}`);
    process.exit(2);
  }
```

E na chamada `const played = await playConv(conv);` (linha 150), passar o tenant:

```js
const played = await playConv(conv, tenantResolved);
```

- [ ] **Step 5: Commit**

```bash
git add evals/inkflow-agent/_harness/run.mjs
git commit -m "$(cat <<'EOF'
feat(eval): fetchTenant() carrega config real do tenant antes do loop

Sub 1.A fix harness — etapa 1/4. Adiciona fetchTenant() que puxa
tenant prod (db686ef2) via Supabase REST com fields necessarios pro
prompt do agent (config_agente, gatilhos_handoff, faq_texto, etc).

main() chama fetchTenant() uma vez antes do loop e passa o objeto pro
playConv(). Hard-fail no inicio se SUPABASE_SERVICE_KEY missing ou
tenant nao encontrado (evita rodar evals contra stub silenciosamente).

playConv() ainda usa simular-conversa neste commit (refactor vem no
proximo). Tenant fica como param mas nao e usado ainda.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Refactor `playConv()` — swap endpoint + propagação estado/dados

**Files:**
- Modify: `evals/inkflow-agent/_harness/run.mjs`

Substituir chamada `/api/tools/simular-conversa` por `/api/agent/route`, propagar `estado_atual` e `dados_acumulados` entre turns, capturar `proxima_acao` e `estado_novo` no transcript estendido.

- [ ] **Step 1: Substituir `playConv()` completo**

Localizar linhas 76-93 e substituir por:

```js
const IMPLEMENTED_STATES = new Set([
  'coletando_tattoo',
  'cadastro',
  // PropostaAgent substates (Sub-3.2)
  'propondo_valor',
  'escolhendo_horario',
  'aguardando_sinal',
]);

async function playConv(conv, tenant) {
  const transcript = []; // { role, content, proxima_acao?, estado_novo?, dados_persistidos? }
  let estado_atual = conv.estado_atual || 'coletando_tattoo';
  let dados_acumulados = {};
  const run_ts = Date.now();
  const telefone = `eval-stub-${run_ts}`;

  for (let i = 0; i < (conv.turns_cliente || []).length; i++) {
    const turn = conv.turns_cliente[i];
    transcript.push({ role: 'user', content: turn });

    // historico que /api/agent/route espera: itens anteriores ao turn atual
    const historico = transcript
      .slice(0, -1) // exclui o user turn que acabamos de empilhar
      .map(m => ({ role: m.role, content: m.content }));

    const headers = { 'Content-Type': 'application/json' };
    // /api/agent/route e publico (Sub-1 PoC), nao precisa auth — header opcional
    // mantido pra compat futura.
    if (EVAL_SECRET) headers['X-Eval-Secret'] = EVAL_SECRET;

    let res;
    try {
      res = await fetch(`${BASE_URL}/api/agent/route`, {
        method: 'POST', headers,
        body: JSON.stringify({
          tenant_id: TENANT_ID,
          telefone,
          mensagem: turn,
          estado_atual,
          dados_acumulados,
          historico,
          tenant, // override do stub default do route.js:275
        }),
      });
    } catch (e) {
      return { transcript, error: `network: ${e?.message || e}` };
    }

    if (res.status === 501) {
      // estado terminal (aguardando_tatuador / lead_frio / fechado) — handoff bem-sucedido
      transcript.push({ role: 'system', content: '[terminal_handoff: estado nao-implementado]' });
      return { transcript, terminal_handoff: true, last_estado_atual: estado_atual };
    }
    if (!res.ok) {
      return { transcript, error: `http ${res.status}` };
    }
    const data = await res.json();
    if (!data.ok) {
      const detail = data.reason ? ` reason=${data.reason}` : '';
      return { transcript, error: `${data.error || 'unknown'}${detail}` };
    }

    transcript.push({
      role: 'assistant',
      content: data.resposta_cliente || '',
      proxima_acao: data.proxima_acao,
      estado_novo: data.estado_novo,
      dados_persistidos: data.dados_persistidos || {},
    });

    // Propaga estado/dados pro proximo turn
    estado_atual = data.estado_novo || estado_atual;
    dados_acumulados = { ...dados_acumulados, ...(data.dados_persistidos || {}) };

    // Se estado_novo virou nao-implementado, proximo turn vai retornar 501.
    // Break preventivo (terminal_handoff bem-sucedido no turn atual).
    if (!IMPLEMENTED_STATES.has(estado_atual)) {
      transcript.push({ role: 'system', content: `[terminal_handoff: estado_novo=${estado_atual} nao-implementado]` });
      return { transcript, terminal_handoff: true, last_estado_atual: estado_atual };
    }
  }

  return { transcript, last_estado_atual: estado_atual };
}
```

- [ ] **Step 2: Verificar que `buildTranscriptTxt()` continua funcionando com novo shape**

`buildTranscriptTxt()` em linhas 95-97 só lê `m.role` e `m.content`. Novo transcript ainda tem esses campos. **Não precisa mexer.**

Run pra confirmar via grep:
```bash
grep -A 3 "function buildTranscriptTxt" evals/inkflow-agent/_harness/run.mjs
```

Expected: função usa só `m.role` e `m.content`.

- [ ] **Step 3: Smoke 1 eval (per-001) — esperado funcionar mesmo sem fix do judge**

Run:
```bash
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=per-001
```

Expected:
- Output `🧪 InkFlow Agent harness — category=directed agent=tattoo persona=per-001`
- Linha `Tenant: InkFlow Sub4 Test (plano=...)`
- Linha `→ per-001-01-happy-path ...` seguida de `❌ falhou em: state_transition` (judge ainda usa input errado — Task 6 fixa) OU `✅` se naturalidade/manifesto subiram.
- Sem `FATAL` nem crash.
- Verificar `evals/inkflow-agent/report.json` agora tem `transcript_struct` no result? Não — o run.mjs atual não escreve transcript no report. Apenas usado pelo judge. Vai inspecionar via logs ou rodar com debug print.

Para inspecionar transcript real, adicionar print debug temporário no fim de `playConv()`:

```js
console.log('DEBUG transcript:', JSON.stringify(transcript.slice(-3), null, 2));
```

OU mais simples — usar Supabase pra ver `agent_turn_logs`:

```bash
node --env-file=evals/.env -e "
const SB_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
fetch(\`\${SB_URL}/rest/v1/agent_turn_logs?telefone=like.eval-stub-*&order=created_at.desc&limit=6&select=turn_index,agent_name,estado_agente,llm_output_parsed,invariant_passed\`, {
  headers: { apikey: SB_KEY, Authorization: \`Bearer \${SB_KEY}\` }
}).then(r => r.json()).then(arr => {
  arr.reverse(); // oldest first
  for (const r of arr) console.log(\`turn=\${r.turn_index} agent=\${r.agent_name} estado=\${r.estado_agente} proxima_acao=\${r.llm_output_parsed?.proxima_acao} invariant=\${r.invariant_passed}\`);
});
"
```

Expected: ~5-6 rows do per-001 com `proxima_acao` real (provavelmente `pergunta` nos turns 1-4 e `handoff` no turn 5). **Confirma que o orchestrator real está sendo chamado e retorna `proxima_acao` correto.**

Se sair vazio: filter wrong (use `telefone=ilike.eval-stub-*` ou `telefone=like.eval-stub%`). Se rows existirem mas `agent_turn_logs` tem colunas diferentes, ajustar select fields.

- [ ] **Step 4: Commit**

```bash
git add evals/inkflow-agent/_harness/run.mjs
git commit -m "$(cat <<'EOF'
feat(eval): playConv chama /api/agent/route + propaga estado/dados

Sub 1.A fix harness — etapa 2/4. Substitui POST /api/tools/simular-conversa
(Chat Completions raw, gpt-4o-mini sem schema) por POST /api/agent/route
(orchestrator multi-agent real com Zod schema e validator closure).

Mudancas em playConv:
- Endpoint: /api/tools/simular-conversa -> /api/agent/route
- Payload: messages array -> { mensagem, estado_atual, dados_acumulados,
  historico, tenant } pro shape esperado pelo runAgent
- Telefone: undefined -> `eval-stub-${run_ts}` filtravel em agent_turn_logs
- Estado/dados: descartados entre turns -> propagados via data.estado_novo
  e merge de data.dados_persistidos
- Transcript: { role, content } -> { role, content, proxima_acao,
  estado_novo, dados_persistidos } (assistant items)
- 501 (estado nao-implementado): tratado como terminal_handoff success,
  nao erro
- 500 invariant-violation: aborta com error + reason

buildTranscriptTxt() inalterado (so le role+content).

judgeConv() ainda passa expected.proxima_acao_esperada ao state-transition
(bug Dim C). Fixar no proximo commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Refactor `judgeConv()` — passar `proxima_acao` REAL ao state-transition judge

**Files:**
- Modify: `evals/inkflow-agent/_harness/run.mjs`

Fix do bug Dim C: substituir `expected.proxima_acao_esperada` (rótulo do JSON eval) por `proxima_acao` REAL do último turn do transcript.

- [ ] **Step 1: Substituir `judgeConv()`**

Localizar `judgeConv()` (linhas 99-113). Substituir por:

```js
async function judgeConv(conv, transcript, estado_atual) {
  const transcriptTxt = buildTranscriptTxt(transcript);

  // Bug Dim C fix: extrai proxima_acao REAL do ultimo turn assistant
  // (em vez de passar conv.expected.proxima_acao_esperada que e rotulo do
  // JSON eval, nao output do bot).
  const lastAssistant = [...transcript].reverse().find(m => m.role === 'assistant');
  const lastProximaAcao = lastAssistant?.proxima_acao || 'desconhecida';
  const lastEstadoNovo = lastAssistant?.estado_novo || estado_atual;

  const [natOut, manOut, stateOut] = await Promise.all([
    callAnthropicJudge(loadJudgePrompt('naturalidade-v2'), `Contexto: ${conv.titulo}\n\nTranscript:\n\n${transcriptTxt}\n\nAvalie.`),
    callAnthropicJudge(loadJudgePrompt('manifesto-adherence'), `Contexto: ${conv.titulo}\n\nTranscript:\n\n${transcriptTxt}\n\nAvalie cada principio aplicavel.`),
    callAnthropicJudge(loadJudgePrompt('state-transition'), `estado_atual: ${estado_atual} (estado inicial declarado no eval)\nestado_apos_ultimo_turn: ${lastEstadoNovo}\n\nTranscript:\n\n${transcriptTxt}\n\nUltima proxima_acao no output (REAL retornada pelo bot): ${lastProximaAcao}\n\nAvalie consistencia.`),
  ]);

  return {
    naturalidade: scoreNaturalidade(natOut),
    manifesto: scoreManifesto(manOut),
    state: scoreState(stateOut),
  };
}
```

- [ ] **Step 2: Smoke 1 eval (per-001) — confirmar state_transition agora reflete bot real**

Run:
```bash
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=per-001
```

Expected:
- Linha `→ per-001-01-happy-path ✅` OU `❌ falhou em: <só dimensions que falharam de verdade>`.
- Inspecionar `evals/inkflow-agent/report.json`:

```bash
node -e "
const r = require('./evals/inkflow-agent/report.json');
const first = r.results[0];
console.log('state:', JSON.stringify(first.scores?.state, null, 2));
console.log('fails:', first.pass?.fails);
"
```

Expected: `state.s1` agora reflete decisão real do bot. Se bot emitiu `handoff` no turn 5 e estado era `coletando_tattoo` com 4 OBR completos → judge provavelmente julga `s1=1` (PASS).

Se ainda falhar state_transition mas com `razao` que reflete output real (não "handoff prematuro" como antes) → judge tá funcionando, agora julga conteúdo real. PASS.

- [ ] **Step 3: Commit**

```bash
git add evals/inkflow-agent/_harness/run.mjs
git commit -m "$(cat <<'EOF'
fix(eval): judgeConv passa proxima_acao REAL ao state-transition judge

Sub 1.A fix harness — etapa 3/4. Bug Dim C original: run.mjs:105 passava
conv.expected?.proxima_acao_esperada (rotulo do JSON eval) ao judge com
label 'Ultima proxima_acao no output'. Judge nunca via output real do bot
— so via o que era esperado.

Fix: extrai proxima_acao do ultimo assistant turn no transcript (capturado
em playConv apos refactor de /api/agent/route) e passa REAL pro judge.
Tambem passa estado_apos_ultimo_turn pra dar contexto melhor da
transicao avaliada.

Tres dos quatro bugs do harness agora resolvidos (Dim A endpoint legacy,
Dim B output JSON descartado, Dim C esperado mascarado). Dim D ja
resolvido no commit anterior (vocabulario judge prompt).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Smoke test isolado — confirmar pipeline end-to-end (3 personas individuais)

**Files:** (sem mudanças — só execução)

Validação manual dos 3 evals individualmente antes do batch run. Pega regressões cedo.

- [ ] **Step 1: per-001 smoke**

Run:
```bash
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=per-001
cat evals/inkflow-agent/report.json | node -e "
const r = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
console.log('per-001:', r.results[0]?.status, '|', r.results[0]?.pass?.fails || '(passou)');
console.log('state:', r.results[0]?.scores?.state);
"
```

Expected: completa sem `FATAL`. Score state razão consistente com transcript.

- [ ] **Step 2: per-009 smoke**

Run:
```bash
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=per-009
cat evals/inkflow-agent/report.json | node -e "
const r = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
console.log('per-009:', r.results[0]?.status, '|', r.results[0]?.pass?.fails || '(passou)');
console.log('manifesto p_principles:', r.results[0]?.scores?.manifesto?.per_principle);
"
```

Expected: completa. Manifesto P6 provavelmente falha (FM-0001 modo consultor) — sinal real do bot, mantém.

- [ ] **Step 3: per-010 smoke**

Run:
```bash
node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=per-010
cat evals/inkflow-agent/report.json | node -e "
const r = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
console.log('per-010:', r.results[0]?.status, '|', r.results[0]?.pass?.fails || '(passou)');
console.log('naturalidade:', r.results[0]?.scores?.naturalidade);
"
```

Expected: completa. Naturalidade pode mudar significativamente vs pre-fix (orchestrator real vs Chat Completions raw).

- [ ] **Step 4: Verificar `agent_turn_logs` recebeu rows dos 3 smoke runs**

Run:
```bash
node --env-file=evals/.env -e "
const SB_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
fetch(\`\${SB_URL}/rest/v1/agent_turn_logs?telefone=like.eval-stub-*&order=created_at.desc&limit=20&select=turn_index,agent_name,estado_agente,invariant_passed\`, {
  headers: { apikey: SB_KEY, Authorization: \`Bearer \${SB_KEY}\` }
}).then(r => r.json()).then(arr => {
  console.log('rows:', arr.length);
  for (const r of arr) console.log(\`turn=\${r.turn_index} agent=\${r.agent_name} estado=\${r.estado_agente} invariant=\${r.invariant_passed}\`);
});
"
```

Expected: ~15+ rows recentes com `telefone LIKE eval-stub-*`. Confirma que pipeline real está rodando e persistindo telemetria.

- [ ] **Step 5: (Opcional) Limpar rows de smoke se quiser baseline limpa**

NÃO necessario funcionalmente, mas se quiser baseline sem ruído de smoke:

```bash
node --env-file=evals/.env -e "
const SB_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
fetch(\`\${SB_URL}/rest/v1/agent_turn_logs?telefone=like.eval-stub-*\`, {
  method: 'DELETE',
  headers: { apikey: SB_KEY, Authorization: \`Bearer \${SB_KEY}\`, Prefer: 'return=minimal' }
}).then(r => console.log('delete status:', r.status));
"
```

Expected: status 204.

- [ ] **Step 6: Não há commit nesse task** — smoke é validação, não muda código.

---

## Task 8: Re-baseline 3/3 via `npm run inkflow-agent:baseline`

**Files:**
- Sobrescrito: `evals/inkflow-agent/report.json`
- Sobrescrito: `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md`

Backup já feito no Task 1. Re-run completo dos 3 evals com harness corrigido.

- [ ] **Step 1: Re-baseline**

Run:
```bash
npm run inkflow-agent:baseline
```

Expected:
- Output `=== Rodando per-001 ===` → `=== Rodando per-009 ===` → `=== Rodando per-010 ===`
- Cada eval roda sem `FATAL`
- Output final: `Baseline report -> docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md`
- Exit code 0.

Se erro: re-tentar 1x (network flake). Se erro consistente, debugar antes de continuar.

- [ ] **Step 2: Diff de scores pre vs post**

Run:
```bash
node --env-file=evals/.env -e "
const pre = require('./evals/inkflow-agent/report-pre-fix-2026-05-15.json');
const post = require('./evals/inkflow-agent/report.json');
console.log('PRE-FIX:');
for (const r of pre.results) console.log(\`  \${r.id}: nat=\${r.scores?.naturalidade?.media} man=\${r.scores?.manifesto?.m1_manifesto_adherence?.toFixed(2)} state=\${r.scores?.state?.s1}\`);
console.log('POST-FIX:');
for (const r of post.results) console.log(\`  \${r.id}: nat=\${r.scores?.naturalidade?.media} man=\${r.scores?.manifesto?.m1_manifesto_adherence?.toFixed(2)} state=\${r.scores?.state?.s1}\`);
"
```

Expected: tabela com 3 evals em cada bloco. Comparar dimensões — esperado:
- state: pre `0,0,0` → post provavelmente `1,?,?` (per-001 PASS, per-009 e per-010 podem falhar legitimamente).
- naturalidade: pode subir, descer ou ficar igual — dado válido pro Sub 1.B.
- manifesto: PER-009 deve continuar baixo (FM-0001 cravado). Outros: dado novo.

- [ ] **Step 3: Commit do report e baseline MD novos**

```bash
git add evals/inkflow-agent/report.json docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md
git commit -m "$(cat <<'EOF'
chore(eval): re-baseline pos-fix-harness — scores reais

Re-run dos 3 evals directed (per-001/per-009/per-010) com harness
corrigido (4 bugs do Sub 1.A fix). Scores agora medem pipeline real
do orchestrator multi-agent (/api/agent/route), com proxima_acao
canonical do schema (handoff literal).

Pre-fix scores preservados em report-pre-fix-2026-05-15.json e
docs/inkflow-agent/reports/2026-05-15-tattoo-baseline-pre-fix.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Atualizar baseline report MD com seção "Re-baseline pós-fix"

**Files:**
- Modify: `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md`

`run-baseline.mjs:81-84` deixa "Próximos passos sugeridos pra Sub 1.B" vazio. Atualizar manualmente com diff pre vs post + conclusões revisadas.

- [ ] **Step 1: Adicionar seções pós-fix no MD**

Editar `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md`. APÓS o bloco `## per-010-01-conflito-tamanho` (último eval) e ANTES de `## Próximos passos sugeridos pra Sub 1.B`, inserir:

```markdown
## Re-baseline pós-fix-harness (2026-05-15 — Triagem #1)

Baseline original tinha 4 bugs do harness (ver `docs/superpowers/specs/2026-05-15-fix-eval-harness-pipeline-real-design.md`):
1. Endpoint legacy `/api/tools/simular-conversa` em vez de `/api/agent/route` (orchestrator real)
2. `playConv` descartava `proxima_acao` do JSON output do bot
3. judge state-transition recebia `expected.proxima_acao_esperada` mascarado como output real
4. judge prompt listava `enviar_orcamento_tatuador` que não existe no schema (canonical = `handoff`)

Esta seção compara scores pre-fix vs post-fix:

### Diff de scores

| eval | nat pre | nat post | man pre | man post | state pre | state post |
|------|---------|----------|---------|----------|-----------|-------------|
| per-001 | 3.4 | <PREENCHER> | 0.92 | <...> | 0 | <...> |
| per-009 | 3.8 | <PREENCHER> | 0.60 | <...> | 0 | <...> |
| per-010 | 2.6 | <PREENCHER> | 0.90 | <...> | 0 | <...> |

### Conclusões revisadas

(Preencher após inspeção dos novos scores. Esperado: state_transition agora reflete decisão real do bot; naturalidade/manifesto podem mudar significativamente porque agora testam orchestrator multi-agent em vez de Chat Completions raw.)

### Pré-fix snapshot preservado

- `evals/inkflow-agent/report-pre-fix-2026-05-15.json`
- `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline-pre-fix.md`
```

- [ ] **Step 2: Preencher scores reais do post-fix**

Substituir `<PREENCHER>` e `<...>` pelos valores reais da rodada pós-fix. Pegar via:

```bash
node --env-file=evals/.env -e "
const post = require('./evals/inkflow-agent/report.json');
for (const r of post.results) {
  console.log(\`| \${r.id.split('-')[0]}-\${r.id.split('-')[1]} | _ | \${r.scores?.naturalidade?.media} | _ | \${r.scores?.manifesto?.m1_manifesto_adherence?.toFixed(2)} | _ | \${r.scores?.state?.s1} |\`);
}
"
```

Copiar saída no lugar das linhas da tabela.

- [ ] **Step 3: Escrever 1 parágrafo de "Conclusões revisadas"**

Baseado nos scores reais e razões em `r.scores.state.razao` + `r.scores.manifesto.violations`. Foco em:
- O que mudou de fato vs o que foi artefato dos bugs do harness.
- Achados validos que entram no brainstorm Sub 1.B (FM-0001 ainda confirma? Naturalidade tendência?).
- Recomendação atualizada de ordem do brainstorm.

Manter conciso — 5-10 linhas. Substituir o `(Preencher após inspeção dos novos scores...)` placeholder.

- [ ] **Step 4: Commit**

```bash
git add docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md
git commit -m "$(cat <<'EOF'
docs(inkflow-agent): baseline report — secao re-baseline pos-fix

Sub 1.A fix harness — etapa 4/4 (final). Adiciona secao "Re-baseline
pos-fix-harness" comparando scores pre vs post + conclusoes revisadas
pra alimentar brainstorm Sub 1.B com sinais empiricos validos.

Pre-fix snapshot preservado em report-pre-fix-2026-05-15.json e
2026-05-15-tattoo-baseline-pre-fix.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Final review + push branch (sem PR ainda)

**Files:** (sem mudanças — review + push)

- [ ] **Step 1: Conferir log de commits da branch**

Run:
```bash
git log main..HEAD --oneline
```

Expected: 8-9 commits (depende se algum task gerou 2). Sequência lógica:
1. spec inicial (já commitado fora desse plan)
2. spec correção dev review (já commitado fora desse plan)
3. backup pre-fix
4. .env + .env.example
5. judge prompt vocabulário
6. fetchTenant()
7. playConv refactor
8. judgeConv refactor
9. re-baseline run
10. baseline MD update

- [ ] **Step 2: Testar suite completa (não-eval) pra garantir zero regressão**

Run:
```bash
npm test 2>&1 | tail -20
```

Expected: suite passa (sem regressões — fix do harness não toca código de produção).

Se a suite quebrar: debugar (não deveria — alterações ficam em `evals/`).

- [ ] **Step 3: Push da branch**

Run:
```bash
git push origin feat/inkflow-agent-phase-1-tattoo
```

Expected: branch atualizada no remote. NÃO criar PR automaticamente — Leandro decide quando.

- [ ] **Step 4: Reportar status final ao usuário**

Confirmar:
- 4 bugs do harness fixados (Dim A endpoint, Dim B output, Dim C esperado, Dim D vocabulário).
- Re-baseline rodada com scores reais.
- Diff documentado no baseline MD.
- Backup pre-fix preservado.
- Próximo passo recomendado: revisar baseline MD pós-fix + decidir se segue pra Triagem #2/3 ou já vai pro brainstorm Sub 1.B.

---

## Self-review checklist

**Spec coverage:**
- ✅ Dim A (endpoint legacy) → Task 5 swap pra `/api/agent/route`
- ✅ Dim B (output JSON descartado) → Task 5 transcript estendido captura `proxima_acao`
- ✅ Dim C (esperado mascarado) → Task 6 `judgeConv` passa real
- ✅ Dim D (vocabulário judge) → Task 3 update prompt
- ✅ Fetch tenant real → Task 4 `fetchTenant()`
- ✅ Propagação estado/dados → Task 5 dentro de `playConv`
- ✅ Re-baseline → Task 8
- ✅ Backup pre-fix → Task 1
- ✅ Baseline MD update → Task 9
- ✅ Edge cases 501 (terminal_handoff) + 500 (invariant) → Task 5
- ✅ telefone `eval-stub-${run_ts}` filtrável → Task 5
- ✅ Smoke tests intermediários → Task 4 step 3, Task 5 step 3, Task 6 step 2, Task 7

**Não-objetivos NÃO entram no plano:**
- ✅ JSONs intactos (sem task de normalizar — Task 5 nem toca)
- ✅ schema agents intacto (sem task)
- ✅ `simular-conversa.js` intacto (sem task)
- ✅ auth de `/api/agent/route` (sem task — backlog)

**Placeholder scan:**
- ✅ Nenhum "TBD", "TODO", "implement later" no plan body
- ⚠️ Task 9 tem `<PREENCHER>` e `<...>` na tabela MD — mas é placeholder DENTRO do documento gerado (não no plano), e o step seguinte é "preencher após rodar".
- ✅ Steps de commit têm mensagens completas (HEREDOC)
- ✅ Todos os steps com código têm o código completo (não "similar to Task N")

**Type consistency:**
- ✅ `fetchTenant` retorna objeto tenant — usado em `main()` e passado como `tenant` para `playConv(conv, tenant)`
- ✅ `playConv` retorna `{ transcript, error?, terminal_handoff?, last_estado_atual }` — usado em `main()` (verificar: linhas 150-154 do run.mjs atual lidam com `played.error`; novo retorno compatível)
- ✅ `judgeConv` parâmetro `estado_atual` é estado INICIAL do JSON eval (mesmo da versão antiga)
- ✅ `IMPLEMENTED_STATES` set definido em Task 5, usado em Task 5 (mesmo arquivo, mesmo escopo)
- ✅ Endpoint `/api/agent/route` shape de retorno (response 200) confirmado contra `route.js:222-234` (`{ ok, resposta_cliente, estado_novo, dados_persistidos, proxima_acao, ... }`)

Nenhum issue encontrado. Plano pronto pra execução.
