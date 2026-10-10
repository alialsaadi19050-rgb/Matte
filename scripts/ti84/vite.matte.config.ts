// Bygger emulatorn för inbäddning i Matte-appen (public/ti84/).
// Utan PWA och utan den ROM som följer med repot.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  base: './',
  plugins: [react()],
  publicDir: 'matte-public',
  build: {
    outDir: resolve(__dirname, '../../../public/ti84'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'matte.html') },
  },
  optimizeDeps: { exclude: ['emu-core'] },
})
