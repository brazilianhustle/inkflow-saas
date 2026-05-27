# Level 4B - Wave 39 - Pos-Handoff Apos Jornada Completa

## Objetivo

Validar que, apos uma jornada real completa criar handoff para o tatuador, uma mensagem adicional do cliente permanece em `aguardando_tatuador`, e encaminha para o humano sem nova resposta automatica, sem reabrir coleta e sem perder o pacote de orcamento.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/52-premium-operational-chain.md
regra: HTTP production smoke e radar; WhatsApp real central -> bot e validacao definitiva
autonomy_level: 4B
level_4c: bloqueado
```

## Motivo Do Ataque

A Wave 38 provou a criacao do handoff ao fim de uma jornada maior. O risco residual e o turno seguinte: depois de `aguardando_tatuador`, o bot nao pode voltar a agir como coletor, responder com IA ou confundir complemento do cliente como novo orcamento.

## Escopo

- `long-journey-cadastro-lateral-handoff` HTTP multiturn;
- `whatsapp-real-long-journey-cadastro-lateral-handoff` definitivo;
- step pos-handoff com `SMOKE_REQUIRE_AI_RESPONSE_7=0`;
- preservacao de estado `aguardando_tatuador`;
- preservacao de `orcid`, cadastro, tattoo e foto local;
- Workflow Manager no fechamento;
- Naturalness V2 nos artifacts atuais.

## Fora De Escopo

- alterar copy antes de falha atual;
- seed direto em `aguardando_tatuador` como prova principal;
- testar preco fechado, agenda, sinal ou pagamento;
- promover Level 4C.

## Micro-Slice 1 - Pos-Handoff Apos Jornada Completa

```text
status: PASS
http_radar: scenario-long-journey-cadastro-lateral-handoff-20260527T063228Z-27950
whatsapp_real_novo: scenario-whatsapp-real-long-journey-cadastro-lateral-handoff-20260527T063442Z-29924
estado_final: aguardando_tatuador
orcid_http: orc_7g8pv4
orcid_real: orc_n89aee
step_pos_handoff: "lembrei que queria pequeno"
resposta_ai_pos_handoff: nenhuma
foto_local_real: foto_local_msg_id=13144; foto_local_file_id presente
workflow_manager: cadastro_and_tattoo_complete
handoff_package: handoff_package_v1
naturalness_v2: 2 PASS / 0 watchlist / 0 rework / 0 stop
```

## Validacao Final

```text
codigo_alterado: nao
http_multiturn: PASS 7/7 steps
whatsapp_real_multiturn: PASS 7/7 steps
naturalness_v2: PASS
estado_final: aguardando_tatuador
orcid: orc_n89aee
ai_messages_after_last_human_pos_handoff: 0
```

## Provas Conclusivas Reais

```text
Cliente: "quero uma borboleta fineline na perna, tenho 1.70"
Bot: "Oii, tudo bem.\n\nBoa, ja peguei a ideia principal. Consegue mandar uma foto do local onde tu quer tatuar?"

Cliente: "segue foto do local" + imagem
Bot: "Recebi a foto do local. Agora me passa teu nome completo pra eu montar o cadastro."

Cliente: "prefiro falar por aqui"
Bot: "Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor."

Cliente: "lembrei que queria pequeno"
Bot: sem nova resposta automatica apos o humano.
```

## Decisao

```text
status: PASS
decisao: pos-handoff apos jornada completa validado em HTTP radar e WhatsApp real definitivo
mudanca_de_codigo: nao necessaria
proximo_ataque_sugerido: abrir nova frente pequena fora de pos-handoff ou revisar cobertura restante antes de mexer em naturalidade/copy
```

## Gates

- tail ativo pelo runner;
- HTTP radar PASS antes do WhatsApp real;
- WhatsApp real novo `central -> bot`;
- 7 steps completos;
- foto local persistida;
- dados de tattoo preservados;
- nome, data e recusa de e-mail persistidos;
- estado final `aguardando_tatuador`;
- `orcid` criado e preservado;
- Workflow Manager `cadastro_and_tattoo_complete` no fechamento;
- step 7 sem nova IA apos o humano;
- sem preco fechado, agenda, sinal ou pagamento;
- Naturalness V2 PASS ou diagnostico antes de avancar.

## Stop Conditions

- WhatsApp real ausente;
- HTTP PASS usado como validacao definitiva;
- IA respondendo depois do ultimo humano pos-handoff;
- perda de `orcid` ou retorno para coleta;
- perda de dados entre steps;
- foto local nao persistida;
- preco, agenda, sinal ou pagamento;
- Naturalness V2 REWORK/STOP;
- divergencia HTTP vs WhatsApp real.
