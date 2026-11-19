import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // rutas relativas: funciona en itch.io y GitHub Pages
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
  server: { port: 5173 },
});
