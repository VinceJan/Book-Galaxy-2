// Author gender (Wikidata P21) for the package's author ids → scripts/raw/gender.json {authorQid: 'female'|'male'|...}
import fs from 'node:fs';
const pkg = JSON.parse(fs.readFileSync('/workspace/book-galaxy-data/dist/books.json', 'utf8')); const books = pkg.books ?? pkg;
const ids = [...new Set(books.flatMap(b => (b.authors ?? []).map(a => a.id).filter(Boolean)))];
const out = {}; const L = { Q6581072: 'female', Q6581097: 'male', Q1052281: 'female', Q2449503: 'male', Q48270: 'nonbinary' };
for (let i = 0; i < ids.length; i += 50) {
  const r = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${ids.slice(i, i + 50).join('|')}`, { headers: { 'User-Agent': 'BookGalaxy2/0.1 (github.com/VinceJan/Book-Galaxy-2)' } });
  const j = await r.json();
  for (const [id, e] of Object.entries(j.entities ?? {})) { const g = e.claims?.P21?.[0]?.mainsnak?.datavalue?.value?.id; if (g) out[id] = L[g] ?? 'other'; }
  await new Promise(r => setTimeout(r, 300));
}
fs.writeFileSync('scripts/raw/gender.json', JSON.stringify(out));
console.log(ids.length, 'authors', Object.values(out).filter(x => x === 'female').length, 'female', Object.keys(out).length, 'with gender');
