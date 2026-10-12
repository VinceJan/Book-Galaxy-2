import type { Catalog, VecMeta, Book } from './types';
import type { Index } from './retrieve';
const base = import.meta.env.BASE_URL;
export async function loadAll(): Promise<{ cat: Catalog; byId: Map<string, Book>; index: Index; meta: VecMeta }> {
  const [cat, meta, bin] = await Promise.all([
    fetch(`${base}data/books.json`).then(r => r.json() as Promise<Catalog>),
    fetch(`${base}data/vectors.meta.json`).then(r => r.json() as Promise<VecMeta>),
    fetch(`${base}data/vectors.i8.bin`).then(r => r.arrayBuffer())]);
  const pos = new Map(meta.order.map((id, i) => [id, i]));
  const books = [...cat.books].sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
  return { cat: { ...cat, books }, byId: new Map(books.map(b => [b.id, b])), meta,
    index: { books, dim: meta.dim, vecs: new Int8Array(bin), scale: meta.scale, mean: Float32Array.from(meta.mean) } };
}
export const coverUrl = (c: string | null) => (!c ? null : c.startsWith('http') ? c : `${base}${c}`);
