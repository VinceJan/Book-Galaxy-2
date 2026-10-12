import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4391/Book-Galaxy-2/';
const br = await chromium.launch();
const notes = ['对工作失去了意义感', '想读点让人害怕的', '想了解深海和潜水艇', '最近在学下棋', '和父亲很久没说话了', '最近在学做饭，想读点和食物有关的', '失恋了，但不想被安慰', '想逃离城市一阵子'];
async function run(tag, vp) {
  const ctx = await br.newContext({ viewport: vp, deviceScaleFactor: 2 }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  let bytes = 0; p.on('requestfinished', async r => { try { bytes += (await r.sizes()).responseBodySize; } catch {} });
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.screenshot({ path: `shots/${tag}-1-empty.png` });
  const before = bytes; await p.focus('#q'); await p.waitForTimeout(700); await p.screenshot({ path: `shots/${tag}-2-downloading.png` });
  await p.waitForFunction(() => window.__bg?.ready(), null, { timeout: 180000 }); await p.waitForTimeout(500);
  const modelBytes = bytes - before; const picks = [];
  await p.evaluate(() => { document.querySelectorAll('.letter').forEach(() => {}); });
  for (const n of notes) { await p.fill('#q', n); await p.click('.send'); await p.waitForFunction(() => document.querySelector('#letter .actions.on'), null, { timeout: 60000 }); picks.push(n + ' → ' + await p.textContent('.card h3')); if (n === notes[2] || n === notes[3]) await p.screenshot({ path: `shots/${tag}-3-letter-${notes.indexOf(n)}.png`, fullPage: vp.width < 800 }); }
  const sw = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: `shots/${tag}-4-letter-viewport.png` });
  await p.evaluate(() => (location.hash = '#/archive')); await p.waitForTimeout(5000);
  await p.screenshot({ path: `shots/${tag}-5-archive.png` });
  console.log(tag, 'scrollWidth', sw, 'errors', errs, 'model+wasm bytes', (modelBytes / 1e6).toFixed(1), 'MB total', (bytes / 1e6).toFixed(1), '\n ' + picks.join('\n '));
  await ctx.close();
}
await run('desktop', { width: 1440, height: 900 }); await run('mobile', { width: 390, height: 844 });
await br.close();
