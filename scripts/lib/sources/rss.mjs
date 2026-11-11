import { XMLParser } from 'fast-xml-parser';
import { cleanText, safeHttpsUrl, articleId } from '../util.mjs';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', trimValues: true });
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const txt = (x) => (x && typeof x === 'object' ? x['#text'] ?? x['__cdata'] ?? '' : x ?? '');

function linkOf(it) {
  const l = it.link;
  if (typeof l === 'string') return l;
  const links = arr(l);
  const alt = links.find((k) => k && (k['@_rel'] === 'alternate' || !k['@_rel'])) || links[0];
  return alt ? (typeof alt === 'string' ? alt : alt['@_href'] || txt(alt)) : txt(it.guid);
}

function imageOf(it) {
  const enc = arr(it.enclosure).find((e) => /^image\//.test(e?.['@_type'] || ''));
  const media = arr(it['media:content']).find((m) => m?.['@_url'] && (!m['@_medium'] || m['@_medium'] === 'image')) || arr(it['media:thumbnail'])[0];
  return enc?.['@_url'] || media?.['@_url'] || '';
}

/** Convierte un RSS 2.0, RSS 1.0 o Atom en artículos normalizados. */
export function parseFeed(xml, { name = '' } = {}) {
  const j = parser.parse(xml);
  const channel = j?.rss?.channel;
  const items = arr(channel?.item ?? j?.feed?.entry ?? j?.['rdf:RDF']?.item);
  const srcName = cleanText(name || txt(channel?.title) || txt(j?.feed?.title));
  const out = [];
  for (const it of items) {
    const title = cleanText(txt(it.title));
    const url = String(linkOf(it) || '').trim();
    const date = txt(it.pubDate) || txt(it.published) || txt(it.updated) || txt(it['dc:date']);
    const t = new Date(date);
    if (!title || !/^https?:\/\//i.test(url) || Number.isNaN(t.getTime())) continue;
    out.push({
      id: articleId(url, title),
      title,
      desc: cleanText(txt(it.description) || txt(it.summary) || txt(it['content:encoded'])).slice(0, 600),
      url,
      src: srcName,
      img: safeHttpsUrl(imageOf(it)),
      ts: t.toISOString(),
      lang: ''
    });
  }
  return out;
}

export async function fetchFeed(feed, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(feed.url, { headers: { 'user-agent': 'MeridianoBot/0.1', accept: 'application/rss+xml, application/atom+xml, text/xml' } });
  if (!res.ok) throw new Error(`RSS ${feed.url}: HTTP ${res.status}`);
  return parseFeed(await res.text(), { name: feed.name });
}
