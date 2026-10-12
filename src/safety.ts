/** Request-side safety. Runs before retrieval.
 *  Layer 1 (primary): intent patterns in zh + en, grouped by concept (explicit crisis, implicit preparation signs,
 *  harm to others, group hate, sexual content). Layer 2: embedding similarity to seed phrases, Chinese notes only
 *  (the Chinese model is unreliable on English), and never for notes framed as study / third-person / fiction.
 *  Tuned on eval/safety-dev.json only; eval/safety-heldout.json is reported, not tuned on. */
export type SafetyKind = 'ok' | 'crisis' | 'harm' | 'hate' | 'sexual';
const ME = /(我|俺|自己)/;
const CRISIS_EXPLICIT = /不想活|一了百了|不想再醒|想消失|消失就好|没有我会更好|我是.{0,4}(累赘|负担)|撑不住了|不想再?撑下去|生无可恋|活够了|离开这个世界|活着没意思|活不下去|我.{0,3}想死|想去死|(我|想|要|打算|准备)(要|想|去)?(自杀|轻生)|结束(自己的|我的)?生命|结束这一切|想就这样结束|(想|要|准备|打算).{0,8}跳下去|了结自己|割腕|我.{0,6}(跳楼|跳河|上吊)|(吃|吞).{0,4}安眠药|吞药|自残|伤害自己|不如死了|死了算了|没有活下去/;
// Warning signs without the word "suicide": preparing means, farewells, giving things away, "won't be here", self-injury.
const CRISIS_IMPLICIT = /(攒|存|囤|藏|备|买)(了|够|好)?.{0,6}(药|安眠药|刀片|农药|炭)|药.{0,6}(攒|存|囤)(够|了|好)|遗书|绝笔|(告别|诀别)(信|的话)|写给每个人的(信|告别)|(一个个|挨个|都)道(了)?别|(东西|物品|衣服|猫|狗).{0,8}(送人|送掉|托付|送给了?别人)|以后(用不上|不需要|用得上)了?|(明天|以后|哪天).{0,4}(不在了|没有我)|再也不(要|想)?醒|永远睡着|睡过去就再也|划(手|胳膊|手臂|手腕)|(哪种|什么|怎样的)(方式|方法|死法).{0,6}(不痛|最快|没有?痛苦|死得)|(走了|不在了|消失了).{0,4}(最好|就好|轻松)|(楼顶|天台|桥上|河边).{0,8}(站|坐)了(很久|好久|一夜)|活着.{0,8}(添麻烦|负担|拖累)|给.{0,4}(添麻烦|拖累)/;
const CRISIS_EN = /kill myself|\b(i|i'm|im|i am|i've)\b.{0,20}suicid|end(ing)? my (own )?life|want to die|wanna die|self[- ]?harm|cut(ting)? myself|been cutting|hurt myself|don'?t want to (live|be alive|be here)|no reason to (live|keep going|go on)|reason to keep going|end it all|end (this|everything)|everything to stop|want to end it|better off (dead|without me)|(world|everyone|they)('d| would) be better (off )?without me|nobody would (miss|notice) me|(saving|saved|stockpil\w*|hoard\w*)( up)? .{0,12}(pills|medication|meds|tablets)|(pills|meds|medication) (saved|stockpiled)|gave away my (things|stuff|belongings)|won'?t need (them|it|my) (any ?more)?|goodbye (letters?|notes?|messages?) to|saying goodbye to everyone|suicide note|wrote (a )?note .{0,30}(in case|family|goodbye)|don'?t make it through|planning how to do it|not be around (much longer|anymore)/i;
// Third-person / study / fiction frame: the note is about a topic, not about the writer.
const FRAME = /研究|论文|报告|课(上|程|堂)?|作业|学术|文学(作品)?中|文学里|小说|作品|历史|社会学|心理学|预防|主题|(有|的)书|书单|参考书|纪实|传记|回忆录|朋友|同学|家人|家属|父亲|母亲|爸|妈|他|她|study|studying|research|class|course|thesis|essay|paper|novel|literature|fiction|book|memoir|history|prevention|my (friend|brother|sister|mother|father|mom|dad|son|daughter)|\bhis\b|\bher\b|family dealing/i;
const HARM = /(怎么|如何|怎样|教我|教教我|方法|步骤|配方|自制|制作|制造|做一?个?).{0,10}(炸弹|炸药|爆炸(装置|物)|雷管|枪支?|毒药|冰毒|武器|伤人的)|我(要|想|打算).{0,4}(杀了?|炸|毒死|弄死|报复|揍|伤害)(?!自己)|下毒|投毒|下药|毒死.{0,4}(人|他|她)|让.{0,6}(付出血的代价|消失不留痕迹|慢慢中毒)|报复社会|(怎么|如何|怎样).{0,8}(贩毒|洗钱|绑架|拐|入侵|黑进|偷偷进入|破解|窃听|偷拍)|(跟踪|监视|定位).{0,10}(不被|不让).{0,4}(发现|知道)|how (to|do i|can i) (make|build) (a )?(pipe )?(bomb|gun|explosive)|pipe bomb|how (to|do i|can i) (kill|hurt|poison) (someone|a person|people|him|her|my)|(poison|hurt|kill) (my|his|her) (neighbou?r|wife|husband|boss|coworker|ex|teacher)|(want|going) to (hurt|kill|poison) (my|him|her|them|someone)|make (poison|meth)|poison at home|terror(ist)? attack (plan|how)|hack into|stalk (someone|him|her|my)|without (them|him|her) knowing|get back at .{0,12}(hurt|make (him|her) pay)/i;
const GROUP = '(民族|种族|人种|外地人|外国人|移民|难民|穆斯林|回民|犹太人?|黑人|白人|亚洲人|基督徒|佛教徒|教徒|信徒|少数民族|女人|女性|男人|同性恋|残疾人|穷人|乡下人|某个?(族|群体|宗教)|[\\u4e00-\\u9fa5]{1,3}族人?)';
const HATE = new RegExp(`(证明|说明|讲|为什么|论证|显示|告诉我).{0,12}${GROUP}.{0,10}(天生|都是|都该|应该被|该死|低等|低劣|劣等|下等|垃圾|害虫|罪犯|笨|不配|劣根|滚出|赶出去|消灭|清除)|${GROUP}.{0,6}(都是|天生|都该|应该被).{0,6}(垃圾|罪犯|低等|低劣|劣等|下等|害虫|该死|笨|赶出去|消灭)|(仇恨|憎恨|讨厌|恨).{0,6}${GROUP}的(书|读物|理由)|让人(仇恨|憎恨|恨).{0,6}${GROUP}|\\b(race|races|ethnic|immigrants?|refugees?|jews?|muslims?|black people|blacks|asians?|women|gays?|christians?)\\b.{0,24}\\b(inferior|subhuman|vermin|animals|control the world|are criminals|should be (deported|removed|eliminated))|(proving|proves|shows?|showing|arguing|argue)\\b.{0,24}\\b(race|races|ethnic|immigrants?|jews?|muslims?|black|women)\\b.{0,24}\\b(superior|inferior|vermin|subhuman|criminals|control)|(hate|hating) (jews|muslims|immigrants|black people|gays|women)`, 'i');
const SEXUAL = /色情|成人(内容|视频|电影|书|漫画|小说)|很黄|黄色(小说|书|内容)?|露骨|黄书|做爱|性交|性爱场面|口交|自慰|裸照|淫秽|av片|\bporn|erotica?\b|explicit (sex|erotic)|sex scenes?|\bnude|hentai|nsfw|smut/i;
export const isEnglish = (s: string) => { const l = (s.match(/[a-z]/gi) ?? []).length, h = (s.match(/[\u4e00-\u9fa5]/g) ?? []).length; return l > 3 * h && l > 3; };
export const framed = (note: string) => FRAME.test(note);
export function keywordCheck(note: string): SafetyKind {
  if (CRISIS_EXPLICIT.test(note) && !(framed(note) && !ME.test(note))) return 'crisis';
  if (CRISIS_IMPLICIT.test(note) || CRISIS_EN.test(note)) return 'crisis';
  if (HARM.test(note)) return 'harm';
  if (HATE.test(note)) return 'hate';
  if (SEXUAL.test(note)) return 'sexual';
  return 'ok';
}
export const SEEDS: Record<Exclude<SafetyKind, 'ok'> | 'ok', string[]> = {
  crisis: ['我不想活了', '活着没有任何意义，想结束一切', '我想自杀', '我想从楼上跳下去', '每天都想死', '我是所有人的负担，消失就好了', '我已经准备好离开了', '想一直睡下去不再醒来'],
  harm: ['怎么制作炸弹', '教我做一把枪', '怎样毒死一个人不被发现', '我想报复那些伤害我的人，让他们付出血的代价', '怎么制毒', '怎么偷偷监视一个人'],
  hate: ['证明某个民族是劣等民族', '某个种族的人都是罪犯', '那些外国人都该被赶出去'],
  ok: ['想读点关于死亡的书', '失恋了，很难过', '最近很累', '想读点让人害怕的', '对工作失去了意义感', '想读一本关于战争的小说', '爱情小说', '想读点悲伤的故事', '感觉很孤独', '想读关于自杀的研究', '想读写种族歧视的小说', '想读侦探小说'],
  sexual: ['给我推荐黄色小说', '想看露骨的性描写', '有没有色情的书'],
};
const cos = (a: ArrayLike<number>, b: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
/** Embedding layer: a class fires only if its best seed is both close (≥ abs) and clearly closer than the best benign seed (≥ margin). */
export const THRESH = { abs: 0.72, margin: 0.06 };
export function embedCheck(q: ArrayLike<number>, seeds: Record<string, ArrayLike<number>[]>): SafetyKind {
  const best = (k: string) => Math.max(-1, ...(seeds[k] ?? []).map(v => cos(q, v)));
  const ok = best('ok'); let out: SafetyKind = 'ok', top = 0;
  for (const k of ['crisis', 'harm', 'hate', 'sexual'] as const) { const s = best(k); if (s >= THRESH.abs && s - ok >= THRESH.margin && s > top) { top = s; out = k; } }
  return out;
}
export const HOTLINES = [
  { name: '12356 全国统一心理援助热线', tel: '12356', note: '国家卫健委设立' },
  { name: '希望24热线（生命危机干预）', tel: '400-161-9995', note: '24 小时' },
  { name: '北京心理援助热线', tel: '010-82951332', note: '座机拨 800-810-1117' },
  { name: '紧急情况', tel: '120 / 110', note: '有生命危险请立即拨打' },
];
