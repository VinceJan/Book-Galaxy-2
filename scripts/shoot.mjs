import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4391/Book-Galaxy-2/';
const br = await chromium.launch();
const notes = ['对工作失去了意义感', '和父亲很久没说话了', '想读点让人害怕的', '好奇宇宙到底有多大', '想逃离城市一阵子', '失恋了，但不想被安慰', '最近在学做饭，想读点和食物有关的'];
async function run(tag, vp) {
  const ctx = await br.newContext({ viewport: vp, deviceScaleFactor: 2 }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '?fast'); await p.waitForTimeout(2500);
  await p.screenshot({ path: `shots/${tag}-1-empty.png` });
  await p.waitForFunction(() => window.__bg?.ready(), null, { timeout: 180000 });
  const picks = [];
  for (const n of notes) { await p.fill('#q', n); await p.click('.send'); await p.waitForTimeout(1500); picks.push(n + ' → ' + await p.textContent('.card h3')); }
  await p.fill('#q', notes[0]); await p.click('.send'); await p.waitForTimeout(2500);
  await p.evaluate(() => scrollTo(0, 0)); if (vp.width < 800) await p.locator('#table').scrollIntoViewIfNeeded();
  await p.screenshot({ path: `shots/${tag}-2-letter.png`, fullPage: vp.width < 800 });
  const sw = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  await p.goto(URL + '?fast#/archive'); await p.waitForTimeout(5000);
  await p.screenshot({ path: `shots/${tag}-3-archive.png` });
  console.log(tag, 'scrollWidth', sw, 'errors', errs, '\n ' + picks.join('\n '));
  await ctx.close();
}
await run('desktop', { width: 1440, height: 900 }); await run('mobile', { width: 390, height: 844 });
await br.close();
