import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    host: true,
    port: 3000,
  },
});
