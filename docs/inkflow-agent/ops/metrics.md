# Métricas — InkFlow Agent

## Bot-side (qualidade técnica)

| Métrica | Target | Threshold (alarme) | Fonte | Query |
|---|---|---|---|---|
| Regression suite pass rate | 100% | <100% bloqueia merge | CI | github action history |
| Directed eval pass rate / persona × agent | ≥90% | <85% bloqueia merge pro agent | `evals/inkflow-agent/report.json` | local |
| Invariant violation rate em produção | <2% turns | >5% pause + investigation | `agent_turn_logs.invariant_passed` | `SELECT 100.0*COUNT(*) FILTER (WHERE NOT invariant_passed) / COUNT(*) FROM agent_turn_logs WHERE created_at > now() - interval '7 days';` |
| Latência p95 por turn | <8s | >12s investiga | `latency_total_ms` | `SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_total_ms) FROM agent_turn_logs WHERE created_at > now() - interval '7 days';` |
| Cost médio por turn | baseline ~$0.005 | >2× baseline alarme | `cost_usd` | `SELECT avg(cost_usd) FROM agent_turn_logs WHERE created_at > now() - interval '7 days';` |

## Product-side (negócio)

| Métrica | Target piloto | Target produção | Fonte |
|---|---|---|---|
| Taxa de fechamento assistido (lead → sinal pago) | ≥20% | ≥30% | `SELECT COUNT(*) FILTER (WHERE estado_agente = 'fechado') / COUNT(*)::float FROM conversas WHERE created_at > now() - interval '30 days';` |
| Taxa de intervenção humana | ≤25% | ≤15% | `SELECT 100.0*COUNT(DISTINCT conversa_id) FILTER (WHERE tatuador_interviu) / COUNT(DISTINCT conversa_id) FROM agent_turn_logs WHERE created_at > now() - interval '30 days';` |
| Drop-off rate por estado | mapa | <10% por estado | distribuição final de `conversas.estado_agente` |
| Turns até handoff | <6 | <4 | `turn_index` do turn que chama `enviar_orcamento_tatuador` |
| NPS dos clientes | n/a | ≥40 | survey externo (Phase 2) |

## Manifesto-side

| Métrica | Target | Fonte |
|---|---|---|
| Aderência cross-agent (média `m1_manifesto_adherence`) | ≥0.85 | Rubric do LLM-judge nos directed evals |
| Failures por categoria, tendência mensal | Decrescente | `docs/inkflow-agent/failures/INDEX.md` distribuição |

## SQL queries de referência

```sql
-- 1. Distribuição de turns por agent × estado (24h)
SELECT agent_name, estado_agente, COUNT(*)
FROM agent_turn_logs
WHERE created_at > now() - interval '24 hours'
GROUP BY 1, 2
ORDER BY 1, 3 DESC;

-- 2. Top invariant failures por agent (7d)
SELECT agent_name, invariant_failure_reason, COUNT(*)
FROM agent_turn_logs
WHERE invariant_passed = false AND created_at > now() - interval '7 days'
GROUP BY 1, 2
ORDER BY 3 DESC LIMIT 20;

-- 3. Custo agregado por dia × agent (30d)
SELECT date_trunc('day', created_at) AS dia, agent_name, SUM(cost_usd)
FROM agent_turn_logs
WHERE created_at > now() - interval '30 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- 4. Latencia p50/p95 por agent
SELECT agent_name,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_total_ms) AS p50,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_total_ms) AS p95
FROM agent_turn_logs
WHERE created_at > now() - interval '7 days'
GROUP BY 1;
```
