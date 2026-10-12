/** The whole note → decision path (safety, query rewrite, retrieval, constraints, confidence, stamp).
 *  Shared by the app (main.ts) and the evals (eval/heldout.ts, eval/safety.ts) so they measure the same code. */
import { centre, dot, rank, lexicalSims, expansionScores, hybrid, zs, type Hit, type Index } from './retrieve';
import { expand } from './expand';
import { keywordCheck, embedCheck, SEEDS, isEnglish, framed, type SafetyKind } from './safety';
import { toChinese, type Glossary } from './translate';
import { extract, dualTopics, type Constraint } from './constraints';
import type { Book } from './types';
export type Level = 'low' | 'mid' | 'high';
export interface Engine { index: Index; unsafe: Set<string>; embed: ((t: string) => Promise<Float32Array>) | null; glossary?: Glossary }
export interface Decision { kind: SafetyKind; hits: Hit[]; via: 'semantic' | 'lexical'; level: Level; stamp: '唤醒' | '借出' | null; top: number; query: string; constraints: string[]; met: boolean }
/** Confidence cut-offs on the top hybrid relevance (z units). Calibrated on eval/notes.json + eval/dev2.json so that
 *  few letters are "low" and "high" letters are on topic ≥ 80% of the time. 唤醒 additionally needs the book to be
 *  among the closest by meaning alone (not only lifted by keywords) and deeply asleep.
 *  (was: roughly 1 in 8 recommendation letters is "low" and "high" letters are on topic ≥ 80% of the time. */
export const CONF = { semantic: { lo: +(globalThis.process?.env?.CLO ?? 3.3), hi: +(globalThis.process?.env?.CHI ?? 9) }, lexical: { lo: 3, hi: 5.5 } };
/** "Truly obscure": few readers in absolute terms and rarer than most of the shelf. */
export const deeplyAsleep = (b: Book) => (b.obscurity.zhViews ?? 0) < 1500 && b.obscurity.percentile >= 0.7;
let seedVecs: Record<string, Float32Array[]> | null = null, seedFor: unknown = null;
export async function classify(note: string, eng: Engine): Promise<SafetyKind> {
  const k = keywordCheck(note); if (k !== 'ok' || !eng.embed || isEnglish(note)) return k;
  if (seedFor !== eng.embed) { seedVecs = Object.fromEntries(await Promise.all(Object.entries(SEEDS).map(async ([c, v]) => [c, await Promise.all(v.map(t => eng.embed!(t)))]))); seedFor = eng.embed; }
  const v = embedCheck(await eng.embed(note), seedVecs!);
  return v === 'crisis' && framed(note) ? 'ok' : v;
}
const vecSims = async (t: string, eng: Engine) => { const v = centre(await eng.embed!(t), eng.index.mean); return eng.index.books.map((_, i) => dot(v, eng.index, i)); };
export async function decide(note: string, eng: Engine, given: Set<string> = new Set()): Promise<Decision> {
  const kind = await classify(note, eng);
  const none = { hits: [], via: 'lexical' as const, level: 'low' as const, stamp: null, top: 0, query: note, constraints: [], met: false };
  if (kind !== 'ok') return { kind, ...none };
  const books = eng.index.books;
  // English notes are rewritten into Chinese catalog words first; the original stays in for title/alias matches.
  const en = isEnglish(note) && eng.glossary ? toChinese(note, eng.glossary) : null;
  const query = en?.terms.length ? en.zh : note;
  const lex = lexicalSims(en ? `${query} ${note}` : note, books), e = expand(query), exp = expansionScores(e, books);
  const confident = !e.terms.length || exp.some((x, i) => x > 0 && !eng.unsafe.has(books[i].id) && !given.has(books[i].id));
  const exclude = new Set([...given, ...eng.unsafe]);
  let S: number[], via: Decision['via'], vTop = new Set<string>();
  if (eng.embed) {
    let V = await vecSims(query, eng);
    if (en?.terms.length) { const V2 = await vecSims(note, eng); V = V.map((x, i) => 0.75 * x + 0.25 * V2[i]); }
    S = hybrid(V, lex, exp); via = 'semantic';
    vTop = new Set(V.map((x, i) => [x, i]).filter(([, i]) => !exclude.has(books[i].id)).sort((a, b) => b[0] - a[0]).slice(0, +(globalThis.process?.env?.VTOP ?? 8)).map(([, i]) => books[i].id));
    // Two explicit topics: a book should answer both, so add the weaker of the two part-scores.
    const dual = dualTopics(query);
    if (dual) { const [a, b] = await Promise.all(dual.map(p => vecSims(p, eng))); const za = zs(a), zb = zs(b); S = S.map((x, i) => 0.6 * x + 0.6 * Math.min(za[i], zb[i])); }
  } else { S = hybrid(null, lex, exp); via = 'lexical'; }
  // Hard constraints: among the 300 most relevant, keep only books meeting all of them (if at least 3 do); else boost partial matches.
  const cons: Constraint[] = extract(note); let met = !cons.length;
  if (cons.length) {
    const order = S.map((s, i) => [s, i]).filter(([, i]) => !exclude.has(books[i].id)).sort((a, b) => b[0] - a[0]).slice(0, 300).map(([, i]) => i);
    const all = new Set(order.filter(i => cons.every(c => c.test(books[i]))));
    if (all.size >= 3) { S = S.map((s, i) => (all.has(i) ? s : s - 100)); met = true; }
    else S = S.map((s, i) => s + 1.5 * cons.filter(c => c.test(books[i])).length / cons.length);
  }
  const hits = rank(S, books, { exclude });
  const top = hits[0]?.sim ?? 0, th = CONF[via];
  const level: Level = !confident || top < th.lo ? 'low' : top >= th.hi ? 'high' : 'mid';
  const b = hits[0]?.book;
  return { kind, hits, via, level, top, query, constraints: cons.map(c => c.label), met, stamp: b && level === 'high' && met && vTop.has(b.id) && deeplyAsleep(b) ? '唤醒' : '借出' };
}
