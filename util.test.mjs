import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, articleId, cleanText, normTitle, dedupe, parseSeenDate, safeHttpsUrl, mapLimit, chunk } from '../lib/util.mjs';

test('canonicalUrl quita rastreadores, www, # y barra final', () => {
  assert.equal(canonicalUrl('https://www.Ejemplo.com/a/b/?utm_source=x&id=3&fbclid=z#frag'), 'https://ejemplo.com/a/b?id=3');
  assert.equal(canonicalUrl('javascript:alert(1)'), null);
  assert.equal(canonicalUrl('no es url'), null);
});

test('articleId es estable ante rastreadores y distinto entre noticias', () => {
  const a = articleId('https://ejemplo.com/x?utm_campaign=1');
  const b = articleId('https://www.ejemplo.com/x/');
  assert.equal(a, b);
  assert.notEqual(a, articleId('https://ejemplo.com/y'));
  assert.equal(a.length, 16);
});

test('cleanText decodifica entidades y quita etiquetas', () => {
  assert.equal(cleanText('<p>Se&ntilde; &amp; &#233;l &quot;dijo&quot;</p>'), 'Se&ntilde; & él "dijo"');
  assert.equal(cleanText('  a \n  b  '), 'a b');
  assert.equal(cleanText(null), '');
});

test('dedupe elimina el mismo titular aunque cambie la URL', () => {
  const xs = [
    { id: '1', title: 'El Gobierno aprueba el decreto' },
    { id: '2', title: 'El gobierno aprueba el decreto.' },
    { id: '3', title: 'Otra noticia distinta' },
    { id: '1', title: 'Repetida por id' }
  ];
  assert.deepEqual(dedupe(xs).map((x) => x.id), ['1', '3']);
  assert.equal(normTitle('¡Última hora: Ñandú!'), 'ultima hora nandu');
});

test('parseSeenDate y safeHttpsUrl', () => {
  assert.equal(parseSeenDate('20261109T120000Z'), '2026-11-09T12:00:00.000Z');
  assert.equal(parseSeenDate('basura'), null);
  assert.equal(safeHttpsUrl('http://x.com/a.jpg'), '');
  assert.equal(safeHttpsUrl('https://x.com/a.jpg'), 'https://x.com/a.jpg');
});

test('mapLimit respeta el máximo de tareas simultáneas y el orden', async () => {
  let running = 0, peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (x) => {
    running++; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running--; return x * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12]);
  assert.ok(peak <= 2);
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
