# Wave 53 - Foto sem caption deve ser analisada pela visao

Data: 2026-05-27
Nivel: 4B

## Incidente

Smoke manual WhatsApp real mostrou regressao na leitura de imagem:

- cliente informou `quero fazer um leao no braco`;
- cliente informou altura;
- cliente enviou foto clara de um braco vazio;
- em seguida mandou `nessa parte aqui`;
- bot respondeu como se toda foto sem caption fosse ambigua: `referencia ou local?`.

Isso e errado para bot premium. Se a imagem mostra pele vazia, ela deve ser tratada como foto do local. A pergunta de ambiguidade so cabe quando ha tattoo existente na pele ou quando a visao realmente nao consegue decidir.

## Causa raiz

O pipeline tinha um bypass antes do LLM:

- foto unica sem legenda;
- estado `tattoo`;
- sem `fotoLocalPendente`;
- resposta imediata de ambiguidade.

Esse caminho impedia a visao de analisar a imagem real. No caso do braco vazio, o bot perguntou por duvida operacional sem olhar o conteudo visual.

## Decisao

Remover o bypass pre-LLM para foto sem legenda.

Novo contrato:

- foto sem caption passa pela visao;
- `analise_imagens.tipo=corpo` + `corpo_tem_tattoo=false` vira foto local;
- qualquer `corpo_tem_tattoo=true` vira pergunta de cobertura/referencia;
- prompt R4 reforca que pele vazia e local e pele tatuada exige esclarecimento.

## Validacao local

- `node --test tests/_lib/whatsapp-pipeline.test.mjs` PASS 75/75
- `node --test tests/agent/route-runagent.test.mjs` PASS 29/29
- `node --test tests/prompts/contracts/coleta-tattoo.mjs` PASS 1/1
- `node --test tests/integration/pipeline-classifier.test.mjs` PASS 11/11
- `npm test` PASS 1255/1255

## Provas locais

Cliente: foto de braco vazio sem caption

Contrato esperado: visao recebe 1 imagem, `analise_imagens` marca corpo sem tattoo, `foto_local_msg_id` e salvo, e o bot nao pergunta `referencia ou local`.

Cliente: foto com tattoo existente

Contrato esperado: `corpo_tem_tattoo=true` forca pergunta de cobertura/referencia antes de salvar como foto local definitiva.

## Gate real

Depois de deploy:

1. limpar telefone de teste;
2. iniciar conversa do zero;
3. enviar `opa`;
4. enviar `quero fazer um leao no braco`;
5. enviar altura;
6. enviar foto de braco vazio;
7. enviar `nessa parte aqui`;
8. PASS somente se WhatsApp real nao perguntar `referencia ou local` para pele vazia e salvar a foto como local.
