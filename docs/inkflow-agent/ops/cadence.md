# Cadência operacional — InkFlow Agent

## Daily
Sem ritual fixo. Uso real + memory updates orgânicos. Telemetria continua rodando em background.

## Weekly review (~45min, **sábado** padrão)

1. Roda directed evals dos agents ativos: `npm run inkflow-agent:eval -- --category=directed` (~5min)
2. Roda lint do catálogo: `npm run inkflow-agent:lint`
3. Gera weekly report: `node scripts/inkflow-agent/generate-weekly-report.mjs` → output em `docs/inkflow-agent/reports/YYYY-MM-WX-weekly.md`
4. Lista 5 conversations reais da semana (3 ruins, 2 boas) — query Supabase
5. Pra cada: classifica persona, identifica failures (cria FM-NNNN se novo), atualiza catalog
6. Update `failures/INDEX.md` (status changes)
7. Decide top-1 priority pra próxima semana → grava no Painel do vault
8. Commita reports/

## Monthly review (~2h, **primeiro sábado do mês**)

1. Roda eval completo: regression + todos directed + red-team
2. Compila métricas product-side via Supabase (queries em `ops/metrics.md`)
3. Failures: archiva resolvidos (status fixed → archived após 4 weeks limpos), escala open há >4 weeks
4. Revisão de personas: alguma archived? alguma draft promove?
5. Decide tema do mês
6. Salva report em `docs/inkflow-agent/reports/YYYY-MM-monthly.md`

## Quarterly (~4h, **fim de trimestre**)

1. Revisão do manifesto (P1-P6 ainda relevantes? Algo emergiu?)
2. Revisão de skills cristalizadas
3. Avaliação de model under test e judge model (Anthropic + OpenAI ainda fazem sentido?)
4. Roadmap próximo trimestre

## Trigger map

| Evento | Disparo |
|---|---|
| PR toca `functions/_lib/prompts/coleta/<agent>/*` | CI roda regression + bloqueia se falhar |
| PR toca `docs/manifesto-tatuador-bot.md` | CI roda directed eval de TODOS agents |
| Failure novo descoberto | Criar `FM-NNNN-*.md` em status `open`, link no INDEX |
| Conversa real ruim na weekly | Promote pra eval via `scripts/inkflow-agent/promote-logs-to-evals.mjs` |
| Alarme custo eval >70% cap | Telegram alert (Phase 1+ implementação) |
| Bypass-gate usado em PR | Failure entry obrigatório, re-validação em 24h |
