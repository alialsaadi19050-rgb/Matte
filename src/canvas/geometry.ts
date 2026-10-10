// Geometri för sudd, lasso och utsnitt. Rena funktioner utan DOM.
import type { Box, Point, Stroke } from './types.ts'

export function strokeBox(s: Stroke): Box {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of s.points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  const pad = s.size
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
}

export const boxesOverlap = (a: Box, b: Box) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null
  return boxes.reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }))
}

/** Avståndet i kvadrat från punkten p till sträckan a–b. */
export function distToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx - px
  const cy = ay + t * dy - py
  return cx * cx + cy * cy
}

/** Rör suddets sträcka a–b (med radien r) någon del av strecket? */
export function strokeHit(s: Stroke, a: [number, number], b: [number, number], r: number): boolean {
  const rr = (r + s.size / 2) ** 2
  const pts = s.points
  if (pts.length === 1) return distToSegmentSq(pts[0][0], pts[0][1], a[0], a[1], b[0], b[1]) <= rr
  for (let i = 0; i < pts.length; i++) {
    if (distToSegmentSq(pts[i][0], pts[i][1], a[0], a[1], b[0], b[1]) <= rr) return true
    // Mittpunkter så att glesa streck inte slinker igenom suddet.
    if (i > 0) {
      const mx = (pts[i][0] + pts[i - 1][0]) / 2
      const my = (pts[i][1] + pts[i - 1][1]) / 2
      if (distToSegmentSq(mx, my, a[0], a[1], b[0], b[1]) <= rr) return true
    }
  }
  return false
}

/**
 * Delsudd: tar bort de punkter som suddet träffar och delar strecket i
 * de bitar som blir kvar. Returnerar null om strecket inte berörs.
 */
export function eraseFromStroke(s: Stroke, a: [number, number], b: [number, number], r: number, newId: () => string): Stroke[] | null {
  const rr = (r + s.size / 2) ** 2
  const hit = s.points.map(([x, y]) => distToSegmentSq(x, y, a[0], a[1], b[0], b[1]) <= rr)
  if (!hit.some(Boolean)) return null
  const pieces: Point[][] = []
  let run: Point[] = []
  s.points.forEach((p, i) => {
    if (hit[i]) {
      if (run.length) pieces.push(run)
      run = []
    } else run.push(p)
  })
  if (run.length) pieces.push(run)
  return pieces
    .filter((pts) => pts.length >= 2)
    .map((pts, i) => ({ ...s, id: newId(), z: s.z + (i + 1) * 1e-6, points: pts }))
}

export function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Ett streck markeras av lassot om minst hälften av dess punkter ligger inuti. */
export function lassoSelects(s: Stroke, poly: [number, number][]): boolean {
  if (poly.length < 3) return false
  let inside = 0
  for (const [x, y] of s.points) if (pointInPolygon(x, y, poly)) inside++
  return inside >= Math.max(1, s.points.length * 0.5)
}

export const translateStroke = (s: Stroke, dx: number, dy: number): Stroke => ({
  ...s,
  points: s.points.map(([x, y, p]) => [round(x + dx), round(y + dy), p]),
})

export const round = (v: number, d = 100) => Math.round(v * d) / d
