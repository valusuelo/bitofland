import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves this project under /bitofland/.
  // When moving to a root-domain host such as Cloudflare Pages, change this to '/'.
  base: process.env.GITHUB_ACTIONS ? '/bitofland/' : '/',
  server: { host: '0.0.0.0' },
  build: { sourcemap: true }
});
