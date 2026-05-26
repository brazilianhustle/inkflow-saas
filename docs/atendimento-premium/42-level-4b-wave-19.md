# Level 4B - Wave 19 - Post-Handoff Hardening

## Objetivo

Revalidar e fortalecer os fluxos pos-handoff em `aguardando_tatuador`, garantindo que mensagens adicionais do cliente sejam encaminhadas ao tatuador sem reabrir coleta, sem gerar nova resposta automatica e sem perder observabilidade.

## Hipotese

Waves 11 e 12 ja provaram texto e midia pos-handoff, mas sao evidencias anteriores ao ciclo atual de naturalidade/contrato. Antes de abrir uma familia funcional nova, vale revalidar o terminal de handoff porque ele e ponto critico de confianca: depois que o humano assumiu, o bot nao deve voltar a conduzir a conversa.

## Escopo Inicial

```text
wave_id: level4b-wave-19-post-handoff-hardening
autonomy_level: 4B
tipo: revalidacao primeiro, codigo apenas se necessario
primeiro_cenario_http: post-handoff-text-forwarding
primeiro_cenario_whatsapp_real: whatsapp-real-post-handoff-text-forwarding
segundo_candidato: post-handoff-media-forwarding
risco: amarelo baixo
```

## Gates Obrigatorios

- `wave-health` PASS antes de tocar codigo;
- testes focados se houver mudanca de codigo;
- `npm test` se houver mudanca funcional;
- CI/deploy PASS antes de smoke de producao quando houver codigo;
- HTTP radar antes de WhatsApp real;
- WhatsApp real definitivo pela instancia `central`;
- estado final permanece `aguardando_tatuador`;
- `orcid=orc_poshandoff` preservado;
- nenhuma resposta AI posterior ao humano novo;
- tail confirma encaminhamento ao tatuador;
- registrar `Provas Conclusivas Reais` no fechamento.

## Stop Conditions

- WhatsApp real FAIL;
- qualquer resposta automatica nova apos humano em `aguardando_tatuador`;
- estado sair de `aguardando_tatuador`;
- perda de `orcid`;
- tail com `telegram-4xx/5xx`, `pipeline batch failed` ou `unhandled`;
- reabertura de coleta;
- envio de preco, agenda, pagamento ou sinal;
- falha Supabase preflight;
- CI/deploy FAIL.

## Primeiro Ataque

Revalidar `post-handoff-text-forwarding` sem alteracao de codigo.

Se PASS:

```text
decisao: fechar micro-slice como revalidacao sem codigo e seguir para midia pos-handoff
```

Se FAIL:

```text
decisao: travar execucao, triage por evidence/triage/plan-review e corrigir pipeline terminal antes de qualquer novo slice
```

## Micro-Slice 1 - Texto Pos-Handoff

PASS com melhoria metodologica: texto adicional em `aguardando_tatuador` continua sendo encaminhado ao tatuador, sem reabrir coleta e sem gerar nova resposta automatica apos o humano. Durante a revalidacao, o relatorio mostrou uma ambiguidade: `judgment.md` exibia como `Last Bot Message` uma IA antiga do seed, anterior ao humano. O fluxo estava correto, mas a leitura da evidencia ficava fraca.

Correcoes de monitoramento:

```text
seed_pos_handoff_aguardando_tatuador: copy antiga substituida pela copy atual de handoff
render_report: fluxos com SMOKE_REQUIRE_AI_RESPONSE=0 agora calculam ai_messages_after_last_human
render_report: Last Bot Message fica vazio quando nao ha IA apos o ultimo humano
render_report: Last Bot Before Human preserva o contexto anterior sem confundir com resposta nova
```

Validacao:

```text
mudanca_funcional_bot: nao
mudanca_metodologica_smoke: sim
bash_n: PASS
http_radar: scenario-post-handoff-text-forwarding-20260526T205943Z-14853 PASS
whatsapp_real: scenario-whatsapp-real-post-handoff-text-forwarding-20260526T210016Z-26317 PASS
estado_final: aguardando_tatuador
orcid: orc_poshandoff
tail: pos-handoff-mensagem-encaminhada
ai_messages_after_last_human: 0
copy_risk: baixo
```

### Provas Conclusivas Reais - Micro-Slice 1

Cliente: `lembrei de mais um detalhe`

Bot: sem nova resposta automatica apos o humano.

Estado final: `aguardando_tatuador`, `orcid=orc_poshandoff`, `ai_messages_after_last_human=0`, tail `pos-handoff-mensagem-encaminhada`.

## Decisao Apos Micro-Slice 1

Manter Level 4B. O fluxo terminal de texto pos-handoff esta verde na producao e a evidencia agora ficou mais legivel. Proximo ataque recomendado: revalidar midia pos-handoff com o mesmo criterio de ausencia de IA posterior ao humano.
