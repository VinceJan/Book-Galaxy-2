// Build public/data/books.json from v1 catalog + real obscurity signals.
import fs from 'node:fs';
const V1 = process.env.V1 || '/workspace/Book-Galaxy';
const cat = JSON.parse(fs.readFileSync(`${V1}/public/data/catalog.runtime.json`, 'utf8'));
const obs = JSON.parse(fs.readFileSync('scripts/raw/obscurity.raw.json', 'utf8'));
const pct = arr => { const s = [...arr].sort((a, b) => a - b); return x => { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; s[m] < x ? (lo = m + 1) : (hi = m); } return lo / s.length; }; };
const views = id => (obs.books[id].zhViews || 0) + (obs.books[id].enViews || 0);
const pV = pct(cat.books.map(b => Math.log1p(views(b.id)))), pS = pct(cat.books.map(b => obs.books[b.id].sitelinks));
const rel = {}; for (const r of cat.relations) (rel[r.source] ||= []).push(r);
const localCover = b => { for (const ext of ['jpg', 'png', 'webp']) { const p = `covers/${b.id}.${ext}`; if (fs.existsSync(`${V1}/public/${p}`)) { fs.mkdirSync('public/covers', { recursive: true }); fs.copyFileSync(`${V1}/public/${p}`, `public/${p}`); return p; } } return null; };
const books = cat.books.map(b => { const o = obs.books[b.id];
  const score = +(0.7 * (1 - pV(Math.log1p(views(b.id)))) + 0.3 * (1 - pS(o.sitelinks))).toFixed(4);
  return { id: b.id, title: b.title, author: b.author || null, year: b.year ?? null, country: b.country || null, language: b.language || null,
    originalTitle: b.originalTitle || null, summary: b.summary || '', hook: b.hook || '', themes: (b.themes || []).filter(t => t !== '文本叙事' && t !== '作品语境'),
    cover: localCover(b) || b.coverUrl || null, sourceUrl: b.sourceUrl, wikidataUrl: b.wikidataUrl,
    obscurity: { score, zhViews: o.zhViews, enViews: o.enViews, sitelinks: o.sitelinks },
    links: (rel[b.id] || []).sort((x, y) => y.weight - x.weight).slice(0, 6).map(r => ({ id: r.target, kind: r.kind, band: r.bandByBook?.[b.id] || null, sharedThemes: r.evidence?.sharedThemes || [], similarity: r.similarity })) }; });
const sorted = [...books].sort((a, b) => a.obscurity.score - b.obscurity.score); sorted.forEach((b, i) => (b.obscurity.percentile = +(i / (books.length - 1)).toFixed(3)));
fs.writeFileSync('public/data/books.json', JSON.stringify({ generatedAt: new Date().toISOString(), source: cat.source, obscuritySource: { method: obs.source, window: obs.window, fetchedAt: obs.fetchedAt, formula: 'score = 0.7*(1-pct(log1p(zhViews+enViews))) + 0.3*(1-pct(sitelinks))' }, books }));
console.log(books.length, 'covers local:', books.filter(b => b.cover?.startsWith('covers/')).length, 'remote:', books.filter(b => b.cover?.startsWith('http')).length);
const t = n => books.find(b => b.title === n); console.log(['西游记', '哈姆雷特'].map(n => [n, t(n)?.obscurity]));
console.log(sorted.slice(-3).map(b => [b.title, b.obscurity]));
