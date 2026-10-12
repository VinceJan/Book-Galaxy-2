import type { Book } from './types';
export interface Index { books: Book[]; dim: number; vecs: Int8Array; scale: number; mean: Float32Array }
export interface Hit { book: Book; sim: number; score: number }

/** Cosine between a (mean-centred, unit) query and int8 doc row i. Doc rows are unit vectors * scale. */
export function dot(q: Float32Array, idx: Index, i: number): number {
  let s = 0; const o = i * idx.dim; for (let k = 0; k < idx.dim; k++) s += q[k] * idx.vecs[o + k]; return s / idx.scale;
}
export function centre(q: ArrayLike<number>, mean: Float32Array): Float32Array {
  const c = new Float32Array(mean.length); let n = 0;
  for (let k = 0; k < mean.length; k++) { c[k] = q[k] - mean[k]; n += c[k] * c[k]; }
  n = Math.sqrt(n) || 1; for (let k = 0; k < c.length; k++) c[k] /= n; return c;
}
/** Relevance first: take the top-K by similarity, then re-rank toward obscure books. */
export function rank(sims: number[], books: Book[], opts: { exclude?: Set<string>; k?: number; lambda?: number } = {}): Hit[] {
  const { exclude = new Set(), k = 24, lambda = 0.35 } = opts;
  const cand = books.map((book, i) => ({ book, sim: sims[i] })).filter(h => !exclude.has(h.book.id)).sort((a, b) => b.sim - a.sim).slice(0, k);
  if (!cand.length) return [];
  const top = cand[0].sim, bottom = cand[cand.length - 1].sim, span = top - bottom || 1;
  return cand.map(h => ({ ...h, score: (h.sim - bottom) / span + lambda * h.book.obscurity.score })).sort((a, b) => b.score - a.score);
}
/** Lexical fallback (while the model loads or if it fails): character-bigram overlap, IDF-weighted. */
export function bigrams(s: string): string[] { const t = s.replace(/[\s\p{P}]/gu, ''); const out: string[] = []; for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2)); return out; }
export function lexicalSims(note: string, books: Book[]): number[] {
  const docs = books.map(b => new Set(bigrams(`${b.title}${(b.aliases ?? []).join('')}${b.author ?? ''}${b.themes.join('')}${b.hook}${b.summary}`)));
  const df = new Map<string, number>(); docs.forEach(d => d.forEach(g => df.set(g, (df.get(g) ?? 0) + 1)));
  const q = [...new Set(bigrams(note))];
  return docs.map(d => q.reduce((s, g) => (d.has(g) ? s + Math.log(books.length / (df.get(g) ?? 1)) : s), 0));
}

import type { Expansion } from './expand';
/** Expansion boost: theme membership + expanded-term hits in the first 300 chars of the description. */
export function expansionScores(e: Expansion, books: Book[]): number[] {
  if (!e.themes.length && !e.terms.length) return books.map(() => 0);
  return books.map(b => { const t = b.title + b.summary.slice(0, 300); let s = 0;
    for (const th of e.themes) if (b.themes.includes(th)) s += 1;
    for (const w of e.terms) if (t.includes(w)) s += w.length > 1 ? 1 : 0.4;
    return Math.min(3, s); });
}
const z = (a: number[]) => { const m = a.reduce((x, y) => x + y, 0) / a.length; const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) || 1; return a.map(x => (x - m) / sd); };
/** Hybrid relevance: z-scored vector sim + lexical + expansion. Weights tuned on eval/notes.json. */
export function hybrid(vec: number[] | null, lex: number[], exp: number[], w = { v: 1, l: 0.35, e: 0.9 }): number[] {
  const V = vec ? z(vec) : lex.map(() => 0), Lx = z(lex), E = z(exp.some(x => x) ? exp : exp.map(() => 0));
  return V.map((v, i) => w.v * v + w.l * Lx[i] + w.e * (exp.some(x => x) ? E[i] : 0));
}
