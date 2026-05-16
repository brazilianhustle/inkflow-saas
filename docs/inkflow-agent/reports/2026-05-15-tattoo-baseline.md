# TattooAgent — Baseline Run 2026-05-16

**Eval harness:** evals/inkflow-agent/_harness/run.mjs
**Judge model:** claude-haiku-4-5-20251001
**Base URL:** https://feat-sub-1b-prompt-iteration.inkflow-saas.pages.dev
**Rodado em:** 2026-05-16T05:24:57.662Z

**Total:** 3 evals - 0 pass - 2 fail - 1 error

## per-001-01-happy-path
**FAIL**
- naturalidade: 3.8
- manifesto: 0.83
- state: 1
- violations:
  - msg 5: Bot repete pergunta idêntica de msg 3 ('E em qual parte do corpo você quer a rosinha fineline?') após cliente já ter respondido 'no antebraço'. Viola P5 (conversa simpática sem robotização; soa formulário).
  - msg 7: Bot interpreta '1.65m' como altura do cliente em vez de reconhecer que é resposta fora de contexto. Não pede clarificação. Viola P2 parcialmente (coleta altura_cm, mas não valida se era intenção do cliente ou confusão).
  - msg 5 + msg 7: Sequência de repetição + coleta confusa prejudica fluidez. Bot deveria ter validado 'antebraço' em msg 4 e movido para próxima OBR sem repetir em msg 5.
- falhou em: naturalidade, manifesto

## per-009-01-muda-decisao
**FAIL**
- naturalidade: 3.6
- manifesto: 0.67
- state: 0
- violations:
  - P2 VIOLADO (msg 5, 9): Bot pede altura_cm como obrigatório antes de coletar estilo. Ordem correta: descrição_curta, local_corpo, altura_cm, estilo. Bot pulou estilo na primeira coleta e só pediu altura.
  - P5 VIOLADO (msg 7): Ao receber mudança radical (rosa → leão), bot não valida a ideia em 1 frase substantiva antes de re-coletar. Apenas repete 'Anotei a mudança' (genérico, sem comentário concreto sobre leão/realismo).
  - P6 VIOLADO (msg 6-7): Cliente muda de ideia radicalmente no meio da conversa (rosa → leão), sinalizando indecisão. Bot continua em modo COLETOR (coleta dados) sem reconhecer que cliente é INDECISO e deveria entrar em modo CONSULTOR (explorar a mudança, validar conceito antes de coletar).
- falhou em: naturalidade, manifesto, state_transition

## per-010-01-conflito-tamanho
**ERROR**
- error: http 500

## Próximos passos sugeridos pra Sub 1.B

(Preencher manualmente após review do report — quais FMs reproduziram empiricamente, ordem de prioridade.)