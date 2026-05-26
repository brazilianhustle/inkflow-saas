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
estado_final: coletando_cadastro, sem orcid
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
status: wave fechada
micro_slice_1: tattoo-media-wave-contract PASS
micro_slice_2: tattoo-media-local-photo-http PASS
micro_slice_3: tattoo-media-local-photo-whatsapp-real PASS
micro_slice_4: tattoo-media-reference-after-local-http PASS
micro_slice_5: tattoo-media-reference-after-local-whatsapp-real PASS
micro_slice_6: tattoo-media-ambiguous-photo-clarification-http PASS
micro_slice_7: tattoo-media-ambiguous-photo-clarification-whatsapp-real PASS
micro_slice_8: level4b-wave-4-closeout PASS
autonomy_level: 4B
max_batch_size: 8
promocao_4c: bloqueada
```

## Evidencias - Foto Local Aguardada

```text
commit_fix: 2984a15 fix: bypass llm for awaited local photo
tests_local: npm test PASS, 1185/1185
ci: PASS
deploy: PASS
http_radar: scenario-tattoo-media-local-photo-20260526T062316Z-5750 PASS
whatsapp_real: scenario-whatsapp-real-tattoo-media-local-photo-20260526T062358Z-24484 PASS
cadeia_real: Evolution central -> bot 5545999012357
cliente: "segue foto do local" + image/png
bot: "Recebi a foto do local. Pra liberar teu orçamento, preciso do teu nome completo."
estado_final: coletando_cadastro
orcid: null
foto_local_msg_id: presente
refs_imagens_msg_ids: ausente
copy_risk: baixo
```

### Leitura Tecnica

O primeiro radar HTTP mostrou que a foto do local aguardada ainda podia cair no caminho do LLM, esbarrando em `429 insufficient_quota` e atrasando o processamento ate gerar risco de batch stale. A correcao oficializada foi tratar deterministicamente a foto aguardada quando os quatro dados principais de tattoo ja existem (`descricao_curta`, `local_corpo`, `altura_cm`, `estilo`), persistindo `foto_local_msg_id`, avancando para cadastro e evitando reenviar a mesma imagem ao LLM.

### Provas Conclusivas Reais

```text
Cliente: "segue foto do local" + imagem
Bot: "Recebi a foto do local. Pra liberar teu orçamento, preciso do teu nome completo."
```

## Evidencias - Referencia Apos Foto Local

```text
commit_fix: 122c43f fix: classify post-local tattoo photos as references
tests_local: npm test PASS, 1186/1186
ci: PASS
deploy: PASS
http_radar: scenario-tattoo-media-reference-after-local-20260526T063321Z-3051 PASS
whatsapp_real: scenario-whatsapp-real-tattoo-media-reference-after-local-20260526T063402Z-4330 PASS
cadeia_real: Evolution central -> bot 5545999012357
cliente: "essa é referência do desenho" + image/png
bot: "Recebi essa referência também. Pra liberar teu orçamento, preciso do teu nome completo."
estado_final: coletando_cadastro
orcid: null
foto_local_msg_id: 599 preservado
refs_imagens_msg_ids: 1 item novo
copy_risk: baixo
```

### Provas Conclusivas Reais

```text
Cliente: "essa é referência do desenho" + imagem
Bot: "Recebi essa referência também. Pra liberar teu orçamento, preciso do teu nome completo."
```

## Evidencias - Foto Ambigua Sem Legenda

```text
commit_fix: 80418c9 fix: clarify unlabeled tattoo media
commit_infra_media_only: 7e8afbc fix: allow media-only smoke scenarios
commit_poll: b8fc06a fix: wait for fresh ai in smoke polling
commit_real_media_only: 45de124 fix: allow media-only real whatsapp smoke
commit_evidence: d19ffbb chore: sanitize evolution smoke evidence
tests_local: npm test PASS, 1187/1187
ci: PASS
deploy: PASS
http_radar: scenario-tattoo-media-ambiguous-photo-clarification-20260526T064538Z-31035 PASS
whatsapp_real: scenario-whatsapp-real-tattoo-media-ambiguous-photo-clarification-20260526T064904Z-10234 PASS
cadeia_real: Evolution central -> bot 5545999012357
cliente: imagem sem legenda clara
bot: "Vi a imagem, mas fiquei em dúvida se ela é referência do desenho ou o local do corpo. Qual dos dois fica valendo?"
estado_final: coletando_tattoo
orcid: null
foto_local_msg_id: ausente
refs_imagens_msg_ids: 1 item novo
descricao_curta: rosa
local_corpo: antebraco
altura_cm: 170
copy_risk: baixo
```

### Leitura Tecnica

Foto unica sem legenda clara, durante coleta de tattoo e sem pedido pendente de foto local, agora recebe resposta deterministica de classificacao. O pipeline registra a imagem como referencia provisoria, preserva os dados existentes e nao chama LLM, evitando quota/stale. O runner tambem foi fortalecido para aceitar cenarios media-only, esperar IA nova posterior ao humano e omitir base64 grande das evidencias.

### Provas Conclusivas Reais

```text
Cliente: imagem sem legenda
Bot: "Vi a imagem, mas fiquei em dúvida se ela é referência do desenho ou o local do corpo. Qual dos dois fica valendo?"
```

## Closeout

```text
micro_slice: level4b-wave-4-closeout
status: PASS
wave_health: PASS
autonomy_gate: PASS, keep
security_gate: PASS
dependabot_open_alerts: 0
evidence_orphan_gate: PASS com WARN historico nao bloqueante
worktree: clean antes do closeout docs
ci_docs: PASS
deploy_docs: PASS
decisao_autonomia: manter Level 4B
4c: bloqueado
proximo_alvo: declarar Wave 5 para confirmacao da foto ambigua
```

### Evidence Summary

| Run ID | Tipo | Resultado | Estado Final | ORCID | Copy Risk |
|---|---|---:|---|---|---|
| `scenario-whatsapp-real-tattoo-media-local-photo-20260526T062358Z-24484` | WhatsApp real | PASS | `coletando_cadastro` | `null` | `baixo` |
| `scenario-whatsapp-real-tattoo-media-reference-after-local-20260526T063402Z-4330` | WhatsApp real | PASS | `coletando_cadastro` | `null` | `baixo` |
| `scenario-whatsapp-real-tattoo-media-ambiguous-photo-clarification-20260526T064904Z-10234` | WhatsApp real | PASS | `coletando_tattoo` | `null` | `baixo` |

### Provas Conclusivas Reais Da Onda

```text
1. Cliente: "segue foto do local" + imagem
   Bot: "Recebi a foto do local. Pra liberar teu orçamento, preciso do teu nome completo."

2. Cliente: "essa é referência do desenho" + imagem
   Bot: "Recebi essa referência também. Pra liberar teu orçamento, preciso do teu nome completo."

3. Cliente: imagem sem legenda
   Bot: "Vi a imagem, mas fiquei em dúvida se ela é referência do desenho ou o local do corpo. Qual dos dois fica valendo?"
```

### Decisao Estrategica

Wave 4 cumpriu o objetivo de validar entrada de midia em coleta de tattoo sem quebrar estado, cadastro, orcamento ou handoff. A automacao de monitoramento tambem evoluiu: media-only agora e caminho oficial, polling exige IA nova posterior ao humano e evidencias da Evolution ficam legiveis.

Os WARNs de evidencia orfa sao historicos e nao bloqueiam o fechamento. O unico WARN novo da familia foi um run HTTP util anterior a correcao do polling; ele fica tratado como falha de infraestrutura/metodologia ja corrigida por `b8fc06a`.

Proxima onda recomendada: confirmar a resposta do cliente apos foto ambigua, cobrindo pelo menos `é local do corpo` e `é referência`, com HTTP radar e WhatsApp real definitivo para cada comportamento.
