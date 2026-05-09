# Sub-3.3 — PortfolioAgent v2 (intent transversal `enviar_portfolio`) — design

**Data:** 2026-05-09
**Branch base:** `main` @ `e5d4b46` (head pos-merge PR #58 / Sub-3.2)
**Branch trabalho:** `feat/sub3-3-portfolio-agent-v2`
**Status:** `ready-to-plan`
**Predecessor:** [Sub-3.2 PropostaAgent v2](./2026-05-08-sub3-2-proposta-prompt-v2-design.md), [Sub-3.1 CadastroAgent v2](./2026-05-08-sub3-cadastro-prompt-v2-design.md), [Sub-2 TattooAgent v2 rewrite](./2026-05-08-coleta-tattoo-prompt-v2-rewrite-design.md)
**Eval baseline:** Sub-2 10/10 + Sub-3.1 9/9 + Sub-3.2 10/11 + 350+ unit tests + smoke 4/4 (`gpt-4o-mini`)

---

## Como comecar a sessao nova

Em sessao fresca, abra o repo `inkflow-saas`, faca checkout em `feat/sub3-3-portfolio-agent-v2` (criada nesta sessao do brainstorm), e use o prompt:

```
/plan

Spec: docs/superpowers/specs/2026-05-09-sub3-3-portfolio-agent-v2-design.md

Esse spec e o Sub-3.3 do refator multi-agent: introduz a intent transversal
`enviar_portfolio` orquestrada pelo route.js, suportada pelos 3 agents de fase
existentes (Tattoo/Cadastro/Proposta). NAO cria agent LLM novo (decisao
cravada via YAGNI no brainstorm). NAO cria diretorio coleta/portfolio/.

Escopo cravado pelo brainstorm:

- 3 agents existentes (tattoo/cadastro/proposta) ganham:
  - enum 'enviar_portfolio' em proxima_acao
  - payload_portfolio: { estilo?, max?, motivo? } opcional
  - 1 linha em decisao.js do prompt v2 (regra: cliente pede trabalhos +
    portfolio_disponivel=true => emite intent; senao pergunta normal)
- route.js cresce: pre-fetch portfolio_disponivel (boolean derivado de
  tenant.portfolio_urls.length > 0) + case 'enviar_portfolio' no
  orchestrator switch que chama tool enviar-portfolio existente
- Tool functions/api/tools/enviar-portfolio.js INTACTA
- 1 helper novo: functions/api/agent/_lib/prefetch-portfolio.js (4 unit tests)
- 9 cenarios eval (TC-PORT-01..09) cobrindo 3 agents x 3 caminhos
  (com estilo / sem estilo / portfolio vazio)
- Validator hard-fail se proxima_acao='enviar_portfolio' E
  portfolio_disponivel=false (paridade enforceMenorIdade)
- Estado pos-envio = estado_atual (nao muda fase)
- Sem throttle persistido (LLM decide via historico)
- Sem mensagem template (agent gera prosa; route.js so envia URLs)
- Modelo gpt-4o-mini (paridade Sub-2/3.1/3.2)
- Vintage videos OUT (sub-feature separada)

Riscos R1-R7 documentados em "Riscos e assumptions" -- validar durante
plan, nao re-decidir.

Saida esperada: docs/superpowers/plans/2026-05-09-sub3-3-portfolio-agent-v2.md
com tasks granulares (Edit/Write precisos, eval gate como acceptance,
commits per task).
```

---

## TL;DR

"PortfolioAgent v2" e **misnomer historico** dos specs Sub-3.1 e Sub-3.2. Ao revisar o repo, NAO existe estado_agente='portfolio' na maquina canonical (`docs/canonical/stack.md:89`) e a tool `enviar-portfolio.js` e tool lateral simples (filtro substring por estilo, retorna ate 5 URLs).

A decisao cravada deste spec, via brainstorm orientado por YAGNI: **NAO criar agent LLM novo**. A solucao mais pragmatica e introduzir uma **intent transversal** `enviar_portfolio` que:

1. **Os 3 agents de fase existentes (Tattoo/Cadastro/Proposta v2)** sinalizam quando cliente pede trabalhos.
2. **route.js** detecta a intent e orquestra: chama tool `enviar-portfolio` existente, retorna URLs no response.
3. **Pre-fetch** carrega `portfolio_disponivel: boolean` no `clientContext` antes do agent rodar, pra agent decidir UX corretamente quando tenant nao tem portfolio cadastrado.

Esta abordagem mantem a tool intacta (paridade Sub-3.2 com tools existentes), nao adiciona LLM call extra, mantem o template Sub-2/3.1 (`tools=[]`, pure structured-output) nos 3 agents, e custa ~150 linhas + 9 evals.

Quando a curadoria substring virar problema (matching ruim, falta de personalizacao, vision), refatoramos pra agent LLM real em sub-feature separada. Hoje YAGNI.

---

## Principios cravados (do brainstorm)

Decisoes ja cravadas -- `/plan` NAO re-debate:

1. **Orchestrator-only** -- sem agent LLM novo. Decidido via YAGNI: filtro substring atual e suficiente, tool retorna URLs, agent de fase ja conhece contexto da conversa.
2. **3 agents de fase ganham a intent** (cobertura maxima). Cliente pode pedir portfolio em qualquer fase: durante coleta tattoo (mais comum), durante cadastro (hesitacao), durante proposta (pre-confirmacao). Custo: 3 schemas tocados, 3 cenarios eval extras.
3. **Tool `enviar-portfolio.js` INTACTA**. route.js chama via `_lib/call-tool.js` (helper Sub-3.2). Sub-4 cutover decide depois se rewrite ou keep.
4. **Pre-fetch `portfolio_disponivel`** em todos os turnos (1 campo no clientContext). Custo zero -- tenant ja e fetchado por `prefetchPropostaContext` em fases proposta; pros estados tattoo/cadastro, adicionamos 1 SELECT minimo (ou reutilizamos cache do tenant ja carregado por outros pre-fetches existentes).
5. **Estado pos-envio = estado_atual** (nao muda fase). Cliente pediu portfolio em tattoo -> continua em tattoo. Em propondo_valor -> continua em propondo_valor.
6. **Sem throttle persistido**. LLM decide via historico se ja mandou portfolio na conversa. Se virar problema observado, P2 separado adiciona persistencia.
7. **Sem mensagem template**. Agent gera prosa em `resposta_cliente` ("show, te mando alguns trabalhos!"). route.js so envia URLs separadas. Diferente do Sub-3.2 (`format-link-sinal-msg`) porque link MP e regulamentado/legal e portfolio e so URLs de imagem.
8. **Modelo `gpt-4o-mini`** (paridade Sub-2/3.1/3.2).
9. **So imagens nesta sub-feature**. Video fica out -- sub-feature separada quando upload na pagina-tatuador suportar.
10. **Validator hard-fail** se `proxima_acao='enviar_portfolio'` E `clientContext.portfolio_disponivel=false`. Paridade `enforceMenorIdade`. Caso oposto (disponivel=true e agent nao pediu) e OK -- agent decide.
11. **Bug-fix botao Telegram + parcelamento + reentry agent + cutover hot-path** ficam **OUT** (continuacao do Sub-3.2 out-of-scope).

---

## Status atual (file inventory)

### Files existentes nao tocados

```
functions/api/tools/enviar-portfolio.js   # INTOCADA -- filtro substring + DEFAULT_MAX=5
functions/_lib/prompts/coleta/tattoo/*.js  # base prompt v2 do Sub-2
functions/_lib/prompts/coleta/cadastro/*.js # base prompt v2 do Sub-3.1
functions/_lib/prompts/coleta/proposta/*.js # base prompt v2 do Sub-3.2
```

### Files EDITADOS

```
functions/api/agent/agents/tattoo.js     # EDIT -- enum + payload + invariant linha
functions/api/agent/agents/cadastro.js   # EDIT -- mesmo
functions/api/agent/agents/proposta.js   # EDIT -- mesmo
functions/api/agent/router.js            # EDIT -- NEXT_STATE ganha entries enviar_portfolio
functions/api/agent/route.js             # EDIT -- pre-fetch helper + case enviar_portfolio
functions/_lib/prompts/coleta/tattoo/decisao.js     # EDIT -- 1 bloco regra portfolio
functions/_lib/prompts/coleta/cadastro/decisao.js   # EDIT -- mesmo
functions/_lib/prompts/coleta/proposta/decisao.js   # EDIT -- mesmo
functions/_lib/prompts/coleta/tattoo/contexto.js    # EDIT -- injeta portfolio_disponivel
functions/_lib/prompts/coleta/cadastro/contexto.js  # EDIT -- mesmo
functions/_lib/prompts/coleta/proposta/contexto.js  # EDIT -- mesmo
```

### Files NOVOS

```
functions/api/agent/_lib/prefetch-portfolio.js   # NOVO -- helper isolado
tests/agent/_lib/prefetch-portfolio.test.mjs     # NOVO -- 4 unit tests TDD
tests/agent/portfolio-intent.eval.mjs            # NOVO -- 9 cenarios eval
tests/route/portfolio-orchestrator.test.mjs      # NOVO -- unit do branch case
```

### Tools existentes -- INTOCADAS

```
functions/api/tools/enviar-portfolio.js  # filtro substring atual permanece
```

NAO mexer. Sub-4 cutover decide depois se rewrite ou keep.

---

## Arquitetura

### Fluxo end-to-end

```
1) Cliente envia: "tem como mandar uns trabalhos seus?"
2) route.js POST /api/agent/route recebe { tenant_id, telefone, mensagem,
   estado_atual, dados_acumulados, historico, ... }
3) route.js carrega contexto:
   - tenant (ja existente)
   - dados_tattoo, dados_cadastro (ja existente)
   - prefetchPortfolio(env, tenant) -> { portfolio_disponivel: boolean }   <- NOVO
   - prefetchPropostaContext(...) (so se estado_atual em proposta substates)
4) route.js seleciona builder por estado_atual (router.js intacto)
5) Agent roda com clientContext incluindo portfolio_disponivel
6) Agent retorna structured output:
   {
     resposta_cliente: "Show, te mando alguns trabalhos do estilo X!",
     proxima_acao: 'enviar_portfolio',
     payload_portfolio: { estilo: 'fineline', max: 5, motivo: '...' },
     dados_persistidos: { ... },
     dados_completos: ...,
     campos_faltando: [],
     campos_conflitantes: []
   }
7) Validator hard-fail se proxima_acao='enviar_portfolio' E
   clientContext.portfolio_disponivel=false (regra do prompt furada)
8) route.js orchestrator switch case 'enviar_portfolio':
   a) callTool(env, 'enviar-portfolio', {tenant_id, estilo, max})
   b) Recebe { ok, urls, total, motivo? }
   c) Se !r.ok ou urls.length=0: degrade graceful -- urls_portfolio=[]
   d) estado_novo = estado_atual (nao muda fase)
9) Response final:
   {
     ok: true,
     resposta_cliente: "Show, te mando alguns trabalhos do estilo fineline!",
     urls_portfolio: ["https://...1.jpg", "https://...2.jpg", ...],
     estado_novo: "tattoo",
     dados_persistidos: { ... },
     proxima_acao: "enviar_portfolio",
     agent_usado: "tattoo"
   }
```

### Arquivos novos detalhados

#### `functions/api/agent/_lib/prefetch-portfolio.js`

```javascript
// Helper isolado -- carrega portfolio_disponivel do tenant.
// Retorna boolean derivado de tenant.portfolio_urls.length > 0.
//
// Usado por route.js antes de rodar qualquer agent (3 fases).
// Reusa fetch do tenant ja feito por outros pre-fetches quando possivel.
//
// Body: { env, tenant }  -- tenant pode vir ja-fetchado de outro pre-fetch
// Return: { portfolio_disponivel: boolean }

export async function prefetchPortfolio(env, tenant) {
  if (!tenant) return { portfolio_disponivel: false };
  const urls = Array.isArray(tenant.portfolio_urls) ? tenant.portfolio_urls : [];
  return { portfolio_disponivel: urls.length > 0 };
}
```

Trivial -- mas isolado em helper pra:
1. Testabilidade (4 unit tests TDD: tenant null / portfolio null / vazio / com urls)
2. Symmetry com `prefetchPropostaContext` (pattern Sub-3.2)
3. Espaco pra crescer no futuro (filtro por categoria, vision, etc.) sem rasgar route.js

#### `tests/agent/_lib/prefetch-portfolio.test.mjs`

```javascript
// 4 cenarios TDD:
// 1) tenant null -> portfolio_disponivel=false
// 2) tenant com portfolio_urls=null -> false
// 3) tenant com portfolio_urls=[] -> false
// 4) tenant com portfolio_urls=['a','b'] -> true
```

#### `tests/agent/portfolio-intent.eval.mjs`

9 cenarios end-to-end calling OpenAI real com `gpt-4o-mini`:

| TC | Agent | Estado_atual | Mensagem cliente | dados_acumulados | portfolio_disponivel | proxima_acao esperada | payload.estilo |
|---|---|---|---|---|---|---|---|
| TC-PORT-01 | tattoo | tattoo | "tem como mandar uns trabalhos seus?" | (vazio) | true | enviar_portfolio | null |
| TC-PORT-02 | tattoo | tattoo | "queria ver fineline" | { descricao: "rosa" } | true | enviar_portfolio | "fineline" |
| TC-PORT-03 | tattoo | tattoo | "manda fotos pra eu ver" | (vazio) | **false** | pergunta (canned msg menciona "ainda nao temos") | n/a |
| TC-PORT-04 | cadastro | cadastro | "antes me mostra trabalhos" | { dados_tattoo: complete } | true | enviar_portfolio | null |
| TC-PORT-05 | cadastro | cadastro | "tem instagram?" | { dados_tattoo: complete } | true | enviar_portfolio | null |
| TC-PORT-06 | cadastro | cadastro | "manda fotos" | (vazio) | **false** | pergunta (canned) | n/a |
| TC-PORT-07 | proposta | propondo_valor | "antes me mostra mais um trabalho" | { valor_proposto: 750 } | true | enviar_portfolio | null |
| TC-PORT-08 | proposta | escolhendo_horario | "queria ver mais blackwork antes" | { horarios_livres: [...] } | true | enviar_portfolio | "blackwork" |
| TC-PORT-09 | proposta | aguardando_sinal | "manda mais um exemplo" | (vazio) | true | enviar_portfolio | null |

Custo eval: ~$0.005 (`gpt-4o-mini` 9 turns ~1.5k tokens cada).

#### `tests/route/portfolio-orchestrator.test.mjs`

Unit tests do branch case 'enviar_portfolio' em route.js (sem chamar OpenAI). Stub callTool, valida que params batem com payload_portfolio:

- callTool e chamado com {tenant_id, estilo, max} corretos
- urls_portfolio na response = body retornado por callTool
- estado_novo = estado_atual
- Tool 5xx -> urls_portfolio=[] (degrade graceful)
- portfolio_disponivel=false E proxima_acao='enviar_portfolio' -> validator hard-fail antes de route.js chegar no switch (testa via stub do builder)

### Mudancas em files existentes

#### `functions/api/agent/agents/tattoo.js`, `cadastro.js`, `proposta.js`

```javascript
// Schema Zod -- adicionar enum + payload opcional
const TattooOutputSchema = z.object({
  // ...campos existentes...
  proxima_acao: z.enum([
    'pergunta',
    'handoff',
    'enviar_portfolio',  // NOVO
    'erro',
  ]),
  payload_portfolio: z.object({
    estilo: z.string().nullable().default(null),
    max: z.number().int().min(1).max(10).nullable().default(null),
    motivo: z.string().nullable().default(null),
  }).nullable().default(null),  // NOVO
});

// Validator -- adicionar invariant
function validateTattooOutputInvariantBound(out, clientContext) {
  // ...invariants existentes...
  if (out.proxima_acao === 'enviar_portfolio') {
    if (!clientContext.portfolio_disponivel) {
      throw new Error('INVARIANT: enviar_portfolio com portfolio_disponivel=false');
    }
  }
}
```

Mesmo schema/invariant nos 3 agents. Builder closure pattern (Sub-3.2) ja vincula clientContext ao validator -- so adicionar a regra dentro.

#### `functions/api/agent/router.js`

```javascript
const NEXT_STATE = {
  tattoo:   { handoff: 'cadastro', erro: 'tattoo', enviar_portfolio: 'tattoo' },  // NOVO entry
  cadastro: { handoff: 'aguardando_tatuador', erro: 'aguardando_tatuador', enviar_portfolio: 'cadastro' },
  propondo_valor: {
    pergunta:           'propondo_valor',
    oferecendo_horario: 'escolhendo_horario',
    pediu_desconto:     'aguardando_decisao_desconto',
    adiou:              'lead_frio',
    reagendamento:      'aguardando_tatuador',
    cliente_agressivo:  'aguardando_tatuador',
    enviar_portfolio:   'propondo_valor',  // NOVO
  },
  escolhendo_horario: {
    pergunta:          'escolhendo_horario',
    reservar_horario:  'aguardando_sinal',
    reagendamento:     'aguardando_tatuador',
    cliente_agressivo: 'aguardando_tatuador',
    enviar_portfolio:  'escolhendo_horario',  // NOVO
  },
  aguardando_sinal: {
    pergunta:          'aguardando_sinal',
    reservar_horario:  'aguardando_sinal',
    reagendamento:     'aguardando_tatuador',
    cliente_agressivo: 'aguardando_tatuador',
    enviar_portfolio:  'aguardando_sinal',  // NOVO
  },
};
```

#### `functions/api/agent/route.js`

```javascript
import { prefetchPortfolio } from './_lib/prefetch-portfolio.js';
import { callTool } from './_lib/call-tool.js';

// ANTES de rodar agent (apos fetch do tenant):
const { portfolio_disponivel } = await prefetchPortfolio(env, tenant);

const clientContext = {
  // ...campos existentes...
  portfolio_disponivel,  // NOVO
};

// ...rodar agent...

// Orchestrator switch -- adicionar case
let urls_portfolio = [];
switch (out.proxima_acao) {
  // ...cases existentes...
  case 'enviar_portfolio': {
    const r = await callTool(env, 'enviar-portfolio', {
      tenant_id,
      estilo: out.payload_portfolio?.estilo || null,
      max: out.payload_portfolio?.max || 5,
    });
    if (r.ok) urls_portfolio = r.body?.urls || [];
    estado_novo = estado_atual;  // nao muda fase
    break;
  }
}

// Response final inclui urls_portfolio
return json({
  ok: true,
  resposta_cliente,
  estado_novo,
  dados_persistidos,
  proxima_acao: out.proxima_acao,
  agent_usado: estado_atual,
  urls_portfolio,  // NOVO -- array vazio se intent nao foi enviar_portfolio
});
```

#### `functions/_lib/prompts/coleta/{tattoo,cadastro,proposta}/decisao.js`

Adicionar 1 bloco em cada (~6 linhas) explicando a regra:

```
## Cliente pediu portfolio / trabalhos / fotos / instagram

Se cliente pedir pra ver trabalhos / portfolio / exemplos / fotos / instagram / referencias do tatuador:

1. **Se `contexto.portfolio_disponivel=true`**:
   - Defina `proxima_acao='enviar_portfolio'`
   - `payload_portfolio.estilo`:
     * Se cliente mencionou estilo na mensagem atual ("queria ver fineline") -> use esse estilo.
     * Se cliente nao mencionou MAS dados_tattoo.estilo ja foi coletado E tem relacao com a mensagem (cliente pede "mais trabalhos parecidos") -> use o estilo coletado.
     * Caso contrario -> deixe null (tool retorna mix do portfolio).
   - `payload_portfolio.max`: deixe null (default 5 da tool).
   - `resposta_cliente`: prosa curta e natural, ex: "Show, te mando alguns trabalhos!" ou "Beleza, te mando uns exemplos de fineline!". Nao prometa quantidade exata. Apos enviar, siga o fluxo normal da fase no proximo turno.

2. **Se `contexto.portfolio_disponivel=false`**:
   - Defina `proxima_acao='pergunta'` (NAO 'enviar_portfolio')
   - `resposta_cliente`: explique gentilmente que ainda nao temos portfolio cadastrado, e siga o fluxo da fase. Ex: "Ainda estamos montando o portfolio aqui no chat -- mas posso seguir com [<o que faria normalmente>]?".
```

#### `functions/_lib/prompts/coleta/{tattoo,cadastro,proposta}/contexto.js`

Adicionar 1 linha injetando o flag:

```javascript
linhas.push(`portfolio_disponivel: ${clientContext.portfolio_disponivel ? 'true' : 'false'}`);
```

(Posicao: junto com outros flags do contexto. Sub-3.1 e Sub-3.2 ja tem padrao de injecao de flags booleans.)

---

## Schema do payload_portfolio (Zod puro)

```typescript
{
  estilo: string | null,    // estilo coletado/mencionado pelo cliente
  max:    number | null,    // 1-10, default 5 da tool
  motivo: string | null,    // free-form pra log/debug (eval inspecciona)
}
```

Lesson Sub-3.1: usar `.nullable().default(null)` (NAO `.optional()`) pra evitar 400 do SDK quando agent nao manda o campo.

Validator hard-fails so se `proxima_acao='enviar_portfolio'` E `payload_portfolio` for null inteiro (significa agent quebrou contrato).

---

## Tabela de decisao -- 3 agents

| Estado | Sinal cliente | portfolio_disponivel | proxima_acao | payload_portfolio.estilo | resposta_cliente |
|---|---|---|---|---|---|
| tattoo | "manda fotos" | true | enviar_portfolio | null | prosa curta "te mando ja!" |
| tattoo | "tem fineline?" | true | enviar_portfolio | "fineline" | "te mando uns trabalhos de fineline!" |
| tattoo | "manda fotos" | false | pergunta | n/a | "ainda nao temos portfolio cadastrado, posso seguir com [...]" |
| cadastro | "antes me mostra trabalhos" | true | enviar_portfolio | null | "show, te mando!" |
| cadastro | "tem instagram?" | true | enviar_portfolio | null | "te mando uns exemplos!" |
| proposta (qq sub-estado) | "queria ver mais um exemplo" | true | enviar_portfolio | null | "claro, te mando" |
| proposta (qq sub-estado) | "manda fotos" | false | pergunta | n/a | "ainda nao temos exemplos cadastrados, mas [...]" |

---

## Riscos e assumptions

| # | Risco | Probabilidade | Mitigacao |
|---|---|---|---|
| R1 | LLM gera `enviar_portfolio` quando cliente NAO pediu (false positive) | media | Eval invariant (TC-PORT-03/06): cliente sem mencionar trabalhos -> proxima_acao != enviar_portfolio. Prompt explicita gatilhos exatos (trabalhos / portfolio / fotos / exemplos / instagram / referencias) |
| R2 | LLM gera `enviar_portfolio` mas portfolio_disponivel=false | baixa | Validator hard-fail (paridade enforceMenorIdade). Eval TC-PORT-03/06 cobre |
| R3 | Cliente pede portfolio em loop, agent manda 5x | baixa | LLM via historico decide. Sem persistencia no Sub-3.3. Se virar problema observado em prod, P2 separado |
| R4 | Tool `enviar-portfolio` falha (5xx / 401) | baixa | Degrade graceful: urls_portfolio=[] na response. Agent na proxima rodada ve historico (mensagem prometeu, nada chegou) e adapta |
| R5 | Estilo passado nao casa com nenhuma URL | media | Tool ja faz fallback (`if matches.length > 0 filtrados = matches; else filtrados = urls`) -- comportamento atual mantido |
| R6 | Pre-fetch adiciona overhead em todos os turnos | baixa | Tenant ja e fetchado por outros pre-fetches. Helper deriva boolean de campo ja em memoria. Custo: zero queries extras |
| R7 | Response com urls_portfolio quebra contrato hot-path | media | Sub-4 absorve. Sub-3.3 testa com smoke local + curl. Adicionar campo opcional na response e backwards-compatible (consumers ignoram o que nao conhecem) |

**Assumptions a confirmar no plan:**

- A1: tenant chega via payload (`body.tenant`) em Sub-3.3 (paridade Sub-1/2/3 -- stub no smoke; Sub-4 vai puxar do Supabase no hot-path). Helper `prefetchPortfolio` so deriva boolean de `tenant.portfolio_urls.length`. NAO faz SELECT proprio nesta sub-feature.
- A2: callTool ja envia `X-Inkflow-Tool-Secret` corretamente (Sub-3.2 confirmou). enviar-portfolio.js requer esse header.
- A3: SDK @openai/agents trata `payload_portfolio: null` no schema Zod sem 400 (paridade Sub-3.1 data_nascimento nullable).
- A4: Smoke local injeta `tenant.portfolio_urls` no payload conforme cenario (TC-PORT-01 ate 09 com URLs ou vazio).

---

## Out of scope (cravado, NAO re-debater)

1. Video no portfolio -- sub-feature separada quando upload na pagina-tatuador resolver
2. PortfolioAgent LLM real -- so se filtro substring virar problema (KPI: matches vazios + cliente reclamar)
3. Throttle persistido (cliente pediu portfolio 5x na mesma conversa)
4. Refator da tool `enviar-portfolio.js`
5. Vision/IA pra match de imagens com descricao da tatuagem
6. Cutover Evolution/n8n pra enviar URLs como midia (Sub-4)
7. Bug-fix botao Telegram, parcelamento, reentry agent (continuacao do Sub-3.2 out)
8. Detalhes de UI da pagina-tatuador upload de portfolio
9. Categorizacao por estilo/tags na DB (hoje e substring na URL)

---

## Gates pra Sub-3.3 -> done

1. ✅ 9 evals novos passam (`gpt-4o-mini`, custo ~$0.005)
2. ✅ Total eval suite Sub-2 + Sub-3.1 + Sub-3.2 + Sub-3.3 continua verde (regression check)
3. ✅ Unit tests prefetch-portfolio (4 cenarios) verde
4. ✅ Unit tests portfolio-orchestrator branch (route.js) verde
5. ✅ Smoke local: `wrangler pages dev` + curl POST com 9 cenarios retornam contrato esperado (urls_portfolio populado / vazio conforme caso)
6. ✅ DoD checklist (`/dod`) antes de PR
7. ✅ PR aprovado por 1 reviewer (paridade Sub-3.1/3.2)

---

## Custo estimado

- **Linhas de codigo:** ~150 (helpers + edits) + ~300 tests + ~50 prompt = ~500 linhas total
- **Tempo de implementacao:** 1 sessao (~2-3h se prompts ja v2 estaveis)
- **Custo eval:** ~$0.005 (suite 9 cenarios `gpt-4o-mini`)
- **Risco de regression:** baixo -- esquema cresce additive (enum novo + campo opcional), nao rasga contratos existentes

---

## Conexao com proximas sub-features

- **Sub-4 (cutover hot-path):** absorve consumo de `urls_portfolio` na response. n8n/Evolution (ou substituto direto em CF Workers) precisa enviar cada URL como midia separada via `POST /message/sendMediaMessage`.
- **Sub-3.3-bis (futuro):** PortfolioAgent LLM real, se filtro substring virar problema observado.
- **P2 backlog:** throttle persistido, video no portfolio, categorizacao por estilo na DB.
