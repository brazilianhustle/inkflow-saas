# Level 4B - Wave 28 - Naturalidade Do E-mail Opcional

## Objetivo

Melhorar a naturalidade do pedido de e-mail opcional em cadastro sem alterar regras funcionais: e-mail continua opcional, recusa continua aceita, ORCID nao pode ser criado antes de tattoo + cadastro completos.

## Evidencia

Auditoria V2 em evidencias WhatsApp real recentes de cadastro/e-mail/handoff:

```text
evidencias_analisadas: 10
pass: 10
watchlist: 0
rework: 0
stop: 0
media_geral: 2.83
```

Mesmo com PASS, a familia de e-mail aparece repetidamente com `copy_risk=medio` por conter pedido de e-mail. O alvo nao e remover o gate conservador, mas deixar a frase mais natural e menos seca.

## Escopo

```text
wave_id: level4b-wave-28-email-optional-naturalness
autonomy_level: 4B
tipo: melhoria sistemica leve de copy
risco: amarelo
zona: conversation-voice-policy
whatsapp_real: obrigatorio
level_4c: bloqueado
```

## Fora De Escopo

- mudar obrigatoriedade do e-mail;
- mexer em Workflow Manager;
- mexer em handoff/orcamento;
- alterar prompts LLM;
- promover Level 4C.

## Plano

### Micro-Slice 1 - Policy

```text
arquivo: functions/_lib/conversation-voice-policy.js
objetivo: trocar o pedido seco "E o e-mail? Se preferir seguir sem, me avisa" por frase opcional mais natural
status: PASS
frase_nova: "Se quiser, me passa teu e-mail. Se preferir seguir só por aqui, tudo certo."
```

### Micro-Slice 2 - Validacao Local

```text
testes: conversation-voice-policy, conversation-router, whatsapp-pipeline
status: PASS
focused_tests: PASS 138/138
npm_test: PASS 1216/1216
```

### Micro-Slice 3 - Producao

```text
http_radar: cadastro-lateral-data-recovery
whatsapp_real: whatsapp-real-cadastro-lateral-data-recovery
status: pending
```

## Gates

- sem insistir em e-mail;
- aceitar recusa natural;
- manter `estado=coletando_cadastro` apos data sem ORCID;
- manter `estado=aguardando_tatuador` no handoff quando e-mail valido/recusado completa cadastro;
- HTTP radar antes do WhatsApp real;
- WhatsApp real definitivo pela `central`;
- Auditor V2 sem STOP/REWORK.

## Stop Conditions

- e-mail virar obrigatorio;
- recusa de e-mail deixar de funcionar;
- ORCID prematuro;
- handoff quebrado;
- `copy_risk=alto`;
- WhatsApp real FAIL.
