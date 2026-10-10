import { useEffect, useState, useSyncExternalStore } from 'react'
import { applyTheme, buildTheme, DEFAULT_THEME, loadTheme, PRESETS, saveTheme, type ThemeSettings } from './theme.ts'
import './theme-editor.css'

/* Ett litet globalt lager för temat så att alla sidor ser samma val. */
let current: ThemeSettings = loadTheme()
const listeners = new Set<() => void>()

export function setTheme(patch: Partial<ThemeSettings>) {
  current = { ...current, ...patch }
  applyTheme(current)
  saveTheme(current)
  listeners.forEach((l) => l())
}

export function useTheme(): ThemeSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

/** Öppnar redigeraren från andra knappar, t.ex. kugghjulet i menyn. */
export const openThemeEditor = () => window.dispatchEvent(new Event('matte:open-theme'))

const PaletteIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2Z" />
    <circle cx="7.5" cy="11" r="1.2" fill="currentColor" />
    <circle cx="10.5" cy="7" r="1.2" fill="currentColor" />
    <circle cx="15" cy="7.5" r="1.2" fill="currentColor" />
  </svg>
)

export function ThemeEditor() {
  const t = useTheme()
  const [open, setOpen] = useState(false)
  const [hexDraft, setHexDraft] = useState(t.accent)

  useEffect(() => setHexDraft(t.accent), [t.accent])
  useEffect(() => {
    const onOpen = () => setOpen(true)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('matte:open-theme', onOpen)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('matte:open-theme', onOpen)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const activePreset = PRESETS.find((p) => p.settings.accent.toLowerCase() === t.accent.toLowerCase() && p.settings.bgHue === t.bgHue)

  return (
    <>
      <button className="te-fab" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="theme-editor">
        <PaletteIcon /> Färger
      </button>
      {open && (
        <section id="theme-editor" className="te-panel" aria-label="Färger">
          <header>
            <h2>Dina färger</h2>
            <button className="te-close" onClick={() => setOpen(false)} aria-label="Stäng">
              ×
            </button>
          </header>

          <div className="te-seg" role="radiogroup" aria-label="Läge">
            {(['dark', 'light'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={t.mode === m} className={t.mode === m ? 'on' : ''} onClick={() => setTheme({ mode: m })}>
                {m === 'dark' ? 'Mörkt' : 'Ljust'}
              </button>
            ))}
          </div>

          <h3>Förval</h3>
          <div className="te-presets">
            {PRESETS.map((p) => {
              const colors = buildTheme({ ...t, ...p.settings })
              return (
                <button
                  key={p.id}
                  className={activePreset?.id === p.id ? 'on' : ''}
                  onClick={() => setTheme(p.settings)}
                  style={{ background: colors['--bg'], color: colors['--text'] }}
                >
                  <i style={{ background: p.settings.accent, boxShadow: `0 0 12px ${p.settings.accent}` }} />
                  {p.name}
                </button>
              )
            })}
          </div>

          <h3>Accentfärg</h3>
          <p className="te-help">Knappar, glöd, framsteg och rätt svar.</p>
          <div className="te-accent">
            <input type="color" value={t.accent} onChange={(e) => setTheme({ accent: e.target.value })} aria-label="Välj accentfärg" />
            <input
              className="te-hex"
              value={hexDraft}
              onChange={(e) => {
                setHexDraft(e.target.value)
                if (/^#?[0-9a-f]{6}$/i.test(e.target.value)) setTheme({ accent: e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}` })
              }}
              aria-label="Accentfärg som hex"
              spellCheck={false}
            />
          </div>

          <h3>Bakgrund</h3>
          <label className="te-range">
            <span>Färgton</span>
            <input type="range" min={0} max={360} value={t.bgHue} onChange={(e) => setTheme({ bgHue: Number(e.target.value) })} className="te-hue" />
          </label>
          <label className="te-range">
            <span>Färgstyrka</span>
            <input type="range" min={0} max={100} value={Math.round(t.bgTint * 100)} onChange={(e) => setTheme({ bgTint: Number(e.target.value) / 100 })} />
          </label>
          <label className="te-range">
            <span>{t.mode === 'dark' ? 'Svärta' : 'Mjukhet'}</span>
            <input type="range" min={0} max={100} value={Math.round(t.softness * 100)} onChange={(e) => setTheme({ softness: Number(e.target.value) / 100 })} />
            <small>{t.mode === 'dark' ? 'Djupt svart ← → mjuk grafit' : 'Ljust vitt ← → mjukt papper'}</small>
          </label>

          <button className="te-reset" onClick={() => setTheme({ ...DEFAULT_THEME, mode: t.mode })}>
            Återställ
          </button>
        </section>
      )}
    </>
  )
}
