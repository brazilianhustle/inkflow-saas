# Level 4B - Wave 25 - Voice Policy Saudacao Pura

## Objetivo

Remover a apresentacao mecanica tambem dos backstops determinisiticos de primeiro contato que ainda passam pelo `runAgent`, comecando por saudacao pura.

## Hipotese

A Wave 24 limpou os caminhos Router/Composer quando o cliente ja traz contexto acionavel. O flanco restante e o primeiro contato sem briefing, onde `functions/api/agent/route.js` ainda forca `Me chamo Assistente, muito prazer`.

## Escopo

```text
wave_id: level4b-wave-25-voice-policy-pure-greeting
autonomy_level: 4B
tipo: melhoria sistemica leve de naturalidade
risco: amarelo
zona: runAgent backstops de primeiro contato
whatsapp_real: obrigatorio por micro-slice conversacional
level_4c: bloqueado
```

## Regra Estrategica

- Nao editar prompts LLM nesta primeira passada.
- Usar `conversation-voice-policy.js` como fonte unica da saudacao curta.
- Trocar a apresentacao mecanica por pergunta direta de nome em saudacao pura.
- Preservar campos faltantes e estado de coleta.
- Bloquear preco fechado, agenda, pagamento, sinal e ORCID prematuro.

## Micro-Slice 1 - Saudacao Pura

```text
http_radar: voice-policy-pure-greeting
whatsapp_real: whatsapp-real-voice-policy-pure-greeting
entrada: "oi"
objetivo: responder saudacao pura sem "Me chamo"/"muito prazer" e pedir nome
```

Rubrica:

- deve responder com saudacao curta;
- deve pedir nome do cliente;
- deve manter `estado=coletando_tattoo`;
- deve preservar `orcid=null`;
- deve bloquear `Me chamo`, `muito prazer`, preco fechado, agenda, pagamento, sinal e `orc_`.

Status:

```text
scenario_files: declarados
tests_focused: PASS node --test tests/_lib/conversation-voice-policy.test.mjs tests/agent/route-runagent.test.mjs
npm_test: PASS 1215/1215
ci: PASS 26486066442
eval_gate: PASS 26486066454
deploy: PASS 26486066456
http_radar_initial: FAIL util scenario-voice-policy-pure-greeting-20260527T015219Z-26119 agent_no_response
fix_after_fail: d5e8db8 fix: bypass llm for pure greeting
http_radar: PASS scenario-voice-policy-pure-greeting-20260527T015635Z-7813
whatsapp_real: PASS scenario-whatsapp-real-voice-policy-pure-greeting-20260527T015732Z-10191
decision: micro-slice 1 PASS; manter Level 4B
next_action: rodar wave-health final e decidir se fecha Wave 25 curta
```

Provas conclusivas reais:

```text
Cliente: "oi"
Bot: "Oii, tudo bem.

Como posso te chamar?"
```

Leitura estrategica:

- PASS funcional e definitivo via WhatsApp real.
- A primeira tentativa HTTP revelou um gap operacional real: saudacao pura dependia do LLM antes de aplicar o backstop, gerando timeout.
- A correcao removeu essa dependencia: primeiro contato com saudacao pura agora responde deterministicamente pela Voice Policy.
- O bot manteve `estado=coletando_tattoo`, `orcid=null`, sem preco, agenda, pagamento ou sinal.
