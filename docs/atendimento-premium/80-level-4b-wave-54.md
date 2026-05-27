# Wave 54 - Estilos de foco nao podem bloquear coleta

Data: 2026-05-27
Nivel: 4B

## Incidente

Smoke manual WhatsApp real mostrou falha na resposta ao estilo:

- cliente informou `realismo`;
- bot respondeu `Esse estilo nao esta no foco do estudio por aqui...`;
- a coleta foi bloqueada antes do tatuador avaliar.

Isso e errado para o fluxo premium quando o estilo sera avaliado pelo tatuador/painel. O bot deve coletar o estilo declarado pelo cliente e enviar no briefing. A decisao comercial/artistica final fica com o tatuador.

## Causa raiz

A Wave 46 tratou `config_agente.estilos_aceitos` como catalogo rigido. Na pratica, esse campo representa foco/preferencia do estudio, nao uma lista exaustiva de permissao.

## Decisao

Novo contrato:

- `estilos_aceitos`: foco/preferencia, nao bloqueia por padrao;
- `estilos_recusados`: bloqueio explicito;
- `bloqueia_estilos_fora_catalogo=true`: modo opcional para estudios realmente restritivos;
- se cliente responde um estilo fora do foco, o bot persiste o estilo e segue a coleta.

## Validacao local

- `node --test tests/_lib/conversation-router.test.mjs` PASS 75/75
- `node --test tests/_lib/conversation-router.test.mjs tests/_lib/whatsapp-pipeline.test.mjs` PASS 151/151
- `node --test tests/agent/_lib/tenant-context-manager.test.mjs` PASS 9/9
- `npm test` PASS 1257/1257

## Provas locais

Cliente: `realismo`

Contexto: pergunta pendente de estilo; tenant com `estilos_aceitos=["fineline","blackwork"]`; sem flag rigida.

Contrato esperado: Router persiste `estilo=realismo`, pede o proximo campo pendente e nao envia `nao esta no foco do estudio`.

## Gate real

Depois de deploy:

1. limpar telefone de teste;
2. iniciar conversa do zero;
3. seguir fluxo ate pergunta de estilo;
4. responder `realismo`;
5. PASS somente se o bot nao bloquear por foco do estudio e seguir a coleta normalmente.
