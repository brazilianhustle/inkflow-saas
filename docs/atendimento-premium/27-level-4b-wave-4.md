# Level 4B Wave 4

Quarta onda em Level 4B. A Wave 2 validou multi-info textual e a Wave 3 validou recuperacao de campos pendentes com duvida lateral. Esta onda valida foto/midia dentro da coleta de tattoo.

## Declaracao

```text
onda_id: level4b-wave-4-tattoo-media-intake
objetivo: validar que fotos enviadas pelo cliente sao roteadas como foto do local ou referencia sem quebrar coleta, estado ou handoff
familia: coleta-tattoo, media-intake, pipeline-classifier, workflow-manager, observabilidade
risco: amarelo
janela: Level 4B, ate 8 micro-slices
4c: bloqueado
```

## Escopo

Dentro do escopo:

- cliente envia foto quando o bot ja pediu foto do local;
- legenda textual ajuda a classificar a imagem como foto do local;
- o pipeline persiste `foto_local_msg_id`;
- o bot nao pede a mesma foto de novo;
- o bot nao trata foto do local como referencia de desenho;
- HTTP radar antes de WhatsApp real definitivo;
- provas conclusivas reais no fechamento de cada comportamento conversacional.

Fora do escopo:

- preco, desconto, sinal, pagamento ou agenda;
- leitura visual ampla sem contrato fechado;
- tenant real amplo;
- migrations;
- secrets;
- promocao para 4C.

## Micro-Slices Planejados

1. `tattoo-media-wave-contract`: declarar contrato, setup e cenarios.
2. `tattoo-media-local-photo-http`: foto do local via HTTP com midia e legenda.
3. `tattoo-media-local-photo-whatsapp-real`: validar a mesma foto pela cadeia real `central -> bot`.
4. `tattoo-media-reference-after-local-http`: foto posterior vira referencia quando foto local ja existe.
5. `tattoo-media-reference-after-local-whatsapp-real`: validar referencia posterior por WhatsApp real.
6. `tattoo-media-ambiguous-photo-clarification-http`: foto ambigua pede classificacao sem perder dados.
7. `tattoo-media-ambiguous-photo-clarification-whatsapp-real`: validar ambiguidade por WhatsApp real.
8. `level4b-wave-4-closeout`: gates finais e recomendacao manter/expandir/rebaixar.

## Criterios De Pronto

- `check-autonomy-gate.sh` PASS em Level 4B;
- `wave-health.sh` PASS antes e depois;
- testes locais relevantes PASS quando houver mudanca funcional;
- CI PASS quando houver commit;
- deploy PASS quando houver commit;
- HTTP radar PASS antes de WhatsApp real;
- WhatsApp real definitivo PASS para cada comportamento conversacional;
- `copy_risk` nunca `alto`;
- estado final e dados persistidos corretos;
- `foto_local_msg_id` ou `refs_imagens_msg_ids` coerente com o contrato;
- worktree limpo ao fechar;
- 4C continua bloqueado.

## Stop Conditions

Parar a onda se ocorrer:

- CI FAIL;
- deploy FAIL;
- HTTP radar FAIL;
- WhatsApp real FAIL;
- `copy_risk=alto`;
- foto local virar referencia indevidamente;
- referencia virar foto local indevidamente;
- bot pedir a mesma foto de novo apos recebe-la;
- criar `orcid` ou handoff indevido;
- tocar preco, sinal, pagamento, agenda, secrets ou migrations;
- divergencia entre HTTP e WhatsApp real.

## Primeiro Fluxo Alvo

```text
setup: seed_tattoo_aguardando_foto_local
cliente: envia imagem com legenda "segue foto do local"
estado_final: coletando_cadastro ou coletando_tattoo, sem orcid
dados_esperados:
  descricao_curta: rosa
  estilo: fineline
  local_corpo: antebraco
  altura_cm: 170
  tentativas_foto_local: 1
  foto_local_msg_id: presente
  refs_imagens_msg_ids: ausente
bot: nao pede foto do local de novo; deve seguir para cadastro ou proxima pergunta segura
```

Provas esperadas:

```text
Cliente: "segue foto do local" + imagem
Bot: resposta reconhece/segue sem pedir novamente a foto do local
```

## Resultado Atual

```text
status: declarada
micro_slice_1: tattoo-media-wave-contract em andamento
autonomy_level: 4B
max_batch_size: 8
promocao_4c: bloqueada
```
