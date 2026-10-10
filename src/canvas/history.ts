// Ångra och gör om. Varje ändring beskrivs som ”de här strecken togs bort,
// de här lades till”, vilket täcker att rita, sudda, flytta och rensa.
import type { Stroke } from './types.ts'

export interface Change {
  removed: Stroke[]
  added: Stroke[]
}

export class StrokeStore {
  strokes: Stroke[] = []

  constructor(initial: Stroke[] = []) {
    this.strokes = [...initial].sort((a, b) => a.z - b.z)
  }

  apply(change: Change) {
    if (change.removed.length) {
      const gone = new Set(change.removed.map((s) => s.id))
      this.strokes = this.strokes.filter((s) => !gone.has(s.id))
    }
    if (change.added.length) {
      this.strokes = [...this.strokes, ...change.added].sort((a, b) => a.z - b.z)
    }
  }

  nextZ() {
    return this.strokes.length ? Math.floor(this.strokes[this.strokes.length - 1].z) + 1 : 1
  }
}

export class History {
  private undoStack: Change[] = []
  private redoStack: Change[] = []
  constructor(private store: StrokeStore, private limit = 300) {}

  /** Utför en ändring och kom ihåg den. */
  commit(change: Change, alreadyApplied = false) {
    if (!change.removed.length && !change.added.length) return
    if (!alreadyApplied) this.store.apply(change)
    this.undoStack.push(change)
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack = []
  }

  undo(): boolean {
    const c = this.undoStack.pop()
    if (!c) return false
    this.store.apply({ removed: c.added, added: c.removed })
    this.redoStack.push(c)
    return true
  }

  redo(): boolean {
    const c = this.redoStack.pop()
    if (!c) return false
    this.store.apply(c)
    this.undoStack.push(c)
    return true
  }

  get canUndo() {
    return this.undoStack.length > 0
  }
  get canRedo() {
    return this.redoStack.length > 0
  }
}
