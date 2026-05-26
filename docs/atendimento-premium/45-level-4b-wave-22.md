# Level 4B - Wave 22 - Long Journey Real Audit

## Objetivo

Validar jornadas reais mais longas no WhatsApp, com 6 a 10 turnos, para medir coerencia, naturalidade, preservacao de estado e robustez do processo de handoff em conversas mais proximas do uso real.

## Hipotese

Os micro-slices ja provaram comportamentos isolados com alta seguranca. O proximo salto de qualidade do bot premium depende de campanhas maiores que combinem:

- duvidas laterais;
- coleta de tattoo;
- midia;
- cadastro;
- e-mail valido ou recusado;
- handoff para tatuador;
- ausencia de repeticao mecanica;
- ausencia de preco, agenda, pagamento ou sinal inventado.

## Escopo Inicial

```text
wave_id: level4b-wave-22-long-journey-real-audit
autonomy_level: 4B
tipo: auditoria funcional + naturalidade
risco: amarelo
janela: ate 3 jornadas longas antes de nova decisao
whatsapp_real: obrigatorio
```

## Gates Obrigatorios

- `wave-health` PASS antes de iniciar;
- HTTP radar pode ser usado como ensaio quando houver novo scenario;
- WhatsApp real definitivo pela instancia `central`;
- transcript completo por jornada;
- judgment estruturado por jornada;
- provas conclusivas reais no fechamento;
- nenhum envio de preco fechado, agenda, pagamento ou sinal;
- nenhum vazamento de segredo, URL interna ou detalhe de sistema;
- estado final coerente com a jornada;
- evidencias registradas em `smoke-runs.md`;
- parada em qualquer FAIL funcional, regressao ou falha de WhatsApp real.

## Stop Conditions

- WhatsApp real FAIL;
- perda de estado em conversa multi-turn;
- bot repetir campo ja resolvido de forma clara;
- `orcid` criado antes de tattoo + cadastro completos;
- handoff ausente quando os criterios forem atingidos;
- resposta robotica com risco alto no julgamento;
- falha de CI/deploy se houver mudanca de codigo;
- falha Supabase preflight.

## Primeiro Ataque Recomendado

Jornada 1: lead novo faz pergunta lateral de processo, informa tattoo, envia midia, completa cadastro, recusa e-mail e chega ao handoff.

```text
decisao: iniciar read-only/contract-first
objetivo_do_primeiro_round: criar ou selecionar scenario longo, rodar HTTP radar se necessario e fechar WhatsApp real definitivo
```

## Criterio Para Encerrar A Wave

A Wave 22 pode ser encerrada com PASS quando pelo menos uma jornada longa passar em WhatsApp real com transcript e judgment completos. A extensao para duas ou tres jornadas so deve acontecer se a primeira revelar sinais de rigidez, repeticao ou lacunas de estado que precisem de contraste.

## Jornada 1 - Preparacao E Falha Util Inicial

Contrato declarado:

```text
http_radar: long-journey-lateral-media-cadastro-handoff
whatsapp_real: whatsapp-real-long-journey-lateral-media-cadastro-handoff
turnos: 6
cadeia: lateral processo -> multi-info tattoo -> foto local -> nome -> data -> recusa email -> handoff
```

Falha util inicial:

```text
run_id: scenario-long-journey-lateral-media-cadastro-handoff-20260526T220049Z-28966
step: 3
failure_class: contract_state_not_reached
final_state: coletando_tattoo
```

Leitura: em conversa sem seed, o Router pediu foto do local apos multi-info, mas nao persistiu `tentativas_foto_local`. A etapa de midia aguardada depende desse marcador para reconhecer deterministicamente a proxima imagem como foto do local. Resultado: a imagem entrou, mas nao promoveu para cadastro dentro do contrato.

Correcao minima:

- `conversation-router` passa a persistir `tentativas_foto_local=1` quando `multi_info` resolve os campos principais e a proxima pergunta e foto do local.
- `run-scenario.sh` passa a propagar midia por etapa em multi-turn, permitindo jornadas longas reais sem runner paralelo.
- Testes locais cobrem o novo contrato.

Validacao local:

```text
bash -n scripts/smoke/run-scenario.sh: PASS
node --test tests/_lib/conversation-router.test.mjs tests/_lib/whatsapp-pipeline.test.mjs: PASS 129/129
npm test: PASS 1211/1211
```
