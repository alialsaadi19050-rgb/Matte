import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4'
import '@fontsource-variable/bricolage-grotesque'
import 'katex/dist/katex.min.css'
import './styles/base.css'
import './design/palettes.css'
import { App } from './App.tsx'
import { applyTheme, loadTheme } from './design/theme.ts'

applyTheme(loadTheme())

// När en ny version av appen tar över (ny service worker) laddas sidan om, så att koden
// och den låsta boken alltid kommer från samma version. Inte vid allra första besöket.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
