export interface Obscurity { score: number; percentile: number; zhViews: number | null; enViews: number | null; sitelinks: number }
export interface Link { id: string; kind: string; band: 'near' | 'middle' | 'far' | null; sharedThemes: string[]; similarity: number; sentence?: string }
export interface Book { id: string; title: string; author: string | null; year: number | null; country: string | null; language: string | null; originalTitle: string | null;
  summary: string; hook: string; themes: string[]; cover: string | null; sourceUrl: string; wikidataUrl: string; obscurity: Obscurity; links: Link[] }
export interface Catalog { generatedAt: string; obscuritySource: { method: string; window: [string, string]; fetchedAt: string; formula: string }; books: Book[] }
export interface VecMeta { model: string; pooling?: 'mean' | 'cls'; queryPrefix?: string; downloadMB?: number; dim: number; count: number; scale: number; mean: number[]; order: string[] }
export interface Letter { id: string; at: string; note: string; bookId: string; paragraphs: Para[]; via: 'semantic' | 'lexical'; parentId: string | null }
export interface Para { k: 'note' | 'say' | 'quote' | 'data'; t: string }
