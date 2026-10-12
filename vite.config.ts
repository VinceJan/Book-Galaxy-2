import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
const ortDir = fileURLToPath(new URL('./node_modules/onnxruntime-web/dist/', import.meta.url));
export default defineConfig({
  base: process.env.BASE ?? '/Book-Galaxy-2/',
  // WASM-only ONNX runtime (11 MB wasm instead of the 21 MB WebGPU/JSEP build), self-hosted under /ort/.
  resolve: { alias: [{ find: /^onnxruntime-web$/, replacement: ortDir + 'ort.wasm.bundle.min.mjs' }] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  plugins: [{ name: 'ort-wasm', apply: 'build', writeBundle(o) { fs.mkdirSync(`${o.dir}/ort`, { recursive: true }); for (const f of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) fs.copyFileSync(ortDir + f, `${o.dir}/ort/${f}`); } },
    { name: 'ort-dev', apply: 'serve', configureServer(s) { s.middlewares.use((req, res, next) => { const m = req.url?.match(/\/ort\/(ort-wasm-simd-threaded\.(?:wasm|mjs))/); if (!m) return next(); res.setHeader('content-type', m[1].endsWith('wasm') ? 'application/wasm' : 'text/javascript'); fs.createReadStream(ortDir + m[1]).pipe(res); }); } }],
});
