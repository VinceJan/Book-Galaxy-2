// Adds auditable 适合处境 lines (with the evidence word that triggered each) and a safety flag to books.json.
import fs from 'node:fs';
import { situations, isSafe } from '../src/situations';
const f = 'public/data/books.json', cat = JSON.parse(fs.readFileSync(f, 'utf8'));
for (const b of cat.books) { b.situations = situations(b); b.safe = isSafe(b); }
fs.writeFileSync(f, JSON.stringify(cat));
console.log('situations', cat.books.filter((b: { situations: unknown[] }) => b.situations.length).length, 'unsafe', cat.books.filter((b: { safe: boolean }) => !b.safe).map((b: { title: string }) => b.title));
