// Ritar papper och streck på en 2D-canvas.
import { getStroke } from 'perfect-freehand'
import type { Background, HighlightColor, InkColor, Paper, Point, Stroke } from './types.ts'
import { HIGHLIGHT, INK, PAGE_H } from './types.ts'

export interface View {
  x: number
  y: number
  zoom: number
}

export const PAPER: Record<Paper, { bg: string; line: string; strong: string; page: string }> = {
  light: { bg: '#f6f3ec', line: 'rgba(57, 110, 175, 0.17)', strong: 'rgba(214, 72, 72, 0.35)', page: 'rgba(0, 0, 0, 0.18)' },
  dark: { bg: '#17171b', line: 'rgba(255, 255, 255, 0.07)', strong: 'rgba(255, 120, 120, 0.3)', page: 'rgba(255, 255, 255, 0.2)' },
}

export const GRID = 26
export const LINE_GAP = 34

function freehandOptions(s: Pick<Stroke, 'tool' | 'size' | 'pressure'>, last: boolean) {
  if (s.tool === 'highlighter') {
    return { size: s.size, thinning: 0, smoothing: 0.6, streamline: 0.5, simulatePressure: false, last, start: { cap: true }, end: { cap: true } }
  }
  return {
    size: s.size,
    thinning: s.pressure ? 0.62 : 0.5,
    smoothing: 0.55,
    // Låg streamline: strecket följer pennspetsen tätt (känns snabbare).
    streamline: 0.32,
    simulatePressure: !s.pressure,
    easing: (t: number) => Math.sin((t * Math.PI) / 2),
    last,
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
  }
}

/** Gör om konturen från perfect-freehand till en Path2D med mjuka kurvor. */
export function outlineToPath(outline: number[][]): Path2D {
  const path = new Path2D()
  if (outline.length < 2) return path
  path.moveTo(outline[0][0], outline[0][1])
  for (let i = 1; i < outline.length - 1; i++) {
    const [x0, y0] = outline[i]
    const [x1, y1] = outline[i + 1]
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  path.closePath()
  return path
}

export function strokePath(s: Pick<Stroke, 'tool' | 'size' | 'pressure' | 'points'>, last = true): Path2D {
  const pts = s.points.length === 1 ? [s.points[0], [s.points[0][0] + 0.1, s.points[0][1] + 0.1, s.points[0][2]] as Point] : s.points
  return outlineToPath(getStroke(pts, freehandOptions(s, last)))
}

// Streck är oföränderliga (en flytt skapar ett nytt objekt), så objektet självt är nyckeln.
const pathCache = new WeakMap<Stroke, Path2D>()

export function cachedPath(s: Stroke): Path2D {
  let path = pathCache.get(s)
  if (!path) {
    path = strokePath(s)
    pathCache.set(s, path)
  }
  return path
}

export function strokeColor(s: Pick<Stroke, 'tool' | 'color'>, paper: Paper): string {
  return s.tool === 'highlighter' ? HIGHLIGHT[s.color as HighlightColor] : INK[paper][s.color as InkColor]
}

/** Ritar ett streck. Överstrykning ritas genomskinlig så att texten under syns. */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, paper: Paper, path = cachedPath(s)) {
  ctx.fillStyle = strokeColor(s, paper)
  if (s.tool === 'highlighter') {
    ctx.globalAlpha = paper === 'light' ? 0.42 : 0.3
    ctx.globalCompositeOperation = paper === 'light' ? 'multiply' : 'screen'
    ctx.fill(path)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  } else {
    ctx.fill(path)
  }
}

/** Ritar papperets bakgrund inom det synliga området (dokumentkoordinater). */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  kind: Background,
  paper: Paper,
  area: { minX: number; minY: number; maxX: number; maxY: number },
  zoom: number,
  pageBreaks = true,
) {
  const p = PAPER[paper]
  ctx.fillStyle = p.bg
  ctx.fillRect(area.minX, area.minY, area.maxX - area.minX, area.maxY - area.minY)
  ctx.lineWidth = 1 / zoom
  if (kind === 'grid') {
    ctx.strokeStyle = p.line
    ctx.beginPath()
    for (let x = Math.floor(area.minX / GRID) * GRID; x <= area.maxX; x += GRID) {
      ctx.moveTo(x, area.minY)
      ctx.lineTo(x, area.maxY)
    }
    for (let y = Math.floor(area.minY / GRID) * GRID; y <= area.maxY; y += GRID) {
      ctx.moveTo(area.minX, y)
      ctx.lineTo(area.maxX, y)
    }
    ctx.stroke()
  } else if (kind === 'lined') {
    ctx.strokeStyle = p.line
    ctx.beginPath()
    for (let y = Math.floor(area.minY / LINE_GAP) * LINE_GAP + LINE_GAP; y <= area.maxY; y += LINE_GAP) {
      ctx.moveTo(area.minX, y)
      ctx.lineTo(area.maxX, y)
    }
    ctx.stroke()
    ctx.strokeStyle = p.strong
    ctx.beginPath()
    ctx.moveTo(60, area.minY)
    ctx.lineTo(60, area.maxY)
    ctx.stroke()
  }
  if (pageBreaks) {
    ctx.strokeStyle = p.page
    ctx.setLineDash([8 / zoom, 8 / zoom])
    ctx.beginPath()
    for (let y = Math.max(PAGE_H, Math.ceil(area.minY / PAGE_H) * PAGE_H); y <= area.maxY; y += PAGE_H) {
      ctx.moveTo(area.minX, y)
      ctx.lineTo(area.maxX, y)
    }
    ctx.stroke()
    ctx.setLineDash([])
  }
}
