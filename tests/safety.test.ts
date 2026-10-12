import { describe, it, expect } from 'vitest';
import { keywordCheck, embedCheck, HOTLINES } from '../src/safety';
describe('request safety (keyword layer)', () => {
  it.each(['活着没意思，不想活了', '我想自杀', '最近总想一了百了', '感觉自己是个累赘，大家没有我会更好', 'I want to kill myself', 'thinking about suicide', "I don't want to live anymore"])('crisis: %s', n => expect(keywordCheck(n)).toBe('crisis'));
  it.each(['怎么做炸弹', '教我制造枪支', 'how to make a bomb', '怎么下毒'])('harm: %s', n => expect(keywordCheck(n)).toBe('harm'));
  it.each(['推荐点色情小说', '想看露骨的性描写', 'recommend porn'])('sexual: %s', n => expect(keywordCheck(n)).toBe('sexual'));
  it.each(['想读点关于死亡的书', '失恋了，但不想被安慰', '最近很累', '想读一本关于战争的小说', '想读点让人害怕的', '爱情小说', '朋友去世了，很想他'])('benign: %s', n => expect(keywordCheck(n)).toBe('ok'));
  it('embedding layer needs both absolute closeness and margin over benign seeds', () => {
    const v = (x: number[]) => Float32Array.from(x); const seeds = { crisis: [v([1, 0])], ok: [v([0, 1])], harm: [], sexual: [] };
    expect(embedCheck(v([0.99, 0.14]), seeds)).toBe('crisis'); expect(embedCheck(v([0.71, 0.7]), seeds)).toBe('ok');
  });
  it('hotlines include the national 12356 line and emergency numbers', () => { const t = HOTLINES.map(h => h.tel).join(' '); expect(t).toContain('12356'); expect(t).toContain('400-161-9995'); expect(t).toContain('010-82951332'); expect(t).toContain('120'); });
});
