import './fonts';
import './style.css';
import { loadAll, coverUrl } from './data';
import type { Hit } from './retrieve';
import { decide, type Decision, type Engine } from './pipeline';
import { loadEmbedder, embed, type ModelInfo } from './embedder';
import { composeLetter, rewrite, isSleeping, type Confidence } from './letter';
import { isSafe } from './situations';
import { HOTLINES, type SafetyKind } from './safety';
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
function setState(s: EngineState, loaded = 0, total = 0) {
  state = s; engine.dataset.state = s;
  // No sizes, progress numbers or engine names on screen: only what the librarian is doing.
  engine.innerHTML = s === 'idle' ? `<b>灯已亮</b>开始写字时，馆员会把目录搬到桌上，只搬这一次`
    : s === 'downloading' ? `<b>搬目录中</b><i style="--p:${total ? loaded / total : 0}"></i>${total ? '目录正在路上…' : '准备中…'}`
    : s === 'ready' ? `<b>目录在手边</b>不联网，也能替你找`
    : `<b>凭字面找</b>目录没能搬来，馆员先照着你的字句去找`;
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

const glossary = await fetch(`${import.meta.env.BASE_URL}data/en-zh.json`).then(r => r.json()).catch(() => undefined);
const engine_ = (): Engine => ({ index, unsafe, glossary, embed: state === 'ready' ? (t: string) => embed(model, t) : null });
let lastDecision: Decision | null = null;
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
  hate: [
    { k: 'say', t: '这张纸条我退回。把一群人说成天生低人一等的书，夜班馆员不替人去找。' },
    { k: 'say', t: '如果你想弄明白偏见和仇恨是怎么长出来的、历史上它们造成过什么，换个问法写给我，那样的书架上有。' },
  ],
  sexual: [
    { k: 'say', t: '这类书夜班馆员不经手。不是嫌弃你，是这张桌子有它的规矩。' },
    { k: 'say', t: '如果你想读的是爱情、欲望和人怎样靠近彼此，换个说法再写一张，我会认真去找。' },
  ],
};
function renderSpecial(kind: Exclude<SafetyKind, 'ok'>, note: string) {
  $('blank').hidden = true; const el = $('letter'); el.dataset.mode = kind === 'crisis' ? 'care' : 'decline'; delete el.dataset.stamp; delete el.dataset.confidence; bg.lastHits = []; el.hidden = false; el.classList.add('special'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  $('to').textContent = kind === 'crisis' ? '给你 · 现在' : '夜班馆员 · 退回的纸条';
  const stamp = $('stamp'); stamp.className = 'stamp'; stamp.innerHTML = '';
  ['sign', 'card'].forEach(id => $(id).classList.remove('on')); el.querySelector('.actions')!.classList.remove('on');
  $('card').innerHTML = kind === 'crisis' ? `<div class="help"><div class="cno">有人在接电话</div><ul>${HOTLINES.map(h => `<li><a href="tel:${h.tel.split(' ')[0].replace(/-/g, '')}"><b>${h.tel}</b></a><span>${h.name}${h.note ? ` · ${h.note}` : ''}</span></li>`).join('')}</ul><p class="method">号码核对于 2026-10-13：12356 见国家卫健委通知；希望24热线见 hope9995.com；北京心理援助热线见 crisis.org.cn。</p></div>` : '';
  typeOut([{ k: 'note', t: note }, ...SPECIAL[kind]], () => { $('sign').classList.add('on'); $('card').classList.add('on'); if (kind !== 'crisis') el.querySelector('.actions')!.classList.add('on'); });
}

async function ask(again?: string) {
  const note = (again ?? q.value).trim() || '随便给我一本，我信你';
  if (note !== lastNote || !lastHits.length) {
    const d = await decide(note, engine_(), given);
    if (d.kind !== 'ok') { lastHits = []; lastNote = ''; lastDecision = null; return renderSpecial(d.kind, note); }
    lastDecision = d; lastHits = d.hits; lastVia = d.via; cursor = 0; lastNote = note;
  }
  $('letter').classList.remove('special');
  const hit = lastHits[cursor++ % Math.max(1, lastHits.length)]; if (!hit) return;
  const b = hit.book; given.add(b.id);
  // Confidence and stamp come from the shared pipeline (src/pipeline.ts); a re-roll ("再要一本") is never stamped 唤醒.
  const first = cursor === 1, d = lastDecision!;
  const conf: Confidence = { level: first ? d.level : hit.sim >= d.top ? d.level : d.level === 'high' ? 'mid' : d.level, alternatives: lastHits.filter(h => h.book.id !== b.id).slice(0, 2).map(h => h.book) };
  const stampLabel = first ? d.stamp ?? '借出' : '借出';
  bg.lastHits = lastHits.slice(0, 3).map(h => h.book.id);
  let paras = composeLetter(note, b, byId, conf);
  paras = await rewrite(paras, { note, book: { title: b.title, author: b.author, year: b.year, summary: b.summary.slice(0, 400) } });
  const prev = loadLetters();
  const letter: Letter = { id: crypto.randomUUID?.() ?? String(Date.now()), at: new Date().toISOString(), note, bookId: b.id, paragraphs: paras, via: lastVia, parentId: prev.at(-1)?.id ?? null };
  const all = saveLetter(letter); markArchive(all.length);
  document.body.classList.add('has-letter');
  render(letter, b, conf, stampLabel);
}

function render(l: Letter, b: Book, conf: Confidence, stampLabel: string) {
  $('blank').hidden = true; const el = $('letter'); el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  if (innerWidth < 820) scrollTo({ top: 0, behavior: FAST ? 'auto' : 'smooth' });
  const d = new Date(l.at);
  $('to').textContent = `${d.toLocaleDateString('zh-CN')} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  const st = { label: stampLabel, awake: stampLabel === '唤醒' }, stamp = $('stamp');
  el.dataset.mode = 'recommend'; el.dataset.stamp = st.label; el.dataset.confidence = conf.level;
  stamp.className = 'stamp' + (st.awake ? '' : ' cool'); stamp.innerHTML = `${st.label}<small>${d.toISOString().slice(0, 10).replace(/-/g, '.')}</small>`;
  ['sign', 'card'].forEach(id => $(id).classList.remove('on')); el.querySelector('.actions')!.classList.remove('on');
  $('card').innerHTML = card(b, l.via);
  const img = $('card').querySelector('img'); img?.addEventListener('error', () => img.remove());
  typeOut(l.paragraphs, () => { $('sign').classList.add('on'); setTimeout(() => $('card').classList.add('on'), 200); setTimeout(() => stamp.classList.add('on'), 650); setTimeout(() => el.querySelector('.actions')!.classList.add('on'), 900); });
}
function card(b: Book, _via: 'semantic' | 'lexical') {
  const c = coverUrl(b.cover);
  const meta1 = [b.author, b.year, b.country].filter(Boolean).map(x => esc(String(x))).join(' · ');
  return `<div class="cover"><div class="ph">${esc(b.title)}</div>${c ? `<img src="${esc(c)}" alt="《${esc(b.title)}》封面" loading="lazy" decoding="async" width="${b.coverW ?? 180}" height="${b.coverH ?? 260}">` : ''}</div>
  <div class="cardtext"><div class="cno">借书卡 · ${isSleeping(b) ? '久未借出' : '在架'}</div><h3>《${esc(b.title)}》</h3>${b.originalTitle && b.originalTitle !== b.title ? `<div class="orig">${esc(b.originalTitle)}</div>` : ''}
  <div class="who">${meta1}</div>
  <p class="method"><a href="${esc(b.revisionUrl || b.sourceUrl)}" target="_blank" rel="noopener">维基原文 ↗</a> · <a href="#/credits">出处与版权</a></p></div>`;
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

$('foot').innerHTML = `<a href="#/credits">出处与版权 →</a> · 书的介绍来自中文维基百科与 Wikidata（CC BY-SA 4.0）· 封面来自 Open Library 与 Wikimedia Commons · 馆员就在你的浏览器里读纸条，纸条不会寄往别处`;
/** The nav shows that letters exist, never how many. */
function markArchive(n: number) { $('count').textContent = n ? '•' : ''; }
markArchive(loadLetters().length);

const archive = mountArchive($('archive'), byId, index);
let creditsDone = false;
async function showCredits() {
  if (creditsDone) return; creditsDone = true;
  const c = await fetch(`${import.meta.env.BASE_URL}data/credits.json`).then(r => r.json()) as { package: string; books: { title: string; text: { url: string }; cover: { provider: string; sourceUrl: string; licenseClass: string; license: string | null; artist: string | null } | null }[] };
  const LC: Record<string, string> = { free: '自由许可', 'publisher-copyright': '出版方版权 · 仅用于识别这本书', 'non-free-fair-use': '非自由 · 合理使用', unknown: '许可未明' };
  $('credits-list').innerHTML = c.books.map(b => `<li><b>《${esc(b.title)}》</b><span>文字：<a href="${esc(b.text.url)}" target="_blank" rel="noopener">中文维基百科</a>（CC BY-SA 4.0）</span><span>${b.cover ? `封面：<a href="${esc(b.cover.sourceUrl ?? '#')}" target="_blank" rel="noopener">${esc(b.cover.provider ?? '')}</a> · ${esc(b.cover.license ?? LC[b.cover.licenseClass] ?? '')}${b.cover.artist ? ` · ${esc(b.cover.artist)}` : ''}` : '封面：暂缺（用书名占位）'}</span></li>`).join('');
  $('credits-pkg').textContent = c.package;
}
function route() {
  const r = location.hash.startsWith('#/archive') ? 'archive' : location.hash.startsWith('#/credits') ? 'credits' : 'desk';
  $('desk').hidden = r !== 'desk'; $('archive').hidden = r !== 'archive'; $('credits').hidden = r !== 'credits'; $('foot').hidden = r === 'archive';
  if (r === 'credits') showCredits();
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', (a as HTMLElement).dataset.r === r));
  if (r === 'archive') archive.show(loadLetters());
}
addEventListener('hashchange', route); route();
Object.assign(bg, { ask, ready: () => state === 'ready', state: () => state });
