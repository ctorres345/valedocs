import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2020' },
  test: { environment: 'node', testTimeout: 60000 },
});
