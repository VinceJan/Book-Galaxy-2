/** The whole note → decision path (safety, query rewrite, retrieval, constraints, confidence, stamp).
 *  Shared by the app (main.ts) and the evals so they measure the same code. */
import { centre, dot, rank, lexicalSims, expansionScores, hybrid, zs, type Hit, type Index } from './retrieve';
import { expand } from './expand';
import { keywordCheck, embedCheck, SEEDS, isEnglish, framed, type SafetyKind } from './safety';
import { toChinese, type Glossary } from './translate';
import { extract, dualTopics, type Constraint } from './constraints';
import type { Book } from './types';
export type Level = 'low' | 'mid' | 'high';
export interface Engine { index: Index; unsafe: Set<string>; embed: ((t: string) => Promise<Float32Array>) | null; glossary?: Glossary }
export interface Decision { kind: SafetyKind; hits: Hit[]; via: 'semantic' | 'lexical'; level: Level; stamp: '唤醒' | '借出' | null; top: number; query: string; constraints: string[]; met: boolean }
export const CONF = { semantic: { lo: +(globalThis.process?.env?.CLO ?? 3.3), hi: +(globalThis.process?.env?.CHI ?? 9) }, lexical: { lo: 3, hi: 5.5 } };
/** Truly obscure for 唤醒: rare in absolute Chinese views and rarer than most of the shelf. Stricter than the card's "久未借出". */
export const deeplyAsleep = (b: Book) => (b.obscurity.zhViews ?? 0) < 800 && b.obscurity.percentile >= 0.8;
let seedVecs: Record<string, Float32Array[]> | null = null, seedFor: unknown = null;
export async function classify(note: string, eng: Engine): Promise<SafetyKind> {
  const k = keywordCheck(note); if (k !== 'ok' || !eng.embed || isEnglish(note)) return k;
  if (seedFor !== eng.embed) { seedVecs = Object.fromEntries(await Promise.all(Object.entries(SEEDS).map(async ([c, v]) => [c, await Promise.all(v.map(t => eng.embed!(t)))]))); seedFor = eng.embed; }
  const v = embedCheck(await eng.embed(note), seedVecs!);
  return v === 'crisis' && framed(note) ? 'ok' : v;
}
const vecSims = async (t: string, eng: Engine) => { const v = centre(await eng.embed!(t), eng.index.mean); return eng.index.books.map((_, i) => dot(v, eng.index, i)); };
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '');
export async function decide(note: string, eng: Engine, given: Set<string> = new Set()): Promise<Decision> {
  const kind = await classify(note, eng);
  const none = { hits: [], via: 'lexical' as const, level: 'low' as const, stamp: null, top: 0, query: note, constraints: [], met: false };
  if (kind !== 'ok') return { kind, ...none };
  const books = eng.index.books;
  const hasLatin = /[a-z]/i.test(note), hasHan = /[\u4e00-\u9fa5]/.test(note);
  const rewritten = (isEnglish(note) || (hasLatin && hasHan)) && eng.glossary ? toChinese(note, eng.glossary) : null;
  const query = rewritten?.zh || note;
  const lexQ = rewritten ? `${query} ${note}` : note;
  const lex = lexicalSims(lexQ, books), e = expand(query + (rewritten?.titles?.length ? ' ' + rewritten.titles.join(' ') : '')), exp = expansionScores(e, books);
  const confident = !e.terms.length || exp.some((x, i) => x > 0 && !eng.unsafe.has(books[i].id) && !given.has(books[i].id));
  const exclude = new Set([...given, ...eng.unsafe]);
  let S: number[], via: Decision['via'], vTop = new Set<string>(), v1 = '';
  if (eng.embed) {
    let V = await vecSims(query, eng);
    if (rewritten) {
      // English / mixed: blend original note so EN phrasing still pulls matching aliases/summaries.
      const V2 = await vecSims(note, eng);
      const wEn = isEnglish(note) ? 0.45 : 0.3;
      V = V.map((x, i) => (1 - wEn) * x + wEn * V2[i]);
    }
    S = hybrid(V, lex, exp); via = 'semantic';
    const order = V.map((x, i) => [x, i] as const).filter(([, i]) => !exclude.has(books[i].id)).sort((a, b) => b[0] - a[0]);
    vTop = new Set(order.slice(0, +(globalThis.process?.env?.VTOP ?? 6)).map(([, i]) => books[i].id));
    v1 = books[order[0][1]]?.id ?? '';
    const dual = dualTopics(note) ?? dualTopics(query);
    if (dual) { const [a, b] = await Promise.all(dual.map(p => vecSims(p, eng))); const za = zs(a), zb = zs(b); S = S.map((x, i) => 0.55 * x + 0.7 * Math.min(za[i], zb[i])); }
  } else { S = hybrid(null, lex, exp); via = 'lexical'; }
  // Exact title / alias hits from Latin spans (and full English note vs originalTitle).
  const titleKeys = [...(rewritten?.titles ?? [])];
  if (isEnglish(note) && !titleKeys.length) titleKeys.push(...(note.match(/\b([A-Z][A-Za-z''.-]*(?:[ \u00a0]+[A-Za-z][A-Za-z''.-]*){1,7})\b/g) ?? []));
  if (titleKeys.length || (rewritten?.terms.length && isEnglish(note))) {
    const keys = titleKeys.map(compact).filter(k => k.length >= 4);
    const terms = new Set((rewritten?.terms ?? []).map(t => t.toLowerCase()));
    S = S.map((s, i) => {
      const blob = `${books[i].title}|${books[i].originalTitle ?? ''}|${(books[i].aliases ?? []).join('|')}`;
      const c = compact(blob);
      let bonus = keys.some(k => c.includes(k)) ? 10 : 0;
      // Light boost when an English content word appears in aliases/originalTitle (feminism, satire, … via glossary zh already in query).
      if (!bonus && terms.size) {
        const low = blob.toLowerCase();
        for (const t of terms) if (t.length >= 2 && (low.includes(t) || c.includes(compact(t)))) { bonus = 1.5; break; }
      }
      return s + bonus;
    });
  }
  const cons: Constraint[] = extract(note); let met = !cons.length;
  if (cons.length) {
    const order = S.map((s, i) => [s, i] as const).filter(([, i]) => !exclude.has(books[i].id)).sort((a, b) => b[0] - a[0]).slice(0, 400).map(([, i]) => i);
    const all = new Set(order.filter(i => cons.every(c => c.test(books[i]))));
    if (all.size >= 2) {
      const vals = [...all].map(i => S[i]), z = zs(vals);
      const remap = new Map([...all].map((i, k) => [i, z[k] * 3 + 6]));
      S = S.map((s, i) => (remap.has(i) ? remap.get(i)! : s - 100));
      met = true;
    } else S = S.map((s, i) => s + 1.8 * cons.filter(c => c.test(books[i])).length / cons.length);
  }
  // Prefer relevance over obscurity for top-1 (lambda lowered from 0.35).
  const hits = rank(S, books, { exclude, lambda: +(globalThis.process?.env?.LAMBDA ?? 0.18) });
  const top = hits[0]?.sim ?? 0, th = CONF[via];
  const level: Level = !confident || top < th.lo ? 'low' : top >= th.hi ? 'high' : 'mid';
  const b = hits[0]?.book;
  // 唤醒 ONLY when: high confidence (on-topic proxy), constraints met, book is vector-near (top-6),
  // and truly obscure. Mid/low never stamp — wrong-stamp rate was 0.85 when mid+high both stamped.
  const stamp: Decision['stamp'] = b && met && level === 'high' && deeplyAsleep(b) && vTop.has(b.id) && b.id === (hits[0]?.book.id)
    ? '唤醒' : '借出';
  void v1;
  return { kind, hits, via, level, top, query, constraints: cons.map(c => c.label), met, stamp };
}
