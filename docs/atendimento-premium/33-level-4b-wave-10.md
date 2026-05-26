# Level 4B Wave 10

Decima onda em Level 4B. As Waves 8 e 9 provaram que o handoff pos-midia preserva IDs de midia no estado. Esta onda audita o pacote Telegram: midias frescas devem ser anexadas ao orcamento, gerar `file_id` e deixar log operacional `fotos-orcamento-enviadas`.

## Declaracao

```text
onda_id: level4b-wave-10-telegram-media-package-audit
objetivo: provar que o handoff de orcamento pos-midia envia fotos ao Telegram e persiste file_ids
familia: handoff-package, media-intake, telegram, workflow-manager, observabilidade
risco: amarelo
janela: Level 4B, ate 8 micro-slices
4c: bloqueado
```

## Escopo

Dentro do escopo:

- seed controlado com `media_base64` fresco para foto local e referencia;
- conversa em `coletando_cadastro` aguardando email;
- cliente informa email valido;
- estado final vira `aguardando_tatuador`;
- `orcid` deve ser criado;
- `foto_local_file_id` deve ser persistido;
- `refs_imagens_file_ids` deve conter pelo menos uma referencia;
- tail deve registrar `fotos-orcamento-enviadas` com fotos enviadas;
- Workflow Manager deve registrar handoff package v1.

Fora do escopo:

- mudar formato visual do Telegram;
- testar todos os mimetypes;
- agenda, sinal, pagamento ou remarcacao;
- migrations;
- secrets;
- promocao para 4C.

## Criterios De Pronto

- teste local relevante PASS;
- CI/deploy PASS quando houver commit;
- HTTP radar PASS;
- WhatsApp real definitivo PASS;
- `copy_risk` nunca `alto`;
- `estado_agente=aguardando_tatuador`;
- `orcid` criado;
- `foto_local_file_id` persistido;
- `refs_imagens_file_ids` persistido;
- tail confirma evento `fotos-orcamento-enviadas`;
- tail nao contem `falhas_total:true`, `mediaGroup falhou`, `telegram-4xx/5xx` ou `pipeline batch failed`;
- 4C continua bloqueado.

## Resultado Atual

```text
status: wave declarada
micro_slice_1: telegram-media-package-audit-contract em andamento
autonomy_level: 4B
max_batch_size: 8
promocao_4c: bloqueada
```
