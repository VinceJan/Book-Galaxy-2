// Lazily loads the same multilingual model used offline to embed the books; runs fully in the browser.
type Extractor = (t: string, o: object) => Promise<{ data: Float32Array }>;
let p: Promise<Extractor> | null = null;
export function loadEmbedder(model: string, onProgress?: (pct: number) => void): Promise<Extractor> {
  return (p ??= import('@huggingface/transformers').then(async ({ pipeline, env }) => {
    env.allowLocalModels = false;
    return (await pipeline('feature-extraction', model, { dtype: 'q8', progress_callback: (e: { status: string; progress?: number }) => { if (e.status === 'progress' && e.progress != null) onProgress?.(e.progress); } })) as unknown as Extractor;
  }));
}
export async function embed(model: string, text: string): Promise<Float32Array> {
  const fe = await loadEmbedder(model); return (await fe(text, { pooling: 'mean', normalize: true })).data;
}
