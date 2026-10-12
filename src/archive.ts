import type { Book, Letter } from './types';
import type { Index } from './retrieve';
import { layoutLetters, firstDegree, hash, type Node } from './layout';

export function mountArchive(root: HTMLElement, byId: Map<string, Book>, index: Index) {
  const cv = root.querySelector('canvas')!, x = cv.getContext('2d')!, side = root.querySelector<HTMLElement>('#side')!;
  const pos = new Map(index.books.map((b, i) => [b.id, i]));
  const sim = (a: string, b: string) => { const i = pos.get(a)!, j = pos.get(b)!; let s = 0; for (let k = 0; k < index.dim; k++) s += index.vecs[i * index.dim + k] * index.vecs[j * index.dim + k]; return s / index.scale / index.scale; };
  const GEN = /世纪作品|文学$|文本叙事|作品语境|^自传$|^传记$|^图像小说$/;
  const weight = (a: string, b: string) => { const A = byId.get(a), B = byId.get(b); if (!A || !B) return 0; const shared = A.themes.filter(t => !GEN.test(t) && B.themes.includes(t)).length; return 0.45 * shared + Math.max(0, sim(a, b)); };
  let nodes: Node[] & { edges?: import('./layout').Edge[] } = [], focus = 0, W = 0, H = 0, born = new Map<number, number>();
  const cam = { x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1 };
  const mobile = () => W < 820;
  const ox = () => (mobile() ? W / 2 : (W - 360) / 2), oy = () => (mobile() ? H * 0.36 : H / 2);
  const toScreen = (n: Node) => [(n.x - cam.x) * cam.z + ox(), (n.y - cam.y) * cam.z + oy()];
  function resize() { const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1; W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; x.setTransform(d, 0, 0, d, 0, 0); }
  addEventListener('resize', resize);

  function setFocus(i: number, fly = true) { focus = i; const n = nodes[i]; if (fly) { cam.tx = n.x; cam.ty = n.y; } renderSide(); }
  const clusterOf = (n: Node): string => { let c = n; while (c.parent > 0) c = nodes[c.parent]; return c.id; };
  function renderSide() {
    const L = nodes.slice(1).map(n => n.letter!);
    if (!L.length) { side.innerHTML = `<p class="k">archive of letters</p><div class="n">0<small>封回信</small></div><div class="focus empty-arch">还没有回信。<br><a href="#/">先去写一张纸条 →</a></div>`; return; }
    const f = nodes[focus].letter, b = f && byId.get(f.bookId);
    const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    side.innerHTML = `<p class="k">archive of letters</p><div class="n">${L.length}<small>封回信 · ${(nodes.edges ?? []).length} 条连线 · ${new Set(nodes.slice(1).map(n => clusterOf(n))).size} 簇</small></div>
    <div class="focus">${b && f ? `<h3>《${esc(b.title)}》</h3><div class="when">${new Date(f.at).toLocaleString('zh-CN')} · ${f.via === 'semantic' ? '语义检索' : '字面检索'}</div><div class="nt">“${esc(f.note)}”</div><p class="hk">${esc(b.hook)}</p>`
      : `<h3>回信档案</h3><p class="hk">相近的书会接在彼此身上，共享主题的信之间有细线；毫不相干的信会另起一簇。</p>`}</div>
    <ol>${nodes.slice(1).map((n, i) => `<li data-i="${i + 1}" class="${i + 1 === focus ? 'on' : ''}"><i>${String(i + 1).padStart(2, '0')}</i>${esc(byId.get(n.letter!.bookId)?.title ?? '')}</li>`).reverse().join('')}</ol>`;
  }
  side.addEventListener('click', e => { const li = (e.target as HTMLElement).closest('li'); if (li) setFocus(+li.dataset.i!); });

  // pan / zoom / pinch / tap
  const ptrs = new Map<number, { x: number; y: number }>(); let moved = 0, pinch = 0;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; });
  cv.addEventListener('pointermove', e => { const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d0 = Math.hypot(a.x - b.x, a.y - b.y); p.x = e.clientX; p.y = e.clientY; const [c, d] = [...ptrs.values()]; const d1 = Math.hypot(c.x - d.x, c.y - d.y); if (pinch) zoomBy(d1 / d0); pinch = 1; moved = 99; return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; moved += Math.abs(dx) + Math.abs(dy); p.x = e.clientX; p.y = e.clientY;
    cam.tx -= dx / cam.z; cam.ty -= dy / cam.z; cam.x = cam.tx; cam.y = cam.ty; });
  const up = (e: PointerEvent) => { ptrs.delete(e.pointerId); pinch = 0; if (moved < 6 && !ptrs.size) tap(e); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => ptrs.delete(e.pointerId));
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  const zoomBy = (k: number) => { cam.tz = Math.max(0.35, Math.min(3, cam.tz * k)); };
  root.querySelector('.zoom')!.addEventListener('click', e => { const z = +((e.target as HTMLElement).dataset.z ?? NaN); if (isNaN(z)) return; if (z) zoomBy(z); else { cam.tz = 1; setFocus(0); } });
  function tap(e: PointerEvent) { const r = cv.getBoundingClientRect(); let hit = -1, bd = 26; nodes.forEach((n, i) => { const [sx, sy] = toScreen(n); const d = Math.hypot(sx - (e.clientX - r.left), sy - (e.clientY - r.top)); if (d < bd) { bd = d; hit = i; } }); if (hit >= 0) setFocus(hit); }

  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const q = (a: number, b: number, c: number, d: number, e: number, f: number, t: number) => { const u = 1 - t; return [u * u * a + 2 * u * t * c + t * t * e, u * u * b + 2 * u * t * d + t * t * f]; };
  const GENERIC = /世纪作品|文学$|文本叙事|作品语境/;
  let web: [number, number, string][] = [];
  function buildWeb() { web = []; for (const e of nodes.edges ?? []) { if (nodes[e.b].parent === e.a || nodes[e.a].parent === e.b) continue;
    const a = byId.get(nodes[e.a].letter!.bookId), b = byId.get(nodes[e.b].letter!.bookId); const t = a && b ? a.themes.find(x => !GENERIC.test(x) && b.themes.includes(x)) ?? '' : ''; web.push([e.a, e.b, e.near && !t ? '~' : t]); } }
  let raf = 0;
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    cam.x += (cam.tx - cam.x) * 0.08; cam.y += (cam.ty - cam.y) * 0.08; cam.z += (cam.tz - cam.z) * 0.12;
    x.clearRect(0, 0, W, H);
    const prog = (i: number) => Math.min(1, (now - (born.get(i) ?? -1e9)) / 1400);
    const near = firstDegree(nodes, focus); web.forEach(([a, b]) => { if (a === focus) near.add(b); if (b === focus) near.add(a); });
    // theme web: thin threads between letters whose books share a (non-generic) theme
    web.forEach(([a, b, t]) => { if (prog(a) < 1 || prog(b) < 1) return; const [ax, ay] = toScreen(nodes[a]), [bx, by] = toScreen(nodes[b]); const hot = a === focus || b === focus;
      const nearOnly = web.length && t === '~'; x.setLineDash(nearOnly ? [1, 4] : [3, 4]); x.lineWidth = hot ? 1.3 : 1; x.strokeStyle = hot ? 'rgba(200,54,29,.75)' : nearOnly ? 'rgba(29,26,22,.3)' : 'rgba(29,26,22,.4)'; x.beginPath(); x.moveTo(ax, ay); x.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - 30 * cam.z, bx, by); x.stroke(); x.setLineDash([]);
      if (hot && t !== '~') { x.font = '11px "IBM Plex Mono", monospace'; x.fillStyle = 'rgba(200,54,29,.85)'; x.fillText(t, (ax + bx) / 2 + 4, (ay + by) / 2 - 16 * cam.z); } });
    nodes.forEach((n, i) => { if (n.parent < 0) return; const p = nodes[n.parent]; const t = ease(prog(i)); const [ax, ay] = toScreen(p), [bx, by] = toScreen(n);
      const h = hash(n.id), bend = ((h % 100) / 100 - 0.5) * 0.6, mx = (ax + bx) / 2 - (by - ay) * bend, my = (ay + by) / 2 + (bx - ax) * bend;
      const hot = near.has(i) && near.has(n.parent), steps = 36, lim = Math.floor(steps * t);
      x.strokeStyle = hot ? 'rgba(200,54,29,.85)' : 'rgba(29,26,22,.72)'; x.lineCap = 'round';
      for (let s = 0; s < lim; s++) { const p0 = q(ax, ay, mx, my, bx, by, s / steps), p1 = q(ax, ay, mx, my, bx, by, (s + 1) / steps);
        x.lineWidth = Math.max(0.5, (2.8 * (1 - s / steps) + 0.5) * cam.z * (1 + 0.25 * Math.sin(h + s))); x.beginPath(); x.moveTo(p0[0], p0[1]); x.lineTo(p1[0], p1[1]); x.stroke(); }
      if (t > 0.4) { x.lineWidth = 0.5; x.strokeStyle = 'rgba(29,26,22,.22)'; for (let k = 1; k < 6; k++) { const pp = q(ax, ay, mx, my, bx, by, (k / 6) * t), a = h * k * 0.37; x.beginPath(); x.moveTo(pp[0], pp[1]); x.lineTo(pp[0] + Math.cos(a) * 11 * cam.z * t, pp[1] + Math.sin(a) * 11 * cam.z * t); x.stroke(); } } });
    nodes.forEach((n, i) => { if (i === 0 && nodes.length > 1) return; if (n.parent >= 0 && prog(i) < 0.95) return; const [sx, sy] = toScreen(n); const b = n.letter && byId.get(n.letter.bookId);
      const isF = i === focus, show = near.has(i), r = (i === 0 ? 7 : isF ? 7.5 : 4.5) * Math.min(1.4, Math.max(0.7, cam.z));
      x.beginPath(); x.arc(sx, sy, r, 0, 7);
      if (i === 0) { x.fillStyle = '#efe7d6'; x.fill(); x.lineWidth = 1.6; x.strokeStyle = '#1d1a16'; x.stroke(); }
      else if (b && b.obscurity.percentile >= 0.6) { x.lineWidth = 1.5; x.strokeStyle = isF ? '#c8361d' : '#5d6b3a'; x.stroke(); x.beginPath(); x.arc(sx, sy, r * 0.38, 0, 7); x.fillStyle = x.strokeStyle; x.fill(); }
      else { x.fillStyle = isF ? '#c8361d' : '#1d1a16'; x.fill(); }
      if (isF) { x.beginPath(); x.arc(sx, sy, r + 6 + Math.sin(now / 500) * 1.5, 0, 7); x.strokeStyle = 'rgba(200,54,29,.35)'; x.lineWidth = 1; x.stroke(); }
      if (show) { const label = `《${b?.title ?? ''}》`; x.font = `${isF ? 900 : 500} ${isF ? 17 : 13}px "Noto Serif SC", serif`; x.fillStyle = isF ? '#c8361d' : '#1d1a16';
        const txt = label.length > 14 ? label.slice(0, 13) + '…' : label; const w = x.measureText(txt).width, right = mobile() ? W : W - 360;
        const lx = sx + r + 8 + w > right - 10 ? sx - r - 8 - w : sx + r + 8;
        x.fillStyle = 'rgba(239,231,214,.9)'; x.fillRect(lx - 4, sy - 12, w + 8, 22); x.fillStyle = isF ? '#c8361d' : '#1d1a16'; x.fillText(txt, lx, sy + 5); } });
  }
  return {
    show(letters: Letter[]) {
      resize(); const before = nodes.length; nodes = layoutLetters(letters, weight); buildWeb();
      const now = performance.now(); nodes.forEach((_, i) => { if (i >= before && before > 0) born.set(i, now); else if (!born.has(i)) born.set(i, now + i * 260); });
      setFocus(nodes.length - 1, false); const fN = nodes[focus], cx = mobile() ? fN.x * 0.6 : nodes.reduce((a, n) => a + n.x, 0) / nodes.length, cy = mobile() ? fN.y * 0.6 : nodes.reduce((a, n) => a + n.y, 0) / nodes.length; cam.x = cam.tx = cx; cam.y = cam.ty = cy;
      if (!raf) raf = requestAnimationFrame(frame);
    },
  };
}
