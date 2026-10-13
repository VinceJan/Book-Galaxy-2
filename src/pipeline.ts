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
/** Confidence cut-offs on the top hybrid relevance (z units). After a hard-constraint filter the surviving scores are
 *  re-centred so a tight, on-topic shortlist is not marked "没找准" just because the absolute z dropped. */
export const CONF = { semantic: { lo: +(globalThis.process?.env?.CLO ?? 3.3), hi: +(globalThis.process?.env?.CHI ?? 9) }, lexical: { lo: 3, hi: 5.5 } };
/** Obscure enough to stamp 唤醒: few Chinese readers and rarer than most of the shelf. */
export const deeplyAsleep = (b: Book) => (b.obscurity.zhViews ?? 0) < 2500 && b.obscurity.percentile >= 0.65;
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
  // Pure English → Chinese rewrite. Mixed zh/en keeps Chinese + English title spans (see toChinese).
  const hasLatin = /[a-z]/i.test(note), hasHan = /[\u4e00-\u9fa5]/.test(note);
  const rewritten = (isEnglish(note) || (hasLatin && hasHan)) && eng.glossary ? toChinese(note, eng.glossary) : null;
  const query = rewritten?.zh || note;
  const lexQ = rewritten ? `${query} ${note}` : note;
  const lex = lexicalSims(lexQ, books), e = expand(query + (rewritten?.titles?.length ? ' ' + rewritten.titles.join(' ') : '')), exp = expansionScores(e, books);
  const confident = !e.terms.length || exp.some((x, i) => x > 0 && !eng.unsafe.has(books[i].id) && !given.has(books[i].id));
  const exclude = new Set([...given, ...eng.unsafe]);
  let S: number[], via: Decision['via'], vTop = new Set<string>();
  if (eng.embed) {
    let V = await vecSims(query, eng);
    if (rewritten?.terms.length || rewritten?.titles?.length) {
      const V2 = await vecSims(note, eng);
      V = V.map((x, i) => 0.7 * x + 0.3 * V2[i]);
    }
    S = hybrid(V, lex, exp); via = 'semantic';
    vTop = new Set(V.map((x, i) => [x, i] as const).filter(([, i]) => !exclude.has(books[i].id)).sort((a, b) => b[0] - a[0]).slice(0, +(globalThis.process?.env?.VTOP ?? 12)).map(([, i]) => books[i].id));
    const dual = dualTopics(query);
    if (dual) { const [a, b] = await Promise.all(dual.map(p => vecSims(p, eng))); const za = zs(a), zb = zs(b); S = S.map((x, i) => 0.6 * x + 0.6 * Math.min(za[i], zb[i])); }
  } else { S = hybrid(null, lex, exp); via = 'lexical'; }
  // Exact English title/alias hits (mixed or pure): strong boost so "To Kill a Mockingbird 那样的书" lands on the book.
  if (rewritten?.titles?.length) {
    const keys = rewritten.titles.map(t => t.toLowerCase().replace(/[^a-z0-9]+/gi, ''));
    S = S.map((s, i) => {
      const blob = `${books[i].title}|${books[i].originalTitle ?? ''}|${(books[i].aliases ?? []).join('|')}`.toLowerCase();
      const compact = blob.replace(/[^a-z0-9一-龥]+/gi, '');
      return keys.some(k => k.length >= 4 && (blob.includes(rewritten!.titles.find(t => t.toLowerCase().replace(/[^a-z0-9]+/gi, '') === k)!.toLowerCase()) || compact.includes(k))) ? s + 8 : s;
    });
  }
  const cons: Constraint[] = extract(note); let met = !cons.length;
  if (cons.length) {
    const order = S.map((s, i) => [s, i] as const).filter(([, i]) => !exclude.has(books[i].id)).sort((a, b) => b[0] - a[0]).slice(0, 300).map(([, i]) => i);
    const all = new Set(order.filter(i => cons.every(c => c.test(books[i]))));
    if (all.size >= 3) {
      // Keep only constraint-passers, then re-centre their scores so confidence reflects the shortlist, not the pre-filter z.
      const vals = [...all].map(i => S[i]), z = zs(vals);
      const remap = new Map([...all].map((i, k) => [i, z[k] * 3 + 6]));
      S = S.map((s, i) => (remap.has(i) ? remap.get(i)! : s - 100));
      met = true;
    } else S = S.map((s, i) => s + 1.5 * cons.filter(c => c.test(books[i])).length / cons.length);
  }
  const hits = rank(S, books, { exclude });
  const top = hits[0]?.sim ?? 0, th = CONF[via];
  const level: Level = !confident || top < th.lo ? 'low' : top >= th.hi ? 'high' : 'mid';
  const b = hits[0]?.book;
  // 唤醒 when the chosen book is obscure, constraints met, confidence isn't low, and it is on-topic:
  // either close by meaning (vector top-12) or the top-3 shortlist itself holds ≥1 sleeping book (this one).
  const stamp: Decision['stamp'] = b && met && level !== 'low' && deeplyAsleep(b) && (level === 'high' ? true : vTop.has(b.id))
    ? '唤醒' : '借出';
  return { kind, hits, via, level, top, query, constraints: cons.map(c => c.label), met, stamp };
}
