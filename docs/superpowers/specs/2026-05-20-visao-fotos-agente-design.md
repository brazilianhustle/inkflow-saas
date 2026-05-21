---
date: 2026-05-20
status: ready-to-plan
related:
  - functions/_lib/whatsapp-pipeline.js
  - functions/api/agent/route.js
  - functions/api/agent/agents/tattoo.js
  - functions/api/agent/agents/tattoo-schema.js
  - functions/_lib/agent-runtime/runtime.js
  - functions/_lib/prompts/coleta/tattoo/decisao.js
  - functions/_lib/foto-classifier.js
backlog_entry: "P1 — Foto do cliente nunca chega ao LLM (agente \"não vê\" a imagem), descoberto 2026-05-20 (smoke PR-B)"
---

# Visão de fotos no agente — bot enxerga referência E corpo

## Contexto

Smoke E2E manual (2026-05-20, tenant teste `db686ef2`) reconfirmou **2×** uma falha
embaraçosa: o cliente manda uma foto e o bot responde *"tu tem uma foto dessa tatuagem?"* —
pedindo a foto que já está na tela. O bot não interpreta nem comenta o conteúdo visual.

Causa raiz confirmada por leitura de código: **o modelo nunca recebe a imagem.**

- `whatsapp-pipeline.js:102` monta o `texto` do turno só de `message.content`. O array
  `fotos` (com `media_base64`) é extraído (`:103-110`) e usado **apenas** para (a)
  re-encaminhar pro Telegram pós-handoff e (b) classificação heurística na Etapa 4.5.
  **Nunca é passado ao `runAgent`.**
- `whatsapp-pipeline.js:191` chama `runAgent({ ..., mensagem: texto })` — só texto.
- `tattoo.js:55-58` monta o `input` do OpenAI com `content` = string de texto puro.
- O prompt **R4** (`decisao.js:83`) **mente**: afirma que "o workflow injeta descrição
  textual da foto no histórico" — nada no código faz isso.

O modelo já é `gpt-4o-mini` (`tattoo.js:63`), que **suporta visão**, e o `runtime.js` usa
`responses.parse()` (Responses API), que aceita `content` como array multimodal com
`input_image`. Dá pra resolver **sem trocar modelo e sem sair do SDK**.

## Objetivo e escopo

O bot passa a **ver todas as fotos** que o cliente manda e a entender o que são:

1. **Foto de referência (a arte desejada)** → bot comenta de verdade ("rosa fineline
   delicada, vai ficar ótima") em vez de re-pedir.
2. **Foto do local do corpo (onde vai tatuar)** → bot interpreta a pele:
   - **Cover-up (REQUISITO CRÍTICO):** se houver uma **tatuagem existente** no local
     pretendido e o cliente **NÃO** mencionou cobertura, o bot **pergunta sutilmente** pra
     confirmar antes de assumir qualquer coisa. Exemplo cravado pelo Leandro:
     > "Vi que tem uma tatuagem e uma marcação na foto que você me mandou — seria uma
     > cobertura nessa parte do braço marcada?"
   - **Marcação de brush/caneta** (anotação que o WhatsApp permite desenhar sobre a foto) =
     cliente indicando **posição/tamanho**, **não** é tatuagem existente. O bot diferencia.
3. **Diferenciação limpa ref vs corpo, baseada no contexto + na imagem.** O modelo (que agora
   **vê** a foto) decide se é referência ou corpo — muito mais confiável que heurística de
   palavra-chave. **Sempre que houver dúvida** (tipo da foto OU se é cobertura), o bot
   **pergunta sutilmente** em vez de assumir.

Além disso, a descrição da **arte de referência** é persistida como **memória do cliente**
(não enviada ao Telegram), pra um futuro recall de cliente recorrente.

**Princípio:** o modelo é a fonte de verdade da interpretação visual; o classificador
heurístico atual vira **fallback** pra quando a visão falhar. Nada pode travar o cliente.

## Decisões cravadas no brainstorm

1. **Visão em TODAS as fotos** (referência **e** corpo). *(Revisão consciente: a 1ª versão
   limitava às refs; ao ver o trade-off, o cover-up — que exige ver o corpo — foi cravado
   como requisito crítico.)*
2. **Classificação ref-vs-corpo passa a ser feita pelo modelo** (que vê a imagem), com o
   `foto-classifier.js` heurístico atual como **fallback** quando a visão falhar. Tipo
   `incerto` → o bot **pergunta**.
3. **Cover-up = perguntar antes de assumir.** Tatuagem existente no local + cliente não
   mencionou cobertura → bot pergunta sutilmente. Confirmado → segue a política
   `aceita_cobertura` do tenant (máquina de trigger/handoff já existente, R5). Marcação de
   brush ≠ tatuagem.
4. **Memória capturada agora, recall depois.** Esta feature gera + persiste a descrição da
   **arte de referência**; *recuperar e usar* ("quero aquela tattoo que te mandei") é a
   feature de cliente-recorrente (já P1 no backlog), que **vem na sequência** logo após esta.
5. **Descrição NÃO vai pro Telegram** (tatuador já recebe a foto real + resumo da conversa).
6. **Persistência: na própria mensagem-foto** (`conversa_mensagens.message.descricao_visual`),
   sem migration. Log append-only, sobrevive à zeragem do base64.
7. **Sem chamada de visão extra:** classificação + análise do corpo + descrição da arte saem
   **todas no mesmo JSON de output** do TattooAgent (o modelo já viu as imagens nesse turno).

## Estratégia de execução (1 plano, 2 fases)

Plano único, sequenciado por **dependência** (não por prioridade — o cover-up exige que o
modelo já enxergue o corpo, então a fundação vem primeiro):

- **Fase A — Fundação (já fecha o bug do smoke):** imagens chegam ao modelo (`imagens` na
  pipeline → route → `tattoo.js` content multimodal), bot vê/comenta a referência e **para de
  re-pedir**, classificação ref-vs-corpo pelo modelo com fallback heurístico, captura da
  memória (`descricao_visual`). **Landar o schema `analise_imagens` COMPLETO já aqui**
  (incluindo `corpo_tem_tattoo`/`corpo_tem_marcacao`), mesmo que o fluxo de cover-up só seja
  ativado na Fase B — evita re-tocar o schema depois.
- **Fase B — Cover-up (requisito crítico):** R4 reescrito pro fluxo de tattoo/marcação +
  perguntar-antes-de-assumir + "na dúvida, pergunta", trigger `aceita_cobertura`, eval com
  fixtures de corpo-com-tattoo / marcação-de-brush / ambíguo.

**Checkpoint entre A e B:** ao fim da Fase A, decisão consciente — shippar a Fase A como PR
próprio (UX fix em produção mais cedo) e seguir, OU emendar tudo num PR só. Decidir no
checkpoint, não antes.

## Fluxo técnico

### Caminho das imagens até o modelo

1. **Pipeline (`whatsapp-pipeline.js`)** — passa **todas** as fotos do lote (base64 +
   mimetype + `msgRowId`), **em ordem**, num campo novo do payload do `runAgent`:
   `imagens: [{ base64, mimetype, msgRowId }]`. Cap de ~4 imagens/turno pro modelo.
2. **Router (`route.js` → `runAgent`)** — repassa `imagens` adiante pro `runTattooAgent` (sem
   tocar nos outros agents).
3. **Agent (`tattoo.js`)** — monta o `content` **do turno atual** como array multimodal:
   ```
   content: [
     { type: 'input_text', text: mensagem },
     ...imagens.map(img => ({
       type: 'input_image',
       image_url: `data:${img.mimetype};base64,${img.base64}`,
       detail: 'low',
     })),
   ]
   ```
   - **Só no turno em que as fotos chegam.** Turnos seguintes não re-enviam imagem (histórico
     carrega o comentário do bot + a descrição persistida). Controla custo.
   - Histórico segue texto-only (`normalizeHistoryItem` inalterado).
4. **Runtime (`runtime.js`)** — `responses.parse()` aceita `content` array nativamente.
   Estrutura do schema (discriminated union + envelope `z.object({ output })`) inalterada,
   com os campos novos abaixo.

### Campos novos no schema de output (`tattoo-schema.js`)

`analise_imagens` — array com **uma entrada por imagem, na ordem recebida** (correlação por
índice → `imagens[i]` → `msgRowId`):

```
analise_imagens: [
  {
    tipo: 'referencia' | 'corpo' | 'incerto',
    descricao: string,              // o que o modelo vê (curto)
    corpo_tem_tattoo: boolean,      // só relevante se tipo='corpo'
    corpo_tem_marcacao: boolean,    // brush/caneta = posição/tamanho
  }
]
```
- `null`/vazio quando não houve imagem no turno.
- Strict mode: todos os campos no `required` com tipo nullable — seguir o padrão dos
  opcionais já existentes no schema (validar no `toResponseFormat`).

**Cover-up via máquina existente:** quando alguma entrada `corpo` tem `corpo_tem_tattoo=true`
e o cliente não mencionou cobertura, o modelo (guiado pelo R4 reescrito) emite
`proxima_acao='pergunta'` com a pergunta sutil em `resposta_cliente`. Confirmação positiva no
turno seguinte → trigger cover-up R5 (política `aceita_cobertura`). Campo opcional
`cobertura_suspeita: boolean` no output pra telemetria/observabilidade.

### Classificação e roteamento (Etapa 4.5)

A Etapa 4.5 (que hoje classifica + aplica "máx 1 `local`/lote" + acumula
`refs_imagens_msg_ids`) passa a **consumir `analise_imagens`** do output:

- `tipo='referencia'` → ref · `tipo='corpo'` → foto_local · `tipo='incerto'` → o bot
  perguntou; rotear como ref por padrão (nunca dropar) até esclarecer.
- **Fallback:** se `analise_imagens` ausente (visão falhou), usa o `foto-classifier.js`
  heurístico atual — comportamento de hoje preservado.
- Preserva a regra "1 `local`/lote vence, resto vira ref".

### Persistência da memória (descrição da arte)

Quando uma entrada `referencia` tem `descricao` não-vazia, a pipeline grava na linha da
mensagem-foto correspondente em `conversa_mensagens`:

- `message.descricao_visual` ← `descricao`, via `jsonb_set` targeted (preserva as demais
  chaves do `message`). Linkagem por `msgRowId`.
- Em lote multi-ref, cada linha `referencia` recebe a sua descrição (correlação por índice).
- Fotos `corpo` **não** geram memória de recall (recall é sobre a arte desejada); a análise
  do corpo é usada **ao vivo** (cover-up) e flui pela máquina de trigger existente.

**Verificado:** o RPC `zerar_media_base64`
(`migrations/2026-05-19-add-zerar-media-base64-rpc.sql`) usa
`jsonb_set(message, '{media_base64}', '""')` — atualização targeted que **preserva**
`descricao_visual`. Usando `jsonb_set` igualmente targeted na gravação, os dois campos
coexistem sem race read-modify-write.

> Recall (futuro, próxima feature): consulta `conversa_mensagens` por `session_id`
> (= `${tenant_id}_${telefone}`, estável por cliente) filtrando linhas com
> `message.descricao_visual`, cruzando com o `file_id` durável por `msgRowId`. Fora do escopo
> desta feature.

## Custo e performance

- `detail: 'low'` (~512px, ~85 tokens/imagem) — suficiente pra estilo/tema/pele. Tunável.
- Imagens enviadas **só no turno de chegada**, nunca re-enviadas.
- Cap de ~4 imagens/turno pro modelo.
- Todas as fotos do turno entram na visão agora (não só refs) — custo um pouco maior que a 1ª
  versão, ainda no nível barato; aceito pelo Leandro.

## Erros e fallback

A visão **nunca pode travar o cliente**. Se a chamada falhar (base64 inválido, timeout, 4xx
de conteúdo de imagem): log/alerta admin + **degrada** → classificação pelo
`foto-classifier.js` heurístico + resposta texto-only naquele turno (sem cover-up por imagem
nesse turno). O `runWithRetry` do runtime já cobre 5xx/rede/429. A pipeline segue marcando o
lote `processed` normalmente.

## Coerência de prompt (R4 + §4.2/§4.4)

Reescrever **R4** (`decisao.js:83-87`), hoje baseado em injeção textual inexistente. Novo R4:

- "Você **recebe as imagens diretamente** neste turno. **Diferencie**: foto de **referência**
  (a arte que o cliente quer) vs foto do **local do corpo** (onde vai tatuar). Use o contexto
  da conversa + a própria imagem."
- "Na foto do **corpo**: se houver **tatuagem existente** no local pretendido e o cliente
  **não** mencionou cobertura, **pergunte sutilmente** se é cobertura antes de assumir
  (ex.: a frase cravada). **Marcação de caneta/brush** = cliente indicando posição/tamanho,
  **não** é tatuagem existente."
- "**Na dúvida** sobre o tipo da foto OU sobre cobertura, **pergunte sutilmente** —
  `proxima_acao='pergunta'`. Nunca assuma."
- Ajustar §4.2 (OPCIONAIS) e §4.4 (pedido de foto do local) pra refletir que o modelo agora
  enxerga a foto e pode confirmar o local pela imagem.
- Manter R8 (nunca sugerir tamanho) e o manifesto.

## Testes (TDD)

**Unit:**
- `tattoo.js` monta `content` multimodal com `imagens`; texto-only sem imagens.
- `route.js` repassa `imagens` ao TattooAgent e não injeta nos outros agents.
- Pipeline passa todas as fotos do lote (com cap) pro `imagens`.
- Etapa 4.5 roteia por `analise_imagens` (ref/corpo/incerto) e cai no heurístico quando
  ausente (fallback); regra "1 local/lote" preservada.
- Persistência: `referencia` com `descricao` → grava `message.descricao_visual` na linha
  certa por `msgRowId`, preservando as demais chaves.
- Fallback: erro de visão → heurístico + texto-only, lote segue `processed`.

**Eval (precisa de fixtures de imagem no harness — hoje só texto):**
- Referência → bot comenta + não re-pede.
- Corpo com pele limpa → bot segue coleta normal.
- Corpo com **tatuagem existente** + cliente não mencionou cobertura → bot **pergunta**
  sutilmente sobre cobertura.
- Corpo com **marcação de brush** (sem tattoo) → bot trata como posição/tamanho, **não**
  pergunta sobre cobertura.
- Foto ambígua → bot pergunta sutilmente o que é.

**Smoke E2E (manual, pós-deploy):** conversa real → manda referência, depois foto do braço
limpo, depois foto do braço com tattoo → conferir comentário, coleta normal, e a pergunta de
cobertura; conferir `message.descricao_visual` gravado nas refs.

## Fora de escopo

- **Recall de cliente recorrente** ("quero aquela tattoo que te mandei") — próxima feature
  (P1 backlog), logo após esta. Esta só **captura** a memória.
- **Enviar descrição ao Telegram** — descartado.

## Arquivos afetados (estimativa)

- `functions/_lib/whatsapp-pipeline.js` — passa `imagens`; Etapa 4.5 consome `analise_imagens`
  com fallback; grava `descricao_visual`.
- `functions/api/agent/route.js` — repassa `imagens` ao TattooAgent.
- `functions/api/agent/agents/tattoo.js` — content multimodal + fallback.
- `functions/api/agent/agents/tattoo-schema.js` — `analise_imagens` + `cobertura_suspeita`.
- `functions/_lib/prompts/coleta/tattoo/decisao.js` — reescreve R4 + ajusta §4.2/§4.4.
- `functions/_lib/foto-classifier.js` — mantido como fallback (sem mudança funcional).
- `tests/` — unit novos + cenários de eval com fixtures de imagem.

**Estimativa:** ~8-12h (feature maior que a 1ª versão: classificação por modelo + fluxo de
cover-up + schema + prompt + fallback + fixtures de imagem no eval). Sem migration. Pode
passar de 1 sessão — o `/plan` quebra em tasks; cover-up é a prioridade dentro da feature.
