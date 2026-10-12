import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { keywordCheck, isEnglish } from '../src/safety';
import { toChinese } from '../src/translate';
import { extract, dualTopics } from '../src/constraints';
import { composeLetter, OPENER_COUNT } from '../src/letter';
import { layoutLetters } from '../src/layout';
import type { Book, Letter } from '../src/types';
const books: Book[] = JSON.parse(fs.readFileSync('public/data/books.json', 'utf8')).books;
const byId = new Map(books.map(b => [b.id, b]));
const gl = JSON.parse(fs.readFileSync('public/data/en-zh.json', 'utf8'));
const dev = JSON.parse(fs.readFileSync('eval/safety-dev.json', 'utf8'));

describe('safety (keyword layer) on the self-authored dev set', () => {
  for (const lab of ['crisis', 'harm', 'hate', 'sexual'] as const) it(`all ${lab} dev notes are caught`, () => { for (const t of dev[lab]) expect(keywordCheck(t), t).toBe(lab); });
  it('no ok dev note is blocked by keywords (study framing, third person, English book requests)', () => { for (const t of dev.ok) expect(keywordCheck(t), t).toBe('ok'); });
});
describe('English query rewrite', () => {
  it('detects English', () => { expect(isEnglish('a good spy novel')).toBe(true); expect(isEnglish('想读日本推理')).toBe(false); });
  it('maps content words to catalog Chinese and drops request words', () => {
    const r = toChinese('recommend me a novel about the ocean and sailors', gl); expect(r.terms).toEqual(expect.arrayContaining(['水手'])); expect(r.zh).not.toMatch(/recommend/);
  });
  it('glossary stays small', () => expect(fs.statSync('public/data/en-zh.json').size).toBeLessThan(260_000));
});
describe('constraints', () => {
  it('country + genre', () => { const c = extract('想读一本日本的推理小说').map(x => x.label); expect(c).toEqual(['日本', '推理']); });
  it('author gender uses Wikidata data', () => { const c = extract('女作家写的科幻'); const f = c.find(x => x.label === '女作者')!; expect(books.filter(f.test).length).toBeGreaterThan(50); });
  it('age', () => expect(extract('给八岁的孩子找本书').map(x => x.label)).toContain('适合孩子'));
  it('dual topic', () => expect(dualTopics('既有悬疑又有历史感的书')).toEqual(['悬疑', '历史感']));
  it('no constraint from a plain note', () => expect(extract('最近很累')).toEqual([]));
});
describe('letters', () => {
  it('≥ 25 opening patterns, and first sentences vary across notes', () => {
    expect(OPENER_COUNT).toBeGreaterThanOrEqual(25);
    const firsts = new Set(books.slice(0, 120).map((b, i) => composeLetter(`随便来一本 ${i}`, b, byId, { level: 'mid', alternatives: [] })[1].t));
    expect(firsts.size).toBeGreaterThanOrEqual(20);
  });
});
describe('archive web', () => {
  it('every letter links to semantic neighbours even below the theme threshold', () => {
    const L = books.slice(0, 8).map((b, i) => ({ id: 'l' + i, at: '', note: '', bookId: b.id, paragraphs: [], via: 'semantic', parentId: null }) as unknown as Letter);
    const n = layoutLetters(L, (a, b) => (a === b ? 1 : 0.15));
    const deg = new Map<number, number>(); for (const e of n.edges!) { deg.set(e.a, (deg.get(e.a) ?? 0) + 1); deg.set(e.b, (deg.get(e.b) ?? 0) + 1); }
    for (let i = 1; i <= 8; i++) expect(deg.get(i) ?? 0).toBeGreaterThanOrEqual(2);
  });
});
