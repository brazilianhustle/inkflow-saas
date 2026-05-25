# Processo Padrao De Smoke Monitorado

Este e o caminho oficial para smoke real de atendimento premium.

Objetivo:

```text
executar smoke com monitoramento ativo, correlation id, polling e evidencia reproduzivel
```

## Comando Padrao

```bash
BASE_URL=https://inkflowbrasil.com EXPECTED_STATE=aguardando_tatuador \
  bash scripts/smoke/run-inbound.sh $'pode seguir sem email\nquanto tempo demora?' 5521970789797
```

Para preview:

```bash
BASE_URL=https://<preview>.inkflow-saas.pages.dev SMOKE_TAIL_ENVIRONMENT=preview \
  bash scripts/smoke/run-inbound.sh "quanto fica?" 5521970789797
```

Para local:

```bash
BASE_URL=http://localhost:8788 \
  bash scripts/smoke/run-inbound.sh "quanto fica?" 5521970789797
```

## O Que O Runner Faz

1. Gera `SMOKE_RUN_ID`.
2. Garante tail ativa para smoke remoto com `wrangler pages deployment tail`.
3. Salva snapshot Supabase antes.
4. Envia inbound com correlation id no `msg_id` e `pushName`.
5. Faz polling ate resposta AI, estado esperado ou timeout.
   - Para `EXPECTED_STATE=aguardando_tatuador`, tambem exige `orcid` por padrao.
6. Salva snapshot Supabase depois.
7. Salva trecho da tail.
8. Gera pacote de evidencia em `.smoke-evidence/<run_id>/`.

## Arquivos De Evidencia

```text
.smoke-evidence/<run_id>/
  request.json
  tail-start.txt
  verify-before.txt
  inbound-response.txt
  poll.json
  verify-after.txt
  tail-excerpt.log
  summary.md
```

## Regras Operacionais

- Smoke real deve usar `scripts/smoke/run-inbound.sh`, nao chamada manual solta.
- Se o smoke for remoto, tail precisa estar ativa antes do POST.
- Se o smoke tiver estado final esperado, passar `EXPECTED_STATE`.
- Se falhar, olhar primeiro `summary.md`, `poll.json` e `tail-excerpt.log`.
- `scripts/smoke-inbound.sh` continua existindo como primitiva, mas nao e o processo completo.

## Variaveis Uteis

```text
BASE_URL                  URL alvo do smoke
EXPECTED_STATE           estado esperado para polling, ex: aguardando_tatuador
SMOKE_RUN_ID             correlation id manual opcional
SMOKE_POLL_TIMEOUT_SECONDS default 60
SMOKE_POLL_INTERVAL_SECONDS default 3
SMOKE_REQUIRE_ORCID       default 1 quando EXPECTED_STATE inclui aguardando_tatuador
SMOKE_TAIL_ENVIRONMENT   production ou preview
SMOKE_TAIL_LOG           default /tmp/inkflow-smoke-tail.log
SMOKE_TAIL_DISABLED=1    desativa tail apenas em debug
```

## Criterio De PASS

O smoke so deve ser considerado PASS quando:

- inbound HTTP respondeu sem erro;
- polling detectou resposta AI ou `EXPECTED_STATE`;
- `verify-after.txt` confirma estado/dados esperados;
- `tail-excerpt.log` nao mostra erro runtime relevante;
- o pacote de evidencia ficou salvo.
