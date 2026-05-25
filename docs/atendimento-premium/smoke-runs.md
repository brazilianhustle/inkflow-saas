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
| 2026-05-25 05:31 | `smoke-20260525T053147Z-23172` | HTTP monitorado | `https://inkflowbrasil.com` | `5521970789797` | PASS | `.smoke-evidence/smoke-20260525T053147Z-23172/` | Workflow de cadastro completo validado: `aguardando_tatuador` + `orcid=orc_2x6t5l` + `email_recusado=true`. |

## Run De Referencia Atual

### `smoke-20260525T053147Z-23172`

Mensagem:

```text
pode seguir sem email
quanto tempo demora?
```

Estado final:

```json
{
  "estado_agente": "aguardando_tatuador",
  "orcid": "orc_2x6t5l",
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

Confirmo por aqui e sigo com teu orçamento
```

Leitura estrategica:

- PASS tecnico.
- Handoff esta operacional.
- Transcript e julgamento deterministico foram gerados retroativamente para este run.
- Existe risco medio de copy: a frase final funciona, mas ainda pode soar seca para padrao premium.
- Proximo upgrade operacional deve rodar smoke WhatsApp real com `central` e registrar o primeiro evidence nativo com transcript + julgamento.
