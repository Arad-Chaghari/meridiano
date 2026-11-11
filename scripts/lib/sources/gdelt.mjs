import { sleep, cleanText, parseSeenDate, safeHttpsUrl, articleId } from '../util.mjs';

const BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';
let lastCall = 0;

/** GDELT pide como máximo una petición cada ~5 s por IP. */
async function throttle(minGapMs, sleepImpl) {
  const wait = lastCall + minGapMs - Date.now();
  if (wait > 0) await sleepImpl(wait);
  lastCall = Date.now();
}

export function buildUrl(countryName, { timespan = '1d', max = 250 } = {}) {
  const q = encodeURIComponent(`sourcecountry:${countryName}`);
  return `${BASE}?query=${q}&mode=ArtList&format=json&maxrecords=${max}&sort=DateDesc&timespan=${timespan}`;
}

export function normalizeGdelt(json) {
  const list = Array.isArray(json?.articles) ? json.articles : [];
  const out = [];
  for (const a of list) {
    const title = cleanText(a.title);
    const url = typeof a.url === 'string' ? a.url : '';
    const ts = parseSeenDate(a.seendate);
    if (!title || !/^https?:\/\//i.test(url) || !ts) continue;
    out.push({
      id: articleId(url, title),
      title,
      desc: '',
      url,
      src: cleanText(a.domain || '').replace(/^www\./, ''),
      img: safeHttpsUrl(a.socialimage || ''),
      ts,
      lang: cleanText(a.language || '')
    });
  }
  return out;
}

/**
 * Pide a GDELT los artículos de medios de un país.
 * @returns {Promise<Article[]>}
 */
export async function fetchGdelt(countryName, opts = {}) {
  const { fetchImpl = fetch, minGapMs = 5500, retries = 5, sleepImpl = sleep, timespan = '1d', max = 250 } = opts;
  const url = buildUrl(countryName, { timespan, max });
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(minGapMs, sleepImpl);
    try {
      const res = await fetchImpl(url, { headers: { 'user-agent': 'MeridianoBot/0.1 (+noticias por pais)' } });
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`GDELT HTTP ${res.status}`), { retry: true });
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        // GDELT responde con texto plano cuando limita o la consulta no es válida
        if (/limit requests|try again/i.test(text)) throw Object.assign(new Error('GDELT limita las peticiones'), { retry: true });
        if (text.trim() === '') return []; // sin resultados
        throw new Error(`GDELT: ${text.slice(0, 160).replace(/\s+/g, ' ')}`);
      }
      return normalizeGdelt(json);
    } catch (e) {
      lastErr = e;
      if (!e.retry || attempt === retries) break;
      await sleepImpl(6000 * (attempt + 1));
    }
  }
  throw lastErr;
}
