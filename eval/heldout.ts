// Runs the app's own decide() over a predicate-labelled set. Usage: SET=heldout|dev2 npx tsx eval/heldout.ts
import fs from 'node:fs';
import { pipeline } from '@huggingface/transformers';
import { decide, type Engine } from '../src/pipeline';
import { isSafe } from '../src/situations';
import type { Book } from '../src/types';
const SET = process.env.SET || 'heldout';
const cat = JSON.parse(fs.readFileSync('public/data/books.json', 'utf8')); const meta = JSON.parse(fs.readFileSync('public/data/vectors.meta.json', 'utf8'));
const pos = new Map<string, number>(meta.order.map((id: string, i: number) => [id, i]));
const books: Book[] = [...cat.books].sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
const index = { books, dim: meta.dim, vecs: new Int8Array(fs.readFileSync('public/data/vectors.i8.bin')), scale: meta.scale, mean: Float32Array.from(meta.mean) };
const fe = await pipeline('feature-extraction', meta.model, { dtype: 'q8' });
const cache = new Map<string, Float32Array>();
const embed = async (t: string) => { if (!cache.has(t)) cache.set(t, (await fe(meta.queryPrefix + t, { pooling: meta.pooling, normalize: true })).data as Float32Array); return cache.get(t)!; };
const eng: Engine = { index, unsafe: new Set(books.filter(b => !isSafe(b)).map(b => b.id)), embed: process.env.LEX ? null : embed, glossary: process.env.NOGLOSS ? undefined : JSON.parse(fs.readFileSync('public/data/en-zh.json', 'utf8')) };
type Item = { q: string; cat: string; re?: string; country?: string[]; female?: boolean; genre?: string; expect?: string };
const items: Item[] = JSON.parse(fs.readFileSync(`eval/${SET}.json`, 'utf8')).items;
const T = (b: Book) => `${b.title}|${(b.aliases ?? []).join('|')}|${b.facets?.genres?.join('|') ?? ''}|${b.themes.join('|')}|${b.summary.slice(0, 400)}`;
const okBook = (it: Item, b: Book) => new RegExp(it.re!, 'i').test(T(b)) && (!it.country || it.country.includes(b.country ?? '')) && (!it.female || /female/.test(b.authorGender ?? '')) && (!it.genre || new RegExp(it.genre, 'i').test(`${b.facets?.genres?.join('|')}|${b.themes.join('|')}`));
const by: Record<string, { n: number; beh: number; h1: number; h3: number; rec: number }> = {}; const lv = { low: 0, mid: 0, high: 0 }; let wake = 0, wakeOk = 0;
for (const it of items) {
  const d = await decide(it.q, eng); const mode = d.kind === 'ok' ? 'recommend' : d.kind === 'crisis' ? 'care' : 'decline';
  const exp = it.expect ?? 'recommend'; const c = (by[it.cat] ??= { n: 0, beh: 0, h1: 0, h3: 0, rec: 0 }); const all = (by.ALL ??= { n: 0, beh: 0, h1: 0, h3: 0, rec: 0 });
  for (const r of [c, all]) { r.n++; r.beh += +(mode === exp); }
  if (mode === 'recommend') { lv[d.level]++; if (d.stamp === '唤醒') { wake++; wakeOk += +(it.re ? okBook(it, d.hits[0].book) : 1); } }
  let line = `${mode === exp ? ' ' : '✗'} [${it.cat}] ${it.q} → ${mode}`;
  if (it.re && mode === 'recommend') { const h1 = okBook(it, d.hits[0].book), h3 = d.hits.slice(0, 3).some(h => okBook(it, h.book)); for (const r of [c, all]) { r.rec++; r.h1 += +h1; r.h3 += +h3; }
    line += ` ${d.level} ${d.stamp} ${d.hits.slice(0, 3).map(h => (okBook(it, h.book) ? '✓' : '·') + h.book.title).join(' ')}`; }
  if (process.env.SIM && mode === 'recommend' && it.re) console.log('SIM', okBook(it, d.hits[0].book) ? 1 : 0, d.top.toFixed(2), it.q);
  if (process.env.SHOW) console.log(line + (d.query !== it.q ? `  ⟵ ${d.query}` : '') + (d.constraints.length ? ` [${d.constraints}]` : ''));
}
const f = (x: number, n: number) => (n ? (x / n).toFixed(2) : '–');
console.log('cat      n  behaviour  top1  top3'); for (const [k, r] of Object.entries(by)) console.log(k.padEnd(7), String(r.n).padStart(3), f(r.beh, r.n).padStart(9), f(r.h1, r.rec).padStart(5), f(r.h3, r.rec).padStart(5));
const R = lv.low + lv.mid + lv.high; console.log(`confidence low ${f(lv.low, R)} mid ${f(lv.mid, R)} high ${f(lv.high, R)} · 唤醒 ${wake} (on-topic ${wakeOk})`);
