/** Hard constraints in a note (country / tradition, genre, author gender, audience age, dual topic).
 *  Vocabulary mirrors the catalog's own facet values; nothing here names a particular book. */
import type { Book } from './types';
export interface Constraint { label: string; test: (b: Book) => boolean }
const C = (b: Book) => `${b.country ?? ''}|${b.facets?.tradition ?? ''}`;
const G = (b: Book) => `${(b.facets?.genres ?? []).join('|')}|${b.themes.join('|')}`;
const COUNTRY: [RegExp, RegExp, string][] = [
  [/日本|japan/i, /日本/, '日本'], [/美国|american|\busa?\b/i, /美国/, '美国'], [/英国|英格兰|british|english author|\buk\b|england/i, /英国|英格兰|大不列颠|苏格兰|威尔士/, '英国'],
  [/法国|french|france/i, /法国|法兰西/, '法国'], [/俄罗斯|俄国|苏联|russian|russia|soviet/i, /俄罗斯|苏联/, '俄罗斯'], [/德国|德语|german/i, /德国|普鲁士|魏瑪|德意志|符腾堡/, '德国'],
  [/中国|国产|chinese|china/i, /中华|清朝|明朝|元朝|唐朝|宋朝|汉朝|晋|周朝|中国|香港|台湾/, '中国'], [/拉美|拉丁美洲|南美|latin america/i, /哥伦比亚|阿根廷|墨西哥|秘鲁|巴西|巴拉圭|智利|古巴/, '拉丁美洲'],
  [/意大利|italian/i, /意大利|那不勒斯/, '意大利'], [/西班牙|spanish|spain/i, /西班牙/, '西班牙'], [/韩国|朝鲜|korean/i, /朝鲜|韩国/, '朝鲜半岛'], [/印度|indian/i, /印度|俱卢/, '印度'],
  [/爱尔兰|irish/i, /爱尔兰/, '爱尔兰'], [/加拿大|canad/i, /加拿大/, '加拿大'], [/波兰|polish/i, /波兰/, '波兰'], [/捷克|czech/i, /捷克/, '捷克'], [/瑞典|挪威|芬兰|丹麦|北欧|scandinavia/i, /瑞典|挪威|芬兰|丹麦/, '北欧'],
];
const GENRE: [RegExp, RegExp, string][] = [
  [/科幻|sci-?fi|science fiction/i, /科学幻想|科幻|science fiction|赛博朋克|太空歌剧/, '科幻'], [/奇幻|魔幻(?!现实)|fantasy/i, /奇幻|fantasy|神话与超自然/, '奇幻'],
  [/推理|侦探|探案|detective|whodunn?it|mystery/i, /推理|侦探|犯罪|悬疑|mystery|detective|crime/, '推理'], [/间谍|特工|谍|\bspy|espionage/i, /谍报|间谍|spy/, '间谍'],
  [/恐怖|吓人|horror/i, /恐怖|哥德|吸血鬼|horror|gothic/, '恐怖'], [/惊悚|悬疑|thriller|suspense/i, /惊悚|悬疑|推理|thriller|犯罪/, '悬疑'], [/反乌托邦|dystopi/i, /反乌托邦|dystopia/, '反乌托邦'],
  [/讽刺|satir/i, /讽刺|satir|喜剧|政治小说/, '讽刺'], [/图像小说|漫画|绘本|连环画|graphic novel|comics?\b|manga/i, /图像小说|漫画|绘本|graphic|comic|manga/, '图像小说'],
  [/诗(?!人)|词集|poetry|poems?\b/i, /诗|poetry|词/, '诗'], [/回忆录|memoir/i, /回忆录|自传|memoir/, '回忆录'], [/传记|biograph/i, /传记|biograph|自传/, '传记'], [/自传|autobiograph/i, /自传|回忆录/, '自传'],
  [/书信体|书信形式|信件|epistolary/i, /书信|epistol|epistle/, '书信体'], [/历史小说|historical (novel|fiction)/i, /历史(类虚构|小说)|historical/, '历史小说'], [/魔幻现实|magic(al)? realis/i, /魔幻现实|magic realis/, '魔幻现实主义'],
  [/戏剧|剧本|\bplays?\b/i, /戏剧|悲剧|喜剧|剧/, '戏剧'], [/短篇|short stor/i, /短篇/, '短篇'], [/童话|fairy tale/i, /童话|儿童|children/, '童话'], [/随笔|散文|essays?\b/i, /随笔|散文|essay|非虚构/, '随笔'],
];
const AGE: [RegExp, RegExp, string][] = [
  [/(给|适合|陪).{0,6}(孩子|小孩|小朋友|儿童|[一二三四五六七八九十\d]{1,2}岁)|童书|儿童读物|for (my )?(kids|children|a child|\d+[- ]year[- ]old)|children'?s book/i, /儿童|children|童话|冒险|young adult|奇幻|教育小说/, '适合孩子'],
  [/(初中|高中|中学)生|青少年|teen|young adult|\bya\b/i, /young adult|儿童|成长与教育|教育小说|developmental|奇幻|冒险/, '青少年'],
];
export function extract(note: string): Constraint[] {
  const out: Constraint[] = [];
  for (const [re, ok, label] of COUNTRY) if (re.test(note)) out.push({ label, test: b => ok.test(C(b)) });
  for (const [re, ok, label] of GENRE) if (re.test(note)) out.push({ label, test: b => ok.test(G(b)) });
  for (const [re, ok, label] of AGE) if (re.test(note)) { out.push({ label, test: b => ok.test(G(b)) }); break; }
  if (/女(作家|作者|性作家|性作者|性写的|人写的)|女性(写|笔下)|by (a )?(woman|women|female)|female (author|writer)s?|women (writers|authors)/i.test(note)) out.push({ label: '女作者', test: b => /female/.test(b.authorGender ?? '') });
  if (/男(作家|作者)|by (a )?man\b|male (author|writer)/i.test(note)) out.push({ label: '男作者', test: b => /(^|\/)male/.test(b.authorGender ?? '') });
  // Only one country constraint can sensibly hold; if several matched (e.g. "English" as a language) keep the first.
  const seen = new Set<string>(); return out.filter(c => { const k = COUNTRY.some(x => x[2] === c.label) ? 'country' : c.label; if (seen.has(k)) return false; seen.add(k); return true; });
}
/** Two topics joined explicitly (既…又…, 又…又…, 同时, both … and …): returns the two halves, else null. */
export function dualTopics(note: string): [string, string] | null {
  const m = note.match(/既(?:有|是|写)?(.{2,12}?)[，,]?(?:又|也)(?:有|是|写)?(.{2,12}?)(?:的|$)/) || note.match(/又(?:有|是)?(.{2,10}?)又(?:有|是)?(.{2,10}?)(?:的|$)/)
    || note.match(/both (.{3,30}?) and (.{3,30}?)(?:$|[.,])/i) || note.match(/(.{2,10}?)(?:和|与|加上|同时又?有?)(.{2,10}?)(?:都有|兼具|结合)/);
  return m ? [m[1].trim(), m[2].trim()] : null;
}
