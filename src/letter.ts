import type { Book, Para } from './types';
import { describeObscurity } from './obscurity';
const BAND: Record<string, string> = { near: '就在它隔壁', middle: '隔着几排书架', far: '在书库很远的另一头' };
/** Offline template layer. Every clause is filled from catalog fields; nothing is invented. */
export function composeLetter(note: string, b: Book, byId: Map<string, Book>, window: [string, string], via: 'semantic' | 'lexical'): Para[] {
  const who = [b.author, b.year ? `${b.year} 年` : null, b.country].filter(Boolean).join('，');
  const p: Para[] = [];
  p.push({ k: 'say', t: `你写：“${note}”` });
  p.push({ k: 'say', t: `我没去畅销榜那一排。${via === 'semantic' ? '我把你的话和一千本书的简介逐一比对了意思' : '我按你写下的字在一千本书的简介里找了找'}，最后抽出的是《${b.title}》${who ? `（${who}）` : ''}。` });
  const ex = excerpt(b); if (ex) p.push({ k: 'quote', t: ex });
  p.push({ k: 'data', t: describeObscurity(b, window) });
  const next = b.links.map(l => ({ l, nb: byId.get(l.id) })).find(x => x.nb);
  if (next?.nb) {
    const why = next.l.sharedThemes.length ? `，它们都被归在「${next.l.sharedThemes.join('」「')}」` : '';
    p.push({ k: 'say', t: `如果读完还想走远一点：《${next.nb.title}》${BAND[next.l.band ?? ''] ?? '离它不远'}${why}。` });
  }
  return p;
}
/** Optional live rewrite. Only used when VITE_LLM_ENDPOINT is set; it receives the facts and the template, and must return {paragraphs: string[]}. */
export async function rewrite(paragraphs: Para[], facts: unknown): Promise<Para[]> {
  const url = import.meta.env.VITE_LLM_ENDPOINT as string | undefined;
  if (!url) return paragraphs;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ instruction: 'Rewrite as a warm Chinese letter from a night librarian. Use ONLY the given facts; do not add any.', facts, draft: paragraphs.map(x => x.t) }), signal: AbortSignal.timeout(8000) });
    const j = await r.json(); return Array.isArray(j.paragraphs) && j.paragraphs.length ? j.paragraphs.map((t: string) => ({ k: 'say' as const, t: String(t) })) : paragraphs;
  } catch { return paragraphs; }
}

/** Whole sentences from the catalog summary (never cut mid-sentence), ~90–220 chars. */
export function excerpt(b: Pick<Book, 'summary' | 'hook'>, min = 90, max = 220): string {
  const src = (b.summary || b.hook || '').trim(); if (!src) return '';
  const sents = src.match(/[^。！？!?]+[。！？!?」”]*/g) ?? [src]; let out = '';
  for (const s of sents) { if (out && out.length + s.length > max) break; out += s; if (out.length >= min) break; }
  return out.trim();
}
