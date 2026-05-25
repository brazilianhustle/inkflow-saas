# Loop Continuity Protocol

Este protocolo impede que compactacao de contexto, sessao longa ou troca de aba interrompa a execucao. A fonte de verdade do trabalho passa a ser o repo, nao o chat.

## Principio

```text
chat = raciocinio de curto prazo
repo = memoria operacional
evidence = verdade observavel
commit = checkpoint reversivel
```

## Arquivos De Continuidade

- `current-objective.md`: objetivo ativo, estado vivo, ultimo marco e proximo ataque.
- `smoke-runs.md`: indice dos smokes relevantes e suas conclusoes.
- `09-session-handoff.md`: handoff amplo da frente para novas sessoes.
- `08-decision-log.md`: decisoes arquiteturais e mudancas de direcao.
- `.smoke-evidence/<run_id>/`: fatos brutos do smoke.

## Loop Padrao

1. Ler `current-objective.md`.
2. Confirmar `git status --short`.
3. Executar a menor mudanca coerente.
4. Rodar testes relevantes.
5. Rodar smoke monitorado quando tocar comportamento conversacional.
6. Registrar evidencia e decisao.
7. Atualizar `current-objective.md` e `smoke-runs.md` se o estado mudou.
8. Commitar checkpoint saudavel.
9. Continuar para o proximo passo.

## Protocolo De Compactacao

Quando o contexto estiver grande, antes de continuar:

```bash
bash scripts/smoke/continuity-bundle.sh --force
```

Fallback manual:

```bash
git status --short
git log --oneline -5
sed -n '1,220p' docs/atendimento-premium/current-objective.md
sed -n '1,220p' docs/atendimento-premium/smoke-runs.md
sed -n '1,220p' docs/atendimento-premium/12-loop-continuity-protocol.md
```

Se houver mudancas nao commitadas:

```text
1. entender o diff;
2. rodar verificacao minima;
3. atualizar current-objective se a mudanca afeta o proximo passo;
4. commitar apenas se o checkpoint estiver saudavel.
```

Se a compactacao acontecer no meio de um smoke:

```text
1. abrir .smoke-evidence/<run_id>/summary.md;
2. abrir poll.json;
3. abrir tail-excerpt.log;
4. decidir PASS/FAIL pelo criterio do runner;
5. registrar em smoke-runs.md.
```

## Criterios De Checkpoint Saudavel

Um checkpoint pode ser commitado quando:

- a mudanca resolve uma unidade explicavel em uma frase;
- testes relevantes passaram;
- smoke foi rodado quando necessario, ou a excecao esta registrada;
- evidencia esta linkada quando houve smoke;
- `current-objective.md` reflete o proximo passo real;
- o worktree nao mistura assuntos independentes.

## Cleanup De Contexto Durante Execucao

Quando o contexto ficar ruidoso:

- nao recontar toda a historia;
- extrair apenas fatos para `current-objective.md`;
- extrair smokes para `smoke-runs.md`;
- deixar detalhes longos em `.smoke-evidence`;
- usar commits pequenos como pontos de retorno;
- retomar pelo comando de compactacao acima.

## Regra De Ouro

```text
Se uma informacao sera necessaria depois da compactacao, ela nao deve viver so no chat.
```

## Diagnostico Do Hook

O hook em `.claude/settings.json` e util no Claude Code, mas nao e portavel para
Codex/API. Por isso o bundle tambem precisa existir como comando explicito:

```bash
bash scripts/smoke/continuity-bundle.sh --force
```

Detalhes da arquitetura ficam em [17-context-compact-architecture.md](./17-context-compact-architecture.md).

## Proximo Uso Planejado

O proximo upgrade deve seguir este protocolo:

```text
Objetivo: antes de qualquer novo micro-slice, gerar o bundle portavel e confirmar gates.
Comando: bash scripts/smoke/continuity-bundle.sh --force
Verificacao: Autonomy Gate PASS e gate do slice relacionado PASS/atualizado.
Registro: se o bundle/protocolo mudar, commit pequeno antes de continuar execucao.
```
