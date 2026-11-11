import fs from 'node:fs';
import path from 'node:path';
import { dedupe } from './util.mjs';

export const DEFAULTS = {
  keepHours: 72,        // cuánto tiempo se conserva una noticia en la web
  maxItems: 150,        // máximo de noticias guardadas por país
  maxFetch: 120,        // máximo de artículos nuevos que se clasifican por país y ejecución
  maxRejected: 400      // ids descartados que se recuerdan para no volver a pagarlos
};

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

/** Formato que lee la web: campos cortos para ocupar poco. */
export function toItem(a) {
  return { id: a.id, t: a.t, s: a.s || '', src: a.src, u: a.url, img: a.img || '', d: a.ts.slice(0, 10), ts: a.ts, k: a.k, lang: a.lang || '' };
}

/**
 * Actualiza el archivo de un país.
 * - Reutiliza lo ya clasificado en ejecuciones anteriores (no se vuelve a pagar).
 * - Si la fuente falla, conserva las noticias anteriores hasta que caduquen.
 */
export async function updateCountry({ country, articles, classify, outDir, now = new Date(), opts = {}, log = () => {} }) {
  const o = { ...DEFAULTS, ...opts };
  const file = path.join(outDir, 'news', `${country.code}.json`);
  const prev = readJson(file, { items: [], rejected: [] });
  const known = new Set(prev.items.map((i) => i.id));
  const rejected = new Set(prev.rejected || []);

  const fresh = dedupe([...articles].sort((a, b) => b.ts.localeCompare(a.ts)));
  const toClassify = fresh.filter((a) => !known.has(a.id) && !rejected.has(a.id)).slice(0, o.maxFetch);
  const classified = toClassify.length ? await classify(toClassify) : [];

  const kept = classified.filter((c) => c.k.length);
  const failedIds = new Set(classified.filter((c) => c.failed).map((c) => c.id));
  const newRejected = classified.filter((c) => !c.k.length && !c.failed).map((c) => c.id);

  const cutoff = now.getTime() - o.keepHours * 3600 * 1000;
  const merged = new Map();
  for (const it of [...prev.items, ...kept.map(toItem)]) {
    if (new Date(it.ts).getTime() >= cutoff) merged.set(it.id, it);
  }
  const items = [...merged.values()].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, o.maxItems);
  const rej = [...new Set([...newRejected, ...(prev.rejected || [])])].slice(0, o.maxRejected);

  writeJsonAtomic(file, { country: country.code, updatedAt: now.toISOString(), items, rejected: rej });
  log(`  ${country.code}: ${fresh.length} recibidas · ${toClassify.length} nuevas · ${kept.length} añadidas · ${items.length} en total`);
  return { code: country.code, total: items.length, added: kept.length, classified: toClassify.length, failed: failedIds.size };
}

export function writeIndex(outDir, results, now = new Date()) {
  const file = path.join(outDir, 'index.json');
  const prev = readJson(file, { countries: {} });
  const countries = { ...prev.countries };
  for (const r of results) if (r.total !== undefined) countries[r.code] = { n: r.total, updatedAt: now.toISOString() };
  writeJsonAtomic(file, { updatedAt: now.toISOString(), source: 'GDELT Project', countries });
}
