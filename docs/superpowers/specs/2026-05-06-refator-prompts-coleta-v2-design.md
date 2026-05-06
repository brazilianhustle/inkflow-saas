---
title: Refator Prompts Coleta v2 — 3 camadas (n8n descriptions + regras.js + few-shots format A + tom B)
slug: refator-prompts-coleta-v2
date: 2026-05-06
status: design-pendente-aprovacao
branch: feat/refator-prompts-coleta-v2
related:
  - 2026-05-02-modo-coleta-v2-principal.md
  - 2026-05-05-wire-tools-coleta-v2-bot-design.md
---

# Refator Prompts Coleta v2 — 3 camadas

## Contexto

PR #27 (`wire-tools-coleta-v2`, mergeado 2026-05-05) wired as 4 tools Coleta v2 ao Agent n8n e refatorou contrato pra `(tenant_id, telefone)`. Smoke backend curl 7/7 PASS. Smoke E2E real WhatsApp **revelou 2 bugs** que bloqueiam 100% dos tenants pagantes em Modo Coleta v2:

### Bug 1 — Anti-pattern em few-shots ensina LLM a imitar pseudo-código

Cliente teste mandou "Quero uma rosa de 10cm no antebraço". Bot respondeu literalmente:

```
Show! Vou anotar isso!

[Chama dados_coletados(campo="descricao_tattoo", valor="rosa")]
[Chama dados_coletados(campo="tamanho_cm", valor=10)]
[Chama dados_coletados(campo="local_corpo", valor="antebraço")]

Pra fechar o orcamento, preciso de uns dados rapidinho:
– Nome completo
– Data de nascimento
– E-mail (opcional)
```

`tool_calls_log`: apenas `tool='prompt'`. **Zero invocações reais** de `dados_coletados`. Conversa não criada em `conversas`.

**Causa raiz:** Os 3 arquivos `functions/_lib/prompts/coleta/{tattoo,cadastro,proposta}/few-shot.js` mostram pseudo-código `[chama tool(...)]` como linha do AGENTE em **41 ocorrências**. O LLM aprende: "essa é a forma de output do agente". Daí copia literal no chat ao invés de invocar tool real.

**Inventário das 41 violações** (apuração via Explore agent):
- `tattoo/few-shot.js`: 18 (linhas 20-92) — 13 `dados_coletados` + 4 `[tool retorna]` + 1 `acionar_handoff`
- `cadastro/few-shot.js`: 17 (linhas 10-69) — 14 `dados_coletados` + 3 `enviar_orcamento_tatuador`
- `proposta/few-shot.js`: 6 (linhas 11-52) — 2 `consultar_horarios_livres` + 1 `reservar_horario` + 1 `gerar_link_sinal` + 2 `enviar_objecao_tatuador`
- `few-shot-tenant.js` (todos 3) ✅ já estão limpos (sem pseudo-código)

### Bug 2 — URL corrompida em `consultar_proposta_tatuador` (n8n)

Inspeção do export `MEU NOVO WORK - SAAS (20).json` revelou que o tool node `consultar_proposta_tatuador` tem URL malformada:

```
https://inkflowbrasil.cohttps://inkflowbrasil.com/api/tools/consultar-proposta-tatuadorm/api/tools/acionar-handoff
```

Provavelmente artefato de copy-paste durante duplicação dos 4 nodes em PR #27 (find/replace de `acionar-handoff` → `consultar-proposta-tatuador` aplicado dentro da URL ao invés de substituí-la). **Mesmo que o LLM invoque a tool, falha 100%.**

### Sintomas adicionais (debt acumulado)

- Few-shots usam contrato OBSOLETO `enviar_orcamento_tatuador(conversa_id)` — PR #27 mudou pra `(tenant_id, telefone)`. Cliente nunca veria isso (pseudo-código não-invocável), mas é debt.
- Violações de `tom.js` em few-shots: lista bullet de 3 perguntas/turno (viola "1 pergunta por vez"), mensagens >200 chars (viola "1-2 linhas, max 200"), uso de "vou passar pro tatuador" (viola regra "atendente em primeira pessoa, NÃO intermediária").
- Tool descriptions n8n são pragmáticas mas não-canônicas — falta especificação explícita de gatilhos semânticos pra invocação.

## Goals

1. **Bot invoca tools de verdade** após cliente fornecer dados (validável via `tool_calls_log` em smoke E2E real)
2. **Zero pseudo-código** chega ao chat WhatsApp (validável via invariant test + smoke)
3. **Tom alinhado a `tom.js`**: 1 pergunta/turno, sem listas-bullet, validação substantiva ANTES de pedir cadastro, primeira pessoa em "vou enviar ao tatuador"
4. **Tools 100% funcionais**: bug URL `consultar_proposta_tatuador` corrigido + 4 descriptions seguem template canônico

## Out of scope (explícito)

- **Áudios** (entender profundo, ajustar tom ao input áudio) — P1 follow-up. Vive em arquivos separados (Vision pre-process n8n + futuro `_shared/multimodal.js`)
- **Imagens com marcação além do Exemplo 5 atual** — P1 follow-up. Vision prompt em n8n é separado
- **Bugs n8n estruturais** — `Get a row` apontando pra `dados_cliente` legacy, 3 tabelas redundantes (`dados_cliente`/`chats`/`conversas`), `n8n_chat_histories` sem tenant_id FK — backlog
- **Canonicalização das 8 tool descriptions antigas** (Modo Exato/Faixa) — P2 backlog. Funcionam em prod, anti-pattern de dev sênior é "refactor working code without need". Pattern estabelecido nas 4 Coleta v2 serve de referência futura
- **A/B testing de prompts** — futuro distante
- **Cross-sell automático** — decidido NÃO MVP em sessão anterior
- **Bot responder em áudio** — decidido NÃO MVP

## Decisões cravadas (Q1-Q6)

| Q | Decisão | Razão |
|---|---|---|
| Q1 | **Escopo B+** = anti-pattern + tom + n8n descriptions | Tom vive DENTRO dos few-shots — refatorar formato e DEPOIS o tom = tocar 2× nos mesmos arquivos. n8n descriptions são camada 1 do pattern canônico Anthropic Tool Use; sem hardenizar, mesmo few-shots perfeitos podem invocar tool no momento errado. |
| Q2 | **Format A**: few-shots em conversa pura `CLIENTE ↔ AGENTE`, zero pseudo-código de tool. Tools são "implícitas no design" — descritas em §4b regras.js | Pattern canônico Anthropic/OpenAI cookbooks. LLM já vem treinado pra esse formato. |
| Q3 | **Pace B (moderado)**: +1 turno de validação substantiva ("rosa de 10cm fica top — bem visível, dá pra trabalhar bons detalhes") + cadastro em texto corrido (não lista bullet) | Calor humano sem custar tempo. Tom vendedor honesto sem alta pressão. ~8 mensagens cliente↔bot até cadastro vs ~6 atual. |
| Q4 | **§4b TOOLS QUANDO INVOCAR em `regras.js` por fase** (extensão dos R1-R8 existentes, numeração T1-Tn paralela) | Phase-specific por design. Mantém todas regras de comportamento em UM arquivo por fase. Numeração T1-Tn facilita debug + cross-rule reference. Zero arquivos novos. |
| Q5 | **Camada 1 hardening canonical full nas 4 Coleta v2**, mantendo concisão (~15 linhas estruturadas/tool) | Já estamos editando essas 4 (URL bug obriga). Refazer arquivo 2× é desperdício. Não estende às 8 antigas pra evitar regressão em código que funciona. |
| Q6 | **Bundled em 1 PR único** (URL fix + camada 1 + camada 2 + camada 3) | Zero tenant pagante real → urgência de hotfix isolado é falsa. 1 smoke E2E valida tudo junto. |

---

## Camada 1 — n8n Tool Descriptions

### 1.1 Bug fix — URL `consultar_proposta_tatuador`

**Estado atual no JSON exportado:**
```
URL: https://inkflowbrasil.cohttps://inkflowbrasil.com/api/tools/consultar-proposta-tatuadorm/api/tools/acionar-handoff
```

**Estado correto:**
```
URL: https://inkflowbrasil.com/api/tools/consultar-proposta-tatuador
```

**Como aplicar:** via UI manual n8n (editar tool node `consultar_proposta_tatuador`, campo URL) OU via MCP `update_workflow` + `publish_workflow` quando MCP n8n estiver disponível na sessão de implementação.

### 1.2 Template canônico (5 seções, conciso)

Cada uma das 4 tool descriptions deve seguir:

```
[O QUE FAZ] — 1 frase descrevendo a ação concreta no banco/Telegram.

[QUANDO INVOCAR]
- <gatilho semântico 1, em termos de estado/ação do cliente>
- <gatilho 2>

[QUANDO NÃO INVOCAR]
- <anti-condição 1>
- <anti-condição 2>

[PARÂMETROS]
- <param>: <semântica + restrições>

[APÓS RESPOSTA]
- Sucesso: <o que dizer ao cliente / que estado vira>
- Erro <código>: <como reagir>
```

Limite: ~15 linhas estruturadas por tool. Verbosidade excessiva degrada attention budget do LLM.

### 1.3 Reescrita das 4 descriptions

#### `dados_coletados`

```
Persiste 1 campo coletado do cliente em `conversas.dados_coletados` ou `dados_cadastro` (JSONB). Cria a row se primeira chamada (UPSERT idempotente). 

QUANDO INVOCAR
- Após cliente fornecer 1 ou mais campos OBR da fase atual.
- Tattoo OBR: descricao_tattoo, tamanho_cm, local_corpo (3 campos pra completar fase).
- Cadastro OBR: nome, data_nascimento (2 campos pra completar; email é opcional).
- Pode encadear várias chamadas no MESMO turno se cliente mandou multi-info ("Maria Silva, 12/03/1995, maria@gmail.com").

QUANDO NÃO INVOCAR
- Se valor está obviamente inválido (deixe o backend validar — ele retorna gatilho).
- Se cliente está perguntando, não fornecendo (ex: "qual nome vocês precisam?").

PARÂMETROS
- campo (string): nome do campo. Tattoo: descricao_tattoo, tamanho_cm, local_corpo, estilo, foto_local, refs_imagens. Cadastro: nome, data_nascimento, email.
- valor (string): valor literal. Tamanho_cm: número como string. refs_imagens: array como string.

APÓS RESPOSTA
- Sucesso normal: estado avança internamente. Confirme a coleta com 1 frase de validação substantiva, sem citar a tool.
- proxima_fase="cadastro": 3 OBR tattoo completos. Peça nome+data+email em texto corrido (NÃO lista bullet).
- gatilho="data_invalida": peça data em formato dia/mes/ano.
- gatilho="menor_idade": 1 frase educada de despedida. Tool já fez handoff — NÃO chame acionar_handoff manualmente.
```

#### `enviar_orcamento_tatuador`

```
Monta orçamento (3 OBR tattoo + 2 OBR cadastro) e envia ao tatuador via Telegram com botões [Fechar valor / Recusar]. Idempotente via orcid (chamadas duplicadas retornam o existente sem reenviar). Estado vira `aguardando_tatuador`.

QUANDO INVOCAR
- Após `dados_coletados` confirmar nome + data_nascimento (2 OBR cadastro completos) E os 3 OBR tattoo (descricao_tattoo, tamanho_cm, local_corpo) já estarem em `dados_coletados`.
- Email é OPCIONAL — não bloqueia envio.

QUANDO NÃO INVOCAR
- Se algum dos 5 OBR está faltando (a tool retorna 400).
- Se conversa retornou gatilho="menor_idade" — handoff já foi disparado.
- Se cliente ainda está fornecendo dados — espere coletar tudo primeiro.

PARÂMETROS
- tenant_id (string, UUID do estúdio).
- telefone (string, telefone do cliente sem formatação).

APÓS RESPOSTA
- Sucesso: confirme ao cliente que enviou ao tatuador e que dará retorno em breve. NÃO prometa prazo específico ("hoje", "1h") — use "em breve". Você SAI da conversa (estado=aguardando_tatuador). Bot reentra automaticamente quando tatuador decidir no Telegram.
- 404: conversa não existe — provavelmente cadeia rompida. Refaça `dados_coletados` ou peça os campos faltantes.
- 400 (telegram-sem-configurar): tenant não tem `tatuador_telegram_chat_id` — chame `acionar_handoff` em vez disso.
```

#### `enviar_objecao_tatuador`

```
Envia desconto pedido pelo cliente ao tatuador via Telegram com botões [Aceitar X / Manter Y]. Estado vira `aguardando_decisao_desconto`.

QUANDO INVOCAR
- Cliente solicitou valor diferente do `valor_proposto` em fase `propondo_valor`.
- Cliente disse "ta um pouco caro" + você perguntou "quanto tu tava pensando?" + cliente respondeu valor.
- Cliente disse direto "consegue por X?".

QUANDO NÃO INVOCAR
- Se `valor_proposto` ainda não foi setado (estado_agente != propondo_valor) — tool retorna 400.
- Se cliente está só perguntando preço sem propor desconto — confirme valor original em vez de objetar.
- Duas vezes pra mesma decisão — espere tatuador decidir antes de re-objetar.

PARÂMETROS
- tenant_id (string).
- telefone (string).
- valor_pedido_cliente (number): valor numérico que cliente pediu (ex: 600).

APÓS RESPOSTA
- Sucesso: 1 frase confirmando que vai consultar o tatuador, em primeira pessoa ("vou levar pra ele avaliar e te retorno"). NÃO use "vou passar pro tatuador" — soa como secretária. Você SAI da conversa.
- 400 (valor_proposto ausente): estado errado, possível bug de fluxo — chame `acionar_handoff` em vez de retentar.
```

#### `consultar_proposta_tatuador`

```
Lê estado atual da conversa (estado_agente, valor_proposto, valor_pedido_cliente, decisao_desconto, mensagem_tatuador, orcid). Read-only — não muta nada.

QUANDO INVOCAR
- Cliente perguntou status do orçamento ("e aí, ele já respondeu?").
- Você está em estado_agente=propondo_valor ou aguardando_decisao_desconto e precisa confirmar valor atual antes de responder.

QUANDO NÃO INVOCAR
- Em estado_agente=coletando_tattoo ou coletando_cadastro — ainda não há orçamento pra consultar.
- Após cada turno do cliente — read-only mas custa 1 chamada de rede + tokens.

PARÂMETROS
- tenant_id (string).
- telefone (string).

APÓS RESPOSTA
- Sucesso: use os campos retornados pra fundamentar resposta ao cliente. Ex: se decisao_desconto="aceito", confirme novo valor; se decisao_desconto="recusado", apresente valor original com tom suave.
- 404: conversa não existe ainda — possível inconsistência, chame `acionar_handoff`.
```

### 1.4 Aplicação técnica

**Opção 1 — Manual UI (recomendado se MCP n8n indisponível):**
1. Acessar n8n UI > workflow `MEU NOVO WORK - SAAS`
2. Para cada um dos 4 nodes, editar campo `Tool Description`, colar texto canônico acima
3. Para `consultar_proposta_tatuador`, fixar URL: `https://inkflowbrasil.com/api/tools/consultar-proposta-tatuador`
4. Salvar workflow → MCP `publish_workflow` (quando disponível) OU "Activate" via UI

**Opção 2 — MCP-driven (se MCP n8n disponível na implementação):**
1. `get_workflow_details` → extrair workflow JSON
2. Editar JSON in-place (descriptions + URL fix)
3. `update_workflow` → `publish_workflow`
4. Confirmar `activeVersionId` mudou

**Salvar export local:** após aplicar, baixar novo JSON e versionar em `docs/workflows/MEU NOVO WORK - SAAS - <data>.json` no repo? **Decisão:** SIM — facilita PR review (diff visível) e serve de backup. Adicionar `docs/workflows/.gitkeep` se diretório não existir.

---

## Camada 2 — `regras.js` por fase: nova §4b TOOLS QUANDO INVOCAR

### 2.1 Princípios

- Numeração T1-Tn paralela à R1-R8 existente.
- Phase-specific (cada fase tem seu set de tools).
- T1 universal sempre: "tools são invisíveis ao cliente".
- T2+ específicos da fase.
- Última regra T sempre: "após chamar tool de saída, você SAI da conversa" (alinha com R8 cadastro / R7 proposta existentes).

### 2.2 §4b adicionado a `coleta/tattoo/regras.js`

Append após R8 (linha 41):

```javascript
linhas.push('');
linhas.push('# §4b TOOLS — QUANDO INVOCAR (interno, invisível ao cliente)');
linhas.push('**T1.** Tools NÃO existem na conversa visível. Cliente nunca vê "[chama X]", JSON, ou nome de tool. Se cliente perguntar como você sabe X, responda como se fosse memória sua ("Show, anotei aqui").');
linhas.push('');
linhas.push('**T2.** `dados_coletados` — chame APÓS o cliente fornecer cada campo OBR (descricao_tattoo, tamanho_cm, local_corpo). Uma chamada por campo. Pode encadear várias chamadas no MESMO turno se cliente mandou multi-info ("rosa de 10cm no antebraço" = 3 chamadas).');
linhas.push('');
linhas.push('**T3.** Quando 3 OBR completos, `dados_coletados` retorna `{proxima_fase: "cadastro"}`. Confirme a coleta com validação substantiva (NÃO só "anotei") e peça os 2 OBR cadastro em texto corrido — JAMAIS lista bullet.');
linhas.push('');
linhas.push('**T4.** `acionar_handoff` — conforme R6/R7. Nunca por "caso complexo" — coleta da tattoo é SUA função.');
```

### 2.3 §4b adicionado a `coleta/cadastro/regras.js`

Append após R8 (linha 22):

```javascript
linhas.push('');
linhas.push('# §4b TOOLS — QUANDO INVOCAR (interno, invisível ao cliente)');
linhas.push('**T1.** Tools NÃO existem na conversa visível. Cliente nunca vê pseudo-código.');
linhas.push('');
linhas.push('**T2.** `dados_coletados` — chame APÓS cliente fornecer nome/data_nascimento/email. Uma chamada por campo. Pode encadear se cliente mandou multi-info ("Maria Silva, 12/03/1995").');
linhas.push('');
linhas.push('**T3.** Se `data_nascimento` retornar `gatilho="menor_idade"`, NÃO chame `enviar_orcamento_tatuador`. Tool já transicionou estado pra `aguardando_tatuador`. Responda com 1 frase educada de despedida.');
linhas.push('');
linhas.push('**T4.** Se data retornar `gatilho="data_invalida"`, peça data em formato dia/mes/ano. NÃO insista além de 2 tentativas — após 2ª tentativa falha, chame `acionar_handoff(motivo="data_invalida_persistente")`.');
linhas.push('');
linhas.push('**T5.** `enviar_orcamento_tatuador` — chame APÓS 2 OBR cadastro completos (nome + data_nascimento) E 3 OBR tattoo já confirmados. Email é OPCIONAL — não bloqueie envio se faltar (R5).');
linhas.push('');
linhas.push('**T6.** Após `enviar_orcamento_tatuador` sucesso, responda em PRIMEIRA PESSOA: "vou enviar ao tatuador e te retorno em breve". NUNCA "vou passar pro tatuador" (R8 + tom.js). Você SAI (R8). NÃO continue conversando.');
```

### 2.4 §4b adicionado a `coleta/proposta/regras.js`

Append após R9 (linha 23):

```javascript
linhas.push('');
linhas.push('# §4b TOOLS — QUANDO INVOCAR (interno, invisível ao cliente)');
linhas.push('**T1.** Tools NÃO existem na conversa visível. Cliente nunca vê pseudo-código.');
linhas.push('');
linhas.push('**T2.** `consultar_proposta_tatuador` — chame se cliente perguntar status OU se você precisa refresh do estado pra responder. Read-only, mas custoso — não chame redundantemente.');
linhas.push('');
linhas.push('**T3.** `enviar_objecao_tatuador` — chame APENAS quando cliente pediu valor diferente do `valor_proposto` em fase `propondo_valor`. Requer `valor_pedido_cliente` numérico. NÃO chame 2× pro mesmo orcid.');
linhas.push('');
linhas.push('**T4.** Após `enviar_objecao_tatuador` sucesso, responda em PRIMEIRA PESSOA: "vou levar pra ele avaliar e te retorno". NUNCA "vou passar pro tatuador". Você SAI (R7).');
linhas.push('');
linhas.push('**T5.** `reservar_horario` + `gerar_link_sinal` — sequência permitida no mesmo turno (R4). Use SOMENTE slots retornados por `consultar_horarios_livres` (R6). JAMAIS invente slot.');
```

---

## Camada 3 — Few-shots em conversa pura (format A) + tom B

### 3.1 Princípios

**Format A:** Cada few-shot mostra APENAS turnos de `CLIENTE` e `AGENTE` em texto natural. Zero `[chama X]`, zero `[tool retorna Y]`, zero comentário interno. Tools são instruídas via Camada 1 (descriptions n8n) + Camada 2 (§4b).

**Tom B:**
- Validação substantiva 1× antes de pedir cadastro: comente a escolha do cliente (ex: "rosa de 10cm fica top — bem visível"), não só "Show, anotei".
- Cadastro em texto corrido (NÃO lista bullet): "me passa nome completo e data de nascimento, e-mail é opcional" em UMA frase.
- Primeira pessoa em "vou enviar ao tatuador" / "vou levar pra ele" — NUNCA "vou passar pro tatuador".
- Mantém regras `tom.js`: ≤200 chars/msg, ≤1 pergunta/turno, sem preâmbulos proibidos, sem 1-palavra.
- Mantém regras phase-specific (R1-R8/R9 existentes).

### 3.2 Antes/Depois — Tattoo Exemplo 1

**Antes (atual, infectado):**
```
CLIENTE: oi quero fazer uma rosa
AGENTE: Oii, tudo bem? Aqui e Lina do Hustle Ink

AGENTE: Massa! Conta mais — tem ideia do tamanho e onde no corpo?
CLIENTE: uns 10cm no antebraço
AGENTE: [chama dados_coletados(campo="descricao_tattoo", valor="rosa")]
AGENTE: [chama dados_coletados(campo="tamanho_cm", valor=10)]
AGENTE: [chama dados_coletados(campo="local_corpo", valor="antebraço")]
AGENTE: [tool retorna proxima_fase: "cadastro"]
AGENTE: Show, anotei tudo da tattoo!

AGENTE: Pra fechar o orcamento, preciso de uns dados rapidinho:
- Nome completo
- Data de nascimento
- E-mail (opcional)
```

**Depois (format A + tom B):**
```
CLIENTE: oi quero fazer uma rosa
AGENTE: Oii, tudo bem? Aqui e Lina do Hustle Ink

AGENTE: Massa! Tem ideia de tamanho e onde no corpo?
CLIENTE: uns 10cm no antebraço
AGENTE: Rosa de 10cm no antebraco fica top — bem visivel, da pra trabalhar bons detalhes

AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve
```

**Mudanças cravadas:**
- 4 linhas pseudo-código removidas (linhas 20-23)
- "Show, anotei tudo da tattoo!" → "Rosa de 10cm no antebraço fica top — bem visível, dá pra trabalhar bons detalhes" (validação substantiva, ainda <200 chars)
- Lista 3-bullet → 1 frase texto corrido com expectativa positiva ("liberar teu orçamento personalizado", "tatuador retorna em breve")

### 3.3 Antes/Depois — Tattoo Exemplo 2 (cliente pergunta preço cedo)

**Antes:**
```
CLIENTE: quanto fica uma rosa pequena?
AGENTE: sobre valor o tatuador confirma quando avaliar tua ideia — segue comigo que a gente fecha rapidinho. Tem ideia de tamanho e onde no corpo?
CLIENTE: 8cm no pulso
AGENTE: [chama dados_coletados(campo="descricao_tattoo", valor="rosa pequena")]
AGENTE: [chama dados_coletados(campo="tamanho_cm", valor=8)]
AGENTE: [chama dados_coletados(campo="local_corpo", valor="pulso")]
AGENTE: [tool retorna proxima_fase: "cadastro"]
AGENTE: Anotei. Pra eu te passar o orcamento certinho, preciso de uns dados:
- Nome completo
- Data de nascimento
- E-mail (opcional)
```

**Depois:**
```
CLIENTE: quanto fica uma rosa pequena?
AGENTE: Sobre valor o tatuador confirma quando avaliar tua ideia — segue comigo que a gente fecha rapidinho

AGENTE: Tem ideia de tamanho e onde no corpo?
CLIENTE: 8cm no pulso
AGENTE: Rosa pequena no pulso fica delicada, combina muito com o local

AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve
```

**Mudanças cravadas:**
- 4 pseudo-códigos removidos
- Resposta inicial sobre preço quebrada em 2 turnos (regra `tom.js`: 1 pergunta/turno)
- Validação substantiva: "rosa pequena no pulso fica delicada, combina muito com o local"
- Mesmo cadastro em texto corrido

### 3.4 Antes/Depois — Tattoo Exemplo 3 (cobertura, handoff)

**Antes:**
```
CLIENTE: queria uma tattoo nova aqui [foto: braço com tatuagem antiga grande]
AGENTE: Vi que ja tem tattoo nesse local. Seria pra cobertura?
CLIENTE: sim
AGENTE: Pra cobertura o tatuador avalia pessoalmente — ja sinalizei pra ele
AGENTE: [chama acionar_handoff(motivo="cover_up_detectado")]
```

**Depois:**
```
CLIENTE: queria uma tattoo nova aqui [foto: braço com tatuagem antiga grande]
AGENTE: Vi que ja tem tattoo nesse local. Seria pra cobertura?
CLIENTE: sim
AGENTE: Pra cobertura o tatuador avalia pessoalmente — ja sinalizei pra ele
```

**Mudanças cravadas:**
- 1 pseudo-código `[chama acionar_handoff]` removido — última linha do exemplo
- Fluxo permanece idêntico: bot anuncia handoff e termina (LLM invoca tool por trás)

### 3.5 Antes/Depois — Tattoo Exemplo 4 (fallback altura)

**Antes:**
```
CLIENTE: quero um leao no peitoral
AGENTE: [chama dados_coletados(campo="descricao_tattoo", valor="leao")]
AGENTE: [chama dados_coletados(campo="local_corpo", valor="peitoral")]
AGENTE: Massa! Tem ideia do tamanho?
CLIENTE: nao faço ideia, voce que sabe
AGENTE: Tranquilo. Manda tua altura (tipo 1.70m) que com a foto do peitoral consigo calcular a proporcao certinha
CLIENTE: 1.78m
AGENTE: [chama dados_coletados(campo="tamanho_cm", valor=18) — calculado a partir da altura+local]
AGENTE: [tool retorna proxima_fase: "cadastro"]
AGENTE: Anotei, vai ficar 18cm aprox. Pra fechar o orcamento, preciso:
- Nome completo
- Data de nascimento
- E-mail (opcional)
```

**Depois:**
```
CLIENTE: quero um leao no peitoral
AGENTE: Massa! Tem ideia do tamanho?
CLIENTE: nao faço ideia, voce que sabe
AGENTE: Tranquilo. Manda tua altura (tipo 1.70m) que com a foto do peitoral consigo calcular a proporcao certinha
CLIENTE: 1.78m
AGENTE: Pelo peitoral em proporcao com 1.78m, leao em torno de 18cm fica bem encaixado

AGENTE: Pra eu liberar teu orcamento, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve
```

**Mudanças cravadas:**
- 4 pseudo-códigos removidos
- Validação substantiva da inferência de tamanho ("em proporção com 1.78m, leão em torno de 18cm fica bem encaixado") substitui "Anotei, vai ficar 18cm aprox"
- Cadastro em texto corrido

### 3.6 Antes/Depois — Tattoo Exemplo 5 (imagem com marcação)

**Antes:**
```
CLIENTE: olha aqui [foto: antebraço com retangulo desenhado a caneta]
AGENTE: Vi a marcacao — entao seria desse tamanho aproximado nessa posicao do antebraco, certo? E qual a ideia da tattoo?
CLIENTE: sim, tamanho exato. quero uma frase em fineline
AGENTE: [chama dados_coletados(campo="local_corpo", valor="antebraço")]
AGENTE: [chama dados_coletados(campo="descricao_tattoo", valor="frase em fineline")]
AGENTE: [chama dados_coletados(campo="estilo", valor="fineline")]
AGENTE: Quanto cm da pra estimar pela marcacao? Algo entre 8-12cm parece bater?
CLIENTE: 10cm
AGENTE: [chama dados_coletados(campo="tamanho_cm", valor=10)]
AGENTE: [tool retorna proxima_fase: "cadastro"]
AGENTE: Show, anotei. Pra fechar o orcamento, preciso:
- Nome completo
- Data de nascimento
- E-mail (opcional)
```

**Depois:**
```
CLIENTE: olha aqui [foto: antebraço com retangulo desenhado a caneta]
AGENTE: Vi a marcacao no antebraco. Qual a ideia da tattoo?
CLIENTE: uma frase em fineline, tamanho exato da marcacao
AGENTE: Frase em fineline nesse tamanho fica delicada e elegante

AGENTE: Quantos cm tem a marcacao? Entre 8-12cm parece bater?
CLIENTE: 10cm
AGENTE: Pra eu liberar teu orcamento, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve
```

**Mudanças cravadas:**
- 4 pseudo-códigos removidos
- Pergunta inicial dividida em 2 turnos (1 pergunta/turno conforme tom.js)
- Validação substantiva sobre estilo ("fineline fica delicada e elegante")
- Cadastro em texto corrido

### 3.7 Antes/Depois — Cadastro Exemplo 1 (multi-info)

**Antes:**
```
CLIENTE: Maria Silva, 12/03/1995, maria@gmail.com
AGENTE: [chama dados_coletados(campo="nome", valor="Maria Silva")]
AGENTE: [chama dados_coletados(campo="data_nascimento", valor="1995-03-12")]
AGENTE: [chama dados_coletados(campo="email", valor="maria@gmail.com")]
AGENTE: [chama enviar_orcamento_tatuador(conversa_id) — retorna orcid: orc_xxx]
AGENTE: Anotei tudo! Vou passar pro tatuador avaliar. Em breve te volto com o valor
```

**Depois:**
```
CLIENTE: Maria Silva, 12/03/1995, maria@gmail.com
AGENTE: Anotei tudo, Maria! Vou enviar ao tatuador agora e te retorno em breve com o valor
```

**Mudanças cravadas:**
- 4 pseudo-códigos removidos
- "Vou passar pro tatuador" → "Vou enviar ao tatuador agora" (1ª pessoa, conforme tom.js)
- Personalização: usa primeiro nome do cliente

### 3.8 Antes/Depois — Cadastro Exemplo 2 (cliente recusa email)

**Antes:**
```
CLIENTE: Joao Pereira, 22/05/1998
AGENTE: [chama dados_coletados(campo="nome", valor="Joao Pereira")]
AGENTE: [chama dados_coletados(campo="data_nascimento", valor="1998-05-22")]
AGENTE: E o e-mail?
CLIENTE: nao tenho email pra passar agora
AGENTE: [chama enviar_orcamento_tatuador(conversa_id)]
AGENTE: Tranquilo! Vou passar pro tatuador avaliar. Em breve te volto com o valor
```

**Depois:**
```
CLIENTE: Joao Pereira, 22/05/1998
AGENTE: Anotei. E-mail (opcional) tu prefere mandar ou pode seguir sem?
CLIENTE: nao tenho email pra passar agora
AGENTE: Tranquilo, Joao! Vou enviar ao tatuador agora e te retorno em breve
```

### 3.9 Antes/Depois — Cadastro Exemplo 3 (parcial, agente pede o resto)

**Antes:**
```
CLIENTE: meu nome e Ana Carolina
AGENTE: [chama dados_coletados(campo="nome", valor="Ana Carolina")]
AGENTE: Show, Ana. E a data de nascimento?
CLIENTE: 14 de novembro de 2000
AGENTE: [chama dados_coletados(campo="data_nascimento", valor="2000-11-14")]
AGENTE: E o e-mail?
CLIENTE: ana@gmail.com
AGENTE: [chama dados_coletados(campo="email", valor="ana@gmail.com")]
AGENTE: [chama enviar_orcamento_tatuador(conversa_id)]
AGENTE: Anotei tudo! Vou passar pro tatuador avaliar. Em breve te volto com o valor
```

**Depois:**
```
CLIENTE: meu nome e Ana Carolina
AGENTE: Show, Ana. E a data de nascimento?
CLIENTE: 14 de novembro de 2000
AGENTE: Anotei. E-mail (opcional) tu prefere mandar?
CLIENTE: ana@gmail.com
AGENTE: Anotei tudo, Ana! Vou enviar ao tatuador agora e te retorno em breve
```

### 3.10 Antes/Depois — Cadastro Exemplo 4 (data inválida)

**Antes:**
```
CLIENTE: Pedro Santos, nasci no 91
AGENTE: [chama dados_coletados(campo="nome", valor="Pedro Santos")]
AGENTE: [chama dados_coletados(campo="data_nascimento", valor="91") — retorna gatilho: "data_invalida"]
AGENTE: Nao consegui ler a data, pode mandar no formato dia/mes/ano? Tipo 15/06/1991
CLIENTE: 15/06/1991
AGENTE: [chama dados_coletados(campo="data_nascimento", valor="1991-06-15")]
AGENTE: Beleza. E o e-mail?
CLIENTE: pedro91@email.com
AGENTE: [chama dados_coletados(campo="email", valor="pedro91@email.com")]
AGENTE: [chama enviar_orcamento_tatuador(conversa_id)]
AGENTE: Anotei tudo! Vou passar pro tatuador avaliar. Em breve te volto com o valor
```

**Depois:**
```
CLIENTE: Pedro Santos, nasci no 91
AGENTE: Nao consegui ler a data, pode mandar dia/mes/ano? Tipo 15/06/1991
CLIENTE: 15/06/1991
AGENTE: Beleza. E-mail (opcional) tu prefere mandar?
CLIENTE: pedro91@email.com
AGENTE: Anotei tudo, Pedro! Vou enviar ao tatuador agora e te retorno em breve
```

### 3.11 Antes/Depois — Cadastro Exemplo 5 (menor de idade)

**Antes:**
```
CLIENTE: Lucas Rocha, 03/07/2010
AGENTE: [chama dados_coletados(campo="nome", valor="Lucas Rocha")]
AGENTE: [chama dados_coletados(campo="data_nascimento", valor="2010-07-03") — retorna gatilho: "menor_idade"]
AGENTE: Pra clientes com menos de 18 anos o tatuador conversa direto com responsavel legal. Ja sinalizei pra ele.
```

**Depois:**
```
CLIENTE: Lucas Rocha, 03/07/2010
AGENTE: Pra clientes com menos de 18 anos o tatuador conversa direto com responsavel legal. Ja sinalizei pra ele.
```

### 3.12 Antes/Depois — Proposta Exemplo 1 (caminho A: aceita)

**Antes:**
```
AGENTE: Show! Pelo trabalho ficou em R$ 750. Bora marcar?
CLIENTE: fechou, vamos marcar
AGENTE: [chama consultar_horarios_livres(tenant_id, data_preferida=null)]
AGENTE: Tenho disponivel: ter 14h, qui 10h, sex 16h. Qual prefere?
CLIENTE: qui
AGENTE: [chama reservar_horario(...inicio/fim do slot qui 10h...)]
AGENTE: [chama gerar_link_sinal(agendamento_id, valor_sinal=225)]
AGENTE: Pra agendar a gente trabalha com sinal de 30% do valor, fica em R$ 225.

https://link-pagamento-aqui

AGENTE: O link tem validade de 24 horas. Se expirar, so me chamar que envio outro.
```

**Depois:**
```
AGENTE: Show! Pelo trabalho ficou em R$ 750. Bora marcar?
CLIENTE: fechou, vamos marcar
AGENTE: Tenho disponivel: ter 14h, qui 10h, sex 16h. Qual prefere?
CLIENTE: qui
AGENTE: Pra agendar a gente trabalha com sinal de 30% do valor, fica em R$ 225

https://link-pagamento-aqui

AGENTE: O link tem validade de 24 horas. Se expirar, so me chamar que envio outro
```

**Mudanças cravadas:**
- 3 pseudo-códigos removidos (consultar_horarios_livres, reservar_horario, gerar_link_sinal)
- Pontos finais removidos em frases curtas (regra tom.js)

### 3.13 Antes/Depois — Proposta Exemplo 2 (caminho B: desconto sem valor)

**Antes:**
```
AGENTE: Show! Pelo trabalho ficou em R$ 750. Bora marcar?
CLIENTE: ta um pouco caro
AGENTE: Quanto tu tava pensando?
CLIENTE: uns 600
AGENTE: [chama enviar_objecao_tatuador(conversa_id, valor_pedido_cliente=600)]
AGENTE: Vou levar pra ele analisar essa proposta — quem fecha o valor e o tatuador. Em breve te dou um retorno.
```

**Depois:**
```
AGENTE: Show! Pelo trabalho ficou em R$ 750. Bora marcar?
CLIENTE: ta um pouco caro
AGENTE: Quanto tu tava pensando?
CLIENTE: uns 600
AGENTE: Vou levar pra ele analisar — quem fecha o valor e o tatuador. Te dou um retorno em breve
```

**Mudanças cravadas:**
- 1 pseudo-código removido
- "Vou levar pra ele" mantido (já está em 1ª pessoa, OK)

### 3.14 Antes/Depois — Proposta Exemplo 3 (caminho B: desconto com valor)

**Antes:**
```
AGENTE: Show! Pelo trabalho ficou em R$ 750. Bora marcar?
CLIENTE: consegue por 600?
AGENTE: [chama enviar_objecao_tatuador(conversa_id, valor_pedido_cliente=600)]
AGENTE: Anotado! Primeiro preciso passar pro tatuador avaliar e te retorno com a resposta.
```

**Depois:**
```
AGENTE: Show! Pelo trabalho ficou em R$ 750. Bora marcar?
CLIENTE: consegue por 600?
AGENTE: Anotado! Vou consultar com o tatuador e te retorno com a resposta
```

**Mudanças cravadas:**
- 1 pseudo-código removido
- "preciso passar pro tatuador" → "Vou consultar com o tatuador" (1ª pessoa, sem "passar")

### 3.15 Exemplos 4-6 da Proposta (não-pseudocódigo no AGENTE atual)

Exemplos 4 (reentrada após aceitar), 5 (reentrada após manter), 6 (caminho C adia) — atualmente já não têm pseudo-código de tool atribuído ao AGENTE. **Manter como está**, apenas auditar pra remover pontos finais em frases curtas se houver violação tom.js.

### 3.16 `few-shot-tenant.js` (todos 3)

Auditar os 3 arquivos `tattoo/few-shot-tenant.js`, `cadastro/few-shot-tenant.js`, `proposta/few-shot-tenant.js`. Status atual: já estão limpos de pseudo-código (Explore confirmou). Verificar:
- Sem pseudo-código `[chama X]` ou `[tool retorna]`
- Validações tom.js (≤200 chars, 1 pergunta/turno, sem "vou passar pro tatuador")

Se OK, manter intactos. Se houver violação tom.js menor, corrigir.

---

## Camada 4 — Tests

### 4.1 Tests novos (invariants)

#### `tests/prompts/no-pseudocode.test.mjs`

Garante que prompt gerado de qualquer fase Coleta não contém pseudo-código de tool. Detecta regressão.

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { generatePromptColetaTattoo } from '../../functions/_lib/prompts/coleta/tattoo/generate.js';
import { generatePromptColetaCadastro } from '../../functions/_lib/prompts/coleta/cadastro/generate.js';
import { generatePromptColetaProposta } from '../../functions/_lib/prompts/coleta/proposta/generate.js';

const MOCK_TENANT = {
  id: 'mock-tenant',
  nome_estudio: 'Hustle Ink',
  nome_agente: 'Lina',
  config_agente: { tom: 'casual', emoji_level: 'raro', usa_giria: true },
  gatilhos_handoff: ['rosto', 'mão', 'pescoço'],
};
const MOCK_CONVERSA = { telefone: '5511999999999' };
const MOCK_CTX = {};

const ANTI_PATTERNS = [
  /AGENTE:\s*\[chama\s+\w+/i,
  /AGENTE:\s*\[tool\s+retorna/i,
  /\[chama\s+dados_coletados/i,
  /\[chama\s+enviar_orcamento/i,
  /\[chama\s+enviar_objecao/i,
  /\[chama\s+consultar_proposta/i,
  /\[chama\s+acionar_handoff/i,
];

describe('prompts coleta — no pseudo-código de tool', () => {
  const generators = [
    ['tattoo', generatePromptColetaTattoo],
    ['cadastro', generatePromptColetaCadastro],
    ['proposta', generatePromptColetaProposta],
  ];

  for (const [fase, gen] of generators) {
    it(`fase ${fase}: prompt gerado não contém AGENTE: [chama X] ou [tool retorna]`, () => {
      const prompt = gen(MOCK_TENANT, MOCK_CONVERSA, MOCK_CTX);
      for (const pattern of ANTI_PATTERNS) {
        const match = prompt.match(pattern);
        assert.equal(
          match,
          null,
          `Fase ${fase}: anti-pattern detectado: "${match?.[0]}"`
        );
      }
    });
  }
});
```

**Cobertura:** 3 testes (1 por fase) × 7 patterns = 21 assertivas.

#### `tests/prompts/tom-invariants.test.mjs`

Heurísticas pra garantir que mensagens AGENTE em few-shots respeitam tom.js.

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { generatePromptColetaTattoo } from '../../functions/_lib/prompts/coleta/tattoo/generate.js';
import { generatePromptColetaCadastro } from '../../functions/_lib/prompts/coleta/cadastro/generate.js';
import { generatePromptColetaProposta } from '../../functions/_lib/prompts/coleta/proposta/generate.js';

const MOCK_TENANT = {
  id: 'mock-tenant',
  nome_estudio: 'Hustle Ink',
  nome_agente: 'Lina',
  config_agente: { tom: 'casual', emoji_level: 'raro', usa_giria: true },
  gatilhos_handoff: ['rosto', 'mão', 'pescoço'],
};
const MOCK_CONVERSA = { telefone: '5511999999999' };
const MOCK_CTX = {};

const FORBIDDEN_PHRASES = [
  /vou passar pro tatuador/i,
  /vou levar pra ele passar/i,
  /pra eu passar pro/i,
];

function extractAgentTurns(promptText) {
  // Linhas começando com "AGENTE:" dentro de blocos de código de few-shots
  const lines = promptText.split('\n');
  const turns = [];
  let inBlock = false;
  for (const line of lines) {
    if (line.trim() === '```') { inBlock = !inBlock; continue; }
    if (inBlock && /^AGENTE:/.test(line.trim())) {
      turns.push(line.replace(/^AGENTE:\s*/, '').trim());
    }
  }
  return turns;
}

describe('prompts coleta — tom invariants em few-shots', () => {
  const generators = [
    ['tattoo', generatePromptColetaTattoo],
    ['cadastro', generatePromptColetaCadastro],
    ['proposta', generatePromptColetaProposta],
  ];

  for (const [fase, gen] of generators) {
    it(`fase ${fase}: nenhuma mensagem AGENTE contém frases proibidas`, () => {
      const prompt = gen(MOCK_TENANT, MOCK_CONVERSA, MOCK_CTX);
      const turns = extractAgentTurns(prompt);
      for (const turn of turns) {
        for (const pattern of FORBIDDEN_PHRASES) {
          assert.equal(
            pattern.test(turn),
            false,
            `Fase ${fase}: frase proibida em turn AGENTE: "${turn}"`
          );
        }
      }
    });

    it(`fase ${fase}: nenhuma mensagem AGENTE excede 200 chars (tom.js)`, () => {
      const prompt = gen(MOCK_TENANT, MOCK_CONVERSA, MOCK_CTX);
      const turns = extractAgentTurns(prompt);
      for (const turn of turns) {
        if (turn.startsWith('http')) continue; // URLs em link-pagamento OK
        if (turn.length > 200) {
          assert.fail(`Fase ${fase}: turn AGENTE excede 200 chars (${turn.length}): "${turn.slice(0, 100)}..."`);
        }
      }
    });

    it(`fase ${fase}: nenhuma mensagem AGENTE tem mais de 1 ponto de interrogação (heurística 1 pergunta/turno)`, () => {
      const prompt = gen(MOCK_TENANT, MOCK_CONVERSA, MOCK_CTX);
      const turns = extractAgentTurns(prompt);
      for (const turn of turns) {
        const questionCount = (turn.match(/\?/g) || []).length;
        if (questionCount > 1) {
          assert.fail(`Fase ${fase}: turn AGENTE com ${questionCount} perguntas: "${turn}"`);
        }
      }
    });
  }
});
```

**Cobertura:** 9 testes (3 fases × 3 invariants).

### 4.2 Re-snapshot dos 3 snapshots existentes

`tests/prompts/snapshot.test.mjs` valida texto exato. Após refator, regenerar via script existente:
```bash
./scripts/update-prompt-snapshots.sh
```
Que reescreve:
- `tests/prompts/snapshots/coleta-tattoo.txt`
- `tests/prompts/snapshots/coleta-cadastro.txt`
- `tests/prompts/snapshots/coleta-proposta.txt`

**Commit dedicado** (passo 10 da implementação) com diff visível pra revisão humana. Snapshot do Modo Exato (`exato.txt`) NÃO muda (não tocamos nele).

### 4.3 Tests existentes que NÃO devem quebrar

- 49 tests em `tests/_lib/`, `tests/tools/`, `tests/cron/` — todos backend, não tocam prompts. Devem continuar 100% verdes.
- Snapshot `exato.snap.txt` — não deve mudar (refator não toca Modo Exato).

---

## Smoke E2E (gatilho de aceitação)

Cenário canônico, mesmo pattern do PR #27:

### Setup
- Bot: `@inkflow_studio_bot` ativo
- Tenant: Dagobert (Hustle Ink), modo='coleta', WhatsApp + Telegram conectados
- Telefone teste: número pessoal do Leandro

### Cenário A — Coleta tattoo + cadastro feliz (10 mensagens)

1. **Cliente:** "oi, quero fazer uma rosa"
2. **Bot:** deve responder saudação + perguntar tamanho/local em **2 turnos** (não 1 com 2 perguntas)
3. **Cliente:** "uns 10cm no antebraço"
4. **Bot:** deve responder com **validação substantiva** sobre escolha + pedir cadastro em **texto corrido** (não bullet)
5. **Verificar via Supabase MCP:** `tool_calls_log` tem 3 entries `tool='dados_coletados'` (descricao_tattoo, tamanho_cm, local_corpo) timestampadas dentro de 5s da msg 3
6. **Verificar via Supabase MCP:** `conversas` tem row com `(tenant_id=Dagobert, telefone=Leandro)` e `dados_coletados.descricao_tattoo='rosa'` etc.
7. **Cliente:** "Maria Silva, 12/03/1995"
8. **Bot:** deve perguntar email **opcional** em UM turno (não pedir junto)
9. **Cliente:** "maria@gmail.com"
10. **Bot:** deve confirmar e dizer "vou enviar ao tatuador" em **1ª pessoa**, NUNCA "vou passar pro tatuador"
11. **Verificar:** `tool_calls_log` tem 4 entries `dados_coletados` adicionais (nome, data_nascimento, email) + 1 entry `enviar_orcamento_tatuador`
12. **Verificar:** `conversas.estado_agente='aguardando_tatuador'` + `conversas.orcid` populado
13. **Verificar Telegram:** chat tatuador recebeu mensagem de orçamento com botões [Fechar valor / Recusar]

### Cenário B — Cliente menor de idade

1. **Cliente:** "oi, quero uma rosa de 8cm no pulso"
2. (...coleta tattoo...)
3. **Cliente:** "Lucas Rocha, 03/07/2010"
4. **Bot:** deve responder despedida educada sobre menor de idade
5. **Verificar:** `tool_calls_log` tem entry `dados_coletados` retornando `gatilho='menor_idade'` + estado_agente='aguardando_tatuador'
6. **Verificar:** NÃO há entry `enviar_orcamento_tatuador` (T3 cadastro)
7. **Verificar Telegram:** tatuador recebeu mensagem de handoff (não orçamento)

### Cenário C — URL fix consultar_proposta

Pré-condição: cenário A executado, conversa em estado `aguardando_tatuador`. Tatuador responde no Telegram com valor R$ 750. Bot reentra.

1. **Cliente:** "e ai, ele ja respondeu?"
2. **Bot:** deve invocar `consultar_proposta_tatuador` (URL fix testado)
3. **Verificar:** `tool_calls_log` tem entry `consultar_proposta_tatuador` retornando 200 (não 404 como antes do fix)
4. **Bot:** responde com valor proposto

### Cleanup pós-smoke

```sql
DELETE FROM tool_calls_log WHERE tenant_id='<dagobert-id>' AND telefone='<leandro-tel>';
DELETE FROM conversas WHERE tenant_id='<dagobert-id>' AND telefone='<leandro-tel>';
DELETE FROM n8n_chat_histories WHERE session_id LIKE '<dagobert-id>_<leandro-tel>%';
```

(Apagar via Supabase MCP `execute_sql`. Telegram messages ficam — não afeta dados.)

---

## Critérios de aceitação (testáveis)

### Camada 1
- ✅ URL `consultar_proposta_tatuador` no n8n é exatamente `https://inkflowbrasil.com/api/tools/consultar-proposta-tatuador`
- ✅ 4 tool descriptions no n8n seguem template canônico (5 seções, ≤15 linhas estruturadas)
- ✅ Workflow publicado (activeVersionId mudou após `publish_workflow`)
- ✅ Export JSON do workflow pós-fix versionado em `docs/workflows/MEU NOVO WORK - SAAS - 2026-05-06.json`

### Camada 2
- ✅ `tattoo/regras.js` tem §4b com T1-T4
- ✅ `cadastro/regras.js` tem §4b com T1-T6
- ✅ `proposta/regras.js` tem §4b com T1-T5
- ✅ Cada T cita tool específica + gatilho + comportamento pós-resposta

### Camada 3
- ✅ Test `tests/prompts/no-pseudocode.test.mjs` passa (3 fases × 7 patterns = 21 assertivas)
- ✅ Test `tests/prompts/tom-invariants.test.mjs` passa (3 fases × 3 invariants = 9 testes)
- ✅ Snapshots `coleta-{tattoo,cadastro,proposta}.snap.txt` atualizados via commit dedicado revisável
- ✅ 49 tests existentes ainda 100% verdes (backend + helpers)

### Smoke E2E
- ✅ Cenário A 100% PASS (`tool_calls_log` confirma 3 dados_coletados + 1 enviar_orcamento; bot usa "vou enviar" em 1ª pessoa; Telegram tatuador recebeu)
- ✅ Cenário B 100% PASS (gatilho menor_idade; NÃO há enviar_orcamento; Telegram handoff)
- ✅ Cenário C 100% PASS (consultar_proposta_tatuador 200, não 404)
- ✅ ZERO instâncias de `[chama X]` ou pseudo-código no chat WhatsApp em qualquer cenário

---

## Implementation strategy

Ordem de commits (cada commit é isoladamente revisável + não-quebra-build):

1. `fix(n8n): corrigir URL corrompida em consultar_proposta_tatuador`
   - Editar `docs/workflows/MEU NOVO WORK - SAAS - 2026-05-06.json` (ou criar dir + arquivo)
   - Aplicar via UI/MCP no workflow ativo

2. `feat(n8n): canonicalizar 4 tool descriptions Coleta v2`
   - Reescrever 4 descriptions seguindo template
   - Aplicar via UI/MCP

3. `feat(prompts): adicionar §4b TOOLS QUANDO INVOCAR em tattoo/regras.js`
4. `feat(prompts): adicionar §4b TOOLS QUANDO INVOCAR em cadastro/regras.js`
5. `feat(prompts): adicionar §4b TOOLS QUANDO INVOCAR em proposta/regras.js`

6. `refactor(prompts): tattoo few-shots format A + tom B`
   - Reescrever 5 exemplos em `tattoo/few-shot.js`
   - Auditar `tattoo/few-shot-tenant.js`

7. `refactor(prompts): cadastro few-shots format A + tom B`
   - Reescrever 5 exemplos em `cadastro/few-shot.js`
   - Auditar `cadastro/few-shot-tenant.js`

8. `refactor(prompts): proposta few-shots format A + tom B`
   - Reescrever 6 exemplos em `proposta/few-shot.js`
   - Auditar `proposta/few-shot-tenant.js`

9. `test(prompts): invariants no-pseudocode + tom-checks`
   - Add `tests/prompts/no-pseudocode.test.mjs`
   - Add `tests/prompts/tom-invariants.test.mjs`
   - Roda bateria, confirma que TODOS as ~30 assertivas passam contra novo código

10. `test(prompts): re-snapshot 3 snapshots Coleta v2`
    - Rodar `./scripts/update-prompt-snapshots.sh`
    - Regenera `tests/prompts/snapshots/coleta-{tattoo,cadastro,proposta}.txt`
    - Diff humano-revisável no PR

11. (manual, fora do código) Smoke E2E real WhatsApp com 3 cenários

12. `chore: bump n8n workflow version doc` (se houver export atualizado)

**Branch:** `feat/refator-prompts-coleta-v2` (já criado)
**PR target:** `main`
**Estimativa:** ~3.5h código + ~30min smoke

---

## Riscos & mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| LLM ainda copia pseudo-código de outros lugares (ex: regras.js T-rules) | Baixa | Alto | Tests no-pseudocode rodam contra prompt **completo** (todos blocks + few-shots + regras). Detecta vazamento em qualquer seção. |
| Re-snapshot acidentalmente esconde regressão de tom | Médio | Médio | Snapshot é commit dedicado (passo 10), revisado humanamente no PR. Diff fica visível. |
| Smoke E2E falha por config Telegram (não regressão do refator) | Baixa | Médio | Cenário C só roda se Telegram do tatuador estiver setado. Se falhar, separar bug Telegram do refator (commit isolado). |
| URL fix em n8n introduz outro typo (humano editando UI) | Baixa | Crítico (bloqueia tool) | Curl test pós-publish: `curl -X POST 'https://inkflowbrasil.com/api/tools/consultar-proposta-tatuador' -H 'Authorization: Bearer ...' -d '{"tenant_id":"...","telefone":"..."}'` deve retornar 200/404 (não 502/timeout) |
| Tom B "validação substantiva" vira too-much-personality e gera frases artificiais | Médio | Baixo | Mock tenants em tests usam Lina/Hustle Ink — validar que validações são naturais. Se ficar artificial em tenant real (Dagobert), ajustar nos few-shots em iteração 2 (não bloqueia ship). |

---

## Métricas de sucesso (pós-merge)

Acompanhar nas próximas 7 dias após merge:

1. **`tool_calls_log` distribution:** % de entries não-`prompt` em conversas com pelo menos 3 mensagens cliente. Target inicial: >50% (vs ~5% atual). Após 7d se métrica estável, escalar target pra >70%. Smoke A bem sucedido em testes = 8 de 8 mensagens geram tool calls reais.
2. **Conversas em `coletando_*` que avançam pra `aguardando_tatuador`:** % completion. Target inicial: >40% das conversas iniciadas viram orçamento real (será baixo nos primeiros dias enquanto não há tenant pagante; meta evolui com cliente real).
3. **Pseudo-código no chat WhatsApp:** zero ocorrências (manual via histórico chat ou query `n8n_chat_histories WHERE message LIKE '%[chama%'`).
4. **Reclamações de cliente sobre tom robótico:** zero (manual via inbox tatuador).

---

## References

- Spec PR #27 (wire predecessor): `docs/superpowers/specs/2026-05-05-wire-tools-coleta-v2-bot-design.md`
- Spec Modo Coleta v2 principal: `docs/superpowers/specs/2026-05-02-modo-coleta-v2-principal.md`
- Anthropic Tool Use docs: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
- OpenAI Function Calling cookbook: https://platform.openai.com/docs/guides/function-calling
- Linha exata anti-pattern smoking gun: `functions/_lib/prompts/coleta/tattoo/few-shot.js:20-23`
- Workflow n8n: `MEU NOVO WORK - SAAS` (id `PmCMHTaTi07XGgWh`, activeVersionId `2e956405-c3df-4e47-b0fb-d72b75c9722d` pré-fix)
- Brainstorm prep: `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Brainstorm prep refator-prompts-coleta-v2.md`
- Painel: `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md`
