#!/usr/bin/env node
// Actualiza las noticias de cada país: busca → clasifica y traduce con Claude → guarda JSON para la web.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { fetchGdelt } from './lib/sources/gdelt.mjs';
import { fetchFeed } from './lib/sources/rss.mjs';
import { makeClassifier, DEFAULT_MODEL } from './lib/classify.mjs';
import { updateCountry, writeIndex, readJson } from './lib/pipeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const a = { countries: null, out: path.join(ROOT, 'site', 'data'), timespan: '1d', dryRun: false, limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--countries') a.countries = argv[++i].split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    else if (k === '--out') a.out = path.resolve(argv[++i]);
    else if (k === '--timespan') a.timespan = argv[++i];
    else if (k === '--limit') a.limit = Number(argv[++i]);
    else if (k === '--dry-run') a.dryRun = true;
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (m) => console.log(m);
  const topics = readJson(path.join(ROOT, 'config', 'topics.json'), []);
  let countries = readJson(path.join(ROOT, 'config', 'countries.json'), []);
  const names = readJson(path.join(ROOT, 'config', 'gdelt-names.json'), {});
  const feeds = readJson(path.join(ROOT, 'config', 'feeds.json'), {});

  if (args.countries) countries = countries.filter((c) => args.countries.includes(c.code));
  else countries = countries.filter((c) => names[c.code] !== null); // el «probe» marcó null los países sin resultados
  countries = countries.slice(0, args.limit);
  if (!countries.length) throw new Error('No hay países que actualizar.');

  if (!args.dryRun && !process.env.ANTHROPIC_API_KEY) throw new Error('Falta la variable ANTHROPIC_API_KEY.');
  const client = args.dryRun ? null : new Anthropic({ maxRetries: 4 });
  const classify = args.dryRun
    ? async (xs) => xs.map((a) => ({ ...a, k: ['0.0'], t: a.title, s: '' }))
    : makeClassifier({ client, model: DEFAULT_MODEL, topics, log });

  log(`Meridiano · ${countries.length} países · modelo ${DEFAULT_MODEL}${args.dryRun ? ' · SIMULACIÓN (sin llamar a Claude)' : ''}`);
  const results = [];
  const pending = new Set();
  const now = new Date();

  for (const country of countries) {
    const gname = names[country.code]?.name || country.gdelt[0];
    let articles = [];
    let sourceError = null;
    try {
      articles = await fetchGdelt(gname, { timespan: args.timespan });
    } catch (e) {
      sourceError = e;
    }
    for (const f of feeds[country.code] || []) {
      try { articles.push(...(await fetchFeed(f))); } catch (e) { log(`  ⚠ ${country.code} RSS ${f.url}: ${e.message}`); }
    }
    if (sourceError && !articles.length) {
      log(`  ✗ ${country.code}: ${sourceError.message} (se conservan las noticias anteriores)`);
      results.push({ code: country.code, error: sourceError.message });
      continue;
    }
    const task = updateCountry({ country, articles, classify, outDir: args.out, now, log })
      .then((r) => results.push(r))
      .catch((e) => { log(`  ✗ ${country.code}: ${e.message}`); results.push({ code: country.code, error: e.message }); })
      .finally(() => pending.delete(task));
    pending.add(task);
    if (pending.size >= 3) await Promise.race(pending);
  }
  await Promise.all(pending);

  writeIndex(args.out, results, now);

  const ok = results.filter((r) => !r.error);
  const bad = results.filter((r) => r.error);
  const u = classify.usage || { input: 0, output: 0, calls: 0 };
  const priceIn = Number(process.env.PRICE_IN_PER_MTOK ?? 0.10);
  const priceOut = Number(process.env.PRICE_OUT_PER_MTOK ?? 0.50);
  const cost = (u.input * priceIn + u.output * priceOut) / 1e6;
  const summary = [
    `### Actualización de noticias`,
    `- Países actualizados: **${ok.length}** · con error: **${bad.length}**`,
    `- Noticias nuevas añadidas: **${ok.reduce((s, r) => s + (r.added || 0), 0)}**`,
    `- Llamadas a Claude: ${u.calls} · tokens entrada/salida: ${u.input}/${u.output} · coste estimado: ~$${cost.toFixed(2)}`,
    bad.length ? `- Errores: ${bad.map((r) => `${r.code} (${r.error})`).join('; ')}` : ''
  ].filter(Boolean).join('\n');
  console.log('\n' + summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  if (!ok.length) process.exit(1);
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
