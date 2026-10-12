import type { Letter } from './types';
export interface Node { id: string; letter: Letter | null; parent: number; x: number; y: number; depth: number }
/** One node per letter (+ a root "you"). Each letter attaches to the earlier letter whose book is most similar
 *  (cosine over the bundled vectors), or to the root when nothing is similar enough. Deterministic. */
export function layoutLetters(letters: Letter[], sim: (a: string, b: string) => number, threshold = 0.3): Node[] {
  const nodes: Node[] = [{ id: 'root', letter: null, parent: -1, x: 0, y: 0, depth: 0 }];
  const kids = new Map<number, number>();
  letters.forEach((l, i) => {
    let parent = 0, best = threshold;
    for (let j = 1; j < nodes.length; j++) { const s = sim(nodes[j].letter!.bookId, l.bookId); if (s > best) { best = s; parent = j; } }
    const p = nodes[parent], k = kids.get(parent) ?? 0; kids.set(parent, k + 1);
    const baseAng = parent === 0 ? 0 : Math.atan2(p.y - nodes[p.parent].y, p.x - nodes[p.parent].x);
    const ang = parent === 0 ? k * 2.399963 : baseAng + (k % 2 ? 1 : -1) * (0.45 + 0.35 * Math.floor(k / 2)) * (k === 0 ? 0.3 : 1);
    const dist = parent === 0 ? 150 + 26 * Math.sqrt(k) : 120 + (hash(l.id) % 40);
    nodes.push({ id: l.id, letter: l, parent, x: p.x + Math.cos(ang) * dist, y: p.y + Math.sin(ang) * dist, depth: p.depth + 1 });
    void i;
  });
  return nodes;
}
export function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
export function firstDegree(nodes: Node[], f: number): Set<number> {
  const s = new Set([f]); if (nodes[f]?.parent >= 0) s.add(nodes[f].parent); nodes.forEach((n, i) => n.parent === f && s.add(i)); return s;
}
