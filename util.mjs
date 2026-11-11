import { createHash } from 'node:crypto';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TRACKING = /^(utm_|fbclid|gclid|mc_|cmpid|ocid|xtor|at_|ref$|ref_$)/i;

/** URL canónica (sin rastreadores ni #fragmento) para generar identificadores estables. */
export function canonicalUrl(raw) {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return null;
  }
}

/** Identificador corto y estable de una noticia (sirve también para sus debates). */
export function articleId(url, title = '') {
  const base = canonicalUrl(url) || `title:${title}`;
  return createHash('sha1').update(base).digest('hex').slice(0, 16);
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function cleanText(s) {
  if (s == null) return '';
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
      }
      return ENT[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Título normalizado para detectar duplicados (mismo titular en distinto medio o URL). */
export const normTitle = (t) =>
  cleanText(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Ejecuta fn sobre cada elemento con un máximo de `n` tareas a la vez. */
export async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return out;
}

export const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/** '20261109T120000Z' -> '2026-11-09T12:00:00.000Z' */
export function parseSeenDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(s || ''));
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
}

export function safeHttpsUrl(u, max = 600) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && String(u).length <= max ? x.toString() : '';
  } catch {
    return '';
  }
}

/** Quita duplicados por id y por titular normalizado, conservando el primero. */
export function dedupe(articles) {
  const ids = new Set();
  const titles = new Set();
  const out = [];
  for (const a of articles) {
    const nt = normTitle(a.title);
    if (ids.has(a.id) || titles.has(nt)) continue;
    ids.add(a.id);
    titles.add(nt);
    out.push(a);
  }
  return out;
}
