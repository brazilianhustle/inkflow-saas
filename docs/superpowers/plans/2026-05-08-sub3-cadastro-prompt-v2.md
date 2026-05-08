# Sub-3.1 — CadastroAgent prompt v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever CadastroAgent (fase 2 do fluxo Coleta) seguindo template Sub-2 — pure structured-output (zero tools), 8 camadas focadas, schema Zod proprio, validacao idade pos-output, eval 9/9 com `gpt-4o-mini`.

**Architecture:** Espelha estrutura do TattooAgent v2 (PR #56). Cria 6 blocos de prompt novos (`identidade/contexto/objetivo/decisao/faq/exemplos`) sob `functions/_lib/prompts/coleta/cadastro/`, rewrite `generate.js`, novo `agents/cadastro.js` (schema + invariante + builder), helper `enforce-menor-idade.js` aplicado pos-output em `route.js`. Generaliza `router.js` com `selectAgentValidator` + `getNextState`. Stub in-memory mantido (cutover Supabase = Sub-4). Eval suite paralela via `cadastro-agent.eval.mjs` + `scenarios-cadastro.json`.

**Tech Stack:** OpenAI Agents SDK 0.1.0, Zod, gpt-4o-mini, Cloudflare Pages Functions, node:test, npm test.

**Plan stage decisions (cravadas):**
- **Cap em `cadastro/few-shot-tenant.js`:** adicionar `.slice(0, 10)` (paridade com `faq.js`). Resolve open-question 1 do spec.
- **Risk #9 (data_nascimento nao-ISO):** invariante mantem check (igual spec). `route.js` intercepta `reason.startsWith('data_nascimento nao-ISO')` quando `estado_atual='cadastro'` e silently force `proxima_acao='pergunta'` + zera campo + reescreve `resposta_cliente`. Outros invariant violations continuam HTTP 500. Resolve recomendacao "silently force" do spec.

---

### Task 1: Blocos simples — §1 IDENTIDADE + §3 OBJETIVO + §5 FAQ

**Files:**
- Create: `functions/_lib/prompts/coleta/cadastro/identidade.js`
- Create: `functions/_lib/prompts/coleta/cadastro/objetivo.js`
- Create: `functions/_lib/prompts/coleta/cadastro/faq.js`

- [ ] **Step 1: Criar `identidade.js` (clone estrutural do tattoo)**

```javascript
// functions/_lib/prompts/coleta/cadastro/identidade.js
// §1 IDENTIDADE — local ao CadastroAgent (paridade Sub-2 tattoo).
// Outros agents (tattoo/proposta/portfolio) tem seu proprio identidade.js
// pra autonomia. _shared/identidade.js permanece servindo modo `exato`.
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

- [ ] **Step 2: Criar `objetivo.js`**

```javascript
// functions/_lib/prompts/coleta/cadastro/objetivo.js
// §3 OBJETIVO — north-star do CadastroAgent. Estatico (nao depende do tenant).
export const OBJETIVO = `# §3 OBJETIVO

Sua missao nesta fase: coletar 2 dados obrigatorios + 1 opcional do cliente.

1. **nome** (OBR) — nome do cliente (1 palavra ou completo, qualquer um vale)
2. **data_nascimento** (OBR) — em formato ISO YYYY-MM-DD (voce normaliza antes de persistir)
3. **email** (OPC) — pergunta uma vez; se cliente recusar, segue sem

Voce NAO orca, NAO fala valor, NAO agenda, NAO pede dados alem destes 3.
Apos os 2 OBR completos sem conflito + email definido (presente OU recusado),
voce faz handoff pra fase aguardando_tatuador.`;
```

- [ ] **Step 3: Criar `faq.js`**

```javascript
// functions/_lib/prompts/coleta/cadastro/faq.js
// §5 FAQ — opcional. Cap 10 entries (anti prompt-growth attack — paridade tattoo/faq.js).
export function faqCadastro(tenant) {
  const faqs = Array.isArray(tenant?.faqs) ? tenant.faqs : [];
  if (!faqs.length) return '';

  const linhas = ['# §5 FAQ DO ESTUDIO'];
  for (const item of faqs.slice(0, 10)) {
    if (!item?.pergunta || !item?.resposta) continue;
    linhas.push(`- **${item.pergunta}** ${item.resposta}`);
  }
  return linhas.length === 1 ? '' : linhas.join('\n');
}
```

- [ ] **Step 4: Verificar sintaxe**

Run: `node --check functions/_lib/prompts/coleta/cadastro/identidade.js && node --check functions/_lib/prompts/coleta/cadastro/objetivo.js && node --check functions/_lib/prompts/coleta/cadastro/faq.js`
Expected: zero output (success)

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/prompts/coleta/cadastro/identidade.js functions/_lib/prompts/coleta/cadastro/objetivo.js functions/_lib/prompts/coleta/cadastro/faq.js
git commit -m "feat(coleta-cadastro-v2): blocos §1 §3 §5 (identidade, objetivo, faq)"
```

---

### Task 2: §2 CONTEXTO

**Files:**
- Create: `functions/_lib/prompts/coleta/cadastro/contexto.js`

- [ ] **Step 1: Criar `contexto.js`**

```javascript
// functions/_lib/prompts/coleta/cadastro/contexto.js
// §2 CONTEXTO — slim, local ao CadastroAgent. Espelha tattoo/contexto.js.
// Tem APENAS o que a fase Cadastro precisa: cliente recorrente vs novo,
// resumo da Tattoo (referencia da resposta-ponte), dados ja coletados em
// chave-valor que mapeia 1:1 com o schema CadastroOutputSchema.
export function contextoCadastro(tenant, conversa, clientContext) {
  const ctx = clientContext || {};
  const dadosCadastro = conversa?.dados_cadastro || {};
  const dadosColetados = conversa?.dados_coletados || {};

  const linhas = ['# §2 CONTEXTO'];

  // Cliente
  linhas.push('## Cliente');
  if (ctx.eh_recorrente) {
    linhas.push('- Cliente RECORRENTE — ja conversou antes');
    if (ctx.nome_cliente && ctx.nome_cliente.trim().length >= 2) {
      linhas.push(`- Nome anterior: ${ctx.nome_cliente}`);
    }
  } else {
    linhas.push('- Cliente acabou de receber mensagem-ponte do Tattoo. NAO se reapresente.');
  }
  linhas.push('');

  // Resumo da fase Tattoo (referencia da resposta-ponte)
  if (dadosColetados && Object.keys(dadosColetados).length) {
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
  if (dadosCadastro.email_recusado === true) dadosLinhas.push('- email_recusado: true');

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

- [ ] **Step 2: Verificar sintaxe**

Run: `node --check functions/_lib/prompts/coleta/cadastro/contexto.js`
Expected: zero output

- [ ] **Step 3: Commit**

```bash
git add functions/_lib/prompts/coleta/cadastro/contexto.js
git commit -m "feat(coleta-cadastro-v2): bloco §2 contexto"
```

---

### Task 3: §7 EXEMPLOS (6 demos)

**Files:**
- Create: `functions/_lib/prompts/coleta/cadastro/exemplos.js`

- [ ] **Step 1: Criar `exemplos.js` (6 exemplos cobrindo linhas 1-6 da tabela)**

```javascript
// functions/_lib/prompts/coleta/cadastro/exemplos.js
// §7 EXEMPLOS — 6 exemplos cobrindo 6 das 9 linhas validas da tabela §4.1.
// Linhas 7/8 (triggers persistentes) e 10 (impossivel) ficam em prosa em §4.2/§4.3.
export function exemplosCadastro(tenant) {
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

- [ ] **Step 2: Verificar sintaxe**

Run: `node --check functions/_lib/prompts/coleta/cadastro/exemplos.js`
Expected: zero output

- [ ] **Step 3: Commit**

```bash
git add functions/_lib/prompts/coleta/cadastro/exemplos.js
git commit -m "feat(coleta-cadastro-v2): bloco §7 exemplos (6 demos)"
```

---

### Task 4: §4 DECISAO (CORE — tabela + R1-R9 + encerramento)

**Files:**
- Create: `functions/_lib/prompts/coleta/cadastro/decisao.js`

- [ ] **Step 1: Criar `decisao.js`**

```javascript
// functions/_lib/prompts/coleta/cadastro/decisao.js
// §4 DECISAO E REGRAS — CORE do CadastroAgent v2.
// Substitui (em conjunto): regras.js, fluxo.js (orfaos no diretorio).
// Espinha dorsal e a tabela 10 linhas (§4.1) — cada linha mapeia 1:1 com
// um exemplo no §7 EXEMPLOS (linhas 1-6) ou comportamento descrito em
// prosa (linhas 7/8 triggers persistentes, 10 impossivel).
//
// Pure structured-output: SEM tools. Estado sai via proxima_acao + dados via
// dados_persistidos no output JSON. Validacao idade fica em route.js
// (helper enforceMenorIdade) — agent NAO calcula idade.
export function decisaoCadastro(tenant) {
  return `# §4 DECISAO E REGRAS

## §4.1 Tabela de decisao (siga LITERALMENTE)

OBR = obrigatorios coletados (nome + data_nascimento). "vazio"=0/2, "parcial"=1/2, "completo"=2/2.
Conflito = campos contraditorios em mensagens adjacentes (ex: 2 nomes diferentes).
Email status = pendente (nao perguntou) / presente (forneceu) / recusado (opt-out).
Trigger = condicao persistente (≥2x) que termina fase com erro.

| # | OBR | Conflito | Email | Trigger | proxima_acao | Acao |
|---|-----|----------|-------|---------|--------------|------|
| 1 | vazio | nao | pendente | nao | pergunta | direto: "Pra liberar teu orcamento, me passa nome completo e data de nascimento" (NAO repete msg-ponte do Tattoo) |
| 2 | parcial | nao | pendente | nao | pergunta | persiste o que veio, pergunta o que falta |
| 3 | completo | nao | pendente | nao | pergunta | "E o e-mail?" (UMA vez, neutro) |
| 4 | completo | nao | recusado | nao | handoff | mensagem final |
| 5 | completo | nao | presente | nao | handoff | mensagem final |
| 6 | * | sim | * | nao | pergunta | devolve contradicao em 1 frase, NAO persiste campo conflitante |
| 7 | * | * | * | recusa_persistente | erro | "Vou passar pro tatuador continuar contigo direto" |
| 8 | * | * | * | data_invalida_persistente | erro | "Vou passar pro tatuador continuar contigo direto" |
| 9 | * | * | * | off_topic | pergunta | responde brevemente, retoma cadastro |

(Linha 10 omitida — vazio sem dados nao gera conflito.)

## §4.2 Como interpretar cada eixo

**OBR (Obrigatorios):** os 2 campos que voce DEVE coletar:
- \`nome\`: texto livre. Aceita 1 palavra/apelido. NAO insista em "completo" — pode incomodar.
- \`data_nascimento\`: formato ISO \`YYYY-MM-DD\`. Voce normaliza ANTES de persistir.
  - Aceitos: "12/03/1995", "12-03-1995", "12 de marco de 1995", "1995-03-12"
  - Rejeitados (NAO persiste): "ontem", "tenho 25 anos", "1995" sozinho, "marco"
- "Vazio" = 0 campos. "Parcial" = 1. "Completo" = 2.

**Conflito:** quando cliente forneceu valores contraditorios pro mesmo campo em mensagens adjacentes.
- Exemplo nome: "Maria Silva" no turno 2 e "Maria Costa" no turno 4.
- Exemplo data: "12/03/1995" no turno 2 e "1995-04-12" no turno 4.
- NUNCA escolha pelo cliente. Devolve contradicao em 1 frase: "Tu disse Maria Silva antes e agora Maria Costa — me confirma o nome certo?"
- Adicione o nome do campo em \`campos_conflitantes\`. NAO persiste o campo conflitante.

**Email:**
- \`pendente\`: voce ainda nao perguntou.
- \`presente\`: cliente forneceu (qualquer formato — voce aceita mesmo invalido).
- \`recusado\`: cliente disse algum termo de opt-out:
  - "nao tenho", "passa", "sem email", "depois", "deixa pra la", "nao quero", "pula"
  - Outros termos similares de recusa.
  Quando recusado: setar \`email_recusado=true\`. NUNCA pergunte de novo.

**Trigger persistente:**
- \`recusa_persistente\`: cliente recusou cadastro ≥2x no historico. Termos: "nao vou passar dados", "nao quero dar nome", "nao informo", repeticoes. 1ª recusa NAO conta — voce reformula na primeira vez. So 2ª+ dispara trigger.
- \`data_invalida_persistente\`: ≥2 tentativas no historico onde cliente mandou data mas formato indecifravel.
- \`off_topic\`: cliente faz pergunta tecnica/desvia ("preciso de receita pra anestesia?"). NAO e trigger de erro — voce responde brevemente e retoma cadastro.

## §4.3 Regras de conteudo (R1-R9)

**R1.** NUNCA fala valor monetario nesta fase. Cliente pergunta "quanto fica?" → "Sobre valor o tatuador confirma quando avaliar — pra eu liberar teu orcamento, manda nome e data de nascimento."

**R2.** NAO peca dados ALEM de nome+data_nascimento+email. Sem CPF, telefone, RG, endereco. Se cliente perguntar por que: "Por enquanto e so isso. O tatuador pede o resto presencialmente se precisar."

**R3.** UMA pergunta por turno. EXCECAO turno inicial: pode pedir nome+data juntos pq cliente vem direto da mensagem-ponte do Tattoo.

**R4.** NUNCA persista placeholder/sentinel ("nao quero dar", "pula", "depois", "passa", "—") em \`nome\` ou \`data_nascimento\`. Esses termos sinalizam recusa — nao sao valores reais. Em vez disso, deixe \`campos_faltando\` com o campo e \`proxima_acao='pergunta'\` pra reformular (ou trigger se persistente).

**R5.** EMAIL OPCIONAL: pergunta UMA VEZ. Se cliente recusar (ver lista de termos em §4.2), seta \`email_recusado=true\`. NUNCA insiste 2x — bug grave (cliente desiste).

**R6.** CONFLITO: se cliente mandou 2 nomes ou 2 datas diferentes em msgs adjacentes, adiciona campo em \`campos_conflitantes\`, NAO persiste, devolve contradicao em 1 frase. Ex: "Tu disse 'Maria Silva' antes e agora 'Maria Costa' — me confirma o nome certo?"

**R7.** DATA NASC normalizada pra ISO \`YYYY-MM-DD\` ANTES de persistir. Se formato indecifravel: NAO persiste, \`proxima_acao='pergunta'\`, peca no formato dia/mes/ano. Ex: "Nao consegui ler a data — pode mandar tipo 12/03/1995?"

**R8.** EMAIL aceita formato invalido. Se cliente mandou "maria@email" sem .com, persista mesmo. Tatuador valida no orcamento. NAO corrija o cliente.

**R9.** OUTPUT FINAL: apos estruturar, emita JSON UMA vez e PARE. NAO repita raciocinio depois do JSON.

## §4.4 Mensagem de encerramento (linhas 4 e 5 — proxima_acao='handoff')

UM balao (Cadastro e mais sucinto que Tattoo, sem 2-baloes):

> "Anotei tudo! Vou enviar pro tatuador avaliar e te volto com o valor em breve."

Em **primeira pessoa**. NAO promete prazo especifico. Sem "vou passar pro tatuador" (viola tom).`;
}
```

- [ ] **Step 2: Verificar sintaxe**

Run: `node --check functions/_lib/prompts/coleta/cadastro/decisao.js`
Expected: zero output

- [ ] **Step 3: Commit**

```bash
git add functions/_lib/prompts/coleta/cadastro/decisao.js
git commit -m "feat(coleta-cadastro-v2): bloco §4 decisao (CORE — tabela 10 linhas + R1-R9)"
```

---

### Task 5: cap em few-shot-tenant.js + rewrite generate.js

**Files:**
- Modify: `functions/_lib/prompts/coleta/cadastro/few-shot-tenant.js`
- Modify (rewrite): `functions/_lib/prompts/coleta/cadastro/generate.js`

- [ ] **Step 1: Adicionar cap 10 em `few-shot-tenant.js`**

Edit `functions/_lib/prompts/coleta/cadastro/few-shot-tenant.js`:

```javascript
old_string: |
  for (const ex of exemplos) {
    if (!ex || typeof ex !== 'object' || !ex.cliente || !ex.agente) continue;
    linhas.push('```');
    linhas.push(`CLIENTE: ${ex.cliente}`);
    linhas.push(`AGENTE: ${ex.agente}`);
    linhas.push('```');
    linhas.push('');
  }

new_string: |
  // Cap 10 entries — paridade faq.js (anti prompt-growth attack).
  for (const ex of exemplos.slice(0, 10)) {
    if (!ex || typeof ex !== 'object' || !ex.cliente || !ex.agente) continue;
    linhas.push('```');
    linhas.push(`CLIENTE: ${ex.cliente}`);
    linhas.push(`AGENTE: ${ex.agente}`);
    linhas.push('```');
    linhas.push('');
  }
```

- [ ] **Step 2: Reescrever `generate.js` (substitui composicao 9-camadas legacy)**

Use Write tool com este conteudo (overwrite total):

```javascript
// functions/_lib/prompts/coleta/cadastro/generate.js
// Generator — modo Coleta v2, fase CADASTRO (rewrite v2).
// Substitui composicao 9-camadas legacy (que carregava _shared/checklist-critico.js,
// _shared/contexto.js, fluxo.js, regras.js, few-shot.js) por 8 blocos focados em
// cadastro: identidade, contexto slim, objetivo (north-star), decisao (CORE),
// faq (opt), tom, exemplos base (6), exemplos tenant (opt). Pattern Sub-2.
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

- [ ] **Step 3: Verificar sintaxe + import resolution**

Run: `node --check functions/_lib/prompts/coleta/cadastro/few-shot-tenant.js && node --check functions/_lib/prompts/coleta/cadastro/generate.js && node -e "import('./functions/_lib/prompts/coleta/cadastro/generate.js').then(m => console.log(typeof m.generatePromptColetaCadastro === 'function' ? 'OK' : 'FAIL'))"`
Expected: `OK`

- [ ] **Step 4: Smoke prompt rendering**

Run:
```bash
node -e "
import('./functions/_lib/prompts/coleta/cadastro/generate.js').then(m => {
  const out = m.generatePromptColetaCadastro(
    { id: 't', nome_estudio: 'Test', config_agente: {}, faqs: [] },
    { dados_cadastro: {}, dados_coletados: {} },
    {}
  );
  console.log('LEN', out.length, 'EST_TOKENS', Math.ceil(out.length / 4));
})
"
```
Expected: `LEN <bytes> EST_TOKENS <number>` — sanity check (esperado ~6000-8000 chars / ~1500-2000 tokens).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/prompts/coleta/cadastro/few-shot-tenant.js functions/_lib/prompts/coleta/cadastro/generate.js
git commit -m "refactor(coleta-cadastro-v2): rewrite generate.js + cap few-shot-tenant"
```

---

### Task 6: agents/cadastro.js (Schema + invariante + builder)

**Files:**
- Create: `functions/api/agent/agents/cadastro.js`

- [ ] **Step 1: Criar `agents/cadastro.js`**

```javascript
// functions/api/agent/agents/cadastro.js
// CadastroAgent — fase cadastro do fluxo Coleta v2 (Sub-3.1).
// Importa prompt LITERAL de functions/_lib/prompts/coleta/cadastro/ via
// generatePromptColetaCadastro. Pure structured-output agent — sem tools.
//
// Decisoes cravadas (ver spec 2026-05-08-sub3-cadastro-prompt-v2-design.md):
// - Modelo: gpt-4o-mini (paridade Sub-2)
// - Sem tools: estado e dados via dados_persistidos + proxima_acao no
//   structured output. Tools dados_coletados, enviar_orcamento_tatuador,
//   acionar_handoff removidas (eram dual-via, audit Fase 9 2026-05-08).
// - Validacao idade pos-output em route.js (helper enforceMenorIdade) —
//   agent NAO calcula idade (pattern Sub-2: agent decide intent + estrutura).
// - Schema ZodObject puro (sem .refine()/.transform() — viram ZodEffects
//   e Responses API rejeita 400). Bug confirmado em Sub-2.

import { Agent } from '@openai/agents';
import { z } from 'zod';
import { generatePromptColetaCadastro } from '../../../_lib/prompts/coleta/cadastro/generate.js';

// ── Schema do structured output ──────────────────────────────────────────
// Diff vs TattooOutputSchema:
// - 3 campos em dados_persistidos (nome/data_nascimento/email) vs 7 do Tattoo
// - email_recusado: boolean — flag nova (sempre setada). Sinaliza opt-out.
// - dados_completos=true exige nome E data_nascimento populados E
//   (email populado OU email_recusado=true).
//
// SEM regex em data_nascimento: schema fica ZodObject puro. Formato ISO
// validado pos-output em validateCadastroOutputInvariant. Se mini emitir
// formato errado, route.js silently force proxima_acao='pergunta'.
export const CadastroOutputSchema = z.object({
  resposta_cliente: z.string().min(1),
  dados_persistidos: z.object({
    nome: z.string().nullable().optional(),
    data_nascimento: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
  }),
  dados_completos: z.boolean(),
  campos_faltando: z.array(z.string()),
  campos_conflitantes: z.array(z.string()),
  email_recusado: z.boolean(),
  proxima_acao: z.enum(['pergunta', 'handoff', 'erro']),
});

// Valida invariante pos-parse. Retorna { valid: true } ou
// { valid: false, reason: string } pra route.js converter em HTTP 500
// OU silently force pergunta (caso especial: data_nascimento nao-ISO).
export function validateCadastroOutputInvariant(out) {
  if (!out || typeof out !== 'object') {
    return { valid: false, reason: 'output ausente ou nao-objeto' };
  }

  // Validacao pos-output do formato ISO de data_nascimento.
  // Se mini emitir formato errado (ex: "12/03/1995"), route.js silently
  // force pergunta — fluxo continua sem 500.
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

// ── Builder ──────────────────────────────────────────────────────────────
export function buildCadastroAgent({ env, tenant, conversa, clientContext, baseUrl = 'http://localhost:8788' }) {
  const instructions = generatePromptColetaCadastro(tenant, conversa, clientContext || {});

  return new Agent({
    name: 'cadastro-agent',
    model: 'gpt-4o-mini',
    instructions,
    tools: [],
    outputType: CadastroOutputSchema,
  });
}
```

- [ ] **Step 2: Verificar sintaxe + import resolution**

Run: `node --check functions/api/agent/agents/cadastro.js && node -e "import('./functions/api/agent/agents/cadastro.js').then(m => console.log([typeof m.buildCadastroAgent, typeof m.validateCadastroOutputInvariant, typeof m.CadastroOutputSchema?.parse].join('|')))"`
Expected: `function|function|function`

- [ ] **Step 3: Commit**

```bash
git add functions/api/agent/agents/cadastro.js
git commit -m "feat(coleta-cadastro-v2): agents/cadastro.js (schema + invariante + builder)"
```

---

### Task 7: helper enforce-menor-idade (TDD: test-first)

**Files:**
- Test: `tests/agent/enforce-menor-idade.test.mjs` (4 cases)
- Create: `functions/api/agent/_lib/enforce-menor-idade.js`

- [ ] **Step 1: Escrever test failing primeiro**

Create `tests/agent/enforce-menor-idade.test.mjs`:

```javascript
// Unit tests pro helper enforceMenorIdade (Sub-3.1).
// Roda em CI via npm test (glob *.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcIdade, enforceMenorIdade } from '../../functions/api/agent/_lib/enforce-menor-idade.js';

test('calcIdade — data ISO valida retorna idade correta', () => {
  // Cliente nasceu em 2000-01-01, hoje 2026-05-08 → 26 anos.
  assert.equal(calcIdade('2000-01-01'), 26);
});

test('calcIdade — data nao-ISO retorna null', () => {
  assert.equal(calcIdade('12/03/1995'), null);
  assert.equal(calcIdade(''), null);
  assert.equal(calcIdade(null), null);
  assert.equal(calcIdade(undefined), null);
});

test('enforceMenorIdade — maior de idade: out unchanged', () => {
  const out = {
    resposta_cliente: 'Anotei tudo!',
    dados_persistidos: { nome: 'Maria', data_nascimento: '2000-03-12', email: null },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: [],
    email_recusado: true,
    proxima_acao: 'handoff',
  };
  const result = enforceMenorIdade(out);
  assert.equal(result, out, 'out deve ser retornado sem alteracao (mesma referencia OK)');
  assert.equal(result.proxima_acao, 'handoff');
});

test('enforceMenorIdade — menor de idade: forca proxima_acao=erro + resposta padronizada', () => {
  const out = {
    resposta_cliente: 'Anotei tudo!',
    dados_persistidos: { nome: 'Junior', data_nascimento: '2015-03-12', email: null },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: [],
    email_recusado: true,
    proxima_acao: 'handoff',
  };
  const result = enforceMenorIdade(out);
  assert.equal(result.proxima_acao, 'erro');
  assert.match(result.resposta_cliente, /18 anos/);
  assert.ok(result.campos_faltando.includes('menor_idade_trigger'));
});

test('enforceMenorIdade — data ausente ou nao-ISO: out unchanged', () => {
  const outNull = {
    dados_persistidos: { data_nascimento: null },
    proxima_acao: 'pergunta',
    campos_faltando: [],
  };
  assert.equal(enforceMenorIdade(outNull).proxima_acao, 'pergunta');

  const outInvalid = {
    dados_persistidos: { data_nascimento: '12/03/1995' },
    proxima_acao: 'pergunta',
    campos_faltando: [],
  };
  assert.equal(enforceMenorIdade(outInvalid).proxima_acao, 'pergunta');
});
```

- [ ] **Step 2: Rodar teste — esperado FAIL (helper nao existe)**

Run: `node --test tests/agent/enforce-menor-idade.test.mjs`
Expected: FAIL com `Cannot find module '.../_lib/enforce-menor-idade.js'`

- [ ] **Step 3: Implementar `enforce-menor-idade.js`**

Create `functions/api/agent/_lib/enforce-menor-idade.js`:

```javascript
// Helper de validacao pos-output: idade < 18 transforma handoff em erro
// + resposta padronizada. Aplicado em route.js apenas quando estado='cadastro'
// (Tattoo nao tem data_nascimento). Pattern Sub-2: agent decide intent +
// estrutura, helpers validam.

export function calcIdade(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) {
    age--;
  }
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

- [ ] **Step 4: Rodar teste — esperado PASS 5/5 (4 cenarios + 1 calcIdade extra)**

Run: `node --test tests/agent/enforce-menor-idade.test.mjs`
Expected: `# pass 5` (5 testes passing)

- [ ] **Step 5: Commit**

```bash
git add functions/api/agent/_lib/enforce-menor-idade.js tests/agent/enforce-menor-idade.test.mjs
git commit -m "feat(coleta-cadastro-v2): helper enforce-menor-idade + 5 unit tests"
```

---

### Task 8: router.js refactor (TDD: test-first em getNextState)

**Files:**
- Test: `tests/agent/router.test.mjs`
- Modify: `functions/api/agent/router.js`

- [ ] **Step 1: Escrever test failing primeiro**

Create `tests/agent/router.test.mjs`:

```javascript
// Unit tests pro router.js (Sub-3.1 generaliza getNextState + selectAgentValidator).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectAgentBuilder,
  selectAgentValidator,
  isStateImplemented,
  getNextState,
} from '../../functions/api/agent/router.js';

test('selectAgentBuilder — tattoo + cadastro resolvidos, outros null', () => {
  assert.equal(typeof selectAgentBuilder('tattoo'), 'function');
  assert.equal(typeof selectAgentBuilder('cadastro'), 'function');
  assert.equal(selectAgentBuilder('proposta'), null);
  assert.equal(selectAgentBuilder('portfolio'), null);
});

test('selectAgentValidator — tattoo + cadastro resolvidos', () => {
  assert.equal(typeof selectAgentValidator('tattoo'), 'function');
  assert.equal(typeof selectAgentValidator('cadastro'), 'function');
  assert.equal(selectAgentValidator('proposta'), null);
});

test('isStateImplemented — tattoo + cadastro=true, outros=false', () => {
  assert.equal(isStateImplemented('tattoo'), true);
  assert.equal(isStateImplemented('cadastro'), true);
  assert.equal(isStateImplemented('proposta'), false);
});

test('getNextState — tattoo+handoff -> cadastro', () => {
  assert.equal(getNextState('tattoo', { proxima_acao: 'handoff' }), 'cadastro');
});

test('getNextState — tattoo+pergunta -> tattoo (stay)', () => {
  assert.equal(getNextState('tattoo', { proxima_acao: 'pergunta' }), 'tattoo');
});

test('getNextState — tattoo+erro -> tattoo (stay)', () => {
  assert.equal(getNextState('tattoo', { proxima_acao: 'erro' }), 'tattoo');
});

test('getNextState — cadastro+handoff -> aguardando_tatuador', () => {
  assert.equal(getNextState('cadastro', { proxima_acao: 'handoff' }), 'aguardando_tatuador');
});

test('getNextState — cadastro+erro -> aguardando_tatuador (trigger sai)', () => {
  assert.equal(getNextState('cadastro', { proxima_acao: 'erro' }), 'aguardando_tatuador');
});

test('getNextState — cadastro+pergunta -> cadastro (stay)', () => {
  assert.equal(getNextState('cadastro', { proxima_acao: 'pergunta' }), 'cadastro');
});

test('getNextState — out null/undefined -> stay', () => {
  assert.equal(getNextState('tattoo', null), 'tattoo');
  assert.equal(getNextState('cadastro', undefined), 'cadastro');
});
```

- [ ] **Step 2: Rodar teste — esperado FAIL (selectAgentValidator + getNextState nao existem)**

Run: `node --test tests/agent/router.test.mjs`
Expected: FAIL com `selectAgentValidator is not a function` ou similar

- [ ] **Step 3: Reescrever `router.js`**

Use Write tool com este conteudo (overwrite total):

```javascript
// functions/api/agent/router.js
// Router — dispatch por estado_atual pra escolha de Agent builder/validator
// e calculo do proximo estado.
//
// Sub-1: tattoo. Sub-3.1: + cadastro. Sub-3.2/3.3: proposta + portfolio.
//
// NEXT_STATE encapsula transicao (estado_atual, proxima_acao) -> estado_novo:
// - tattoo+handoff   -> cadastro             (continua coleta)
// - tattoo+erro      -> tattoo (stay)        (cliente em estado bloqueado; Sub-4 cutover decide)
// - cadastro+handoff -> aguardando_tatuador  (handoff legitimo)
// - cadastro+erro    -> aguardando_tatuador  (3 triggers: recusa_persistente, data_invalida, menor_idade — todos saem)
// - * + pergunta     -> stay
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
  tattoo:   { handoff: 'cadastro',            erro: 'tattoo' },
  cadastro: { handoff: 'aguardando_tatuador', erro: 'aguardando_tatuador' },
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

- [ ] **Step 4: Rodar teste — esperado PASS**

Run: `node --test tests/agent/router.test.mjs`
Expected: `# pass 10`

- [ ] **Step 5: Sanity — full suite ainda passa (zero regressao Sub-2)**

Run: `npm test`
Expected: 312 baseline + novos tests (5 enforce-menor-idade + 10 router) = 327+ pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add functions/api/agent/router.js tests/agent/router.test.mjs
git commit -m "refactor(agent-router): generaliza selectAgentValidator + getNextState (Sub-3.1)"
```

---

### Task 9: route.js refactor (validator dispatch + silently force + enforce + getNextState)

**Files:**
- Modify: `functions/api/agent/route.js`

- [ ] **Step 1: Atualizar imports**

Edit `functions/api/agent/route.js`:

```
old_string:
import { selectAgentBuilder, isStateImplemented } from './router.js';
import { validateEnv } from './_lib/sdk-init.js';
import { validateTattooOutputInvariant } from './agents/tattoo.js';

new_string:
import { selectAgentBuilder, selectAgentValidator, isStateImplemented, getNextState } from './router.js';
import { validateEnv } from './_lib/sdk-init.js';
import { enforceMenorIdade } from './_lib/enforce-menor-idade.js';
```

- [ ] **Step 2: Substituir invariant check + return block (1 trecho contiguo)**

Edit `functions/api/agent/route.js`:

```
old_string:
  // Invariante handoff (movida pra ca apos remover .refine() do schema —
  // SDK so suporta ZodObject puro como outputType, .refine() vira ZodEffects).
  const invariantCheck = validateTattooOutputInvariant(out);
  if (!invariantCheck.valid) {
    console.error('[agent/route] invariant violation:', invariantCheck.reason, out);
    return json({ ok: false, error: 'invariant-violation', reason: invariantCheck.reason }, 500);
  }

  return json({
    ok: true,
    resposta_cliente: out.resposta_cliente,
    estado_novo: out.proxima_acao === 'handoff' ? 'cadastro' : estado_atual,
    dados_persistidos: out.dados_persistidos,
    dados_completos: out.dados_completos,
    campos_faltando: out.campos_faltando,
    campos_conflitantes: out.campos_conflitantes,
    proxima_acao: out.proxima_acao,
    agent_usado: 'tattoo',
  }, 200);
}

new_string:
  // Dispatcher por estado: cadastro tem invariante diferente do tattoo.
  const validator = selectAgentValidator(estado_atual);
  let working = out;
  const invariantCheck = validator(working);

  if (!invariantCheck.valid) {
    // Caso especial: data_nascimento nao-ISO (cadastro) — silently force pergunta
    // em vez de 500. Pattern Sub-2: invariante so tem hard-fail pra contratos
    // de handoff (dados_completos, campos_conflitantes). Formato de data e UX,
    // nao contrato — agent reformula no proximo turno.
    if (estado_atual === 'cadastro' && invariantCheck.reason?.startsWith('data_nascimento nao-ISO')) {
      console.warn('[agent/route] silently force pergunta (data_nascimento nao-ISO):', invariantCheck.reason);
      working = {
        ...working,
        dados_persistidos: { ...(working.dados_persistidos || {}), data_nascimento: null },
        dados_completos: false,
        campos_faltando: Array.from(new Set([...(working.campos_faltando || []), 'data_nascimento'])),
        proxima_acao: 'pergunta',
        resposta_cliente: 'Nao consegui ler a data — pode mandar tipo 12/03/1995?',
      };
    } else {
      console.error('[agent/route] invariant violation:', invariantCheck.reason, out);
      return json({ ok: false, error: 'invariant-violation', reason: invariantCheck.reason }, 500);
    }
  }

  // Aplica enforceMenorIdade APOS invariante. So afeta cadastro (helper
  // checa data_nascimento; outros estados nao tem o campo, retorna out unchanged).
  const enforced = estado_atual === 'cadastro' ? enforceMenorIdade(working) : working;

  return json({
    ok: true,
    resposta_cliente: enforced.resposta_cliente,
    estado_novo: getNextState(estado_atual, enforced),
    dados_persistidos: enforced.dados_persistidos,
    dados_completos: enforced.dados_completos,
    campos_faltando: enforced.campos_faltando,
    campos_conflitantes: enforced.campos_conflitantes,
    proxima_acao: enforced.proxima_acao,
    agent_usado: estado_atual,
  }, 200);
}
```

- [ ] **Step 3: Atualizar comentario do header (Sub-1 -> Sub-3.1)**

Edit `functions/api/agent/route.js`:

```
old_string:
// Response 501: estado_atual nao implementado (cadastro/proposta/portfolio = Sub-2)

new_string:
// Response 501: estado_atual nao implementado (proposta/portfolio = Sub-3.2/Sub-3.3)
```

- [ ] **Step 4: Verificar sintaxe**

Run: `node --check functions/api/agent/route.js`
Expected: zero output

- [ ] **Step 5: Sanity — suite total**

Run: `npm test`
Expected: 327+ pass, 0 fail (sem regressao).

- [ ] **Step 6: Commit**

```bash
git add functions/api/agent/route.js
git commit -m "feat(agent-route): dispatcher de validator + cadastro flow (enforce + silently force)"
```

---

### Task 10: scenarios-cadastro.json + cadastro-agent.eval.mjs

**Files:**
- Create: `tests/agent/_fixtures/scenarios-cadastro.json`
- Create: `tests/agent/cadastro-agent.eval.mjs`

- [ ] **Step 1: Criar `scenarios-cadastro.json` (9 cenarios)**

```json
{
  "scenarios": [
    {
      "id": "TC-C01",
      "descricao": "Linha 1: entrada da fase, sem dados",
      "input": {
        "tenant_id": "00000000-0000-0000-0000-000000000001",
        "telefone": "+5511900000101",
        "estado_atual": "cadastro",
        "dados_acumulados": {},
        "dados_cadastro": {},
        "historico": [],
        "mensagens": [{ "role": "user", "content": "ok" }]
      },
      "expected": {
        "proxima_acao": "pergunta",
        "dados_completos": false,
        "campos_faltando_inclui": ["nome", "data_nascimento"],
        "dados_persistidos_NAO_inclui": ["nome", "data_nascimento", "email"]
      }
    },
    {
      "id": "TC-C02",
      "descricao": "Linha 2: cliente mandou so nome",
      "input": {
        "tenant_id": "00000000-0000-0000-0000-000000000001",
        "telefone": "+5511900000102",
        "estado_atual": "cadastro",
        "dados_acumulados": {},
        "dados_cadastro": {},
        "historico": [],
        "mensagens": [{ "role": "user", "content": "Maria Silva" }]
      },
      "expected": {
        "proxima_acao": "pergunta",
        "dados_completos": false,
        "dados_persistidos_inclui": ["nome"],
        "campos_faltando_inclui": ["data_nascimento"]
      }
    },
    {
      "id": "TC-C03",
      "descricao": "Linha 3: completo OBR (data normalizada), sem email",
      "input": {
        "tenant_id": "00000000-0000-0000-0000-000000000001",
        "telefone": "+5511900000103",
        "estado_atual": "cadastro",
        "dados_acumulados": {},
        "dados_cadastro": { "nome": "Maria Silva" },
        "historico": [
          { "role": "user", "content": "Maria Silva" },
          { "role": "assistant", "content": "Beleza Maria. E a data de nascimento?" }
        ],
        "mensagens": [{ "role": "user", "content": "12/03/1995" }]
      },
      "expected": {
        "proxima_acao": "pergunta",
        "dados_completos": false,
        "dados_persistidos_inclui": ["data_nascimento"],
        "data_nascimento_iso_match": true
      }
    },
    {
      "id": "TC-C04",
      "descricao": "Linha 4: email recusado, handoff",
      "input": {
        "tenant_id": "00000000-0000-0000-0000-000000000001",
        "telefone": "+5511900000104",
        "estado_atual": "cadastro",
        "dados_acumulados": {},
        "dados_cadastro": { "nome": "Maria", "data_nascimento": "1995-03-12" },
        "historico": [
          { "role": "assistant", "content": "Anotado. E o e-mail?" }
        ],
        "mensagens": [{ "role": "user", "content": "nao tenho email" }]
      },
      "expected": {
        "proxima_acao": "handoff",
        "dados_completos": true,
        "email_recusado": true
      }
    },
    {
      "id": "TC-C05",
      "descricao": "Linha 5: tudo de uma vez",
      "input": {
        "tenant_id": "00000000-0000-0000-0000-000000000001",
        "telefone": "+5511900000105",
        "estado_atual": "cadastro",
        "dados_acumulados": {},
        "dados_cadastro": {},
        "historico": [],
        "mensagens": [{ "role": "user", "content": "Maria Silva, 12/03/1995, maria@email.com" }]
      },
      "expected": {
        "proxima_acao": "handoff",
        "dados_completos": true,
        "dados_persistidos_inclui": ["nome", "data_nascimento", "email"],
        "data_nascimento_iso_match": true
      }
    },
    {
      "id": "TC-C06",
      "descricao": "Linha 7: recusa persistente -> erro",
      "input": {
        "tenant_id": "00000000-0000-0000-0000-000000000001",
        "telefone": "+5511900000106",
        "estado_atual": "cadastro",
        "dados_acumulados": {},
        "dados_cadastro": {},
        "historico": [
          { "role": "user", "content": "nao quero passar dados" },
          { "role": "assistant", "content": "Preciso so do nome e data de nascimento pra liberar o orcamento" }
        ],
        "mensagens": [{ "role": "user", "content": "nao informo meus dados" }]
      },
      "expected": {
        "proxima_acao": "erro"
      }
    },
    {
      "id": "TC-C07",
      "descricao": "Linha 8: data invalida persistente -> erro",
      "input": {
        "tenant_id": "00000000-0000-0000-0000-000000000001",
        "telefone": "+5511900000107",
        "estado_atual": "cadastro",
        "dados_acumulados": {},
        "dados_cadastro": { "nome": "Maria" },
        "historico": [
          { "role": "user", "content": "foi semana passada" },
          { "role": "assistant", "content": "Pode mandar tipo 12/03/1995?" }
        ],
        "mensagens": [{ "role": "user", "content": "ontem" }]
      },
      "expected": {
        "proxima_acao": "erro"
      }
    },
    {
      "id": "TC-C08",
      "descricao": "Linha 6: conflito de nome",
      "input": {
        "tenant_id": "00000000-0000-0000-0000-000000000001",
        "telefone": "+5511900000108",
        "estado_atual": "cadastro",
        "dados_acumulados": {},
        "dados_cadastro": { "nome": "Maria Silva" },
        "historico": [
          { "role": "user", "content": "Maria Silva" },
          { "role": "assistant", "content": "E a data de nascimento?" }
        ],
        "mensagens": [{ "role": "user", "content": "na verdade e Maria Costa" }]
      },
      "expected": {
        "proxima_acao": "pergunta",
        "campos_conflitantes_inclui": ["nome"]
      }
    },
    {
      "id": "TC-C09",
      "descricao": "Linha 9: off_topic — responde brevemente, retoma",
      "input": {
        "tenant_id": "00000000-0000-0000-0000-000000000001",
        "telefone": "+5511900000109",
        "estado_atual": "cadastro",
        "dados_acumulados": {},
        "dados_cadastro": {},
        "historico": [],
        "mensagens": [{ "role": "user", "content": "preciso de receita pra anestesia?" }]
      },
      "expected": {
        "proxima_acao": "pergunta"
      }
    }
  ]
}
```

- [ ] **Step 2: Criar `cadastro-agent.eval.mjs` (clone estrutural do tattoo)**

```javascript
// Eval suite CadastroAgent — 9 cenarios contra gpt-4o-mini real.
// NAO roda em CI (filename *.eval.mjs fora do glob *.test.mjs).
//
// Run: OPENAI_API_KEY=sk-... node --test tests/agent/cadastro-agent.eval.mjs
// Custo estimado: ~$0.025 por suite completa.
//
// Pure structured-output agent (sem tools) — eval LLM call e REAL contra OpenAI.
// maxTurns 10 (vs 20 do Tattoo — sem tools, mini termina em 1-2 turns).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Agent, run } from '@openai/agents';
import { CadastroOutputSchema } from '../../functions/api/agent/agents/cadastro.js';
import { generatePromptColetaCadastro } from '../../functions/_lib/prompts/coleta/cadastro/generate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '_fixtures', 'scenarios-cadastro.json');
const { scenarios } = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY ausente — eval suite nao pode rodar');
  process.exit(1);
}

const FAKE_TENANT = {
  id: 'tenant-eval-cadastro',
  nome_estudio: 'Estudio Eval',
  nome_agente: 'Atendente',
  config_agente: {},
  faqs: [],
  fewshots_por_modo: {},
};

function buildAgentForEval({ tenant, conversa, clientContext }) {
  const instructions = generatePromptColetaCadastro(tenant, conversa, clientContext || {});
  return new Agent({
    name: 'cadastro-agent-eval',
    model: 'gpt-4o-mini',
    instructions,
    tools: [],
    outputType: CadastroOutputSchema,
  });
}

for (const scenario of scenarios) {
  test(`${scenario.id} — ${scenario.descricao}`, async () => {
    const conversa = {
      id: `conv-${scenario.id}`,
      telefone: scenario.input.telefone,
      estado_agente: 'cadastro',
      dados_coletados: scenario.input.dados_acumulados || {},
      dados_cadastro: scenario.input.dados_cadastro || {},
    };
    const agent = buildAgentForEval({
      tenant: FAKE_TENANT,
      conversa,
      clientContext: {},
    });

    const messages = [
      ...(scenario.input.historico || []),
      ...scenario.input.mensagens,
    ];

    const result = await run(agent, messages, { maxTurns: 10 });
    const out = result.finalOutput;

    const parsed = CadastroOutputSchema.safeParse(out);
    assert.equal(parsed.success, true, `${scenario.id}: schema invalido — ${parsed.error?.issues?.[0]?.message || ''}`);

    if (scenario.expected.proxima_acao !== undefined) {
      assert.equal(out.proxima_acao, scenario.expected.proxima_acao,
        `${scenario.id}: proxima_acao esperado=${scenario.expected.proxima_acao} got=${out.proxima_acao}`);
    }

    if (scenario.expected.dados_completos !== undefined) {
      assert.equal(out.dados_completos, scenario.expected.dados_completos,
        `${scenario.id}: dados_completos esperado=${scenario.expected.dados_completos} got=${out.dados_completos}`);
    }

    if (scenario.expected.email_recusado !== undefined) {
      assert.equal(out.email_recusado, scenario.expected.email_recusado,
        `${scenario.id}: email_recusado esperado=${scenario.expected.email_recusado} got=${out.email_recusado}`);
    }

    if (Array.isArray(scenario.expected.campos_faltando_inclui)) {
      for (const c of scenario.expected.campos_faltando_inclui) {
        assert.ok(out.campos_faltando.includes(c),
          `${scenario.id}: esperava campos_faltando inclui '${c}' — got=${JSON.stringify(out.campos_faltando)}`);
      }
    }

    if (Array.isArray(scenario.expected.campos_conflitantes_inclui)) {
      for (const c of scenario.expected.campos_conflitantes_inclui) {
        assert.ok(out.campos_conflitantes.includes(c),
          `${scenario.id}: esperava campos_conflitantes inclui '${c}' — got=${JSON.stringify(out.campos_conflitantes)}`);
      }
    }

    if (Array.isArray(scenario.expected.dados_persistidos_NAO_inclui)) {
      for (const c of scenario.expected.dados_persistidos_NAO_inclui) {
        assert.ok((out.dados_persistidos || {})[c] == null,
          `${scenario.id}: esperava dados_persistidos NAO inclui '${c}' (com valor) — got=${JSON.stringify(out.dados_persistidos)}`);
      }
    }

    if (Array.isArray(scenario.expected.dados_persistidos_inclui)) {
      for (const c of scenario.expected.dados_persistidos_inclui) {
        const v = (out.dados_persistidos || {})[c];
        const filled = v !== null && v !== undefined && v !== ''
          && (Array.isArray(v) ? v.length > 0 : true);
        assert.ok(filled,
          `${scenario.id}: esperava dados_persistidos.${c} preenchido — got=${JSON.stringify(v)}`);
      }
    }

    if (scenario.expected.data_nascimento_iso_match === true) {
      const dn = out.dados_persistidos?.data_nascimento;
      assert.match(String(dn || ''), /^\d{4}-\d{2}-\d{2}$/,
        `${scenario.id}: esperava data_nascimento ISO YYYY-MM-DD — got=${dn}`);
    }
  });
}
```

- [ ] **Step 3: Sintaxe + sanity (filename *.eval.mjs e excluido do glob *.test.mjs do CI)**

Run: `node --check tests/agent/cadastro-agent.eval.mjs && node -e "JSON.parse(require('fs').readFileSync('tests/agent/_fixtures/scenarios-cadastro.json', 'utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 4: Confirma que CI nao executa eval (glob exclusivo)**

Run: `npm test 2>&1 | tail -5`
Expected: pass count nao mudou (cadastro-agent.eval.mjs nao roda em `npm test` por convenção *.test.mjs only).

- [ ] **Step 5: Commit**

```bash
git add tests/agent/cadastro-agent.eval.mjs tests/agent/_fixtures/scenarios-cadastro.json
git commit -m "test(coleta-cadastro-v2): eval suite 9 cenarios + runner"
```

---

### Task 11: Build check + tokens estimate

**Files:** (read-only validation)

- [ ] **Step 1: Build check em todos arquivos novos/editados**

Run:
```bash
for f in \
  functions/_lib/prompts/coleta/cadastro/identidade.js \
  functions/_lib/prompts/coleta/cadastro/objetivo.js \
  functions/_lib/prompts/coleta/cadastro/faq.js \
  functions/_lib/prompts/coleta/cadastro/contexto.js \
  functions/_lib/prompts/coleta/cadastro/exemplos.js \
  functions/_lib/prompts/coleta/cadastro/decisao.js \
  functions/_lib/prompts/coleta/cadastro/few-shot-tenant.js \
  functions/_lib/prompts/coleta/cadastro/generate.js \
  functions/api/agent/agents/cadastro.js \
  functions/api/agent/_lib/enforce-menor-idade.js \
  functions/api/agent/router.js \
  functions/api/agent/route.js \
  tests/agent/cadastro-agent.eval.mjs \
  tests/agent/enforce-menor-idade.test.mjs \
  tests/agent/router.test.mjs; do
  node --check "$f" || { echo "FAIL: $f"; exit 1; }
done
echo "ALL OK"
```
Expected: `ALL OK`

- [ ] **Step 2: Tokens estimate (cap obrigatorio ≤2000, ideal ≤1800)**

Run:
```bash
node -e "
import('./functions/_lib/prompts/coleta/cadastro/generate.js').then(m => {
  const tenant = { id: 't', nome_estudio: 'Test', nome_agente: 'Atendente', config_agente: {}, faqs: [], fewshots_por_modo: {} };
  const conversa = { dados_cadastro: {}, dados_coletados: {} };
  const out = m.generatePromptColetaCadastro(tenant, conversa, {});
  const chars = out.length;
  const estTokens = Math.ceil(chars / 4);
  const status = estTokens <= 1800 ? 'IDEAL' : estTokens <= 2000 ? 'OK' : 'FAIL';
  console.log(JSON.stringify({ chars, estTokens, status }));
})
"
```
Expected: `{"chars": <num>, "estTokens": <≤2000>, "status": "IDEAL" | "OK"}` — se `FAIL`, encurtar §4.2/§4.3 (priorizar) ou §7 (fallback) e re-rodar.

- [ ] **Step 3: Suite total — sanity zero regressao**

Run: `npm test`
Expected: 327+ pass, 0 fail.

- [ ] **Step 4: Commit (sem mudanca de arquivo, so checkpoint)**

(Nao ha mudanca pra commitar — Task 11 e gate de validacao. Se algum arquivo mudou no Step 2 (cap em §7), commitar separado:
```bash
# So se houve ajuste de prompt
git add -p functions/_lib/prompts/coleta/cadastro/
git commit -m "chore(coleta-cadastro-v2): trim prompt pra ficar dentro do cap de tokens"
```
Caso contrario, skip.)

---

### Task 12: Smoke local route.js (3 cenarios chave)

**Files:** (no edits — runtime smoke)

- [ ] **Step 1: Subir wrangler dev em background**

Run: `npx wrangler pages dev . --port 8788 --local --persist-to .wrangler/state` em terminal separado, ou em background com `&`.

Expected: server up em `http://localhost:8788`. Verificar com `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8788/api/health` (ou rota similar; 200 OK).

- [ ] **Step 2: Smoke OBR parcial — espera proxima_acao=pergunta**

Run:
```bash
curl -s -X POST http://localhost:8788/api/agent/route \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_id":"00000000-0000-0000-0000-000000000001",
    "telefone":"+5511900000201",
    "mensagem":"Maria Silva",
    "estado_atual":"cadastro",
    "dados_acumulados":{},
    "historico":[],
    "tenant":{"id":"t","nome_estudio":"Smoke","config_agente":{},"faqs":[]},
    "conversa":{"id":"c","telefone":"+5511900000201","estado_agente":"cadastro","dados_coletados":{},"dados_cadastro":{}}
  }' | jq '.ok, .estado_novo, .proxima_acao, .agent_usado'
```
Expected:
```
true
"cadastro"
"pergunta"
"cadastro"
```

- [ ] **Step 3: Smoke OBR completo — espera proxima_acao=handoff + estado_novo=aguardando_tatuador**

Run:
```bash
curl -s -X POST http://localhost:8788/api/agent/route \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_id":"00000000-0000-0000-0000-000000000001",
    "telefone":"+5511900000202",
    "mensagem":"Maria Silva, 12/03/1995, maria@email.com",
    "estado_atual":"cadastro",
    "dados_acumulados":{},
    "historico":[],
    "tenant":{"id":"t","nome_estudio":"Smoke","config_agente":{},"faqs":[]},
    "conversa":{"id":"c","telefone":"+5511900000202","estado_agente":"cadastro","dados_coletados":{},"dados_cadastro":{}}
  }' | jq '.ok, .estado_novo, .proxima_acao, .dados_completos, .dados_persistidos'
```
Expected: `ok=true`, `estado_novo="aguardando_tatuador"`, `proxima_acao="handoff"`, `dados_completos=true`, `dados_persistidos.nome` preenchido, `dados_persistidos.data_nascimento` em formato `YYYY-MM-DD`.

- [ ] **Step 4: Smoke menor de idade — espera enforceMenorIdade trigger**

Run:
```bash
curl -s -X POST http://localhost:8788/api/agent/route \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_id":"00000000-0000-0000-0000-000000000001",
    "telefone":"+5511900000203",
    "mensagem":"Junior, 12/03/2015, junior@email.com",
    "estado_atual":"cadastro",
    "dados_acumulados":{},
    "historico":[],
    "tenant":{"id":"t","nome_estudio":"Smoke","config_agente":{},"faqs":[]},
    "conversa":{"id":"c","telefone":"+5511900000203","estado_agente":"cadastro","dados_coletados":{},"dados_cadastro":{}}
  }' | jq '.ok, .estado_novo, .proxima_acao, .resposta_cliente, .campos_faltando'
```
Expected: `ok=true`, `proxima_acao="erro"`, `estado_novo="aguardando_tatuador"`, `resposta_cliente` com "18 anos", `campos_faltando` inclui `"menor_idade_trigger"`.

- [ ] **Step 5: Derrubar wrangler**

Run: `pkill -f 'wrangler pages dev'` (ou `Ctrl+C` no terminal).

- [ ] **Step 6: (sem commit — so validacao runtime)**

Smoke nao gera diff. Se algum dos 3 falhou: investigar (provavelmente prompt ou helper bug), corrigir, repetir Task 12.

---

### Task 13: Eval suite run + audit doc + memory update

**Files:**
- Create: `docs/superpowers/audit/2026-05-08-sub3-cadastro-eval-results.md`
- Modify: `~/.claude/projects/-Users-brazilianhustler-Documents-inkflow-saas/memory/project_agente_autonomo.md`

- [ ] **Step 1: Rodar eval suite 9/9 contra OpenAI real**

Run: `OPENAI_API_KEY=$(cat ~/.config/inkflow-secrets/openai-key 2>/dev/null || echo $OPENAI_API_KEY) node --test tests/agent/cadastro-agent.eval.mjs 2>&1 | tee /tmp/cadastro-eval.log`

(Path do API key pode mudar — usar mesmo metodo que Sub-2 usou em `tests/agent/tattoo-agent.eval.mjs`.)

Expected: `# pass 9 / # fail 0`. Custo real ~$0.025.

Se algum TC falhar: capturar `result.finalOutput` no log, comparar com `expected`, decidir entre:
- (a) refinar prompt em `decisao.js` (R-rule mais explicita) e re-rodar
- (b) refinar exemplo em `exemplos.js` cobrindo o caso
- (c) ajustar `expected` no scenario.json se o agent estava certo e teste estava errado

Iterar ate 9/9. **Cada iteracao gera commit incremental** (`fix(coleta-cadastro-v2): refina R5 pra cobrir TC-C04`).

- [ ] **Step 2: CI baseline check (zero regressao)**

Run: `npm test 2>&1 | tail -3`
Expected: `# pass 327+ / # fail 0` — paridade com baseline 312 + 15 novos unit tests (5 enforce + 10 router).

- [ ] **Step 3: Criar audit doc**

Create `docs/superpowers/audit/2026-05-08-sub3-cadastro-eval-results.md`:

```markdown
# Sub-3.1 — CadastroAgent v2 eval results

**Data:** 2026-05-08
**Branch:** <feature/coleta-cadastro-v2>
**Predecessor:** [spec ready-to-plan](../specs/2026-05-08-sub3-cadastro-prompt-v2-design.md), [plan executavel](../plans/2026-05-08-sub3-cadastro-prompt-v2.md)

## Resultados

- **Eval suite:** 9/9 PASS com gpt-4o-mini
- **CI baseline:** N/N pass (sem regressao vs Sub-2 312)
- **Tokens prompt:** ~XXXX (gate ≤2000 OK; ideal ≤1800 — STATUS)
- **Custo real eval:** ~$0.025
- **Iteracoes ate 9/9:** N

## Logs por TC

(Colar saida relevante de /tmp/cadastro-eval.log — `result.finalOutput` por scenario.)

## Smoke local

3 cenarios validados em wrangler dev:
- OBR parcial → pergunta + estado_novo=cadastro ✓
- OBR completo → handoff + estado_novo=aguardando_tatuador ✓
- Menor idade → erro + resposta padronizada + estado_novo=aguardando_tatuador ✓

## Decisao Sub-3.2/3.3

- **GO total:** v2 passou 9/9 + smoke OK → Sub-3.2 (Proposta) usa template Sub-3.1 imediato.
- (preencher conforme outcome)

## Notas

- (preencher pos-eval)
```

- [ ] **Step 4: Atualizar memory `project_agente_autonomo.md`**

Edit `~/.claude/projects/-Users-brazilianhustler-Documents-inkflow-saas/memory/project_agente_autonomo.md`:

```
old_string: Sub-3.1 CadastroAgent spec ready-to-plan (`2026-05-08-sub3-cadastro-prompt-v2-design.md`); Sub-3.2/3.3 + Sub-4 pendentes
new_string: Sub-3.1 CadastroAgent v2 ✅ DONE (9/9 eval, paridade Sub-2). Sub-3.2 PropostaAgent + Sub-3.3 PortfolioAgent pendentes (template Sub-3.1 reusavel). Sub-4 cutover Supabase pendente.
```

(Update tambem MEMORY.md descricao se necessario.)

- [ ] **Step 5: Commit final**

```bash
git add docs/superpowers/audit/2026-05-08-sub3-cadastro-eval-results.md
git commit -m "docs(coleta-cadastro-v2): audit eval results + memory update"
```

(Memory file fica fora do repo — atualizado direto sem commit.)

- [ ] **Step 6: Abrir PR pra main**

Run:
```bash
git push -u origin HEAD
gh pr create --title "feat(coleta-cadastro-v2): CadastroAgent prompt v2 pure structured-output" --body "$(cat <<'EOF'
## Summary
- Reescreve CadastroAgent seguindo template TattooAgent v2 (PR #56) — pure structured-output, zero tools
- 8 blocos focados (vs 9 legacy), schema CadastroOutputSchema com email_recusado flag
- Helper enforceMenorIdade aplicado pos-output em route.js (idade<18 -> erro)
- Generaliza router.js: selectAgentValidator + getNextState (substitui hardcoded ternary)
- Eval suite 9/9 PASS com gpt-4o-mini, custo ~$0.025
- CI baseline mantido (zero regressao Sub-2)

## Refs
- Spec: docs/superpowers/specs/2026-05-08-sub3-cadastro-prompt-v2-design.md
- Plan: docs/superpowers/plans/2026-05-08-sub3-cadastro-prompt-v2.md
- Audit: docs/superpowers/audit/2026-05-08-sub3-cadastro-eval-results.md
- Predecessor: PR #56 (Sub-2 TattooAgent v2)

## Test plan
- [x] npm test — full suite verde
- [x] Eval suite 9/9 com gpt-4o-mini
- [x] Smoke local route.js (3 cenarios chave)
- [x] Tokens prompt dentro do cap (≤2000)
EOF
)"
```

Expected: PR URL retornado.

---

## Self-Review

**Spec coverage:** mapping spec → tasks
- §1 IDENTIDADE / §3 OBJETIVO / §5 FAQ → Task 1
- §2 CONTEXTO → Task 2
- §7 EXEMPLOS → Task 3
- §4 DECISAO (CORE) → Task 4
- generate.js rewrite + cap few-shot-tenant → Task 5
- agents/cadastro.js (Schema + invariante + builder) → Task 6
- enforceMenorIdade helper + 5 unit tests → Task 7
- router.js refactor + 10 unit tests → Task 8
- route.js refactor (validator dispatch + silently force + enforce + getNextState) → Task 9
- scenarios-cadastro.json + cadastro-agent.eval.mjs → Task 10
- Build check + tokens cap (gate ≤2000) → Task 11
- Smoke local route.js (3 cenarios) → Task 12
- Eval 9/9 + audit doc + memory + PR → Task 13

**Acceptance criteria do spec mapped:**
- (1) Eval 9/9 → Task 13 Step 1
- (2) Unit test enforce 4/4+ → Task 7 Step 4
- (3) Unit test router ≥3 → Task 8 Step 4 (10 tests)
- (4) CI baseline 312 mantido → Task 13 Step 2 (e checks intermediarios em Tasks 8/9/11)
- (5) Tokens ≤2000 → Task 11 Step 2
- (6) Build sem erro → Task 11 Step 1
- (7) Smoke local 3 cenarios → Task 12

**Open questions resolvidas:**
- (1) Cap few-shot-tenant — Task 5 Step 1 (`.slice(0, 10)`)
- (Risk #9) Silently force pergunta em data nao-ISO — Task 9 Step 2

**Placeholder scan:** zero "TBD"/"implementar depois". Cada task tem `Edit/Write` com codigo literal completo.

**Type consistency:**
- `CadastroOutputSchema` (Task 6) — campos batem com expected nos scenarios (Task 10)
- `validateCadastroOutputInvariant` (Task 6) — reason `data_nascimento nao-ISO:` casa com handler em route.js (Task 9 Step 2)
- `getNextState(estado_atual, out)` assinatura (Task 8) — chamada em route.js identica (Task 9 Step 2)
- `enforceMenorIdade(out)` retorno mantém shape original — assertions de unit test (Task 7) batem com uso em route.js (Task 9 Step 2)
- `selectAgentValidator(estado_atual)` retorna função — chamada `validator(working)` em route.js (Task 9 Step 2)
- helper file path `functions/api/agent/_lib/enforce-menor-idade.js` (Task 7 Step 3) bate com import em route.js (Task 9 Step 1) e unit test (Task 7 Step 1)

**Total tasks:** 13 (≤15 limite skill).

**Riscos chave + mitigacao:**
- Mini falha em normalizar data → silently force pergunta (Task 9 Step 2) garante UX continua
- Regressao Sub-2 → npm test rodado em Tasks 8 Step 5, 9 Step 5, 11 Step 3, 13 Step 2
- Tokens overflow → gate em Task 11 Step 2 (≤2000), trim antes de eval

---

## Outcome (preencher pos-execucao)

**Status:** ready-to-execute

**Plan path:** docs/superpowers/plans/2026-05-08-sub3-cadastro-prompt-v2.md

**Notas pos-exec:**
- (preencher quando rodar)
