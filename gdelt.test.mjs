import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchGdelt, normalizeGdelt, buildUrl } from '../lib/sources/gdelt.mjs';

const sample = {
  articles: [
    { url: 'https://www.elpais.com/politica/a?utm_source=x', title: 'El Congreso vota &amp; aprueba', seendate: '20261109T081500Z', socialimage: 'https://img.elpais.com/a.jpg', domain: 'www.elpais.com', language: 'Spanish', sourcecountry: 'Spain' },
    { url: 'ftp://malo.com/x', title: 'URL no válida', seendate: '20261109T081500Z' },
    { url: 'https://x.com/sin-fecha', title: 'Sin fecha', seendate: 'ayer' },
    { url: 'https://x.com/http-img', title: 'Imagen insegura', seendate: '20261109T090000Z', socialimage: 'http://x.com/i.jpg', domain: 'x.com', language: 'English' }
  ]
};
const res = (body, status = 200) => ({ status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const fast = { minGapMs: 0, sleepImpl: async () => {} };

test('buildUrl usa sourcecountry y la ventana pedida', () => {
  const u = buildUrl('spain', { timespan: '1d', max: 50 });
  assert.match(u, /query=sourcecountry%3Aspain/);
  assert.match(u, /timespan=1d/);
  assert.match(u, /maxrecords=50/);
});

test('normalizeGdelt filtra entradas inválidas y limpia campos', () => {
  const out = normalizeGdelt(sample);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'El Congreso vota & aprueba');
  assert.equal(out[0].src, 'elpais.com');
  assert.equal(out[0].img, 'https://img.elpais.com/a.jpg');
  assert.equal(out[0].ts, '2026-11-09T08:15:00.000Z');
  assert.equal(out[1].img, ''); // las imágenes http se descartan
  assert.equal(normalizeGdelt({}).length, 0);
});

test('fetchGdelt devuelve artículos', async () => {
  const arts = await fetchGdelt('spain', { ...fast, fetchImpl: async () => res(sample) });
  assert.equal(arts.length, 2);
});

test('fetchGdelt reintenta cuando GDELT limita las peticiones', async () => {
  let calls = 0;
  const arts = await fetchGdelt('spain', {
    ...fast,
    fetchImpl: async () => (++calls < 3 ? res('Please limit requests to one every 5 seconds.') : res(sample))
  });
  assert.equal(calls, 3);
  assert.equal(arts.length, 2);
});

test('fetchGdelt trata una respuesta vacía como sin resultados y un error de consulta como fallo', async () => {
  assert.deepEqual(await fetchGdelt('x', { ...fast, fetchImpl: async () => res('') }), []);
  await assert.rejects(fetchGdelt('x', { ...fast, fetchImpl: async () => res('Invalid/Unsupported Country') }), /Invalid\/Unsupported/);
});

test('fetchGdelt se rinde tras agotar los reintentos', async () => {
  let calls = 0;
  await assert.rejects(fetchGdelt('x', { ...fast, retries: 2, fetchImpl: async () => { calls++; return res('x', 503); } }), /HTTP 503/);
  assert.equal(calls, 3);
});
