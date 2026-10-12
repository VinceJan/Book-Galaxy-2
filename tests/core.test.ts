import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { rank, centre, dot, lexicalSims, bigrams } from '../src/retrieve';
import { composeLetter, excerpt, humanCount, isSleeping } from '../src/letter';
import { stampFor } from '../src/obscurity';
import { isSafe, UNSAFE, cleanQuote } from '../src/situations';
import { layoutLetters, firstDegree } from '../src/layout';
import { loadLetters, saveLetter } from '../src/store';
import type { Catalog, VecMeta, Letter } from '../src/types';

const cat: Catalog = JSON.parse(fs.readFileSync('public/data/books.json', 'utf8'));
const meta: VecMeta = JSON.parse(fs.readFileSync('public/data/vectors.meta.json', 'utf8'));
const vecs = new Int8Array(fs.readFileSync('public/data/vectors.i8.bin').buffer.slice(0));
const pos = new Map(meta.order.map((id, i) => [id, i]));
const books = [...cat.books].sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
const byId = new Map(books.map(b => [b.id, b]));
const idx = { books, dim: meta.dim, vecs, scale: meta.scale, mean: Float32Array.from(meta.mean) };

describe('data', () => {
  it('has 1000 books with vectors aligned', () => { expect(books.length).toBe(1000); expect(vecs.length).toBe(1000 * meta.dim); });
  it('obscurity is real and spread out (not the v1 constant)', () => {
    const s = books.map(b => b.obscurity.score).sort((a, b) => a - b);
    expect(new Set(s).size).toBeGreaterThan(900); expect(s[999] - s[0]).toBeGreaterThan(0.9);
    const xyj = books.find(b => b.title === '西游记')!; expect(xyj.obscurity.percentile).toBeLessThan(0.1);
  });
  it('doc vectors are ~unit', () => { const q = new Float32Array(meta.dim); for (let k = 0; k < meta.dim; k++) q[k] = vecs[k] / meta.scale; expect(dot(q, idx, 0)).toBeGreaterThan(0.95); });
});
describe('retrieval', () => {
  it('a book’s own vector retrieves itself first among relevance', () => {
    const i = 123; const q = new Float32Array(meta.dim); for (let k = 0; k < meta.dim; k++) q[k] = vecs[i * meta.dim + k] / meta.scale;
    const sims = books.map((_, j) => dot(q, idx, j)); const hits = rank(sims, books, { lambda: 0 }); expect(hits[0].book.id).toBe(books[i].id);
  });
  it('re-rank only reorders the relevant top-K and respects exclusions', () => {
    const sims = books.map((_, j) => (j < 10 ? 1 - j * 0.01 : 0)); const hits = rank(sims, books, { k: 9, exclude: new Set([books[0].id]) });
    expect(hits.length).toBe(9); expect(hits.every(h => h.sim > 0.5)).toBe(true);
  });
  it('centre returns unit vector', () => { const c = centre(Array.from({ length: meta.dim }, (_, k) => Math.sin(k)), idx.mean); expect(Math.hypot(...c)).toBeCloseTo(1, 4); });
  it('lexical fallback finds a title', () => { expect(bigrams('西游记')).toEqual(['西游', '游记']); const s = lexicalSims('西游记', books); expect(books[s.indexOf(Math.max(...s))].title).toContain('西游'); });
});
describe('letter', () => {
  it('quotes whole, clean sentences from the description and only real titles', () => {
    for (const b of books.slice(0, 200)) {
      const p = composeLetter('最近很累', b, byId); const all = p.map(x => x.t).join('');
      const ex = excerpt(b); if (ex) { expect(all).toContain(ex); expect(ex).not.toMatch(/[（(][^）)]{0,6}语[：:]/); expect(ex).toMatch(/[。！？!?」”]$/); }
      for (const m of all.matchAll(/《([^》]+)》/g)) expect(books.some(x => x.title === m[1]) || b.summary.includes(m[0]) || b.links.some(l => l.sentence?.includes(m[0]))).toBe(true);
      expect(all).not.toMatch(/归在|逐一比对|美国文学|20世纪作品/);
    }
  });
  it('human count only for genuinely sleeping books', () => {
    expect(humanCount(573)).toBe('五百来'); expect(humanCount(1840)).toBe('一千八百来'); expect(humanCount(42)).toBe('不到一百');
    const pb = books.find(b => b.title === '花花公子')!; expect(isSleeping(pb)).toBe(false); expect(stampFor(pb).label).toBe('借出');
    const xyj = books.find(b => b.title === '西游记')!; expect(composeLetter('x', xyj, byId).some(p => p.t.includes('点开过'))).toBe(false);
  });
  it('safety: explicit premises never recommendable, explicit sentences never quoted', () => {
    expect(isSafe(books.find(b => b.title === '花花公子')!)).toBe(false);
    for (const b of books) expect(excerpt(b)).not.toMatch(UNSAFE);
  });
  it('cleanQuote strips foreign-name parentheticals', () => { expect(cleanQuote('《目标》（英语：The Goal）是一本书')).toBe('《目标》是一本书'); });
  it('low-confidence letters say so honestly and offer alternatives; no sleeping claim', () => {
    const p = composeLetter('最近在学下棋', books[0], byId, { level: 'low', alternatives: [books[1], books[2]] });
    expect(p[1].t).toContain('这次没找准'); expect(p.at(-1)!.t).toContain(books[1].title); expect(p.some(x => x.t.includes('点开过'))).toBe(false);
  });
  it('de-templated: banned stock phrases never appear; openings rotate', () => {
    const opens = new Set<string>();
    for (const b of books.slice(0, 300)) { const t = composeLetter('随便来一本' + b.id, b, byId).map(x => x.t).join(''); opens.add(composeLetter('随便来一本' + b.id, b, byId)[1].t);
      expect(t).not.toMatch(/我没去畅销榜那一排|它正合适|如果你此刻|早 ?\d+ ?年|都在路上|逐一比对/); }
    expect(opens.size).toBeGreaterThanOrEqual(5);
  });
});
describe('archive', () => {
  const L = (i: number, bookId: string): Letter => ({ id: 'l' + i, at: '', note: '', bookId, paragraphs: [], via: 'semantic', parentId: null });
  it('node count is bounded by letters', () => { const ls = books.slice(0, 7).map((b, i) => L(i, b.id)); const n = layoutLetters(ls, () => 0); expect(n.length).toBe(8); expect(n.slice(1).every(x => x.parent === 0)).toBe(true); });
  it('attaches to most similar earlier letter', () => { const n = layoutLetters([L(0, 'a'), L(1, 'b'), L(2, 'c')], (a, b) => (a === 'a' && b === 'c' ? 0.9 : 0)); expect(n[3].parent).toBe(1); expect([...firstDegree(n, 1)].sort()).toEqual([0, 1, 3]); });
  it('persists letters', () => { const m = new Map<string, string>(); const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v) } as unknown as Storage; saveLetter(L(1, 'x'), s); saveLetter(L(2, 'y'), s); expect(loadLetters(s).map(l => l.bookId)).toEqual(['x', 'y']); });
});
