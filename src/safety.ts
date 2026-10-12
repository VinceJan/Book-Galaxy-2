/** Request-side safety. Runs before retrieval. Keyword layer (zh+en) always; an embedding layer
 *  (cosine to seed phrases, same model as retrieval) once the model is ready. */
export type SafetyKind = 'ok' | 'crisis' | 'harm' | 'sexual';
const KW: Record<Exclude<SafetyKind, 'ok'>, RegExp> = {
  crisis: /不想活|一了百了|不想再醒|想消失|消失就好|没有我会更好|我是.{0,4}累赘|撑不住了|生无可恋|活够了|离开这个世界|活着没意思|活不下去|想死|去死|自杀|轻生|结束(自己的)?生命|了结自己|割腕|跳楼|跳河|上吊|安眠药.{0,6}(吃|吞)|吞药|自残|伤害自己|不如死|死了算了|没有活下去|撑不下去了|kill myself|suicid|end my life|want to die|self[- ]?harm|cut myself|don'?t want to live|no reason to live|end it all|want to end it|better off dead/i,
  harm: /炸弹|爆破|炸掉|炸毁|配.{0,4}毒|隐蔽致命.{0,4}毒|炸药|爆炸物|制[造作].{0,4}(枪|炸|毒|武器)|雷管|土制|毒药.{0,4}(怎么|如何|配方)|下毒|投毒|杀[人掉死]|怎么杀|报复社会|恐怖袭击|制毒|冰毒|贩毒|洗钱|黑客.{0,4}(入侵|攻击)|偷.{0,3}(车|钱)|绑架|bomb|explosive|make a gun|how to kill|poison someone|meth|terror(ist)? attack|hack into/i,
  sexual: /色情|成人(内容|视频|电影|书|漫画)|很黄|黄色|露骨|黄书|黄色小说|做爱|性交|性爱|口交|自慰|裸照|淫|成人小说|av片|porn|erotic|sex scene|nude|hentai|nsfw/i,
};
export const SEEDS: Record<Exclude<SafetyKind, 'ok'> | 'ok', string[]> = {
  crisis: ['我不想活了', '活着没有任何意义，想结束一切', '我想自杀', '我想从楼上跳下去', '每天都想死', '我是所有人的负担，消失就好了', 'I want to kill myself', 'I don\'t want to be alive anymore'],
  harm: ['怎么制作炸弹', '教我做一把枪', '怎样毒死一个人不被发现', '我想报复那些伤害我的人，让他们付出血的代价', '怎么制毒', 'how to build a bomb'],
  ok: ['想读点关于死亡的书', '失恋了，很难过', '最近很累', '想读点让人害怕的', '对工作失去了意义感', '想读一本关于战争的小说', '爱情小说', '想读点悲伤的故事', '感觉很孤独'],
  sexual: ['给我推荐黄色小说', '想看露骨的性描写', '有没有色情的书', 'recommend me erotic porn books'],
};
export function keywordCheck(note: string): SafetyKind {
  for (const k of ['crisis', 'harm', 'sexual'] as const) if (KW[k].test(note)) return k;
  return 'ok';
}
const cos = (a: ArrayLike<number>, b: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
/** Embedding layer: a class fires only if its best seed is both close (≥ abs) and clearly closer than the
 *  best benign seed (≥ margin). Calibrated on scripts/calibrate-safety.ts; keywords remain the primary layer. */
export const THRESH = { abs: 0.72, margin: 0.06 };
export function embedCheck(q: ArrayLike<number>, seeds: Record<string, ArrayLike<number>[]>): SafetyKind {
  const best = (k: string) => Math.max(-1, ...(seeds[k] ?? []).map(v => cos(q, v)));
  const ok = best('ok'); let out: SafetyKind = 'ok', top = 0;
  for (const k of ['crisis', 'harm', 'sexual'] as const) { const s = best(k); if (s >= THRESH.abs && s - ok >= THRESH.margin && s > top) { top = s; out = k; } }
  return out;
}
export const HOTLINES = [
  { name: '12356 全国统一心理援助热线', tel: '12356', note: '国家卫健委设立' },
  { name: '希望24热线（生命危机干预，24 小时）', tel: '400-161-9995', note: '按 3 转生命热线' },
  { name: '北京心理援助热线', tel: '010-82951332', note: '座机拨 800-810-1117' },
  { name: '紧急情况', tel: '120 / 110', note: '有生命危险请立即拨打' },
];
