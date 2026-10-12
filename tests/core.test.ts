import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { rank, centre, dot, lexicalSims, bigrams } from '../src/retrieve';
import { composeLetter, excerpt } from '../src/letter';
import { describeObscurity } from '../src/obscurity';
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
  it('quotes only catalog data and never truncates the hook', () => {
    const b = books.find(x => x.hook.length > 60)!; const p = composeLetter('测试', b, byId, cat.obscuritySource.window, 'semantic');
    const all = p.map(x => x.t).join('');
    const ex = excerpt(b); expect(all).toContain(ex); expect(b.summary.includes(ex) || b.hook.includes(ex)).toBe(true); expect(ex).toMatch(/[。！？!?」”]$/); expect(all).toContain(b.title); expect(all).not.toMatch(/睡了|沉睡 \d/);
    if (b.obscurity.zhViews) expect(all).toContain(b.obscurity.zhViews.toLocaleString('zh-CN'));
  });
  it('obscurity text handles missing zh article', () => { const b = { ...books[0], obscurity: { ...books[0].obscurity, zhViews: 0 } }; expect(describeObscurity(b, ['20251001', '20260930'])).toContain('没有它被浏览的记录'); });
});
describe('archive', () => {
  const L = (i: number, bookId: string): Letter => ({ id: 'l' + i, at: '', note: '', bookId, paragraphs: [], via: 'semantic', parentId: null });
  it('node count is bounded by letters', () => { const ls = books.slice(0, 7).map((b, i) => L(i, b.id)); const n = layoutLetters(ls, () => 0); expect(n.length).toBe(8); expect(n.slice(1).every(x => x.parent === 0)).toBe(true); });
  it('attaches to most similar earlier letter', () => { const n = layoutLetters([L(0, 'a'), L(1, 'b'), L(2, 'c')], (a, b) => (a === 'a' && b === 'c' ? 0.9 : 0)); expect(n[3].parent).toBe(1); expect([...firstDegree(n, 1)].sort()).toEqual([0, 1, 3]); });
  it('persists letters', () => { const m = new Map<string, string>(); const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v) } as unknown as Storage; saveLetter(L(1, 'x'), s); saveLetter(L(2, 'y'), s); expect(loadLetters(s).map(l => l.bookId)).toEqual(['x', 'y']); });
});
