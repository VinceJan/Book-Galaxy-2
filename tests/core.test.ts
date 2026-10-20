import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { rank, centre, dot, lexicalSims, bigrams } from '../src/retrieve';
import { composeLetter, excerpt, isSleeping } from '../src/letter';
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
      for (const m of all.matchAll(/《([^》]+)》/g)) expect(books.some(x => x.title === m[1]) || b.summary.includes(m[0]) || b.links.some(l => (l.sentence ?? l.grounded ?? "").includes(m[0]))).toBe(true);
      expect(all).not.toMatch(/归在|逐一比对|美国文学|20世纪作品/);
    }
  });
  it('rarely-opened line only for genuinely sleeping books, and it never counts', () => {
    const sleepers = books.filter(isSleeping).slice(0, 40); expect(sleepers.length).toBeGreaterThan(10);
    for (const b of sleepers) for (const p of composeLetter('最近很累', b, byId).filter(x => x.k === 'say')) expect(p.t, p.t).not.toMatch(/\d+\s*(?:人|次|个|本|封)|[十百千万][一二三四五六七八九十百千万来多]*\s*(?:人|次)|百分|冷门度|浏览量/);
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
    expect(p[1].t).toMatch(/没找准|没有正对|没找到正中|难住我/); expect(p.at(-1)!.t).toContain(books[1].title); expect(p.some(x => x.t.includes('点开过'))).toBe(false);
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
  it('node count is bounded by letters; unrelated letters form separate clusters (no star)', () => { const ls = books.slice(0, 7).map((b, i) => L(i, b.id)); const n = layoutLetters(ls, () => 0); expect(n.length).toBe(8); expect(n.slice(1).every(x => x.parent === -1)).toBe(true); expect(n.edges!.filter(e => !e.near).length).toBe(0); expect(n.edges!.filter(e => e.near).length).toBeGreaterThan(0); });
  it('attaches to most related earlier letter and related letters cluster closer', () => {
    const w = (a: string, b: string) => (('ac'.includes(a) && 'ac'.includes(b)) || ('bd'.includes(a) && 'bd'.includes(b)) ? 1 : 0);
    const n = layoutLetters([L(0, 'a'), L(1, 'b'), L(2, 'c'), L(3, 'd')], w); expect(n[3].parent).toBe(1); expect(n[4].parent).toBe(2);
    expect([...firstDegree({ ...n, edges: n.edges!.filter(e => !e.near) } as typeof n, 1)].sort()).toEqual([1, 3]);
    const d = (i: number, j: number) => Math.hypot(n[i].x - n[j].x, n[i].y - n[j].y); expect(d(1, 3)).toBeLessThan(d(1, 2)); expect(d(2, 4)).toBeLessThan(d(2, 3));
  });
  it('persists letters', () => { const m = new Map<string, string>(); const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v) } as unknown as Storage; saveLetter(L(1, 'x'), s); saveLetter(L(2, 'y'), s); expect(loadLetters(s).map(l => l.bookId)).toEqual(['x', 'y']); });
});
describe('data package wiring', () => {
  it('every cover is a self-hosted small webp; missing covers are null (placeholder)', () => {
    const withCover = books.filter(b => b.cover); expect(withCover.length).toBeGreaterThanOrEqual(890);
    for (const b of withCover) { expect(b.cover).toMatch(/^covers\/Q\d+\.webp$/); const st = fs.statSync('public/' + b.cover); expect(st.size).toBeLessThan(40_000); }
  });
  it('credits list text + cover provenance for every book', () => {
    const c = JSON.parse(fs.readFileSync('public/data/credits.json', 'utf8')); expect(c.books.length).toBe(1000);
    expect(c.books.filter((x: { cover: unknown }) => x.cover).length).toBe(books.filter(b => b.cover).length);
  });
  it('book threads are v1 relations.v5 prose only (removed links excluded, no types/strength/gravity)', () => {
    const c = cat as Catalog & { threads: { source: string; count: number } }; expect(c.threads.source).toBe('dist/relations.v5.json'); expect(c.threads.count).toBe(1647);
    const g = books.flatMap(b => b.links.filter(l => l.grounded)); expect(g.length).toBe(2 * 1647);
    for (const l of g) { expect(l.kind).toBe('thread'); expect(Object.keys(l).sort()).toEqual(['band', 'grounded', 'id', 'kind', 'sharedThemes', 'similarity']); }
    expect(books.filter(b => b.cover).length).toBeGreaterThanOrEqual(939);
  });
  it('aliases feed the lexical fallback', () => { const s = lexicalSims('The Goal', books); expect(books[s.indexOf(Math.max(...s))].title).toBe('目标'); });
});
