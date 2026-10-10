// Uppgifter du har sparat för att gå tillbaka till senare. Sparas i webbläsaren, följer med i
// backupen och synkas mellan enheter.
import { useSyncExternalStore } from 'react'
import { markDirty } from '../sync/changes.ts'

export const BOOKMARKS_KEY = 'matte.bookmarks.v1'
/** När ett bokmärke togs bort, så att borttagningen också når andra enheter. */
const REMOVED_KEY = 'matte.bookmarks.removed.v1'

/** Uppgiftens id → när den sparades (ms). */
export type Bookmarks = Record<string, number>

function read(key: string): Bookmarks {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Bookmarks
  } catch {
    return {}
  }
}

let current = read(BOOKMARKS_KEY)
let removed = read(REMOVED_KEY)
const listeners = new Set<() => void>()

function commit() {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(current))
    localStorage.setItem(REMOVED_KEY, JSON.stringify(removed))
  } catch {
    /* gäller bara den här sessionen */
  }
  listeners.forEach((l) => l())
}

export function toggleBookmark(id: string) {
  const now = Date.now()
  current = { ...current }
  removed = { ...removed }
  if (current[id]) {
    delete current[id]
    removed[id] = now
  } else {
    current[id] = now
    delete removed[id]
  }
  commit()
  markDirty('doc', `bookmark:${id}`)
}

export function useBookmarks(): Bookmarks {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

/** Sparade uppgifter, senast sparad först. */
export const savedFirst = <T extends { id: string }>(items: T[], b: Bookmarks) => items.filter((e) => b[e.id]).sort((x, y) => b[y.id] - b[x.id])

/* ---------- Synk ---------- */

export const bookmarkIds = () => [...new Set([...Object.keys(current), ...Object.keys(removed)])]

export function bookmarkDoc(id: string) {
  if (current[id]) return { updatedAt: current[id], deleted: false }
  if (removed[id]) return { updatedAt: removed[id], deleted: true }
  return null
}

/** Ändringar från en annan enhet. Den senaste ändringen vinner. */
export function applyRemoteBookmark(id: string, updatedAt: number, deleted: boolean) {
  const local = current[id] ?? removed[id] ?? 0
  if (updatedAt <= local) return
  current = { ...current }
  removed = { ...removed }
  if (deleted) {
    delete current[id]
    removed[id] = updatedAt
  } else {
    current[id] = updatedAt
    delete removed[id]
  }
  commit()
}

export function clearBookmarks() {
  current = {}
  removed = {}
  commit()
}
