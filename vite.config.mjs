import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  server: {
    port: 5180,
    watch: {
      // Exclude large dirs from file watcher — src-tauri/target is 9GB+
      ignored: ['**/src-tauri/target/**', '**/admin-desktop/**', '**/saas_pos/**'],
    },
  },
  optimizeDeps: {
    include: [
      'preact',
      'preact/hooks',
      'preact/compat',
      '@preact/signals',
      'preact-router',
      'jsbarcode',
      '@tauri-apps/api/core',
      '@tauri-apps/plugin-store',
      '@tauri-apps/plugin-os',
    ],
    noDiscovery: true,
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
