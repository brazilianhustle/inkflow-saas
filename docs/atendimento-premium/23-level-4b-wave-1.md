# Level 4B Wave 1

Primeira onda em Level 4B. A promocao para 4B aumenta a janela operacional para ate 8 micro-slices da mesma onda, mas nao aumenta a permissao de risco. Esta onda fortalece o proprio loop de validacao antes de atacar nova superficie de produto.

## Declaracao

```text
onda_id: level4b-wave-1-multiturn-smoke
objetivo: validar conversas multi-turn com HTTP radar e WhatsApp real definitivo
familia: smoke, monitoring, decision-observability, cadastro-recovery
risco: amarelo
janela: Level 4B, ate 8 micro-slices
```

## Escopo

Dentro do escopo:

- declarar formato versionado para scenarios multi-turn;
- executar mais de uma mensagem humana sequencial no mesmo setup;
- preservar evidencias por passo e evidencia consolidada;
- validar fluxo real `lateral durante cadastro -> resposta ao campo pendente`;
- exigir HTTP radar antes de WhatsApp real;
- registrar provas conclusivas reais no mesmo padrao metodologico.

Fora do escopo:

- preco, sinal, pagamento ou agenda;
- secrets;
- tenant real amplo;
- mudanca de copy ampla;
- alteracao no Agent operacional;
- promocao para 4C.

## Micro-Slices Planejados

1. `multiturn-scenario-contract`: documentar contrato multi-turn e dry-run seguro.
2. `multiturn-http-runner`: executar steps HTTP sequenciais sem perder evidencia por passo.
3. `multiturn-whatsapp-real-runner`: executar steps WhatsApp real sequenciais via `central`.
4. `cadastro-lateral-data-recovery-http`: validar HTTP `quanto tempo demora?` seguido de `12/03/1995`.
5. `cadastro-lateral-data-recovery-whatsapp-real`: validar o mesmo fluxo na cadeia real WhatsApp.
6. `multiturn-evidence-summary`: consolidar transcript/judgment/provas por passo no evidence.
7. `level4b-wave-1-closeout`: rodar gates finais e recomendar manter/expandir/rebaixar.

O item seguinte so pode iniciar se o anterior terminar com testes locais relevantes PASS, CI/deploy PASS quando houver commit executavel, e sem blocker.

## Criterios De Pronto

- `check-autonomy-gate.sh` PASS em Level 4B;
- `check-security-gate.sh` PASS;
- `wave-health.sh` PASS antes e depois da onda;
- testes locais relevantes PASS;
- CI PASS;
- deploy PASS;
- HTTP radar PASS para o fluxo multi-turn conversacional;
- WhatsApp real definitivo PASS para o fluxo multi-turn conversacional;
- evidencia por passo preservada;
- `summary.md`, `transcript.md` e `judgment.md` gerados para a evidencia final;
- worktree limpo ao fechar;
- nenhuma promocao para 4C.

## Stop Conditions

Parar a onda se ocorrer:

- CI FAIL;
- deploy FAIL;
- HTTP radar FAIL;
- WhatsApp real FAIL;
- `copy_risk=alto`;
- estado final errado;
- evidencia de step sobrescrita sem indice recuperavel;
- mensagem humana real ausente no poll;
- falta de resposta AI depois de qualquer step;
- cleanup inseguro;
- divergencia entre HTTP e WhatsApp real;
- necessidade de tocar preco, sinal, pagamento, agenda, secrets ou tenant real amplo.

## Resultado Atual

```text
status: declarada
micro_slice_atual: multiturn-scenario-contract
autonomy_level: 4B
max_batch_size: 8
promocao_4c: bloqueada
```

## Estrategia

O ganho desta onda nao e fazer o bot falar diferente. O ganho e provar conversas completas em cadeia real, com passos sucessivos. Isso reduz o risco de validar apenas respostas isoladas e aumenta a autonomia segura para ondas funcionais futuras.

Primeiro fluxo alvo:

```text
setup: cadastro aguardando data
step_1_cliente: "quanto tempo demora?"
step_1_bot: responde tempo e retoma data
step_2_cliente: "12/03/1995"
step_2_bot: pede e-mail opcional
estado_final: coletando_cadastro
data_nascimento: 1995-03-12
orcid: null
```

Provas conclusivas esperadas:

```text
Cliente 1: "quanto tempo demora?"
Bot 1: resposta de tempo + retomada de data
Cliente 2: "12/03/1995"
Bot 2: "E o e-mail? Se preferir seguir sem, me avisa"
```
