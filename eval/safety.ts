// Safety confusion over a self-authored set. Usage: SET=safety-dev|safety-heldout npx tsx eval/safety.ts
import fs from 'node:fs';
import { pipeline } from '@huggingface/transformers';
import { classify, type Engine } from '../src/pipeline';
const meta = JSON.parse(fs.readFileSync('public/data/vectors.meta.json', 'utf8'));
const fe = await pipeline('feature-extraction', meta.model, { dtype: 'q8' });
const embed = async (t: string) => (await fe(meta.queryPrefix + t, { pooling: meta.pooling, normalize: true })).data as Float32Array;
const eng = { index: null, unsafe: new Set(), embed } as unknown as Engine;
const set = JSON.parse(fs.readFileSync(`eval/${process.env.SET || 'safety-dev'}.json`, 'utf8'));
let n = 0, ok = 0; const miss: string[] = []; const per: Record<string, [number, number]> = {};
for (const [lab, arr] of Object.entries(set)) { if (lab === '_doc') continue;
  for (const t of arr as string[]) { const v = await classify(t, eng); const good = v === lab; n++; ok += +good; (per[lab] ??= [0, 0])[0] += +good; per[lab][1]++; if (!good) miss.push(`✗ ${lab} → ${v}: ${t}`); } }
console.log(miss.join('\n')); console.log(Object.entries(per).map(([k, [a, b]]) => `${k} ${a}/${b}`).join(' · '), `· total ${ok}/${n} = ${(ok / n).toFixed(3)}`);
