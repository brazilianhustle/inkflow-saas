import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { toResponseFormat } from '../../../functions/_lib/agent-runtime/schema-to-json.js';

test('toResponseFormat: ZodObject puro retorna format type=json_schema strict', () => {
  const schema = z.object({ foo: z.string() });
  const fmt = toResponseFormat(schema, 'test_output');
  assert.equal(fmt.type, 'json_schema');
  assert.equal(fmt.name, 'test_output');
  assert.equal(fmt.strict, true);
  assert.ok(fmt.schema && typeof fmt.schema === 'object');
  assert.equal(fmt.schema.type, 'object');
});

test('toResponseFormat: discriminatedUnion gera anyOf no schema', () => {
  const A = z.object({ tag: z.literal('a'), x: z.string() });
  const B = z.object({ tag: z.literal('b'), y: z.number() });
  const schema = z.discriminatedUnion('tag', [A, B]);
  const fmt = toResponseFormat(schema, 'union_test');
  const json = fmt.schema;
  assert.ok(Array.isArray(json.anyOf) || Array.isArray(json.oneOf), 'tem anyOf ou oneOf');
});

test('toResponseFormat: schema com ZodEffects (.refine) lanca erro claro', () => {
  const schema = z.object({ foo: z.string() }).refine(v => v.foo.length > 0);
  assert.throws(
    () => toResponseFormat(schema, 'bad'),
    /ZodEffects|refine|nao suportado|json_schema/i,
  );
});

test('toResponseFormat: schema null/undefined lanca erro', () => {
  assert.throws(() => toResponseFormat(null, 'x'), /invalido|_def/i);
  assert.throws(() => toResponseFormat(undefined, 'x'), /invalido|_def/i);
});
