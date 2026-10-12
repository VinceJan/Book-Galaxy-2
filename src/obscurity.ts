import type { Book } from './types';
const fmt = (n: number) => n.toLocaleString('zh-CN');
/** Honest, data-only description of how rarely a book is opened. */
export function describeObscurity(b: Book, window: [string, string]): string {
  const o = b.obscurity; const parts: string[] = [];
  const span = `${window[0].slice(0, 4)}.${window[0].slice(4, 6)}–${window[1].slice(0, 4)}.${window[1].slice(4, 6)}`;
  if (o.zhViews === null && o.enViews === null) return `它的维基百科浏览数据暂时没能取到。`;
  parts.push(o.zhViews ? `中文维基百科上它的条目被打开了 ${fmt(o.zhViews)} 次` : `中文维基百科上没有它被浏览的记录`);
  parts.push(o.enViews ? `英文维基 ${fmt(o.enViews)} 次` : `英文维基没有它的条目`);
  const rarer = Math.round(o.percentile * 100);
  return `${span} 这十二个月里，${parts.join('，')}；它有 ${o.sitelinks} 个语言版本的维基条目。在这一千本书里，它比 ${rarer}% 的书更少被人翻开。`;
}
export function stampFor(b: Book): { label: string; awake: boolean } {
  return (b.obscurity.zhViews ?? 0) < 3000 && b.obscurity.percentile >= 0.6 ? { label: '唤醒', awake: true } : { label: '借出', awake: false };
}
