import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: false,
    rollupOptions: {
      input: 'src/browser/main.ts',
      output: {
        entryFileNames: 'bundle.js',
        format: 'iife',
        name: 'App',
      },
    },
  },
});
