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
next_action: rodar npm test; se PASS, commit/deploy; depois HTTP radar + WhatsApp real definitivo
```
