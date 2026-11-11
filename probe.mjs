#!/usr/bin/env node
// Averigua, una sola vez, con qué nombre entiende GDELT cada país, y guarda config/gdelt-names.json.
// Los países sin resultados se marcan con null (el actualizador los salta; se puede repetir cuando se quiera).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchGdelt } from './lib/sources/gdelt.mjs';
import { readJson } from './lib/pipeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(ROOT, 'config', 'gdelt-names.json');
const args = process.argv.slice(2);
const only = args.includes('--countries') ? args[args.indexOf('--countries') + 1].split(',').map((s) => s.toUpperCase()) : null;
const timespan = args.includes('--timespan') ? args[args.indexOf('--timespan') + 1] : '3d';

const countries = readJson(path.join(ROOT, 'config', 'countries.json'), []).filter((c) => !only || only.includes(c.code));
const names = readJson(file, {});
const save = () => fs.writeFileSync(file, JSON.stringify(names, null, 1));

let n = 0;
for (const c of countries) {
  const candidates = [...new Set([names[c.code]?.name, ...c.gdelt].filter(Boolean))].slice(0, 4);
  let found = null;
  for (const name of candidates) {
    try {
      const arts = await fetchGdelt(name, { timespan, max: 10 });
      if (arts.length) { found = { name, sample: arts.length }; break; }
    } catch (e) {
      // nombre no válido para GDELT: se prueba el siguiente
    }
  }
  names[c.code] = found;
  console.log(`${found ? '✓' : '✗'} ${c.code} ${c.nameEs}${found ? ` → ${found.name}` : ' (sin resultados)'}`);
  if (++n % 10 === 0) save();
}
save();
const miss = Object.entries(names).filter(([, v]) => v === null).map(([k]) => k);
console.log(`\nResueltos: ${Object.values(names).filter(Boolean).length} · sin resultados: ${miss.length}${miss.length ? ' → ' + miss.join(', ') : ''}`);
