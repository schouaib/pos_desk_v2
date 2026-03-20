import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  server: {
    port: 5181,
    watch: {
      ignored: ['**/src-tauri/target/**', '**/saas_pos/**'],
    },
  },
  optimizeDeps: {
    include: [
      'preact',
      'preact/hooks',
      'preact/compat',
      '@preact/signals',
      'preact-router',
    ],
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
