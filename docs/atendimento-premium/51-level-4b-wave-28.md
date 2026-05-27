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
status: PASS
http_run_id: scenario-cadastro-lateral-data-recovery-20260527T044756Z-25243
whatsapp_real_run_id: scenario-whatsapp-real-cadastro-lateral-data-recovery-20260527T044838Z-22189
naturalness_v2: PASS 2/2, watchlist=0, rework=0, stop=0, media=2.81
```

Provas conclusivas reais:

```text
Cliente: "quanto tempo demora?"
Bot: "O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.

Me passa tua data de nascimento completa?"

Cliente: "12/03/1995"
Bot: "Se quiser, me passa teu e-mail. Se preferir seguir só por aqui, tudo certo."
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

## Resultado

```text
status: CLOSED PASS
http_radar: PASS
whatsapp_real_definitivo: PASS
estado_final: coletando_cadastro
orcid: null
copy_risk: medio esperado por mencao a e-mail
dados_cadastro: {"nome":"Joao Silva","data_nascimento":"1995-03-12"}
decisao: frase opcional mais natural validada sem mudar regra funcional
```

## Closeout

```text
closed_at_utc: 2026-05-27 04:51
commit_funcional: 257f3cf fix: soften optional email prompt
commit_validacao: 4eef96e docs: validate wave 28 optional email
ci_commit_validacao: PASS 26491494646
deploy_commit_validacao: PASS 26491494627
wave_health_final: PASS
scenario_pass_count: 200
real_whatsapp_pass_count: 98
security_gate: PASS
evidence_orphan_gate: PASS
autonomy_decision: keep Level 4B
level_4c: bloqueado
```
