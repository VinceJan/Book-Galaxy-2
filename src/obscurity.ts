import type { Book } from './types';
export function stampFor(b: Book): { label: string; awake: boolean } {
  return (b.obscurity.zhViews ?? 0) < 3000 && b.obscurity.percentile >= 0.6 ? { label: '唤醒', awake: true } : { label: '借出', awake: false };
}
