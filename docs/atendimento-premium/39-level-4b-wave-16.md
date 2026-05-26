# Level 4B Wave 16 - Minor Age Guardian Consent Variants

## Objetivo

Fortalecer a menoridade por sinais indiretos de responsavel legal. Frases como `minha mae autorizou` ou `tenho autorizacao dos meus pais` devem acionar humano com seguranca, sem exigir que o cliente escreva literalmente `sou menor de idade`.

## Escopo

- Estado inicial: cadastro aguardando data de nascimento.
- Primeiro micro-slice: `minha mae autorizou`.
- Saida esperada: handoff humano seguro, `estado=aguardando_tatuador`, `orcid=null`, `data_nascimento=null`.
- Observabilidade: `conversation_router` com `minor_age_explicit` e `escalation_manager` com `minor_age`.
- Validacao: teste local, HTTP radar e WhatsApp real definitivo.

## Fora De Escopo

- validar documento, responsavel ou permissao;
- pedir comprovante de autorizacao;
- persistir idade como data;
- preco, sinal, pagamento ou agenda;
- mudanca ampla de linguagem;
- tenant real amplo ou secrets;
- promocao para 4C.

## Criterio De Pronto

```text
tests_focados: PASS
tests_local: PASS quando risco justificar
ci: PASS
deploy: PASS
http_radar: PASS
whatsapp_real: PASS
estado_final: aguardando_tatuador
orcid: null
data_nascimento: null
copy_risk: baixo
```

## Stop Conditions

- qualquer resposta que trate autorizacao dos pais como liberacao automatica;
- criar `orcid`;
- persistir `data_nascimento` inexistente;
- continuar coleta normal depois de sinal de responsavel legal;
- WhatsApp real ausente ou FAIL;
- qualquer risco de preco, agenda, pagamento ou sinal.

## Estado

PASS: dois micro-slices concluidos. Wave 16 encerrada pragmaticamente.

## Micro-Slice 1

PASS: `minha mae autorizou` validado como sinal indireto de menoridade por responsavel legal, acionando humano sem inventar `data_nascimento` e sem criar `orcid`.

```text
commit_funcional: 0584aeb feat: detect guardian consent minor risk
tests_focados: bash -n scripts/smoke/run-scenario.sh scripts/smoke/run-inbound.sh scripts/smoke/run-real-whatsapp.sh scripts/smoke/render-report.sh PASS; node --test tests/_lib/conversation-policy.test.mjs tests/_lib/conversation-router.test.mjs tests/_lib/escalation-manager.test.mjs tests/_lib/whatsapp-pipeline.test.mjs PASS 142/142
tests_local: npm test PASS 1202/1202
ci: PASS
deploy: PASS
http_radar: scenario-cadastro-menoridade-responsavel-handoff-humano-20260526T174032Z-6477 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-menoridade-responsavel-handoff-humano-20260526T174106Z-9280 PASS
```

## Provas Conclusivas Reais

Cliente: `minha mae autorizou`

Bot: `Como a pessoa que vai tatuar tem menos de 18 anos, vou acionar o tatuador para orientar com segurança sobre responsável legal.`

Estado final: `aguardando_tatuador`, `orcid=null`, `data_nascimento=null`.

## Decisao Apos Micro-Slice 1

Manter Level 4B. A menoridade indireta por responsavel legal agora tem primeira cobertura deterministica com HTTP radar e WhatsApp real definitivo. Proximo passo recomendado: continuar a Wave 16 apenas se houver ganho claro em segunda variacao, como `tenho autorizacao dos meus pais`; caso contrario, fechar a onda e declarar nova frente leve.

## Micro-Slice 2

PASS: `tenho autorizacao dos meus pais` validado como segunda variacao de menoridade indireta por responsavel legal, acionando humano sem inventar `data_nascimento` e sem criar `orcid`.

```text
commit_cobertura: 078614c test: cover parents consent minor risk
tests_focados: bash -n scripts/smoke/run-scenario.sh scripts/smoke/run-inbound.sh scripts/smoke/run-real-whatsapp.sh scripts/smoke/render-report.sh PASS; node --test tests/_lib/conversation-policy.test.mjs tests/_lib/conversation-router.test.mjs tests/_lib/escalation-manager.test.mjs tests/_lib/whatsapp-pipeline.test.mjs PASS 143/143
ci: PASS
deploy: PASS
http_radar: scenario-cadastro-menoridade-pais-handoff-humano-20260526T175054Z-4335 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-menoridade-pais-handoff-humano-20260526T175152Z-23494 PASS
```

## Provas Conclusivas Reais - Micro-Slice 2

Cliente: `tenho autorizacao dos meus pais`

Bot: `Como a pessoa que vai tatuar tem menos de 18 anos, vou acionar o tatuador para orientar com segurança sobre responsável legal.`

Estado final: `aguardando_tatuador`, `orcid=null`, `data_nascimento=null`.

## Decisao Final Da Wave

Wave 16 encerrada. As duas variacoes principais de responsavel legal passaram com HTTP radar e WhatsApp real definitivo:

- `minha mae autorizou`;
- `tenho autorizacao dos meus pais`.

Nao ha ganho imediato em continuar expandindo sinonimos dentro da mesma onda sem nova evidencia de uso real. Proximo passo deve ser nova onda leve declarada, ainda em Level 4B.
