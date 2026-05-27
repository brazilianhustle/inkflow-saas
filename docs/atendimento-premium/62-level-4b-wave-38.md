# Level 4B - Wave 38 - Revalidacao Jornada Midia Cadastro Handoff

## Objetivo

Revalidar em producao atual a jornada maior que combina duvida lateral, briefing de tattoo, midia como foto do local, cadastro completo, recusa de e-mail e handoff para tatuador.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/52-premium-operational-chain.md
regra: depois de revalidar blocos isolados, provar encadeamento real antes de seguir para frentes maiores
autonomy_level: 4B
level_4c: bloqueado
```

## Motivo Do Ataque

As Waves 34-37 provaram laterais, imagem e midia ambigua em cortes pequenos. O proximo risco real e o encadeamento: o bot precisa manter memoria, nao repetir perguntas, persistir midia, concluir cadastro e acionar handoff com pacote rastreavel.

## Escopo

- `long-journey-lateral-media-cadastro-handoff` HTTP multiturn;
- `whatsapp-real-long-journey-lateral-media-cadastro-handoff` definitivo;
- imagem real no step de foto local;
- Workflow Manager com `handoff_package_v1`;
- Naturalness V2 nos artifacts atuais;
- provas conclusivas reais resumidas.

## Fora De Escopo

- alterar copy antes de falha atual;
- testar pos-handoff nesta wave;
- testar agenda/pagamento/sinal;
- promover Level 4C.

## Micro-Slice 1 - Jornada Maior Atual

```text
status: PASS
http_radar: scenario-long-journey-lateral-media-cadastro-handoff-20260527T062122Z-21860
whatsapp_real_novo: scenario-whatsapp-real-long-journey-lateral-media-cadastro-handoff-20260527T062318Z-27700
estado_final: aguardando_tatuador
orcid_http: orc_zyszpd
orcid_real: orc_2k8ryw
foto_local_real: foto_local_msg_id=13121; foto_local_file_id presente
workflow_manager: cadastro_and_tattoo_complete
handoff_package: handoff_package_v1
```

## Validacao Final

```text
codigo_alterado: nao
http_multiturn: PASS 6/6 steps
whatsapp_real_multiturn: PASS 6/6 steps
naturalness_v2: 2 PASS / 0 watchlist / 0 rework / 0 stop
estado_final: aguardando_tatuador
orcid: orc_*
```

## Provas Conclusivas Reais

```text
Cliente: "como funciona o orçamento?"
Bot: "Oii, tudo bem. Funciona assim: eu entendo tua ideia, junto as infos principais e o tatuador avalia pra passar valor e horário. Pra montar tua proposta certinho, como posso te chamar?"

Cliente: "segue foto do local" + imagem
Bot: "Recebi a foto do local. Agora me passa teu nome completo pra eu montar o cadastro."

Cliente: "pode seguir sem email"
Bot: "Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor."
```

## Decisao

```text
status: PASS
decisao: jornada maior atual validada em HTTP multiturn e WhatsApp real multiturn
mudanca_de_codigo: nao necessaria
proximo_ataque_sugerido: avaliar pos-handoff apos jornada real ou abrir auditoria de cobertura restante antes de nova frente funcional
```

## Gates

- tail ativo pelo runner;
- HTTP radar PASS antes do WhatsApp real;
- WhatsApp real novo `central -> bot`;
- 6 steps completos;
- foto local persistida;
- dados de tattoo preservados;
- nome, data e recusa de e-mail persistidos;
- estado final `aguardando_tatuador`;
- `orcid` criado;
- Workflow Manager `cadastro_and_tattoo_complete`;
- `handoff_package_v1`;
- sem preco fechado, agenda, sinal ou pagamento;
- Naturalness V2 PASS ou diagnostico antes de avancar.

## Stop Conditions

- WhatsApp real ausente;
- perda de dados entre steps;
- repeticao de pergunta ja respondida;
- foto local nao persistida;
- cadastro completo sem transicao para handoff;
- `orcid` ausente no fechamento;
- preco, agenda, sinal ou pagamento;
- Naturalness V2 REWORK/STOP;
- divergencia HTTP vs WhatsApp real.
