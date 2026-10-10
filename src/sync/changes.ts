// Kö över lokala ändringar som inte har skickats till synkservern än. Ligger i en egen liten
// modul så att lagringskoden kan anmäla ändringar utan att ladda själva synken.

const KEY = 'matte.sync.dirty.v1'

export interface Dirty {
  /** Försökens uid. */
  attempts: string[]
  /** Dokumentnycklar, t.ex. "drawing:1104", "bookmark:1104", "lesson:permutationer". */
  docs: string[]
}

export function readDirty(): Dirty {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Dirty | null
    return { attempts: d?.attempts ?? [], docs: d?.docs ?? [] }
  } catch {
    return { attempts: [], docs: [] }
  }
}

function write(d: Dirty) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    /* ingen lagring: ändringen synkas vid nästa fulla uppladdning */
  }
}

let onChange: (() => void) | null = null
/** Synken registrerar sig här för att få veta när något ändrats. */
export const setChangeListener = (fn: (() => void) | null) => (onChange = fn)

export function markDirty(kind: 'attempt' | 'doc', key: string) {
  const d = readDirty()
  const list = kind === 'attempt' ? d.attempts : d.docs
  if (!list.includes(key)) list.push(key)
  write(d)
  onChange?.()
}

/** Tar bort det som skickats. Ändringar som kommit under tiden ligger kvar. */
export function clearDirty(sent: Dirty) {
  const d = readDirty()
  write({ attempts: d.attempts.filter((k) => !sent.attempts.includes(k)), docs: d.docs.filter((k) => !sent.docs.includes(k)) })
}

export const replaceDirty = (d: Dirty) => write(d)
