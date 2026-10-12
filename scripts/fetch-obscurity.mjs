// Fetch real obscurity signals: Wikidata sitelink count + 12-month zh/en Wikipedia pageviews.
import fs from 'node:fs';
const UA = 'BookGalaxy2/0.1 (https://github.com/VinceJan/Book-Galaxy-2)';
const cat = JSON.parse(fs.readFileSync('/workspace/Book-Galaxy/public/data/catalog.runtime.json','utf8'));
const ids = cat.books.map(b => b.id);
const START = process.env.PV_START || '20251001', END = process.env.PV_END || '20260930';
const get = async (u, tries = 4) => { for (let i = 0; i < tries; i++) { const r = await fetch(u, { headers: { 'User-Agent': UA } }); if (r.ok) return r.json(); if (r.status === 404) return null; await new Promise(s => setTimeout(s, 800 * (i + 1))); } return null; };
const site = {};
for (let i = 0; i < ids.length; i += 50) {
  const j = await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&ids=${ids.slice(i, i + 50).join('|')}`);
  for (const [id, e] of Object.entries(j?.entities || {})) { const s = e.sitelinks || {}; site[id] = { sitelinks: Object.keys(s).filter(k => k.endsWith('wiki') && !['commonswiki','specieswiki','metawiki'].includes(k)).length, zh: s.zhwiki?.title, en: s.enwiki?.title }; }
}
const pv = async (proj, t) => { if (!t) return 0; const j = await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${proj}/all-access/user/${encodeURIComponent(t.replace(/ /g, '_'))}/monthly/${START}/${END}`); return (j?.items || []).reduce((a, x) => a + x.views, 0); };
const out = {}; let k = 0;
const queue = [...ids];
await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) { const id = queue.shift(); const s = site[id] || { sitelinks: 0 };
  const [zh, en] = await Promise.all([pv('zh.wikipedia', s.zh), pv('en.wikipedia', s.en)]);
  out[id] = { sitelinks: s.sitelinks, zhViews: zh, enViews: en, zhTitle: s.zh || null, enTitle: s.en || null }; if (++k % 100 === 0) console.log(k); } }));
fs.writeFileSync('scripts/raw/obscurity.raw.json', JSON.stringify({ source: 'Wikimedia REST pageviews API (user agent, all-access, monthly) + Wikidata sitelinks', window: [START, END], fetchedAt: new Date().toISOString(), books: out }, null, 0));
console.log('done', Object.keys(out).length);
