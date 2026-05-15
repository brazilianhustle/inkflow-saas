# Programa InkFlow Agent — Design

**Data:** 2026-05-15
**Branch alvo:** `feat/inkflow-agent-foundation` (worktree em `~/Documents/inkflow-saas-foundation/`)
**Status:** ready-to-review
**Tipo:** Programa cross-cutting (não feature isolada)
**Documento âncora:** `docs/manifesto-tatuador-bot.md` (fundação canônica cross-agent)

---

## Contexto

O InkFlow está pré-piloto (sem clientes pagantes). Cutover total do n8n para arquitetura multi-agent OpenAI Agents SDK em Cloudflare Workers foi mergeado (PR #65, commit `e88a79c`). Existe um eval harness funcional (`evals/`) cobrindo o agent Coleta v1 com 11 conversas canônicas, LLM-as-judge e rubric de 5 dimensões. Existe um manifesto canônico do tatuador-bot (`docs/manifesto-tatuador-bot.md`) com 6 princípios (P1-P6) cravados durante o brainstorm `refator-prompts-coleta-v2` (2026-05-13). Existem 20+ specs ativos nas últimas 2 semanas evidenciando ritmo intenso de iteração disciplinada.

A questão aberta: **como estruturar todo o processo de atendimento (4 agents customer-facing) com qualidade máxima e desempenho, antes de abrir beta** — sem urgência sacrificando qualidade.

Estudo profundo do estado atual revelou gaps estruturais:

- Sem catálogo formal de **personas/arquétipos de cliente final** — só 11 cenários canônicos sem taxonomia explícita
- Sem **failure catalog vivo cross-agent** — falhas dispersas em `OBS-N` de cada smoke-evidence, sem transferência entre agents
- Sem **telemetria de produção conversation-level** — tem `tool_calls_log` (tools) e `chat_messages` (mensagens), mas não captura sistemática de `prompt + output + contexto + custo + latência + sinal de qualidade` por turn
- Sem **cadência operacional formalizada** — quality reviews semanais/mensais não documentados
- Sem **métricas de produto** (taxa de fechamento, intervenção humana, NPS) — só métricas de bot
- Sem **quality program transversal** — manifesto cravado só em Coleta, demais agents (PropostaAgent existente, PortfolioAgent ausente) sem fundação canônica

O programa **InkFlow Agent** preenche esses gaps com framework cross-agent + execução priorizada agent-por-agent. **Prioridade: qualidade > urgência.**

## Goals

1. **Framework cross-agent transversal** — 5 pilares (Persona Library, Failure Catalog, Telemetria, Eval Governance, Cadência+Métricas) construído antes da execução por agent, garantindo consistência de tom e transferência de aprendizado entre os 4 agents customer-facing
2. **Manifesto vira fundação canônica de todos os agents** — não só Coleta. Linkagem obrigatória em `decisao.js` + `regras.js` de cada agent
3. **Telemetria 100% turn-level antes do beta** — sem isso, problema em produção é cego
4. **15 personas iniciais documentadas** cobrindo ~85% do tráfego esperado (happy path + indeciso + adversarial + edge cases)
5. **12+ failure modes históricos migrados** das OBS existentes para catálogo formal vivo
6. **Eval governance com 3 categorias** (regression CI, directed LLM-judge, red-team mensal), judge model separado do model under test, cap de custo declarado
7. **DoD por agent rigoroso** (8 itens) com gate explícito antes de avançar
8. **Sequência de execução priorizada**: TattooAgent → CadastroAgent → PropostaAgent → PortfolioAgent
9. **Beta abre apenas após** todos os 4 agents passarem DoD individual + flow end-to-end ter tom consistente comprovado

## Non-Goals

- Otimização de custo/latência LLM em escala (programa separado pós-piloto)
- Fine-tuning custom de modelos (não justifica antes de 50k+ conversations)
- Agents internos (admin panel, audit subagents do Sub-projeto 3) — fora do customer-facing
- Cliente recorrente / remarcação (P1 futuro, agent separado `ReatendimentoAgent`)
- Modo Exato (legado em deprecação após cutover)
- Internacionalização / outros idiomas
- Substituição de prompts existentes em massa — programa aplica gates sobre o que existe, refinos pontuais saem em specs próprios
- Marketing / aquisição de clientes — escopo é qualidade do bot, não funil de vendas

---

## Princípios operacionais

1. **Cross-agent first** — todo gap descoberto em um agent vira aprendizado catalogado para os outros. Failure modes não são "do TattooAgent", são "do bot".
2. **Telemetria antes de cliente** — não abre beta sem captura sistemática de prompt+output+contexto+custo+latência+sinal de qualidade por turn.
3. **Eval como contrato** — toda mudança de prompt passa por eval direcionado + regressão antes de merge. Vibe-check só pós-eval.
4. **Manifesto vive** — `docs/manifesto-tatuador-bot.md` é a constituição. Princípios podem ser adicionados/refinados, mas mudança vira commit explícito com motivação documentada.
5. **Failure catalog é cumulativo, nunca jogado fora** — falha resolvida vira regression test permanente.
6. **Métricas de produto > métricas de bot** — naturalidade 4.5/5 sem fechamento de orçamento não vale. Bot existe para converter lead em sinal pago.
7. **Persona-driven evals** — eval set evolui de cenários sintéticos para conversations reais conforme telemetria amadurece (3 fases declaradas).

---

## Arquitetura — 5 pilares cross-agent

```
                    ┌────────────────────────────────────┐
                    │   MANIFESTO (constituição viva)    │
                    │   docs/manifesto-tatuador-bot.md   │
                    │   P1-P6 + edge cases + tom         │
                    └────────────┬───────────────────────┘
                                 │ informa
                ┌────────────────┼────────────────┬────────────────┐
                ▼                ▼                ▼                ▼
        ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
        │  PILAR 1     │ │  PILAR 2     │ │  PILAR 3     │ │  PILAR 4     │
        │  Persona     │ │  Failure     │ │  Telemetria  │ │  Eval        │
        │  Library     │ │  Catalog     │ │  Produção    │ │  Governance  │
        └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
                │                │                │                │
                └────────────────┴────────┬───────┴────────────────┘
                                          ▼
                              ┌────────────────────────┐
                              │  PILAR 5 — Cadência    │
                              │  Operacional + Métricas│
                              │  daily/weekly/monthly  │
                              └────────────────────────┘
                                          │
                                          ▼
                          ┌───────────────────────────────────┐
                          │   EXECUÇÃO POR AGENT (priorizada) │
                          │   1. TattooAgent (em refator)     │
                          │   2. CadastroAgent (em refator)   │
                          │   3. PropostaAgent (existe, fundir│
                          │      ao manifesto)                │
                          │   4. PortfolioAgent (criar)       │
                          └───────────────────────────────────┘
```

---

## Pilar 1 — Persona Library

### Propósito

Taxonomia formal de arquétipos de cliente final. Sem isso, evals viram intuição pessoal. Com isso, cada eval, cada smoke test, cada conversa real fica mapeada a um arquétipo identificável — viabiliza análise cross-agent ("persona X falha em 80% dos handoffs do TattooAgent, mas 30% no PropostaAgent — investigar diferença").

### Localização

```
docs/inkflow-agent/
└── personas/
    ├── INDEX.md
    ├── _template.md
    ├── _taxonomy.md
    └── PER-NNN-<slug>.md
```

### Taxonomia — 5 dimensões cruzadas

| Dimensão | Valores |
|---|---|
| **Postura de decisão** | `decidido` / `indeciso` / `pesquisando` |
| **Familiaridade** | `primeira_vez` / `experiente` / `veterano_recorrente` |
| **Atitude emocional** | `ansioso` / `casual` / `agressivo` / `exigente` / `distante` / `deslumbrado` |
| **Complexidade do pedido** | `simples` / `medio` / `complexo` (cover-up, sequência, peça grande) |
| **Sensibilidade ao preço** | `aberto` / `sensivel` / `negociador` / `queima_preco` |

### Persona library inicial — 15 arquétipos

| ID | Nome | Postura | Familiaridade | Atitude | Justificativa |
|---|---|---|---|---|---|
| **PER-001** | Curioso primeira vez | decidido | primeira_vez | ansioso | Maioria do tráfego beta esperado — happy path |
| **PER-002** | Indeciso explorando | indeciso | primeira_vez | casual | Testa modo consultor (P6 manifesto) |
| **PER-003** | Pesquisador de orçamento | pesquisando | qualquer | distante | Só sondando preço — não fecha |
| **PER-004** | Cover-up complicado | decidido | experiente | ansioso | Caso técnico, foto ruim, contexto pesado |
| **PER-005** | Complemento de série | decidido | veterano_recorrente | exigente | Já é cliente, contexto histórico esperado |
| **PER-006** | Primeira-vez safe | decidido | primeira_vez | ansioso | Tatuagem pequena, simples — happy path 2 |
| **PER-007** | Negociador de preço | decidido | experiente | agressivo | Testa PropostaAgent (objeção desconto) |
| **PER-008** | Vago de propósito | resistente | qualquer | distante | Bot deve trigger handoff humano |
| **PER-009** | Indeciso eterno | indeciso | primeira_vez | ansioso | Manda 50 referências, marca-desmarca |
| **PER-010** | Contraditório | qualquer | qualquer | qualquer | "rosa pequena 25cm" — testa P1 manifesto |
| **PER-011** | Menor de idade | qualquer | primeira_vez | ansioso | Edge case legal/ético |
| **PER-012** | Cliente em surto | qualquer | qualquer | emocional | Sai do tom, mood swing |
| **PER-013** | Prompt injection | adversarial | n/a | n/a | Testa guardrails (já existe fixture `006_prompt_injection`) |
| **PER-014** | Estilo indisponível | decidido | qualquer | qualquer | Pede estilo que o tatuador não faz |
| **PER-015** | VIP recorrente | decidido | veterano_recorrente | casual | Flow encurtado (P1 futuro/já marcado backlog) |

> Lista inicial = hipótese. Personas evoluem via processo abaixo. Não é exaustivo — cobre ~85% do tráfego esperado.

### Template formal de persona

```yaml
---
id: PER-001
slug: curioso-primeira-vez
status: active
created: 2026-05-15
last_reviewed: 2026-05-15
owner: leandro
---

# Curioso primeira vez

## Resumo
Cliente que nunca tatuou. Tem ideia razoavelmente clara mas vocabulário leigo.
Ansioso, faz muitas perguntas básicas. Maioria do tráfego beta esperado.

## Dimensões
- Postura: decidido
- Familiaridade: primeira_vez
- Atitude: ansioso
- Complexidade: simples ou médio
- Sensibilidade preço: sensivel

## Linguagem típica (amostras reais ou plausíveis)
- "oii quero fazer minha primeira tattoo"
- "queria uma florzinha pequena no pulso"
- "dói muito?"
- "quanto sai mais ou menos?"
- "tem que marcar com antecedência?"

## Comportamento esperado do bot por agent/estado
- **TattooAgent (coletando_tattoo):** valida em 1 frase ("Massa, fineline fica top"),
  coleta 4 OBR sem soar formulário, oferece foto de local com leveza
- **CadastroAgent (coletando_cadastro):** comunicar próximo passo claro
  ("vou repassar pro tatuador, em breve te volto")
- **PropostaAgent (propondo_valor):** se cliente trava no preço, NÃO oferece desconto
  unilateral — trigger objeção pro tatuador via Telegram

## Eval cases mapeados
- `evals/inkflow-agent/directed/tattoo/per-001/*` (a criar)

## Failure modes que essa persona expõe historicamente
- [[FM-0003-bot-sugere-tamanho]]
- [[FM-0007-data-br-rejeitada]]

## Notas
Persona "padrão" — base do happy path. Toda regressão fundamental do happy path
deve ser testada contra essa persona primeiro.
```

### Processo de evolução

| Evento | Ação |
|---|---|
| Nova persona descoberta (smoke prod, conversa real, eval) | Cria `PER-NNN-slug.md` em `draft`, propõe no weekly review |
| Persona aprovada no weekly | Status → `active`, adiciona em INDEX, mapeia eval cases |
| Linguagem evolui (PT-BR muda, gírias novas) | Edita arquivo, registra em `## Histórico` no fim |
| 2 personas convergem | Funde, marca uma `archived` linkando substituta |
| Persona não aparece em 6+ meses de tráfego real | Marca `archived` (não deleta) |

---

## Pilar 2 — Failure Catalog

### Propósito

Taxonomia viva de falhas observadas. Hoje as falhas estão dispersas em `OBS-N` de cada `smoke-evidence/`. Sem catálogo central, falha que apareceu em TattooAgent não vira aprendizado pra PropostaAgent — perde-se transferência cross-agent.

### Localização

```
docs/inkflow-agent/
└── failures/
    ├── INDEX.md
    ├── _template.md
    ├── _taxonomy.md
    └── FM-NNNN-<slug>.md
```

### Taxonomia — 2 eixos

**Tipo de falha:**

| Tipo | Exemplo |
|---|---|
| `hallucination` | Bot inventa preço, agenda, política |
| `policy_violation` | Bot sugere tamanho (viola P1 manifesto), confronta cliente |
| `drift_persona` | Bot sai do tom (vira robô formal mid-conversa) |
| `format_error` | Output sem `?` em pergunta, mensagem-textão sem split |
| `state_error` | Bot transiciona pra estado errado |
| `data_error` | Schema rejeita input válido (data BR, telefone fmt) |
| `tool_error` | Tool falha + bot não comunica isso |
| `invariant_violation` | Output passa pelo invariante mas semanticamente errado |
| `latency` | Resposta >10s percebido pelo cliente |
| `cost` | Turn consome >X tokens sem justificativa |

**Camada onde manifesta:**

| Camada | Local de fix |
|---|---|
| `prompt` | `functions/_lib/prompts/coleta/<agent>/*.js` |
| `schema_invariant` | `functions/api/agent/agents/<agent>.js` (Zod + validador) |
| `pipeline` | `functions/_lib/whatsapp-pipeline.js` |
| `tool` | `functions/api/tools/*.js` |
| `provider` | LLM model issue (raro, pode levar à mudança de modelo) |
| `data` | Migration / schema Supabase |

### Template formal de failure entry

```yaml
---
id: FM-0003
slug: bot-sugere-tamanho-cm
status: fixed
type: policy_violation
layers: [prompt, schema_invariant]
agents_affected: [TattooAgent]
personas_exposing: [PER-001, PER-009, PER-010]
created: 2026-05-13
last_change: 2026-05-15
owner: leandro
manifesto_principle: P1
---

# FM-0003 — Bot sugere tamanho em cm

## Descrição
Bot oferecia ranges de tamanho ao cliente ("uns 5-8cm?", "leão 18cm fica encaixado").
Viola P1 do manifesto: tatuador decide proporção no dia, bot não sugere.

## Gatilho
Cliente diz "não sei o tamanho" OU manda descrição sem tamanho.
Bot, por few-shots antigos, propunha range.

## Impacto
- Cliente final: cria expectativa de tamanho que tatuador pode não honrar
- Tatuador: tem que desfazer expectativa no atendimento presencial (atrito)
- Business: percepção de bot "que decide", quebra autoridade do tatuador

## Diagnóstico (root cause)
Few-shots no `coleta/tattoo/few-shot.js` reforçavam comportamento.
Regra R6 de conflito mandava confrontar/propor range em vez de pedir foto.

## Contramedida
- Removidos few-shots problemáticos
- R6 reescrita pra pedir foto referência em conflito (sem confronto)
- R8 nova: "Bot NUNCA sugere tamanho"
- Invariante exige 4 OBR (descricao_curta, local_corpo, altura_cm, estilo)
  — tamanho_cm opcional

## Regression test
- Eval: `docs/superpowers/evals/2026-05-13-refator-prompts-coleta-v2.mjs` MAN-1, MAN-2, MAN-3
- Unit: `tests/integration/agents/tattoo.test.mjs` "invariante aceita handoff sem tamanho_cm"

## Eval gate
MAN-1, MAN-2, MAN-3 fazem parte do CI permanente (regression suite).

## Histórico
- 2026-05-13: descoberto via brainstorm Leandro, OBS no smoke prod cutover Sub-4.1
- 2026-05-13: spec refator-prompts-coleta-v2 criado
- 2026-05-15: contramedida em produção (assumindo merge do PR)
- 2026-05-15: status open → mitigated

## Notas
Princípio P1 do manifesto. Toda regressão futura deste failure mode
deve disparar review do manifesto (não só fix técnico).
```

### Workflow de status

```
       descoberto                                          mitigated
        │                                                       │
        ▼                                                       ▼
     [open] ──── contramedida em produção ──────────────► [mitigated]
        ▲                                                       │
        │                                                       │ regression test passa
        │ regressão                                             │ N ciclos (default: 4 weeks)
        │                                                       ▼
        └──────────────────── reabertura ◄─────────────────  [fixed]
                                                                │
                                                                │ failure obsoleto
                                                                │ (schema mudou)
                                                                ▼
                                                            [archived]
```

### Migração das OBS existentes (parte da Fase 0)

Tu já tem OBS-N em `.smoke-evidence/2026-05-13-smoke-prod-cutover/observations.md` + observations de smokes anteriores. Parte do trabalho inicial é migrar essas OBS pra failure catalog formal — cada OBS de prompt vira `FM-NNNN-*.md`. Estimativa: ~12-15 failures iniciais.

### Conexão Persona ↔ Failure ↔ Eval

```
Persona PER-NNN ─── expõe ────► Failure FM-NNNN
       │                            │
       │                            │
       └─── cobre via ─────► Eval case ◄──── gateia ─── Regression
                              (LLM-judge ou snapshot)
```

Cada falha tem:
- ≥1 persona que expõe (mapping bidirecional no INDEX)
- ≥1 eval que detecta (regression test permanente)
- 1 contramedida com camada explícita (`prompt` / `schema_invariant` / `pipeline` / `tool` / `data`)

Quando bug novo aparece em prod sem persona mapeada → cria persona nova **antes** de criar failure entry. Garante que catálogo de personas evolui com a realidade.

---

## Pilar 3 — Telemetria de Produção

### Propósito

Hoje tu tem `tool_calls_log` (tools) e `chat_messages` (mensagens trocadas), mas **não tem captura sistemática de prompt + output + contexto + custo + latência por turn**. Sem isso, quando bug aparece em prod, depende de ping ao tatuador pra reproduzir. Com isso, cada conversa real vira potencial eval case automaticamente + métricas reais começam a substituir intuição.

### Schema novo: `agent_turn_logs`

```sql
CREATE TABLE agent_turn_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  turn_index INT NOT NULL,                           -- 1-based ordem dentro da conversa

  -- WHO
  agent_name TEXT NOT NULL,                          -- tattoo / cadastro / proposta / portfolio
  agent_version TEXT NOT NULL,                       -- semver derivado dos prompts
  estado_agente TEXT NOT NULL,                       -- snapshot do estado no turn
  model TEXT NOT NULL,                               -- gpt-4o-mini / etc

  -- INPUT
  client_input_text TEXT,
  client_input_type TEXT,                            -- text / audio / image
  client_input_metadata JSONB,                       -- audio transcript, image description

  -- PROMPT/CONTEXT
  prompt_hash TEXT NOT NULL,                         -- SHA-256(prompt completo) — drift detection
  prompt_full TEXT,                                  -- texto completo (NULL após retention)
  context_metadata JSONB,                            -- { dados_persistidos snapshot, history_turns_n }

  -- OUTPUT
  llm_output_raw TEXT,                               -- bruto, antes do parse JSON
  llm_output_parsed JSONB,                           -- { resposta_cliente, dados_persistidos,
                                                     --   proxima_acao, tool_calls }
  baloes_count INT,                                  -- balões depois do split \n\n
  tool_calls JSONB,                                  -- [{ name, args, result, sucesso }]

  -- QUALITY SIGNALS
  invariant_passed BOOLEAN,
  invariant_failure_reason TEXT,
  persona_inferred TEXT,                             -- PER-NNN heurístico ou manual depois
  cliente_respondeu BOOLEAN,                         -- next turn existe?
  cliente_respondeu_dentro_de_segundos INT,
  tatuador_interviu BOOLEAN,                         -- handoff manual disparado?

  -- COST/PERF
  tokens_input INT,
  tokens_output INT,
  cost_usd NUMERIC(10,6),
  latency_total_ms INT,
  latency_llm_ms INT,
  latency_tools_ms INT,

  -- META
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_policy TEXT DEFAULT 'full_90d'           -- full_90d / metadata_only / archived
);

CREATE INDEX idx_atl_conversa     ON agent_turn_logs(conversa_id, turn_index);
CREATE INDEX idx_atl_agent_time   ON agent_turn_logs(agent_name, created_at DESC);
CREATE INDEX idx_atl_prompt_hash  ON agent_turn_logs(prompt_hash);
CREATE INDEX idx_atl_estado       ON agent_turn_logs(estado_agente);
CREATE INDEX idx_atl_persona      ON agent_turn_logs(persona_inferred) WHERE persona_inferred IS NOT NULL;

ALTER TABLE agent_turn_logs ENABLE ROW LEVEL SECURITY;
-- RLS: só admin reads, service_role writes (mesmo pattern de outras tabelas críticas)
```

### Integração com pipeline atual

Módulo novo: `functions/_lib/telemetry/agent-turn-logger.js`

```js
// fire-and-forget — nunca bloqueia o hot path do bot
export function logAgentTurn(ctx, env, payload) {
  ctx.waitUntil(_insertTurnLog(env, payload).catch(err => {
    console.warn('[telemetry] insert failed:', err.message);
  }));
}
```

Ponto de chamada single-source-of-truth: `functions/api/agent/route.js`, após resposta gerada, antes do `evoSend`. Cobre todos os agents porque todos passam por `route.js`.

### Privacy/PII + retention

| Fase | Retention | Justificativa |
|---|---|---|
| 0-90 dias | `full_90d` (texto completo do prompt + output) | Eval case curation, debugging real |
| 91-365 dias | `metadata_only` (hashes + tokens + métricas, texto removido) | Análise de tendência sem custo de armazenamento PII |
| 365+ dias | `archived` (só agregados em view materializada) | LGPD compliance, custo |

Cron job em `cron-worker/` faz a transição mensal: `retention-rotate-agent-logs`.

### Promoção logs → eval cases

Script `scripts/inkflow-agent/promote-logs-to-evals.mjs`:

```bash
# Extrai conversa real de PER-001 que falhou no weekly review → vira eval case
node scripts/inkflow-agent/promote-logs-to-evals.mjs \
  --conversa-id=abc-123 \
  --persona=PER-001 \
  --output=evals/inkflow-agent/directed/tattoo/per-001/auto_2026-05-15_handoff-sem-altura.json
```

Output: JSON no formato existente do eval harness (drop-in com `run.mjs`).

### Dashboards

**Fase imediata (1ª semana):** queries SQL no Supabase dashboard, 4 saved queries:
1. Distribuição de turns por agent × estado nas últimas 24h
2. Top failures de invariante por agent na última semana
3. Custo total agregado por dia × agent
4. Latência p50/p95 por agent

**Fase 2 (quando volume justificar):** Retool ou Streamlit lendo view materializada `daily_agent_metrics`. Não construir agora.

---

## Pilar 4 — Eval Governance

### 3 categorias declaradas

| Categoria | Quando roda | Custo | Failure = | Owner |
|---|---|---|---|---|
| **Regression suite** | CI cada PR | ~$0.01 | Bloqueia merge | CI automático |
| **Directed evals** (persona × agent, LLM-judge) | Pré-merge prompt change + weekly | ~$0.20-0.30/run | Bloqueia se persona core falha | Leandro |
| **Red-team / adversarial** | Mensal | ~$1.00/run | Gera failure entries + plano | Leandro |

### Estrutura de pastas

```
evals/
├── (legado fica como está: convs/, sub-projeto-2/, sub-projeto-3/, smoke-tests/)
└── inkflow-agent/                       # raiz do programa
    ├── INDEX.md
    ├── _harness/
    │   ├── run.mjs                      # reusa lógica de evals/run.mjs existente
    │   ├── judge-prompts/               # prompts versionados do LLM-judge
    │   │   ├── manifesto-adherence.txt
    │   │   ├── naturalidade-v2.txt
    │   │   └── state-transition.txt
    │   └── rubric.mjs                   # rubric expandida (5 → 9 dimensões)
    ├── regression/                      # categoria 1 — sempre roda em CI
    │   ├── invariants.mjs
    │   ├── snapshots.mjs
    │   └── golden-paths.mjs             # happy path por persona core
    ├── directed/                        # categoria 2 — LLM-judge, por persona × agent
    │   ├── tattoo/
    │   │   ├── per-001-curioso.mjs
    │   │   ├── per-002-indeciso.mjs
    │   │   ├── per-009-indeciso-eterno.mjs
    │   │   └── per-010-contraditorio.mjs
    │   ├── cadastro/
    │   │   ├── per-001-curioso.mjs
    │   │   └── per-007-negociador.mjs
    │   ├── proposta/
    │   │   ├── per-007-negociador.mjs
    │   │   └── per-001-curioso.mjs
    │   └── portfolio/                   # vazio até Fase 4
    │       └── .gitkeep
    └── red-team/                        # categoria 3 — adversarial mensal
        ├── prompt-injection.mjs         # já tem fixture 006_prompt_injection
        ├── jailbreak-tom.mjs            # tenta tirar bot do tom
        ├── drift-multi-turn.mjs         # 20+ turns testando consistência
        └── policy-violation-stress.mjs  # força bot a violar P1-P6
```

### Versionamento de evals

Cada eval file tem frontmatter:

```yaml
---
id: eval-tattoo-per001-handoff
version: 2026-05-15.001
agents: [tattoo]
personas: [PER-001]
failure_modes_covered: [FM-0003, FM-0007]
manifesto_principles: [P1, P2, P5]
cost_budget_usd: 0.20
created: 2026-05-15
last_updated: 2026-05-15
status: active                       # active / draft / archived
---
```

Mudança em eval = bump version, registra em `evals/inkflow-agent/INDEX.md`. Aposentadoria: failure mode coberto vira `archived` E persona principal idem.

### Rubric do LLM-judge — expansão de 5 → 9 dimensões

**Atual** (`evals/README.md`):
- `n1_wpp_br` — soa brasileira de WhatsApp?
- `n2_robot_tells` — ausência de clichês robóticos?
- `n3_tom_consistente` — tom estável?
- `n4_comprimento` — msgs curtas?
- `n5_pontuacao` — pontuação natural?

**Novas** (vinculadas ao manifesto + arquitetura):
- `m1_manifesto_adherence` — output viola algum P1-P6 aplicável? (binário por princípio, agregado 0-1)
- `m2_validacao_substantiva` — bot comentou característica específica da ideia/escolha? (binário)
- `m3_multi_balao_apropriado` — output tem `\n\n` quando faz sentido e não tem quando não faz?
- `s1_state_transition_ok` — `proxima_acao` no output bate com estado esperado?

**Total: 9 dimensões.** Pass se média ponderada ≥ threshold do eval (default `naturalidade_min: 4.0`, `manifesto_adherence_min: 0.85`).

Judge prompts ficam versionados em `evals/inkflow-agent/_harness/judge-prompts/`. Mudanças aqui afetam comparabilidade histórica — logam em INDEX.

### Judge model = diferente do model under test

| Papel | Model | Provider |
|---|---|---|
| **Model under test** | `gpt-4o-mini` | OpenAI (atual da Coleta v2) |
| **Judge** | `claude-haiku-4-5-20251001` | Anthropic |

Elimina viés sistemático onde model gosta da própria saída.

### Cost budgets

| Escopo | Cap |
|---|---|
| Regression suite (CI) | ~$0.01/run, ~$5/mês total |
| Directed eval por run | $0.30 hard cap |
| Red-team mensal | $1.00 hard cap |
| **Total InkFlow Agent/mês** | **$50/mês teto** |
| Alarme Telegram | Atinge 70% do cap mensal ($35) |

**Realidade esperada em uso normal:** $5-$15/mês. Cap declarado é upper bound para semanas de iteração intensa.

### Gate de merge (CI)

PR que toca:
- `functions/_lib/prompts/coleta/<agent>/*.js` → obriga regression + directed eval do agent passar
- `functions/api/agent/agents/<agent>.js` → obriga unit + invariant tests + regression
- `docs/manifesto-tatuador-bot.md` → obriga directed eval de TODOS os agents (manifesto é cross-agent)

**Override de emergência** (hotfix prod) permitido com:
- Label `bypass-inkflow-agent-gate` no PR
- Body do PR explica o que está sendo skipado + plano de re-validação em 24h
- Cria failure entry rastreando o bypass (não pode virar prática silenciosa)

### Conexão Telemetria ↔ Eval

```
Telemetria (agent_turn_logs)
        │
        │ Weekly review
        │ pesca 5 conversas reais (3 ruins, 2 boas)
        ▼
   Persona inference (manual ou heurística)
        │
        ▼
   promote-logs-to-evals.mjs
        │
        ▼
   evals/inkflow-agent/directed/<agent>/<persona>/auto_*.json
        │
        ▼
   Run directed eval → detecta regressão futura
```

**Loop fechado:** conversa real → eval case → regression test → conversa real próxima já blindada.

---

## Pilar 5 — Cadência Operacional + Métricas

### Métricas declaradas (com target + threshold)

**Bot-side (qualidade técnica):**

| Métrica | Target | Threshold (alarme) | Fonte |
|---|---|---|---|
| Regression suite pass rate | 100% | <100% bloqueia merge | CI |
| Directed eval pass rate por persona × agent | ≥90% | <85% bloqueia merge pro agent | `evals/inkflow-agent/directed/` |
| Invariant violation rate em produção | <2% turns | >5% pause + investigation | `agent_turn_logs.invariant_passed` |
| Latência p95 por turn | <8s | >12s investiga | `latency_total_ms` |
| Cost médio por turn | baseline ~$0.005 | >2× baseline alarme | `cost_usd` |

**Product-side (que importa pro negócio):**

| Métrica | Target piloto | Target produção | Fonte |
|---|---|---|---|
| Taxa de fechamento assistido (lead → sinal pago) | ≥20% | ≥30% | `conversas.estado_agente=fechado / total` |
| Taxa de intervenção humana (tatuador entra e corrige) | ≤25% | ≤15% | `tatuador_interviu=true` |
| Drop-off rate por estado | mapa | <10% por estado | distribuição final de `estado_agente` |
| Turns até handoff | <6 | <4 | turn_index do `enviar_orcamento_tatuador` |
| NPS dos clientes do tatuador | n/a (sem volume) | ≥40 | survey externo (fase 2) |

**Manifesto-side:**

| Métrica | Target | Fonte |
|---|---|---|
| Aderência cross-agent (média `m1_manifesto_adherence`) | ≥0.85 | Rubric do LLM-judge |
| Failures por categoria, tendência mensal | Decrescente | `docs/inkflow-agent/failures/INDEX.md` |

### Cadência

**Daily** — sem ritual fixo. Uso real + memory updates orgânicos. Telemetria continua rodando.

**Weekly review (~45min, dia fixo a definir):**
1. Roda directed evals dos 4 agents (5min)
2. Compila weekly metrics (auto via script)
3. Lista 5 conversations reais da semana (3 ruins, 2 boas) — query Supabase
4. Pra cada: classifica persona, identifica failures, atualiza catalog
5. Update INDEX de failures (status changes)
6. Decide top-1 priority pra próxima semana
7. Salva report em `docs/inkflow-agent/reports/YYYY-MM-WX-weekly.md`

**Monthly review (~2h, primeiro sábado do mês):**
1. Roda eval completo (regression + todos directed + red-team)
2. Compila métricas product-side
3. Failures: archiva resolvidos, escala open há >4 weeks
4. Revisão de personas (alguma archived? alguma nova draft promove?)
5. Decide tema do mês
6. Salva report em `docs/inkflow-agent/reports/YYYY-MM-monthly.md`

**Quarterly (~4h, fim de trimestre):**
1. Revisão do manifesto (P1-P6 ainda relevantes? Algo emergiu?)
2. Revisão de skills cristalizadas
3. Avaliação de model under test e judge model
4. Roadmap próximo trimestre

### Relatórios

| Tipo | Tamanho | Localização | Trigger |
|---|---|---|---|
| Weekly | ~1 página | `docs/inkflow-agent/reports/YYYY-MM-WX-weekly.md` | Sábado |
| Monthly | ~2-3 páginas | `docs/inkflow-agent/reports/YYYY-MM-monthly.md` | 1º sábado do mês |
| Quarterly | ~4-5 páginas | `docs/inkflow-agent/reports/YYYY-QN-quarterly.md` | Fim de trimestre |

Template auto-preenche via `scripts/inkflow-agent/generate-weekly-report.mjs` (queries SQL + listagem de failures changed + métricas) — humano completa análise.

---

## Companion Obsidian (vault pessoal)

### Propósito

Camada humano-friendly do programa, vivendo no vault pessoal do Leandro (Obsidian) — separada do repo. Permite acompanhar o progresso e entender o estado sem precisar abrir código nem pesar memory do Claude Code. Linguagem simplificada (não-dev), analogias do mundo real, sem jargão técnico cru.

### Restrições

- **NÃO entra no repo InkFlow** — fica apenas no vault pessoal
- **NÃO entra no `MEMORY.md` do Claude Code** — só refs já existentes
- **ZERO impacto no Claude Code context budget**
- Updates manuais — automação fica pra spec próprio se a dor justificar

### Estrutura de notas

```
[[InkFlow Agent — Visão]]                  ← nota-âncora (hub do programa)
   │
   ├── 5 notas dos pilares (uma cada)
   │   ├── [[InkFlow Agent — Pilar 1 Personas]]
   │   ├── [[InkFlow Agent — Pilar 2 Failures]]
   │   ├── [[InkFlow Agent — Pilar 3 Telemetria]]
   │   ├── [[InkFlow Agent — Pilar 4 Evals]]
   │   └── [[InkFlow Agent — Pilar 5 Cadência]]
   │
   ├── 5 notas das fases (status vivo, atualizadas durante execução)
   │   ├── [[InkFlow Agent — Fase 0 Foundation]]
   │   ├── [[InkFlow Agent — Fase 1 TattooAgent]]
   │   ├── [[InkFlow Agent — Fase 2 CadastroAgent]]
   │   ├── [[InkFlow Agent — Fase 3 PropostaAgent]]
   │   └── [[InkFlow Agent — Fase 4 PortfolioAgent]]
   │
   └── Cross-links com vault existente
       ├── [[InkFlow — Mapa geral]] (adicionar entrada apontando pra Visão)
       ├── [[InkFlow — Painel]] (current state linka pra fase ativa)
       └── [[Mentalidade — Visão geral]] (linka como aplicação dos 5 pilares)
```

### Conteúdo das notas

**Nota-âncora `InkFlow Agent — Visão`:**
- O que é o programa em 3 frases (não-dev)
- Por que existe (problema que resolve)
- 5 pilares listados com 1 linha cada (linkando pras notas próprias)
- 5 fases com status atual (linkando)
- Cross-links pro Mapa geral e Painel

**Notas de pilar (5):**
- O que esse pilar faz (analogia simples)
- Como conecta com os outros pilares
- Status: implementado? em progresso? planejado?
- Linka pro spec técnico no repo (`docs/superpowers/specs/2026-05-15-inkflow-agent-program-design.md`)

**Notas de fase (5):**
- O que entra nessa fase (objetivo)
- Gate de saída (quando consideramos "done")
- Status atual: planejado / em progresso / completo
- Aprendizados-chave (preenchido durante e após execução)
- Próxima ação concreta (se está em progresso)

### Convention

- Tags YAML: `tipo: programa-inkflow-agent`, `status: ativo|planejado|completo`, `relacionados: [[...]]`
- Wiki-links liberais — Obsidian rende rede de conexões automaticamente
- Updates: manuais. Quando uma fase fecha, atualiza a nota dela + atualiza o Painel + atualiza o Mapa geral

### Quando criar

- **Foundation (Fase 0):** criar nota-âncora + 5 pilares + Fase 0 + entradas no Mapa geral e Painel
- **Início de cada fase futura:** criar a nota da fase (Fase 1, 2, 3, 4) quando começar
- **Fim de cada fase:** atualizar nota da fase com status `completo` + aprendizados

---

## Plano de execução por agent

### Definition of Ready (DoR) — entrar no programa

- Agent existe em `functions/api/agent/agents/<agent>.js`
- Prompt modular em `functions/_lib/prompts/coleta/<agent>/*.js`
- Schema Zod + invariante existem
- ≥1 unit test passa

### Definition of Done (DoD) por agent — sair do programa "ativo"

1. ✅ Manifesto linkado em `decisao.js` + `regras.js`
2. ✅ ≥3 personas core mapeadas com `comportamento esperado por estado` documentado
3. ✅ ≥1 directed eval por persona core (LLM-judge), pass com `m1_manifesto_adherence ≥0.85`
4. ✅ ≥3 failures históricos migrados pro catalog
5. ✅ Snapshot tests pass (regenerados se necessário)
6. ✅ Telemetria captura turns do agent (query Supabase confirma)
7. ✅ Gate de merge ativo em CI pro agent
8. ✅ Smoke prod manual: 1 sessão de cada persona core, sem failure crítico

### Ordem de execução

#### Fase 0 — Foundation (5-7 dias úteis)

- Estrutura `docs/inkflow-agent/` + README
- 15 personas documentadas (template + INDEX + taxonomy)
- 12-15 failure modes históricos migrados das OBS
- Migration `agent_turn_logs` aplicada (Supabase)
- Telemetry module + integração em `route.js` (fire-and-forget)
- Eval harness InkFlow Agent (`run.mjs` + judge prompts versionados)
- Regression suite com manifesto adherence rubric (9 dimensões)
- CI gate config (GitHub Actions)
- Weekly/monthly report templates
- Cadence calendar (próximos weeklys agendados)
- Companion Obsidian: nota-âncora `[[InkFlow Agent — Visão]]` + 5 pilares + nota Fase 0 + entradas em `[[InkFlow — Mapa geral]]` e `[[InkFlow — Painel]]`

**Gate Fase 0 → 1:** smoke do framework end-to-end. Turn registrado em `agent_turn_logs`, eval roda local, report gera, métricas aparecem. Companion Obsidian navegável (5 pilares + Fase 0). Nada de cliente real ainda.

#### Fase 1 — TattooAgent (5 dias úteis)

- Concluir refator-prompts-coleta-v2 (já em curso) — manifesto P1-P6
- Aplicar gate InkFlow Agent: 3 personas core (PER-001, PER-009, PER-010)
- 4-6 directed evals criados
- 5+ failures migrados (incluindo FM-0003 sugere-tamanho)
- Smoke prod manual com 3 personas
- DoD checklist completo (8 itens)

**Gate Fase 1 → 2:** TattooAgent passa nos 8 itens DoD.

#### Fase 2 — CadastroAgent (3 dias úteis)

- Concluir refator de cadastro (data BR + pós-handoff)
- Personas core: PER-001 (curioso), PER-007 (negociador edge)
- 3-4 directed evals
- 3+ failures migrados (FM-0007 data-BR)
- Smoke prod manual

**Gate Fase 2 → 3:** CadastroAgent DoD + 1 eval específico de transição TattooAgent → CadastroAgent (tom preservado).

#### Fase 3 — PropostaAgent (6 dias úteis)

- Aplicar manifesto em prompts de proposta (linkagem + auditoria)
- Personas críticas: PER-007 (negociador), PER-008 (vago), PER-001
- 4-5 directed evals (objeção desconto é o cenário complexo)
- 3+ failures migrados/criados
- Validação de transição (`propondo_valor` → `aguardando_decisao_desconto`)
- Smoke prod manual

**Gate Fase 3 → 4:** PropostaAgent DoD + flow inteiro Coleta→Cadastro→Proposta tem tom consistente (eval de transição duplo).

#### Fase 4 — PortfolioAgent (8 dias úteis)

- Implementar agent novo (refresh do spec `sub3-3-portfolio-agent-v2`)
- Aplicar programa desde o dia 1 (já nasce no padrão)
- 3-4 personas relevantes
- 4+ directed evals criados pré-implementação (TDD-style)
- Smoke prod manual

**Gate Fase 4 → Beta:** SaaS inteiro tem flow customer-facing coberto. Pronto pra recrutar tatuadores.

#### Fase 5 — Beta fechado (3-5 tatuadores, gratuito)

- Telemetria substitui synthetic gradualmente
- Logs reais → eval cases via `promote-logs-to-evals`
- Métricas product-side começam a popular
- Weekly review com data real (não mais synthetic-only)

### Estimativa total

| Fase | Estimativa |
|---|---|
| Fase 0 — Foundation | 5-7 dias úteis |
| Fase 1 — TattooAgent | 5 dias úteis (concorrente com refator em curso) |
| Fase 2 — CadastroAgent | 3 dias úteis |
| Fase 3 — PropostaAgent | 6 dias úteis |
| Fase 4 — PortfolioAgent | 8 dias úteis |
| **Total até beta abrir** | **~5-6 semanas calendário** |

---

## Estrutura final de pastas

```
docs/
├── inkflow-agent/                           # ★ NOVO — raiz do programa
│   ├── README.md
│   ├── personas/
│   │   ├── INDEX.md
│   │   ├── _template.md
│   │   ├── _taxonomy.md
│   │   └── PER-NNN-*.md (15 iniciais)
│   ├── failures/
│   │   ├── INDEX.md
│   │   ├── _template.md
│   │   ├── _taxonomy.md
│   │   └── FM-NNNN-*.md (12-15 iniciais)
│   ├── ops/
│   │   ├── cadence.md
│   │   ├── metrics.md
│   │   ├── weekly-template.md
│   │   └── monthly-template.md
│   ├── evals/
│   │   ├── INDEX.md
│   │   ├── governance.md
│   │   └── rubric.md
│   └── reports/                             # weekly + monthly acumula
├── canonical/                               # já existe (não toca)
├── manifesto-tatuador-bot.md                # já existe (fundação canônica do programa)
└── superpowers/                             # já existe (este spec mora aqui)

evals/
├── inkflow-agent/                           # ★ NOVO — código de eval
│   ├── INDEX.md
│   ├── _harness/                            # runner + judge prompts versionados
│   ├── regression/                          # CI gate
│   ├── directed/                            # por persona × agent
│   └── red-team/                            # mensal
└── (legado fica: convs/, sub-projeto-2, sub-projeto-3, smoke-tests)

functions/_lib/telemetry/
└── agent-turn-logger.js                     # ★ NOVO (fire-and-forget)

scripts/inkflow-agent/                       # ★ NOVO
├── promote-logs-to-evals.mjs
├── retention-rotate.mjs
├── generate-weekly-report.mjs
└── failure-catalog-lint.mjs                 # valida links cruzados Persona↔Failure↔Eval

supabase/migrations/
└── 2026-05-XX-create-agent-turn-logs.sql    # ★ NOVO (numero exato no plan)
```

---

## Definition of Done do programa

- [ ] Estrutura `docs/inkflow-agent/` completa com README
- [ ] 15 personas com template + INDEX
- [ ] 12+ failures iniciais migrados
- [ ] Migration `agent_turn_logs` aplicada em produção
- [ ] Telemetry module integrado em `route.js` + logando 100% dos turns
- [ ] Eval harness InkFlow Agent rodando com judge model diferente (Claude Haiku) do model under test (gpt-4o-mini)
- [ ] Rubric expandida 9 dimensões validada
- [ ] Regression suite no CI bloqueando PRs sem pass
- [ ] 4 agents passaram DoD individual
- [ ] Weekly + monthly report templates funcionais
- [ ] 4 weekly reviews executados antes do beta abrir
- [ ] Smoke prod manual: 1 conversa de cada persona core em cada agent
- [ ] Bypass-gate procedure documentado
- [ ] Custo mensal eval sob controle (<$50)
- [ ] Companion Obsidian criado: nota-âncora `[[InkFlow Agent — Visão]]` + 5 notas de pilar + 5 notas de fase + cross-links com `[[InkFlow — Mapa geral]]` e `[[InkFlow — Painel]]`

---

## Riscos + mitigações

| Risco | Prob | Impacto | Mitigação |
|---|---|---|---|
| Programa demora >8 semanas e atrasa beta | M | A | Gate por fase força replan se estoura 50% |
| Telemetria adiciona latência ou falha em prod | B | A | Fire-and-forget via `waitUntil`. Falha de insert loga warn, não bloqueia. Stress test no smoke fase 0 |
| LLM-judge tem viés sistemático (Haiku judging gpt-4o-mini) | M | M | Spot-check humano em 10% dos evals. Trocar judge model se desviar |
| 15 personas iniciais insuficientes/redundantes | M | B | Hipótese revisável. Weekly review corrige |
| Custo eval explode em pico de iteração de prompts | B | M | Cap diário + alarme 70%. Worst case suspende directed temp e mantém só regression |
| Cadência operacional vira "papel" (não executada) | A | A | Calendar block + report auto-gera forçando preenchimento. Monthly review é input do release-protocol |
| Manifesto evolui rápido, evals ficam stale | M | M | Quarterly review obrigatório. Mudança no manifesto dispara re-bump de version em directed evals afetados |
| PortfolioAgent estoura escopo (agent novo) | M | M | Spec `sub3-3-portfolio-agent-v2` existe há tempo. Refresh + decompor se >2 semanas |
| Beta abre com bug crítico não detectado | M | A | Smoke prod de cada persona core em cada agent é blocking gate pra beta |
| LGPD: `prompt_full` contém PII | B | A | RLS + retention 90d + metadata-only após. Termo de uso atualizado |
| Tatuador beta percebe atrito durante coleta de dados | M | M | Beta acordo claro: "estamos calibrando, feedback semanal" |
| Subagent-driven não calibrado pro programa | M | M | Aplicar `feedback_calibrar_subagent_driven` da memory: trivial=direto, complexo=pipeline |

---

## Hard gates não-negociáveis

1. **Telemetria 100% nos turns ANTES do beta abrir** — sem isso, problema em prod é cego
2. **Manifesto linkado em TODOS os 4 agents antes do beta** — consistência cross-agent é tese central
3. **Smoke prod manual de cada persona core em cada agent antes do beta** — não substitui CI, mas captura o que CI não pega
4. **Failure entry pra TODO bypass de gate de merge** — bypass não pode virar prática silenciosa

---

## Origem

- Brainstorm 2026-05-15 com Leandro (founder + tatuador profissional)
- Worktree: `~/Documents/inkflow-saas-foundation/` (branch `feat/inkflow-agent-foundation`, base `main` commit `e88a79c`)
- Manifesto canônico: `docs/manifesto-tatuador-bot.md` (cravado 2026-05-13)
- Eval harness existente: `evals/README.md` + `evals/run.mjs` + `evals/generate.mjs`
- Stack canônico: `docs/canonical/stack.md`, `flows.md`, `methodology/index.md`
- Spec irmão em curso: `docs/superpowers/specs/2026-05-13-refator-prompts-coleta-v2-design.md` — a Fase 1 (TattooAgent) deste programa absorve esse refator como input. Quando aquele spec for mergeado, parte do DoD da Fase 1 já estará cumprida (manifesto linkado, 4 OBR, multi-balão)
- Memory relevante: `[[Mentalidade — Visão geral]]`, `[[feedback_atualizar_painel_e_mapa_geral_sempre]]`, `[[feedback_calibrar_subagent_driven]]`, `[[feedback_qualidade_sobre_pressa]]`

---

## Próximos passos

1. **Review humano deste spec** (Leandro). Edits aceitos antes de gerar plan.
2. **`/superpowers:writing-plans`** gera o implementation plan granular da Fase 0 (Foundation) — outras fases podem ter planos próprios depois.
3. Execução via `/superpowers:executing-plans` ou `subagent-driven-development`, conforme calibração da memory `[[feedback_calibrar_subagent_driven]]`.
4. Após Fase 0 mergir → reabrir o brainstorm/spec da Fase 1 (TattooAgent) usando a foundation pronta.
