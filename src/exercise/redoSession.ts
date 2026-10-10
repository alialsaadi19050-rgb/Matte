// Repetition: gå igenom uppgifterna du fått fel på, en i taget. Varje uppgift börjar om
// automatiskt (med tom skrivyta) när du kommer till den. Gäller bara den här fliken.
const KEY = 'matte.redo.session.v1'

export interface RedoSession {
  queue: string[]
  /** Uppgifter som redan har börjats om i den här repetitionen. */
  started: string[]
}

export function getRedoSession(): RedoSession | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as RedoSession | null
  } catch {
    return null
  }
}

function save(s: RedoSession | null) {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s))
    else sessionStorage.removeItem(KEY)
  } catch {
    /* utan lagring fungerar repetitionen bara på första uppgiften */
  }
}

export function startRedoSession(ids: string[]) {
  save({ queue: ids, started: [] })
  location.hash = `#/uppgift/${encodeURIComponent(ids[0])}`
}

export function markRedoStarted(id: string) {
  const s = getRedoSession()
  if (s && !s.started.includes(id)) save({ ...s, started: [...s.started, id] })
}

export const endRedoSession = () => save(null)
