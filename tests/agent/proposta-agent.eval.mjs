// tests/agent/proposta-agent.eval.mjs
// Eval suite PropostaAgent — 11 cenarios contra gpt-4o-mini real.
// NAO roda em CI (filename *.eval.mjs fora do glob *.test.mjs).
//
// Run: OPENAI_API_KEY=sk-... node --test tests/agent/proposta-agent.eval.mjs
// Custo estimado: ~$0.03 por suite completa.
//
// Pure structured-output agent (sem tools) — eval LLM real contra OpenAI.
// maxTurns 5 (sem tools, mini termina em 1-2 turns).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { run } from '@openai/agents';
import { setDefaultOpenAIKey } from '@openai/agents-openai';
import { buildPropostaAgent } from '../../functions/api/agent/agents/proposta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '_fixtures', 'scenarios-proposta.json');
const scenarios = JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8'));

if (!process.env.OPENAI_API_KEY) {
  test('proposta-agent eval skipped (no OPENAI_API_KEY)', { skip: true }, () => {});
} else {
  setDefaultOpenAIKey(process.env.OPENAI_API_KEY);

  // Normaliza historico no shape que @openai/agents espera (paridade route.js).
  // Assistant items requerem content como array tipado + status.
  function normalizeHistoryItem(h) {
    const role = h?.role || 'user';
    const content = h?.content ?? '';
    if (role === 'assistant') {
      return {
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: String(content) }],
      };
    }
    return { role: 'user', content: String(content) };
  }

  for (const sc of scenarios) {
    test(`${sc.id} — ${sc.descricao}`, async () => {
      const tenant = {
        id: 't-eval',
        nome_estudio: 'Estudio Eval',
        nome_agente: 'Atendente',
        config_precificacao: { sinal_percentual: 30 },
        config_agente: {},
        faqs: [],
        fewshots: [],
        fewshots_por_modo: {},
      };

      const conversa = {
        id: `conv-${sc.id}`,
        telefone: '5511999000001',
        estado_agente: sc.estado_atual,
        dados_cadastro: { nome: 'Cliente Eval' },
        dados_coletados: { decisao_desconto: sc.decisao_desconto ?? null },
        valor_proposto: sc.valor_proposto,
      };

      const clientContext = {
        valor_proposto: sc.valor_proposto,
        decisao_desconto: sc.decisao_desconto ?? null,
        horarios_livres: sc.horarios_livres || [],
        proposta_status: sc.proposta_status || null,
      };

      const { agent, validator } = buildPropostaAgent({
        env: {},
        tenant,
        conversa,
        clientContext,
        estado_atual: sc.estado_atual,
      });

      const messages = [
        ...(sc.historico || []).map(normalizeHistoryItem),
        { role: 'user', content: sc.mensagem },
      ];

      const result = await run(agent, messages, { maxTurns: 5 });
      const out = result.finalOutput;

      assert.ok(out, `${sc.id}: agent retornou null/undefined`);

      const inv = validator(out);
      assert.equal(inv.valid, true, `${sc.id}: invariant violation: ${inv.reason || ''}`);

      for (const a of sc.assertions) {
        if (a.type === 'proxima_acao_equals') {
          assert.equal(
            out.proxima_acao,
            a.value,
            `${sc.id}/proxima_acao: esperado=${a.value} got=${out.proxima_acao}`,
          );
        } else if (a.type === 'payload_includes') {
          for (const [k, v] of Object.entries(a.value)) {
            assert.equal(
              out[k],
              v,
              `${sc.id}/${k}: esperado=${v} got=${out[k]}`,
            );
          }
        } else if (a.type === 'resposta_cliente_matches') {
          assert.match(
            out.resposta_cliente,
            new RegExp(a.value, 'i'),
            `${sc.id}/regex: pattern=${a.value} resposta="${out.resposta_cliente}"`,
          );
        } else if (a.type === 'resposta_cliente_contains_slots') {
          const lower = (out.resposta_cliente || '').toLowerCase();
          for (const term of a.value) {
            assert.ok(
              lower.includes(term.toLowerCase()),
              `${sc.id}: faltou "${term}" em "${out.resposta_cliente}"`,
            );
          }
        }
      }
    });
  }
}
