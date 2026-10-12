import type { Letter } from './types';
export interface Node { id: string; letter: Letter | null; parent: number; x: number; y: number; depth: number }
export interface Edge { a: number; b: number; w: number; near?: boolean }
/** Letters as a web, not a star. Index 0 is an invisible anchor ("你") kept for focus/reset.
 *  Each letter grows its strand from the earlier letter it is most related to (edge weight = shared themes + vector; plus k nearest semantic neighbours per letter
 *  similarity); unrelated letters start a new cluster. Positions come from a small deterministic force layout, so
 *  letters sharing themes pull together into clusters. */
export function layoutLetters(letters: Letter[], weight: (a: string, b: string) => number, minW = 0.28, k = 2, nearW = -Infinity): Node[] & { edges?: Edge[] } {
  const n = letters.length, nodes: Node[] & { edges?: Edge[] } = [{ id: 'root', letter: null, parent: -1, x: 0, y: 0, depth: 0 }];
  const edges: Edge[] = [];
  letters.forEach((l, i) => {
    let parent = -1, best = minW;
    for (let j = 0; j < i; j++) { const w = weight(letters[j].bookId, l.bookId); if (w >= minW) edges.push({ a: j + 1, b: i + 1, w }); if (w > best) { best = w; parent = j + 1; } }
    const a = i * 2.399963, r = 60 * Math.sqrt(i + 1);
    nodes.push({ id: l.id, letter: l, parent, x: Math.cos(a) * r, y: Math.sin(a) * r, depth: parent < 0 ? 1 : nodes[parent].depth + 1 });
  });
  // Semantic neighbours: every letter also links to its k most similar other letters (even below minW, as long as there is
  // some real similarity), so a handful of letters already reads as a network instead of isolated strands.
  const have = new Set(edges.map(e => `${e.a}-${e.b}`));
  for (let i = 0; i < n; i++) {
    const sims = letters.map((l, j) => [j, weight(letters[i].bookId, l.bookId)] as [number, number]).filter(([j, w]) => j !== i && w >= nearW).sort((a, b) => b[1] - a[1]).slice(0, k);
    for (const [j, w] of sims) { const a = Math.min(i, j) + 1, b = Math.max(i, j) + 1; if (have.has(`${a}-${b}`)) continue; have.add(`${a}-${b}`); edges.push({ a, b, w: Math.max(0.05, Math.min(w, minW)), near: true }); }
  }
  // deterministic force layout
  for (let it = 0; it < 260; it++) {
    const f = nodes.map(() => [0, 0]), cool = 1 - it / 300;
    for (let i = 1; i <= n; i++) for (let j = i + 1; j <= n; j++) { const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, d2 = dx * dx + dy * dy + 0.01, d = Math.sqrt(d2), k = 9000 / d2;
      f[i][0] += (dx / d) * k; f[i][1] += (dy / d) * k; f[j][0] -= (dx / d) * k; f[j][1] -= (dy / d) * k; }
    for (const e of edges) { const A = nodes[e.a], B = nodes[e.b], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, k = (d - 110 / (0.5 + e.w)) * 0.04 * e.w;
      f[e.a][0] += (dx / d) * k; f[e.a][1] += (dy / d) * k; f[e.b][0] -= (dx / d) * k; f[e.b][1] -= (dy / d) * k; }
    for (let i = 1; i <= n; i++) { f[i][0] -= nodes[i].x * 0.012; f[i][1] -= nodes[i].y * 0.012;
      const m = Math.hypot(f[i][0], f[i][1]), cap = 18 * cool; const s = m > cap ? cap / m : 1; nodes[i].x += f[i][0] * s; nodes[i].y += f[i][1] * s; }
  }
  if (n) { nodes[0].x = nodes.slice(1).reduce((s, v) => s + v.x, 0) / n; nodes[0].y = nodes.slice(1).reduce((s, v) => s + v.y, 0) / n; }
  nodes.edges = edges; return nodes;
}
export function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
export function firstDegree(nodes: Node[] & { edges?: Edge[] }, f: number): Set<number> {
  const s = new Set([f]); for (const e of nodes.edges ?? []) { if (e.a === f) s.add(e.b); if (e.b === f) s.add(e.a); } return s;
}
