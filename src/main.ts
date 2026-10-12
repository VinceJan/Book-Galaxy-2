import './fonts';
import './style.css';
import { loadAll, coverUrl } from './data';
import { centre, dot, rank, lexicalSims, expansionScores, hybrid, type Hit } from './retrieve';
import { loadEmbedder, embed, type ModelInfo } from './embedder';
import { composeLetter, methodLine, rewrite, isSleeping, type Confidence } from './letter';
import { stampFor } from './obscurity';
import { expand } from './expand';
import { isSafe } from './situations';
import { keywordCheck, embedCheck, SEEDS, HOTLINES, type SafetyKind } from './safety';
import { loadLetters, saveLetter } from './store';
import { mountArchive } from './archive';
import type { Book, Letter, Para } from './types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const PROMPTS = ['想逃离城市一阵子', '和父亲很久没说话了', '对工作失去了意义感', '想读点让人害怕的', '失恋了，但不想被安慰', '好奇宇宙到底有多大'];
const FAST = new URLSearchParams(location.search).has('fast');
/** Scoring hooks for reviewers: window.__bg.lastHits = top-3 book ids of the last recommendation. */
const bg: { lastHits: string[]; [k: string]: unknown } = ((window as unknown as { __bg: typeof bg }).__bg = { lastHits: [], ready: () => false });

const { cat, byId, index, meta } = await loadAll();
const model: ModelInfo = { model: meta.model, pooling: meta.pooling ?? 'mean', queryPrefix: meta.queryPrefix ?? '' };
const unsafe = new Set(index.books.filter(b => !isSafe(b)).map(b => b.id));

/* ---- engine state: idle → downloading → ready | failed ---- */
type EngineState = 'idle' | 'downloading' | 'ready' | 'failed';
let state: EngineState = 'idle';
const engine = $('engine');
const MB = (n: number) => (n / 1e6).toFixed(1);
function setState(s: EngineState, loaded = 0, total = 0) {
  state = s; engine.dataset.state = s;
  engine.innerHTML = s === 'idle' ? `<b>字面检索</b>开始写字时，馆员会去取语义目录（约 ${meta.downloadMB ?? 19} MB，只取一次）`
    : s === 'downloading' ? `<b>取目录中</b><i style="--p:${total ? loaded / total : 0}"></i>${total ? `${MB(loaded)} / ${MB(total)} MB` : '准备中…'}`
    : s === 'ready' ? `<b>语义检索</b>目录已在本机，不联网也能用`
    : `<b>字面检索</b>语义目录没能取到，馆员按字面帮你找`;
}
setState('idle');
function warm() { if (state !== 'idle') return; setState('downloading'); loadEmbedder(model, (l, t) => setState('downloading', l, t)).then(() => setState('ready'), () => setState('failed')); }
if (FAST) warm();

$('chips').innerHTML = PROMPTS.map(p => `<button type="button" class="chip">${p}</button>`).join('');
$('chips').addEventListener('click', e => { const t = e.target as HTMLElement; if (t.classList.contains('chip')) { $<HTMLTextAreaElement>('q').value = t.textContent!; ask(); } });
$('form').addEventListener('submit', e => { e.preventDefault(); ask(); });
$('again').addEventListener('click', () => ask(lastNote));
const q = $<HTMLTextAreaElement>('q');
q.addEventListener('input', warm, { once: true }); q.addEventListener('focus', warm, { once: true });
q.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask(); });

let lastNote = '', lastHits: Hit[] = [], cursor = 0, typing = 0, lastVia: 'semantic' | 'lexical' = 'lexical';
const given = new Set(loadLetters().map(l => l.bookId));

let confident = true;
async function search(note: string): Promise<{ hits: Hit[]; via: 'semantic' | 'lexical' }> {
  const books = index.books, lex = lexicalSims(note, books), e = expand(note), exp = expansionScores(e, books);
  confident = !e.terms.length || exp.some((x, i) => x > 0 && !unsafe.has(books[i].id) && !given.has(books[i].id));
  const exclude = new Set([...given, ...unsafe]);
  if (state === 'ready') {
    const v = centre(await embed(model, note), index.mean);
    return { hits: rank(hybrid(books.map((_, i) => dot(v, index, i)), lex, exp), books, { exclude }), via: 'semantic' };
  }
  return { hits: rank(hybrid(null, lex, exp), books, { exclude }), via: 'lexical' };
}

let seedVecs: Record<string, Float32Array[]> | null = null;
async function classify(note: string): Promise<SafetyKind> {
  const k = keywordCheck(note); if (k !== 'ok' || state !== 'ready') return k;
  seedVecs ??= Object.fromEntries(await Promise.all(Object.entries(SEEDS).map(async ([c, v]) => [c, await Promise.all(v.map(t => embed(model, t)))])));
  return embedCheck(await embed(model, note), seedVecs!);
}
const SPECIAL: Record<Exclude<SafetyKind, 'ok'>, Para[]> = {
  crisis: [
    { k: 'say', t: '这张纸条我读了两遍。今晚我不给你推荐书了——你比任何一本书都要紧。' },
    { k: 'say', t: '如果你正在想伤害自己，请现在就找一个真人说说话。下面这些电话有人在接，说什么都可以，哪怕只是哭。' },
    { k: 'say', t: '如果你身边有信得过的人，也可以把这张纸条给他看。等你好一点了，书库还在这里，我也还在值班。' },
  ],
  harm: [
    { k: 'say', t: '这张纸条我不能接。馆里的书是用来让人活得更明白的，不是用来伤人的。' },
    { k: 'say', t: '如果你正被什么人或事逼到墙角，愤怒是真的，但请先找人说出来；遇到危险请拨 110。换一张纸条，我们重新来。' },
  ],
  sexual: [
    { k: 'say', t: '这类书夜班馆员不经手。不是嫌弃你，是这张桌子有它的规矩。' },
    { k: 'say', t: '如果你想读的是爱情、欲望和人怎样靠近彼此，换个说法再写一张，我会认真去找。' },
  ],
};
function renderSpecial(kind: Exclude<SafetyKind, 'ok'>, note: string) {
  $('blank').hidden = true; const el = $('letter'); el.dataset.mode = kind === 'crisis' ? 'care' : 'decline'; delete el.dataset.stamp; bg.lastHits = []; el.hidden = false; el.classList.add('special'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  $('to').textContent = kind === 'crisis' ? '给你 · 现在' : '夜班馆员 · 退回的纸条';
  const stamp = $('stamp'); stamp.className = 'stamp'; stamp.innerHTML = '';
  ['sign', 'card'].forEach(id => $(id).classList.remove('on')); el.querySelector('.actions')!.classList.remove('on');
  $('card').innerHTML = kind === 'crisis' ? `<div class="help"><div class="cno">有人在接电话</div><ul>${HOTLINES.map(h => `<li><a href="tel:${h.tel.split(' ')[0].replace(/-/g, '')}"><b>${h.tel}</b></a><span>${h.name}${h.note ? ` · ${h.note}` : ''}</span></li>`).join('')}</ul><p class="method">号码核对于 2026-10-13：12356 见国家卫健委通知；希望24热线见 hope9995.com；北京心理援助热线见 crisis.org.cn。</p></div>` : '';
  typeOut([{ k: 'note', t: note }, ...SPECIAL[kind]], () => { $('sign').classList.add('on'); $('card').classList.add('on'); if (kind !== 'crisis') el.querySelector('.actions')!.classList.add('on'); });
}

async function ask(again?: string) {
  const note = (again ?? q.value).trim() || '随便给我一本，我信你';
  const kind = await classify(note); if (kind !== 'ok') { lastHits = []; lastNote = ''; return renderSpecial(kind, note); }
  $('letter').classList.remove('special');
  if (note !== lastNote || !lastHits.length) { const r = await search(note); lastHits = r.hits; lastVia = r.via; cursor = 0; lastNote = note; }
  const hit = lastHits[cursor++ % Math.max(1, lastHits.length)]; if (!hit) return;
  const b = hit.book; given.add(b.id);
  // Relevance confidence (thresholds calibrated on eval/notes.json top-1 hybrid scores; see eval/run.ts PRINTSIM).
  const [hi, lo] = lastVia === 'semantic' ? [8, 7] : [5, 3.5];
  const top = lastHits[0]?.sim ?? 0;
  const conf: Confidence = { level: !confident || top < lo ? 'low' : top >= hi ? 'high' : 'mid', alternatives: lastHits.filter(h => h.book.id !== b.id).slice(0, 2).map(h => h.book) };
  bg.lastHits = lastHits.slice(0, 3).map(h => h.book.id);
  let paras = composeLetter(note, b, byId, conf);
  paras = await rewrite(paras, { note, book: { title: b.title, author: b.author, year: b.year, summary: b.summary.slice(0, 400) } });
  const prev = loadLetters();
  const letter: Letter = { id: crypto.randomUUID?.() ?? String(Date.now()), at: new Date().toISOString(), note, bookId: b.id, paragraphs: paras, via: lastVia, parentId: prev.at(-1)?.id ?? null };
  const all = saveLetter(letter); $('count').textContent = String(all.length);
  document.body.classList.add('has-letter');
  render(letter, b, all.length, conf);
}

function render(l: Letter, b: Book, n: number, conf: Confidence) {
  $('blank').hidden = true; const el = $('letter'); el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  if (innerWidth < 820) scrollTo({ top: 0, behavior: FAST ? 'auto' : 'smooth' });
  const d = new Date(l.at);
  $('to').textContent = `第 ${n} 封 · ${d.toLocaleDateString('zh-CN')} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  const st = conf.level === 'high' ? stampFor(b) : { label: '借出', awake: false }, stamp = $('stamp');
  el.dataset.mode = 'recommend'; el.dataset.stamp = st.label; el.dataset.confidence = conf.level;
  stamp.className = 'stamp' + (st.awake ? '' : ' cool'); stamp.innerHTML = `${st.label}<small>${d.toISOString().slice(0, 10).replace(/-/g, '.')}</small>`;
  ['sign', 'card'].forEach(id => $(id).classList.remove('on')); el.querySelector('.actions')!.classList.remove('on');
  $('card').innerHTML = card(b, l.via);
  const img = $('card').querySelector('img'); img?.addEventListener('error', () => img.remove());
  typeOut(l.paragraphs, () => { $('sign').classList.add('on'); setTimeout(() => $('card').classList.add('on'), 200); setTimeout(() => stamp.classList.add('on'), 650); setTimeout(() => el.querySelector('.actions')!.classList.add('on'), 900); });
}
function card(b: Book, via: 'semantic' | 'lexical') {
  const c = coverUrl(b.cover);
  const meta1 = [b.author, b.year, b.country].filter(Boolean).map(x => esc(String(x))).join(' · ');
  return `<div class="cover"><div class="ph">${esc(b.title)}</div>${c ? `<img src="${esc(c)}" alt="《${esc(b.title)}》封面" loading="lazy" referrerpolicy="no-referrer">` : ''}</div>
  <div class="cardtext"><div class="cno">借书卡 · ${isSleeping(b) ? '久未借出' : '在架'}</div><h3>《${esc(b.title)}》</h3>${b.originalTitle && b.originalTitle !== b.title ? `<div class="orig">${esc(b.originalTitle)}</div>` : ''}
  <div class="who">${meta1}</div>
  <p class="method">${esc(methodLine(b, via, cat.obscuritySource.window))} · <a href="${esc(b.sourceUrl)}" target="_blank" rel="noopener">维基原文 ↗</a></p></div>`;
}
function typeOut(paras: Para[], done: () => void) {
  const body = $('body'); body.innerHTML = ''; const my = ++typing;
  const ps = paras.map(p => { const el = document.createElement('p'); el.className = p.k; body.append(el); return el; });
  let i = 0, j = 0; const caret = '<span class="caret"></span>';
  const tick = () => {
    if (my !== typing) return;
    if (i >= paras.length) return done();
    const t = paras[i].t; j = Math.min(t.length, j + (paras[i].k === 'quote' ? 3 : 1));
    ps[i].innerHTML = esc(t.slice(0, j)) + caret;
    if (j >= t.length) { ps[i].innerHTML = esc(t); i++; j = 0; setTimeout(tick, FAST ? 0 : 280); } else setTimeout(tick, FAST ? 0 : 28);
  };
  tick();
}

$('foot').innerHTML = `书目：中文维基百科 / Wikidata（CC BY-SA 4.0）· 封面：Open Library · 冷门度：Wikimedia 浏览量 ${cat.obscuritySource.window.join('–')}（中+英）与 Wikidata 语言版本数，取于 ${cat.obscuritySource.fetchedAt.slice(0, 10)} · 语义检索：${meta.model.split('/')[1]}，模型与字体均托管在本站，在浏览器本地运行`;
$('count').textContent = String(loadLetters().length);

const archive = mountArchive($('archive'), byId, index);
function route() {
  const r = location.hash.startsWith('#/archive') ? 'archive' : 'desk';
  $('desk').hidden = r !== 'desk'; $('archive').hidden = r !== 'archive'; $('foot').hidden = r !== 'desk';
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', (a as HTMLElement).dataset.r === r));
  if (r === 'archive') archive.show(loadLetters());
}
addEventListener('hashchange', route); route();
Object.assign(bg, { ask, ready: () => state === 'ready', state: () => state });
