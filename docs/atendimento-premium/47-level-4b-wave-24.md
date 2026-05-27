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
tests_local: PASS npm test 1214/1214
ci: PASS 26485361502
deploy: PASS 26485361503
wave_health_inicial: PASS 2026-05-27T01:34:17Z
http_radar: PASS scenario-voice-policy-first-contact-preco-20260527T013515Z-8588
whatsapp_real: PASS scenario-whatsapp-real-voice-policy-first-contact-preco-20260527T013647Z-2248
decision: micro-slice 1 PASS; manter Level 4B
next_action: escolher micro-slice 2 da mesma familia ou fechar onda curta apos wave-health final
```

Provas conclusivas reais:

```text
Cliente: "quanto fica uma rosa fineline no braco?"
Bot: "Oii, tudo bem.

O valor depende do tamanho, detalhe e local do corpo. O tatuador confirma certinho depois de avaliar tua ideia.

Pra montar tua proposta certinho, como posso te chamar?"
```

Leitura estrategica:

- PASS funcional e definitivo via WhatsApp real.
- A apresentacao mecanica foi removida no caminho deterministico Router/Composer.
- O bot manteve resposta segura de preco, `estado=coletando_tattoo`, `orcid=null` e observabilidade Router + Workflow Manager.
- Fora de escopo proposital: saudacao pura e caminhos LLM continuam para uma proxima decisao, evitando blast radius grande.

## Micro-Slice 2 - Primeiro Contato Com Multi-Info

```text
http_radar: voice-policy-first-contact-multi-info
whatsapp_real: whatsapp-real-voice-policy-first-contact-multi-info
entrada: "quero uma borboleta fineline na perna, tenho 1.70"
objetivo: persistir briefing completo, pedir foto local e nao usar "Me chamo"/"muito prazer"
```

Rubrica:

- deve persistir descricao, estilo, local e altura;
- deve pedir somente foto do local;
- deve manter `estado=coletando_tattoo`;
- deve preservar `orcid=null`;
- deve bloquear `Me chamo`, `muito prazer`, preco fechado, agenda, pagamento ou sinal.

Status:

```text
scenario_files: declarados
http_radar: PASS scenario-voice-policy-first-contact-multi-info-20260527T014045Z-20736
whatsapp_real: PASS scenario-whatsapp-real-voice-policy-first-contact-multi-info-20260527T014315Z-1134
decision: micro-slice 2 PASS; manter Level 4B
next_action: rodar wave-health final da onda e decidir se fecha Wave 24 curta ou abre micro-slice 3
```

Provas conclusivas reais:

```text
Cliente: "quero uma borboleta fineline na perna, tenho 1.70"
Bot: "Oii, tudo bem.

Boa, ja peguei a ideia principal. Consegue mandar uma foto do local onde tu quer tatuar?"
```

Leitura estrategica:

- PASS funcional e definitivo via WhatsApp real.
- O bot persistiu descricao, estilo, local e altura sem repetir perguntas ja respondidas.
- A apresentacao mecanica seguiu removida no segundo caminho deterministico de primeiro contato.
- O estado ficou `coletando_tattoo`, `orcid=null` e a proxima acao correta foi pedir foto do local.
