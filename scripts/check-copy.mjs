#!/usr/bin/env node
/**
 * Copy gate for the reading experience (ported from Book-Galaxy v1 scripts/check-product-language.mjs).
 *
 * The night librarian writes letters, not reports. Anything the reader can see must not carry
 * mechanical metadata: engine or retrieval terms, catalog jargon, scores, percentages, counts
 * ("{n} 封", "1000 本书", "五百来人"), file sizes or progress numbers. Book titles, authors,
 * publication years, dates, quoted encyclopedia text and the crisis hotline numbers are content,
 * not metadata, and are allowed.
 *
 * Scans index.html and the UI/letter sources with comments stripped. Usage: npm run check:copy
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['index.html', 'src/main.ts', 'src/letter.ts', 'src/archive.ts', 'src/obscurity.ts'];

// Same vocabulary v1 keeps off screen, plus the 2.0 engine/obscurity words.
const FORBIDDEN = [
  ['语义术语', /语义/gu],
  ['书目术语', /书目/gu],
  ['字段术语', /字段/gu],
  ['相似度术语', /相似度/gu],
  ['算法术语', /算法/gu],
  ['向量术语', /向量/gu],
  ['检索术语', /检索/gu],
  ['置信术语', /置信/gu],
  ['冷门度分数', /冷门度/gu],
  ['百分位', /百分位/gu],
  ['浏览量统计', /浏览量|浏览次数/gu],
  ['语言版本计数', /语言版本数|个语言版本/gu],
  ['模型与摘要或书目', /模型[^。！？\n]{0,28}(?:摘要|书目)|(?:摘要|书目)[^。！？\n]{0,28}模型/gu],
];
const NUMBER = String.raw`(?:\$\{[^{}]+\}|\{[^{}]+\}|\d[\d,，.]*)`;
const COUNTERS = String.raw`(?:颗|条|本(?!次)|段|站|座|部|封|次|簇|位|人(?!生|物|们|间|类))`;
const COUNTS = [
  ['界面不得显示数量', new RegExp(`${NUMBER}\\s*${COUNTERS}`, 'gu')],
  ['界面不得显示进度分数', new RegExp(`${NUMBER}\\s*/\\s*(?:\\$\\{|\\d)`, 'gu')],
  ['界面不得用汉字报数', /[一二三四五六七八九两]?[十百千万]+[一二三四五六七八九十百千万来多]*\s*(?:本|条|颗|封|次|人(?!生|物|们|间))/gu],
  ['界面不得显示文件大小', /\d[\d.]*\s*(?:MB|KB|GB)\b|\bMB\b/gu],
  ['界面不得显示百分比', /\d+(?:\.\d+)?\s*[%％]|百分之/gu],
  ['不得直接格式化数字', /\.toLocaleString\(/gu],
];

const stripComments = (src, html) => html
  ? src.replace(/<!--[\s\S]*?-->/gu, (m) => m.replace(/[^\n]/gu, ' '))
  : src.replace(/\/\*[\s\S]*?\*\//gu, (m) => m.replace(/[^\n]/gu, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gmu, '$1');

const errors = [];
for (const rel of FILES) {
  const raw = readFileSync(resolve(ROOT, rel), 'utf8');
  const code = stripComments(raw, rel.endsWith('.html'));
  const lines = code.split('\n');
  const report = (index, label) => {
    const line = code.slice(0, index).split('\n').length;
    errors.push(`${rel}:${line}  ${label}\n    ${lines[line - 1].trim().slice(0, 160)}`);
  };
  for (const [label, re] of [...FORBIDDEN.map(([l, r]) => [`界面出现技术用语（${l}）`, r]), ...COUNTS]) {
    for (const m of code.matchAll(re)) report(m.index ?? 0, label);
  }
}
if (errors.length) {
  console.error(`文案门禁失败：${errors.length} 处\n` + errors.join('\n'));
  process.exit(1);
}
console.log(`文案门禁通过：${FILES.length} 个界面文件，没有技术用语、数量、分数或文件大小`);
