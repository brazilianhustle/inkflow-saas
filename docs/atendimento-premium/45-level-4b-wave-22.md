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

## Jornada 1 - PASS

Deploy:

```text
commit: cc77bba fix: track photo request after multi info
tests_ci: PASS 26477883969
deploy_pages: PASS 26477883967
```

Validacao definitiva:

```text
http_radar: scenario-long-journey-lateral-media-cadastro-handoff-20260526T220704Z-29722 PASS
whatsapp_real: scenario-whatsapp-real-long-journey-lateral-media-cadastro-handoff-20260526T221935Z-11804 PASS
estado_final: aguardando_tatuador
orcid: orc_1480i5
foto_local_msg_id: 12897
foto_local_file_id: persistido
email_recusado: true
workflow_reason: cadastro_and_tattoo_complete
handoff_package: handoff_package_v1
copy_risk_final: baixo
```

Provas conclusivas reais:

```text
Cliente: como funciona o orçamento?
Bot: Oii, tudo bem. Me chamo Assistente, muito prazer. Funciona assim: eu entendo tua ideia, junto as infos principais e o tatuador avalia pra passar valor e horário. Pra montar tua proposta certinho, como posso te chamar?

Cliente: quero uma rosa fineline no antebraco, tenho 1.70
Bot: Boa, ja peguei a ideia principal. Consegue mandar uma foto do local onde tu quer tatuar?

Cliente: segue foto do local + image/png
Bot: Recebi a foto do local. Agora me passa teu nome completo pra eu montar o cadastro.

Cliente: Joao Silva
Bot: Me passa tua data de nascimento completa?

Cliente: 12/03/1995
Bot: E o e-mail? Se preferir seguir sem, me avisa

Cliente: pode seguir sem email
Bot: Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.
```

Leitura estrategica: a primeira jornada longa provou que micro-slices anteriores escondiam um gap real de encadeamento sem seed. A Wave 22 ja gerou valor estrutural: encontrou a falha, corrigiu a causa no Router, fortaleceu o runner multi-turn com midia por etapa e validou a conversa completa no WhatsApp real.

Decisao: Jornada 1 PASS. Antes de encerrar a Wave 22, recomenda-se uma segunda jornada longa de contraste sem midia ou com pergunta lateral durante cadastro, para medir naturalidade e repeticao em outro caminho.

## Jornada 2 - PASS

Contrato declarado:

```text
http_radar: long-journey-cadastro-lateral-handoff
whatsapp_real: whatsapp-real-long-journey-cadastro-lateral-handoff
turnos: 7
cadeia: multi-info tattoo -> foto local -> nome -> lateral tempo durante cadastro -> data -> recusa email -> texto pos-handoff
```

Fortalecimento metodologico:

- `run-scenario.sh` agora aceita `SMOKE_REQUIRE_AI_RESPONSE_N` por etapa em multi-turn.
- Isso permite validar jornadas mistas em que os primeiros passos exigem resposta da IA, mas o passo final pos-handoff exige ausencia de nova IA.

Validacao:

```text
bash -n scripts/smoke/run-scenario.sh: PASS
http_radar: scenario-long-journey-cadastro-lateral-handoff-20260526T230701Z-22157 PASS
whatsapp_real: scenario-whatsapp-real-long-journey-cadastro-lateral-handoff-20260526T231029Z-8936 PASS
estado_final: aguardando_tatuador
orcid: orc_2kyzzm
foto_local_msg_id: 12920
foto_local_file_id: persistido
email_recusado: true
workflow_reason: cadastro_and_tattoo_complete
handoff_package: handoff_package_v1
copy_risk_final: baixo
pos_handoff_ai_after_human: 0
```

Provas conclusivas reais:

```text
Cliente: quero uma borboleta fineline na perna, tenho 1.70
Bot: Boa, ja peguei a ideia principal. Consegue mandar uma foto do local onde tu quer tatuar?

Cliente: segue foto do local + image/png
Bot: Recebi a foto do local. Agora me passa teu nome completo pra eu montar o cadastro.

Cliente: Joao Silva
Bot: Me passa tua data de nascimento completa?

Cliente: quanto tempo demora?
Bot: O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia. Me passa tua data de nascimento completa?

Cliente: 12/03/1995
Bot: E o e-mail? Se preferir seguir sem, me avisa

Cliente: prefiro falar por aqui
Bot: Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.

Cliente: lembrei que queria pequeno
Bot: sem nova resposta automatica; mensagem ficou encaminhada em `aguardando_tatuador`.
```

Leitura estrategica: Jornada 2 validou o contraste que faltava na Wave 22. A pergunta lateral durante cadastro foi respondida sem mutar estado, sem apagar nome, sem criar ORCID prematuro e com retomada correta de data. Depois do handoff, nova mensagem real do cliente nao reabriu coleta e nao gerou IA adicional.

Decisao: Wave 22 tem duas jornadas longas reais PASS e pode ser fechada com seguranca apos commit, CI/deploy e `wave-health` final.
