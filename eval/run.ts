// Retrieval eval: 30 situational notes with hand-judged acceptable books (eval/notes.json).
import fs from 'node:fs';
import { pipeline } from '@huggingface/transformers';
import { rank, lexicalSims, expansionScores, hybrid } from '../src/retrieve';
import { expand } from '../src/expand';
import { situations, isSafe } from '../src/situations';
import type { Book } from '../src/types';
const books: Book[] = JSON.parse(fs.readFileSync('public/data/books.json', 'utf8')).books;
const forbid: Record<string, string[]> = JSON.parse(fs.readFileSync('eval/forbidden.json', 'utf8'));
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const notes: Record<string, string[]> = JSON.parse(fs.readFileSync('eval/notes.json', 'utf8'));
const ok = (q: string, b: Book) => notes[q].some(t => b.title.startsWith(t.slice(0, 6)));
const MODELS = { minilm: { id: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', pool: 'mean', qp: '' }, bgezh: { id: 'Xenova/bge-small-zh-v1.5', pool: 'cls', qp: process.env.QP ?? '为这个句子生成表示以用于检索相关文章：' } } as const;
export const docText = { basic: (b: Book) => [`${b.title}。${b.themes.join('、')}。${b.hook}`, `${b.title}。${b.summary.slice(0, 400)}`],
  situ: (b: Book) => [`《${b.title}》${b.author ?? ''}，${b.country ?? ''}。适合：${situations(b).map(x => x.s).join('；')}。${b.hook}`, `${b.title}。${b.summary.slice(0, 450)}`],
  rich: (b: Book) => [`《${b.title}》${b.author ?? ''}，${b.year ?? ''}，${b.country ?? ''}。主题：${b.themes.join('、')}。${b.hook}`, `${b.title}。${b.summary.slice(0, 450)}`] };
fs.mkdirSync('eval/cache', { recursive: true });
async function docs(m: keyof typeof MODELS, t: keyof typeof docText) {
  const f = `eval/cache/${m}-${t}.json`; if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')) as number[][];
  const fe = await pipeline('feature-extraction', MODELS[m].id, { dtype: 'q8' }); const out: number[][] = [];
  for (const b of books) { const vs = await Promise.all(docText[t](b).map(async s => Array.from((await fe(s, { pooling: MODELS[m].pool, normalize: true })).data as Float32Array)));
    out.push(vs[0].map((x, k) => (x + vs[1][k]) / 2)); }
  fs.writeFileSync(f, JSON.stringify(out)); return out;
}
const centreAll = (V: number[][]) => { const D = V[0].length, m = new Array(D).fill(0); V.forEach(v => v.forEach((x, k) => (m[k] += x / V.length))); const C = V.map(v => { const c = v.map((x, k) => x - m[k]); const n = Math.hypot(...c); return c.map(x => x / n); }); return { C, m }; };
const res: Record<string, Record<string, number>> = {};
for (const m of Object.keys(MODELS) as (keyof typeof MODELS)[]) { if (ONLY.length && !ONLY.some(o => o.startsWith(m))) continue;
  const fe = await pipeline('feature-extraction', MODELS[m].id, { dtype: 'q8' });
  const qv: Record<string, number[]> = {}; for (const q of Object.keys(notes)) qv[q] = Array.from((await fe(MODELS[m].qp + q, { pooling: MODELS[m].pool, normalize: true })).data as Float32Array);
  for (const t of Object.keys(docText) as (keyof typeof docText)[]) { if (ONLY.length && !ONLY.includes(`${m}/${t}`)) continue;
    const { C, m: mean } = centreAll(await docs(m, t));
    for (const mode of (process.env.MODES ?? 'vector,hybrid,lexical+exp').split(',')) {
      const r = { h1: 0, h3: 0, p3: 0, rel5: 0, bad: 0 }; const safe = new Set(books.filter(b => !process.env.NOSAFE && !isSafe(b)).map(b => b.id));
      for (const q of Object.keys(notes)) {
        const qc = qv[q].map((x, k) => x - mean[k]); const vs = C.map(c => c.reduce((s, x, k) => s + x * qc[k], 0));
        const lx = lexicalSims(q, books), ex = expansionScores(expand(q), books);
        const sims = mode === 'vector' ? vs : mode === 'hybrid' ? hybrid(vs, lx, ex, { v: 1, l: +(process.env.WL ?? 0.35), e: +(process.env.WE ?? 0.6) }) : hybrid(null, lx, ex);
        const pure = rank(sims, books, { lambda: 0, exclude: safe }).slice(0, 5); const hits = rank(sims, books, { exclude: safe });
        r.bad += +(forbid[q] ?? []).some(t => hits[0].book.title === t);
        r.h1 += +ok(q, hits[0].book); r.h3 += +hits.slice(0, 3).some(h => ok(q, h.book)); r.p3 += hits.slice(0, 3).filter(h => ok(q, h.book)).length / 3; r.rel5 += +pure.some(h => ok(q, h.book));
        if (process.env.SHOW && m === process.env.SHOW && t === (process.env.SHOWT || 'situ') && mode === (process.env.SHOWM || 'hybrid')) console.log(q, '→', hits.slice(0, 3).map(h => (ok(q, h.book) ? '✓' : '✗') + h.book.title).join(' '));
      }
      const n = Object.keys(notes).length; res[`${m}/${t}/${mode}`] = { h1: +(r.h1 / n).toFixed(3), h3: +(r.h3 / n).toFixed(3), p3: +(r.p3 / n).toFixed(3), rel5: +(r.rel5 / n).toFixed(3), forbiddenTop1: r.bad };
    }
  }
}
console.table(res); fs.writeFileSync('eval/results.json', JSON.stringify(res, null, 1));
