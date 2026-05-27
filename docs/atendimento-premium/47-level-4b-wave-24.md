# Level 4B - Wave 24 - Voice Policy Primeiro Contato

## Objetivo

Reduzir a apresentacao mecanica em primeiro contato sem abrir remendos por frase. A frente atua na camada `conversation-voice-policy` e nos resolvedores deterministas que ja passam por Router/Composer.

## Hipotese

A Wave 23 provou que as jornadas longas estao funcionais, mas manteve uma watchlist: primeiro contato ainda usa `Me chamo Assistente, muito prazer` em respostas deterministicas. Isso soa mecanico quando o cliente ja trouxe uma pergunta ou briefing util.

## Escopo

```text
wave_id: level4b-wave-24-voice-policy-first-contact
autonomy_level: 4B
tipo: melhoria sistemica leve de naturalidade
risco: amarelo
zona: deterministica Router/Composer
whatsapp_real: obrigatorio por micro-slice conversacional
level_4c: bloqueado
```

## Regra Estrategica

- Nao editar prompts LLM nesta primeira passada.
- Nao mexer no caso de saudacao pura que ainda cai no Agent.
- Centralizar copy em `conversation-voice-policy.js`.
- Trocar apresentacao mecanica por saudacao curta quando o cliente ja trouxe contexto acionavel.
- Preservar contratos: sem preco fechado, sem agenda, sem pagamento, sem sinal e sem ORCID prematuro.

## Micro-Slice 1 - Primeiro Contato Com Preco

```text
http_radar: voice-policy-first-contact-preco
whatsapp_real: whatsapp-real-voice-policy-first-contact-preco
entrada: "quanto fica uma rosa fineline no braco?"
objetivo: responder preco com seguranca, pedir nome e nao usar "Me chamo"/"muito prazer"
```

Rubrica:

- deve responder que valor depende de tamanho/detalhe/local/avaliacao;
- deve retomar com nome do cliente;
- deve manter `estado=coletando_tattoo`;
- deve preservar `orcid=null`;
- deve bloquear `Me chamo`, `muito prazer`, preco fechado, agenda, pagamento ou sinal.

Status:

```text
scenario_files: declarados
next_action: rodar testes locais; se PASS, commit/deploy; depois HTTP radar e WhatsApp real definitivo
```
