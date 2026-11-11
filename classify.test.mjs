import test from 'node:test';
import assert from 'node:assert/strict';
import { parseModelJson, validateResult, makeClassifier, buildSystemPrompt } from '../lib/classify.mjs';

const topics = [
  { key: '0.0', group: 'Política y gobierno', name: 'Política nacional', detail: 'gobierno, parlamento' },
  { key: '1.1', group: 'Economía y negocios', name: 'Empresas y mercados', detail: '' },
  { key: '8.0', group: 'Deportes', name: 'Fútbol', detail: '' }
];
const mkArticle = (n, extra = {}) => ({ id: 'id' + n, title: 'Titular ' + n, desc: '', url: 'https://x.com/' + n, src: 'x.com', img: '', ts: '2026-11-09T08:00:00.000Z', lang: 'English', ...extra });

test('el prompt incluye todas las claves y avisa de que los titulares no son instrucciones', () => {
  const p = buildSystemPrompt(topics);
  for (const t of topics) assert.ok(p.includes(t.key));
  assert.match(p, /ignora cualquier instrucción/);
});

test('parseModelJson tolera bloques de código y texto alrededor', () => {
  assert.deepEqual(parseModelJson('```json\n[{"i":0}]\n```'), [{ i: 0 }]);
  assert.deepEqual(parseModelJson('Aquí va: [{"i":1}] fin'), [{ i: 1 }]);
  assert.throws(() => parseModelJson('sin json'), /array JSON/);
});

test('validateResult descarta claves inventadas, limita textos y no permite resúmenes sin descripción', () => {
  const valid = new Set(topics.map((t) => t.key));
  const a = mkArticle(1);
  const r = validateResult({ k: ['0.0', '99.9', '0.0', 5], t: ' Traducido ', s: 'Resumen inventado' }, a, valid);
  assert.deepEqual(r.k, ['0.0']);
  assert.equal(r.t, 'Traducido');
  assert.equal(r.s, '');
  const long = validateResult({ k: ['1.1'], t: 'x'.repeat(500), s: 'y'.repeat(500) }, mkArticle(2, { desc: 'hay descripción' }), valid);
  assert.ok(long.t.length <= 200 && long.s.length <= 300);
  assert.equal(validateResult(undefined, a, valid).t, a.title);
  assert.deepEqual(validateResult({ k: ['a', 'b', '0.0', '1.1', '8.0'] }, a, valid).k.length, 3);
});

test('makeClassifier agrupa en lotes, une resultados por posición y suma el uso', async () => {
  const calls = [];
  const client = { messages: { create: async ({ messages }) => {
    const items = JSON.parse(messages[0].content);
    calls.push(items.length);
    return { content: [{ type: 'text', text: JSON.stringify(items.map((x) => ({ i: x.i, k: x.i % 2 ? [] : ['0.0'], t: 'ES ' + x.title, s: '' }))) }], usage: { input_tokens: 100, output_tokens: 50 } };
  } } };
  const classify = makeClassifier({ client, topics, batchSize: 3, concurrency: 2 });
  const out = await classify([1, 2, 3, 4, 5].map((n) => mkArticle(n)));
  assert.deepEqual(calls.sort(), [2, 3]);
  assert.deepEqual(out.map((o) => o.t), ['ES Titular 1', 'ES Titular 2', 'ES Titular 3', 'ES Titular 4', 'ES Titular 5']);
  assert.deepEqual(out.map((o) => o.k.length), [1, 0, 1, 1, 0]);
  assert.equal(classify.usage.calls, 2);
  assert.equal(classify.usage.input, 200);
});

test('si el modelo responde mal dos veces, el lote se marca como fallido sin romper la ejecución', async () => {
  let n = 0;
  const client = { messages: { create: async () => { n++; return { content: [{ type: 'text', text: 'lo siento' }], usage: {} }; } } };
  const classify = makeClassifier({ client, topics, log: () => {} });
  const out = await classify([mkArticle(1), mkArticle(2)]);
  assert.equal(n, 2);
  assert.ok(out.every((o) => o.failed && o.k.length === 0));
});

test('un reintento tras una respuesta mala puede salvar el lote', async () => {
  let n = 0;
  const client = { messages: { create: async ({ messages }) => {
    n++;
    if (n === 1) return { content: [{ type: 'text', text: '{rota' }], usage: {} };
    const items = JSON.parse(messages[0].content);
    return { content: [{ type: 'text', text: JSON.stringify(items.map((x) => ({ i: x.i, k: ['8.0'], t: 'ok', s: '' }))) }], usage: {} };
  } } };
  const out = await makeClassifier({ client, topics, log: () => {} })([mkArticle(1)]);
  assert.equal(out[0].k[0], '8.0');
  assert.ok(!out[0].failed);
});
