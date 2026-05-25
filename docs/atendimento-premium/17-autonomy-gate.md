# Autonomy Gate

Este protocolo define quando o loop de atendimento premium pode aumentar a janela de execucao sem intervencao humana. A regra central e simples: autonomia nao aumenta por sensacao; aumenta por evidencia versionada, gates passando e ausencia de bloqueadores.

## Comando

```bash
bash scripts/smoke/check-autonomy-gate.sh
```

## Fonte De Verdade

```text
docs/atendimento-premium/autonomy-gate.env
```

Esse arquivo declara:

- `CURRENT_LEVEL`;
- `MAX_BATCH_SIZE`;
- `MIN_PASS_UTC`;
- requisitos minimos para promocao;
- slice gates obrigatorios;
- documentos obrigatorios;
- bloqueadores manuais.

## Niveis

```text
Nivel 0: Manual
Codex analisa e propoe, mas nao executa mudancas.

Nivel 1: 1 micro-slice
Pode implementar, testar, commitar, deployar, rodar smoke e registrar 1 comportamento por rodada.

Nivel 2: Pacote pequeno
Pode executar 2-3 micro-slices relacionados na mesma rodada, desde que nao toque risco vermelho.

Nivel 3: Mini-campanha
Pode finalizar uma familia de cenarios, como perguntas laterais simples, ate bater em falha ou bloqueador.

Nivel 4: Loop continuo supervisionado
Pode continuar ate falha, risco alto ou fim da onda. Requer staging/sandbox e rollback maduros.
```

## Nivel Atual

```text
current_level: 1
max_batch_size: 1 micro-slice
politica: parar ao fim do micro-slice e reportar decisao
```

## Requisitos Para Promover Ao Nivel 2

O script pode recomendar `promote_available` quando todos os pontos abaixo forem verdadeiros:

- pelo menos 5 scenarios PASS desde `MIN_PASS_UTC`;
- pelo menos 2 scenarios WhatsApp real PASS desde `MIN_PASS_UTC`;
- todos os slice gates obrigatorios passam;
- documentos obrigatorios existem;
- `BLOCKED_REASONS` esta vazio.

A promocao nao e automatica. Para promover, alterar `CURRENT_LEVEL`, `CURRENT_LEVEL_LABEL` e `MAX_BATCH_SIZE` em `autonomy-gate.env`, com commit proprio explicando a base de evidencia.

## Bloqueadores Absolutos

Mesmo com pontuacao suficiente, nao aumentar autonomia se houver:

- estado inconsistente;
- mensagem duplicada;
- falha em WhatsApp real sem causa clara;
- risco de preco, pagamento, sinal ou agendamento;
- mudanca em secrets;
- mudanca ampla em tenant real;
- cleanup fora do telefone de teste;
- falha repetida sem causa clara;
- decisao de produto pendente.

Registrar esses itens em `BLOCKED_REASONS`.

## Politica De Execucao Por Nivel

### Nivel 1

Permitido:

- 1 comportamento completo;
- testes locais relevantes;
- commit pequeno;
- push, CI e deploy;
- smoke HTTP;
- 1 smoke WhatsApp real quando necessario;
- transcript, judgment, triage/plan-review se falhar;
- atualizacao de registry, gate e objetivo vivo.

Parar depois do registro final.

### Nivel 2

Permitido:

- 2-3 comportamentos relacionados;
- mesma familia de risco;
- nenhum fluxo de dinheiro, agenda, Telegram real, secret ou tenant amplo;
- gate parcial a cada comportamento;
- gate de pacote no fim.

Parar se qualquer comportamento falhar 2 vezes ou se aparecer bloqueador absoluto.

### Nivel 3+

Reservado para quando a Onda 1 tiver cobertura ampla, WhatsApp real estavel, staging/sandbox confiavel e rollback claro.

## Ordem Padrao

1. Rodar `check-autonomy-gate.sh`.
2. Respeitar `allowed_batch_size`.
3. Executar ate o limite permitido.
4. Rodar slice gate.
5. Atualizar `smoke-runs.md` e `current-objective.md`.
6. Rodar `check-autonomy-gate.sh` novamente.
7. Se aparecer `promote_available`, registrar a recomendacao, mas nao promover sem decisao deliberada.

## Veredito Operacional

Enquanto o projeto estiver em Nivel 1, a maior janela segura continua sendo:

```text
1 micro-slice completo por rodada autonoma.
```

O proprio gate informa quando ha evidencia suficiente para discutir a promocao.
