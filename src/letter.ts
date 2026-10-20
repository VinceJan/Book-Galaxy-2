import type { Book, Para } from './types';
import { situations, cleanQuote, safeSentence } from './situations';
import { expand } from './expand';

/** Openings answer the *situation*, never claim facts about the book. Several per mood, rotated by note. */
const OPEN: [RegExp, string[]][] = [
  [/累|工作|上班|意义感|加班/, ['你说累。我没给你打鸡血的书，也没给你讲道理。', '累的时候，最不需要的是一本教你振作的书。', '先把工牌摘了。下面这本不会催你。']],
  [/失恋|分手|不想被安慰/, ['你说不想被安慰，那我就不安慰你。', '不安慰。只递一本书，你自己翻。']],
  [/害怕|恐怖|吓/, ['想被吓一跳，是件很勇敢的事。我把灯调暗了一格。', '这本适合关着灯读，但别读到太晚。']],
  [/焦虑|睡不着|失眠/, ['睡不着的时候，书库里也有一盏灯是给你留的。', '凌晨的书库很安静，适合心跳慢下来。']],
  [/孤独|寂寞|一个人/, ['一个人的夜里，书架其实很挤。', '你不是今晚唯一醒着的人。']],
  [/父亲|爸爸|母亲|妈妈|家里/, ['有些话，书比人先说出口。', '家里的事，书里的人也常常说不清楚。']],
  [/死|去世|离开|走了|告别/, ['这件事很重，我挑书的时候放慢了一些。', '我没挑太轻的，也没挑太重的。']],
];
/** First sentences. Each is a different shape (echo the note, describe the walk, a real catalog fact, the hour …).
 *  Facts come only from catalog fields or the clock, and are said the way a librarian would say them:
 *  no counts, scores, years-since arithmetic or raw catalog labels (same copy rules as v1; npm run check:copy). */
type Op = (c: { note: string; b: Book; hour: number }) => string | null;
const century = (y: number | null) => (y == null ? null : y < 0 ? '公元前的' : `${Math.floor((y - 1) / 100) + 1}世纪的`);
const short = (n: string) => (n.length <= 10 ? n : n.slice(0, 9) + '…');
const OPENERS: Op[] = [
  ({ note }) => `“${short(note)}”——我把这几个字抄在借书单背面，下楼去了。`,
  () => '纸条收到了。我在书库里走了一圈。',
  () => '我带着你的纸条下了趟书库。',
  () => '你写得很短，我找得很久。',
  () => '我照着你的话，去了一排很少有人走的书架。',
  ({ hour }) => (hour >= 22 || hour < 5 ? '这么晚还在找书的人不多，你算一个。' : null),
  ({ hour }) => (hour >= 5 && hour < 11 ? '早上的书库还没开暖气，我裹着外套替你找了一本。' : null),
  ({ hour }) => (hour >= 11 && hour < 18 ? '白天的班还没交接，我先替你翻了翻。' : null),
  ({ hour }) => (hour >= 18 && hour < 22 ? '天刚黑，书库的灯一盏盏亮起来，我顺着灯走过去。' : null),
  ({ b }) => (b.facets?.genres?.[0] ? `这次去的是${b.facets.genres[0]}那几排。` : null),
  ({ b }) => (b.country && b.country !== '未注明' ? `我往${b.country}那一侧的书架走了几步。` : null),
  ({ b }) => (century(b.year) ? `我从${century(b.year)}书里抽了一本出来。` : null),
  ({ b }) => (b.year ? '它出版很多年了，一直在架上等。' : null),
  () => '我顺着书脊一本本摸过去，手停在了这一本上。',
  () => '有人写纸条要书，有人写纸条要答案。你的纸条我只能回一本书。',
  () => '我没有翻目录，是凭着你那句话往里走的。',
  () => '满架的书里挑一本，总有点像抽签。这次我抽得很认真。',
  ({ note }) => (note.length > 14 ? '你写了不少，我读得很慢。' : '只有一行字，但够我找了。'),
  () => '这张纸条在我桌上压了一会儿，我才想好拿哪一本。',
  () => '我先想了几本人人都知道的，又都放回去了。',
  ({ b }) => ((b.obscurity.zhViews ?? 0) < 3000 ? '我往书架深处走，那里的书很少被人借走。' : '这本不算冷门，可今晚它最对得上你的纸条。'),
  () => '借书卡我已经填好了，你只要接着往下看。',
  () => '先说结论：我替你找到一本。理由在下面。',
  () => '我在两本书之间犹豫了一会儿，最后拿了这一本。',
  ({ b }) => (b.author ? `我认得这个名字：${b.author.split('、')[0]}。` : null),
  () => '你的纸条让我想起架上一本书。',
  () => '今晚值班，正好有空替你找。',
  () => '这一本我是踮着脚从高处够下来的。',
];
/** Candid low-relevance openers (several, so a weak match does not always sound the same). */
const LOW = ['这次没找准。这满架的书里，好像没有一本正好写你说的事。我先放一本离它最近的在这里，你别太当真。',
  '老实说，馆里没有正对你这张纸条的书。下面这本只是挨得最近的。',
  '我找了一圈，没找到正中的那本。先给你一本沾边的，不合适就退回来。',
  '这张纸条有点难住我了——架上能接住它的书不多，这本算勉强。'];
export const OPENER_COUNT = OPENERS.length + OPEN.reduce((s, [, a]) => s + a.length, 0);
export const pick = <T,>(arr: T[], seed: string) => arr[hashStr(seed) % arr.length];
function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return h >>> 0; }
/** Absolute + relative threshold: a book is "sleeping" only if few people opened it, not just "less than median". */
export const isSleeping = (b: Book) => (b.obscurity.zhViews ?? 0) < 3000 && b.obscurity.percentile >= 0.6;

/** Whole sentences from the catalog summary (never cut mid-sentence), cleaned of foreign-name parentheticals. */
export function excerpt(b: Pick<Book, 'summary' | 'hook'>, min = 70, max = 200, focus?: string): string {
  const src = cleanQuote((b.summary || b.hook || '').trim()); if (!src) return '';
  let sents: string[] = src.match(/[^。！？!?]+[。！？!?」”]*/g) ?? [src]; let out = '';
  // When the letter claims a situation, start the quote at the sentence that proves it (so the evidence is visible).
  if (focus) { const k = sents.findIndex(x => x.includes(focus) && safeSentence(x)); if (k > 0) sents = [sents[0], ...sents.slice(k)].filter((x, i, a) => i === 0 ? a.length === 1 || x.length < 80 : true); }
  for (const s of sents) { if (!safeSentence(s)) { if (out) break; continue; } if (out && out.length + s.length > max) break; out += s; if (out.length >= min) break; }
  return out.trim();
}

export interface Confidence { level: 'high' | 'mid' | 'low'; alternatives: Book[] }
/** Offline letter. Voice lines contain no facts; factual lines come from catalog fields or from
 *  pre-generated, grounding-checked librarian lines (b.librarian). */
export function composeLetter(note: string, b: Book, byId: Map<string, Book>, conf: Confidence = { level: 'high', alternatives: [] }): Para[] {
  const p: Para[] = []; const seed = note + b.id;
  p.push({ k: 'note', t: note });
  if (conf.level === 'low') p.push({ k: 'say', t: pick(LOW, seed) });
  else {
    const mood = OPEN.find(([re]) => re.test(note))?.[1] ?? [];
    const ctx = { note, b, hour: new Date().getHours() };
    const pool = [...mood, ...mood, ...OPENERS.map(f => f(ctx)).filter((x): x is string => !!x)];
    p.push({ k: 'say', t: pick(pool, seed) });
  }
  const who = [b.author, b.year ? `${b.year} 年` : null].filter(Boolean).join('，');
  const lib = (b as Book & { librarian?: string }).librarian;
  p.push({ k: 'say', t: lib ?? pick([`这本是《${b.title}》${who ? `，${who}` : ''}。`, `我抽出来的是《${b.title}》${who ? `（${who}）` : ''}。`, `《${b.title}》${who ? `，${who}` : ''}。就是它。`, `给你的是《${b.title}》${who ? `——${who}` : ''}。`, `架上那本《${b.title}》${who ? `（${who}）` : ''}，我替你借出来了。`], seed) });
  const exp = expand(note), sit = situations(b);
  const shared = sit.find(x => exp.terms.some(t => x.evidence.includes(t) || t.includes(x.evidence))) ?? null;
  const ex = excerpt(b, 70, 220, shared && !shared.evidence.startsWith('主题:') ? shared.evidence : undefined); if (ex) p.push({ k: 'quote', t: ex });
  // How rarely it is opened is said, never counted.
  if (isSleeping(b) && conf.level !== 'low') p.push({ k: 'say', t: pick(['这一年里，中文世界很少有人点开过它的词条。', '过去一年，几乎没有人在中文维基上翻到它。它等得够久了。', '它很少被人想起——这一年里，打开它的人寥寥无几。'], seed) });
  if (conf.level === 'low' && conf.alternatives.length) p.push({ k: 'say', t: `也可以试试${conf.alternatives.slice(0, 2).map(a => `《${a.title}》`).join('或')}。要是都不对，换个说法再写一张，我重新找。` });
  else { const nx = nextBook(b, byId, seed); if (nx) p.push({ k: 'say', t: nx }); }
  return p;
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
const THEME: Record<string, string> = { 神话与超自然: '也住着人以外的东西', 哲学与信仰: '也在追问人为什么活着', 司法与正义: '也绕着一桩罪与罚打转', 权力与政治: '也写权力怎样改变人',
  爱情与亲密关系: '也写两个人之间说不清的东西', 旅行与远方: '也是一场出发', 历史记忆: '也在替一段过去作证', 苦难与救赎: '也写人怎样熬过最坏的日子', 文明与未来: '也在想人类会走到哪里',
  记忆与时间: '也在和时间较劲', 成长与教育: '也写一个人怎样长大', 帝国与殖民: '也发生在帝国的阴影下', 战争与创伤: '也写战争留下的伤', 阶级与贫困: '也写穷和劳作',
  迁徙与乡土: '也写离开和故乡', 艺术与创作: '也写创作这件事本身', 身体与疾病: '也写身体和病', 孤独与异化: '也写一个人的孤独', 生态与环境: '也写人和自然',
  自由与压迫: '也写自由的代价', 家族与代际: '也写一家几代人', 身份与自我: '也在问"我是谁"', 宗教经典: '也是被人一遍遍诵读的经典', 城市与现代性: '也写城市里的人' };
const NEXT = [(t: string, p: string) => `要是还想往下读：《${t}》${p}。`, (t: string, p: string) => `读完它，可以去隔壁找《${t}》，那本${p}。`, (t: string, p: string) => `下一本我会放《${t}》——${p}。`, (t: string, p: string) => `《${t}》${p}，留给下一个夜里。`];
/** A next book from the relation graph: prefer a grounded relation sentence; otherwise a shared real theme in plain words. */
export function nextBook(b: Book, byId: Map<string, Book>, seed = b.id): string | null {
  const opts = b.links.map(l => ({ l, nb: byId.get(l.id) })).filter(x => x.nb && x.nb.id !== b.id) as { l: Book['links'][0] & { grounded?: string }; nb: Book }[];
  const g = opts.find(x => x.l.grounded); if (g) return `读完如果还想走远一点：${g.l.grounded}`;
  for (const { l, nb } of opts) { const t = l.sharedThemes.find(x => THEME[x]); if (t) return pick(NEXT, seed)(nb.title, THEME[t]); }
  const sameAuthor = opts.find(x => x.nb.author && x.nb.author === b.author); if (sameAuthor) return `同一位作者还写过《${sameAuthor.nb.title}》，也在架上。`;
  return null;
}
