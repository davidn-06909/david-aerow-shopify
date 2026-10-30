import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  publicDir: false,
  build: {
    outDir: 'public/pilot-assets', emptyOutDir: true, sourcemap: true,
    lib: { entry: resolve('storefront/entry.tsx'), formats: ['es'], fileName: () => 'ring-configurator.js', cssFileName: 'ring-configurator' },
    rollupOptions: { output: { chunkFileNames: '[name]-[hash].js', assetFileNames: '[name][extname]' } },
    target: 'es2022',
  },
});
