import type { Book, Para } from './types';
import { situations, cleanQuote, safeSentence } from './situations';
import { expand } from './expand';

/** Openings answer the *situation*, never claim facts about the book. Keyed by the first lexicon rule the note triggers. */
const OPEN: [RegExp, string][] = [
  [/累|工作|上班|意义感|加班/, '你说累。我没给你打鸡血的书，也没给你讲道理。'],
  [/失恋|分手|不想被安慰/, '你说不想被安慰，那我就不安慰你。'],
  [/害怕|恐怖|吓/, '想被吓一跳，是件很勇敢的事。我把灯调暗了一格。'],
  [/焦虑|睡不着|失眠/, '睡不着的时候，书库里也有一盏灯是给你留的。'],
  [/孤独|寂寞|一个人/, '一个人的夜里，书架其实很挤。'],
  [/父亲|爸爸/, '有些话，书比人先说出口。'],
  [/母亲|妈妈/, '关于母亲，书里的人也常常说不清楚。'],
  [/孩子|睡前/, '睡前故事要短一点，也要远一点。'],
  [/逃离|城市|远方|旅行/, '想走的时候，先让一本书替你走一段。'],
  [/死亡|死|去世/, '这件事很重，我挑书的时候放慢了一些。'],
  [/好笑|轻松|开心/, '今晚值班的人也想笑一下。'],
];
const fallbackOpen = '我没去畅销榜那一排。';
const CN = '零一二三四五六七八九';
/** Human rounding of a count, Chinese style: 573 → 五百来, 1840 → 一千八百来, 86 → 不到一百. */
export function humanCount(n: number): string {
  if (n < 100) return '不到一百'; if (n < 1000) return `${CN[Math.floor(n / 100)]}百来`;
  if (n < 10000) { const k = Math.floor(n / 1000), h = Math.floor((n % 1000) / 100); return `${CN[k]}千${h ? CN[h] + '百' : ''}来`; }
  return `${Math.floor(n / 10000)}万多`;
}
/** Absolute + relative threshold: a book is "sleeping" only if few people opened it, not just "less than median". */
export const isSleeping = (b: Book) => (b.obscurity.zhViews ?? 0) < 3000 && b.obscurity.percentile >= 0.6;

/** Whole sentences from the catalog summary (never cut mid-sentence), cleaned of foreign-name parentheticals. */
export function excerpt(b: Pick<Book, 'summary' | 'hook'>, min = 70, max = 200, focus?: string): string {
  const src = cleanQuote((b.summary || b.hook || '').trim()); if (!src) return '';
  let sents = src.match(/[^。！？!?]+[。！？!?」”]*/g) ?? [src]; let out = '';
  // When the letter claims a situation, start the quote at the sentence that proves it (so the evidence is visible).
  if (focus) { const k = sents.findIndex(x => x.includes(focus) && safeSentence(x)); if (k > 0) sents = [sents[0], ...sents.slice(k)].filter((x, i, a) => i === 0 ? a.length === 1 || x.length < 80 : true); }
  for (const s of sents) { if (!safeSentence(s)) { if (out) break; continue; } if (out && out.length + s.length > max) break; out += s; if (out.length >= min) break; }
  return out.trim();
}

/** Offline letter. Every factual clause is filled from catalog fields; voice lines contain no facts. */
export function composeLetter(note: string, b: Book, byId: Map<string, Book>, confident = true): Para[] {
  const p: Para[] = [];
  p.push({ k: 'note', t: note });
  p.push({ k: 'say', t: confident ? OPEN.find(([re]) => re.test(note))?.[1] ?? fallbackOpen : '说实话，这一千本书里没有一本是专门写这个的。我不想骗你，就挑了一本离它最近的。' });
  const who = [b.author, b.year ? `${b.year} 年` : null].filter(Boolean).join('，');
  const exp = expand(note), sit = situations(b);
  const shared = sit.find(x => exp.terms.some(t => x.evidence.includes(t) || t.includes(x.evidence)) || exp.themes.some(t => x.evidence === `主题:${t}`)) ?? null;
  p.push({ k: 'say', t: `我从架上抽了《${b.title}》${who ? `（${who}）` : ''}给你。${shared ? `如果你此刻${shared.s}，它正合适。` : ''}` });
  const ex = excerpt(b, 70, 220, shared && !shared.evidence.startsWith('主题:') ? shared.evidence : undefined); if (ex) p.push({ k: 'quote', t: ex });
  if (isSleeping(b)) p.push({ k: 'say', t: `这一年，中文世界里只有${humanCount(b.obscurity.zhViews ?? 0)}人点开过它的词条。它在架上等得够久了。` });
  const nx = nextBook(b, byId); if (nx) p.push({ k: 'say', t: nx });
  return p;
}
export function methodLine(b: Book, via: 'semantic' | 'lexical', window: [string, string]) {
  const o = b.obscurity;
  return `${via === 'semantic' ? '语义检索' : '字面检索'} · 维基浏览 ${window[0].slice(0, 6)}–${window[1].slice(0, 6)}：中文 ${o.zhViews?.toLocaleString() ?? '—'} / 英文 ${o.enViews?.toLocaleString() ?? '—'} · ${o.sitelinks} 个语言版本 · 冷门度 ${Math.round(o.percentile * 100)}`;
}
/** Optional live rewrite (VITE_LLM_ENDPOINT). Output is accepted only if every 《title》 and number it mentions exists in the draft. */
export async function rewrite(paragraphs: Para[], facts: unknown): Promise<Para[]> {
  const url = import.meta.env.VITE_LLM_ENDPOINT as string | undefined;
  if (!url) return paragraphs;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ instruction: '把草稿改写成夜班馆员写给读者的一封短信。只能使用草稿里的事实，不许添加任何书名、数字、人名。', facts, draft: paragraphs.map(x => x.t) }), signal: AbortSignal.timeout(8000) });
    const j = await r.json(); if (!Array.isArray(j.paragraphs) || !j.paragraphs.length) return paragraphs;
    const draft = paragraphs.map(x => x.t).join(''), out = j.paragraphs.map(String);
    const grounded = out.every((t: string) => [...t.matchAll(/《[^》]+》|\d[\d,.]*/g)].every(m => draft.includes(m[0])));
    return grounded ? [paragraphs[0], ...out.map((t: string) => ({ k: 'say' as const, t }))] : paragraphs;
  } catch { return paragraphs; }
}

/** Human phrasing of shared catalog themes (never shown raw). */
const THEME: Record<string, string> = { 神话与超自然: '都住着人以外的东西', 哲学与信仰: '都在追问人为什么活着', 司法与正义: '都绕着一桩罪与罚打转', 权力与政治: '都写权力怎样改变人',
  爱情与亲密关系: '都写两个人之间说不清的东西', 旅行与远方: '都在路上', 历史记忆: '都在替一段过去作证', 苦难与救赎: '都写人怎样熬过最坏的日子', 文明与未来: '都在想人类会走到哪里',
  记忆与时间: '都和时间较劲', 成长与教育: '都写一个人怎样长大', 帝国与殖民: '都发生在帝国的阴影下', 战争与创伤: '都写战争留下的伤', 阶级与贫困: '都写穷和劳作',
  迁徙与乡土: '都写离开和故乡', 艺术与创作: '都写创作这件事本身', 身体与疾病: '都写身体和病', 孤独与异化: '都写一个人的孤独', 生态与环境: '都写人和自然',
  自由与压迫: '都写自由的代价', 家族与代际: '都写一家几代人', 身份与自我: '都在问"我是谁"', 科学与技术: '都对世界怎样运转着迷', 宗教经典: '都是被人一遍遍诵读的经典', 城市与现代性: '都写城市里的人' };
/** A next book from v1's relation graph, explained only with real shared facts. */
export function nextBook(b: Book, byId: Map<string, Book>): string | null {
  const opts = b.links.map(l => ({ l, nb: byId.get(l.id) })).filter(x => x.nb && x.nb.id !== b.id) as { l: Book['links'][0]; nb: Book }[];
  for (const { l, nb } of opts) { const t = l.sharedThemes.find(x => THEME[x]); if (t) return `读完如果还想走远一点，去找《${nb.title}》——它和这本${THEME[t]}${l.band === 'far' ? '，只是隔着很远的书架' : ''}。`; }
  const sameAuthor = opts.find(x => x.nb.author && x.nb.author === b.author); if (sameAuthor) return `读完如果还想走远一点，同一位作者还写过《${sameAuthor.nb.title}》。`;
  const o = opts[0]; if (o && o.nb.year && b.year && o.nb.year !== b.year) { const d = o.nb.year - b.year; return `读完如果还想走远一点，去找《${o.nb.title}》，它${d > 0 ? `晚 ${d} 年` : `早 ${-d} 年`}出现。`; }
  return null;
}
