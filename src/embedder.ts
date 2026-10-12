// Lazily loads the self-hosted Chinese embedding model (same one used offline for the books). Runs in the browser, WASM only.
type Extractor = (t: string, o: object) => Promise<{ data: Float32Array }>;
export interface ModelInfo { model: string; pooling: 'mean' | 'cls'; queryPrefix: string }
let p: Promise<Extractor> | null = null;
export function loadEmbedder(m: ModelInfo, onProgress?: (loaded: number, total: number) => void): Promise<Extractor> {
  return (p ??= import('@huggingface/transformers').then(async ({ pipeline, env }) => {
    const base = new URL(import.meta.env.BASE_URL, location.href).href;
    env.allowRemoteModels = false; env.allowLocalModels = true; env.localModelPath = `${base}models/`;
    if (env.backends.onnx.wasm) { env.backends.onnx.wasm.wasmPaths = `${base}ort/`; env.backends.onnx.wasm.numThreads = 1; }
    const files = new Map<string, [number, number]>();
    return (await pipeline('feature-extraction', m.model, { dtype: 'q8', device: 'wasm', progress_callback: (e: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (e.status === 'progress' && e.file && e.total) { files.set(e.file, [e.loaded ?? 0, e.total]); let l = 0, t = 0; files.forEach(([a, b]) => { l += a; t += b; }); onProgress?.(l, t); } } })) as unknown as Extractor;
  }));
}
export async function embed(m: ModelInfo, text: string): Promise<Float32Array> {
  const fe = await loadEmbedder(m); return (await fe(m.queryPrefix + text, { pooling: m.pooling, normalize: true })).data;
}
