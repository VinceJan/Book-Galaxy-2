/** Grounded "适合什么处境" lines. Each line fires only if its evidence terms appear in the book's own
 *  description or catalog themes; the matched evidence is stored next to it so it can be audited. */
import type { Book } from './types';
interface Rule { s: string; any: RegExp; themes?: string[] }
const R: Rule[] = [
  { s: '想读点让人害怕、夜里不敢关灯的东西', any: /恐怖|惊悚|吸血鬼|鬼魂|幽灵|怪物|闹鬼|诅咒|丧尸|克苏鲁/ },
  { s: '想读点和吃、和厨房有关的', any: /烹饪|食谱|菜谱|饮食|美食|厨师|料理|菜肴/ },
  { s: '好奇宇宙、星空和时间的尽头', any: /宇宙|天文|星系|黑洞|时空|行星|恒星|太空/ },
  { s: '想到深海、潜水艇和海底世界去', any: /潜水|潜艇|海底|深海/ },
  { s: '和父亲之间有话说不出口', any: /父亲|父子|父女/ },
  { s: '想起母亲，或和母亲关系复杂', any: /母亲|母女|母子/ },
  { s: '刚失恋，或在一段感情里进退两难', any: /爱情|恋人|情人|婚外|恋爱|分手/, themes: ['爱情与亲密关系'] },
  { s: '想逃离城市，去荒野、海岛或乡下待一阵', any: /荒野|荒岛|无人岛|乡村|森林|漂流|草原|牧场|隐居/, themes: ['生态与环境'] },
  { s: '想出发远行，去看看别处', any: /旅行|旅程|远航|探险|游记/, themes: ['旅行与远方'] },
  { s: '对工作失去意义感，被劳动和体制磨损', any: /工人|劳动|工厂|罢工|职员|上班|管理|公司|推销员/, themes: ['阶级与贫困'] },
  { s: '想看侦探破案、推理谜题', any: /侦探|推理|谋杀|凶手|破案|命案|警探/ },
  { s: '想了解中国古代的历史和人物', any: /朝代|王朝|皇帝|史书|纪传|春秋|汉朝|唐朝|宋朝|明朝|清朝|三国/ },
  { s: '焦虑、失眠，想安静下来', any: /焦虑|失眠|精神病|心理|冥想|禅修|内心|抑郁/ },
  { s: '想理解战争，以及战争留下的伤', any: /战争|士兵|战场|二战|一战|军队|战役/, themes: ['战争与创伤'] },
  { s: '想给孩子讲一个睡前故事', any: /童话|儿童文学|儿童|小女孩|小男孩|绘本/ },
  { s: '好奇人工智能、机器和未来', any: /人工智能|机器人|电脑|计算机|科幻|未来|赛博/, themes: ['文明与未来'] },
  { s: '在想死亡，或刚失去了谁', any: /死亡|葬礼|临终|去世|亡者|丧/ },
  { s: '想更了解佛教，或想静坐读一部经', any: /佛|菩萨|禅|比丘|般若/ },
  { s: '想读大海、船和航行', any: /航海|航行|水手|船长|捕鲸|海上|海盗|渔夫/ },
  { s: '想弄懂经济、钱和市场', any: /经济学|经济|资本|市场|货币|财富|贫困/ },
  { s: '想看权力、政治和宫廷斗争', any: /权力|政治|统治|王位|独裁|宫廷|政变|极权/, themes: ['权力与政治'] },
  { s: '觉得孤独，想有人懂', any: /孤独|寂寞|孤立|疏离/, themes: ['孤独与异化'] },
  { s: '在长大，或在回想自己是怎么长大的', any: /成长|少年|青春|童年|青少年/, themes: ['成长与教育'] },
  { s: '想读点轻松好笑、讽刺荒诞的', any: /幽默|讽刺|喜剧|滑稽|荒诞|诙谐|搞笑/ },
  { s: '想了解日本和日本人的生活', any: /日本/, themes: ['日本文学'] },
  { s: '想开始读哲学，追问存在和意义', any: /哲学|存在主义|形而上|伦理学|理性/ },
  { s: '想进入魔法和奇幻世界', any: /魔法|奇幻|巫师|魔戒|精灵|巫/ },
  { s: '在想自由是什么', any: /自由|奴役|压迫|极权|审查/, themes: ['自由与压迫'] },
  { s: '离开了故乡，或在异乡生活', any: /移民|流亡|异乡|故乡|离乡|难民/, themes: ['迁徙与乡土'] },
  { s: '在生病，或想读医学和身体', any: /医学|疾病|医生|医院|瘟疫|病毒|病人/, themes: ['身体与疾病'] },
  { s: '对宗教和信仰有疑问', any: /信仰|上帝|宗教|神学|圣经|基督/ },
  { s: '想读诗', any: /诗集|诗歌|诗人|长诗|十四行/, themes: ['诗歌'] },
  { s: '想下棋，或想读和棋有关的', any: /象棋|围棋|国际象棋|棋手|棋局/ },
];
export function situations(b: Pick<Book, 'summary' | 'themes' | 'title'>): { s: string; evidence: string }[] {
  const text = b.title + b.summary.slice(0, 500); const out: { s: string; evidence: string }[] = [];
  for (const r of R) { const m = text.match(r.any); const th = r.themes?.find(t => b.themes.includes(t)); if (m || th) out.push({ s: r.s, evidence: m ? m[0] : `主题:${th}` }); }
  return out.slice(0, 5);
}
/** Content safety. Sentences with sexual/violent-sexual words never appear in a quote; a book whose premise
 *  (first 300 chars) is explicitly sexual is never recommended at all. */
export const UNSAFE = /自慰|性交|色情|淫|性虐|乱伦|性爱|口交|强奸|性行为|裸体|阴茎|阴道|手淫|做爱/;
const EXPLICIT = /自慰|性交|口交|性虐|手淫|做爱/;
export const isSafe = (b: Pick<Book, 'summary' | 'hook'>) => !EXPLICIT.test(b.hook + b.summary.slice(0, 300));
export const safeSentence = (s: string) => !UNSAFE.test(s);
/** Strip "（英语：…）"-style parentheticals (balanced, nested-safe) and footnote marks from quoted text. */
export function cleanQuote(s: string): string {
  const open = /[（(](?:[^（）()：:]{0,8}语|英文|原名|原文|又译|又名|拉丁文|台译|港译|全名)[：:]/g; let out = s, m: RegExpExecArray | null;
  while ((m = open.exec(out))) { let depth = 0, j = m.index;
    for (; j < out.length; j++) { const c = out[j]; if (c === '（' || c === '(') depth++; else if (c === '）' || c === ')') { depth--; if (depth === 0) break; } }
    out = out.slice(0, m.index) + out.slice(j + 1); open.lastIndex = m.index; }
  return out.replace(/\[\d+\]/g, '').replace(/\s{2,}/g, ' ');
}
