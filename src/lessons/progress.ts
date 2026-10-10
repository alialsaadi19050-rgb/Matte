// Hur långt du kommit i genomgångarna. Sparas i webbläsaren, följer med i backupen och synkas
// mellan enheter.
import { useSyncExternalStore } from 'react'
import { markDirty } from '../sync/changes.ts'

export const LESSONS_KEY = 'matte.lessons.v1'

export interface LessonProgress {
  /** När du markerade genomgången som klar (ms). */
  done?: number
  /** Index för testfrågor du svarat rätt på. */
  checks: number[]
  /** Senast du öppnade genomgången (ms). */
  seen?: number
  /** När ”klar” senast ändrades (ms), så att rätt enhet vinner vid synk. */
  doneChangedAt?: number
  /** Senaste ändringen (ms), för synken. */
  updatedAt?: number
}

type Store = Record<string, LessonProgress>

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(LESSONS_KEY) ?? '{}') as Store
  } catch {
    return {}
  }
}

let current = load()
const listeners = new Set<() => void>()

function commit() {
  try {
    localStorage.setItem(LESSONS_KEY, JSON.stringify(current))
  } catch {
    /* gäller bara den här sessionen */
  }
  listeners.forEach((l) => l())
}

function update(id: string, fn: (p: LessonProgress) => LessonProgress) {
  current = { ...current, [id]: { ...fn(current[id] ?? { checks: [] }), updatedAt: Date.now() } }
  commit()
  markDirty('doc', `lesson:${id}`)
}

export const markSeen = (id: string) => update(id, (p) => ({ ...p, seen: Date.now() }))
export const markDone = (id: string, done: boolean) => update(id, (p) => ({ ...p, done: done ? Date.now() : undefined, doneChangedAt: Date.now() }))
export const markCheck = (id: string, index: number) => update(id, (p) => (p.checks.includes(index) ? p : { ...p, checks: [...p.checks, index] }))

export function useLessonProgress(): Store {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

/* ---------- Synk ---------- */

export const lessonIds = () => Object.keys(current)
export const lessonDoc = (id: string) => (current[id] ? { data: current[id], updatedAt: current[id].updatedAt ?? current[id].seen ?? 1 } : null)

/**
 * Ändringar från en annan enhet. Klarade testfrågor slås ihop, ”senast öppnad” tar det
 * senaste, och ”klar” följer den enhet som senast ändrade just det.
 */
export function applyRemoteLesson(id: string, remote: LessonProgress, updatedAt: number) {
  const local = current[id]
  const localAt = local?.updatedAt ?? local?.seen ?? 0
  const remoteDoneWins = (remote.doneChangedAt ?? 0) > (local?.doneChangedAt ?? 0)
  const merged: LessonProgress = {
    checks: [...new Set([...(local?.checks ?? []), ...(remote.checks ?? [])])].sort((a, b) => a - b),
    seen: Math.max(local?.seen ?? 0, remote.seen ?? 0) || undefined,
    done: remoteDoneWins ? remote.done : local?.done,
    doneChangedAt: Math.max(local?.doneChangedAt ?? 0, remote.doneChangedAt ?? 0) || undefined,
    updatedAt: Math.max(localAt, updatedAt),
  }
  if (JSON.stringify(merged) === JSON.stringify(local)) return
  current = { ...current, [id]: merged }
  commit()
}

export function clearLessonProgress() {
  current = {}
  commit()
}
