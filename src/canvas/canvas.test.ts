import { describe, expect, it } from 'vitest'
import { eraseFromStroke, lassoSelects, shapePoints, strokeHit, translateStroke } from './geometry.ts'
import { History, StrokeStore } from './history.ts'
import type { Stroke } from './types.ts'

const line = (id: string, z: number, x0: number, x1: number, y = 0): Stroke => ({
  id,
  z,
  tool: 'pen',
  color: 'ink',
  size: 4,
  pressure: true,
  points: Array.from({ length: 11 }, (_, i) => [x0 + ((x1 - x0) * i) / 10, y, 0.5]),
})

let n = 0
const newId = () => `n${n++}`

describe('sudd', () => {
  it('träffar ett streck som suddet korsar', () => {
    const s = line('a', 1, 0, 100)
    expect(strokeHit(s, [50, -20], [50, 20], 5)).toBe(true)
    expect(strokeHit(s, [50, 30], [60, 40], 5)).toBe(false)
  })

  it('delsudd mitt i ett streck ger två bitar', () => {
    const s = line('a', 1, 0, 100)
    const pieces = eraseFromStroke(s, [50, -20], [50, 20], 3, newId)!
    expect(pieces).toHaveLength(2)
    expect(pieces[0].points.at(-1)![0]).toBeLessThan(50)
    expect(pieces[1].points[0][0]).toBeGreaterThan(50)
    // Bitarna ritas på samma plats i ordningen som originalet.
    expect(pieces[0].z).toBeGreaterThan(1)
    expect(pieces[0].z).toBeLessThan(2)
  })

  it('delsudd i kanten ger en bit, och utanför ingen ändring', () => {
    const s = line('a', 1, 0, 100)
    expect(eraseFromStroke(s, [0, -20], [0, 20], 3, newId)).toHaveLength(1)
    expect(eraseFromStroke(s, [0, 40], [100, 40], 3, newId)).toBeNull()
  })
})

describe('lasso', () => {
  const square: [number, number][] = [
    [-10, -10],
    [110, -10],
    [110, 10],
    [-10, 10],
  ]
  it('markerar streck som ligger inuti', () => {
    expect(lassoSelects(line('a', 1, 0, 100), square)).toBe(true)
    expect(lassoSelects(line('b', 2, 0, 100, 50), square)).toBe(false)
  })
  it('flytt skapar ett nytt streck och rör inte originalet', () => {
    const s = line('a', 1, 0, 100)
    const moved = translateStroke(s, 10, 5)
    expect(moved.points[0]).toEqual([10, 5, 0.5])
    expect(s.points[0]).toEqual([0, 0, 0.5])
  })
})

describe('ångra och gör om', () => {
  it('ångrar ritning, sudd och rensning i rätt ordning', () => {
    const store = new StrokeStore()
    const h = new History(store)
    const a = line('a', 1, 0, 100)
    const b = line('b', 2, 0, 100, 20)
    h.commit({ removed: [], added: [a] })
    h.commit({ removed: [], added: [b] })
    h.commit({ removed: [a], added: [] })
    expect(store.strokes.map((s) => s.id)).toEqual(['b'])
    h.undo()
    // a kommer tillbaka under b, där det låg från början.
    expect(store.strokes.map((s) => s.id)).toEqual(['a', 'b'])
    h.commit({ removed: [...store.strokes], added: [] })
    expect(store.strokes).toHaveLength(0)
    h.undo()
    expect(store.strokes).toHaveLength(2)
    h.redo()
    expect(store.strokes).toHaveLength(0)
    expect(h.canRedo).toBe(false)
  })

  it('ett nytt streck efter ångra tömmer gör om', () => {
    const store = new StrokeStore()
    const h = new History(store)
    h.commit({ removed: [], added: [line('a', 1, 0, 10)] })
    h.undo()
    expect(h.canRedo).toBe(true)
    h.commit({ removed: [], added: [line('b', 1, 0, 10)] })
    expect(h.canRedo).toBe(false)
  })
})

describe('shapePoints', () => {
  it('ritar en sluten rektangel med raka sidor', () => {
    const pts = shapePoints('rect', [0, 0], [40, 20])
    expect(pts[0].slice(0, 2)).toEqual([0, 0])
    expect(pts[pts.length - 1].slice(0, 2)).toEqual([0, 0])
    expect(pts.every(([x, y]) => x === 0 || x === 40 || y === 0 || y === 20)).toBe(true)
  })
  it('gör en kvadrat och en cirkel med Shift', () => {
    const sq = shapePoints('rect', [0, 0], [40, -10], true)
    expect(Math.max(...sq.map((p) => -p[1]))).toBe(40)
    const c = shapePoints('ellipse', [0, 0], [30, 50], true)
    for (const [x, y] of c) expect(Math.hypot(x - 25, y - 25)).toBeCloseTo(25, 1)
  })
  it('låser linjen till närmaste 15°', () => {
    const l = shapePoints('line', [0, 0], [100, 4], true)
    expect(l[l.length - 1][1]).toBe(0)
    expect(l[l.length - 1][0]).toBeCloseTo(Math.hypot(100, 4), 1)
  })
})
