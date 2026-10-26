import { defineConfig } from 'vite';

// base: './' 讓打包結果可以直接放在 GitHub Pages 的子路徑下
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
