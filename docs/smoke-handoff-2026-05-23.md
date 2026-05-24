# Smoke handoff - WhatsApp coleta tattoo

Data: 2026-05-23, ~03:31-03:45 America/Sao_Paulo.

Telefone de teste: `5521970789797`
Tenant teste: `db686ef2-ca42-43e4-a831-808984d8d6c6`
Deployment observado no tail: `967d4e4c-8a4f-4ebc-899e-0dd4a54b00fc`
ORCID gerado: `orc_yvh9vw`

## Resultado resumido

O fluxo chegou ate `propondo_valor` e disparou reentrada do Telegram com valor `R$ 400`, mas o smoke revelou tres pendencias criticas:

1. Imagem com legenda nao foi reconhecida como referencia.
2. Resposta curta de estilo (`realismo`) causou loop/repeticao.
3. Imagem do local foi interpretada sem cruzar com o texto anterior: usuario disse `braco`, mandou foto de `perna`, e o bot validou roboticamente `no braco`.

## Evidencia do tail

Eventos relevantes vistos no tail de producao:

```text
POST /api/whatsapp/inbound - Ok @ 03:34:51
POST /api/whatsapp/process-batch - Ok @ 03:35:00
POST /api/whatsapp/inbound - Ok @ 03:35:37
POST /api/whatsapp/process-batch - Ok @ 03:35:46
POST /api/whatsapp/inbound - Ok @ 03:36:19
POST /api/whatsapp/process-batch - Ok @ 03:36:28
POST /api/whatsapp/inbound - Ok @ 03:37:09
POST /api/whatsapp/process-batch - Ok @ 03:37:18
POST /api/whatsapp/inbound - Ok @ 03:37:57
POST /api/whatsapp/inbound - Ok @ 03:38:00
POST /api/whatsapp/process-batch - Ok @ 03:38:08
POST /api/whatsapp/inbound - Ok @ 03:40:26
POST /api/whatsapp/process-batch - Ok @ 03:40:36
POST /api/tools/enviar-orcamento-tatuador - Ok @ 03:43:36
log: {"evento":"fotos-orcamento-enviadas","orcid":"orc_yvh9vw","tenant_id":"db686ef2-ca42-43e4-a831-808984d8d6c6","telefone":"5521970789797","tentadas":2,"enviadas":2,"falhas":0,"falhas_total":false}
POST /api/telegram/reentrada - Ok @ 03:43:53
```

## Snapshot do fluxo

Estado final do smoke:

```text
estado_agente : propondo_valor
valor_proposto: 400.00
orcid         : orc_yvh9vw
data_nasc     : 2002-04-02
nome          : Joao Creiton
dados_cadastro: {"nome":"Joao Creiton","email":null,"data_nascimento":"2002-04-02"}
```

Trecho importante da conversa:

```text
[human] um anjo no braco
[human] quanto fica
[ai] Sobre valor o tatuador confirma quando avaliar tua ideia. Qual a tua altura?
[human] essa daqui
[human] tenho 1.81
[ai] Tu tem alguma foto de referencia desse desenho que tu quer? Ajuda muito o tatuador entender a ideia.
[ai] Fechou, 181cm

Me diz o estilo que tu prefere?
[human] realismo
[ai] Fechou, 181cm. E de estilo, tu curte mais fineline, realismo, blackwork ou tradicional?
[human] realismo
[ai] Fechou, 181cm. E de estilo, tu curte mais fineline, realismo, blackwork ou tradicional?
[human] realismo
[ai] realismo
[human] estilo realismo
[ai] Fechou, 181cm. Agora me manda uma foto do local onde voce quer fazer a tattoo? E importante pro tatuador ter nocao do espaco.
[human] <foto do local: perna>
[ai] Vi que ja tem tattoo nesse local. Seria pra cobertura?
[human] do outro lado, pele limpa
[human] sem tatuagem
[ai] Massa, obrigada pela confirmacao! E consegue mandar uma foto do local? O tatuador precisa ter uma nocao melhor do espaco.
[human] <foto do local: perna>
[ai] Anjo em realismo no braco vai ficar incrivel, um bom espaco pra detalhes!

Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve
[human] joao creiton, 02/04/2002, sem email
[ai] Fechado, Joao! Vou mandar pro tatuador avaliar e te retorno em breve com o valor.
[ai] Fala Joao, tudo bem? O nosso tatuador acabou de me passar o seu orcamento

Um anjo no braco ficaria por R$ 400, bora agendar?
```

## Pendencias para corrigir

### P0 - imagem com legenda

Sintoma: a primeira imagem com legenda `essa daqui` foi gravada no snapshot como texto e nao entrou como foto de referencia. Depois o bot pediu referencia novamente.

Arquivos provaveis:

- `functions/_lib/evolution-parser.js`
- `functions/_lib/whatsapp-pipeline.js`
- `tests/_lib/evolution-parser.test.mjs`

Hipotese: parser so cobre `message.imageMessage` top-level e pode estar perdendo payloads nested da Evolution, como `viewOnceMessage`, `viewOnceMessageV2`, `ephemeralMessage`, `documentWithCaptionMessage`, ou `base64` dentro de `data.message`.

Validacao esperada:

- imagem + caption deve virar mensagem humana com `content` da legenda e `media_base64/media_mimetype` preservados.
- pipeline deve passar a imagem para visao mesmo quando ha legenda.

### P0 - loop no estilo

Sintoma: `realismo` sozinho nao atualizou corretamente o estado/dados; o bot repetiu pergunta de estilo e chegou a ecoar apenas `realismo`.

Arquivos provaveis:

- `functions/_lib/prompts/coleta/tattoo/decisao.js`
- `functions/_lib/prompts/coleta/tattoo/fluxo.js` se existir/for usado
- `functions/api/agent/route.js`
- testes de contrato/snapshot de `coleta-tattoo`

Comportamento esperado:

- se a pergunta atual e estilo, uma resposta curta como `realismo`, `fineline`, `blackwork` deve preencher `dados_coletados.estilo` e avancar.
- nunca responder apenas ecoando o texto do usuario.
- nao repetir pergunta ja respondida, salvo se houver ambiguidade real.

### P1 - consistencia texto x imagem

Sintoma: usuario disse `braco` de proposito, mas mandou foto de uma perna. O bot ignorou a inconsistencia e validou `Anjo em realismo no braco...`.

Comportamento esperado:

- quando a imagem sugerir local diferente do texto salvo, perguntar confirmacao antes de seguir:
  `Pela foto parece perna, mas tu tinha falado braco. Qual local fica valendo?`

Arquivos provaveis:

- prompt/contrato de visao na coleta tattoo
- merge de `descricao_visual` com `dados_coletados.local_corpo`
- `functions/_lib/whatsapp-pipeline.js`

### P1 - imagem do local pedida novamente

Sintoma: apos receber foto do local e responder sobre cobertura, usuario esclareceu `do outro lado, pele limpa` / `sem tatuagem`; o bot pediu foto do local de novo.

Comportamento esperado:

- esclarecimento textual deve resolver a duvida de cobertura ou gerar uma pergunta objetiva, sem pedir novamente a mesma foto se ja existe foto recente.

## Mudanca local ainda nao deployada

Foi alterado localmente o CTA da reentrada em `functions/api/telegram/reentrada.js`:

```text
Um anjo no braco ficaria por R$ 400! O que me diz, vamos agendar?
```

Teste focado ja passou:

```text
node --test tests/tools/reentrada-helpers.test.mjs
pass 14/14
```

Producao ainda respondeu com a frase antiga durante o smoke:

```text
Um anjo no braco ficaria por R$ 400, bora agendar?
```

Acao pendente: fazer deploy depois de concluir as correcoes ou, se quiser so esse ajuste, deployar a alteracao atual de reentrada.

## Comandos uteis para a proxima sessao

```bash
bash scripts/smoke-verify.sh 5521970789797 60
node --test tests/tools/reentrada-helpers.test.mjs
node --test tests/_lib/evolution-parser.test.mjs
npx wrangler pages deployment tail --project-name inkflow-saas --environment production
```

