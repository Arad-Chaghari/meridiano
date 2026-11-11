import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { updateCountry, writeIndex, readJson } from '../lib/pipeline.mjs';

const country = { code: 'ES', nameEs: 'España' };
const NOW = new Date('2026-11-09T10:00:00Z');
const art = (n, hoursAgo, extra = {}) => ({
  id: 'id' + n, title: 'Titular ' + n, desc: '', url: 'https://x.com/' + n, src: 'x.com', img: '',
  ts: new Date(NOW.getTime() - hoursAgo * 3600e3).toISOString(), lang: 'Spanish', ...extra
});
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'meridiano-'));
const fakeClassify = (log) => async (xs) => { log.push(xs.map((x) => x.id)); return xs.map((a) => ({ ...a, k: a.title.includes('spam') ? [] : ['0.0'], t: 'T ' + a.title, s: '' })); };

test('guarda las noticias clasificadas y recuerda las descartadas', async () => {
  const out = tmp(), calls = [];
  const r = await updateCountry({ country, outDir: out, now: NOW, classify: fakeClassify(calls), articles: [art(1, 2), art(2, 3, { title: 'spam' }), art(3, 5)] });
  const f = readJson(path.join(out, 'news', 'ES.json'));
  assert.equal(r.added, 2);
  assert.deepEqual(f.items.map((i) => i.id), ['id1', 'id3']);       // ordenadas de la más reciente a la más antigua
  assert.deepEqual(f.rejected, ['id2']);
  assert.equal(f.items[0].t, 'T Titular 1');
  assert.equal(f.items[0].d, '2026-11-09');
  assert.equal(f.updatedAt, NOW.toISOString());
});

test('en la segunda ejecución no vuelve a clasificar lo ya conocido ni lo descartado', async () => {
  const out = tmp(), calls = [];
  const articles = [art(1, 2), art(2, 3, { title: 'spam' }), art(3, 5)];
  await updateCountry({ country, outDir: out, now: NOW, classify: fakeClassify(calls), articles });
  await updateCountry({ country, outDir: out, now: NOW, classify: fakeClassify(calls), articles: [...articles, art(4, 1)] });
  assert.deepEqual(calls[1], ['id4']);
  assert.equal(readJson(path.join(out, 'news', 'ES.json')).items.length, 3);
});

test('las noticias caducan pasadas las horas configuradas', async () => {
  const out = tmp(), calls = [];
  await updateCountry({ country, outDir: out, now: NOW, classify: fakeClassify(calls), articles: [art(1, 2), art(2, 70)] });
  const later = new Date(NOW.getTime() + 10 * 3600e3);
  await updateCountry({ country, outDir: out, now: later, classify: fakeClassify(calls), articles: [] });
  assert.deepEqual(readJson(path.join(out, 'news', 'ES.json')).items.map((i) => i.id), ['id1']);
});

test('un lote fallido no se marca como descartado y se reintenta en la siguiente ejecución', async () => {
  const out = tmp();
  const failing = async (xs) => xs.map((a) => ({ ...a, k: [], t: a.title, s: '', failed: true }));
  const r = await updateCountry({ country, outDir: out, now: NOW, classify: failing, articles: [art(1, 2)] });
  assert.equal(r.failed, 1);
  assert.deepEqual(readJson(path.join(out, 'news', 'ES.json')).rejected, []);
  const calls = [];
  await updateCountry({ country, outDir: out, now: NOW, classify: fakeClassify(calls), articles: [art(1, 2)] });
  assert.deepEqual(calls[0], ['id1']);
});

test('respeta el máximo de noticias por país y de artículos clasificados por ejecución', async () => {
  const out = tmp(), calls = [];
  const articles = Array.from({ length: 30 }, (_, i) => art(i + 1, i + 1));
  await updateCountry({ country, outDir: out, now: NOW, classify: fakeClassify(calls), articles, opts: { maxFetch: 10, maxItems: 5 } });
  assert.equal(calls[0].length, 10);
  assert.equal(readJson(path.join(out, 'news', 'ES.json')).items.length, 5);
});

test('writeIndex acumula países entre ejecuciones', () => {
  const out = tmp();
  writeIndex(out, [{ code: 'ES', total: 10 }], NOW);
  writeIndex(out, [{ code: 'FR', total: 4 }, { code: 'DE', error: 'x' }], NOW);
  const idx = readJson(path.join(out, 'index.json'));
  assert.deepEqual(Object.keys(idx.countries).sort(), ['ES', 'FR']);
  assert.equal(idx.countries.FR.n, 4);
});
