# Smoke Runs - Atendimento Premium

Indice versionado dos smokes relevantes. A evidencia bruta continua em `.smoke-evidence/<run_id>/`; este arquivo registra somente o que importa para retomada e decisao.

## Como Atualizar

Ao fim de smoke monitorado:

1. Registrar `run_id`, tipo, alvo, telefone, mensagem e resultado.
2. Linkar o diretorio de evidencia.
3. Registrar estado final, side effects relevantes e julgamento curto.
4. Se falhou, registrar proximo diagnostico concreto.

## Runs

| Data UTC | Run ID | Tipo | Alvo | Telefone | Resultado | Evidencia | Decisao |
|---|---|---|---|---|---|---|---|
| 2026-05-25 17:25 | `scenario-tattoo-cobertura-handoff-humano-20260525T172531Z-30039` | Scenario HTTP monitorado | `https://inkflowbrasil.com` | `5521970789797` | PASS | `.smoke-evidence/scenario-tattoo-cobertura-handoff-humano-20260525T172531Z-30039/` | Cobertura textual validada em producao: lead novo com "quero cobrir uma tattoo antiga" virou `estado=aguardando_tatuador`, `orcid=null`, resposta citou cobertura/tatuador/seguranca sem pedir altura/local/estilo, sem preco/agendamento/sinal, bot text/tail/poll jq gates PASS. |
| 2026-05-25 17:17 | `scenario-cadastro-menoridade-handoff-humano-20260525T171756Z-19173` | Scenario HTTP monitorado | `https://inkflowbrasil.com` | `5521970789797` | PASS | `.smoke-evidence/scenario-cadastro-menoridade-handoff-humano-20260525T171756Z-19173/` | Escalation Manager validado sem regressao no fluxo de menoridade: `estado=aguardando_tatuador`, `orcid=null`, `data_nascimento=2015-03-12`, resposta segura, copy risk baixo, bot text/tail/poll jq gates PASS. |
| 2026-05-25 17:09 | `scenario-cadastro-menoridade-handoff-humano-20260525T170936Z-8596` | Scenario HTTP monitorado | `https://inkflowbrasil.com` | `5521970789797` | PASS | `.smoke-evidence/scenario-cadastro-menoridade-handoff-humano-20260525T170936Z-8596/` | Menoridade explicita validada em producao: data `12/03/2015` persistiu como `2015-03-12`, `estado=aguardando_tatuador`, `orcid=null`, resposta informou menor de 18, tatuador, seguranca e responsavel legal, sem preco/agendamento/sinal, bot text, tail e poll jq gates PASS. |
| 2026-05-25 16:54 | `scenario-cadastro-data-idade-nao-persiste-20260525T165404Z-8303` | Scenario HTTP monitorado | `https://inkflowbrasil.com` | `5521970789797` | PASS | `.smoke-evidence/scenario-cadastro-data-idade-nao-persiste-20260525T165404Z-8303/` | Copy de maioridade validada em producao: idade isolada nao persistiu `data_nascimento`, `estado=coletando_cadastro`, `dados_cadastro` preservou apenas `nome`, sem `orcid`, resposta pediu data completa com seguranca e registro de maioridade, `copy_risk=baixo`, bot text e poll jq gates PASS. |
| 2026-05-25 09:00 | `scenario-cadastro-data-idade-nao-persiste-20260525T090055Z-20793` | Scenario HTTP monitorado | `https://inkflowbrasil.com` | `5521970789797` | PASS | `.smoke-evidence/scenario-cadastro-data-idade-nao-persiste-20260525T090055Z-20793/` | Idade isolada validada: resposta AI nova apos humano exigida pelo polling, `estado=coletando_cadastro`, `dados_cadastro` preservou apenas `nome`, sem `data_nascimento`/`email` vazios, sem `orcid`, `copy_risk=baixo`, bot text e poll jq gates PASS. |
| 2026-05-25 08:44 | `scenario-whatsapp-real-lateral-pergunta-imagem-sem-midia-20260525T084449Z-30339` | Scenario WhatsApp real | `central -> bot (*2357)` | `5521970789797` | PASS | `.smoke-evidence/scenario-whatsapp-real-lateral-pergunta-imagem-sem-midia-20260525T084449Z-30339/` | Pergunta sobre imagem sem midia validada em cadeia real: Evolution `sendText` HTTP 201, webhook registrou humano real sem media, `estado=coletando_tattoo`, resposta pediu reenvio de foto sem voltar ao formulario, sem preco/agendamento/sinal, `copy_risk=baixo`, bot text gate PASS. |
| 2026-05-25 08:41 | `scenario-whatsapp-real-lateral-portfolio-disponivel-20260525T084106Z-3640` | Scenario WhatsApp real | `central -> bot (*2357)` | `5521970789797` | PASS | `.smoke-evidence/scenario-whatsapp-real-lateral-portfolio-disponivel-20260525T084106Z-3640/` | Portfolio disponivel validado em cadeia real: Evolution `sendText` HTTP 201, webhook registrou humano real, `estado=coletando_tattoo`, resposta sem URL manual/preco/agendamento/sinal, tail confirmou `/api/tools/enviar-portfolio` HTTP 200, `copy_risk=baixo`, bot text gate PASS. |
| 2026-05-25 08:37 | `scenario-whatsapp-real-lateral-processo-tatuagem-20260525T083720Z-14678` | Scenario WhatsApp real | `central -> bot (*2357)` | `5521970789797` | PASS | `.smoke-evidence/scenario-whatsapp-real-lateral-processo-tatuagem-20260525T083720Z-14678/` | Processo de tatuagem validado em cadeia real: Evolution `sendText` HTTP 201, webhook registrou humano real, `estado=coletando_tattoo`, resposta explicou fluxo de ideia/infos/tatuador/valor/horario sem expor sistema, erro, preco fechado, agendamento ou sinal, `copy_risk=baixo`, bot text gate PASS. |
| 2026-05-25 08:30 | `scenario-whatsapp-real-lateral-tempo-sessao-20260525T083030Z-3522` | Scenario WhatsApp real | `central -> bot (*2357)` | `5521970789797` | PASS | `.smoke-evidence/scenario-whatsapp-real-lateral-tempo-sessao-20260525T083030Z-3522/` | Tempo de sessao validado em cadeia real: Evolution `sendText` HTTP 201, webhook registrou humano real, `estado=coletando_tattoo`, resposta explicou dependencia de tamanho/detalhe/local/avaliacao sem prometer horas/mesmo dia/sessao certa, `copy_risk=baixo`, bot text gate PASS. |
| 2026-05-25 08:25 | `scenario-whatsapp-real-lateral-pergunta-imagem-com-midia-20260525T082548Z-1414` | Scenario WhatsApp real | `central -> bot (*2357)` | `5521970789797` | PASS | `.smoke-evidence/scenario-whatsapp-real-lateral-pergunta-imagem-com-midia-20260525T082548Z-1414/` | Imagem real enviada pela Evolution `sendMedia`: HTTP 201, webhook registrou `image/png` com caption, `estado=coletando_tattoo`, resposta perguntou referencia vs local, sem fallback de reenvio/preco/agendamento/sinal, `copy_risk=baixo`, bot text gate PASS. |
| 2026-05-25 08:20 | `scenario-lateral-pergunta-imagem-com-midia-20260525T082057Z-32499` | Scenario HTTP monitorado | `https://inkflowbrasil.com` | `5521970789797` | PASS | `.smoke-evidence/scenario-lateral-pergunta-imagem-com-midia-20260525T082057Z-32499/` | Pergunta sobre imagem com midia validada: media `image/png` persistida, `estado=coletando_tattoo`, resposta perguntou se era referencia ou local do corpo, sem fallback de reenvio, preco/agendamento/sinal/cartao, `copy_risk=baixo`, bot text gate PASS. |
| 2026-05-25 08:07 | `scenario-lateral-pergunta-imagem-sem-midia-20260525T080724Z-23217` | Scenario HTTP monitorado | `https://inkflowbrasil.com` | `5521970789797` | PASS | `.smoke-evidence/scenario-lateral-pergunta-imagem-sem-midia-20260525T080724Z-23217/` | Pergunta sobre imagem sem midia validada: `estado=coletando_tattoo`, resposta pediu reenvio sem voltar ao formulario, sem local/altura/estilo/preco/agendamento/sinal, `copy_risk=baixo`, bot text gate PASS. |
| 2026-05-25 07:49 | `scenario-whatsapp-real-lateral-historia-vida-homenagem-20260525T074931Z-6121` | Scenario WhatsApp real | `central -> bot (*2357)` | `5521970789797` | PASS | `.smoke-evidence/scenario-whatsapp-real-lateral-historia-vida-homenagem-20260525T074931Z-6121/` | Historia de vida/homenagem validada em cadeia real: Evolution 201, webhook registrou humano real, `estado=coletando_tattoo`, resposta preservou briefing e fez pergunta util, sem terapia/preco/agendamento/sinal, `copy_risk=baixo`, bot text gate PASS. |
| 2026-05-25 07:38 | `scenario-lateral-historia-vida-homenagem-20260525T073806Z-822` | Scenario HTTP monitorado | `https://inkflowbrasil.com` | `5521970789797` | PASS | `.smoke-evidence/scenario-lateral-historia-vida-homenagem-20260525T073806Z-822/` | Historia de vida/homenagem validada no contrato minimo: acolheu breve, fez uma pergunta util, `estado=coletando_tattoo`, sem preco/agendamento/sinal, `copy_risk=baixo`, bot text gate PASS. |
| 2026-05-25 07:32 | `scenario-lateral-portfolio-disponivel-20260525T073230Z-20463` | Scenario HTTP monitorado | `https://inkflowbrasil.com` | `5521970789797` | PASS | `.smoke-evidence/scenario-lateral-portfolio-disponivel-20260525T073230Z-20463/` | Portfolio disponivel validado: `estado=coletando_tattoo`, resposta sem URL manual/preco, `copy_risk=baixo`, bot text gate PASS, tail gate confirmou `enviar-portfolio`. |
| 2026-05-25 07:22 | `scenario-whatsapp-real-lateral-preco-generico-20260525T072240Z-21331` | Scenario WhatsApp real | `central -> bot (*2357)` | `5521970789797` | PASS | `.smoke-evidence/scenario-whatsapp-real-lateral-preco-generico-20260525T072240Z-21331/` | Ensaio final do slice lateral para preco: Evolution 201, webhook registrou humano real, `estado=coletando_tattoo`, sem preco inventado, `copy_risk=baixo`, bot text gate PASS. |
| 2026-05-25 07:17 | `scenario-lateral-processo-tatuagem-20260525T071714Z-29044` | Scenario HTTP monitorado | `https://inkflowbrasil.com` | `5521970789797` | PASS | `.smoke-evidence/scenario-lateral-processo-tatuagem-20260525T071714Z-29044/` | Atendimento lateral respondeu processo de forma curta, retomou coleta, `estado=coletando_tattoo`, `copy_risk=baixo`, bot text gate PASS. |
| 2026-05-25 07:16 | `scenario-lateral-tempo-sessao-20260525T071651Z-5651` | Scenario HTTP monitorado | `https://inkflowbrasil.com` | `5521970789797` | PASS | `.smoke-evidence/scenario-lateral-tempo-sessao-20260525T071651Z-5651/` | Atendimento lateral respondeu tempo sem prometer duracao exata, `estado=coletando_tattoo`, `copy_risk=baixo`, bot text gate PASS. |
| 2026-05-25 07:16 | `scenario-lateral-preco-generico-20260525T071624Z-17328` | Scenario HTTP monitorado | `https://inkflowbrasil.com` | `5521970789797` | PASS | `.smoke-evidence/scenario-lateral-preco-generico-20260525T071624Z-17328/` | Atendimento lateral respondeu preco sem inventar valor, `estado=coletando_tattoo`, `copy_risk=baixo`, bot text gate PASS. |
| 2026-05-25 06:53 | `scenario-whatsapp-real-cadastro-handoff-20260525T065321Z-13729` | Scenario WhatsApp real | `central -> bot (*2357)` | `5521970789797` | PASS | `.smoke-evidence/scenario-whatsapp-real-cadastro-handoff-20260525T065321Z-13729/` | Copy premium validada em cadeia real: `aguardando_tatuador`, `orcid=orc_nqk5ft`, `email_recusado=true`, `copy_risk=baixo`. |
| 2026-05-25 06:52 | `scenario-cadastro-handoff-email-recusado-20260525T065248Z-24071` | Scenario HTTP monitorado | `https://inkflowbrasil.com` | `5521970789797` | PASS | `.smoke-evidence/scenario-cadastro-handoff-email-recusado-20260525T065248Z-24071/` | Copy premium validada no radar HTTP: `aguardando_tatuador`, `orcid=orc_q7dj6h`, `email_recusado=true`, `copy_risk=baixo`. |
| 2026-05-25 06:37 | `scenario-whatsapp-real-cadastro-handoff-20260525T063724Z-20686` | Scenario WhatsApp real | `central -> bot (*2357)` | `5521970789797` | PASS | `.smoke-evidence/scenario-whatsapp-real-cadastro-handoff-20260525T063724Z-20686/` | Cadeia real validada: Evolution 201, webhook registrou humano exato, `aguardando_tatuador`, `orcid=orc_wus13k`, `email_recusado=true`, `copy_risk=medio`. |
| 2026-05-25 06:22 | `scenario-cadastro-handoff-email-recusado-20260525T062239Z-3885` | Scenario HTTP monitorado | `https://inkflowbrasil.com` | `5521970789797` | PASS | `.smoke-evidence/scenario-cadastro-handoff-email-recusado-20260525T062239Z-3885/` | Registry validado: `EXPECTED_STATE` autoritativo, `aguardando_tatuador`, `orcid=orc_hljd47`, `email_recusado=true`, `copy_risk=medio`. |
| 2026-05-25 05:31 | `smoke-20260525T053147Z-23172` | HTTP monitorado | `https://inkflowbrasil.com` | `5521970789797` | PASS | `.smoke-evidence/smoke-20260525T053147Z-23172/` | Workflow de cadastro completo validado: `aguardando_tatuador` + `orcid=orc_2x6t5l` + `email_recusado=true`. |

## Run De Referencia Atual

### `scenario-tattoo-cobertura-handoff-humano-20260525T172531Z-30039`

Mensagem:

```text
quero cobrir uma tattoo antiga no braco
```

Estado final:

```json
{
  "estado_agente": "aguardando_tatuador",
  "orcid": null,
  "dados_cadastro": {}
}
```

Resposta AI observada:

```text
Pra cobertura, o tatuador precisa avaliar direto com segurança antes de seguir. Vou acionar ele para olhar teu caso e te orientar pelos próximos passos.
```

Leitura estrategica:

- PASS tecnico.
- Cobertura textual nao entra em coleta normal e nao cria orcamento.
- Escalation Manager classifica o motivo como `cover_up`, com severidade alta e sem `orcid`.
- Tail gate confirmou ausencia de `enviar-orcamento-tatuador`, `pipeline batch failed` e `unhandled`.
- O scenario fica como evidencia de expansao do Escalation Manager para risco da fase tattoo.
