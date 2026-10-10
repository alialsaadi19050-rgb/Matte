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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
