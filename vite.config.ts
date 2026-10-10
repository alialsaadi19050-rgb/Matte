import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Exercise, SectionFile } from './src/content/types.ts'
import { validateExercise } from './src/content/validate.ts'

const DATA = join(import.meta.dirname, 'public', 'content', 'data')

/**
 * Låter granskningssidan spara rättelser direkt i JSON-filerna under
 * public/content/data. Finns bara i utvecklingsservern (npm run dev).
 */
function contentApi(): Plugin {
  return {
    name: 'content-api',
    configureServer(server) {
      server.middlewares.use('/api/exercises/', (req, res) => {
        const id = decodeURIComponent((req.url ?? '').replace(/^\//, '').split('?')[0])
        if (req.method !== 'PUT' || !id) {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          const send = (status: number, payload: unknown) => {
            res.statusCode = status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
          }
          let exercise: Exercise
          try {
            exercise = JSON.parse(body)
          } catch {
            return send(400, { error: 'Ogiltig JSON' })
          }
          if (exercise.id !== id) return send(400, { error: 'id:t i adressen och i uppgiften skiljer sig' })
          const errors = validateExercise(exercise).filter((i) => i.level === 'error')
          if (errors.length) return send(422, { error: 'Uppgiften har fel', issues: errors })

          for (const file of readdirSync(DATA).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
            const path = join(DATA, file)
            const data = JSON.parse(readFileSync(path, 'utf8')) as SectionFile
            const i = data.exercises.findIndex((e) => e.id === id)
            if (i === -1) continue
            data.exercises[i] = exercise
            writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
            return send(200, { ok: true, file })
          }
          send(404, { error: `Hittar ingen uppgift med id ${id}` })
        })
      })
    },
  }
}

/**
 * Bokens okrypterade innehåll (public/content) får aldrig följa med i det som publiceras.
 * Den publicerade appen läser bara den krypterade public/vault.bin.
 */
function stripPlainContent(): Plugin {
  return {
    name: 'strip-plain-content',
    apply: 'build',
    writeBundle(options) {
      rmSync(join(options.dir ?? 'dist', 'content'), { recursive: true, force: true })
    },
  }
}

export default defineConfig({
  // På GitHub Pages ligger appen under /<repo>/; det sätts av arbetsflödet.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    contentApi(),
    stripPlainContent(),
    // Installerbar app som fungerar offline: appen, boken, figurerna och fotona sparas lokalt.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Matte',
        short_name: 'Matte',
        description: 'Räkna uppgifterna i din mattebok med ritplatta och få rättning direkt.',
        lang: 'sv',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        background_color: '#0f0c0a',
        theme_color: '#0f0c0a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,json,wasm,bin}'],
        // Det okrypterade innehållet publiceras aldrig (se stripPlainContent).
        globIgnores: ['**/content/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: {
    port: 5173,
    // JSON-filerna skrivs av granskningssidan själv; ladda inte om sidan då.
    watch: { ignored: ['**/public/content/data/**'] },
  },
})
