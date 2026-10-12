import { defineConfig } from 'vite';
export default defineConfig({ base: process.env.BASE ?? '/Book-Galaxy-2/', build: { target: 'es2022', chunkSizeWarningLimit: 1200 }, worker: { format: 'es' } });
