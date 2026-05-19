import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PortfolioIntentSchema,
  extractPortfolioIntent,
} from '../../../../functions/_lib/agent-runtime/contracts/portfolio-intent.js';

test('PortfolioIntentSchema aceita payload valido', () => {
  const ok = PortfolioIntentSchema.safeParse({
    estilo: 'fineline', max: 5, motivo: 'cliente pediu referencia',
  });
  assert.equal(ok.success, true);
});

test('PortfolioIntentSchema aceita estilo null', () => {
  const ok = PortfolioIntentSchema.safeParse({
    estilo: null, max: 3, motivo: 'cliente pediu qualquer',
  });
  assert.equal(ok.success, true);
});

test('PortfolioIntentSchema rejeita max=0', () => {
  const r = PortfolioIntentSchema.safeParse({ estilo: 'x', max: 0, motivo: 'x' });
  assert.equal(r.success, false);
});

test('PortfolioIntentSchema rejeita max=11', () => {
  const r = PortfolioIntentSchema.safeParse({ estilo: 'x', max: 11, motivo: 'x' });
  assert.equal(r.success, false);
});

test('PortfolioIntentSchema rejeita motivo vazio', () => {
  const r = PortfolioIntentSchema.safeParse({ estilo: 'x', max: 5, motivo: '' });
  assert.equal(r.success, false);
});

test('extractPortfolioIntent: proxima_acao !== enviar_portfolio retorna null', () => {
  const out = { proxima_acao: 'pergunta', payload_portfolio: null };
  assert.equal(extractPortfolioIntent(out, { portfolio_disponivel: true }), null);
});

test('extractPortfolioIntent: payload_portfolio null lanca erro', () => {
  const out = { proxima_acao: 'enviar_portfolio', payload_portfolio: null };
  assert.throws(
    () => extractPortfolioIntent(out, { portfolio_disponivel: true }),
    /payload_portfolio/,
  );
});

test('extractPortfolioIntent: portfolio_disponivel=false lanca erro', () => {
  const out = {
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: 'fineline', max: 3, motivo: 'x' },
  };
  assert.throws(
    () => extractPortfolioIntent(out, { portfolio_disponivel: false }),
    /portfolio_disponivel/,
  );
});

test('extractPortfolioIntent: shape invalido lanca ZodError', () => {
  const out = {
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: 'x', max: 99, motivo: 'y' },
  };
  assert.throws(() => extractPortfolioIntent(out, { portfolio_disponivel: true }));
});

test('extractPortfolioIntent: payload valido + ctx ok retorna payload parseado', () => {
  const out = {
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: 'fineline', max: 3, motivo: 'referencia' },
  };
  const payload = extractPortfolioIntent(out, { portfolio_disponivel: true });
  assert.equal(payload.estilo, 'fineline');
  assert.equal(payload.max, 3);
});
