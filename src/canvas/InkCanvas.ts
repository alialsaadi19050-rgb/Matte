// Skrivytan. Fristående från React så att inget ramverk står mellan pennan och pixlarna.
//
// Rendering: allt som redan är ritat ligger i en buffert (en canvas utanför sidan).
// Medan du skriver kopieras bufferten till skärmen och bara det pågående strecket
// ritas ovanpå. Skärm-canvasen är ”desynchronized”, vilket låter webbläsaren visa
// pixlarna utan att vänta på nästa bildruta.
import { boxesOverlap, eraseFromStroke, lassoSelects, round, strokeBox, strokeHit, translateStroke, unionBox } from './geometry.ts'
import { History, StrokeStore, type Change } from './history.ts'
import { cachedPath, drawBackground, drawStroke, strokeColor, strokePath, type View } from './render.ts'
import type { Background, Box, EraserMode, HighlightColor, InkColor, Paper, Point, Stroke, Tool } from './types.ts'
import { ERASER_SIZES, HIGHLIGHTER_SIZES, PEN_SIZES } from './types.ts'

export interface ToolState {
  tool: Tool
  color: InkColor
  highlight: HighlightColor
  penSize: number
  highlighterSize: number
  eraserSize: number
  eraserMode: EraserMode
}

export const DEFAULT_TOOLS: ToolState = {
  tool: 'pen',
  color: 'ink',
  highlight: 'yellow',
  penSize: 1,
  highlighterSize: 1,
  eraserSize: 1,
  eraserMode: 'stroke',
}

export interface InkStatus {
  canUndo: boolean
  canRedo: boolean
  selected: number
  /** Verktyget som faktiskt används just nu (sidoknappen ger tillfälligt sudd). */
  activeTool: Tool
  zoom: number
}

export interface InkCallbacks {
  /** Strecken har ändrats (för autosparning). */
  onChange?: (strokes: Stroke[]) => void
  onStatus?: (status: InkStatus) => void
  /** Pennan rapporterar alltid trycket 0,5 – drivrutinen skickar inte tryck till webbläsaren. */
  onPressureMissing?: () => void
}

type Action =
  | { kind: 'draw'; stroke: Stroke; pointerId: number; predicted: Point[] }
  | { kind: 'erase'; pointerId: number; last: [number, number]; mode: EraserMode; radius: number; removed: Map<string, Stroke>; added: Map<string, Stroke> }
  | { kind: 'lasso'; pointerId: number; poly: [number, number][] }
  | { kind: 'move'; pointerId: number; start: [number, number]; delta: [number, number] }
  | { kind: 'pan'; pointerId: number; startClient: [number, number]; startView: View }

let idCounter = 0
const newId = () => `${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('input, textarea, select, [contenteditable="true"]')

export class InkCanvas {
  readonly el: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private buffer = document.createElement('canvas')
  private bctx = this.buffer.getContext('2d')!
  private cursor: HTMLDivElement
  private store = new StrokeStore()
  private history = new History(this.store)
  private boxes = new WeakMap<Stroke, Box>()

  view: View = { x: -24, y: -20, zoom: 1 }
  tools: ToolState = { ...DEFAULT_TOOLS }
  paper: Paper = 'light'
  background: Background = 'grid'

  private dpr = 1
  private width = 0
  private height = 0
  private action: Action | null = null
  private selection = new Set<string>()
  private touches = new Map<number, [number, number]>()
  private pinch: { dist: number; mid: [number, number]; view: View } | null = null
  private spaceHeld = false
  private barrel = false
  private hover: { x: number; y: number; type: string } | null = null
  private baseDirty = true
  private raf = 0
  private pressure = { events: 0, varied: 0, warned: false }
  private cleanup: (() => void)[] = []

  constructor(private root: HTMLElement, private cb: InkCallbacks = {}, lowLatency = true) {
    this.el = document.createElement('canvas')
    this.el.className = 'ink-canvas'
    this.el.setAttribute('aria-label', 'Skrivyta')
    this.el.setAttribute('role', 'img')
    this.el.style.touchAction = 'none'
    this.ctx = (lowLatency ? this.el.getContext('2d', { desynchronized: true, alpha: false }) : this.el.getContext('2d', { alpha: false }))!
    this.cursor = document.createElement('div')
    this.cursor.className = 'ink-cursor'
    root.append(this.el, this.cursor)
    this.listen()
    this.resize()
  }

  /* ---------- Offentligt API ---------- */

  load(strokes: Stroke[], background: Background) {
    this.store = new StrokeStore(strokes)
    this.history = new History(this.store)
    this.background = background
    this.selection.clear()
    this.view = { x: -24, y: -20, zoom: this.view.zoom }
    this.invalidate()
    this.emitStatus()
  }

  get strokes() {
    return this.store.strokes
  }

  setTools(patch: Partial<ToolState>) {
    const prev = this.tools.tool
    this.tools = { ...this.tools, ...patch }
    if (prev === 'lasso' && this.tools.tool !== 'lasso') this.clearSelection()
    this.updateCursor()
    this.emitStatus()
  }

  setPaper(paper: Paper) {
    this.paper = paper
    this.invalidate()
  }

  setBackground(bg: Background) {
    this.background = bg
    this.invalidate()
    this.cb.onChange?.(this.strokes)
  }

  undo() {
    if (this.history.undo()) this.afterChange()
  }

  redo() {
    if (this.history.redo()) this.afterChange()
  }

  clear() {
    if (!this.strokes.length) return
    this.history.commit({ removed: [...this.strokes], added: [] })
    this.selection.clear()
    this.afterChange()
  }

  deleteSelection() {
    if (!this.selection.size) return
    const removed = this.strokes.filter((s) => this.selection.has(s.id))
    this.selection.clear()
    this.history.commit({ removed, added: [] })
    this.afterChange()
  }

  clearSelection() {
    if (!this.selection.size) return
    this.selection.clear()
    this.invalidate()
    this.emitStatus()
  }

  zoomBy(factor: number, clientX?: number, clientY?: number) {
    const r = this.el.getBoundingClientRect()
    const cx = clientX ?? r.left + r.width / 2
    const cy = clientY ?? r.top + r.height / 2
    this.zoomAt(this.view.zoom * factor, cx - r.left, cy - r.top)
  }

  resetView() {
    this.view = { x: -24, y: -20, zoom: 1 }
    this.invalidate()
    this.emitStatus()
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.cleanup.forEach((f) => f())
    this.el.remove()
    this.cursor.remove()
  }

  /* ---------- Koordinater och vy ---------- */

  private toDoc(clientX: number, clientY: number): [number, number] {
    const r = this.el.getBoundingClientRect()
    return [(clientX - r.left) / this.view.zoom + this.view.x, (clientY - r.top) / this.view.zoom + this.view.y]
  }

  private clampView() {
    const v = this.view
    v.zoom = Math.min(4, Math.max(0.35, v.zoom))
    v.y = Math.max(-80, v.y)
    v.x = Math.min(2400, Math.max(-600, v.x))
  }

  private zoomAt(zoom: number, sx: number, sy: number) {
    const before = this.view
    const z = Math.min(4, Math.max(0.35, zoom))
    const docX = sx / before.zoom + before.x
    const docY = sy / before.zoom + before.y
    this.view = { zoom: z, x: docX - sx / z, y: docY - sy / z }
    this.clampView()
    this.invalidate()
    this.updateCursor()
    this.emitStatus()
  }

  private resize() {
    const r = this.root.getBoundingClientRect()
    this.dpr = Math.min(window.devicePixelRatio || 1, 3)
    this.width = Math.max(1, Math.round(r.width))
    this.height = Math.max(1, Math.round(r.height))
    for (const c of [this.el, this.buffer]) {
      c.width = Math.round(this.width * this.dpr)
      c.height = Math.round(this.height * this.dpr)
    }
    this.el.style.width = `${this.width}px`
    this.el.style.height = `${this.height}px`
    this.invalidate()
  }

  /* ---------- Rendering ---------- */

  private box(s: Stroke) {
    let b = this.boxes.get(s)
    if (!b) {
      b = strokeBox(s)
      this.boxes.set(s, b)
    }
    return b
  }

  private visibleArea(): Box {
    const { x, y, zoom } = this.view
    return { minX: x, minY: y, maxX: x + this.width / zoom, maxY: y + this.height / zoom }
  }

  private applyView(ctx: CanvasRenderingContext2D) {
    const k = this.dpr * this.view.zoom
    ctx.setTransform(k, 0, 0, k, -this.view.x * k, -this.view.y * k)
  }

  /** Ber om en ny bild. Bufferten ritas om bara när något ändrats. */
  invalidate() {
    this.baseDirty = true
    if (!this.raf) this.raf = requestAnimationFrame(() => this.frame())
  }

  private frame() {
    this.raf = 0
    if (this.baseDirty) this.renderBuffer()
    this.present()
  }

  private renderBuffer() {
    this.baseDirty = false
    const ctx = this.bctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.applyView(ctx)
    const area = this.visibleArea()
    drawBackground(ctx, this.background, this.paper, area, this.view.zoom)
    const moving = this.action?.kind === 'move'
    const visible = this.strokes.filter((s) => boxesOverlap(this.box(s), area) && !(moving && this.selection.has(s.id)))
    for (const s of visible) if (s.tool === 'highlighter') drawStroke(ctx, s, this.paper)
    for (const s of visible) if (s.tool === 'pen') drawStroke(ctx, s, this.paper)
    if (this.selection.size && !moving) this.drawSelection(ctx, [0, 0])
  }

  private selectionBox(delta: [number, number] = [0, 0]): Box | null {
    const b = unionBox(this.strokes.filter((s) => this.selection.has(s.id)).map((s) => this.box(s)))
    if (!b) return null
    return { minX: b.minX + delta[0] - 6, minY: b.minY + delta[1] - 6, maxX: b.maxX + delta[0] + 6, maxY: b.maxY + delta[1] + 6 }
  }

  private drawSelection(ctx: CanvasRenderingContext2D, delta: [number, number]) {
    const b = this.selectionBox(delta)
    if (!b) return
    const accent = getComputedStyle(this.root).getPropertyValue('--accent').trim() || '#ff6a2b'
    ctx.save()
    ctx.strokeStyle = accent
    ctx.lineWidth = 1.5 / this.view.zoom
    ctx.setLineDash([6 / this.view.zoom, 4 / this.view.zoom])
    ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY)
    ctx.setLineDash([])
    ctx.fillStyle = accent
    const h = 7 / this.view.zoom
    for (const [x, y] of [
      [b.minX, b.minY],
      [b.maxX, b.minY],
      [b.minX, b.maxY],
      [b.maxX, b.maxY],
    ])
      ctx.fillRect(x - h / 2, y - h / 2, h, h)
    ctx.restore()
  }

  /** Kopierar bufferten till skärmen och ritar det pågående ovanpå. Körs direkt vid varje penndrag. */
  private present() {
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(this.buffer, 0, 0)
    const a = this.action
    if (!a) return
    this.applyView(ctx)
    if (a.kind === 'draw') {
      const s = a.stroke
      const live = { ...s, points: a.predicted.length ? [...s.points, ...a.predicted] : s.points }
      drawStroke(ctx, s, this.paper, strokePath(live, false))
    } else if (a.kind === 'lasso' && a.poly.length > 1) {
      const accent = getComputedStyle(this.root).getPropertyValue('--accent').trim() || '#ff6a2b'
      ctx.strokeStyle = accent
      ctx.fillStyle = accent
      ctx.lineWidth = 1.5 / this.view.zoom
      ctx.setLineDash([5 / this.view.zoom, 4 / this.view.zoom])
      ctx.beginPath()
      a.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.closePath()
      ctx.globalAlpha = 0.08
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.stroke()
      ctx.setLineDash([])
    } else if (a.kind === 'move') {
      for (const s of this.strokes) {
        if (!this.selection.has(s.id)) continue
        ctx.save()
        ctx.translate(a.delta[0], a.delta[1])
        drawStroke(ctx, s, this.paper, cachedPath(s))
        ctx.restore()
      }
      this.drawSelection(ctx, a.delta)
    }
  }

  /* ---------- Markör som visar var pennan hamnar ---------- */

  private currentTool(): Tool {
    return this.barrel ? 'eraser' : this.tools.tool
  }

  private updateCursor() {
    const h = this.hover
    const c = this.cursor
    if (!h || h.type === 'touch' || this.spaceHeld || this.action?.kind === 'pan') {
      c.style.opacity = '0'
      this.el.style.cursor = this.spaceHeld ? 'grab' : ''
      return
    }
    this.el.style.cursor = 'none'
    const tool = this.currentTool()
    const z = this.view.zoom
    let d = 6
    let color = 'currentColor'
    if (tool === 'pen') {
      d = Math.max(4, PEN_SIZES[this.tools.penSize] * z)
      color = strokeColor({ tool: 'pen', color: this.tools.color }, this.paper)
    } else if (tool === 'highlighter') {
      d = HIGHLIGHTER_SIZES[this.tools.highlighterSize] * z
      color = strokeColor({ tool: 'highlighter', color: this.tools.highlight }, this.paper)
    } else if (tool === 'eraser') {
      d = ERASER_SIZES[this.tools.eraserSize] * 2 * z
    }
    c.dataset.tool = tool
    c.style.setProperty('--c', color)
    c.style.width = c.style.height = `${d + 4}px`
    c.style.transform = `translate(${h.x}px, ${h.y}px) translate(-50%, -50%)`
    c.style.opacity = '1'
  }

  /* ---------- Inmatning ---------- */

  private listen() {
    const el = this.el
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts)
      this.cleanup.push(() => t.removeEventListener(type, fn as EventListener, opts))
    }
    on(el, 'pointerdown', (e: PointerEvent) => this.down(e))
    on(el, 'pointermove', (e: PointerEvent) => this.move(e))
    on(el, 'pointerup', (e: PointerEvent) => this.up(e))
    on(el, 'pointercancel', (e: PointerEvent) => this.up(e, true))
    on(el, 'pointerleave', (e: PointerEvent) => {
      if (e.pointerType !== 'touch') {
        this.hover = null
        this.updateCursor()
      }
    })
    // Sidoknappen på pennan skickas ofta som högerklick: ingen meny på skrivytan.
    on(el, 'contextmenu', (e: Event) => e.preventDefault())
    on(el, 'wheel', (e: WheelEvent) => this.wheel(e), { passive: false })
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target) && !e.repeat) {
        this.spaceHeld = true
        this.updateCursor()
        e.preventDefault()
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selection.size && !isTyping(e.target)) this.deleteSelection()
      if (e.key === 'Escape') this.clearSelection()
    })
    on(window, 'keyup', (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        this.spaceHeld = false
        this.updateCursor()
      }
    })
    on(window, 'blur', () => {
      this.spaceHeld = false
      this.barrel = false
    })
    const ro = new ResizeObserver(() => this.resize())
    ro.observe(this.root)
    this.cleanup.push(() => ro.disconnect())
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    on(mq, 'change', () => this.resize())
  }

  private wheel(e: WheelEvent) {
    e.preventDefault()
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1
    if (e.ctrlKey || e.metaKey) {
      const r = this.el.getBoundingClientRect()
      this.zoomAt(this.view.zoom * Math.exp(-e.deltaY * unit * 0.0018), e.clientX - r.left, e.clientY - r.top)
      return
    }
    const dx = e.shiftKey ? e.deltaY : e.deltaX
    const dy = e.shiftKey ? 0 : e.deltaY
    this.view.x += (dx * unit) / this.view.zoom
    this.view.y += (dy * unit) / this.view.zoom
    this.clampView()
    this.invalidate()
  }

  private down(e: PointerEvent) {
    if (e.pointerType === 'touch') {
      this.touchDown(e)
      return
    }
    if (this.action) return
    e.preventDefault()
    this.capture(e.pointerId)
    this.hover = { x: e.offsetX, y: e.offsetY, type: e.pointerType }

    if (this.spaceHeld || e.button === 1) {
      this.action = { kind: 'pan', pointerId: e.pointerId, startClient: [e.clientX, e.clientY], startView: { ...this.view } }
      this.el.style.cursor = 'grabbing'
      this.updateCursor()
      return
    }
    // Sidoknapp (högerklick) eller suddänden: sudda så länge knappen hålls in.
    this.barrel = e.button === 2 || (e.buttons & 2) !== 0 || (e.buttons & 32) !== 0 || e.button === 5
    const tool = this.currentTool()
    const p = this.toDoc(e.clientX, e.clientY)

    if (tool === 'pen' || tool === 'highlighter') {
      if (e.button !== 0) return
      const pen = tool === 'pen'
      const stroke: Stroke = {
        id: newId(),
        z: this.store.nextZ(),
        tool,
        color: pen ? this.tools.color : this.tools.highlight,
        size: pen ? PEN_SIZES[this.tools.penSize] : HIGHLIGHTER_SIZES[this.tools.highlighterSize],
        pressure: e.pointerType === 'pen',
        points: [[round(p[0]), round(p[1]), this.pressureOf(e)]],
      }
      this.action = { kind: 'draw', stroke, pointerId: e.pointerId, predicted: [] }
      if (this.selection.size) this.clearSelection()
      this.present()
    } else if (tool === 'eraser') {
      this.action = {
        kind: 'erase',
        pointerId: e.pointerId,
        last: p,
        mode: this.tools.eraserMode,
        radius: ERASER_SIZES[this.tools.eraserSize],
        removed: new Map(),
        added: new Map(),
      }
      this.eraseAlong(p, p)
    } else if (tool === 'lasso') {
      const sel = this.selectionBox()
      if (sel && p[0] >= sel.minX && p[0] <= sel.maxX && p[1] >= sel.minY && p[1] <= sel.maxY) {
        this.action = { kind: 'move', pointerId: e.pointerId, start: p, delta: [0, 0] }
        this.invalidate()
      } else {
        this.selection.clear()
        this.action = { kind: 'lasso', pointerId: e.pointerId, poly: [p] }
        this.invalidate()
      }
    }
    this.updateCursor()
  }

  /** Fånga pekaren så att strecket fortsätter även utanför ytan. */
  private capture(id: number) {
    try {
      this.el.setPointerCapture(id)
    } catch {
      /* pekaren är redan släppt */
    }
  }

  private pressureOf(e: PointerEvent) {
    if (e.pointerType !== 'pen') return 0.5
    return Math.round(Math.max(0.05, e.pressure || 0) * 1000) / 1000
  }

  private move(e: PointerEvent) {
    if (e.pointerType === 'touch') {
      this.touchMove(e)
      return
    }
    // Pennan svävar: uppdatera bara markören.
    this.hover = { x: e.offsetX, y: e.offsetY, type: e.pointerType }
    if (!this.action) {
      const barrel = (e.buttons & 2) !== 0 || (e.buttons & 32) !== 0
      if (barrel !== this.barrel) this.barrel = barrel
      this.updateCursor()
      return
    }
    if (e.pointerId !== this.action.pointerId) return
    this.updateCursor()
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
    const list = events.length ? events : [e]
    const a = this.action

    if (a.kind === 'pan') {
      this.view.x = a.startView.x - (e.clientX - a.startClient[0]) / this.view.zoom
      this.view.y = a.startView.y - (e.clientY - a.startClient[1]) / this.view.zoom
      this.clampView()
      this.invalidate()
      return
    }
    if (a.kind === 'draw') {
      const pts = a.stroke.points
      const minGap = 0.4 / this.view.zoom
      for (const ev of list) {
        // Bara när pennan faktiskt nuddar plattan.
        if (ev.pointerType === 'pen' && !(ev.buttons & 1) && ev.pressure === 0) continue
        const [x, y] = this.toDoc(ev.clientX, ev.clientY)
        const last = pts[pts.length - 1]
        if (Math.abs(x - last[0]) < minGap && Math.abs(y - last[1]) < minGap) continue
        pts.push([round(x), round(y), this.pressureOf(ev)])
        if (ev.pointerType === 'pen') {
          this.pressure.events++
          if (Math.abs(ev.pressure - 0.5) > 0.002) this.pressure.varied++
        }
      }
      const predicted = typeof e.getPredictedEvents === 'function' ? e.getPredictedEvents() : []
      a.predicted = predicted.slice(0, 2).map((ev) => {
        const [x, y] = this.toDoc(ev.clientX, ev.clientY)
        return [x, y, this.pressureOf(ev)] as Point
      })
      this.present()
      return
    }
    if (a.kind === 'erase') {
      for (const ev of list) {
        const p = this.toDoc(ev.clientX, ev.clientY)
        this.eraseAlong(a.last, p)
        a.last = p
      }
      return
    }
    if (a.kind === 'lasso') {
      for (const ev of list) a.poly.push(this.toDoc(ev.clientX, ev.clientY))
      this.present()
      return
    }
    if (a.kind === 'move') {
      const p = this.toDoc(e.clientX, e.clientY)
      a.delta = [p[0] - a.start[0], p[1] - a.start[1]]
      this.present()
    }
  }

  private up(e: PointerEvent, cancelled = false) {
    if (e.pointerType === 'touch') {
      this.touchUp(e)
      return
    }
    const a = this.action
    if (!a || e.pointerId !== a.pointerId) return
    this.action = null
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId)

    if (a.kind === 'draw' && !cancelled) {
      this.history.commit({ removed: [], added: [a.stroke] })
      this.checkPressure()
      this.afterChange()
    } else if (a.kind === 'erase') {
      const change: Change = { removed: [...a.removed.values()], added: [...a.added.values()] }
      this.history.commit(change, true)
      this.afterChange()
    } else if (a.kind === 'lasso') {
      const poly = a.poly
      for (const s of this.strokes) if (lassoSelects(s, poly)) this.selection.add(s.id)
      // Ett klick utan att rita en slinga markerar strecket man klickar på.
      if (!this.selection.size && poly.length < 4) {
        const [x, y] = poly[0]
        const hit = [...this.strokes].reverse().find((s) => strokeHit(s, [x, y], [x, y], 6 / this.view.zoom))
        if (hit) this.selection.add(hit.id)
      }
      this.invalidate()
      this.emitStatus()
    } else if (a.kind === 'move') {
      const [dx, dy] = a.delta
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        const removed = this.strokes.filter((s) => this.selection.has(s.id))
        this.history.commit({ removed, added: removed.map((s) => translateStroke(s, dx, dy)) })
        this.afterChange()
      } else this.invalidate()
    } else {
      this.invalidate()
    }
    this.barrel = (e.buttons & 2) !== 0
    this.updateCursor()
  }

  private eraseAlong(a: [number, number], b: [number, number]) {
    const act = this.action
    if (act?.kind !== 'erase') return
    const r = act.radius
    const seg: Box = { minX: Math.min(a[0], b[0]) - r, minY: Math.min(a[1], b[1]) - r, maxX: Math.max(a[0], b[0]) + r, maxY: Math.max(a[1], b[1]) + r }
    let changed = false
    for (const s of [...this.strokes]) {
      if (!boxesOverlap(this.box(s), seg)) continue
      let replacement: Stroke[] | null = null
      if (act.mode === 'stroke') replacement = strokeHit(s, a, b, r) ? [] : null
      else replacement = eraseFromStroke(s, a, b, r, newId)
      if (!replacement) continue
      changed = true
      this.store.apply({ removed: [s], added: replacement })
      // Ett streck som skapades under samma suddning och nu försvinner ska inte med i ändringen.
      if (act.added.has(s.id)) act.added.delete(s.id)
      else act.removed.set(s.id, s)
      for (const n of replacement) act.added.set(n.id, n)
    }
    if (changed) this.invalidate()
  }

  private checkPressure() {
    const p = this.pressure
    if (!p.warned && p.events > 40 && p.varied === 0) {
      p.warned = true
      this.cb.onPressureMissing?.()
    }
  }

  /* ---------- Pekskärm: panorera och nyp för att zooma, aldrig rita ---------- */

  private touchDown(e: PointerEvent) {
    this.capture(e.pointerId)
    this.touches.set(e.pointerId, [e.clientX, e.clientY])
    this.hover = null
    this.updateCursor()
    this.startGesture()
  }

  private startGesture() {
    const pts = [...this.touches.values()]
    if (pts.length >= 2) {
      const [a, b] = pts
      this.pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], view: { ...this.view } }
    } else if (pts.length === 1) {
      this.pinch = { dist: 0, mid: pts[0], view: { ...this.view } }
    }
  }

  private touchMove(e: PointerEvent) {
    if (!this.touches.has(e.pointerId) || !this.pinch) return
    this.touches.set(e.pointerId, [e.clientX, e.clientY])
    const pts = [...this.touches.values()]
    const r = this.el.getBoundingClientRect()
    const g = this.pinch
    if (pts.length >= 2 && g.dist > 0) {
      const [a, b] = pts
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1])
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      const zoom = Math.min(4, Math.max(0.35, (g.view.zoom * dist) / g.dist))
      const docX = (g.mid[0] - r.left) / g.view.zoom + g.view.x
      const docY = (g.mid[1] - r.top) / g.view.zoom + g.view.y
      this.view = { zoom, x: docX - (mid[0] - r.left) / zoom, y: docY - (mid[1] - r.top) / zoom }
    } else {
      this.view = { ...g.view, x: g.view.x - (e.clientX - g.mid[0]) / g.view.zoom, y: g.view.y - (e.clientY - g.mid[1]) / g.view.zoom }
    }
    this.clampView()
    this.invalidate()
    this.emitStatus()
  }

  private touchUp(e: PointerEvent) {
    this.touches.delete(e.pointerId)
    this.pinch = null
    this.startGesture()
  }

  /* ---------- Händelser ut ---------- */

  private afterChange() {
    // Markeringen får bara peka på streck som finns kvar.
    if (this.selection.size) {
      const ids = new Set(this.strokes.map((s) => s.id))
      for (const id of this.selection) if (!ids.has(id)) this.selection.delete(id)
    }
    this.invalidate()
    this.emitStatus()
    this.cb.onChange?.(this.strokes)
  }

  private emitStatus() {
    this.cb.onStatus?.({
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      selected: this.selection.size,
      activeTool: this.currentTool(),
      zoom: this.view.zoom,
    })
  }

  /** För test och felsökning: punkt i dokumentet för en skärmpunkt. */
  docPoint(clientX: number, clientY: number) {
    return this.toDoc(clientX, clientY)
  }
}
