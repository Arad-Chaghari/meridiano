import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../lib/sources/rss.mjs';

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Diario Demo</title>
<item><title><![CDATA[Sube el paro &amp; baja la inflación]]></title><link>https://demo.es/n/1?utm_source=rss</link>
<description><![CDATA[<p>Resumen con <b>etiquetas</b>.</p>]]></description><pubDate>Mon, 09 Nov 2026 07:30:00 GMT</pubDate>
<media:content url="https://demo.es/img/1.jpg" medium="image"/></item>
<item><title>Sin fecha válida</title><link>https://demo.es/n/2</link><pubDate>no</pubDate></item>
<item><title>Con enclosure</title><link>https://demo.es/n/3</link><pubDate>Mon, 09 Nov 2026 08:00:00 GMT</pubDate><enclosure url="https://demo.es/img/3.png" type="image/png"/></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Demo</title>
<entry><title>Entrada Atom</title><link rel="alternate" href="https://atom.es/e/1"/><updated>2026-11-09T06:00:00Z</updated><summary>Resumen atom</summary></entry></feed>`;

test('parseFeed lee RSS 2.0 con CDATA, imágenes y descarta entradas sin fecha', () => {
  const out = parseFeed(RSS);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'Sube el paro & baja la inflación');
  assert.equal(out[0].desc, 'Resumen con etiquetas .');
  assert.equal(out[0].src, 'Diario Demo');
  assert.equal(out[0].img, 'https://demo.es/img/1.jpg');
  assert.equal(out[1].img, 'https://demo.es/img/3.png');
  assert.equal(out[0].ts, '2026-11-09T07:30:00.000Z');
});

test('parseFeed lee Atom', () => {
  const out = parseFeed(ATOM, { name: 'Mi medio' });
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'https://atom.es/e/1');
  assert.equal(out[0].src, 'Mi medio');
  assert.equal(out[0].desc, 'Resumen atom');
});
