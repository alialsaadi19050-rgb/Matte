// Exporterar din lösning som PNG eller PDF, ritad från vektorerna (alltid skarp).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { strokeBox, unionBox } from './geometry.ts'
import { drawBackground, drawStroke } from './render.ts'
import type { Background, Box, Paper, Stroke } from './types.ts'
import { PAGE_H, PAGE_W } from './types.ts'

interface ExportOptions {
  strokes: Stroke[]
  background: Background
  paper: Paper
  title: string
}

function contentBox(strokes: Stroke[]): Box {
  const b = unionBox(strokes.map(strokeBox)) ?? { minX: 0, minY: 0, maxX: PAGE_W, maxY: 400 }
  return { minX: Math.min(0, b.minX - 24), minY: Math.min(0, b.minY - 24), maxX: Math.max(PAGE_W, b.maxX + 24), maxY: b.maxY + 40 }
}

function renderArea(o: ExportOptions, area: Box, scale: number, header: number): HTMLCanvasElement {
  const w = area.maxX - area.minX
  const h = area.maxY - area.minY
  const c = document.createElement('canvas')
  c.width = Math.round(w * scale)
  c.height = Math.round((h + header) * scale)
  const ctx = c.getContext('2d')!
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  if (header) {
    ctx.fillStyle = o.paper === 'light' ? '#ffffff' : '#101013'
    ctx.fillRect(0, 0, w, header)
    ctx.fillStyle = o.paper === 'light' ? '#1d2733' : '#ece6dc'
    ctx.font = '600 22px "Bricolage Grotesque Variable", system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(o.title, 24, header / 2)
  }
  ctx.setTransform(scale, 0, 0, scale, -area.minX * scale, (header - area.minY) * scale)
  drawBackground(ctx, o.background, o.paper, area, scale, false)
  for (const s of o.strokes) if (s.tool === 'highlighter') drawStroke(ctx, s, o.paper)
  for (const s of o.strokes) if (s.tool === 'pen') drawStroke(ctx, s, o.paper)
  return c
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Kunde inte skapa bilden'))), 'image/png'))

export async function exportPng(o: ExportOptions): Promise<Blob> {
  return toBlob(renderArea(o, contentBox(o.strokes), 2, 56))
}

/** En PDF-sida per ”sida” i skrivytan (streckade linjer), i A4-format. */
export async function exportPdf(o: ExportOptions): Promise<Blob> {
  const box = contentBox(o.strokes)
  const pages = Math.max(1, Math.ceil(box.maxY / PAGE_H))
  const pdf = await PDFDocument.create()
  pdf.setTitle(o.title)
  const font = await pdf.embedFont(StandardFonts.HelveticaBold)
  const A4: [number, number] = [595.28, 841.89]
  for (let i = 0; i < pages; i++) {
    const area: Box = { minX: 0, minY: i * PAGE_H, maxX: PAGE_W, maxY: (i + 1) * PAGE_H }
    const pageStrokes = o.strokes.filter((s) => {
      const b = strokeBox(s)
      return b.maxY >= area.minY && b.minY <= area.maxY
    })
    const png = await pdf.embedPng(await (await toBlob(renderArea({ ...o, strokes: pageStrokes }, area, 2, 0))).arrayBuffer())
    const page = pdf.addPage(A4)
    const margin = 28
    const top = 36
    const w = A4[0] - 2 * margin
    const h = (w * PAGE_H) / PAGE_W
    const scale = Math.min(1, (A4[1] - top - margin) / h)
    page.drawText(`${o.title}${pages > 1 ? `  ·  sida ${i + 1} av ${pages}` : ''}`, { x: margin, y: A4[1] - 26, size: 11, font, color: rgb(0.2, 0.2, 0.25) })
    page.drawImage(png, { x: margin + (w - w * scale) / 2, y: margin, width: w * scale, height: h * scale })
  }
  return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' })
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
