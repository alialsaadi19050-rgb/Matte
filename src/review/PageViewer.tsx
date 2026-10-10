import { useEffect, useRef, useState } from 'react'

/** Visar ett foto av en boksida. Scrollhjul zoomar mot muspekaren, dra för att panorera. */
export function PageViewer({ src, alt }: { src: string | null; alt: string }) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)

  useEffect(() => setView({ scale: 1, x: 0, y: 0 }), [src])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      setView((v) => {
        const scale = Math.min(6, Math.max(1, v.scale * Math.exp(-e.deltaY * 0.0015)))
        const k = scale / v.scale
        return { scale, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  if (!src) return <div className="page-viewer empty">Ingen bild av den här sidan.</div>

  return (
    <div
      ref={box}
      className="page-viewer"
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (d) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }))
      }}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => setView({ scale: 1, x: 0, y: 0 })}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      />
      <div className="page-viewer-hint">Scrolla för att zooma · dra för att flytta · dubbelklicka för att återställa</div>
    </div>
  )
}
