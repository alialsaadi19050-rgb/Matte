// Uppgifter du har sparat för att gå tillbaka till senare. Sparas i webbläsaren och följer med i backupen.
import { useSyncExternalStore } from 'react'

export const BOOKMARKS_KEY = 'matte.bookmarks.v1'

/** Uppgiftens id → när den sparades (ms). */
export type Bookmarks = Record<string, number>

function load(): Bookmarks {
  try {
    return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) ?? '{}') as Bookmarks
  } catch {
    return {}
  }
}

let current = load()
const listeners = new Set<() => void>()

export function toggleBookmark(id: string) {
  const next = { ...current }
  if (next[id]) delete next[id]
  else next[id] = Date.now()
  current = next
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(current))
  } catch {
    /* gäller bara den här sessionen */
  }
  listeners.forEach((l) => l())
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
