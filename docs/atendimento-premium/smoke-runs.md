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

### `scenario-whatsapp-real-cadastro-handoff-20260525T065321Z-13729`

Mensagem:

```text
pode seguir sem email
quanto tempo demora?
```

Estado final:

```json
{
  "estado_agente": "aguardando_tatuador",
  "orcid": "orc_nqk5ft",
  "dados_cadastro": {
    "nome": "Joao Silva",
    "email": null,
    "email_recusado": true,
    "data_nascimento": "1995-03-12"
  }
}
```

Resposta AI observada:

```text
O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.

Fechado, Joao! O tatuador vai avaliar com calma e eu te retorno em breve com o valor certinho.
```

Leitura estrategica:

- PASS tecnico.
- Cadeia real WhatsApp validada: `central` enviou mensagem real para o numero do bot e o webhook registrou a mensagem humana exata.
- Handoff esta operacional.
- Scenario registry esta operacional como checkpoint reproduzivel.
- Polling corrigido: com `EXPECTED_STATE`, resposta AI isolada nao aprova o smoke.
- Copy de encerramento saiu do risco medio para baixo sem prometer preco, prazo especifico ou alterar estado.
- Proximo upgrade operacional deve expandir cenarios obrigatorios por intent/slice e usar `check-slice-gate.sh` antes de declarar conclusao.
