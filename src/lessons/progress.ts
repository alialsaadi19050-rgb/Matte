// Hur långt du kommit i genomgångarna. Sparas i webbläsaren och följer med i backupen.
import { useSyncExternalStore } from 'react'

export const LESSONS_KEY = 'matte.lessons.v1'

export interface LessonProgress {
  /** När du markerade genomgången som klar (ms). */
  done?: number
  /** Index för testfrågor du svarat rätt på. */
  checks: number[]
  /** Senast du öppnade genomgången (ms). */
  seen?: number
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

function update(id: string, fn: (p: LessonProgress) => LessonProgress) {
  current = { ...current, [id]: fn(current[id] ?? { checks: [] }) }
  try {
    localStorage.setItem(LESSONS_KEY, JSON.stringify(current))
  } catch {
    /* gäller bara den här sessionen */
  }
  listeners.forEach((l) => l())
}

export const markSeen = (id: string) => update(id, (p) => ({ ...p, seen: Date.now() }))
export const markDone = (id: string, done: boolean) => update(id, (p) => ({ ...p, done: done ? Date.now() : undefined }))
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
