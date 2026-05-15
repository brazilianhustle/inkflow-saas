# TattooAgent — Baseline Run 2026-05-15

**Eval harness:** evals/inkflow-agent/_harness/run.mjs
**Judge model:** claude-haiku-4-5-20251001
**Base URL:** https://inkflowbrasil.com
**Rodado em:** 2026-05-15T20:52:12.320Z

**Total:** 3 evals - 0 pass - 3 fail - 0 error

## per-001-01-happy-path
**FAIL**
- naturalidade: 3.4
- manifesto: 0.92
- state: 0
- violations:
  - P2 — msg 7: Bot coletou altura (165cm) mas ainda não coletou tamanho_cm (opcional, mas deveria ter perguntado após foto). Mais crítico: em msg 7, bot repete 'rosinha fineline' e 'antebraço' como se confirmasse, mas não perguntou explicitamente pelo estilo ANTES de coletar a foto. A pergunta de estilo (msg 7) deveria ter vindo antes da foto (msg 8), ou a foto deveria ter sido pedida após os 4 OBR estarem claros. Sequência ligeiramente desordenada: descricao_curta ✓, local_corpo ✓, altura_cm ✓, mas estilo foi perguntado DEPOIS da foto, não antes de coletar.
- falhou em: naturalidade, state_transition

## per-009-01-muda-decisao
**FAIL**
- naturalidade: 3.8
- manifesto: 0.60
- state: 0
- violations:
  - msg 1-7: Bot não reconhece mudança de ideia (rosa → leão) como sinal de indecisão. Deveria ativar MODO CONSULTOR em msg 6, mas continua em MODO COLETOR. VIOLA P6.
  - msg 5, 7, 9: Bot pede altura_cm como obrigatório antes de coletar estilo (fineline vs realismo) e validar a ideia concretamente. Ordem inadequada. VIOLA P2 (parcial).
  - msg 1: Validação genérica ('Que massa que você quer uma rosinha!') sem comentário substantivo sobre a ideia. Não menciona nada concreto sobre rosa ou fineline. VIOLA P5 (parcial).
  - msg 6-7: Cliente muda radicalmente de ideia (rosa → leão). Bot não reconhece indecisão e não oferece espaço consultivo. Trata como decisão firme. VIOLA P6.
- falhou em: naturalidade, manifesto, state_transition

## per-010-01-conflito-tamanho
**FAIL**
- naturalidade: 2.6
- manifesto: 0.90
- state: 0
- violations:
  - msg 9 — P3 parcialmente violado: bot pede foto com justificativa ('É importante pro tatuador ter noção do espaço'), mas deveria ter oferecido apenas 1ª solicitação de foto neste turno. Embora não tenha insistido 3+ vezes, a fraseologia 'É importante' soa como pressão suave em vez de leveza. Aplicável: cliente já disse 'não tenho foto agora' (msg 4), então bot deveria pedir foto com máxima leveza ou seguir sem — aqui segue, mas reforça importância.
- falhou em: naturalidade, state_transition

## Próximos passos sugeridos pra Sub 1.B

**Configuração da run:**
- Tenant: `db686ef2-ca42-43e4-a831-808984d8d6c6` (InkFlow Sub4 Test, único ativo em prod)
- Endpoint: `/api/tools/simular-conversa` em https://inkflowbrasil.com
- Judges: naturalidade-v2 + manifesto-adherence + state-transition (Claude Haiku 4.5)

### FMs que reproduziram empiricamente

**1. FM-0001 (modo consultor não acionado) — CONFIRMADO (alta prioridade)**

PER-009 (turn 6-7) cliente muda radicalmente de rosa fineline → leão realismo. Bot continua em MODO COLETOR, não reconhece indecisão como sinal de mudar pra MODO CONSULTOR. Manifesto adherence 0.60 (bem abaixo do threshold 0.85). Confirma o gap identificado no audit (`decisao.js:159` — janela cravada em "primeiros 1-2 turnos").

**2. Naturalidade chronicamente abaixo do threshold — REPRODUZIU (alta prioridade)**

Todos os 3 evals falharam em `naturalidade_min ≥ 4.0`:
- PER-001: 3.4
- PER-009: 3.8
- PER-010: 2.6 (pior caso — bot soa formulário ao pedir foto)

PER-010 com 2.6 é alarmante — sugere que ao lidar com conflito (rosa pequena de 25cm), bot perde leveza e adota fraseologia de pressão ("É importante pro tatuador..."). Toca P3 do manifesto (leveza > formulário). Não estava previsto como FM explícito mas o catálogo deveria absorver como **FM novo: "bot perde leveza em conversa contraditória"**.

**3. State transition falha generalizada — REPRODUZIU (média prioridade)**

3/3 evals retornam `state: 0` — proxima_acao do output não bate com esperado (handoff). Pode ser:
- (a) bot não está chegando ao handoff dentro dos turns simulados
- (b) judge state-transition tem bug
- (c) prompts não fecham `proxima_acao=handoff` mesmo com 4 OBR completos

Investigar antes de Sub 1.B: rodar uma conversa manualmente via `simular-conversa` com payload similar e inspecionar `llm_output_parsed.proxima_acao` no log Supabase.

### FMs NÃO reproduzidos nesta run (mas amostra é pequena)

- **FM-0003 (bot sugere tamanho)** — PER-010 não teve essa violação. R8 em `decisao.js:103-108` parece estar segurando. Confirma o que o audit já apontava (mitigação tripla forte).
- **FM-0009 (handoff com info de desenho antigo após troca)** — PER-009 falhou em outras coisas mas naturalidade-v2 não flagou esse vetor específico. Precisa eval mais focado em handoff text inspection.

### Recomendações pro brainstorm Sub 1.B (ordem sugerida)

1. **Endereçar FM-0001 primeiro** — janela detector modo consultor de 1-2 → reavaliar a cada turno (ou pelo menos até turn 5). Provavelmente high-impact (PER-002 + PER-009 dependem disso).
2. **Investigar naturalidade-3.4** — adicionar few-shots de tom leve no `exemplos.js`? Revisar R8/R6 fraseologia? Spawn investigação mini antes do brainstorm.
3. **Triagem state_transition** — rodar 1-2 conversas manuais pra isolar se é bot, judge, ou ambos.
4. **Promover "perda de leveza em conflito" a FM novo** — entry draft em `docs/inkflow-agent/failures/FM-0013-bot-perde-leveza-em-conflito.md` (ou próximo FM disponível).
5. **Expandir evals pra 4-6** — adicionar PER-002 (indeciso-explorando, validar FM-0001 standalone) e PER-007 (negociador, validar R2 preço).