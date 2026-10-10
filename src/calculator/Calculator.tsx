import { useEffect, useRef, useState } from 'react'
import { calculate, type Angle } from './calculate.ts'
import { updateSettings, useSettings } from '../settings/settings.ts'
import './calculator.css'

interface Entry {
  input: string
  text: string
  fraction?: string
  value: number
}

type Key = { label: string; insert?: string; action?: 'eval' | 'clear' | 'back' | 'angle' | 'neg'; kind?: 'fn' | 'op' | 'num' | 'eq' | 'util'; title?: string }

const KEYS: Key[][] = [
  [
    { label: 'DEG', action: 'angle', kind: 'util', title: 'Grader eller radianer' },
    { label: '(', insert: '(', kind: 'fn' },
    { label: ')', insert: ')', kind: 'fn' },
    { label: '⌫', action: 'back', kind: 'util', title: 'Radera (Backsteg)' },
    { label: 'C', action: 'clear', kind: 'util', title: 'Rensa (Delete)' },
  ],
  [
    { label: 'sin', insert: 'sin(', kind: 'fn' },
    { label: 'cos', insert: 'cos(', kind: 'fn' },
    { label: 'tan', insert: 'tan(', kind: 'fn' },
    { label: 'xʸ', insert: '^', kind: 'fn', title: 'Upphöjt till (^)' },
    { label: '√', insert: '√(', kind: 'fn', title: 'Kvadratrot' },
  ],
  [
    { label: 'ln', insert: 'ln(', kind: 'fn' },
    { label: 'lg', insert: 'lg(', kind: 'fn', title: 'Tiologaritm' },
    { label: 'n!', insert: '!', kind: 'fn', title: 'Fakultet' },
    { label: 'nCr', insert: ' nCr ', kind: 'fn', title: 'Kombinationer, t.ex. 10 nCr 3' },
    { label: 'nPr', insert: ' nPr ', kind: 'fn', title: 'Permutationer, t.ex. 9 nPr 3' },
  ],
  [
    { label: '7', insert: '7', kind: 'num' },
    { label: '8', insert: '8', kind: 'num' },
    { label: '9', insert: '9', kind: 'num' },
    { label: '÷', insert: '÷', kind: 'op' },
    { label: 'x²', insert: '²', kind: 'fn' },
  ],
  [
    { label: '4', insert: '4', kind: 'num' },
    { label: '5', insert: '5', kind: 'num' },
    { label: '6', insert: '6', kind: 'num' },
    { label: '×', insert: '×', kind: 'op' },
    { label: 'π', insert: 'π', kind: 'fn' },
  ],
  [
    { label: '1', insert: '1', kind: 'num' },
    { label: '2', insert: '2', kind: 'num' },
    { label: '3', insert: '3', kind: 'num' },
    { label: '−', insert: '−', kind: 'op' },
    { label: '(−)', action: 'neg', kind: 'fn', title: 'Byt tecken' },
  ],
  [
    { label: '0', insert: '0', kind: 'num' },
    { label: ',', insert: ',', kind: 'num', title: 'Decimalkomma' },
    { label: 'Ans', insert: 'Ans', kind: 'fn', title: 'Förra svaret' },
    { label: '+', insert: '+', kind: 'op' },
    { label: '=', action: 'eval', kind: 'eq', title: 'Räkna ut (Enter)' },
  ],
]

const SIMPLE_WIDTH = 300
const TI_WIDTH = 340

export function Calculator({ open, onClose, noCalculator }: { open: boolean; onClose: () => void; noCalculator?: boolean }) {
  const settings = useSettings()
  const [expr, setExpr] = useState('')
  const [angle, setAngle] = useState<Angle>('deg')
  const [history, setHistory] = useState<Entry[]>([])
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const tiFrame = useRef<HTMLIFrameElement>(null)
  const mode = settings.calculatorMode ?? 'simple'
  // TI-84 kan förstoras med − och +; storleken sparas.
  const tiScale = settings.tiScale ?? 1.35
  const tiHeight = Math.max(380, Math.min(Math.round(780 * tiScale), window.innerHeight - 16))
  // Bredden följer höjden så att räknaren behåller sina proportioner.
  const WIDTH = mode === 'ti84' ? Math.min(window.innerWidth - 16, Math.round(TI_WIDTH * (tiHeight / 780))) : SIMPLE_WIDTH
  const panelHeight = mode === 'ti84' ? tiHeight : 560
  const ans = history[0]?.value ?? null
  const preview = expr.trim() ? calculate(expr, { angle, ans }) : null

  const pos = settings.calculator ?? { x: window.innerWidth - 380 - WIDTH - 24, y: 80 }

  useEffect(() => {
    if (open) setTimeout(() => (settings.calculatorMode === 'ti84' ? tiFrame.current?.focus() : input.current?.focus()), 30)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const [, rerender] = useState(0)
  useEffect(() => {
    const onResize = () => rerender((n) => n + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (!open) return null

  const insert = (text: string) => {
    const el = input.current
    if (!el) return setExpr((e) => e + text)
    const start = el.selectionStart ?? expr.length
    const end = el.selectionEnd ?? expr.length
    // Börjar man med en operator direkt efter ett svar räknar man vidare på svaret.
    const prefix = !expr && history.length && /^[+−×÷^²!]/.test(text) ? 'Ans' : ''
    const next = expr.slice(0, start) + prefix + text + expr.slice(end)
    setExpr(next)
    setError('')
    const caret = start + prefix.length + text.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  const evaluate = () => {
    if (!expr.trim()) return
    const r = calculate(expr, { angle, ans })
    if ('error' in r) {
      setError(r.error || 'Uttrycket går inte att räkna ut.')
      return
    }
    setHistory((h) => [{ input: expr, text: r.text, fraction: r.fraction, value: r.value }, ...h].slice(0, 12))
    setExpr('')
    setError('')
  }

  const press = (k: Key) => {
    if (k.insert) return insert(k.insert)
    if (k.action === 'eval') return evaluate()
    if (k.action === 'clear') {
      setExpr('')
      setError('')
      return
    }
    if (k.action === 'back') {
      const el = input.current
      const start = el?.selectionStart ?? expr.length
      const end = el?.selectionEnd ?? expr.length
      const from = start === end ? Math.max(0, start - 1) : start
      setExpr(expr.slice(0, from) + expr.slice(end))
      requestAnimationFrame(() => el?.setSelectionRange(from, from))
      return
    }
    if (k.action === 'angle') return setAngle((a) => (a === 'deg' ? 'rad' : 'deg'))
    if (k.action === 'neg') return setExpr((e) => (e.startsWith('−(') && e.endsWith(')') ? e.slice(2, -1) : e ? `−(${e})` : '−'))
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text.replace(/ /g, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* kopiering stöds inte */
    }
  }

  // Håll panelen på skärmen, även om fönstret är litet eller ändrar storlek.
  const clampX = (x: number) => Math.max(8, Math.min(window.innerWidth - WIDTH - 8, x))
  const clampY = (y: number) => Math.max(8, Math.min(window.innerHeight - panelHeight - 8, y))

  return (
    <div
      ref={panel}
      className="calc"
      role="dialog"
      aria-label="Miniräknare"
      style={{ left: clampX(pos.x), top: clampY(pos.y), width: WIDTH }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <header
        className="calc-head"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          const r = panel.current!.getBoundingClientRect()
          drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const el = panel.current!
          el.style.left = `${clampX(e.clientX - drag.current.dx)}px`
          el.style.top = `${clampY(e.clientY - drag.current.dy)}px`
        }}
        onPointerUp={(e) => {
          if (!drag.current) return
          drag.current = null
          void e
          const r = panel.current!.getBoundingClientRect()
          updateSettings({ calculator: { x: r.left, y: r.top } })
        }}
      >
        <div className="calc-modes" role="tablist" aria-label="Typ av räknare">
          <button role="tab" aria-selected={mode === 'simple'} className={mode === 'simple' ? 'on' : ''} onClick={() => updateSettings({ calculatorMode: 'simple' })}>
            Enkel
          </button>
          <button role="tab" aria-selected={mode === 'ti84'} className={mode === 'ti84' ? 'on' : ''} onClick={() => updateSettings({ calculatorMode: 'ti84' })}>
            TI-84
          </button>
        </div>
        {mode === 'ti84' && (
          <span className="calc-zoom">
            <button onClick={() => updateSettings({ tiScale: Math.max(0.8, Math.round((tiScale - 0.15) * 100) / 100) })} aria-label="Mindre" title="Mindre">
              −
            </button>
            <button onClick={() => updateSettings({ tiScale: Math.min(2.5, Math.round((tiScale + 0.15) * 100) / 100) })} aria-label="Större" title="Större">
              +
            </button>
          </span>
        )}
        {mode === 'simple' && (
          <span className="calc-angle" title="Vinkelenhet">
            {angle === 'deg' ? 'Grader' : 'Radianer'}
          </span>
        )}
        <button className="calc-close" onClick={onClose} aria-label="Stäng miniräknaren" title="Stäng (Esc)">
          ×
        </button>
      </header>

      {noCalculator && <p className="calc-warn">Den här uppgiften ska lösas utan räknare.</p>}

      {mode === 'ti84' ? (
        <div className="calc-ti" style={{ height: tiHeight - 56 }}>
          <iframe ref={tiFrame} src={`${import.meta.env.BASE_URL}ti84/matte.html`} title="TI-84 Plus CE" allow="clipboard-write" />
          <button className="calc-forget" onClick={() => tiFrame.current?.contentWindow?.postMessage('matte:forget-rom', location.origin)} title="Välj en annan ROM-fil">
            Byt ROM
          </button>
        </div>
      ) : (
      <>
      <div className="calc-history" aria-live="polite">
        {history.length === 0 && <p className="calc-empty">Skriv med tangentbordet eller knapparna. Enter räknar ut.</p>}
        {[...history].reverse().map((h, i) => (
          <button key={i} className="calc-entry" onClick={() => insert(h.text.replace(/ /g, ''))} title="Klicka för att använda svaret">
            <span className="calc-in">{h.input}</span>
            <span className="calc-out">
              = {h.text}
              {h.fraction && <small> = {h.fraction}</small>}
            </span>
          </button>
        ))}
      </div>

      <div className={`calc-display ${error ? 'error' : ''}`}>
        <input
          ref={input}
          value={expr}
          onChange={(e) => {
            setExpr(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              evaluate()
            } else if (e.key === 'Delete' && !expr) setHistory([])
          }}
          spellCheck={false}
          autoComplete="off"
          aria-label="Uträkning"
          placeholder={history.length ? 'Ans …' : '0'}
        />
        <div className="calc-preview">
          {error ? (
            error
          ) : preview && !('error' in preview) ? (
            <>
              = {preview.text}
              {preview.fraction && <small> = {preview.fraction}</small>}
            </>
          ) : history[0] ? (
            <button className="calc-copy" onClick={() => copy(history[0].text)} title="Kopiera senaste svaret">
              {copied ? 'Kopierat!' : `Ans = ${history[0].text}`}
            </button>
          ) : (
            ' '
          )}
        </div>
      </div>

      <div className="calc-keys">
        {KEYS.flat().map((k) => (
          <button
            key={k.label}
            className={`calc-key ${k.kind ?? ''} ${k.action === 'angle' && angle === 'rad' ? 'rad' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => press(k)}
            title={k.title}
            aria-label={k.title ?? k.label}
          >
            {k.action === 'angle' ? (angle === 'deg' ? 'DEG' : 'RAD') : k.label}
          </button>
        ))}
      </div>
      </>
      )}
    </div>
  )
}
