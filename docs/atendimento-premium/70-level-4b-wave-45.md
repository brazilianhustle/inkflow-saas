# Level 4B - Wave 45 - Naturalidade Premium Por Familia

## Objetivo

Auditar a naturalidade premium por familias funcionais usando evidencias reais atuais, em modo read-only, antes de qualquer mudanca de copy, prompt, VoicePolicy ou Composer.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/68-frentes-finais-bot-premium.md
frente: Naturalidade Premium Por Familia
autonomy_level: 4B
level_4c: bloqueado
regra: Naturalness V2 orienta priorizacao; mudanca de copy so acontece se houver watchlist real relevante, REWORK ou STOP
```

## Familias Auditadas

```text
abertura: PASS
retomada_de_coleta: PASS
resposta_lateral_com_retomada: PASS
pedido_de_midia: PASS
classificacao_de_imagem: PASS
cadastro_nome_data: PASS
email_opcional: PASS
fechamento_handoff: PASS
risco_humano: PASS
pos_handoff: PASS
```

## Evidencias

```text
auditor: scripts/smoke/naturalness-audit-v2.sh
modo: read-only
whatsapp_sent: no
evidencias_analisadas: 10
pass: 10
watchlist: 0
rework: 0
stop: 0
media_geral: 2.87
```

Evidencias usadas:

```text
abertura:
  .smoke-evidence/scenario-whatsapp-real-voice-policy-pure-greeting-20260527T015732Z-10191

retomada_de_coleta:
  .smoke-evidence/scenario-whatsapp-real-long-journey-naturalidade-abertura-retomada-20260527T074830Z-497/steps/2

resposta_lateral_com_retomada:
  .smoke-evidence/scenario-whatsapp-real-long-journey-naturalidade-abertura-retomada-20260527T074830Z-497/steps/3

pedido_de_midia:
  .smoke-evidence/scenario-whatsapp-real-long-journey-naturalidade-abertura-retomada-20260527T074830Z-497/steps/4

classificacao_de_imagem:
  .smoke-evidence/scenario-whatsapp-real-tattoo-media-ambiguous-photo-clarification-20260527T071355Z-23833

cadastro_nome_data:
  .smoke-evidence/scenario-whatsapp-real-long-journey-cadastro-lateral-handoff-20260527T074445Z-26553/steps/3

email_opcional:
  .smoke-evidence/scenario-whatsapp-real-long-journey-cadastro-lateral-handoff-20260527T074445Z-26553/steps/5

fechamento_handoff:
  .smoke-evidence/scenario-whatsapp-real-long-journey-cadastro-lateral-handoff-20260527T074445Z-26553/steps/6

risco_humano:
  .smoke-evidence/scenario-whatsapp-real-tattoo-cliente-irritado-handoff-20260527T051213Z-17663

pos_handoff:
  .smoke-evidence/scenario-whatsapp-real-long-journey-cadastro-lateral-handoff-20260527T074445Z-26553/steps/7
```

## Leitura Estrategica

```text
veredito: nao mexer em copy agora
motivo: todas as familias auditadas passaram sem watchlist/rework/stop
risco_evitar: trocar frase funcional por gosto subjetivo e criar regressao
acao_correta: usar as respostas atuais como baseline e avancar para Tenant/Config em modo produto
```

O unico ponto com score menor foi `email_opcional`, com `copy_risk=medio`, ja conhecido e aceito metodologicamente porque a frase menciona e-mail opcional. A Naturalness V2 manteve PASS e nao encontrou copy antiga ou risco funcional.

## Provas Conclusivas Reais

```text
Cliente: "oi"
Bot: "Oii, tudo bem. Como posso te chamar?"

Cliente: "quero uma frase pequena"
Bot: "Tu imagina fazer em qual parte do corpo?"

Cliente: "no antebraco, tenho 1.70
como funciona o orçamento?"
Bot: "Funciona assim: eu entendo tua ideia, junto as infos principais e o tatuador avalia pra passar valor e horário. Perfeito. Tu prefere qual estilo pra essa tattoo?"

Cliente: "12/03/1995"
Bot: "Se quiser, me passa teu e-mail. Se preferir seguir só por aqui, tudo certo."

Cliente: "prefiro falar por aqui"
Bot: "Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor."

Cliente: "lembrei que queria pequeno"
Bot: sem nova resposta automatica apos o humano.
```

## Decisao

```text
status: fechada_pass
decisao: Naturalidade Premium por familia aprovada em auditoria read-only atual
proxima_frente: Wave 46 - Tenant/Config em modo produto
nao_fazer_agora: ajustes subjetivos de linguagem sem evidencia de watchlist real
```
