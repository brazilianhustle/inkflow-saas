// tests/agent/proposta-agent.eval.mjs
// Eval suite PropostaAgent — 11 cenarios contra gpt-4o-mini real.
// Migrado Fase 2B: path novo (runPropostaAgent + 3 schemas strict + contract).
//
// Run: OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) \
//      node --test tests/agent/proposta-agent.eval.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runPropostaAgent } from '../../functions/api/agent/agents/proposta.js';
import { validateAction } from '../../functions/api/agent/router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '_fixtures', 'scenarios-proposta.json');
const scenarios = JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8'));

if (!process.env.OPENAI_API_KEY) {
  test('proposta-agent eval skipped (no OPENAI_API_KEY)', { skip: true }, () => {});
} else {
  for (const sc of scenarios) {
    test(`${sc.id} — ${sc.descricao}`, async () => {
      const tenant = {
        id: 't-eval', nome_estudio: 'Estudio Eval', nome_agente: 'Atendente',
        config_precificacao: { sinal_percentual: 30 },
        config_agente: {}, faqs: [], fewshots: [], fewshots_por_modo: {},
      };
      const conversa = {
        id: `conv-${sc.id}`, telefone: '5511999000001',
        estado_agente: sc.estado_atual,
        dados_cadastro: { nome: 'Cliente Eval' },
        dados_coletados: { decisao_desconto: sc.decisao_desconto ?? null },
        valor_proposto: sc.valor_proposto,
      };
      const clientContext = {
        valor_proposto: sc.valor_proposto,
        decisao_desconto: sc.decisao_desconto ?? null,
        horarios_livres: sc.horarios_livres || [],
        slots_reservados: sc.slots_reservados || [],
        proposta_status: sc.proposta_status || null,
        portfolio_disponivel: sc.portfolio_disponivel ?? false,
      };

      const out = await runPropostaAgent({
        env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
        tenant, conversa, clientContext,
        mensagem: sc.mensagem,
        historico: sc.historico || [],
        estado_atual: sc.estado_atual,
      });
      assert.ok(out, `${sc.id}: agent retornou null/undefined`);

      // Contract: invariantes context-dependent (slot em ctx, valor<=proposto).
      // Para acoes sem contrato (pergunta/oferecendo/erro/etc), validateAction
      // retorna null sem throw — esses passam por padrao.
      let contractOk = true;
      let contractReason = null;
      try {
        validateAction(sc.estado_atual, out, clientContext);
      } catch (e) {
        contractOk = false;
        contractReason = e.message;
      }
      assert.equal(contractOk, true, `${sc.id}: contract violation: ${contractReason || ''}`);

      for (const a of sc.assertions) {
        if (a.type === 'proxima_acao_equals') {
          assert.equal(out.proxima_acao, a.value,
            `${sc.id}/proxima_acao: esperado=${a.value} got=${out.proxima_acao}`);
        } else if (a.type === 'payload_includes') {
          for (const [k, v] of Object.entries(a.value)) {
            assert.equal(out[k], v, `${sc.id}/${k}: esperado=${v} got=${out[k]}`);
          }
        } else if (a.type === 'resposta_cliente_matches') {
          assert.match(out.resposta_cliente, new RegExp(a.value, 'i'),
            `${sc.id}/regex: pattern=${a.value} resposta="${out.resposta_cliente}"`);
        } else if (a.type === 'resposta_cliente_contains_slots') {
          const lower = (out.resposta_cliente || '').toLowerCase();
          for (const term of a.value) {
            assert.ok(lower.includes(term.toLowerCase()),
              `${sc.id}: faltou "${term}" em "${out.resposta_cliente}"`);
          }
        }
      }
    });
  }
}
