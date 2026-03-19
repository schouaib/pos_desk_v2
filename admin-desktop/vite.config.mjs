import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5181,
  },
  base: './',
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['preact', 'preact/hooks', 'preact/compat', '@preact/signals'],
          'router': ['preact-router'],
        },
      },
    },
  },
})
