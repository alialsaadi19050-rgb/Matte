import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { InkCanvas, type InkStatus, type ToolState } from './InkCanvas.ts'
import { HIGHLIGHT, INK, type Background, type HighlightColor, type InkColor, type Paper, type Stroke } from './types.ts'
import { loadDrawing, saveDrawing } from '../storage/db.ts'
import { getSettings, updateSettings, useSettings } from '../settings/settings.ts'
import { ChevronLeft, Download, Eraser, FitAll, Grid, Hand, Highlighter, Lasso, Pen, Redo, Undo } from '../design/icons.tsx'
import './canvas.css'

export interface InkSurfaceHandle {
  setTool: (patch: Partial<ToolState>) => void
  undo: () => void
  redo: () => void
  resetZoom: () => void
  toggleEraserMode: () => void
  /** Tömmer skrivytan (går att ångra). */
  clear: () => void
  /** Zoomar så att allt du skrivit syns. */
  fitContent: () => void
}

interface Props {
  exerciseId: string
  title: string
  paper: Paper
  className?: string
  style?: React.CSSProperties
}

const INK_ORDER: InkColor[] = ['ink', 'blue', 'red', 'green']
const HL_ORDER: HighlightColor[] = ['yellow', 'green', 'pink']
const BACKGROUNDS: { id: Background; label: string }[] = [
  { id: 'grid', label: 'Rutat' },
  { id: 'lined', label: 'Linjerat' },
  { id: 'blank', label: 'Blankt' },
]

export const InkSurface = forwardRef<InkSurfaceHandle, Props>(function InkSurface({ exerciseId, title, paper, className, style }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const engine = useRef<InkCanvas | null>(null)
  const settings = useSettings()
  const [tools, setTools] = useState<ToolState>(settings.tools)
  const [status, setStatus] = useState<InkStatus>({ canUndo: false, canRedo: false, selected: 0, activeTool: 'pen', zoom: 1 })
  const [background, setBackground] = useState<Background>(settings.background)
  const [toolbarOpen, setToolbarOpen] = useState(true)
  const [menu, setMenu] = useState<'bg' | 'export' | null>(null)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [pressureHint, setPressureHint] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const saveTimer = useRef<number>(0)
  const pending = useRef<{ strokes: Stroke[]; background: Background } | null>(null)
  const loadedFor = useRef<string | null>(null)
  /** ”Gör om” bad om en tom skrivyta innan strecken hunnit laddas. */
  const clearAfterLoad = useRef(false)

  const flush = () => {
    const p = pending.current
    if (!p || !loadedFor.current) return
    pending.current = null
    saveDrawing({ exerciseId: loadedFor.current, strokes: p.strokes, background: p.background, updatedAt: Date.now() }).then(() => setSaved('saved'))
  }

  // Skapa motorn en gång.
  useEffect(() => {
    const ink = new InkCanvas(host.current!, {
      onChange: (strokes) => {
        pending.current = { strokes, background: ink.background }
        setSaved('saving')
        clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(flush, 400)
      },
      onStatus: setStatus,
      onPressureMissing: () => {
        if (!getSettings().pressureHintDismissed) setPressureHint(true)
      },
    }, getSettings().lowLatency)
    ink.setTools(getSettings().tools)
    engine.current = ink
    const onHide = () => flush()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      flush()
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
      ink.destroy()
      engine.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ladda strecken för uppgiften (och spara den förra först).
  useEffect(() => {
    flush()
    let alive = true
    loadedFor.current = null
    loadDrawing(exerciseId).then((d) => {
      if (!alive || !engine.current) return
      const bg = d?.background ?? getSettings().background
      engine.current.load(d?.strokes ?? [], bg)
      if (clearAfterLoad.current) {
        clearAfterLoad.current = false
        engine.current.clear()
      }
      setBackground(bg)
      loadedFor.current = exerciseId
      setSaved(d ? 'saved' : 'idle')
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId])

  useEffect(() => engine.current?.setPaper(paper), [paper])

  const applyTools = (patch: Partial<ToolState>) => {
    const next = { ...tools, ...patch }
    setTools(next)
    engine.current?.setTools(patch)
    updateSettings({ tools: next })
  }

  useImperativeHandle(ref, () => ({
    setTool: applyTools,
    undo: () => engine.current?.undo(),
    redo: () => engine.current?.redo(),
    resetZoom: () => engine.current?.resetView(),
    fitContent: () => engine.current?.fitContent(),
    clear: () => {
      if (loadedFor.current === exerciseId) engine.current?.clear()
      else clearAfterLoad.current = true
    },
    toggleEraserMode: () => applyTools({ tool: 'eraser', eraserMode: tools.eraserMode === 'stroke' ? 'partial' : 'stroke' }),
  }))

  const changeBackground = (bg: Background) => {
    setBackground(bg)
    engine.current?.setBackground(bg)
    setMenu(null)
  }

  const doExport = async (kind: 'png' | 'pdf') => {
    setMenu(null)
    const ink = engine.current
    if (!ink) return
    const { download, exportPdf, exportPng } = await import('./export.ts')
    const opts = { strokes: ink.strokes, background, paper, title }
    const name = title.replace(/[^\wåäöÅÄÖ-]+/g, '-').toLowerCase()
    if (kind === 'png') download(await exportPng(opts), `${name}.png`)
    else download(await exportPdf(opts), `${name}.pdf`)
  }

  const colors = INK[paper]
  const active = status.activeTool

  return (
    <section className={`ink-surface paper-${paper} ${className ?? ''}`} style={style}>
      <div className="ink-host" ref={host} />

      <div className={`ex-tools ${toolbarOpen ? '' : 'closed'}`} onPointerDown={(e) => e.stopPropagation()}>
        {toolbarOpen ? (
          <>
            {(
              [
                ['pen', Pen, 'Penna', settings.shortcuts.pen],
                ['highlighter', Highlighter, 'Överstrykning', settings.shortcuts.highlighter],
                ['eraser', Eraser, 'Sudd – eller håll in pennans sidoknapp', settings.shortcuts.eraser],
                ['lasso', Lasso, 'Markera och flytta', settings.shortcuts.lasso],
                ['hand', Hand, 'Flytta runt på skrivytan – eller håll in mellanslag', settings.shortcuts.hand],
              ] as const
            ).map(([id, Icon, label, key]) => (
              <button key={id} className={active === id ? 'on' : ''} onClick={() => applyTools({ tool: id })} aria-label={label} title={`${label} (${key})`} aria-pressed={active === id}>
                <Icon size={19} />
              </button>
            ))}
            <span className="ex-tools-sep" />

            {tools.tool === 'highlighter'
              ? HL_ORDER.map((c) => (
                  <button key={c} className={`swatch ${tools.highlight === c ? 'on' : ''}`} onClick={() => applyTools({ highlight: c })} aria-label={`Överstrykning ${c}`}>
                    <i style={{ background: HIGHLIGHT[c] }} />
                  </button>
                ))
              : tools.tool === 'eraser'
                ? (['stroke', 'partial'] as const).map((m) => (
                    <button key={m} className={`text ${tools.eraserMode === m ? 'on' : ''}`} onClick={() => applyTools({ eraserMode: m })} title={m === 'stroke' ? 'Suddar hela streck' : 'Suddar bara där du drar'}>
                      {m === 'stroke' ? 'Hela' : 'Del'}
                    </button>
                  ))
                : INK_ORDER.map((c, i) => (
                    <button key={c} className={`swatch ${tools.color === c ? 'on' : ''}`} onClick={() => applyTools({ color: c, tool: tools.tool === 'lasso' ? 'pen' : tools.tool })} aria-label={`Färg ${i + 1}`} title={`Färg ${i + 1} (${i + 1})`}>
                      <i style={{ background: colors[c] }} />
                    </button>
                  ))}
            <span className="ex-tools-sep" />
            {[0, 1, 2].map((w) => {
              const key = tools.tool === 'highlighter' ? 'highlighterSize' : tools.tool === 'eraser' ? 'eraserSize' : 'penSize'
              return (
                <button key={w} className={`width ${tools[key] === w ? 'on' : ''}`} onClick={() => applyTools({ [key]: w })} aria-label={`Storlek ${w + 1}`} title={`Storlek ${w + 1}`}>
                  <i style={{ width: 4 + w * 4, height: 4 + w * 4 }} />
                </button>
              )
            })}
            <span className="ex-tools-sep" />
            <button onClick={() => engine.current?.undo()} disabled={!status.canUndo} aria-label="Ångra" title={`Ångra (${settings.shortcuts.undo})`}>
              <Undo size={19} />
            </button>
            <button onClick={() => engine.current?.redo()} disabled={!status.canRedo} aria-label="Gör om" title={`Gör om (${settings.shortcuts.redo})`}>
              <Redo size={19} />
            </button>
            <button className={menu === 'bg' ? 'open' : ''} onClick={() => setMenu(menu === 'bg' ? null : 'bg')} aria-label="Bakgrund och sida" title="Bakgrund och sida" aria-expanded={menu === 'bg'}>
              <Grid size={19} />
            </button>
            <button className={menu === 'export' ? 'open' : ''} onClick={() => setMenu(menu === 'export' ? null : 'export')} aria-label="Exportera" title="Spara som PNG eller PDF" aria-expanded={menu === 'export'}>
              <Download size={19} />
            </button>
            <button className="ex-tools-min" onClick={() => setToolbarOpen(false)} aria-label="Fäll ihop verktygen" title="Fäll ihop">
              <ChevronLeft size={18} />
            </button>
          </>
        ) : (
          <button className="on" onClick={() => setToolbarOpen(true)} aria-label="Visa verktygen" title="Visa verktygen">
            <Pen size={19} />
          </button>
        )}
      </div>

      {menu && (
        <div className="ex-pop" role="menu" onPointerDown={(e) => e.stopPropagation()}>
          {menu === 'bg' ? (
            <>
              {BACKGROUNDS.map((b) => (
                <button key={b.id} role="menuitemradio" aria-checked={background === b.id} className={background === b.id ? 'on' : ''} onClick={() => changeBackground(b.id)}>
                  {b.label}
                </button>
              ))}
              <hr />
              <button
                role="menuitem"
                className="danger"
                onClick={() => {
                  setMenu(null)
                  setConfirmClear(true)
                }}
              >
                Rensa sidan …
              </button>
            </>
          ) : (
            <>
              <button role="menuitem" onClick={() => doExport('pdf')}>
                Spara som PDF
              </button>
              <button role="menuitem" onClick={() => doExport('png')}>
                Spara som PNG
              </button>
            </>
          )}
        </div>
      )}

      <div className="ex-page-meta" aria-live="polite">
        {status.selected > 0 && <span className="ink-chip">{status.selected} markerade · Delete tar bort</span>}
        <button className="ink-fit" onClick={() => engine.current?.fitContent()} title="Visa allt du skrivit">
          <FitAll size={14} /> Visa allt
        </button>
        {Math.abs(status.zoom - 1) > 0.01 && (
          <button onClick={() => engine.current?.resetView()} title="Återställ zoom">
            {Math.round(status.zoom * 100)} %
          </button>
        )}
        <span>{saved === 'saving' ? 'Sparar …' : saved === 'saved' ? 'Sparat' : ''}</span>
      </div>

      {pressureHint && (
        <div className="ink-hint" role="status">
          <strong>Pennan skickar inget tryck till webbläsaren.</strong>
          <span>
            Strecken blir lika tjocka hela tiden. Öppna Gaomon-drivrutinen och slå på <b>Windows Ink</b> under Penninställningar, och starta sedan om webbläsaren. Se README för mer.
          </span>
          <div>
            <button onClick={() => setPressureHint(false)}>Okej</button>
            <button
              onClick={() => {
                setPressureHint(false)
                updateSettings({ pressureHintDismissed: true })
              }}
            >
              Visa inte igen
            </button>
          </div>
        </div>
      )}

      {confirmClear && (
        <div className="ink-hint" role="alertdialog" aria-label="Rensa sidan">
          <strong>Rensa hela skrivytan?</strong>
          <span>Du kan ångra med {settings.shortcuts.undo} efteråt.</span>
          <div>
            <button
              className="danger"
              onClick={() => {
                engine.current?.clear()
                setConfirmClear(false)
              }}
            >
              Rensa
            </button>
            <button onClick={() => setConfirmClear(false)}>Avbryt</button>
          </div>
        </div>
      )}
    </section>
  )
})
