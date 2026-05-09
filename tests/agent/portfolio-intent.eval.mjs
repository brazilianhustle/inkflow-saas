// tests/agent/portfolio-intent.eval.mjs
// Eval suite intent transversal enviar_portfolio — 9 cenarios contra gpt-4o-mini real.
// Cobre 3 agents (tattoo/cadastro/proposta) x 3 caminhos (com estilo / sem estilo / portfolio vazio).
// NAO roda em CI (filename *.eval.mjs fora do glob *.test.mjs).
//
// Run: OPENAI_API_KEY=sk-... node --test tests/agent/portfolio-intent.eval.mjs
// Custo estimado: ~$0.005 por suite completa (gpt-4o-mini, 9 turns ~1.5k tokens cada).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { run } from '@openai/agents';
import { setDefaultOpenAIKey } from '@openai/agents-openai';
import { buildTattooAgent } from '../../functions/api/agent/agents/tattoo.js';
import { buildCadastroAgent } from '../../functions/api/agent/agents/cadastro.js';
import { buildPropostaAgent } from '../../functions/api/agent/agents/proposta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '_fixtures', 'scenarios-portfolio.json');
const scenarios = JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8'));

if (!process.env.OPENAI_API_KEY) {
  test('portfolio-intent eval skipped (no OPENAI_API_KEY)', { skip: true }, () => {});
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

  const BUILDERS = {
    tattoo: buildTattooAgent,
    cadastro: buildCadastroAgent,
    proposta: buildPropostaAgent,
  };

  for (const sc of scenarios) {
    test(`${sc.id} — ${sc.descricao}`, async () => {
      const tenant = {
        id: 't-eval',
        nome_estudio: 'Estudio Eval',
        nome_agente: 'Atendente',
        config_precificacao: { sinal_percentual: 30 },
        config_agente: {},
        gatilhos_handoff: [],
        faqs: [],
        fewshots: [],
        fewshots_por_modo: {},
        // Stub portfolio_urls — helper deriva boolean do tamanho.
        // portfolio_disponivel vai pro clientContext separadamente.
        portfolio_urls: sc.portfolio_disponivel
          ? [
              'https://e.com/blackwork-1.jpg',
              'https://e.com/fineline-1.jpg',
              'https://e.com/fineline-2.jpg',
            ]
          : [],
      };

      const conversa = {
        id: `conv-${sc.id}`,
        telefone: '5511999000099',
        estado_agente: sc.estado_atual,
        dados_cadastro: { nome: 'Cliente Eval' },
        dados_coletados: sc.dados_acumulados || {},
        valor_proposto: sc.valor_proposto || null,
      };

      const clientContext = {
        portfolio_disponivel: sc.portfolio_disponivel,
        // pra proposta:
        valor_proposto: sc.valor_proposto || null,
        decisao_desconto: null,
        horarios_livres: sc.horarios_livres || [],
        proposta_status: sc.proposta_status || null,
      };

      const builder = BUILDERS[sc.agent];
      const builderArgs = { env: {}, tenant, conversa, clientContext };
      if (sc.agent === 'proposta') builderArgs.estado_atual = sc.estado_atual;
      const { agent, validator } = builder(builderArgs);

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
        } else if (a.type === 'payload_portfolio_estilo_equals') {
          assert.equal(
            out.payload_portfolio?.estilo?.toLowerCase(),
            a.value.toLowerCase(),
            `${sc.id}/estilo: esperado=${a.value} got=${out.payload_portfolio?.estilo}`,
          );
        } else if (a.type === 'payload_portfolio_estilo_null') {
          assert.equal(
            out.payload_portfolio?.estilo ?? null,
            null,
            `${sc.id}/estilo deveria ser null, got=${out.payload_portfolio?.estilo}`,
          );
        } else if (a.type === 'resposta_cliente_matches') {
          assert.match(
            out.resposta_cliente,
            new RegExp(a.value, 'i'),
            `${sc.id}/regex: pattern=${a.value} resposta="${out.resposta_cliente}"`,
          );
        }
      }
    });
  }
}
