# Context Compact Architecture

## Diagnostico

O loop de compactacao estava documentado, mas nao estava integrado de forma portavel.

Falha raiz:

```text
O mecanismo dependia de hook SessionStart do Claude Code, enquanto a frente tambem roda em Codex/API.
```

Efeitos observados:

- o script `scripts/smoke/continuity-bundle.sh` existia localmente, mas nao estava versionado;
- `.claude/settings.json` apontava para o hook, mas esse hook nao dispara em Codex;
- o protocolo dizia o que ler apos compactacao, mas nao criava um checkpoint executavel pelo loop;
- a continuidade ficava dependente do chat lembrar de rodar comandos quando o contexto ja estava baixo.

## Correcao

`scripts/smoke/continuity-bundle.sh` passa a ter dois modos:

```bash
bash scripts/smoke/continuity-bundle.sh --force
```

Modo portavel para Codex/CLI. Sempre imprime o bundle de retomada.

```text
SessionStart clear|compact|resume
```

Modo hook do Claude Code. Injeta contexto automaticamente quando esse cliente dispara o evento.

## Regra Operacional

Quando o contexto cair abaixo de 20%, o agente deve executar:

```bash
bash scripts/smoke/continuity-bundle.sh --force
```

Depois disso:

1. registrar no chat somente o resumo necessario;
2. seguir pelo `current-objective.md`;
3. nao recontar historico longo;
4. se houver smoke em andamento, decidir pelo evidence dir;
5. se houver mudanca relevante, commit pequeno antes de continuar.

## Limite Importante

Nenhum script local consegue forcar a compactacao interna do cliente Codex. A arquitetura correta e:

```text
repo gera bundle compacto -> agente usa bundle como fonte de verdade -> cliente compacta quando necessario
```

Ou seja, o controle real e tornar a retomada deterministica, nao tentar controlar a memoria interna do modelo.
