# Wave 52 - Foto do local com legenda deitica

Data: 2026-05-27
Nivel: 4B

## Incidente

Smoke manual WhatsApp real mostrou regressao no tratamento de foto:

- cliente enviou `Nessa parte` com imagem;
- a imagem chegou ao banco com `image/jpeg` e base64;
- o bot respondeu `Em qual parte do corpo tu quer fazer?`;
- estado final salvou a imagem em `refs_imagens_msg_ids`, nao em `foto_local_msg_id`.

Evidencia real:

- mensagem humana `13512`: `content="Nessa parte"`, `media_mimetype=image/jpeg`, `media_base64_len=46844`;
- `agent_turn_logs`: turno caiu no agente `tattoo`, levou ~87s e retornou `analise_imagens=null`;
- `dados_coletados`: `{ descricao_curta: "leao", refs_imagens_msg_ids: [13512] }`.

## Causa raiz

O pipeline dependia do LLM para interpretar foto com legenda deitica. Quando o LLM demorou/falhou e retornou sem `analise_imagens`, o fallback heuristico nao reconhecia `Nessa parte` como local do corpo e classificava como referencia.

## Decisao

Adicionar classificacao estrutural de intencao de foto:

- captions como `nessa parte`, `esse local`, `aqui`, `minha pele`, `meu corpo` indicam foto do local;
- quando ainda nao ha foto local, esse caminho nao chama LLM;
- o bot registra a foto como `foto_local_msg_id`;
- se ainda falta `local_corpo`, o bot pergunta a regiao sem alucinar.

## Validacao local

- `node --test tests/_lib/whatsapp-pipeline.test.mjs` PASS 75/75
- `node --test tests/_lib/conversation-router.test.mjs` PASS 74/74
- `node --test tests/integration/pipeline-classifier.test.mjs` PASS 11/11
- `npm test` PASS 1254/1254

## Provas locais

Cliente: `Nessa parte` + foto

Bot esperado local: `Recebi a foto do local. Só pra eu registrar certinho: qual parte do corpo é essa?`

Persistencia esperada: `foto_local_msg_id=<id da foto>`, sem `refs_imagens_msg_ids`, sem `local_corpo` inventado, `runAgent=0`.

## Gate real

Depois de deploy:

1. limpar telefone de teste;
2. iniciar conversa do zero;
3. enviar ideia;
4. enviar foto com `Nessa parte`;
5. PASS somente se WhatsApp real registrar a foto como local e a resposta nao fingir saber a regiao do corpo.
