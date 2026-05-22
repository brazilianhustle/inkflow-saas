# Nota ancora — smoke pos-refator coleta/proposta

Data: 2026-05-22
Repo: `inkflow-saas`
Base: backlog `docs/backlog/2026-05-22-smoke-findings.md`

## O que foi feito

Correcoes estruturais:

- S1 cadastro: o agente nao pode mais persistir `data_nascimento` inventado quando o cliente so informou idade solta, exemplo: "tenho 30 anos". Data explicita continua permitida.
- S2 reentrada: mensagens automaticas de retomada agora tambem entram em `conversa_mensagens`, alem de `chat_messages`, para aparecerem no historico usado pelo agente.
- S3 Pix prematuro: `reservar_horario` agora e bloqueado fora de `escolhendo_horario`, evitando gerar sinal antes do cliente escolher um horario valido.
- S4/S5 baloes: envio Evolution usa helper unico para separar mensagens por linha em branco (`\n\n`), inclusive pipeline WhatsApp, reentrada e confirmacao pos-pagamento.

Correcoes de prompt/copy:

- Cadastro explicita que idade sozinha nao pode virar data de nascimento.
- Tattoo e proposta reforcam separacao de confirmacao + pergunta em dois baloes.
- Proposta reduz repeticao de abertura, segura desconto sem confirmar contraproposta e confirma dia/horario ao escolher slot.
- Briefing ao tatuador corrige concordancia de local comum, exemplo: "na perna" em vez de "no perna".

Fora de escopo deste commit:

- Parcelamento/forma de pagamento como feature configuravel. O smoke pode registrar, mas nao deve esperar suporte novo ainda.

## Como testar no Claude Code

Use um tenant de teste e uma conversa limpa quando possivel. O objetivo e validar comportamento, nao volume.

### Roteiro 1 — Cadastro nao alucina nascimento

1. Levar a conversa ate cadastro.
2. Informar apenas idade: "tenho 30 anos".
3. Conferir `conversas.dados_cadastro.data_nascimento`.
4. Continuar dizendo uma data explicita, exemplo: "nasci em 15/03/1996".

Resultado esperado:

- Depois de "tenho 30 anos", `data_nascimento` continua `null` ou preserva valor anterior ja existente.
- O bot pede a data de nascimento em vez de inventar.
- Depois da data explicita, `data_nascimento` pode ser persistido.

### Roteiro 2 — Reentrada entra no historico do agente

1. Simular/acionar reentrada automatica para uma conversa pausada.
2. Verificar inserts em `chat_messages` e `conversa_mensagens`.
3. Enviar uma resposta do cliente depois da reentrada.

Resultado esperado:

- A mensagem automatica aparece em `conversa_mensagens.message.content`.
- No turno seguinte, o agente nao age como se a retomada nao tivesse acontecido.

### Roteiro 3 — Sem Pix antes do horario escolhido

1. Em proposta, aceitar o valor.
2. Antes de escolher um slot valido, tentar induzir pagamento/sinal, exemplo: "manda o pix".
3. Conferir se houve chamada de geracao de sinal ou reserva.

Resultado esperado:

- O bot pede para escolher um dos horarios enviados.
- Nao gera Pix/sinal antes de `estado_atual=escolhendo_horario` com slot valido.

### Roteiro 4 — Baloes por `\n\n`

1. Acionar uma resposta com confirmacao + pergunta na coleta.
2. Acionar uma reentrada.
3. Acionar confirmacao pos-pagamento em ambiente seguro/mocado.

Resultado esperado:

- Textos separados por linha em branco saem como mensagens separadas no WhatsApp.
- Nao deve juntar confirmacao e proxima pergunta no mesmo balao quando o prompt usa `\n\n`.

### Roteiro 5 — Proposta e briefing

1. Gerar briefing com local `perna`.
2. No fluxo de proposta, cliente pede desconto.
3. Depois cliente escolhe um horario especifico.

Resultado esperado:

- Briefing usa "na perna".
- Ao pedir desconto, o bot nao confirma desconto sozinho; ele informa que vai consultar/encaminhar.
- Ao escolher horario, o bot confirma dia/horario antes de seguir.

## Validacao local antes do deploy

Executado antes do commit:

- `npm test`: 1042 testes passaram, 0 falharam.
- Testes focados de agent/orchestrator/reentrada/Evolution/MP/pipeline passaram.
- Testes de prompt e snapshots passaram.
- `git diff --check` passou.

## Sinais de regressao no smoke

Abrir novo item se aparecer qualquer um destes sintomas:

- `data_nascimento` nasce de idade solta.
- Reentrada aparece no WhatsApp mas nao entra no historico do agente.
- Pix/sinal e gerado antes do slot escolhido.
- Texto com `\n\n` chega em um unico balao.
- Bot confirma desconto sem decisao do tatuador.
- Briefing volta a escrever "no perna".
