// Build public/data/books.json from v1 catalog + real obscurity signals.
import fs from 'node:fs';
const V1 = process.env.V1 || '/workspace/Book-Galaxy';
const cat = JSON.parse(fs.readFileSync(`${V1}/public/data/catalog.runtime.json`, 'utf8'));
const obs = JSON.parse(fs.readFileSync('scripts/raw/obscurity.raw.json', 'utf8'));
const pct = arr => { const s = [...arr].sort((a, b) => a - b); return x => { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; s[m] < x ? (lo = m + 1) : (hi = m); } return lo / s.length; }; };
const views = id => (obs.books[id].zhViews || 0) + (obs.books[id].enViews || 0);
const pV = pct(cat.books.map(b => Math.log1p(views(b.id)))), pS = pct(cat.books.map(b => obs.books[b.id].sitelinks));
const rel = {}; for (const r of cat.relations) (rel[r.source] ||= []).push(r);
// Canonical data package (book-galaxy-data): better metadata, meaningful themes, aliases, verbatim descriptions, covers, strong written relations.
const PKG = process.env.BG_PKG || '/workspace/book-galaxy-data';
const pkg = Object.fromEntries(JSON.parse(fs.readFileSync(`${PKG}/dist/books.json`, 'utf8')).books.map(b => [b.id, b]));
const pkgMeta = JSON.parse(fs.readFileSync(`${PKG}/dist/books.json`, 'utf8')).meta;
const covers = fs.existsSync('scripts/raw/covers.index.json') ? JSON.parse(fs.readFileSync('scripts/raw/covers.index.json', 'utf8')).covers : {};
const reject = fs.existsSync('scripts/raw/covers.reject.json') ? JSON.parse(fs.readFileSync('scripts/raw/covers.reject.json', 'utf8')) : {};
for (const id of Object.keys(reject)) delete covers[id]; // illegible (near-black, no detail) → title placeholder
const strong = {}; for (const r of JSON.parse(fs.readFileSync(`${PKG}/dist/relations.json`, 'utf8')).relations) if (r.quality?.strong) { (strong[r.source] ||= []).push({ id: r.target, sentence: r.sentence, type: r.type }); (strong[r.target] ||= []).push({ id: r.source, sentence: r.sentence, type: r.type }); }
const localCover = b => { for (const ext of ['jpg', 'png', 'webp']) { const p = `covers/${b.id}.${ext}`; if (fs.existsSync(`${V1}/public/${p}`)) { fs.mkdirSync('public/covers', { recursive: true }); fs.copyFileSync(`${V1}/public/${p}`, `public/${p}`); return p; } } return null; };
const gender = fs.existsSync('scripts/raw/gender.json') ? JSON.parse(fs.readFileSync('scripts/raw/gender.json', 'utf8')) : {};
const books = cat.books.map(b => { const o = obs.books[b.id];
  const score = +(0.7 * (1 - pV(Math.log1p(views(b.id)))) + 0.3 * (1 - pS(o.sitelinks))).toFixed(4);
  const P = pkg[b.id] || {}; const cv = covers[b.id];
  return { id: b.id, title: P.title || b.title, author: P.authors?.map(a => a.name).join('、') || b.author || null, authorGender: [...new Set((P.authors || []).map(a => gender[a.id]).filter(Boolean))].join('/') || null, year: P.year ?? b.year ?? null, country: P.country || b.country || null, language: P.language || b.language || null,
    originalTitle: P.originalTitle || b.originalTitle || null, aliases: (P.aliases || []).filter(a => a !== (P.title || b.title)).slice(0, 8),
    summary: P.description?.text || b.summary || '', hook: b.hook || '', themes: P.themes ? P.themes.map(t => t.label) : (b.themes || []).filter(t => t !== '文本叙事' && t !== '作品语境'),
    facets: P.facets ? { era: P.facets.era || null, tradition: P.facets.tradition || null, genres: (P.facets.genres || []).map(g => g.label) } : null,
    cover: cv ? cv.file : null, coverW: cv?.w ?? null, coverH: cv?.h ?? null, sourceUrl: P.links?.wikipedia || b.sourceUrl, revisionUrl: P.description?.revisionUrl || null, wikidataUrl: b.wikidataUrl,
    obscurity: { score, zhViews: o.zhViews, enViews: o.enViews, sitelinks: o.sitelinks },
    links: [...(strong[b.id] || []).map(r => ({ id: r.id, kind: r.type, band: r.type === 'near' ? 'near' : r.type === 'far' ? 'far' : 'middle', sharedThemes: [], similarity: 1, grounded: r.sentence })), ...(rel[b.id] || []).sort((x, y) => y.weight - x.weight).slice(0, 6).map(r => ({ id: r.target, kind: r.kind, band: r.bandByBook?.[b.id] || null, sharedThemes: (r.evidence?.sharedThemes || []).filter(t => (pkg[b.id]?.themes || []).some(x => x.label === t)), similarity: r.similarity }))] }; });
const sorted = [...books].sort((a, b) => a.obscurity.score - b.obscurity.score); sorted.forEach((b, i) => (b.obscurity.percentile = +(i / (books.length - 1)).toFixed(3)));
fs.writeFileSync('public/data/books.json', JSON.stringify({ generatedAt: new Date().toISOString(), source: cat.source, package: { name: pkgMeta.name, version: pkgMeta.version, builtAt: pkgMeta.builtAt }, obscuritySource: { method: obs.source, window: obs.window, fetchedAt: obs.fetchedAt, formula: 'score = 0.7*(1-pct(log1p(zhViews+enViews))) + 0.3*(1-pct(sitelinks))' }, books }));
console.log(books.length, 'covers', books.filter(b => b.cover).length, 'strong relations on', books.filter(b => b.links.some(l => l.grounded)).length);
const credits = cat.books.map(b => ({ id: b.id, title: (pkg[b.id] || {}).title || b.title, text: { source: '中文维基百科', url: (pkg[b.id]?.description?.revisionUrl) || b.sourceUrl, license: 'CC BY-SA 4.0' }, cover: covers[b.id] ? { provider: covers[b.id].provider, sourceUrl: covers[b.id].sourceUrl, licenseClass: covers[b.id].licenseClass, license: covers[b.id].license || null, artist: covers[b.id].artist || null } : null }));
fs.writeFileSync('public/data/credits.json', JSON.stringify({ package: pkgMeta.name + '@' + pkgMeta.version, books: credits }));
const t = n => books.find(b => b.title === n); console.log(['西游记', '哈姆雷特'].map(n => [n, t(n)?.obscurity]));
console.log(sorted.slice(-3).map(b => [b.title, b.obscurity]));
