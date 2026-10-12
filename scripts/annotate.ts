// Adds auditable 适合处境 lines and a safety flag to books.json.
// Preferred source: grounded LLM lines from the data repo (book-galaxy-data, gated by its checker);
// fallback: rule lines from src/situations.ts (each with the evidence word that triggered it).
import fs from 'node:fs';
import { situations, isSafe } from '../src/situations';
const f = 'public/data/books.json', cat = JSON.parse(fs.readFileSync(f, 'utf8'));
const LLM = process.env.BG_DATA ?? '/workspace/book-galaxy-data/work/llm/situations.accepted.jsonl';
const HOOKS = process.env.BG_HOOKS ?? '/workspace/book-galaxy-data/work/llm/hooks.accepted.jsonl';
const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
const llm = new Map<string, { text: string; anchor?: string }[]>(); for (const r of read(LLM)) { const k = r.key ?? r.id; if (r.text) (llm.get(k) ?? llm.set(k, []).get(k)!).push({ text: r.text, anchor: r.anchor }); }
const hooks = new Map<string, string>(); for (const r of read(HOOKS)) if (r.text) hooks.set(r.key ?? r.id, r.text);
let fromLlm = 0;
for (const b of cat.books) {
  const l = llm.get(b.id);
  b.situations = l?.length ? (fromLlm++, l.map(x => ({ s: x.text, evidence: x.anchor ?? '', source: 'llm' }))) : situations(b).map(x => ({ ...x, source: 'rule' }));
  if (hooks.has(b.id)) b.librarian = hooks.get(b.id);
  b.safe = isSafe(b);
}
fs.writeFileSync(f, JSON.stringify(cat));
console.log('situations: llm', fromLlm, 'rule', cat.books.length - fromLlm, '· librarian lines', hooks.size, '· unsafe', cat.books.filter((b: { safe: boolean }) => !b.safe).map((b: { title: string }) => b.title));
