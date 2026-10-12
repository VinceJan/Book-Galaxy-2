// Offline embeddings for every book with the same self-hosted model the browser uses for queries.
// Doc = mean of two views: (title/author/region + grounded 适合处境 lines + hook) and (summary).
// Mean-centred over the corpus (reduces hubness), renormalised, int8-quantised.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pipeline } from '@huggingface/transformers';
import { situations } from '../src/situations';
import type { Book } from '../src/types';
const MODEL = 'Xenova/bge-small-zh-v1.5', POOL = 'cls' as const, QP = '为这个句子生成表示以用于检索相关文章：';
const books: Book[] = JSON.parse(fs.readFileSync('public/data/books.json', 'utf8')).books;
const fe = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
const emb = async (t: string) => Array.from((await fe(t, { pooling: POOL, normalize: true })).data as Float32Array);
const V: number[][] = [];
for (const b of books) {
  const a = await emb(`《${b.title}》${b.author ?? ''}，${b.country ?? ''}。适合：${situations(b).map(x => x.s).join('；')}。${b.hook}`);
  const c = await emb(`${b.title}。${b.summary.slice(0, 450)}`);
  V.push(a.map((x, k) => (x + c[k]) / 2));
}
const D = V[0].length, N = V.length, mean = new Array(D).fill(0); V.forEach(v => v.forEach((x, k) => (mean[k] += x / N)));
const SCALE = 400, buf = new Int8Array(N * D);
V.forEach((v, i) => { const c = v.map((x, k) => x - mean[k]); const n = Math.hypot(...c); c.forEach((x, k) => (buf[i * D + k] = Math.max(-127, Math.min(127, Math.round((x / n) * SCALE))))); });
const dir = `public/models/${MODEL}`, size = (f: string) => fs.statSync(`${dir}/${f}`).size;
// What the reader actually transfers (GitHub Pages serves these gzip-compressed).
const gz = (p: string) => zlib.gzipSync(fs.readFileSync(p), { level: 6 }).length; void size;
const dl = ['onnx/model_quantized.onnx', 'tokenizer.json'].reduce((a, f) => a + gz(`${dir}/${f}`), 0) + gz('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm');
fs.writeFileSync('public/data/vectors.i8.bin', Buffer.from(buf.buffer));
fs.writeFileSync('public/data/vectors.meta.json', JSON.stringify({ model: MODEL, pooling: POOL, queryPrefix: QP, dtype: 'q8', dim: D, count: N, scale: SCALE, downloadMB: Math.round(dl / 1e6), mean: mean.map(x => +x.toFixed(6)), order: books.map(b => b.id), builtAt: new Date().toISOString() }));
console.log('ok dim', D, 'download MB', dl / 1e6);
