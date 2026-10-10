// Allt du gör sparas lokalt i webbläsarens IndexedDB, även utan nätverk.
import Dexie, { type EntityTable } from 'dexie'
import type { Drawing } from '../canvas/types.ts'
import { markDirty } from '../sync/changes.ts'

export type AttemptStatus = 'correct' | 'partial' | 'incorrect'

export interface Attempt {
  id?: number
  /** Unikt id som följer med mellan enheter. */
  uid?: string
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
    // Version 3: varje försök får ett uid så att det kan synkas mellan enheter utan dubbletter.
    this.version(3)
      .stores({
        drawings: 'exerciseId, updatedAt',
        attempts: '++id, &uid, exerciseId, at, status',
      })
      .upgrade((tx) =>
        tx
          .table('attempts')
          .toCollection()
          .modify((a: Attempt) => {
            a.uid ??= crypto.randomUUID()
          }),
      )
  }
}

export const db = new MatteDB()

export async function loadDrawing(exerciseId: string): Promise<Drawing | undefined> {
  return db.drawings.get(exerciseId)
}

export async function saveDrawing(d: Drawing): Promise<void> {
  await db.drawings.put(d)
  markDirty('doc', `drawing:${d.exerciseId}`)
}

export async function recordAttempt(a: Omit<Attempt, 'id' | 'at' | 'uid'>): Promise<void> {
  const uid = crypto.randomUUID()
  await db.attempts.add({ ...a, uid, at: Date.now() })
  markDirty('attempt', uid)
}

export async function attemptsFor(exerciseId: string): Promise<Attempt[]> {
  return db.attempts.where('exerciseId').equals(exerciseId).sortBy('at')
}
