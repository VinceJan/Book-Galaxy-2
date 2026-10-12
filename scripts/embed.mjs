// Offline multilingual embeddings (same model the browser loads for queries).
// Each book = mean of two views (short: title+themes+hook, long: summary), mean-centred over the corpus
// to reduce hubness, renormalised, quantised to int8. The browser subtracts the same mean from queries.
import fs from 'node:fs';
import { pipeline } from '@huggingface/transformers';
export const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const cat = JSON.parse(fs.readFileSync('/workspace/Book-Galaxy/public/data/catalog.runtime.json', 'utf8'));
const fe = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
const D = 384, N = cat.books.length, emb = async t => (await fe(t, { pooling: 'mean', normalize: true })).data;
const V = [];
for (const b of cat.books) {
  const a = await emb(`${b.title}。${(b.themes || []).join('、')}。${b.hook || ''}`);
  const c = await emb(`${b.title}。${(b.summary || b.hook || '').slice(0, 400)}`);
  V.push(a.map((x, k) => (x + c[k]) / 2));
}
const mean = new Float32Array(D); V.forEach(v => v.forEach((x, k) => (mean[k] += x / N)));
const SCALE = 400, buf = new Int8Array(N * D);
V.forEach((v, i) => { const c = v.map((x, k) => x - mean[k]); const n = Math.hypot(...c); c.forEach((x, k) => (buf[i * D + k] = Math.max(-127, Math.min(127, Math.round((x / n) * SCALE))))); });
fs.writeFileSync('public/data/vectors.i8.bin', Buffer.from(buf.buffer));
fs.writeFileSync('public/data/vectors.meta.json', JSON.stringify({ model: MODEL, dtype: 'q8', pooling: 'mean', dim: D, count: N, scale: SCALE, mean: Array.from(mean, x => +x.toFixed(6)), order: cat.books.map(b => b.id), builtAt: new Date().toISOString() }));
console.log('ok');
