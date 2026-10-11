// Svara med ett Venndiagram: välj antal cirklar, namnge dem och klicka på områdena som ska
// skuggas. Resultatet blir ett mängduttryck som rättas som vanligt.
import { useEffect, useMemo, useRef, useState } from 'react'
import { allRegions, regionAt, regionsToExpr, vennLayout, VENN_H, VENN_INSET, VENN_W } from './vennInput.ts'
import './venn-input.css'

export interface VennValue {
  labels: string[]
  shaded: Set<string>
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Förslag på bokstäver: uppgiftens mängder först, sedan resten av alfabetet. */
export function defaultLabels(sets: string[], n: number): string[] {
  return [...new Set([...sets, ...LETTERS])].slice(0, n)
}

export function vennExpr(v: VennValue) {
  return regionsToExpr(v.labels, v.shaded)
}

export function VennInput({
  value,
  onChange,
  sets,
  universe = 'G',
  constraints,
  readOnly,
}: {
  value: VennValue
  onChange: (v: VennValue) => void
  sets: string[]
  universe?: string
  constraints?: string[]
  readOnly?: boolean
}) {
  const circles = useMemo(() => vennLayout(value.labels, constraints), [value.labels, constraints])
  const canvas = useRef<HTMLCanvasElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<string | null>(null)

  // Skuggningen ritas pixel för pixel, så att varje område blir exakt.
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    el.width = Math.round(VENN_W * dpr)
    el.height = Math.round(VENN_H * dpr)
    const ctx = el.getContext('2d')!
    const style = getComputedStyle(el)
    const parse = (c: string) => {
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      ctx.clearRect(0, 0, 1, 1)
      return d
    }
    const on = parse(style.getPropertyValue('--venn-on').trim() || 'rgba(232,98,44,0.5)')
    const hov = parse(style.getPropertyValue('--venn-hover').trim() || 'rgba(232,98,44,0.18)')
    const img = ctx.createImageData(el.width, el.height)
    for (let py = 0; py < el.height; py++) {
      for (let px = 0; px < el.width; px++) {
        const key = regionAt(px / dpr, py / dpr, circles)
        if (key === null) continue
        const c = value.shaded.has(key) ? on : !readOnly && key === hover ? hov : null
        if (!c) continue
        const o = (py * el.width + px) * 4
        img.data[o] = c[0]
        img.data[o + 1] = c[1]
        img.data[o + 2] = c[2]
        img.data[o + 3] = c[3]
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [circles, value.shaded, hover, readOnly])

  const point = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    return regionAt(((e.clientX - r.left) / r.width) * VENN_W, ((e.clientY - r.top) / r.height) * VENN_H, circles)
  }

  const toggle = (key: string) => {
    const shaded = new Set(value.shaded)
    if (shaded.has(key)) shaded.delete(key)
    else shaded.add(key)
    onChange({ ...value, shaded })
  }

  const setCount = (n: number) => {
    // Nya områden när antalet cirklar ändras: börja om skuggningen.
    onChange({ labels: defaultLabels([...value.labels, ...sets], n), shaded: new Set() })
  }

  const setLabel = (i: number, raw: string) => {
    const l = raw.toUpperCase().replace(/[^A-ZÅÄÖ]/g, '').slice(-1)
    if (!l) return
    const labels = value.labels.map((x, j) => (j === i ? l : x))
    onChange({ ...value, labels })
  }

  const dupes = value.labels.filter((l, i) => value.labels.indexOf(l) !== i)
  const unknown = value.labels.filter((l) => !sets.includes(l) && l !== universe)

  return (
    <div className={`venn-in ${readOnly ? 'ro' : ''}`}>
      {!readOnly && (
        <div className="venn-in-bar">
          <div className="venn-in-count" role="radiogroup" aria-label="Antal cirklar">
            {[1, 2, 3].map((n) => (
              <button key={n} role="radio" aria-checked={value.labels.length === n} className={value.labels.length === n ? 'on' : ''} onClick={() => setCount(n)}>
                {n} {n === 1 ? 'cirkel' : 'cirklar'}
              </button>
            ))}
          </div>
          <div className="venn-in-labels">
            {value.labels.map((l, i) => (
              <input key={i} value={l} aria-label={`Bokstav för cirkel ${i + 1}`} onChange={(e) => setLabel(i, e.target.value)} onFocus={(e) => e.target.select()} onKeyDown={(e) => e.stopPropagation()} />
            ))}
          </div>
        </div>
      )}
      <div className="venn-in-figure">
        <canvas ref={canvas} />
        <svg
          ref={svg}
          viewBox={`0 0 ${VENN_W} ${VENN_H}`}
          role="img"
          aria-label={`Venndiagram med ${value.labels.join(', ')}. Skuggat: ${vennExpr(value)}`}
          onPointerMove={(e) => !readOnly && setHover(point(e))}
          onPointerLeave={() => setHover(null)}
          onPointerDown={(e) => {
            if (readOnly) return
            const key = point(e)
            if (key !== null) toggle(key)
          }}
        >
          <rect x={VENN_INSET} y={VENN_INSET} width={VENN_W - 2 * VENN_INSET} height={VENN_H - 2 * VENN_INSET} rx="4" />
          {circles.map((c, i) => (
            <circle key={i} cx={c.cx} cy={c.cy} r={c.r} />
          ))}
          {circles.map((c, i) => (
            <text key={`t${i}`} x={c.lx} y={c.ly} className="venn-in-label">
              {value.labels[i]}
            </text>
          ))}
          <text x={VENN_W - 18} y={24} className="venn-in-label u">
            {universe}
          </text>
        </svg>
      </div>
      {!readOnly && (
        <p className="venn-in-help">
          {dupes.length
            ? `Två cirklar heter ${dupes[0]} – ge dem olika bokstäver.`
            : unknown.length
              ? `Uppgiften har mängderna ${sets.join(', ')}. ${unknown.join(', ')} finns inte.`
              : 'Klicka på ett område för att skugga det, klicka igen för att ta bort.'}
        </p>
      )}
    </div>
  )
}

export const emptyVenn = (sets: string[]): VennValue => ({ labels: defaultLabels(sets, Math.min(3, Math.max(1, sets.length))), shaded: new Set() })

export { allRegions }
