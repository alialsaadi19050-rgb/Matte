import { useEffect, useRef, useState } from 'react'
import type { Figure as FigureData, VennSpec } from '../content/types.ts'
import { evalSet, parseSetExpr } from '../math/sets.ts'
import { MathText } from './MathText.tsx'
import { contentText } from '../vault/vault.ts'

const svgCache = new Map<string, Promise<string>>()
const loadSvg = (src: string) => {
  if (!svgCache.has(src)) svgCache.set(src, contentText(src))
  return svgCache.get(src)!
}

/** SVG-figurer läggs in direkt i sidan så att de ärver textfärg (currentColor) och tema. */
function InlineSvg({ src, alt, width }: { src: string; alt: string; width?: number }) {
  const [markup, setMarkup] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    loadSvg(src).then((s) => alive && setMarkup(s))
    return () => {
      alive = false
    }
  }, [src])
  return (
    <div
      className="figure-svg"
      role="img"
      aria-label={alt}
      style={{ width: width ? `min(100%, ${width}px)` : undefined }}
      dangerouslySetInnerHTML={markup ? { __html: markup } : undefined}
    />
  )
}

function Venn({ spec, alt }: { spec: VennSpec; alt: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const { width: w, height: h } = spec
  const inset = 3

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    el.width = Math.round(w * dpr)
    el.height = Math.round(h * dpr)
    const ctx = el.getContext('2d')!
    ctx.clearRect(0, 0, el.width, el.height)
    if (!spec.shade) return
    let tree
    try {
      tree = parseSetExpr(spec.shade)
    } catch {
      return
    }
    const color = getComputedStyle(el).getPropertyValue('--fig-shade').trim() || 'rgba(232, 98, 44, 0.45)'
    const img = ctx.createImageData(el.width, el.height)
    // Färgen läses via en 1×1-pixel för att stödja alla CSS-färgformat.
    const probe = document.createElement('canvas').getContext('2d')!
    probe.fillStyle = color
    probe.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
    for (let py = 0; py < el.height; py++) {
      const y = py / dpr
      if (y < inset || y > h - inset) continue
      for (let px = 0; px < el.width; px++) {
        const x = px / dpr
        if (x < inset || x > w - inset) continue
        const member = (name: string) => {
          if (name === spec.universe) return true
          const s = spec.shapes.find((sh) => sh.name === name)
          if (!s) return false
          const dx = (x - s.cx) / s.rx
          const dy = (y - s.cy) / s.ry
          return dx * dx + dy * dy <= 1
        }
        if (evalSet(tree, member)) {
          const o = (py * el.width + px) * 4
          img.data[o] = r
          img.data[o + 1] = g
          img.data[o + 2] = b
          img.data[o + 3] = a
        }
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [spec, w, h])

  return (
    <div className="figure-venn" role="img" aria-label={alt} style={{ width: `min(100%, ${w}px)`, aspectRatio: `${w} / ${h}` }}>
      <canvas ref={canvas} />
      <svg viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <rect x={inset} y={inset} width={w - 2 * inset} height={h - 2 * inset} />
        {spec.shapes.map((s) => (
          <ellipse key={s.name} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} />
        ))}
        {spec.shapes.map(
          (s) =>
            s.label && (
              <text key={`l-${s.name}`} x={s.label.x} y={s.label.y} className="venn-label">
                {s.name}
              </text>
            ),
        )}
        {spec.universe && (
          <text x={w - 14} y={18} className="venn-label">
            {spec.universe}
          </text>
        )}
        {spec.texts?.map((t, i) => (
          <text key={`t-${i}`} x={t.x} y={t.y} className="venn-text" style={{ fontSize: t.size ?? 13 }}>
            {t.text}
          </text>
        ))}
      </svg>
    </div>
  )
}

export function Figure({ figure }: { figure: FigureData }) {
  switch (figure.kind) {
    case 'svg':
      return <InlineSvg src={figure.src} alt={figure.alt} width={figure.width} />
    case 'venn':
      return <Venn spec={figure.spec} alt={figure.alt} />
    case 'table':
      return (
        <div className="mt-table-wrap">
          <table className="mt-table" aria-label={figure.alt}>
            <thead>
              <tr>
                {figure.head.map((h, i) => (
                  <th key={i}>
                    <MathText text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {figure.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((c, j) => (
                    <td key={j}>
                      <MathText text={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

export function Figures({ figures }: { figures?: FigureData[] }) {
  if (!figures?.length) return null
  return (
    <div className="figures">
      {figures.map((f, i) => (
        <Figure key={i} figure={f} />
      ))}
    </div>
  )
}
