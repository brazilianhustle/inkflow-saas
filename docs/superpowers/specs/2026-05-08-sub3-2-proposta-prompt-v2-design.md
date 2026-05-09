# Sub-3.2 — PropostaAgent prompt v2 + route.js orquestrador (design)

**Data:** 2026-05-08
**Branch base:** `main` @ `ab60a1a` (merge commit PR #57 / Sub-3.1 CadastroAgent v2)
**Branch trabalho:** `feature/coleta-proposta-v2`
**Status:** `ready-to-plan`
**Predecessor:** [Sub-3.1 CadastroAgent v2 spec](./2026-05-08-sub3-cadastro-prompt-v2-design.md), [Sub-2 TattooAgent v2 rewrite spec](./2026-05-08-coleta-tattoo-prompt-v2-rewrite-design.md), [audit Fase 9 sintese](../audit/2026-05-08-coleta-multi-agent-prompt-audit.md#fase-9--sintese--priorizacao-executada-2026-05-08)
**Eval baseline:** Sub-2 10/10 + Sub-3.1 9/9 + 325/325 CI (`gpt-4o-mini`)

---

## Como comecar a sessao nova

Numa sessao fresca, abra o repo `inkflow-saas`, faca checkout em `feature/coleta-proposta-v2` (criada nesta sessao do brainstorm), e use o prompt:

```
/plan

Spec: docs/superpowers/specs/2026-05-08-sub3-2-proposta-prompt-v2-design.md

Esse spec e o Sub-3.2 do refator multi-agent: aplicar template Sub-2/Sub-3.1
(pure structured-output, zero tools no agent) ao PropostaAgent, MAS com uma
diferenca arquitetural critica versus os predecessores: PropostaAgent v1
tinha 6 tools de side-effect REAL (reservar_horario, gerar_link_sinal,
enviar_objecao_tatuador, acionar_handoff, consultar_horarios_livres,
consultar_proposta_tatuador) — diferente das tools dual-via redundantes
do Tattoo/Cadastro v1. Logo, o agent v2 e pure structured-output mas
route.js cresce pra orquestrar side-effects via switch por proxima_acao.

Escopo cravado pelo brainstorm:
- PropostaAgent v2 com schema enum proxima_acao + payloads opcionais
- route.js com pre-fetch eager (horarios_livres / proposta_status) +
  orchestrator switch por proxima_acao (chama tools existentes em
  functions/api/tools/* mantidas intactas)
- 5 helpers novos isolados: calcular-sinal, format-link-sinal-msg,
  lookup-horario, call-tool, prefetch-proposta
- Estados pausados (aguardando_decisao_desconto/lead_frio/fechado) ficam
  em 501 not-implemented (Sub-4 cuida do noop quando cutover do n8n
  acontecer)
- Modelo gpt-4o-mini (paridade Sub-2/3.1)
- Bug-fix botao Telegram "Fechar valor"->"Informar valor" FORA (P1
  separado pos-Sub-3.2)

Saida esperada: docs/superpowers/plans/2026-05-08-sub3-2-proposta-prompt-v2.md
com tasks granulares (Edit/Write precisos, eval gate como acceptance,
commits per task).
```

---

## TL;DR

PropostaAgent legacy (`functions/_lib/prompts/coleta/proposta/{generate,fluxo,regras,few-shot,few-shot-tenant}.js`) foi portado lift-and-shift do n8n single-agent: 5 camadas, **6 tools** que fazem **side-effects reais e unicos** no mundo (reserva DB, link MercadoPago, mensagem Telegram tatuador, handoff humano). Diferente de Tattoo/Cadastro v1, **as tools nao sao dual-via redundantes** — sao a UNICA via pra cada side-effect.

A lesson cravada do Sub-2 (dual-via gera bug latente: mini hallucina valores e loopa em fail-fast) ainda se aplica, MAS por outro motivo: 6 tools no escopo do agent = ~3x risco de mini se confundir entre tool-calling vs structured-output decision. Sub-2 e Sub-3.1 reduziram esse risco a zero removendo tools redundantes. Sub-3.2 aplica a mesma estrategia mas com **route.js absorvendo a orquestracao** (que era job das tools chamadas pelo agent).

Esta spec faz o **PropostaAgent v2** seguindo o template Sub-2/Sub-3.1 com adaptacoes:

- **Agent puro structured-output**: `tools=[]`, schema Zod proprio (`PropostaOutputSchema`) com enum `proxima_acao` + payloads opcionais por intent
- **route.js cresce com 2 layers novos**:
  1. **Pre-fetch eager** baseado em `estado_atual`: carrega `horarios_livres` (em `propondo_valor` / `escolhendo_horario`) e `proposta_status` (em `aguardando_sinal`) e injeta em `clientContext` antes de rodar agent
  2. **Orchestrator switch** por `out.proxima_acao`: chama tools existentes em `functions/api/tools/*` (intactas) pra executar side-effects, e em `reservar_horario` ainda concatena template fixo §3.4 do link MP no `resposta_cliente`
- **8 camadas limpas no prompt** (~2200 tokens estimados, cap ≤2400 — vs ~3000 legacy)
- **Tabela de decisao explicita** (12 linhas, eixos Estado × Sinal-cliente × proxima_acao × Payload obrigatorio)
- **Helpers isolados em `functions/api/agent/_lib/`**: 5 novos com unit tests TDD (4-5 each)
- **Eval suite 11 cenarios** (TC-P01..TC-P11) cobrindo §3.1-§3.6 do fluxo legacy 1:1
- **Router generalizado** (paridade Sub-3.1): `NEXT_STATE.proposta` aninhado por `(estado_atual, proxima_acao) -> estado_novo`
- **Estados pausados** (`aguardando_decisao_desconto`, `lead_frio`, `fechado`) ficam em **501 not-implemented** — Sub-4 (cutover n8n) implementa noop quando hot-path migrar pra CF Workers

PortfolioAgent rewrite e **out-of-scope** desta sessao — vira Sub-3.3 com mesmo template (mais simples, read-only de imagens).

---

## Principios cravados (do brainstorm)

Decisoes ja cravadas — `/plan` NAO re-debate:

1. **Pure structured-output no agent** (template Sub-2/3.1). Tools=[].
2. **route.js orquestra side-effects** via switch por `proxima_acao`. Tools existentes em `functions/api/tools/*` ficam intactas — route.js chama elas via `_lib/call-tool.js` (wrapper fetch interno).
3. **Pre-fetch eager** (nao lazy/re-roll): route.js carrega contexto necessario por estado ANTES de rodar agent. UX natural (1 round-trip), custo aceitavel (consultar_horarios_livres e SELECT barato).
4. **LLM decide intent + conteudo conversacional. Codigo executa side-effects + formata mensagens regulamentadas.** §3.4 (link MP) e template fixo em codigo (`format-link-sinal-msg.js`) — zero margem pra LLM quebrar formato (R5 legacy: WhatsApp nao renderiza markdown).
5. **1 PropostaAgent cobre os 3 estados ativos** (`propondo_valor`, `escolhendo_horario`, `aguardando_sinal`). Estados pausados (`aguardando_decisao_desconto`, `lead_frio`, `fechado`) ficam em 501.
6. **Modelo `gpt-4o-mini`** (paridade Sub-2/3.1). Custo confirmado em 2 agents anteriores. Pure structured-output reduz risco de mini se confundir. Eval valida na pratica.
7. **Validacao pos-output** via 2 helpers: `validatePropostaOutputInvariant` (em `agents/proposta.js`) + `lookupHorario` (em `_lib/lookup-horario.js`, validador de slot ISO). Hard-fail apenas em violacao de contrato cross-fase ou payload obrigatorio missing. Slot ISO invalido = `silently force pergunta` (pattern Sub-3.1 data_nascimento).
8. **Schema Zod puro** (`z.object`, sem ZodEffects): payloads opcionais (`slot_inicio`, `slot_fim`, `valor_pedido_cliente`) com `.nullable().default(null)`. Validator hard-fails se obrigatorio p/ a intent estiver missing. Lesson Sub-3.1 evitando 400 do SDK.
9. **Estrategia de files**: paridade Sub-3.1 (sobrescreve generate.js direto, cria novos arquivos no mesmo diretorio `coleta/proposta/`, files legacy nao importados ficam orfaos). NAO cria `proposta-v2/`. Sub-2 criou `tattoo-v2/` por ser o primeiro refator (preservar lift-and-shift durante validacao); Sub-3.1+ confia no padrao.
10. **Bug-fix botao Telegram "Fechar valor"->"Informar valor"** e **parcelamento** ficam **FORA** do escopo. P1 backlog separados pos-Sub-3.2.
11. **Sub-4 hot-path** (Evolution -> CF Workers via webhook) e **FORA**. Sub-3.2 testa via stub in-memory + smoke `wrangler pages dev`. Sub-4 absorve cutover.

---

## Status atual (file inventory)

### Files legacy (`coleta/proposta/`) — ficam orfaos pos-Sub-3.2

```
functions/_lib/prompts/coleta/proposta/
├── few-shot-tenant.js     # cap 10 tenant fewshots + format
├── few-shot.js            # 6 exemplos format A pos-PR #28
├── fluxo.js               # §3 fluxo 6 estados (3 ativos + 3 pausados)
├── generate.js            # composer 5 camadas
└── regras.js              # §4 R1-R9 + §4b T1-T5 (tools obrigatorias)
```

### Files NOVOS pretendidos (mesmo diretorio `coleta/proposta/`, paridade Sub-3.1)

```
functions/_lib/prompts/coleta/proposta/
├── identidade.js           # NOVO — quem o agent e
├── objetivo.js             # NOVO — missao da fase
├── contexto.js             # NOVO — injeta valor_proposto, decisao_desconto, horarios_livres, proposta_status
├── faq.js                  # NOVO — reusa shared
├── decisao.js              # NOVO — CORE: tabela 12 linhas + R1-R9 + closing
├── exemplos.js             # NOVO — 8-10 exemplos pure-conversa
└── generate.js             # EDIT — rewrite composer 8 camadas (.filter b => b && b.trim().length > 0).join('\n\n---\n\n')
```

### Files EDITADOS (existentes)

```
functions/_lib/prompts/coleta/proposta/
├── few-shot-tenant.js      # EDIT — adicionar cap 10 (paridade Sub-3.1, se ainda nao tiver)
└── generate.js             # EDIT (acima) — rewrite imports e composer
```

### Files LEGACY (existentes, ficam orfaos pos-edit do generate.js)

```
functions/_lib/prompts/coleta/proposta/
├── fluxo.js                # legacy v1, nao importado pelo generate v2
├── regras.js               # legacy v1, nao importado
└── few-shot.js             # legacy v1, nao importado
```

NAO deletar legacy. Pattern Sub-2/3.1: ficam no repo como referencia historica + opcao de revert facil.

### Agent SDK files (`functions/api/agent/`)

```
functions/api/agent/
├── route.js               # crescera: pre-fetch + orchestrator switch
├── router.js              # crescera: NEXT_STATE.proposta aninhado
├── agents/
│   ├── tattoo.js          # intacto
│   ├── cadastro.js        # intacto
│   └── proposta.js        # NOVO — schema + builder + validator
└── _lib/
    ├── enforce-menor-idade.js   # intacto (Sub-3.1)
    ├── sdk-init.js               # intacto
    ├── prefetch-proposta.js      # NOVO
    ├── call-tool.js              # NOVO (wrapper fetch p/ tools/*.js)
    ├── lookup-horario.js         # NOVO
    ├── calcular-sinal.js         # NOVO
    └── format-link-sinal-msg.js  # NOVO
```

### Tools existentes (`functions/api/tools/`) — INTOCADAS

```
functions/api/tools/
├── consultar-horarios.js          # ja existe; route.js chama via call-tool
├── consultar-proposta-tatuador.js # ja existe; route.js chama via call-tool
├── reservar-horario.js            # ja existe; route.js chama via call-tool
├── gerar-link-sinal.js            # ja existe; route.js chama via call-tool
├── enviar-objecao-tatuador.js     # ja existe; route.js chama via call-tool
└── acionar-handoff.js             # ja existe; route.js chama via call-tool
```

NAO mexer em nenhuma tool. Sub-4 cutover decide se rewrite ou keep. Sub-3.2 so muda quem chama (era agent SDK via tools no prompt; agora route.js via fetch interno).

### Tests (`tests/`)

Novos:
```
tests/agent/proposta-agent.eval.mjs
tests/agent/_fixtures/scenarios-proposta.json
tests/prompts/contracts/coleta-proposta.mjs
tests/prompts/snapshots/coleta-proposta.txt    # gerado por scripts/update-prompt-snapshots.sh
tests/agent/_lib/calcular-sinal.test.mjs       # 4-5 unit
tests/agent/_lib/format-link-sinal-msg.test.mjs # 3-4 unit
tests/agent/_lib/lookup-horario.test.mjs       # 4-5 unit
tests/agent/_lib/call-tool.test.mjs            # 2-3 unit
tests/agent/_lib/prefetch-proposta.test.mjs    # 3-4 unit
```

Editados:
```
tests/prompts/invariants.test.mjs              # PROMPTS_V1 exclui proposta + novo invariant v2
tests/agent/route.test.mjs                     # adicionar testes proposta (orchestrator + pre-fetch + 501 estados pausados)
```

---

## Arquitetura — fluxo completo

```
┌─────────────────────────────────────────────────────────────────┐
│  POST /api/agent/route                                          │
│  Body: { tenant_id, telefone, mensagem, estado_atual,           │
│          dados_acumulados, historico, tenant?, conversa? }      │
│                                                                  │
│  Sub-3.2 cobre estado_atual ∈ {                                 │
│    'propondo_valor', 'escolhendo_horario', 'aguardando_sinal'  │
│  }                                                              │
│  Estados pausados → 501 (Sub-4 implementa noop quando cutover)  │
│                                                                  │
│  ↓                                                               │
│                                                                  │
│  route.js                                                        │
│    1. validateEnv + setDefaultOpenAIKey                          │
│       (lesson Sub-3.1: CF Workers nao tem process.env)          │
│                                                                  │
│    2. isStateImplemented(estado_atual)?                          │
│       NO → 501 not-implemented                                   │
│       YES → continua                                             │
│                                                                  │
│    3. PRE-FETCH (eager) — prefetch-proposta.js                  │
│       Injeta em clientContext baseado em estado_atual:          │
│       - propondo_valor   → consultar_horarios_livres            │
│         → ctx.horarios_livres = [{inicio, fim, legenda}, ...]   │
│       - escolhendo_horario → idem (slots ja foram pre-fetched   │
│         no turn anterior, refetch garante freshness)            │
│       - aguardando_sinal → consultar_proposta_tatuador          │
│         → ctx.proposta_status = { status, ... }                 │
│                                                                  │
│    4. selectAgentBuilder('proposta')                             │
│       → buildPropostaAgent({ env, tenant, conversa, ctx })      │
│                                                                  │
│    5. agent.run(messages, { tools: [], maxTurns: 10 })          │
│       Saida: out.{ resposta_cliente, proxima_acao,              │
│                    slot_inicio?, slot_fim?, valor_pedido_cliente?}│
│                                                                  │
│    6. validatePropostaOutputInvariant(out, ctx)                  │
│       Hard-fail OR silently force pergunta (slot ISO invalido)  │
│                                                                  │
│    7. ORCHESTRATOR — switch out.proxima_acao:                    │
│       - 'pergunta'           → noop                              │
│       - 'oferecendo_horario' → noop (resposta ja menciona slots)│
│       - 'reservar_horario'   → callTool reservar-horario        │
│                              + callTool gerar-link-sinal        │
│                              + format §3.4 template em resposta │
│       - 'pediu_desconto'     → callTool enviar-objecao-tatuador │
│       - 'adiou'              → noop                              │
│       - 'reagendamento'      → callTool acionar-handoff         │
│       - 'cliente_agressivo'  → callTool acionar-handoff         │
│                                                                  │
│    8. estado_novo = getNextState(estado_atual, out)              │
│       NEXT_STATE.proposta aninhado por (estado, proxima_acao)   │
│                                                                  │
│    9. Return JSON 200:                                           │
│       { ok, resposta_cliente, estado_novo, proxima_acao,         │
│         agent_usado, side_effects: [...] }                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Schema de output (Zod)

```ts
// functions/api/agent/agents/proposta.js
import { z } from 'zod';

export const PROXIMA_ACAO_VALUES = [
  'pergunta',           // bot so conversa, mantem estado
  'oferecendo_horario', // transicao propondo_valor -> escolhendo_horario
  'reservar_horario',   // execute reservar+link, escolhendo_horario -> aguardando_sinal
  'pediu_desconto',     // execute objecao, propondo_valor -> aguardando_decisao_desconto
  'adiou',              // propondo_valor -> lead_frio
  'reagendamento',      // handoff humano (qualquer estado ativo)
  'cliente_agressivo',  // handoff humano
];

export const PropostaOutputSchema = z.object({
  resposta_cliente: z.string().min(1).max(500),
  proxima_acao: z.enum(PROXIMA_ACAO_VALUES),

  // payloads opcionais — validator hard-fails se obrigatorio p/ a intent estiver missing
  slot_inicio: z.string().nullable().default(null),  // ISO; obrig p/ reservar_horario
  slot_fim:    z.string().nullable().default(null),  // ISO; obrig p/ reservar_horario
  valor_pedido_cliente: z.number().nullable().default(null),  // obrig p/ pediu_desconto
});

export function validatePropostaOutputInvariant(out, ctx, estado_atual) {
  const { proxima_acao, slot_inicio, slot_fim, valor_pedido_cliente } = out;

  // 1. proxima_acao tem que ser permitido pro estado atual
  const allowed = ALLOWED_BY_STATE[estado_atual] || [];
  if (!allowed.includes(proxima_acao)) {
    return { valid: false, reason: `proxima_acao='${proxima_acao}' nao permitido em estado='${estado_atual}'` };
  }

  // 2. payload obrigatorio por intent
  if (proxima_acao === 'reservar_horario') {
    if (!slot_inicio || !slot_fim) {
      return { valid: false, reason: 'reservar_horario requer slot_inicio e slot_fim' };
    }
    if (!isValidIso(slot_inicio) || !isValidIso(slot_fim)) {
      return { valid: false, reason: 'slot_inicio/slot_fim nao-ISO' };  // → silently force pergunta em route.js
    }
    // slot tem que pertencer a horarios_livres pre-fetched
    if (!lookupHorario(ctx.horarios_livres, slot_inicio, slot_fim)) {
      return { valid: false, reason: 'slot fora da lista pre-fetched' };  // → silently force pergunta
    }
  }

  if (proxima_acao === 'pediu_desconto') {
    if (typeof valor_pedido_cliente !== 'number' || valor_pedido_cliente <= 0) {
      return { valid: false, reason: 'pediu_desconto requer valor_pedido_cliente number > 0' };
    }
    if (valor_pedido_cliente > (ctx.valor_proposto || Infinity)) {
      return { valid: false, reason: 'valor_pedido_cliente > valor_proposto' };  // cliente "pediu desconto" pra valor maior — bug do agent
    }
  }

  return { valid: true };
}

const ALLOWED_BY_STATE = {
  propondo_valor:     ['pergunta', 'oferecendo_horario', 'pediu_desconto', 'adiou', 'reagendamento', 'cliente_agressivo'],
  escolhendo_horario: ['pergunta', 'reservar_horario', 'reagendamento', 'cliente_agressivo'],
  aguardando_sinal:   ['pergunta', 'reservar_horario', 'reagendamento', 'cliente_agressivo'],
  // reservar_horario em aguardando_sinal cobre caso "link venceu, gera novo"
};
```

### Silently force pergunta — 2 lugares distintos

Pattern Sub-3.1. Existem 2 momentos no fluxo route.js onde podemos transformar erro em re-ask:

**(A) Pos-validator, antes do orchestrator** — slot ISO invalido / fora da lista:

| reason do validator | Acao | resposta_cliente fixa |
|---|---|---|
| `slot_inicio/slot_fim nao-ISO` | force `proxima_acao=pergunta` | `'Nao consegui ler o horario — pode escolher um da lista? {legendas formatadas}'` |
| `slot fora da lista pre-fetched` | force `proxima_acao=pergunta` | `'Esse horario nao esta na lista — escolhe um destes? {legendas}'` |

**(B) Dentro do orchestrator, quando tool retorna erro** — race conditions / falha externa:

| Tool falhou | Acao | resposta_cliente fixa |
|---|---|---|
| `reservar-horario` retornou !ok (slot ja reservado por outro fluxo) | force `proxima_acao=pergunta` | `'Esse horario acabou de sair — pode escolher outro? {legendas}'` |
| `gerar-link-sinal` falhou (MP timeout, etc) | force `proxima_acao=pergunta` | `'Tive um problema gerando o link — me da um minuto?'` |
| `enviar-objecao-tatuador` falhou (Telegram down) | force `proxima_acao=pergunta` | `'Anota ai — vou consultar e ja volto.'` |

Demais reasons (validator hard-fails de contrato — `proxima_acao nao permitido em estado`, `valor_pedido_cliente missing/zero`) sao **hard-fail 500**. Agent bug, nao UX issue.

Logs server-side (`console.error/warn`) carregam detalhe completo em ambos os casos.

---

## Orquestrador route.js — pseudo-codigo

```js
// functions/api/agent/route.js (cresce ~120 LoC)

import { prefetchPropostaContext } from './_lib/prefetch-proposta.js';
import { callTool } from './_lib/call-tool.js';
import { calcularValorSinal } from './_lib/calcular-sinal.js';
import { formatLinkSinalMessage } from './_lib/format-link-sinal-msg.js';

// ... (validateEnv, setDefaultOpenAIKey, body parse, isStateImplemented, etc — pattern Sub-3.1) ...

// PRE-FETCH eager (NOVO, depois de isStateImplemented + antes de buildAgent)
let clientContext = body?.clientContext || {};
if (estado_atual === 'propondo_valor' || estado_atual === 'escolhendo_horario' || estado_atual === 'aguardando_sinal') {
  const prefetched = await prefetchPropostaContext({ env, tenant, conversa, estado_atual });
  clientContext = { ...clientContext, ...prefetched };
}

// ... (run agent, validator, silently force pergunta, etc — pattern Sub-3.1) ...

// ORCHESTRATOR (NOVO, antes do return final)
const sideEffects = [];
const enforced = await executeOrchestration(working, {
  env, tenant, conversa, clientContext, sideEffects,
});

return json({
  ok: true,
  resposta_cliente: enforced.resposta_cliente,
  estado_novo: getNextState(estado_atual, enforced),
  proxima_acao: enforced.proxima_acao,
  agent_usado: estado_atual,
  side_effects: sideEffects,  // pra debug/audit
}, 200);


async function executeOrchestration(out, { env, tenant, conversa, clientContext, sideEffects }) {
  switch (out.proxima_acao) {
    case 'pergunta':
    case 'oferecendo_horario':
    case 'adiou':
      return out;  // noop side-effect

    case 'reservar_horario': {
      // 1. Reservar
      const ag = await callTool(env, 'reservar-horario', {
        tenant_id: tenant.id, conversa_id: conversa.id,
        inicio: out.slot_inicio, fim: out.slot_fim,
      });
      sideEffects.push({ tool: 'reservar-horario', ok: ag.ok, agendamento_id: ag.agendamento_id });
      if (!ag.ok) {
        return forcePergunta(out, 'Esse horario acabou de sair — pode escolher outro?');
      }

      // 2. Calcula sinal e gera link MP
      const sinal_pct = tenant.config_precificacao?.sinal_percentual ?? 30;
      const valor_sinal = calcularValorSinal(conversa.valor_proposto, sinal_pct);
      const lk = await callTool(env, 'gerar-link-sinal', {
        agendamento_id: ag.agendamento_id, valor_sinal,
      });
      sideEffects.push({ tool: 'gerar-link-sinal', ok: lk.ok });
      if (!lk.ok) {
        return forcePergunta(out, 'Tive um problema gerando o link — me da um minuto?');
      }

      // 3. Concatena template fixo §3.4 (R5: URL crua, sem markdown)
      out.resposta_cliente = formatLinkSinalMessage({
        agent_text: out.resposta_cliente,
        sinal_pct, valor_sinal,
        link_pagamento: lk.link_pagamento,
        hold_horas: lk.hold_horas,
      });
      return out;
    }

    case 'pediu_desconto': {
      const r = await callTool(env, 'enviar-objecao-tatuador', {
        conversa_id: conversa.id,
        valor_pedido_cliente: out.valor_pedido_cliente,
      });
      sideEffects.push({ tool: 'enviar-objecao-tatuador', ok: r.ok });
      if (!r.ok) return forcePergunta(out, 'Anota ai — vou consultar e ja volto.');
      return out;
    }

    case 'reagendamento':
    case 'cliente_agressivo': {
      const r = await callTool(env, 'acionar-handoff', {
        conversa_id: conversa.id, motivo: out.proxima_acao,
      });
      sideEffects.push({ tool: 'acionar-handoff', ok: r.ok, motivo: out.proxima_acao });
      return out;
    }
  }
}

function forcePergunta(out, msg) {
  return { ...out, proxima_acao: 'pergunta', resposta_cliente: msg };
}
```

### `prefetch-proposta.js`

```js
// functions/api/agent/_lib/prefetch-proposta.js
import { callTool } from './call-tool.js';

export async function prefetchPropostaContext({ env, tenant, conversa, estado_atual }) {
  const ctx = {
    valor_proposto: conversa?.valor_proposto ?? null,
    decisao_desconto: conversa?.dados_coletados?.decisao_desconto ?? null,
  };

  if (estado_atual === 'propondo_valor' || estado_atual === 'escolhendo_horario') {
    const r = await callTool(env, 'consultar-horarios-livres', {
      tenant_id: tenant.id, data_preferida: null,
    });
    ctx.horarios_livres = r.ok ? r.slots : [];
  }

  if (estado_atual === 'aguardando_sinal') {
    const r = await callTool(env, 'consultar-proposta-tatuador', {
      conversa_id: conversa.id,
    });
    ctx.proposta_status = r.ok ? r.status : null;
  }

  return ctx;
}
```

### `call-tool.js`

```js
// functions/api/agent/_lib/call-tool.js
// Wrapper fetch pras tools internas em functions/api/tools/*.js
// Side-effects ficam isoladas aqui (testavel via mock fetch).

export async function callTool(env, tool_name, body) {
  // BASE_URL configuravel via env (dev = http://localhost:8788, prod = https://inkflowbrasil.com)
  // Sub-3.2 PoC: usa env.AGENT_INTERNAL_BASE_URL (default localhost) — Sub-4 cutover define producao
  const base = env.AGENT_INTERNAL_BASE_URL || 'http://localhost:8788';
  try {
    const r = await fetch(`${base}/api/tools/${tool_name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, ...data };
  } catch (e) {
    console.error(`[call-tool] ${tool_name} threw:`, e);
    return { ok: false, status: 0, error: 'fetch-failed' };
  }
}
```

### `calcular-sinal.js`

```js
// functions/api/agent/_lib/calcular-sinal.js
// Sinal = valor_proposto * (sinal_percentual / 100), arredondado pra 2 casas.
export function calcularValorSinal(valor_proposto, sinal_pct) {
  if (typeof valor_proposto !== 'number' || valor_proposto <= 0) return 0;
  if (typeof sinal_pct !== 'number' || sinal_pct <= 0) return 0;
  return Math.round((valor_proposto * sinal_pct) / 100 * 100) / 100;
}
```

### `format-link-sinal-msg.js`

```js
// functions/api/agent/_lib/format-link-sinal-msg.js
// Template fixo §3.4 — 3 partes separadas por linha em branco, URL crua.
// agent_text vem antes do bloco de pagamento (geralmente "Bora marcar!" ou similar).
// PROIBIDO markdown — WhatsApp nao renderiza.
export function formatLinkSinalMessage({ agent_text, sinal_pct, valor_sinal, link_pagamento, hold_horas }) {
  const linha1 = `Pra agendar a gente trabalha com sinal de ${sinal_pct}% do valor, fica em R$ ${formatBRL(valor_sinal)}.`;
  const linha2 = link_pagamento;  // URL crua, em linha propria
  const linha3 = `O link tem validade de ${hold_horas} horas. Se expirar, so me chamar que envio outro.`;
  const prefix = agent_text ? `${agent_text.trim()}\n\n` : '';
  return `${prefix}${linha1}\n\n${linha2}\n\n${linha3}`;
}

function formatBRL(n) {
  return n.toFixed(2).replace('.', ',');
}
```

### `lookup-horario.js`

```js
// functions/api/agent/_lib/lookup-horario.js
// Valida que slot_inicio/slot_fim ISO pertencem a horarios_livres pre-fetched.
export function lookupHorario(slots, inicio, fim) {
  if (!Array.isArray(slots)) return null;
  return slots.find(s => s.inicio === inicio && s.fim === fim) || null;
}

export function isValidIso(s) {
  if (typeof s !== 'string') return false;
  const d = new Date(s);
  return !isNaN(d.getTime()) && s.includes('T');
}
```

### `router.js` update

```js
// functions/api/agent/router.js
import { buildPropostaAgent, validatePropostaOutputInvariant } from './agents/proposta.js';

// PropostaAgent cobre 3 sub-estados (todos chamam o mesmo builder/validator).
// O builder le estado_atual via clientContext pra ajustar copy/blocks.
const PROPOSTA_SUBSTATES = ['propondo_valor', 'escolhendo_horario', 'aguardando_sinal'];

const BUILDERS = {
  tattoo: buildTattooAgent,
  cadastro: buildCadastroAgent,
  // proposta sub-estados todos mapeiam pro mesmo builder
  ...Object.fromEntries(PROPOSTA_SUBSTATES.map(s => [s, buildPropostaAgent])),
};

const VALIDATORS = {
  tattoo: validateTattooOutputInvariant,
  cadastro: validateCadastroOutputInvariant,
  ...Object.fromEntries(PROPOSTA_SUBSTATES.map(s => [s, validatePropostaOutputInvariant])),
};

// NEXT_STATE shallow por estado_atual real (nao por "proposta" agregado).
const NEXT_STATE = {
  tattoo:   { handoff: 'cadastro', erro: 'tattoo' },
  cadastro: { handoff: 'aguardando_tatuador', erro: 'aguardando_tatuador' },

  propondo_valor: {
    pergunta:           'propondo_valor',              // stay
    oferecendo_horario: 'escolhendo_horario',          // transition
    pediu_desconto:     'aguardando_decisao_desconto', // bot pausa
    adiou:              'lead_frio',                   // bot pausa
    reagendamento:      'aguardando_tatuador',         // handoff humano
    cliente_agressivo:  'aguardando_tatuador',
  },
  escolhendo_horario: {
    pergunta:          'escolhendo_horario',           // stay
    reservar_horario:  'aguardando_sinal',             // transition
    reagendamento:     'aguardando_tatuador',
    cliente_agressivo: 'aguardando_tatuador',
  },
  aguardando_sinal: {
    pergunta:          'aguardando_sinal',             // stay
    reservar_horario:  'aguardando_sinal',             // re-gerou link, fica
    reagendamento:     'aguardando_tatuador',
    cliente_agressivo: 'aguardando_tatuador',
  },
};

// getNextState fica shallow lookup (paridade Sub-3.1 — sem nested branch novo)
export function getNextState(estado_atual, out) {
  const map = NEXT_STATE[estado_atual] || {};
  return map[out?.proxima_acao] || estado_atual;
}

// isStateImplemented continua funcionando (BUILDERS keys cobrem propondo_valor/escolhendo_horario/aguardando_sinal)
// Estados pausados (aguardando_decisao_desconto/lead_frio/fechado) nao tem entry → 501.
```

---

## Prompt v2 — 8 blocos detalhados

Cap pretendido: ≤2400 tokens (vs 1958 do Cadastro — relaxado pra cobrir 3 estados + 3 caminhos). Token check em smoke gate (paridade Sub-3.1).

### `identidade.js` (~150 tokens)

Mesma base dos outros agents. Define que o agent e atendente do estudio, fala "tu", trabalha pelo WhatsApp. Pula intro porque ja apareceu nas fases anteriores (cliente nao recebe um "oi! sou o atendente" no estado propondo_valor — seria bizarro).

### `objetivo.js` (~200 tokens)

> ## §2 OBJETIVO — Fase Proposta
>
> Voce ESTA na fase Proposta. Sua missao tem 3 partes:
>
> 1. **Apresentar o valor** que o tatuador fechou (vem em `valor_proposto` no contexto)
> 2. **Lidar com 3 reacoes do cliente**: aceita / pede desconto / adia
> 3. **Em caso de aceite**: oferecer horarios livres e fechar agendamento + sinal
>
> Voce NAO inventa valores, NAO calcula desconto, NAO confirma reducao sem o tatuador. Quem decide e ele.
>
> Voce NAO escreve link de pagamento — o sistema gera e formata. Voce so emite a INTENCAO de reservar.

### `contexto.js` (~250 tokens)

Injeta variaveis dinamicas:

```
# §1 CONTEXTO

Cliente: {cliente_nome ou 'sem nome'}
Estado atual: {estado_atual}  (propondo_valor | escolhendo_horario | aguardando_sinal)
Valor proposto: R$ {valor_proposto}
Decisao desconto previa: {decisao_desconto || 'nenhuma'}  (aceito | recusado | null)
Sinal percentual configurado: {sinal_percentual}%

{IF estado=propondo_valor OR escolhendo_horario}
Horarios livres disponiveis (use SOMENTE estes, formato ISO):
- {slot.legenda} — slot_inicio={slot.inicio}, slot_fim={slot.fim}
- {...}
{ELSE IF estado=aguardando_sinal}
Status da proposta atual: {proposta_status.status}
{END}
```

### `faq.js` (~100 tokens)

Reusa `_shared/faq.js` (pattern Sub-3.1). Lista FAQ do tenant.

### `fluxo.js` (~250 tokens)

Mapa rapido de transicao + variantes copy de reentry:

> ## §3 FLUXO DOS ESTADOS
>
> ### §3.1 `propondo_valor` (entry)
>
> Voce abre apresentando o valor. Variantes copy baseadas em `decisao_desconto`:
>
> - **null (primeira proposta)**: "Show! Pelo trabalho ficou em R$ {valor}. Bora marcar?"
> - **"aceito"** (tatuador topou desconto): "Show! Ele topou em R$ {valor_aceito}. Bora marcar?"
> - **"recusado"** (tatuador manteve valor): "Ele preferiu manter R$ {valor}. Ta fechado pra ti? Bora marcar?"
>
> Apos enviar, AGUARDE resposta do cliente (proxima_acao=pergunta no MESMO turno do recebimento e errado — voce ja esta abrindo).
>
> ### §3.2 Transicoes
>
> - Cliente aceita -> emite `oferecendo_horario` + resposta inclui slots da lista
> - Cliente pede desconto sem valor -> emite `pergunta` + "Quanto tu tava pensando?"
> - Cliente pede desconto com valor -> emite `pediu_desconto` + payload `valor_pedido_cliente=N`
> - Cliente adia -> emite `adiou` + despedida educada
>
> ### §3.3 `escolhendo_horario`
>
> Cliente escolheu slot da lista -> emite `reservar_horario` + payload `slot_inicio`, `slot_fim` (ISO da lista). Sistema reserva + gera link.
> Cliente perguntou outra coisa -> emite `pergunta`.
> Cliente pediu slot fora da lista -> emite `pergunta` + reapresenta slots disponiveis.
>
> ### §3.4 `aguardando_sinal`
>
> Cliente avisa "venceu" -> emite `reservar_horario` (re-gera link, mesmo agendamento_id se possivel).
> Cliente quer mudar data -> emite `reagendamento` (handoff humano).
> Cliente xinga -> emite `cliente_agressivo`.

### `decisao.js` (~600 tokens)

CORE do prompt. Tabela 12 linhas + R1-R9 + closing.

#### §4.1 Tabela de decisao

| # | Estado | Sinal do cliente | proxima_acao | Payload obrigatorio | Tom da resposta |
|---|---|---|---|---|---|
| 1 | propondo_valor | "fechou", "topo", "vamos", "sim", "ok", "bora" | `oferecendo_horario` | — | "Show! Tenho {slots da lista}. Qual prefere?" |
| 2 | propondo_valor | "caro", "menos" (sem valor) | `pergunta` | — | "Quanto tu tava pensando?" |
| 3 | propondo_valor | "consegue por X?", "deixa por X?" | `pediu_desconto` | `valor_pedido_cliente=X` | "Anotado! Vou consultar com o tatuador e te retorno." |
| 4 | propondo_valor | "vou pensar", "te volto", "depois" | `adiou` | — | "Tranquilo! Qualquer coisa e so me chamar." |
| 5 | escolhendo_horario | "qui", "ter 14h" (slot da lista) | `reservar_horario` | `slot_inicio`, `slot_fim` ISO | "Bora!" (sistema concatena link MP) |
| 6 | escolhendo_horario | "amanha 9h" (fora da lista) | `pergunta` | — | "Esse horario nao esta livre. Tenho {slots}. Qual prefere?" |
| 7 | aguardando_sinal | "o link venceu" | `reservar_horario` | `slot_inicio`, `slot_fim` (mesmo do agendamento) | "Beleza, gerei outro!" (sistema concatena novo link) |
| 8 | aguardando_sinal | "instrucoes pre-tattoo?" | `pergunta` | — | resposta breve da FAQ |
| 9 | qualquer | "quero mudar a data" (pos-agendado) | `reagendamento` | — | "Vou pedir pro tatuador conferir contigo." |
| 10 | qualquer | xingamento, agressao | `cliente_agressivo` | — | "Vou pedir ajuda do tatuador aqui." |
| 11 | qualquer | duvida leve / FAQ | `pergunta` | — | resposta breve |
| 12 | qualquer | mudanca tattoo (cor, tamanho) pos-proposta | `reagendamento` | — | "Vou avisar o tatuador pra ajustar valor. Volto rapidinho." |

#### §4.2 R1-R9 (regras inviolaveis condensadas)

> **R1.** O VALOR vem de `valor_proposto` no contexto. NAO calcula. NAO inventa.
>
> **R2.** PROIBIDO: oferecer desconto sem o tatuador. Cliente pediu menos? Voce SO emite `pediu_desconto` — JAMAIS confirma valor menor.
>
> **R3.** PROIBIDO usar palavras "contraproposta", "contra-oferta", "negociacao". Use "vou consultar com o tatuador".
>
> **R4.** SLOTS: SEMPRE da lista `horarios_livres` no contexto. JAMAIS invente. Se nenhum serve apos perguntar, emite `reagendamento`.
>
> **R5.** LINK DE SINAL: voce NUNCA escreve URL na resposta. Sistema concatena template fixo apos voce emitir `reservar_horario`. Se voce escrever URL, vai duplicar.
>
> **R6.** APOS emitir `pediu_desconto`, voce SAI da conversa (estado vira `aguardando_decisao_desconto`). NAO continue conversando.
>
> **R7.** APOS emitir `adiou`, voce SAI da conversa (estado vira `lead_frio`). NAO ofereca alternativas, NAO insista. Despedida educada.
>
> **R8.** Mudanca de data de agendamento ja confirmado (pos-pgto pendente): emite `reagendamento`. Voce nao reagenda nesta fase.
>
> **R9.** TODA resposta cabe em ≤200 chars. Maximo 1 pergunta por turno.

#### §4.3 Closing message

> Voce esta no controle desta fase. Cliente confia em voce. Nao decida valor (e do tatuador), nao invente slot (e do sistema), nao escreva URL (e do sistema). Decida intent + escreva conversa natural — o resto e codigo.

### `exemplos.js` (~500 tokens)

8-10 exemplos pure-conversa (paridade Sub-2/3.1). Cobrir tabela §4.1 1:1, com indicacao explicita de `proxima_acao` em comentario interno (LLM ignora; serve pra eval/manutencao):

> ## §7 EXEMPLOS DE CONVERSAS IDEAIS
>
> ### Exemplo 1 — Caminho A (cliente aceita, oferece slots)
> ```
> [estado=propondo_valor, valor_proposto=750, decisao=null, slots=ter14h/qui10h/sex16h]
> CLIENTE: fechou, vamos marcar
> AGENTE: Show! Tenho ter 14h, qui 10h, sex 16h. Qual prefere?
> // (proxima_acao=oferecendo_horario, sem payload)
> ```
>
> ### Exemplo 2 — Caminho B sem valor
> ```
> [estado=propondo_valor, valor_proposto=750]
> CLIENTE: ta um pouco caro
> AGENTE: Quanto tu tava pensando?
> // (proxima_acao=pergunta)
> ```
>
> ### Exemplo 3 — Caminho B com valor
> ```
> [estado=propondo_valor, valor_proposto=750]
> CLIENTE: consegue por 600?
> AGENTE: Anotado! Vou consultar com o tatuador e te retorno.
> // (proxima_acao=pediu_desconto, payload valor_pedido_cliente=600)
> ```
>
> ### Exemplo 4 — Caminho C (adia)
> ```
> [estado=propondo_valor, valor_proposto=750]
> CLIENTE: deixa eu pensar e te volto
> AGENTE: Tranquilo! Qualquer coisa e so me chamar.
> // (proxima_acao=adiou)
> ```
>
> ### Exemplo 5 — Reentrada apos desconto aceito
> ```
> [estado=propondo_valor, valor_proposto=600, decisao=aceito, slots=...]
> CLIENTE: (turno aberto pelo agent ao reentrar)
> AGENTE: Show! Ele topou em R$ 600. Bora marcar?
> CLIENTE: vamos
> AGENTE: Show! Tenho ter 14h, qui 10h. Qual prefere?
> // (turno 1: proxima_acao=pergunta — abertura. Turno 2: oferecendo_horario)
> ```
>
> ### Exemplo 6 — Reentrada apos desconto recusado
> ```
> [estado=propondo_valor, valor_proposto=750, decisao=recusado]
> AGENTE: Ele preferiu manter R$ 750. Ta fechado pra ti? Bora marcar?
> CLIENTE: humm, vou pensar
> AGENTE: Tranquilo! Qualquer coisa e so me chamar.
> // (proxima_acao=adiou)
> ```
>
> ### Exemplo 7 — Cliente escolhe slot
> ```
> [estado=escolhendo_horario, slots=ter 14h (2026-05-12T14:00-03:00)/qui 10h/sex 16h]
> CLIENTE: qui
> AGENTE: Bora!
> // (proxima_acao=reservar_horario, payload slot_inicio=2026-05-14T10:00-03:00, slot_fim=2026-05-14T12:00-03:00)
> // (sistema concatena: "Bora! Pra agendar... R$ 225. https://link... O link tem validade de 24h...")
> ```
>
> ### Exemplo 8 — Slot fora da lista
> ```
> [estado=escolhendo_horario, slots=ter 14h/qui 10h/sex 16h]
> CLIENTE: amanha 9h?
> AGENTE: Amanha nao tenho disponivel — tenho ter 14h, qui 10h, sex 16h. Qual prefere?
> // (proxima_acao=pergunta)
> ```
>
> ### Exemplo 9 — Cliente xinga
> ```
> [qualquer estado]
> CLIENTE: vai se f*der, ta caro pra c*ralho
> AGENTE: Vou pedir ajuda do tatuador aqui contigo.
> // (proxima_acao=cliente_agressivo)
> ```
>
> ### Exemplo 10 — Mudanca tattoo pos-proposta
> ```
> [estado=propondo_valor]
> CLIENTE: ah esqueci, queria colorida
> AGENTE: Boa! Vou avisar o tatuador pra ele ajustar o valor. Volto rapidinho.
> // (proxima_acao=reagendamento — handoff pra tatuador re-orcamentar)
> ```

### `few-shot-tenant.js` (~150 tokens)

Reusa pattern Sub-3.1 (cap 10). Tenant pode adicionar exemplos proprios via Painel.

### `generate.js`

```js
import { identidade } from './identidade.js';
import { contexto } from './contexto.js';
import { objetivo } from './objetivo.js';
import { faq } from './faq.js';
import { fluxo } from './fluxo.js';
import { decisao } from './decisao.js';
import { exemplos } from './exemplos.js';
import { fewShotTenant } from './few-shot-tenant.js';

export function generatePromptColetaProposta(tenant, conversa, clientContext) {
  const ctx = clientContext || {};
  const blocks = [
    identidade(tenant),
    contexto(tenant, conversa, ctx),
    objetivo(tenant),
    faq(tenant),
    fluxo(tenant, ctx),
    decisao(tenant),
    exemplos(tenant),
    fewShotTenant(tenant),
  ].filter(b => b && b.trim().length > 0);
  return blocks.join('\n\n---\n\n');
}
```

---

## Eval suite — 11 cenarios (TC-P01..TC-P11)

`tests/agent/_fixtures/scenarios-proposta.json`:

| TC | Estado | Mensagem cliente | Histórico | Esperado |
|---|---|---|---|---|
| **TC-P01** | propondo_valor | "fechou, vamos marcar" | abertura agent valor 750 | `proxima_acao=oferecendo_horario`, resposta menciona >=2 slots |
| **TC-P02** | propondo_valor | "ta um pouco caro" | abertura | `proxima_acao=pergunta`, resposta tem "?" (re-ask) |
| **TC-P03** | propondo_valor | "consegue por 600?" | abertura | `proxima_acao=pediu_desconto`, `valor_pedido_cliente=600` |
| **TC-P04** | propondo_valor | "vou pensar e te volto" | abertura | `proxima_acao=adiou` |
| **TC-P05** | propondo_valor (decisao=aceito, valor=600) | "vamos" | reentry agent diz topou 600 | `proxima_acao=oferecendo_horario` |
| **TC-P06** | propondo_valor (decisao=recusado, valor=750) | "humm vou pensar" | reentry agent manteve 750 | `proxima_acao=adiou` |
| **TC-P07** | escolhendo_horario (slots=ter14h/qui10h) | "qui" | abertura agent ofereceu | `proxima_acao=reservar_horario`, `slot_inicio` ISO match qui10h |
| **TC-P08** | escolhendo_horario (slots=ter14h) | "amanha 9h" | idem | `proxima_acao=pergunta`, resposta reapresenta slots |
| **TC-P09** | aguardando_sinal | "o link venceu" | agent ja mandou link | `proxima_acao=reservar_horario` (re-gera) |
| **TC-P10** | aguardando_sinal | "preciso mudar pra outro dia" | idem | `proxima_acao=reagendamento` |
| **TC-P11** | qualquer | "vai se f*der" | qualquer | `proxima_acao=cliente_agressivo` |

**Assertion types**:
- `proxima_acao_equals: 'X'` (igualdade)
- `payload_includes: { slot_inicio: 'ISO', slot_fim: 'ISO' }` (subset match)
- `resposta_cliente_matches: /regex/` (ex: pra TC-P02 valida "?")
- `resposta_cliente_contains_slots: ['ter 14h', 'qui 10h']` (lista de legendas)

**Iteracao esperada**: 1-2 rounds (paridade Sub-3.1: 7/9 → 9/9 em 1 round). Custo total: ~$0.03.

---

## Smoke local — 4 fluxos criticos

`wrangler pages dev` + curl. Tools reais (DB Supabase + MP em sandbox quando possivel).

1. **Caminho A end-to-end** (propondo_valor → escolhendo_horario → aguardando_sinal):
   - POST 1: `estado=propondo_valor`, msg="fechou" → `oferecendo_horario`, resposta menciona slots
   - POST 2: `estado=escolhendo_horario`, msg="qui" → `reservar_horario`, side_effects: [reservar OK, gerar-link OK]
   - Valida resposta_cliente final byte-a-byte: 3 partes (texto agent + linha branca + URL crua + linha branca + validade)

2. **Caminho B** (cliente pede desconto):
   - POST: `estado=propondo_valor`, msg="consegue por 600?" → `pediu_desconto`, side_effects: [enviar-objecao-tatuador OK]
   - Valida payload `valor_pedido_cliente=600` chegou no body da tool

3. **Caminho C** (cliente adia):
   - POST: `estado=propondo_valor`, msg="vou pensar" → `adiou`, side_effects=[]
   - Valida estado_novo=`lead_frio`

4. **Slot invalido** (silently force pergunta):
   - POST: `estado=escolhendo_horario`, msg="amanha 9h" (fora da lista) → `pergunta`, resposta reapresenta slots
   - Valida que NAO houve reservar_horario no side_effects

Custo estimado: ~$0.01.

---

## Token budget gate

Test em `tests/prompts/contracts/coleta-proposta.mjs`:

```js
const SLUG = 'coleta-proposta';
export const SPEC = {
  must_contain: [
    '§1 CONTEXTO', '§2 OBJETIVO', '§3 FLUXO', '§4 DECISAO',
    'valor_proposto', 'decisao_desconto', 'horarios_livres',
    'proxima_acao',
    'oferecendo_horario', 'reservar_horario', 'pediu_desconto',
    'adiou', 'reagendamento', 'cliente_agressivo',
    'slot_inicio', 'slot_fim', 'valor_pedido_cliente',
  ],
  must_not_contain: [
    // legacy headers
    'REGRAS INVIOLAVEIS', '§4b TOOLS',
    // tool names (agent v2 nao chama tools)
    'consultar_horarios_livres', 'enviar_objecao_tatuador',
    'gerar_link_sinal', 'reservar_horario(', 'acionar_handoff(',
    'consultar_proposta_tatuador',
    // markdown link patterns
    '](http',  // basic markdown link detection
    // pseudo-codigo legacy
    '[chama tool',
  ],
  max_tokens: 2400,  // vs 2000 do Cadastro — relaxado pra cobrir 3 estados
};
```

---

## Decisoes cravadas pelo brainstorm (cross-ref)

Sem re-debate em `/plan`:

- ✅ Pure structured-output + route.js orquestrador (escolha B, fundamentada em lesson Sub-2 + Sub-4 prep + testabilidade)
- ✅ gpt-4o-mini (paridade Sub-2/3.1)
- ✅ 1 PropostaAgent cobre 3 estados ativos
- ✅ Pre-fetch eager (UX natural, custo baixo)
- ✅ Estados pausados → 501 not-implemented (Sub-4 cuida)
- ✅ Bug-fix botao Telegram + parcelamento → FORA do Sub-3.2 (P1 backlog)
- ✅ Files legacy intocados (paridade)
- ✅ Estrategia de files paridade Sub-3.1: novos arquivos no MESMO diretorio `coleta/proposta/`, EDIT em `generate.js`, legacy nao importado fica orfao (nao deletar)

---

## Out-of-scope (Sub-4 e follow-ups)

- ❌ Sub-4 cutover do n8n (Evolution → CF Workers webhook direto)
- ❌ Persistencia real de conversa em Supabase (Sub-3.2 mantem stub in-memory pattern Sub-1/2/3.1)
- ❌ Telegram tatuador end-to-end (`enviar-objecao-tatuador` ja existe — Sub-3.2 so chama)
- ❌ Botao Telegram "Fechar valor" → "Informar valor" (P1 separado, ~1.5-2h)
- ❌ Parcelamento configurado no Painel (P1 feature nova, ~4-6h)
- ❌ PortfolioAgent v2 (Sub-3.3 — desenhar do zero, nao existe `coleta/portfolio/`)
- ❌ Review contradicoes prompt pos-Sub-3 (P1 separado, ~2-3h apos todos os agents v2 mergeados)

---

## Rollback plan

Se Sub-3.2 entrar em prod (via Sub-4 cutover) e provar problema:

1. **Hotfix curto** (segundos): mudar router pra `isStateImplemented('propondo_valor')` retornar `false` → 501. n8n hot-path antigo absorve.
2. **Hotfix medio** (minutos): revert do PR Sub-3.2 — orquestrador some, agent v2 some, route.js volta pro pattern Sub-3.1 (so tattoo+cadastro implementados).
3. **Hotfix longo** (horas): se bug for em side-effect (reservar/link MP), pausar tool especifica via flag `env.SKIP_RESERVAR_HORARIO=1` no orchestrator. Investigar offline.

Sub-3.2 ainda nao toca prod (n8n esta no hot-path ate Sub-4). Risco real e zero — testes via wrangler local + eval. Sub-4 spec cuidara de gradual rollout.

---

## Open questions

Nenhuma cravada. Decisoes do brainstorm cobrem o escopo. Se em `/plan` aparecer ambiguidade nova (ex: como tratar `valor_pedido_cliente > valor_proposto` no fluxo real), documenta como gap no plan e me chama pra cravar.

---

## Anexos — referencias relevantes

- [Sub-3.1 spec](./2026-05-08-sub3-cadastro-prompt-v2-design.md) — template base
- [Sub-2 rewrite spec](./2026-05-08-coleta-tattoo-prompt-v2-rewrite-design.md) — origem do pattern pure structured-output
- [Audit Fase 9 sintese](../audit/2026-05-08-coleta-multi-agent-prompt-audit.md#fase-9--sintese--priorizacao-executada-2026-05-08) — decisao GO Sub-3
- [PropostaAgent v1 fluxo legacy](../../../functions/_lib/prompts/coleta/proposta/fluxo.js) — referencia copy + 3 caminhos
- [PropostaAgent v1 regras legacy](../../../functions/_lib/prompts/coleta/proposta/regras.js) — R1-R9 + T1-T5 (tools — saem no v2)
- Tools intocadas em `functions/api/tools/{consultar-horarios,consultar-proposta-tatuador,reservar-horario,gerar-link-sinal,enviar-objecao-tatuador,acionar-handoff}.js`
