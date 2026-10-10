import { useEffect, useRef, useState } from 'react'
import { ACTIONS, comboFromEvent, DEFAULT_SHORTCUTS, prettyCombo, S620_ASPECT, updateSettings, useSettings, type ActionId } from './settings.ts'
import { openThemeEditor } from '../design/ThemeEditor.tsx'
import type { Background } from '../canvas/types.ts'
import { createBackup, readBackup, restoreBackup, type Backup, type BackupSummary } from '../storage/backup.ts'
import { maskKey, PROVIDERS, setApiKey, setProvider, testKey, useAi, type Provider } from '../ai/ai.ts'
import './settings.css'

type Tab = 'tablet' | 'keys' | 'paper' | 'ai' | 'data'

export function SettingsDialog({ onClose, initialTab = 'tablet' }: { onClose: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialog.current!
    d.showModal()
    const onCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    d.addEventListener('cancel', onCancel)
    return () => d.removeEventListener('cancel', onCancel)
  }, [onClose])

  return (
    <dialog ref={dialog} className="st" aria-label="Inställningar" onClick={(e) => e.target === dialog.current && onClose()}>
      <div className="st-inner">
        <header className="st-head">
          <h2>Inställningar</h2>
          <button className="st-close" onClick={onClose} aria-label="Stäng">
            ×
          </button>
        </header>
        <nav className="st-tabs" role="tablist">
          {(
            [
              ['tablet', 'Ritplatta'],
              ['keys', 'Kortkommandon'],
              ['paper', 'Papper, ljud och färger'],
              ['ai', 'AI'],
              ['data', 'Data'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="st-body">
          {tab === 'tablet' && <TabletTab />}
          {tab === 'keys' && <KeysTab />}
          {tab === 'paper' && <PaperTab onClose={onClose} />}
          {tab === 'ai' && <AiTab />}
          {tab === 'data' && <DataTab />}
        </div>
      </div>
    </dialog>
  )
}

/* ---------- Ritplatta ---------- */

interface PenReading {
  type: string
  pressure: number
  buttons: number
  min: number
  max: number
  count: number
}

function PressureTest() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [r, setR] = useState<PenReading | null>(null)
  const stats = useRef({ min: 1, max: 0, count: 0 })

  useEffect(() => {
    const c = canvas.current!
    const dpr = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = rect.width * dpr
    c.height = rect.height * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    let last: [number, number] | null = null
    const read = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      e.preventDefault()
      const down = (e.buttons & 1) !== 0
      if (down && e.pointerType === 'pen') {
        stats.current.min = Math.min(stats.current.min, e.pressure)
        stats.current.max = Math.max(stats.current.max, e.pressure)
        stats.current.count++
      }
      setR({ type: e.pointerType, pressure: e.pressure, buttons: e.buttons, ...stats.current })
      const x = e.offsetX
      const y = e.offsetY
      if (down) {
        const accent = getComputedStyle(c).getPropertyValue('--accent').trim()
        ctx.strokeStyle = accent
        ctx.lineCap = 'round'
        ctx.lineWidth = 1 + (e.pointerType === 'pen' ? e.pressure : 0.5) * 12
        ctx.beginPath()
        ctx.moveTo(...(last ?? [x, y]))
        ctx.lineTo(x, y)
        ctx.stroke()
        last = [x, y]
      } else last = null
    }
    c.addEventListener('pointerdown', read)
    c.addEventListener('pointermove', read)
    c.addEventListener('pointerup', () => (last = null))
    c.addEventListener('contextmenu', (e) => e.preventDefault())
  }, [])

  const verdict = !r
    ? 'Skriv i rutan med pennan.'
    : r.type === 'mouse'
      ? 'Webbläsaren ser pennan som en mus. Slå på Windows Ink i Gaomon-drivrutinen (se README) – annars fungerar inte trycket.'
      : r.type === 'pen' && r.count > 30 && r.max - r.min < 0.01
        ? 'Trycket är alltid detsamma. Drivrutinen skickar inget tryck – slå på Windows Ink.'
        : r.type === 'pen' && r.max - r.min >= 0.01
          ? 'Trycket fungerar! Tryck hårdare och lättare för att se skillnaden.'
          : 'Skriv lite mer …'

  return (
    <div className="st-test">
      <canvas ref={canvas} className="st-test-pad" style={{ touchAction: 'none' }} />
      <dl className="st-readout">
        <div>
          <dt>Typ</dt>
          <dd>{r ? { pen: 'Penna', mouse: 'Mus', touch: 'Finger' }[r.type] ?? r.type : '–'}</dd>
        </div>
        <div>
          <dt>Tryck</dt>
          <dd>{r ? r.pressure.toFixed(3) : '–'}</dd>
        </div>
        <div>
          <dt>Knappar</dt>
          <dd>{r ? (r.buttons & 2 ? 'Sidoknapp' : r.buttons & 1 ? 'Spets' : 'Svävar') : '–'}</dd>
        </div>
      </dl>
      <p className="st-verdict">{verdict}</p>
    </div>
  )
}

/** Var skrivzonen ligger på skärmen, för att skriva in i Gaomon-drivrutinen. */
function useScreenRect(zone: { x: number; y: number; width: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    // Fönstret kan flyttas utan att någon händelse skickas, så vi läser av regelbundet.
    const t = setInterval(() => tick((n) => n + 1), 700)
    return () => clearInterval(t)
  }, [])
  const height = zone.width / S620_ASPECT
  const borderX = Math.max(0, (window.outerWidth - window.innerWidth) / 2)
  const topChrome = Math.max(0, window.outerHeight - window.innerHeight - borderX)
  const dpr = window.devicePixelRatio || 1
  const left = window.screenX + borderX + zone.x
  const top = window.screenY + topChrome + zone.y
  const fullscreen = window.innerHeight === screen.height || !!document.fullscreenElement
  return {
    css: { x: Math.round(zone.x), y: Math.round(zone.y), w: Math.round(zone.width), h: Math.round(height) },
    physical: { x: Math.round(left * dpr), y: Math.round(top * dpr), w: Math.round(zone.width * dpr), h: Math.round(height * dpr) },
    exact: fullscreen || (borderX === 0 && topChrome === 0),
    dpr,
  }
}

function TabletTab() {
  const s = useSettings()
  const zone = s.zone
  const rect = useScreenRect(zone)
  const setZone = (patch: Partial<typeof zone>) => updateSettings({ zone: { ...zone, ...patch } })

  const placeDefault = (width?: number) => {
    const answerW = window.innerWidth > 1000 ? 360 : 280
    const maxW = window.innerWidth - answerW - 28
    const w = Math.min(width ?? maxW, maxW, (window.innerHeight - 200) * S620_ASPECT)
    const h = w / S620_ASPECT
    setZone({ enabled: true, width: Math.round(w), x: 14, y: Math.round(window.innerHeight - h - 14) })
  }

  return (
    <>
      <section className="st-section">
        <h3>Trycktest</h3>
        <p className="st-help">Skriv i rutan. Här ser du vad webbläsaren får från plattan.</p>
        <PressureTest />
      </section>

      <section className="st-section">
        <h3>Skrivzon</h3>
        <p className="st-help">
          Skrivytan får en fast plats och storlek med samma proportioner som plattans aktiva yta (165 × 101 mm). Mappa sedan plattan till just den rutan i Gaomon-drivrutinen. Då ger små pennrörelser exakt handstil i stället för att sträckas ut över hela skärmen.
        </p>
        <label className="st-switch">
          <input type="checkbox" checked={zone.enabled} onChange={(e) => (e.target.checked ? placeDefault(zone.width) : setZone({ enabled: false }))} />
          <span>Använd skrivzon</span>
        </label>
        {zone.enabled && (
          <>
            <div className="st-zone-presets">
              <button onClick={() => placeDefault(700)}>Liten</button>
              <button onClick={() => placeDefault(950)}>Mellan</button>
              <button onClick={() => placeDefault()}>Så stor som möjligt</button>
            </div>
            <div className="st-grid">
              <label>
                Vänster (px)
                <input type="number" value={Math.round(zone.x)} onChange={(e) => setZone({ x: Number(e.target.value) })} />
              </label>
              <label>
                Överkant (px)
                <input type="number" value={Math.round(zone.y)} onChange={(e) => setZone({ y: Number(e.target.value) })} />
              </label>
              <label>
                Bredd (px)
                <input type="number" value={Math.round(zone.width)} onChange={(e) => setZone({ width: Number(e.target.value) })} />
              </label>
              <label>
                Höjd (px)
                <input type="number" value={rect.css.h} readOnly />
              </label>
            </div>
            <div className="st-coords">
              <h4>Skriv in de här värdena i Gaomon-drivrutinen</h4>
              <p className="st-help">Under ”Arbetsyta” / ”Work Area”, välj ”Anpassad” och fyll i:</p>
              <dl>
                <div>
                  <dt>X</dt>
                  <dd>{rect.physical.x}</dd>
                </div>
                <div>
                  <dt>Y</dt>
                  <dd>{rect.physical.y}</dd>
                </div>
                <div>
                  <dt>Bredd</dt>
                  <dd>{rect.physical.w}</dd>
                </div>
                <div>
                  <dt>Höjd</dt>
                  <dd>{rect.physical.h}</dd>
                </div>
              </dl>
              <p className={`st-note ${rect.exact ? 'ok' : ''}`}>
                {rect.exact
                  ? 'Fönstret är i helskärm, så värdena är exakta.'
                  : 'Värdena är ungefärliga eftersom flikar och adressfält tar plats. Tryck F11 (helskärm) eller kör appen installerad, så blir de exakta.'}{' '}
                Värdena är i fysiska skärmpixlar (skalning {Math.round(rect.dpr * 100)} %) och förutsätter att webbläsarens zoom är 100 %.
              </p>
            </div>
          </>
        )}
      </section>

      <section className="st-section">
        <h3>Låg fördröjning</h3>
        <label className="st-switch">
          <input type="checkbox" checked={s.lowLatency} onChange={(e) => updateSettings({ lowLatency: e.target.checked })} />
          <span>Rita direkt till skärmen</span>
        </label>
        <p className="st-help">Gör att strecket hänger med pennan bättre. Stäng av om skrivytan blir svart eller flimrar på din dator. Gäller när du öppnar nästa uppgift.</p>
      </section>

      <section className="st-section">
        <h3>Pennans sidoknapp</h3>
        <p className="st-help">
          Ställ in sidoknappen som <b>högerklick</b> i Gaomon-drivrutinen. Håll in den medan du drar, så suddar du. Släpp den, så är du tillbaka till pennan. Du kan också lägga ett kortkommando på knappen, t.ex. E för sudd.
        </p>
      </section>
    </>
  )
}

/* ---------- Kortkommandon ---------- */

function KeysTab() {
  const s = useSettings()
  const [listening, setListening] = useState<ActionId | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)

  useEffect(() => {
    if (!listening) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setListening(null)
        return
      }
      const combo = comboFromEvent(e)
      if (!combo) return
      const other = (Object.keys(s.shortcuts) as ActionId[]).find((id) => id !== listening && s.shortcuts[id] === combo)
      const next = { ...s.shortcuts, [listening]: combo }
      if (other) {
        next[other] = s.shortcuts[listening]
        setConflict(`${prettyCombo(combo)} användes för ”${ACTIONS.find((a) => a.id === other)!.label}”. De två har bytt plats.`)
      } else setConflict(null)
      updateSettings({ shortcuts: next })
      setListening(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [listening, s.shortcuts])

  return (
    <section className="st-section">
      <p className="st-help">
        Klicka på en tangent och tryck den nya. Ritplattans fyra snabbknappar kan ställas in i Gaomon-drivrutinen att skicka vilken av de här tangenterna som helst. Mellanslag + dra flyttar alltid skrivytan, och Ctrl + scrollhjul zoomar.
      </p>
      {conflict && <p className="st-note">{conflict}</p>}
      <table className="st-keys">
        <tbody>
          {ACTIONS.map((a) => (
            <tr key={a.id}>
              <td>{a.label}</td>
              <td>
                <button className={`st-key ${listening === a.id ? 'listening' : ''}`} onClick={() => setListening(a.id)}>
                  {listening === a.id ? 'Tryck en tangent …' : prettyCombo(s.shortcuts[a.id])}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="st-secondary" onClick={() => updateSettings({ shortcuts: DEFAULT_SHORTCUTS })}>
        Återställ standard
      </button>
    </section>
  )
}

/* ---------- Papper, ljud och färger ---------- */

function PaperTab({ onClose }: { onClose: () => void }) {
  const s = useSettings()
  const bgs: { id: Background; label: string }[] = [
    { id: 'grid', label: 'Rutat' },
    { id: 'lined', label: 'Linjerat' },
    { id: 'blank', label: 'Blankt' },
  ]
  return (
    <>
      <section className="st-section">
        <h3>Papper</h3>
        <div className="st-seg">
          {(['light', 'dark'] as const).map((p) => (
            <button key={p} className={s.paper === p ? 'on' : ''} onClick={() => updateSettings({ paper: p })}>
              {p === 'light' ? 'Ljust' : 'Mörkt'}
            </button>
          ))}
        </div>
        <h4>Bakgrund på nya uppgifter</h4>
        <div className="st-seg">
          {bgs.map((b) => (
            <button key={b.id} className={s.background === b.id ? 'on' : ''} onClick={() => updateSettings({ background: b.id })}>
              {b.label}
            </button>
          ))}
        </div>
      </section>
      <section className="st-section">
        <h3>Ljud</h3>
        <label className="st-switch">
          <input type="checkbox" checked={s.sound} onChange={(e) => updateSettings({ sound: e.target.checked })} />
          <span>Spela ett ljud vid rätt och fel svar</span>
        </label>
      </section>
      <section className="st-section">
        <h3>Färger</h3>
        <p className="st-help">Läge, accentfärg och bakgrund ställer du in i färgredigeraren.</p>
        <button
          className="st-secondary"
          onClick={() => {
            onClose()
            openThemeEditor()
          }}
        >
          Öppna färgerna
        </button>
      </section>
    </>
  )
}

/* ---------- Data: backup och återställning ---------- */

function AiTab() {
  const { provider, keys } = useAi()
  const key = keys[provider]
  const info = PROVIDERS[provider]
  const [draft, setDraft] = useState('')
  const [state, setState] = useState<{ kind: 'idle' | 'testing' | 'ok' | 'error'; text?: string }>({ kind: 'idle' })

  const save = async () => {
    const k = draft.trim()
    if (!k) return
    setState({ kind: 'testing' })
    try {
      await testKey(provider, k)
      setApiKey(provider, k)
      setDraft('')
      setState({ kind: 'ok', text: 'Nyckeln fungerar och är sparad.' })
    } catch (e) {
      setState({ kind: 'error', text: (e as Error).message })
    }
  }

  return (
    <>
      <section className="st-section">
        <h3>Fråga en AI</h3>
        <p className="st-help">
          Med en egen API-nyckel kan du trycka <b>Fråga</b> under en svarsruta och få förklarat varför svaret blir som det blir. AI:n ser uppgiften, facit och dina svar. Innan du har sett facit får du ledtrådar i stället för svaret.
        </p>
        <div className="st-seg" role="radiogroup" aria-label="Vilken AI">
          {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={provider === p}
              className={provider === p ? 'on' : ''}
              onClick={() => {
                setProvider(p)
                setDraft('')
                setState({ kind: 'idle' })
              }}
            >
              {PROVIDERS[p].name}
              {keys[p] ? ' ✓' : ''}
            </button>
          ))}
        </div>
        <p className="st-help">
          {provider === 'claude'
            ? 'Claude Opus 5.5 från Anthropic. Förklarar mycket bra, men kostar mer: oftast några ören till någon krona per fråga.'
            : 'DeepSeek V4 Pro. Mycket billigare, oftast under ett öre per fråga. Obs: DeepSeek är ett kinesiskt företag och frågorna behandlas på servrar i Kina.'}
        </p>
      </section>
      <section className="st-section">
        <h3>{info.name}-nyckel</h3>
        <p className="st-help">
          Skapa en nyckel på{' '}
          <a href={info.keyUrl} target="_blank" rel="noreferrer">
            {new URL(info.keyUrl).host}
          </a>
          .
        </p>
        {key ? (
          <div className="st-key-row">
            <code>{maskKey(key)}</code>
            <button
              className="st-secondary"
              onClick={() => {
                setApiKey(provider, '')
                setState({ kind: 'idle' })
              }}
            >
              Ta bort nyckeln
            </button>
          </div>
        ) : (
          <form
            className="st-key-row"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <input type="password" autoComplete="off" spellCheck={false} placeholder={info.placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label={`${info.name}-nyckel`} />
            <button className="st-secondary" disabled={!draft.trim() || state.kind === 'testing'}>
              {state.kind === 'testing' ? 'Testar …' : 'Testa och spara'}
            </button>
          </form>
        )}
        {state.text && <p className={`st-note ${state.kind === 'ok' ? 'ok' : ''}`}>{state.text}</p>}
        <p className="st-help">
          Nyckeln sparas bara i den här webbläsaren och skickas bara till {provider === 'claude' ? 'Anthropic' : 'DeepSeek'}. Den följer inte med i backupen. Dela inte appen med andra medan nyckeln ligger kvar.
        </p>
      </section>
    </>
  )
}

function SyncSection() {
  const [mod, setMod] = useState<typeof import('../sync/sync.ts') | null>(null)
  useEffect(() => {
    import('../sync/sync.ts').then(setMod)
  }, [])
  return mod ? <SyncStatusView mod={mod} /> : null
}

function SyncStatusView({ mod }: { mod: typeof import('../sync/sync.ts') }) {
  const st = mod.useSyncStatus()
  const text =
    st.kind === 'ok'
      ? `Synkad ${new Date(st.at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}.`
      : st.kind === 'syncing'
        ? 'Synkar …'
        : st.kind === 'offline'
          ? 'Ingen internetanslutning. Allt sparas här och synkas när nätet är tillbaka.'
          : st.kind === 'error'
            ? st.message
            : 'Synken är inte igång. Logga ut och in igen för att starta den.'
  return (
    <section className="st-section">
      <h3>Synk mellan enheter</h3>
      <p className="st-help">Dina försök, det du skrivit på skrivytan, sparade uppgifter och genomgångar synkas automatiskt till alla enheter där du är inloggad. Inställningar och färger stannar på varje enhet.</p>
      <p className={`st-note ${st.kind === 'ok' ? 'ok' : ''}`}>{text}</p>
      <button className="st-secondary" disabled={st.kind === 'syncing' || st.kind === 'off'} onClick={() => mod.syncNow()}>
        Synka nu
      </button>
    </section>
  )
}

function DataTab() {
  const [pending, setPending] = useState<{ backup: Backup; summary: BackupSummary } | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const exportAll = async () => {
    const date = new Date().toISOString().slice(0, 10)
    const { download } = await import('../canvas/export.ts')
    download(await createBackup(), `matte-backup-${date}.json`)
    setMessage({ kind: 'ok', text: 'Backupen är sparad i dina nedladdningar.' })
  }

  return (
    <>
      <section className="st-section">
        <h3>Spara en backup</h3>
        <p className="st-help">
          Allt du gör – svar, försök, det du skrivit på skrivytan, inställningar och färger – sparas bara i den här webbläsaren. Spara en backupfil då och då, och flytta den om du byter dator eller webbläsare.
        </p>
        <button className="st-secondary" onClick={exportAll}>
          Spara backup (.json)
        </button>
      </section>
      <section className="st-section">
        <h3>Återställ från backup</h3>
        <p className="st-help">Det som finns nu ersätts med innehållet i backupen.</p>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              setPending(await readBackup(f))
              setMessage(null)
            } catch (err) {
              setMessage({ kind: 'error', text: (err as Error).message })
            }
          }}
        />
        <button className="st-secondary" onClick={() => file.current?.click()}>
          Välj backupfil …
        </button>
        {pending && (
          <div className="st-coords">
            <h4>Ersätta allt med den här backupen?</h4>
            <p className="st-help">
              Sparad {new Date(pending.summary.exportedAt).toLocaleString('sv-SE')} · {pending.summary.attempts} försök · {pending.summary.drawings} uppgifter med anteckningar.
            </p>
            <div className="st-zone-presets">
              <button
                onClick={async () => {
                  await restoreBackup(pending.backup)
                  setPending(null)
                  setMessage({ kind: 'ok', text: 'Klart! Sidan laddas om.' })
                  setTimeout(() => location.reload(), 900)
                }}
              >
                Ersätt och återställ
              </button>
              <button onClick={() => setPending(null)}>Avbryt</button>
            </div>
          </div>
        )}
        {message && <p className={`st-note ${message.kind === 'ok' ? 'ok' : ''}`}>{message.text}</p>}
      </section>
      {!import.meta.env.DEV && <SyncSection />}
      {!import.meta.env.DEV && (
        <section className="st-section">
          <h3>Logga ut</h3>
          <p className="st-help">Boken låses i den här webbläsaren. Dina svar och anteckningar finns kvar tills du loggar in igen.</p>
          <button
            className="st-secondary"
            onClick={async () => {
              const { logout } = await import('../vault/vault.ts')
              await logout()
              location.reload()
            }}
          >
            Logga ut
          </button>
        </section>
      )}
    </>
  )
}
