// Allt du gör sparas lokalt i webbläsarens IndexedDB, även utan nätverk.
import Dexie, { type EntityTable } from 'dexie'
import type { Drawing } from '../canvas/types.ts'
import { markDirty } from '../sync/changes.ts'

/** 'redo' är en markör: du började om uppgiften. Försöken före den räknas till en tidigare omgång. */
export type AttemptStatus = 'correct' | 'partial' | 'incorrect' | 'redo'

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

/** Försöken i den pågående omgången: allt efter den senaste ”gör om”-markören. */
export function currentRound(attempts: Attempt[]): Attempt[] {
  const sorted = [...attempts].sort((a, b) => a.at - b.at)
  const last = sorted.findLastIndex((a) => a.status === 'redo')
  return sorted.slice(last + 1)
}

/** Börjar om en uppgift. Tidigare försök finns kvar i statistiken. */
export async function startRedo(exerciseId: string): Promise<void> {
  await recordAttempt({ exerciseId, part: -1, label: null, input: '', status: 'redo', self: false, hintUsed: false })
}
