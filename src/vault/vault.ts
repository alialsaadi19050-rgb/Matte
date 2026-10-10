// Inloggningen. Bokens innehåll ligger krypterat i vault.bin och går bara att läsa med rätt
// användarnamn och lösenord. Nyckeln (inte lösenordet) sparas i webbläsarens IndexedDB som en
// nyckel som inte går att exportera, så du förblir inloggad tills du loggar ut.
//
// I utvecklingsläget (npm run dev) läses de okrypterade filerna i public/content direkt.
import { useSyncExternalStore } from 'react'
import { decryptVault, deriveKey, parseVault } from './crypto.ts'

export type VaultStatus = 'checking' | 'locked' | 'open'

const PLAIN = import.meta.env.DEV
let status: VaultStatus = PLAIN ? 'open' : 'checking'
let files: Record<string, string> | null = null
const listeners = new Set<() => void>()

function set(s: VaultStatus) {
  status = s
  listeners.forEach((l) => l())
}

export function useVaultStatus(): VaultStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
  )
}

/* ---------- Den sparade nyckeln ---------- */

function keyStore<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('matte-auth', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('keys')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const tx = open.result.transaction('keys', mode)
      const req = run(tx.objectStore('keys'))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => open.result.close()
    }
  })
}

const saveKey = (key: CryptoKey) => keyStore('readwrite', (s) => s.put(key, 'vault'))
const loadKey = () => keyStore<CryptoKey | undefined>('readonly', (s) => s.get('vault'))
const forgetKey = () => keyStore('readwrite', (s) => s.delete('vault'))

/* ---------- Inloggning ---------- */

async function fetchVault(): Promise<Uint8Array> {
  const res = await fetch(`${import.meta.env.BASE_URL}vault.bin`)
  if (!res.ok) throw new Error(`Kunde inte hämta innehållet (${res.status}).`)
  return new Uint8Array(await res.arrayBuffer())
}

/** Försöker öppna med den sparade nyckeln när appen startar. */
export async function restoreSession(): Promise<void> {
  if (PLAIN) return
  try {
    const key = await loadKey()
    if (key) {
      files = (await decryptVault(await fetchVault(), key)).files
      return set('open')
    }
  } catch {
    // Fel nyckel (t.ex. nytt lösenord) eller ingen lagring: logga in igen.
    await forgetKey().catch(() => {})
  }
  set('locked')
}

export async function login(user: string, password: string): Promise<void> {
  let bytes: Uint8Array
  try {
    bytes = await fetchVault()
  } catch {
    throw new Error(navigator.onLine ? 'Kunde inte hämta innehållet. Försök igen.' : 'Du är offline. Första inloggningen kräver internet.')
  }
  const key = await deriveKey(user, password, parseVault(bytes).salt)
  try {
    files = (await decryptVault(bytes, key)).files
  } catch {
    throw new Error('Fel användarnamn eller lösenord.')
  }
  await saveKey(key).catch(() => {
    /* utan lagring får du logga in varje gång */
  })
  set('open')
}

export async function logout(): Promise<void> {
  files = null
  await forgetKey().catch(() => {})
  set('locked')
}

/** Läser en fil under content/, t.ex. "data/index.json" eller "figures/venn.svg". */
export async function contentText(path: string): Promise<string> {
  if (PLAIN) {
    const res = await fetch(`${import.meta.env.BASE_URL}content/${path}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Kunde inte läsa ${path} (${res.status})`)
    return res.text()
  }
  const text = files?.[path]
  if (text === undefined) throw new Error(files ? `Hittar inte ${path}` : 'Du är inte inloggad.')
  return text
}
