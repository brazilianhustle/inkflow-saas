---
title: "Fix Eval Harness — pipeline real (Triagem #1 → re-baseline)"
date: 2026-05-15
owner: Leandro
status: ready-to-plan
related:
  - docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md
  - evals/inkflow-agent/_harness/run.mjs
  - functions/api/agent/route.js
  - functions/api/tools/simular-conversa.js
---

# Fix Eval Harness — pipeline real

## Contexto

Baseline TattooAgent rodado em 2026-05-15 (pós Sub 1.A merge) retornou 3/3 FAIL nos evals directed (per-001, per-009, per-010). Triagem #1 do plano "3 triagens antes do brainstorm Sub 1.B" investigou o sinal `state_transition: 0` (3/3) e descobriu **bug do harness em 3 dimensões**, não bug do bot nem do judge.

### Bugs encontrados

**Dim A — Endpoint legacy:** `evals/inkflow-agent/_harness/run.mjs:83` chama `/api/tools/simular-conversa`. Esse endpoint é um chat preview legado: usa Chat Completions raw com `gpt-4o-mini` + `tool_choice: 'auto'` (linhas 202-213 do `simular-conversa.js`), **sem passar pelo orchestrator multi-agent**. Retorna apenas `data.reply` (texto). O orchestrator real está em `/api/agent/route` — retorna `{ ok, resposta_cliente, estado_novo, dados_persistidos, proxima_acao, agent_usado }` (header arquivo, linha 4).

**Dim B — Output JSON descartado:** `playConv()` em `run.mjs:88-91` só captura `data.reply` no histórico. Mesmo se o endpoint correto fosse chamado, o `proxima_acao` real seria jogado fora.

**Dim C — Esperado mascarado como real:** `run.mjs:105` passa `conv.expected?.proxima_acao_esperada` ao judge state-transition com rótulo "Ultima proxima_acao no output". Isso é o **esperado pelo eval JSON**, não o **retornado pelo bot**. Judge nunca vê output real.

**Dim D — Judge prompt vocabulário desalinhado do schema:** `_harness/judge-prompts/state-transition.txt:19` lista `enviar_orcamento_tatuador` como valor canonical, mas o schema real dos agents emite literal `'handoff'`:
- `tattoo.js:48` → `z.enum(['pergunta', 'handoff', 'enviar_portfolio', 'erro'])`
- `cadastro.js:41` → mesmo conjunto.
- `proposta.js:17-26` → vocabulário próprio mais granular (`oferecendo_horario`, `reservar_horario`, `pediu_desconto`, etc).
- `router.js:20` → state transition map usa chave `'handoff'`.

O judge tinha vocabulário de design proposto mas nunca refletiu o schema implementado. Os JSONs dos evals (`"proxima_acao_esperada": "handoff"`) estavam **corretos** — quem está desalinhado é o judge prompt.

**Comprovação:** `report.json:42-43` mostra judge respondendo coerentemente ao input recebido (`"emitiu handoff prematuro; deveria continuar com pergunta"`). Judge fez seu trabalho corretamente — bot real provavelmente emitiu `pergunta`, mas harness ocultou.

### Implicação ampliada

A baseline INTEIRA de 2026-05-15 está comprometida, não só state_transition:

| Dim | Score atual | Validade |
|-----|-------------|----------|
| State_transition | 0/0/0 | ❌ inválido (3 bugs acima) |
| Naturalidade | 3.4 / 3.8 / 2.6 | ⚠️ provavelmente válido mas testou endpoint fora do orchestrator |
| Manifesto | 0.92 / 0.60 / 0.90 | ⚠️ idem — prompt v2 É carregado, então sinal FM-0001 (PER-009 0.60) deve reproduzir |

FM-0001 (modo consultor não acionado) cravado pelo audit é gap arquitetural independente do endpoint — não cai. Resto da baseline precisa refazer com harness corrigido antes de virar input do brainstorm Sub 1.B.

## Decisões (brainstorm)

1. **Escopo:** Full swap — substituir endpoint completamente, refazer playConv, refazer baseline 3/3.
2. **Tenant config:** Fetch tenant real do Supabase (db686ef2-ca42-43e4-a831-808984d8d6c6, InkFlow Sub4 Test).
3. **Re-baseline:** Só os 3 evals atuais (per-001/per-009/per-010). Expansão de personas vira input Sub 1.B.
4. **Approach técnico:** Refactor cirúrgico do harness (Approach 1) — sem persistência DB conversa, sem reuso de `agent_turn_logs` no judge.

## Não-objetivos

- Expandir personas (PER-002, PER-007).
- Adicionar coluna `is_eval` em `agent_turn_logs`.
- Substituir `[FOTO: ...]` por sinal estruturado.
- Refactor para usar `agent_turn_logs` como fonte do judge.
- Tocar no Studio UI (`/api/tools/simular-conversa` continua existindo para o Studio).
- Renomear `'handoff'` → `'enviar_orcamento_tatuador'` no schema dos agents (refactor maior em tattoo.js/cadastro.js/router.js/prompts/testes — fora do escopo).
- Mexer em `_harness/rubric.mjs` (scoring inalterado).
- Adicionar auth em `/api/agent/route` (público hoje, PoC entrypoint — risco real mas fora do escopo).

## Arquitetura e data flow

```
[evals/.env]
  TENANT_ID = db686ef2-ca42-43e4-a831-808984d8d6c6
  SUPABASE_SERVICE_KEY = (NOVO)
  EVAL_SECRET, BASE_URL, ANTHROPIC_API_KEY (existentes)
        │
        ▼
[run.mjs]
  1. fetchTenant() ←── SUPABASE_URL/rest/v1/tenants?id=eq.TENANT_ID
       (one-shot no início; aborta hard se falhar)
  2. for each conv in directed/tattoo/per-*/:
       playConv(conv, tenant):
         estado_atual = conv.estado_atual (do JSON)
         dados_acumulados = {}
         historico = []
         for turn in conv.turns_cliente:
           POST /api/agent/route {
             tenant_id, telefone: `eval-stub-${run_ts}`,
             mensagem: turn,
             estado_atual,
             dados_acumulados,
             historico,
             tenant  // fetched
           }
           if (data.ok):
             historico.push({role:'user', content:turn})
             historico.push({role:'assistant', content:data.resposta_cliente})
             transcript_struct.push({
               turn_index, mensagem: turn,
               resposta_cliente: data.resposta_cliente,
               proxima_acao: data.proxima_acao,
               estado_novo: data.estado_novo,
               dados_persistidos: data.dados_persistidos
             })
             estado_atual = data.estado_novo
             dados_acumulados = {...dados_acumulados, ...data.dados_persistidos}
             if estado_atual not in IMPLEMENTED_STATES: break (terminal_handoff)
           else: abort with error
       judgeConv(conv, transcript_struct):
         lastTurn = transcript_struct.at(-1)
         pass lastTurn.proxima_acao REAL to judge state-transition
         (naturalidade + manifesto unchanged — recebem transcript de texto)
  3. report.json com transcript_struct anexado + exit code
```

**Diferenças vs hoje:**
- Endpoint: `/api/tools/simular-conversa` → `/api/agent/route`.
- Tenant: stub harness → real do Supabase.
- Estado/dados: descartados entre turns → propagados.
- proxima_acao: rótulo do eval JSON → REAL do response.
- Telefone: undefined → `eval-stub-${run_ts}` (filtrável em `agent_turn_logs`).

## Components

**3 arquivos editados, 1 atualizado (env), 1 documentado (env.example). 3 JSONs intactos.**

| Arquivo | Mudança | Linhas |
|---------|---------|--------|
| `evals/inkflow-agent/_harness/run.mjs` | Refactor `playConv()` (endpoint + payload + propagação estado/dados); refactor `judgeConv()` (passa proxima_acao real ao state-transition); novo `fetchTenant()` helper inline. | ~60 |
| `evals/inkflow-agent/_harness/judge-prompts/state-transition.txt` | Atualizar lista de "Valores válidos de proxima_acao" pra refletir schema real: trocar `enviar_orcamento_tatuador` → `handoff` (literal emitido por tattoo + cadastro); manter valores granulares do PropostaAgent (oferecendo_horario, reservar_horario, pediu_desconto, adiou, reagendamento, cliente_agressivo, enviar_portfolio); manter `erro` e `pergunta`. Adicionar nota: "tattoo + cadastro emitem `handoff` literal; route.js + router.js mapeiam pro próximo estado". | ~12 |
| `evals/.env` | Adicionar `SUPABASE_SERVICE_KEY=<...>` (puxar do Bitwarden Secrets Manager). | +1 |
| `evals/.env.example` | Documentar `SUPABASE_SERVICE_KEY` placeholder + comment ("pra eval harness fetch tenant"). | +2 |
| `evals/inkflow-agent/directed/tattoo/per-001/01-happy-path.json` | **NÃO MEXER** — `"proxima_acao_esperada": "handoff"` está correto, é o valor canonical do schema. | 0 |
| `evals/inkflow-agent/directed/tattoo/per-009/01-muda-decisao.json` | **NÃO MEXER** — idem. | 0 |
| `evals/inkflow-agent/directed/tattoo/per-010/01-conflito.json` | **NÃO MEXER** — idem. | 0 |

**fetchTenant() — implementação proposta:**

```js
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function fetchTenant(tenantId) {
  if (!SUPABASE_KEY) {
    throw new Error('SUPABASE_SERVICE_KEY missing em evals/.env');
  }
  const fields = 'id,nome_agente,nome_estudio,plano,faq_texto,config_precificacao,' +
                 'config_agente,horario_funcionamento,duracao_sessao_padrao_h,' +
                 'sinal_percentual,gatilhos_handoff,portfolio_urls,modo_atendimento';
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=${fields}`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!r.ok) throw new Error(`fetchTenant http ${r.status}`);
  const arr = await r.json();
  if (!arr.length) throw new Error(`tenant ${tenantId} não encontrado`);
  return arr[0];
}
```

**Não mexer:**
- `functions/api/agent/route.js` (já tem tudo).
- `functions/api/tools/simular-conversa.js` (segue existindo pro Studio UI).
- `functions/api/agent/agents/{tattoo,cadastro,proposta}.js` (schemas canonical inalterados).
- `functions/api/agent/router.js` (state transition map inalterado).
- `evals/inkflow-agent/_harness/rubric.mjs` (scoring inalterado).
- `evals/inkflow-agent/_harness/judge-prompts/naturalidade-v2.txt` + `manifesto-adherence.txt` (irrelevantes ao bug).
- `evals/inkflow-agent/directed/tattoo/per-*/01-*.json` (vocabulário já correto).

## Edge cases & error handling

| Cenário | Tratamento |
|---------|-----------|
| `/api/agent/route` retorna 501 (estado_novo propagado virou estado não-implementado tipo `aguardando_tatuador`/`lead_frio`/`fechado`) | **Terminal success.** Marca `terminal_handoff: true` no transcript, sai do loop limpo, eval continua pra judging. Esperado nos evals atuais quando bot emite `proxima_acao='handoff'` em `coletando_tattoo` → `router.js` mapeia pra `cadastro` (implementado, segue fluxo) ou pra estado terminal não-implementado. |
| `/api/agent/route` retorna 500 invariant-violation | Capturar `reason`, anexar ao result como `invariant_violation: {reason}`, **abortar eval com `status: 'error'`**. Não tenta julgar — é hard-fail de contrato (bug do agent). |
| HTTP timeout / network error | Sem retry. Reporta `status: 'error', error: 'network'`. |
| Tenant fetch fail (Supabase 500 ou tenant ID errado) | **Hard-fail no início** antes do loop. Mensagem clara: `"fetchTenant falhou: tenant {id} não encontrado / SUPABASE_SERVICE_KEY inválida"`. Evita rodar evals contra stub silenciosamente. |
| `data.proxima_acao` undefined no último turn (defensivo) | Judge state-transition recebe `'desconhecida'` literal. Comportamento já existente. |
| `agent_turn_logs` poluído com runs de eval | Filtro por `telefone LIKE 'eval-stub-%'` nas queries de observabilidade. TODO inline no `weekly-report` script. |
| `[FOTO: ...]` como mensagem (PER-001 turn 5, PER-010) | `/api/agent/route` trata como texto literal — comportamento idêntico ao `simular-conversa`, não é regressão. Vira input Sub 1.B+. |
| Tenant real `db686ef2` muda config durante eval run | `fetchTenant` é one-shot no início. Próximo run pega nova config. Aceitável. |

## Testing

### Validação durante implementação

1. **Smoke `fetchTenant`** isolado — `node -e "..."` ou REPL antes do refactor do `playConv`. Confirma `evals/.env` ok + tenant carrega com todos os campos esperados.
2. **Smoke `playConv` corrigido** — rodar 1 eval (per-001) com `--persona=per-001` antes dos 3. Verifica:
   - Endpoint correto chamado.
   - estado_atual/dados_acumulados propagam.
   - proxima_acao real aparece no transcript.
3. **Inspeção manual da response do último turn** — confirmar `proxima_acao` é `'handoff'` (canonical schema do TattooAgent) ou `'pergunta'` (não undefined nem valor fora do enum).

### Validação final (re-baseline)

Salvar pré-fix antes do re-run:

```bash
cp evals/inkflow-agent/report.json evals/inkflow-agent/report-pre-fix-2026-05-15.json
npm run inkflow-agent:baseline
# Compara report.json (post-fix) vs report-pre-fix-2026-05-15.json
```

### Critério de sucesso do FIX (não dos evals)

- Harness completa sem hard-fail antes do judging.
- `data.proxima_acao` REAL aparece em todo transcript no `report.json`.
- State_transition score reflete decisão real do bot.
- Naturalidade/manifesto agora rodam contra orchestrator real — scores podem subir, descer, ficar iguais. Qualquer resultado é dado válido pro Sub 1.B.

### Critério dos evals (separado, NÃO bloqueia merge do fix)

- Não exigir 3/3 PASS pós-fix.
- FM-0001 (PER-009) deve continuar falhando manifesto — gap arquitetural real.
- Naturalidade pode continuar baixa em PER-010 (input estranho `[FOTO: ...]`).
- O que importa: scores são **confiáveis** como input pro Sub 1.B.

## Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Tenant real `db686ef2` tem campos null que travam o agent | Baixa — tenant é o que rodou Sub-4.1/4.2 cutover, conhecido bom | fetchTenant inspeciona resposta, log dos campos críticos no início do harness |
| `agent_turn_logs` lotando com 15+ rows por run × N runs/dia | Baixa — runs manuais não são frequentes | Telefone `eval-stub-${run_ts}` filtrável; weekly-report exclui |
| Custo OpenAI subir vs simular-conversa | Médio — pipeline real chama agent SDK que pode ter múltiplos turns internos vs Chat Completions single-shot | Custo aceitável pra ferramenta de medição confiável. Estimativa: ~$0.05-0.10 por baseline run de 3 evals. Aceita YAGNI no caching agora |
| SUPABASE_SERVICE_KEY commitada por engano no `evals/.env` | Médio (.env tá no .gitignore mas o .example não) | `.example` só tem placeholder + comment, nunca valor real. Lint pre-commit se quiser, fora do escopo |
| Re-baseline post-fix vira 2-3 PASS sem brainstorm Sub 1.B precisar | Alta na real — algumas falhas eram do harness | É o sucesso desejado. Brainstorm Sub 1.B atacaria só os gaps reais (FM-0001) e não fake-signals |
| Endpoint `/api/agent/route` público (sem auth) — anyone burnar OpenAI budget | Médio — é PoC, mas hoje vive em prod | **Fora do escopo desse fix.** Backlog: adicionar `X-Eval-Secret` ou auth admin antes de virar dependência crítica de produção. Anotar como entry P1 no backlog ativo |
| Schema vocabulário evolui (algum agent muda `'handoff'` → outro nome) | Baixa | Judge prompt vira lint-target. Considerar geração automática de `state-transition.txt` a partir dos enum Zod no futuro — fora do escopo desse fix |

## Roteiro de execução (high-level — vira plan)

1. Adicionar `SUPABASE_SERVICE_KEY` ao `evals/.env` (puxar do Bitwarden).
2. Atualizar `evals/.env.example`.
3. Atualizar `_harness/judge-prompts/state-transition.txt` (vocabulário canonical).
4. Implementar `fetchTenant()` em `run.mjs`.
5. Refactor `playConv()` em `run.mjs`.
6. Refactor `judgeConv()` em `run.mjs` (só state-transition input change).
7. Smoke 1 eval (per-001) — manual inspect.
8. Backup `report.json` → `report-pre-fix-2026-05-15.json`.
9. Re-baseline 3/3 com harness corrigido.
10. Diff dos scores pre vs post, anotar achados.
11. Atualizar `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md` com seção "Re-baseline pós-fix-harness" + scores novos.
12. Commit + PR.

Detalhes de quebra-em-tasks vão pro plan (próximo passo via `writing-plans`).
