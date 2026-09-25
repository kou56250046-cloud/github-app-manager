import { defineConfig } from 'vite';
import { apiPlugin } from './server/apiPlugin.mjs';

export default defineConfig({
  // GitHub Pages の project site 配下で動くよう相対パスで出力する
  base: './',
  plugins: [apiPlugin()],
  server: {
    host: '127.0.0.1',   // 外部からアクセスさせない
    port: 5178,          // ~/projects/PORTS.md で割り当て済み
    strictPort: true,
  },
  build: {
    outDir: 'docs',
    emptyOutDir: false,  // docs/projects.public.json を消さない
  },
});
