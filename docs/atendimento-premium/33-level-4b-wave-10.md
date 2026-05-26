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
status: PASS
micro_slice_1: telegram-media-package-audit-contract fechado
autonomy_level: 4B
max_batch_size: 8
promocao_4c: bloqueada
```

## Fechamento

```text
status: PASS
commits:
  - 4aa7c5a test: audit telegram media handoff package
  - b434ead test: use real media seed for telegram smoke
  - e5803b6 test: make media seed base64 portable
  - 116e69a test: wait for smoke side effects
  - 648e2e6 test: accept escaped telegram media tail logs
tests_focados: bash -n scripts/smoke/run-scenario.sh; node --test tests/tools/enviar-orcamento-tatuador.test.mjs tests/integration/orcamento-com-fotos.test.mjs tests/_lib/whatsapp-pipeline.test.mjs PASS 98/98
tests_local: npm test PASS 1194/1194 antes dos ajustes finais de runner/scenario
ci: PASS
deploy: PASS
http_radar: scenario-cadastro-after-media-telegram-media-package-20260526T081935Z-25180 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-after-media-telegram-media-package-20260526T082042Z-12788 PASS
```

## Evidencia Funcional

```text
estado: aguardando_tatuador
orcid_http: orc_minj4l
orcid_real: orc_rttylv
email: joao@example.com
foto_local_file_id: persistido
refs_imagens_file_ids: 1 item persistido
tail: fotos-orcamento-enviadas com enviadas=2 e falhas_total=false
copy_risk: baixo
router: pending_email_answered
workflow: cadastro_and_tattoo_complete, handoff_package_v1, trace hp_*
```

## Provas Conclusivas Reais

```text
Cliente: "joao@example.com"
Bot: "Fechado, Joao! O tatuador vai avaliar com calma e eu te retorno em breve com o valor certinho."
```

## Aprendizados De Processo

- Seed com PNG 1x1 nao e confiavel para Telegram: usar midia real versionada no repo.
- Side-effects de Telegram podem terminar segundos depois do estado virar `aguardando_tatuador`: `run-scenario.sh` agora aguarda tail/poll de side-effects antes dos gates.
- Logs do Cloudflare podem renderizar JSON escapado: regex de tail deve validar o evento sem depender de aspas literais.
- Level 4B permanece correto; 4C segue bloqueado.
