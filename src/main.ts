import './style.css';
import { loadAll, coverUrl } from './data';
import { centre, dot, rank, lexicalSims, type Hit } from './retrieve';
import { loadEmbedder, embed } from './embedder';
import { composeLetter, rewrite } from './letter';
import { stampFor } from './obscurity';
import { loadLetters, saveLetter } from './store';
import { mountArchive } from './archive';
import type { Book, Letter, Para } from './types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const PROMPTS = ['想逃离城市一阵子', '和父亲很久没说话了', '对工作失去了意义感', '想读点让人害怕的', '失恋了，但不想被安慰', '好奇宇宙到底有多大'];
const FAST = new URLSearchParams(location.search).has('fast');

const { cat, byId, index, meta } = await loadAll();
let semantic = false;
const engine = $('engine');
engine.textContent = '馆员先按字面翻找；语义目录正在载入…';
loadEmbedder(meta.model, p => (engine.textContent = `语义目录载入中 ${Math.round(p)}%`))
  .then(() => { semantic = true; engine.textContent = `语义检索就绪 · ${meta.model.split('/')[1]} · 在本机运行`; engine.classList.add('ok'); })
  .catch(() => (engine.textContent = '语义模型没能载入，馆员改用字面检索'));

$('chips').innerHTML = PROMPTS.map(p => `<button type="button" class="chip">${p}</button>`).join('');
$('chips').addEventListener('click', e => { const t = e.target as HTMLElement; if (t.classList.contains('chip')) { $<HTMLTextAreaElement>('q').value = t.textContent!; ask(); } });
$('form').addEventListener('submit', e => { e.preventDefault(); ask(); });
$('again').addEventListener('click', () => ask(lastNote));
$<HTMLTextAreaElement>('q').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask(); });

let lastNote = '', lastHits: Hit[] = [], cursor = 0, typing = 0;
const given = new Set(loadLetters().map(l => l.bookId));

async function search(note: string): Promise<{ hits: Hit[]; via: 'semantic' | 'lexical' }> {
  if (semantic) {
    const q = centre(await embed(meta.model, note), index.mean);
    return { hits: rank(index.books.map((_, i) => dot(q, index, i)), index.books, { exclude: given }), via: 'semantic' };
  }
  const sims = lexicalSims(note, index.books);
  return { hits: rank(sims, index.books, { exclude: given }), via: 'lexical' };
}

let lastVia: 'semantic' | 'lexical' = 'lexical';
async function ask(again?: string) {
  const note = (again ?? $<HTMLTextAreaElement>('q').value).trim() || '随便给我一本，我信你';
  if (note !== lastNote || !lastHits.length) { const r = await search(note); lastHits = r.hits; lastVia = r.via; cursor = 0; lastNote = note; }
  const hit = lastHits[cursor++ % Math.max(1, lastHits.length)]; if (!hit) return;
  const b = hit.book; given.add(b.id);
  let paras = composeLetter(note, b, byId, cat.obscuritySource.window, lastVia);
  paras = await rewrite(paras, { note, book: { title: b.title, author: b.author, year: b.year, hook: b.hook, obscurity: b.obscurity } });
  const prev = loadLetters();
  const letter: Letter = { id: crypto.randomUUID?.() ?? String(Date.now()), at: new Date().toISOString(), note, bookId: b.id, paragraphs: paras, via: lastVia, parentId: prev.at(-1)?.id ?? null };
  const all = saveLetter(letter); $('count').textContent = String(all.length);
  render(letter, b, all.length);
}

function render(l: Letter, b: Book, n: number) {
  $('blank').hidden = true; const el = $('letter'); el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  if (innerWidth < 820) $('table').scrollIntoView({ behavior: FAST ? 'auto' : 'smooth' });
  const d = new Date(l.at);
  $('to').textContent = `TO：今夜的读者　　${d.toLocaleDateString('zh-CN')} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}　　第 ${n} 封`;
  const st = stampFor(b), stamp = $('stamp');
  stamp.className = 'stamp' + (st.awake ? '' : ' cool'); stamp.innerHTML = `${st.label}<small>${d.toISOString().slice(0, 10).replace(/-/g, '.')}</small>`;
  ['sign', 'card'].forEach(id => $(id).classList.remove('on')); el.querySelector('.actions')!.classList.remove('on');
  $('card').innerHTML = card(b);
  const img = $('card').querySelector('img'); img?.addEventListener('error', () => img.remove());
  typeOut(l.paragraphs, () => { $('sign').classList.add('on'); setTimeout(() => $('card').classList.add('on'), 200); setTimeout(() => stamp.classList.add('on'), 650); setTimeout(() => el.querySelector('.actions')!.classList.add('on'), 900); });
}
function card(b: Book) {
  const c = coverUrl(b.cover);
  const row = (k: string, v: string | number | null | undefined) => (v == null || v === '' ? '' : `<dt>${k}</dt><dd>${esc(String(v))}</dd>`);
  return `<div class="cover"><div class="ph">${esc(b.title)}</div>${c ? `<img src="${esc(c)}" alt="《${esc(b.title)}》封面" loading="lazy" referrerpolicy="no-referrer">` : ''}</div>
  <div><h3>《${esc(b.title)}》</h3>${b.originalTitle && b.originalTitle !== b.title ? `<div class="orig">${esc(b.originalTitle)}</div>` : ''}
  <dl>${row('著者', b.author)}${row('年份', b.year)}${row('地域', [b.country, b.language].filter(Boolean).join(' · '))}${row('主题', b.themes.join(' / '))}
  ${row('冷门度', `${Math.round(b.obscurity.percentile * 100)} / 100`)}</dl>
  <a class="src" href="${esc(b.sourceUrl)}" target="_blank" rel="noopener">来源：中文维基百科 / Wikidata ↗</a></div>`;
}
function typeOut(paras: Para[], done: () => void) {
  const body = $('body'); body.innerHTML = ''; const my = ++typing;
  const ps = paras.map(p => { const el = document.createElement('p'); el.className = p.k; body.append(el); return el; });
  let i = 0, j = 0; const caret = '<span class="caret"></span>';
  const tick = () => {
    if (my !== typing) return;
    if (i >= paras.length) { ps.at(-1)!.innerHTML = esc(paras.at(-1)!.t); return done(); }
    const t = paras[i].t; j = Math.min(t.length, j + (paras[i].k === 'say' ? 1 : 3));
    ps[i].innerHTML = esc(t.slice(0, j)) + caret;
    if (j >= t.length) { ps[i].innerHTML = esc(t); i++; j = 0; setTimeout(tick, FAST ? 0 : 260); } else setTimeout(tick, FAST ? 0 : 26);
  };
  tick();
}

$('foot').innerHTML = `书目：中文维基百科 / Wikidata（CC BY-SA 4.0）· 封面：Open Library · 冷门度：Wikimedia 浏览量 ${cat.obscuritySource.window.join('–')}（zh+en）与 Wikidata 语言版本数，取于 ${cat.obscuritySource.fetchedAt.slice(0, 10)} · 语义检索：${meta.model}，全部在浏览器本地运行`;
$('count').textContent = String(loadLetters().length);

const archive = mountArchive($('archive'), byId, index);
function route() {
  const r = location.hash.startsWith('#/archive') ? 'archive' : 'desk';
  $('desk').hidden = r !== 'desk'; $('archive').hidden = r !== 'archive'; $('foot').hidden = r !== 'desk';
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', (a as HTMLElement).dataset.r === r));
  if (r === 'archive') archive.show(loadLetters());
}
addEventListener('hashchange', route); route();
(window as unknown as { __bg: unknown }).__bg = { ask, ready: () => semantic };
