// Allt du gör sparas lokalt i webbläsarens IndexedDB, även utan nätverk.
import Dexie, { type EntityTable } from 'dexie'
import type { Drawing } from '../canvas/types.ts'

export type AttemptStatus = 'correct' | 'partial' | 'incorrect'

export interface Attempt {
  id?: number
  exerciseId: string
  /** Deluppgiftens index i uppgiften. */
  part: number
  label: string | null
  /** Det du skrev (vanlig text). Tomt för självbedömda uppgifter. */
  input: string
  status: AttemptStatus
  /** Du bedömde själv mot facit. */
  self: boolean
  /** Bokens ledtråd var öppen. */
  hintUsed: boolean
  at: number
}

class MatteDB extends Dexie {
  drawings!: EntityTable<Drawing, 'exerciseId'>
  attempts!: EntityTable<Attempt, 'id'>

  constructor() {
    super('matte')
    this.version(1).stores({
      drawings: 'exerciseId, updatedAt',
    })
    this.version(2).stores({
      drawings: 'exerciseId, updatedAt',
      attempts: '++id, exerciseId, at, status',
    })
  }
}

export const db = new MatteDB()

export async function loadDrawing(exerciseId: string): Promise<Drawing | undefined> {
  return db.drawings.get(exerciseId)
}

export async function saveDrawing(d: Drawing): Promise<void> {
  await db.drawings.put(d)
}

export async function recordAttempt(a: Omit<Attempt, 'id' | 'at'>): Promise<void> {
  await db.attempts.add({ ...a, at: Date.now() })
}

export async function attemptsFor(exerciseId: string): Promise<Attempt[]> {
  return db.attempts.where('exerciseId').equals(exerciseId).sortBy('at')
}
