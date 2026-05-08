# Sub-3.1 — CadastroAgent prompt v2 pure structured-output (design)

**Data:** 2026-05-08
**Branch base:** `main` @ `b0812df` (pos-merge PR #56 / Sub-2 TattooAgent v2)
**Status:** `ready-to-plan`
**Predecessor:** [TattooAgent v2 rewrite spec](./2026-05-08-coleta-tattoo-prompt-v2-rewrite-design.md), [audit Fase 9 sintese](../audit/2026-05-08-coleta-multi-agent-prompt-audit.md#fase-9--sintese--priorizacao-executada-2026-05-08)
**Eval baseline:** Sub-2 10/10 + 312/312 CI (`gpt-4o-mini`)

---

## Como comecar a sessao nova

Numa sessao fresca, abra o repo `inkflow-saas`, garanta que esta na branch `main` (atualizada), e use o prompt:

```
/plan

Spec: docs/superpowers/specs/2026-05-08-sub3-cadastro-prompt-v2-design.md

Esse spec e o Sub-3.1 do refator multi-agent: aplicar template do TattooAgent v2
(pure structured-output, zero tools) ao CadastroAgent. Espelha estrutura,
naming, schema-pattern e eval-pattern do Sub-2. Stub in-memory mantido —
cutover Supabase/Telegram fica pro Sub-4.

Escopo cravado pelo brainstorm:
- So CadastroAgent (Proposta = Sub-3.2, Portfolio = Sub-3.3)
- Paridade total Sub-2 (sem efeito real)
- Validacao idade/data via route.js pos-output (helper enforceMenorIdade)
- Sobrescrever generate.js direto (n8n off em producao)

Saida esperada: docs/superpowers/plans/2026-05-08-sub3-cadastro-prompt-v2.md
com tasks granulares (Edit/Write precisos, eval gate como acceptance, commits per task).
```

---

## TL;DR

CadastroAgent legacy (`functions/_lib/prompts/coleta/cadastro/{generate,fluxo,regras,few-shot}.js`) foi portado lift-and-shift do n8n single-agent: 5 camadas, 3 tools (`dados_coletados`, `enviar_orcamento_tatuador`, `acionar_handoff`) com mesmo bug latente que o Tattoo tinha — **dual-via de persistencia entre tool HTTP e structured output causa hallucination e loop em mini**. Sub-2 audit Fase 9 cravou: aplicar pure structured-output (sem tools) aos outros agents.

Esta spec faz o **CadastroAgent v2** seguindo o template do Tattoo v2:
- 8 camadas limpas (~1500-1800 tokens estimados, vs ~2200 legacy)
- Schema Zod proprio (`CadastroOutputSchema`) com `dados_persistidos = { nome, data_nascimento, email }`
- Tabela de decisao explicita (10 linhas, eixos OBR × Conflito × Email × Trigger)
- Validacao pos-output via 2 helpers: `validateCadastroOutputInvariant` (em agents/cadastro.js) + `enforceMenorIdade` (em route.js)
- Eval suite 9 cenarios (TC-C01..TC-C09) cobrindo tabela 1:1
- Router generalizado: `selectAgentValidator(estado)` + `getNextState(estado, out)` substituem switch hardcoded em route.js

PropostaAgent / PortfolioAgent rewrites sao **out-of-scope** desta sessao — viram Sub-3.2 e Sub-3.3 com mesmo template.

---

## Por que rewrite, nao tuning

Sub-2 ja provou empiricamente que tool-calling com gates nao escala em mini para coleta progressiva — bug arquitetural (dual-via persistencia) so resolve com remocao de tools, nao tuning. CadastroAgent legacy tem **mesma classe de bug**:

- `dados_coletados` tool valida formato data + calcula idade — mas mini hallucina valores ("Maria Silva", "1990-01-01") pra contornar fail-fast quando schema rejeita.
- `enviar_orcamento_tatuador` tool dispara Telegram + transiciona estado — mesma redundancia que `handoff_to_cadastro` tinha (state-via-tool ao inves de state-via-output).
- `acionar_handoff` tool tem 3 motivos (`cliente_recusa_cadastro`, `data_invalida_persistente`, `menor_idade`) — todos resolveis via `proxima_acao='erro'` + helper pos-output.

Tuning incremental nao resolve estruturalmente — consolida o ruido. Sub-2 fase 9 doc explicita: "GO total → cutover n8n destrava integral. Considerar como follow-up Sub-3: aplicar mesma estrategia (pure structured-output, sem tools) aos outros agents."

### Diff vs CadastroAgent legacy

| | Legacy (n8n single-agent) | Sub-3.1 v2 |
|---|---------------------------|------------|
| Tools por turno | 3 (`dados_coletados`, `enviar_orcamento_tatuador`, `acionar_handoff`) | **0** |
| Estado conversacional | `coletando_cadastro` (1 estado) — OK | `cadastro` (1 estado) — OK |
| Camadas prompt | 9 (`identidade`, `checklistCritico`, `tom`, `fluxo`, `regras`, `contexto`, `faq`, `fewShotTenant`, `fewShotBase`) | **8** (`identidade`, `contexto`, `objetivo`, `decisao`, `faq`, `tom`, `exemplos`, `fewShotTenant`) |
| Tokens estimados | ~2200 | **~1500-1800** |
| Validacao idade | Tool `dados_coletados` faz | **Helper route.js pos-output** (`enforceMenorIdade`) |
| Validacao formato data | Tool faz, retorna `gatilho="data_invalida"` | **Pos-output em invariante** (sem regex no schema — pattern Sub-2) |
| Encerramento | Tool `enviar_orcamento_tatuador` (efeito Telegram + state) | **Output `proxima_acao='handoff'`** (route.js mapeia estado_novo='aguardando_tatuador') |

---

## Stack + constraints tecnicos

### Runtime

- **Cloudflare Pages Functions** (V8 isolate, cold start ~30ms, sem state global).
- **Node.js compat layer** ativo.
- **OpenAI Agents SDK** (`@openai/agents@0.1.0`).
- **Modelo:** `gpt-4o-mini` (paridade Sub-2).
- **Output:** structured via Zod `outputType`. Schema obrigatorio ZodObject puro (sem `.refine()`/`.transform()` — viram ZodEffects e Responses API rejeita 400). Bug confirmado em Sub-2.
- **Tools:** **zero** (whitelist enforced em `agents/cadastro.js` com array vazio).

### Eval suite

- **Local:** `tests/agent/cadastro-agent.eval.mjs` (NOVO — clone estrutural do `tattoo-agent.eval.mjs`).
- **Fixtures:** `tests/agent/_fixtures/scenarios-cadastro.json` (NOVO — 9 cenarios).
- **Run:** `OPENAI_API_KEY=... node --test tests/agent/cadastro-agent.eval.mjs` (nao roda em CI, glob exclusivo igual Tattoo).
- **Custo:** ~$0.025 full suite com mini.
- **Assertion pattern:** via `result.finalOutput.dados_persistidos[campo]` + `proxima_acao` (igual Sub-2 pos-fix `dados_persistidos` check value not key).

### Pricing reference

- gpt-4o-mini: $0.15/M input, $0.60/M output (atual)
- gpt-4o: $2.50/M input, $10.00/M output (upgrade-only se v2 nao passar 9/9)

Cadastro tipico 2-4 turns × 2k tokens/turn × 100 conversas/mes:
- mini: ~$0.20/mes
- 4o: ~$5/mes
- diff: $4.80/mes — irrelevante.

---

## Tenant config interface (o que o prompt v2 vai consumir)

| Campo | Tipo | Default | Uso no v2 |
|-------|------|---------|-----------|
| `tenant.nome_estudio` | string | "estudio" | §1 IDENTIDADE |
| `tenant.nome_agente` | string | "atendente" | §1 IDENTIDADE |
| `tenant.config_agente.persona_livre` | string | descricao default | §1 IDENTIDADE |
| `tenant.config_agente.tom` | enum | undefined | §6 TOM (reusa _shared) |
| `tenant.config_agente.emoji_level` | enum | "raro" | §6 TOM |
| `tenant.config_agente.usa_giria` | boolean | undefined | §6 TOM |
| `tenant.config_agente.expressoes_proibidas` | string[] | (lista default) | §6 TOM |
| `tenant.config_agente.frases_naturais` | object | undefined | §6 TOM |
| `tenant.config_agente.usa_identificador` | boolean | undefined | §6 TOM |
| `tenant.faqs` | array | [] | §5 FAQ (cap 10 entries) |
| `tenant.fewshots_por_modo.coleta_cadastro` | array | [] | §7B FEWSHOT_TENANT (cap 10 — plan stage confirma) |
| `conversa.dados_cadastro` | object | {} | §2 CONTEXTO (dados ja coletados) |
| `conversa.dados_coletados` | object | {} | §2 CONTEXTO (referencia pra resposta-ponte do Tattoo) |
| `conversa.estado_agente` | enum | "cadastro" | sempre "cadastro" no CadastroAgent |
| `clientContext.eh_recorrente` | boolean | undefined | §2 CONTEXTO |
| `clientContext.nome_cliente` | string | undefined | §2 CONTEXTO (pre-fill nome se cliente recorrente) |

**Nao usado no v2:** `config_precificacao.modo`, `gatilhos_handoff` (so Tattoo), `aceita_cobertura` (so Tattoo), `is_first_contact` (Cadastro entra apos Tattoo, nunca e first_contact).

---

## Out-of-scope desta sessao

- **PropostaAgent rewrite** — Sub-3.2 separado (spec novo apos Sub-3.1 merged).
- **PortfolioAgent** — Sub-3.3 separado (precisa desenhar do zero, nao existe nada).
- **Cutover Supabase real** — Sub-4. route.js continua stub in-memory recebendo `dados_acumulados` no body.
- **Telegram real pro tatuador** — Sub-4 (substitui `enviar_orcamento_tatuador`).
- **Comportamento bot em `aguardando_tatuador`** — Sub-4. Sub-3.1 deixa cliente em estado bloqueado; proximas msgs retornam HTTP 501 do route.js (estado nao implementado).
- **Eval suite migration pra CI** — runner continua manual com `OPENAI_API_KEY=...`.
- **Modelo upgrade `gpt-4o`** — so se Sub-3.1 nao passar 9/9 com mini.
- **Modo Exato** (legacy n8n) — nao consome `coleta/cadastro/*` (consome `exato/generate.js`). Intocado.

---

## Architecture v2

### Camadas (8 totais)

```
┌──────────────────────────────────────────────────────────┐
│ §1 IDENTIDADE          (~80 tokens)   estatico por tenant│
├──────────────────────────────────────────────────────────┤
│ §2 CONTEXTO            (~120 tokens)  varia por turno    │
├──────────────────────────────────────────────────────────┤
│ §3 OBJETIVO            (~50 tokens)   estatico           │
├──────────────────────────────────────────────────────────┤
│ §4 DECISAO_E_REGRAS    (~600 tokens)  CORE — tabela      │
├──────────────────────────────────────────────────────────┤
│ §5 FAQ                 (~50-200)      opcional, tenant   │
├──────────────────────────────────────────────────────────┤
│ §6 TOM                 (~250 tokens)  reusa _shared      │
├──────────────────────────────────────────────────────────┤
│ §7 EXEMPLOS            (~400 tokens)  estatico (6 demos) │
├──────────────────────────────────────────────────────────┤
│ §7B FEWSHOT_TENANT     (~0-300)       opcional, tenant   │
└──────────────────────────────────────────────────────────┘
                                          TOTAL ~1500-1800
```

### Files NOVOS (8)

```
functions/api/agent/agents/cadastro.js                          (~80 linhas)
functions/api/agent/_lib/enforce-menor-idade.js                 (~30 linhas)
functions/_lib/prompts/coleta/cadastro/identidade.js            (~10 linhas)
functions/_lib/prompts/coleta/cadastro/contexto.js              (~50 linhas)
functions/_lib/prompts/coleta/cadastro/objetivo.js              (~10 linhas)
functions/_lib/prompts/coleta/cadastro/decisao.js               (~150 linhas — CORE)
functions/_lib/prompts/coleta/cadastro/faq.js                   (~15 linhas)
functions/_lib/prompts/coleta/cadastro/exemplos.js              (~80 linhas)

tests/agent/cadastro-agent.eval.mjs                             (clone tattoo-agent.eval.mjs)
tests/agent/_fixtures/scenarios-cadastro.json                   (9 cenarios)
tests/agent/enforce-menor-idade.test.mjs                        (4 unit tests)
tests/agent/router.test.mjs                                     (3-4 unit tests pra getNextState)
```

### Files EDITADOS (3)

```
functions/_lib/prompts/coleta/cadastro/generate.js   — reescreve, importa novos blocos
functions/api/agent/router.js                        — adiciona cadastro: VALIDATORS + NEXT_STATE
functions/api/agent/route.js                         — usa selectAgentValidator + getNextState + enforceMenorIdade
```

### Files NAO TOCADOS

- `functions/_lib/prompts/coleta/cadastro/{fluxo,regras,few-shot}.js` — orfaos no diretorio (mesma estrategia Sub-2 com tattoo legacy: mantidos pra simetria, sem importer).
- `functions/_lib/prompts/coleta/proposta/*` — out-of-scope (Sub-3.2).
- `functions/_lib/prompts/coleta/tattoo/*` — Sub-2 ja fez.
- `functions/_lib/prompts/_shared/*` — intocados.
- `functions/api/tools/*` — todas mantidas (n8n + modo Exato ainda usam algumas; Sub-4 limpa).
- `functions/api/agent/agents/tattoo.js` — intocado (Sub-2 selado).

---

## Schema + invariantes

### `CadastroOutputSchema` (clone estrutural do TattooOutputSchema)

```javascript
import { z } from 'zod';

export const CadastroOutputSchema = z.object({
  resposta_cliente: z.string().min(1),

  // Mesma regra Responses API: nullable + optional juntos.
  // SEM regex em data_nascimento — formato validado pos-output em
  // validateCadastroOutputInvariant (pattern Sub-2: schema fica ZodObject puro,
  // .regex() poderia virar ZodEffects em SDK futuro). Agent emite ISO; se falhar,
  // invariante reverte pra pergunta.
  dados_persistidos: z.object({
    nome: z.string().nullable().optional(),
    data_nascimento: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
  }),

  dados_completos: z.boolean(),
  campos_faltando: z.array(z.string()),
  campos_conflitantes: z.array(z.string()),
  email_recusado: z.boolean(),                    // unico campo extra vs Tattoo
  proxima_acao: z.enum(['pergunta', 'handoff', 'erro']),
});
```

**Diffs vs TattooOutputSchema:**
- 3 campos em `dados_persistidos` (nome/data_nascimento/email) vs 7 do Tattoo
- `email_recusado: boolean` — flag nova (sempre setada, true OU false). Sinaliza pro route.js que email e opt-out (nao fica em `campos_faltando`).
- `dados_completos=true` exige `nome` E `data_nascimento` populados E (`email` populado OU `email_recusado=true`).

### `validateCadastroOutputInvariant` (em agents/cadastro.js)

```javascript
export function validateCadastroOutputInvariant(out) {
  if (!out || typeof out !== 'object') {
    return { valid: false, reason: 'output ausente ou nao-objeto' };
  }

  // Validacao pos-output do formato ISO de data_nascimento.
  // Se mini emitir formato errado (ex: "12/03/1995"), reverte pra pergunta —
  // route.js nao quebra, fluxo continua.
  const dn = out.dados_persistidos?.data_nascimento;
  if (dn && !/^\d{4}-\d{2}-\d{2}$/.test(dn)) {
    return { valid: false, reason: `data_nascimento nao-ISO: ${dn}` };
  }

  if (out.proxima_acao === 'handoff') {
    if (out.dados_completos !== true) {
      return { valid: false, reason: 'handoff com dados_completos=false' };
    }
    if (!out.dados_persistidos?.nome) {
      return { valid: false, reason: 'handoff sem nome' };
    }
    if (!out.dados_persistidos?.data_nascimento) {
      return { valid: false, reason: 'handoff sem data_nascimento' };
    }
    if (!out.dados_persistidos?.email && out.email_recusado !== true) {
      return { valid: false, reason: 'handoff sem email nem email_recusado=true' };
    }
    if (Array.isArray(out.campos_conflitantes) && out.campos_conflitantes.length > 0) {
      return { valid: false, reason: `handoff com campos_conflitantes: ${out.campos_conflitantes.join(',')}` };
    }
  }

  return { valid: true };
}
```

### `enforceMenorIdade` (em functions/api/agent/_lib/enforce-menor-idade.js)

```javascript
export function calcIdade(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

export function enforceMenorIdade(out) {
  const idade = calcIdade(out?.dados_persistidos?.data_nascimento);
  if (idade !== null && idade < 18) {
    return {
      ...out,
      proxima_acao: 'erro',
      resposta_cliente:
        'Pra clientes com menos de 18 anos o tatuador conversa direto com o responsavel legal — ja sinalizei pra ele.',
      campos_faltando: [...(out.campos_faltando || []), 'menor_idade_trigger'],
    };
  }
  return out;
}
```

route.js aplica `enforceMenorIdade` **apos** `validateCadastroOutputInvariant`, somente quando `estado_atual === 'cadastro'` (Tattoo nao tem data_nascimento).

---

## §4 — Tabela de decisao (CORE)

### Eixos (4 dimensoes)

- **OBR coletado:** `vazio` (0/2) / `parcial` (1/2 — so nome OU so data) / `completo` (2/2)
- **Conflito presente:** `nao` (campos consistentes) / `sim` (cliente mandou 2 nomes ou 2 datas diferentes — R6 ativada)
- **Email status:** `pendente` (nao perguntado) / `presente` (forneceu) / `recusado` (R5 — opt-out detectado)
- **Trigger persistente:** `nao` / `recusa_persistente` (≥2x recusou cadastro no historico) / `data_invalida_persistente` (≥2 tentativas falhas) / `off_topic` (cliente desviou pra tema tecnico)

**Importante:** `menor_idade` **nao entra na tabela do agent** — e validado pos-output via `enforceMenorIdade` no route.js. Agent nao calcula idade (pattern Sub-2: agent decide intent + estrutura, helpers validam).

**1ª-vez vs persistente:** 1ª recusa OU 1ª tentativa de data invalida NAO disparam linha de trigger — caem em linha normal (`pergunta` com reformulacao). Trigger so dispara apos historico mostrar 2 ocorrencias. Isso simplifica a tabela e evita ambiguidade pro mini.

### Tabela completa (10 linhas)

| # | OBR | Conflito | Email | Trigger | proxima_acao | Resposta esperada | TC |
|---|-----|----------|-------|---------|--------------|-------------------|-----|
| 1 | vazio | nao | pendente | nao | `pergunta` | direto: "Pra liberar teu orcamento, me passa nome completo e data de nascimento" (NAO repete msg-ponte do Tattoo) | TC-C01 |
| 2 | parcial | nao | pendente | nao | `pergunta` | persiste o que veio, pergunta o que falta | TC-C02 |
| 3 | completo | nao | pendente | nao | `pergunta` | "E o e-mail?" (UMA vez, neutro) | TC-C03 |
| 4 | completo | nao | recusado | nao | `handoff` | mensagem final | TC-C04 |
| 5 | completo | nao | presente | nao | `handoff` | mensagem final | TC-C05 |
| 6 | * | sim | * | nao | `pergunta` | devolve contradicao em 1 frase, NAO persiste campo conflitante | TC-C08 |
| 7 | * | * | * | recusa_persistente | `erro` | "Vou passar pro tatuador continuar contigo direto" | TC-C06 |
| 8 | * | * | * | data_invalida_persistente | `erro` | "Vou passar pro tatuador continuar contigo direto" | TC-C07 |
| 9 | * | * | * | off_topic | `pergunta` | responde brevemente, retoma cadastro | TC-C09 |
| 10 | vazio | sim | * | * | (impossivel: sem dados, sem conflito) | — | N/A |

(9 linhas validas + 1 impossivel marcada.)

### §4.1 Texto literal (a colocar em decisao.js)

```markdown
# §4 DECISAO E REGRAS

## §4.1 Tabela de decisao (siga LITERALMENTE)

[Mesma tabela acima, 10 linhas, formato markdown]

## §4.2 Como interpretar cada eixo

**OBR (Obrigatorios):** os 2 campos que voce DEVE coletar:
- `nome`: texto livre. Aceita 1 palavra/apelido. NAO insista em "completo" — pode incomodar.
- `data_nascimento`: formato ISO `YYYY-MM-DD`. Voce normaliza ANTES de persistir.
  - Aceitos: "12/03/1995", "12-03-1995", "12 de marco de 1995", "1995-03-12"
  - Rejeitados (NAO persiste): "ontem", "tenho 25 anos", "1995" sozinho, "marco"
- "Vazio" = 0 campos. "Parcial" = 1. "Completo" = 2.

**Conflito:** quando cliente forneceu valores contraditorios pro mesmo campo em mensagens adjacentes.
- Exemplo nome: "Maria Silva" no turno 2 e "Maria Costa" no turno 4.
- Exemplo data: "12/03/1995" no turno 2 e "1995-04-12" no turno 4.
- NUNCA escolha pelo cliente. Devolve contradicao em 1 frase: "Tu disse Maria Silva antes e agora Maria Costa — me confirma o nome certo?"
- Adicione o nome do campo em `campos_conflitantes`. NAO persiste o campo conflitante.

**Email:**
- `pendente`: voce ainda nao perguntou.
- `presente`: cliente forneceu (qualquer formato — voce aceita mesmo invalido).
- `recusado`: cliente disse algum termo de opt-out:
  - "nao tenho", "passa", "sem email", "depois", "deixa pra la", "nao quero", "pula"
  - Outros termos similares de recusa.
  Quando recusado: setar `email_recusado=true`. NUNCA pergunte de novo.

**Trigger persistente:**
- `recusa_persistente`: cliente recusou cadastro ≥2x no historico. Termos: "nao vou passar dados", "nao quero dar nome", "nao informo", repeticoes. 1ª recusa NAO conta — voce reformula na primeira vez. So 2ª+ dispara trigger.
- `data_invalida_persistente`: ≥2 tentativas no historico onde cliente mandou data mas formato indecifravel.
- `off_topic`: cliente faz pergunta tecnica/desvia ("preciso de receita pra anestesia?"). NAO e trigger de erro — voce responde brevemente e retoma cadastro.

## §4.3 Regras de conteudo (R1-R9)

**R1.** NUNCA fala valor monetario nesta fase. Cliente pergunta "quanto fica?" → "Sobre valor o tatuador confirma quando avaliar — pra eu liberar teu orcamento, manda nome e data de nascimento."

**R2.** NAO peca dados ALEM de nome+data_nascimento+email. Sem CPF, telefone, RG, endereco. Se cliente perguntar por que: "Por enquanto e so isso. O tatuador pede o resto presencialmente se precisar."

**R3.** UMA pergunta por turno. EXCECAO turno inicial: pode pedir nome+data juntos pq cliente vem direto da mensagem-ponte do Tattoo.

**R4.** NUNCA persista placeholder/sentinel ("nao quero dar", "pula", "depois", "passa", "—") em `nome` ou `data_nascimento`. Esses termos sinalizam recusa — nao sao valores reais. Em vez disso, deixe `campos_faltando` com o campo e `proxima_acao='pergunta'` pra reformular (ou trigger se persistente).

**R5.** EMAIL OPCIONAL: pergunta UMA VEZ. Se cliente recusar (ver lista de termos em §4.2), seta `email_recusado=true`. NUNCA insiste 2x — bug grave (cliente desiste).

**R6.** CONFLITO: se cliente mandou 2 nomes ou 2 datas diferentes em msgs adjacentes, adiciona campo em `campos_conflitantes`, NAO persiste, devolve contradicao em 1 frase. Ex: "Tu disse 'Maria Silva' antes e agora 'Maria Costa' — me confirma o nome certo?"

**R7.** DATA NASC normalizada pra ISO `YYYY-MM-DD` ANTES de persistir. Se formato indecifravel: NAO persiste, `proxima_acao='pergunta'`, peca no formato dia/mes/ano. Ex: "Nao consegui ler a data — pode mandar tipo 12/03/1995?"

**R8.** EMAIL aceita formato invalido. Se cliente mandou "maria@email" sem .com, persista mesmo. Tatuador valida no orcamento. NAO corrija o cliente.

**R9.** OUTPUT FINAL: apos estruturar, emita JSON UMA vez e PARE. NAO repita raciocinio depois do JSON.
```

### §4.4 Mensagem de encerramento (linhas 4 e 5 — `proxima_acao='handoff'`)

UM balao (Cadastro e mais sucinto que Tattoo, sem 2-baloes):

> "Anotei tudo! Vou enviar pro tatuador avaliar e te volto com o valor em breve."

Em **primeira pessoa**. NAO promete prazo especifico. Sem "vou passar pro tatuador" (viola `_shared/tom.js`).

---

## §1 IDENTIDADE (texto literal)

```javascript
// functions/_lib/prompts/coleta/cadastro/identidade.js
export function identidadeCadastro(tenant) {
  const nomeAg = tenant.nome_agente || 'atendente';
  const nomeEst = tenant.nome_estudio || 'estudio';
  const persona = (tenant.config_agente?.persona_livre || '').trim()
    || 'Brasileira, descontraida, atende bem. Nao formal, mas tambem nao forcadamente informal.';

  return `# §1 IDENTIDADE

Voce e ${nomeAg}, atendente do estudio "${nomeEst}" no WhatsApp.

${persona}`;
}
```

(Identico estruturalmente ao `tattoo/identidade.js` — paridade Sub-2.)

---

## §2 CONTEXTO (texto literal)

```javascript
// functions/_lib/prompts/coleta/cadastro/contexto.js
export function contextoCadastro(tenant, conversa, clientContext) {
  const ctx = clientContext || {};
  const dadosCadastro = conversa?.dados_cadastro || {};
  const dadosColetados = conversa?.dados_coletados || {};

  const linhas = ['# §2 CONTEXTO'];

  // Cliente
  linhas.push('## Cliente');
  if (ctx.eh_recorrente) {
    linhas.push(`- Cliente RECORRENTE — ja conversou antes`);
    if (ctx.nome_cliente && ctx.nome_cliente.trim().length >= 2) {
      linhas.push(`- Nome anterior: ${ctx.nome_cliente}`);
    }
  } else {
    linhas.push('- Cliente acabou de receber mensagem-ponte do Tattoo. NAO se reapresente.');
  }
  linhas.push('');

  // Resumo da fase Tattoo (referencia da resposta-ponte)
  if (Object.keys(dadosColetados).length) {
    linhas.push('## Tattoo escolhida (fase anterior — referencia)');
    if (dadosColetados.descricao_curta) linhas.push(`- ${dadosColetados.descricao_curta}`);
    if (dadosColetados.tamanho_cm) linhas.push(`- ${dadosColetados.tamanho_cm}cm`);
    if (dadosColetados.local_corpo) linhas.push(`- ${dadosColetados.local_corpo}`);
    linhas.push('');
  }

  // Dados ja coletados nesta fase
  const dadosLinhas = [];
  if (dadosCadastro.nome) dadosLinhas.push(`- nome: ${dadosCadastro.nome}`);
  if (dadosCadastro.data_nascimento) dadosLinhas.push(`- data_nascimento: ${dadosCadastro.data_nascimento}`);
  if (dadosCadastro.email) dadosLinhas.push(`- email: ${dadosCadastro.email}`);
  if (dadosCadastro.email_recusado === true) dadosLinhas.push(`- email_recusado: true`);

  if (dadosLinhas.length) {
    linhas.push('## Dados ja coletados (NAO pergunte de novo)');
    linhas.push(...dadosLinhas);
  } else {
    linhas.push('## Dados ja coletados');
    linhas.push('- (nenhum — comece a coleta)');
  }

  return linhas.join('\n');
}
```

---

## §3 OBJETIVO (texto literal)

```javascript
// functions/_lib/prompts/coleta/cadastro/objetivo.js
export const OBJETIVO = `# §3 OBJETIVO

Sua missao nesta fase: coletar 2 dados obrigatorios + 1 opcional do cliente.

1. **nome** (OBR) — nome do cliente (1 palavra ou completo, qualquer um vale)
2. **data_nascimento** (OBR) — em formato ISO YYYY-MM-DD (voce normaliza antes de persistir)
3. **email** (OPC) — pergunta uma vez; se cliente recusar, segue sem

Voce NAO orca, NAO fala valor, NAO agenda, NAO pede dados alem destes 3.
Apos os 2 OBR completos sem conflito + email definido (presente OU recusado),
voce faz handoff pra fase aguardando_tatuador.`;
```

---

## §5 FAQ (opcional)

```javascript
// functions/_lib/prompts/coleta/cadastro/faq.js
export function faqCadastro(tenant) {
  const faqs = Array.isArray(tenant.faqs) ? tenant.faqs : [];
  if (!faqs.length) return ''; // skip block

  const linhas = ['# §5 FAQ DO ESTUDIO'];
  for (const item of faqs.slice(0, 10)) {
    linhas.push(`- **${item.pergunta}** ${item.resposta}`);
  }
  return linhas.join('\n');
}
```

(Cap 10 itens — paridade Tattoo. Plan stage confirma se `few-shot-tenant.js` tambem ja tem cap.)

---

## §6 TOM (importa do shared)

```javascript
// generate.js usa:
import { tom } from '../../_shared/tom.js';
```

(Sem mudanca — mesmo padrao Sub-2.)

---

## §7 EXEMPLOS (texto literal)

6 exemplos cobrindo 6 das 9 linhas validas. Linhas 7/8 (triggers persistentes) e 10 (impossivel) ficam sem exemplo direto — comportamento descrito em prosa em §4.2/§4.3.

```javascript
// functions/_lib/prompts/coleta/cadastro/exemplos.js
export function exemplosCadastro(tenant) {
  const nomeAg = tenant.nome_agente || 'Atendente';
  const nomeEst = tenant.nome_estudio || 'Estudio';

  return `# §7 EXEMPLOS DE CONVERSAS IDEAIS

## Exemplo 1 — Linha 1: entrada da fase, sem dados
\`\`\`
CLIENTE: ok
AGENTE: Pra liberar teu orcamento, me passa nome completo e data de nascimento (e-mail e opcional)
\`\`\`
(proxima_acao=pergunta, dados_persistidos vazios, campos_faltando=['nome','data_nascimento'])

## Exemplo 2 — Linha 2: cliente mandou so nome
\`\`\`
CLIENTE: Maria Silva
AGENTE: Beleza Maria. E a data de nascimento?
\`\`\`
(persiste nome='Maria Silva', proxima_acao=pergunta, campos_faltando=['data_nascimento'])

## Exemplo 3 — Linha 3: completo OBR, sem email
\`\`\`
CLIENTE: 12/03/1995
AGENTE: Anotado. E o e-mail?
\`\`\`
(persiste data_nascimento='1995-03-12' [normalizado pra ISO], proxima_acao=pergunta)

## Exemplo 4 — Linha 4: email recusado, handoff
\`\`\`
CLIENTE: nao tenho email
AGENTE: Anotei tudo! Vou enviar pro tatuador avaliar e te volto com o valor em breve
\`\`\`
(email_recusado=true, dados_completos=true, proxima_acao=handoff)

## Exemplo 5 — Linha 5: tudo de uma vez
\`\`\`
CLIENTE: Maria Silva, 12/03/1995, maria@email.com
AGENTE: Anotei tudo! Vou enviar pro tatuador avaliar e te volto com o valor em breve
\`\`\`
(persiste 3 campos via dados_persistidos [data normalizada pra ISO], dados_completos=true, proxima_acao=handoff)

## Exemplo 6 — Linha 6: conflito de nome
\`\`\`
[turno anterior cliente disse: Maria Silva]
CLIENTE: na verdade e Maria Costa
AGENTE: Tu tinha falado Maria Silva antes — me confirma o nome certo?
\`\`\`
(NAO persiste nome novo, campos_conflitantes=['nome'], proxima_acao=pergunta)
`;
}
```

---

## §7B FEWSHOT_TENANT (reusa legacy)

```javascript
// generate.js usa:
import { fewShotTenant } from './few-shot-tenant.js';
```

Modulo legacy mantido — injeta exemplos custom do tenant via `tenant.fewshots_por_modo.coleta_cadastro`. Plan stage confirma cap 10 entries (similar ao faq.js).

---

## Mudancas em `generate.js`

```javascript
// functions/_lib/prompts/coleta/cadastro/generate.js (REWRITE)
//
// Substitui composicao 9-camadas legacy (checklistCritico + fluxo + regras +
// fewShotBase) por 8 blocos focados em cadastro: identidade, contexto,
// objetivo (north-star), decisao (CORE), faq (opt), tom, exemplos (6),
// fewshot tenant (opt). Pattern Sub-2.
//
// Files legacy (fluxo.js, regras.js, few-shot.js) NAO sao mais importados
// daqui — permanecem no diretorio orfaos (mesma estrategia tattoo Sub-2).
import { identidadeCadastro } from './identidade.js';
import { contextoCadastro } from './contexto.js';
import { OBJETIVO } from './objetivo.js';
import { decisaoCadastro } from './decisao.js';
import { faqCadastro } from './faq.js';
import { tom } from '../../_shared/tom.js';
import { exemplosCadastro } from './exemplos.js';
import { fewShotTenant } from './few-shot-tenant.js';

export function generatePromptColetaCadastro(tenant, conversa, clientContext) {
  const ctx = clientContext || {};
  const blocks = [
    identidadeCadastro(tenant),
    contextoCadastro(tenant, conversa, ctx),
    OBJETIVO,
    decisaoCadastro(tenant),
    faqCadastro(tenant),
    tom(tenant),
    exemplosCadastro(tenant),
    fewShotTenant(tenant),
  ].filter(b => b && b.trim().length > 0);
  return blocks.join('\n\n---\n\n');
}
```

---

## Mudancas em `router.js`

```javascript
// functions/api/agent/router.js (REWRITE)
import { buildTattooAgent, validateTattooOutputInvariant } from './agents/tattoo.js';
import { buildCadastroAgent, validateCadastroOutputInvariant } from './agents/cadastro.js';

const BUILDERS = {
  tattoo: buildTattooAgent,
  cadastro: buildCadastroAgent,
  // Sub-3.2: proposta
  // Sub-3.3: portfolio
};

const VALIDATORS = {
  tattoo: validateTattooOutputInvariant,
  cadastro: validateCadastroOutputInvariant,
};

const NEXT_STATE = {
  // estado_atual → mapping por proxima_acao
  tattoo:   { handoff: 'cadastro',           erro: 'tattoo' /* stay */ },
  cadastro: { handoff: 'aguardando_tatuador', erro: 'aguardando_tatuador' /* trigger sai */ },
};

export function selectAgentBuilder(estado_atual) {
  return BUILDERS[estado_atual] || null;
}

export function selectAgentValidator(estado_atual) {
  return VALIDATORS[estado_atual] || null;
}

export function isStateImplemented(estado_atual) {
  return Boolean(BUILDERS[estado_atual]);
}

export function getNextState(estado_atual, out) {
  const map = NEXT_STATE[estado_atual] || {};
  return map[out?.proxima_acao] || estado_atual;
}
```

**Decisao semantica:** `cadastro + erro → aguardando_tatuador` porque os 3 triggers (`recusa_persistente`, `data_invalida_persistente`, `menor_idade`) terminam fase indo pro tatuador resolver manualmente. `tattoo + erro → tattoo` (stay; cliente em estado bloqueado, Sub-4 cutover decide se vai pra `lead_frio`).

---

## Mudancas em `route.js`

3 mudancas localizadas:

**1. Imports:**
```javascript
// ANTES
import { validateTattooOutputInvariant } from './agents/tattoo.js';
import { selectAgentBuilder, isStateImplemented } from './router.js';

// DEPOIS
import { selectAgentBuilder, selectAgentValidator, isStateImplemented, getNextState } from './router.js';
import { enforceMenorIdade } from './_lib/enforce-menor-idade.js';
```

**2. Validator via dispatcher:**
```javascript
// ANTES
const invariantCheck = validateTattooOutputInvariant(out);

// DEPOIS
const validator = selectAgentValidator(estado_atual);
const invariantCheck = validator(out);
```

**3. enforceMenorIdade + estado_novo generalizado:**
```javascript
// Aplica enforceMenorIdade APOS invariante. So afeta cadastro (helper checa
// data_nascimento; outros estados nao tem o campo, retorna out unchanged).
const enforced = estado_atual === 'cadastro' ? enforceMenorIdade(out) : out;

return json({
  ok: true,
  resposta_cliente: enforced.resposta_cliente,
  estado_novo: getNextState(estado_atual, enforced),    // antes: hardcoded ternary
  dados_persistidos: enforced.dados_persistidos,
  dados_completos: enforced.dados_completos,
  campos_faltando: enforced.campos_faltando,
  campos_conflitantes: enforced.campos_conflitantes,
  proxima_acao: enforced.proxima_acao,
  agent_usado: estado_atual,                             // antes: hardcoded 'tattoo'
}, 200);
```

(`email_recusado` nao precisa entrar na response — caller pode checar `dados_persistidos.email == null && dados_completos == true` se quiser saber.)

---

## Eval suite (9 cenarios)

`tests/agent/_fixtures/scenarios-cadastro.json`:

| TC | Input | Estado entrada | Dados acumulados | Historico | Expected |
|----|-------|----------------|------------------|-----------|----------|
| **TC-C01** | "ok" | `cadastro` | `{}` | (vazio) | `dados_persistidos` vazio, `proxima_acao=pergunta`, mensagem pede nome+data |
| **TC-C02** | "Maria Silva" | `cadastro` | `{}` | (vazio) | `dados_persistidos.nome='Maria Silva'`, `campos_faltando=['data_nascimento']`, `proxima_acao=pergunta` |
| **TC-C03** | "12/03/1995" | `cadastro` | `{nome:'Maria Silva'}` | (vazio) | `dados_persistidos.data_nascimento='1995-03-12'`, `proxima_acao=pergunta` (pergunta email) |
| **TC-C04** | "nao tenho email" | `cadastro` | `{nome:'Maria',data_nascimento:'1995-03-12'}` | (vazio) | `email_recusado=true`, `dados_completos=true`, `proxima_acao=handoff` |
| **TC-C05** | "Maria Silva, 12/03/1995, maria@email.com" | `cadastro` | `{}` | (vazio) | persiste 3 campos (data normalizada), `dados_completos=true`, `proxima_acao=handoff` |
| **TC-C06** | "nao informo meus dados" | `cadastro` | `{}` | [user:"nao quero passar dados", asst:"Preciso so do nome..."] | `proxima_acao=erro` (2ª recusa = persistente) |
| **TC-C07** | "ontem" | `cadastro` | `{nome:'Maria'}` | [user:"foi semana passada", asst:"Pode mandar tipo 12/03/1995?"] | `proxima_acao=erro` (2ª data invalida) |
| **TC-C08** | "na verdade e Maria Costa" | `cadastro` | `{nome:'Maria Silva'}` | [user:"Maria Silva", asst:"E a data?"] | `campos_conflitantes=['nome']`, NAO persiste, `proxima_acao=pergunta` |
| **TC-C09** | "preciso de receita pra anestesia?" | `cadastro` | `{}` | (vazio) | responde brevemente, retoma cadastro, `proxima_acao=pergunta` |

**Padrao de assertion:** `result.finalOutput.dados_persistidos[campo]`, `proxima_acao`, `campos_*`, `email_recusado`. NAO via tool calls (zero tools).

**Runner:** `tests/agent/cadastro-agent.eval.mjs` clone estrutural do `tattoo-agent.eval.mjs`. **maxTurns=10** (vs 20 do Tattoo — sem tools, mini termina em 1-2 turns).

---

## Acceptance criteria

### Gate obrigatorio (sessao de exec NAO fecha sem):

1. **Eval suite 9/9 PASS com `gpt-4o-mini`** (custo ~$0.025).
2. **Unit test `enforce-menor-idade.test.mjs` 4/4 PASS** (4 casos: maior_idade, menor_idade, data_invalida, data_ausente).
3. **Unit test `router.test.mjs` ≥3 PASS** (cobre `getNextState` para tattoo+handoff→cadastro, cadastro+handoff→aguardando_tatuador, cadastro+erro→aguardando_tatuador, tattoo+pergunta→tattoo stay).
4. **CI baseline mantido (zero regressao):** suite total `npm test` passa com baseline 312 + todos novos unit tests.
5. **Tokens system prompt ≤2000** (gate obrigatorio com folga). Verificar via `tiktoken` ou estimativa palavras × 1.4.
6. **Build sem erro:** `node --check` em cada novo arquivo (`agents/cadastro.js`, helper, 6 prompts, runner).
7. **Smoke local route.js:** `curl -X POST http://localhost:8788/api/agent/route` com `estado_atual='cadastro'`, dados_acumulados parcial → response 200 + `estado_novo` correto. Reproduzir 3 cenarios chave: OBR parcial, OBR completo, menor_idade.

### Gate ideal (nao bloqueia merge):

8. **Tokens ≤1800** (target original).
9. **PR aberto** com referencias cravadas pra spec + plan + commits granulares (1 por task, rollback facil).
10. **Memory `project_agente_autonomo.md` atualizada:** Sub-3.1 DONE, proximo Sub-3.2 (Proposta).
11. **Doc seguinte:** `docs/superpowers/audit/2026-05-08-sub3-cadastro-eval-results.md` com log dos 9 TCs + custo real + tokens medidos.

---

## Riscos + mitigacoes

| # | Risco | Probabilidade | Impacto | Mitigacao |
|---|-------|---------------|---------|-----------|
| 1 | Mini falha em normalizar data nasc texto livre ("12 de marco de 1995") → ISO | medio | medio | R7 explicita formatos aceitos. Exemplo §7 #3 e #5 demonstram conversao. Schema sem regex (validacao pos-output em invariante) — se mini emitir formato errado, invariante reverte pra pergunta sem 500. |
| 2 | TC-C06/C07 dependem de historico ("2ª recusa", "2ª data invalida") — mini pode nao detectar persistencia | medio | baixo | Cenario JSON inclui `historico` com tentativas anteriores. R4/R7 explicitas em "≥2x persistente". Padrao Sub-2 ja validou multi-turn. |
| 3 | `email_recusado=true` flag confunde mini (campo extra vs Tattoo) | baixo | baixo | R5 lista 7 termos de recusa. Exemplo §7 #4 demonstra. Schema obriga boolean (sempre setado). |
| 4 | `enforceMenorIdade` quebra invariante: agent emitiu handoff legitimo, helper forca erro | baixo | medio | Helper so sobrescreve quando idade<18. Unit test cobre 4 casos incluindo maior_idade (out unchanged). |
| 5 | Conflito de nome/data raro em producao, mini pode nao detectar | baixo | baixo | TC-C08 cobre. Se falhar em eval, R6 e refinada antes do merge. |
| 6 | `getNextState` quebra Sub-1/Sub-2 do Tattoo (regression) | medio | alto | `router.test.mjs` cobre tattoo+handoff→cadastro, tattoo+pergunta→tattoo stay, tattoo+erro→tattoo stay. Eval Tattoo 10/10 deve manter PASS apos refactor router (acceptance #4 exige zero regressao). |
| 7 | n8n volta producao e prompt v2 quebra (estado deprecating mas tenants residuais) | baixo | alto | Decisao de escopo explicita: n8n off. Reversao se quebrar: `git revert` do commit do `generate.js` cadastro. |
| 8 | Tokens overflow se `tenant.faqs` + `tenant.fewshots_por_modo.coleta_cadastro` grandes (gate ≤2000) | medio | baixo | `faq.js` cap 10 entries. `few-shot-tenant.js` cap (plan stage confirma — adicionar cap 10 se nao houver). Tokens medidos no exec stage. |
| 9 | Mini emite `data_nascimento` em formato errado ("12/03/1995" raw) → schema ZodObject permite (sem regex), mas invariante rejeita pos-output | medio | baixo | Pattern Sub-2: invariante reverte pra pergunta. UX: cliente pede pra reformular. R7 cobre. Risco zero de 500 — invariante so retorna `valid:false` que rota como 500-`invariant-violation` controlado. **Plan stage decide:** rejeitar com `invariant-violation` (500) OU silently force `proxima_acao='pergunta'`. Recomendacao: silently force, melhor UX. |

---

## Files de referencia

### Spec/audit predecessoras
- [TattooAgent v2 rewrite spec](./2026-05-08-coleta-tattoo-prompt-v2-rewrite-design.md) — template estrutural do Sub-3.1
- [audit consolidado fases 0-9](../audit/2026-05-08-coleta-multi-agent-prompt-audit.md) — Fase 9 cravou Sub-3 GO total
- [Sub-1 multi-agent handoff](./2026-05-07-coleta-multi-agent-handoff-design.md) — `done`
- [auditoria completa SaaS 2026-05-07](../auditoria/2026-05-07-auditoria-completa.md) — contexto da decisao multi-agent

### Files lidos no brainstorm
- `functions/api/agent/agents/tattoo.js` — template do agent v2
- `functions/api/agent/route.js` — entry point
- `functions/api/agent/router.js` — dispatcher atual
- `functions/_lib/prompts/coleta/cadastro/{generate,fluxo,regras,few-shot,few-shot-tenant}.js` — legacy a substituir
- `functions/_lib/prompts/coleta/tattoo/{generate,identidade,contexto,objetivo,decisao,faq,exemplos,few-shot-tenant}.js` — referencia do template
- `functions/_lib/prompts/index.js` — dispatcher legacy (nao tocado, mas n8n + simulator consomem `generatePromptColetaCadastro` daqui)
- `functions/api/tools/{prompt,simular-conversa}.js` — consumidores legacy (afetados quando `generate.js` for reescrito; aceito pq n8n off)

### Logs de referencia
- Sub-2 Fase 9 doc: 10/10 PASS, 312/312 CI, ~$0.40 smoke

---

## Sucesso da sessao de plan stage

Sessao bem-sucedida quando:

- [ ] Plan executavel em `docs/superpowers/plans/2026-05-08-sub3-cadastro-prompt-v2.md` com tasks granulares
- [ ] Cada task tem `Edit`/`Write` com `old_string`/`new_string`/`content` concreto (zero placeholder)
- [ ] Acceptance criteria mapeada por task (eval gate, build check, smoke)
- [ ] Tasks ordenadas pra commits granulares (rollback facil): create-files-prompts → create-agent → create-helper → edit-router → edit-route → eval-suite-create → unit-tests → eval-run → smoke
- [ ] Plan stage confirma cap em `few-shot-tenant.js` (open question 1)
- [ ] Plan stage decide UX de invariante violation em `data_nascimento` formato errado (Risk #9: 500 vs silently force pergunta)

Sessao **inconclusiva** se:
- Plan deixa partes em "TBD" ou "implementer decide"
- Sem mapping eval criteria → task
- Sem evento checkpointing (rodar eval apos cada bloco vs no fim)

---

## Outcome (preencher apos sessao de plan stage)

**Plan path:** TBD

**Status:** ready-to-execute | needs-iteration | blocked

**Notas:**
- ...

---

## Sucesso da sessao de exec stage (futura)

Apos plan stage virar plan executavel, sessao de exec (separada, fresh) e bem-sucedida quando:

- 9/9 eval suite PASS com mini
- Unit tests (helper + router) PASS
- CI baseline 312 mantido (zero regressao)
- Tokens ≤2000 (obrigatorio); ≤1800 (ideal)
- Build sem erro
- Smoke producao confirma 3 cenarios chave (OBR parcial, OBR completo, menor_idade)
- PR aberto com referencias cravadas pra audit + spec
- Memory atualizada com Sub-3.1 DONE

Comando da sessao de exec:
```
/superpowers:subagent-driven-development docs/superpowers/plans/2026-05-08-sub3-cadastro-prompt-v2.md
```

---

## Decisao Sub-3.2/3.3 pos-Sub-3.1

Apos exec deste plan, decisao pro proximo destrava com 1 de 3 caminhos:

- **GO total:** v2 passa 9/9 + smoke OK → Sub-3.2 (Proposta) usa template Sub-3.1 imediato. Sub-3.3 (Portfolio) tambem.
- **GO parcial:** v2 passa 9/9 mas smoke producao mostra edge case nao-coberto → Sub-3.2 com ajuste de prompt baseado em finding.
- **NO-GO:** v2 nao passa 9/9 ou regressao significativa → upgrade pra `gpt-4o` (custo +$5/mes irrelevante) OU re-design Sub-3.1 com diff sobre v2.

Decisao final esperada: GO total (paridade total Sub-2 que ja passou 10/10).
