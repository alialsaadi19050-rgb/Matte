// Synkar framsteg mellan enheter via Supabase: försök, skrivytor, bokmärken och genomgångar.
// Allt sparas först lokalt; synken hämtar och skickar i bakgrunden när det finns nät.
//
// Servern når bara funktionerna sync_pull och sync_push. De kontrollerar en hemlighet som
// härleds ur ditt lösenord i webbläsaren, så lösenordet lämnar aldrig enheten.
import { useSyncExternalStore } from 'react'
import { db, type Attempt } from '../storage/db.ts'
import type { Drawing } from '../canvas/types.ts'
import { applyRemoteBookmark, bookmarkDoc, bookmarkIds, clearBookmarks } from '../bookmarks/bookmarks.ts'
import { applyRemoteLesson, clearLessonProgress, lessonDoc, lessonIds, type LessonProgress } from '../lessons/progress.ts'
import { clearDirty, readDirty, replaceDirty, setChangeListener, type Dirty } from './changes.ts'

// Projektets publika adress och publiceringsnyckel. De är gjorda för att ligga i webbläsaren:
// tabellerna går inte att läsa direkt, bara via funktionerna som kräver hemligheten.
const URL = 'https://vdiodkpjtylqzelujokw.supabase.co/rest/v1/rpc'
const KEY = 'sb_publishable_YVyQGrd-cmdmfsI7q9C5hQ_Udho8-oU'

const STATE_KEY = 'matte.sync.v1'
/** Satt efter en återställd backup: skicka upp allt igen. */
export const FULL_UPLOAD_KEY = 'matte.sync.full'

export interface SyncCreds {
  /** Inloggningens id (hash av användarnamnet). */
  user: string
  secret: string
}

interface SyncState {
  /** Vems data som finns lokalt i den här webbläsaren. */
  owner?: string
  cursor: number
  /** När datan senast raderades (från servern). Nyare radering → rensa lokalt. */
  resetAt?: number
}

export type SyncStatus = { kind: 'off' } | { kind: 'syncing' } | { kind: 'ok'; at: number } | { kind: 'offline' } | { kind: 'error'; message: string }

/* ---------- Status ---------- */

let status: SyncStatus = { kind: 'off' }
const listeners = new Set<() => void>()
function setStatus(s: SyncStatus) {
  status = s
  listeners.forEach((l) => l())
}
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
  )
}

function readState(): SyncState {
  try {
    return { cursor: 0, ...(JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as Partial<SyncState>) }
  } catch {
    return { cursor: 0 }
  }
}
function writeState(s: SyncState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s))
  } catch {
    /* nästa synk börjar om från början, vilket är ofarligt */
  }
}

/* ---------- Anrop ---------- */

async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${URL}/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(res.status === 403 ? 'Synkinloggningen stämmer inte. Logga ut och in igen.' : `Synken misslyckades (${res.status}${err.message ? `: ${err.message}` : ''}).`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

/* ---------- Lokala ändringar ---------- */

type Doc = { key: string; data: unknown; updatedAt: number; deleted?: boolean }

async function docFor(key: string): Promise<Doc | null> {
  const [kind, ...rest] = key.split(':')
  const id = rest.join(':')
  if (kind === 'drawing') {
    const d = await db.drawings.get(id)
    return d ? { key, data: d, updatedAt: d.updatedAt } : null
  }
  if (kind === 'bookmark') {
    const b = bookmarkDoc(id)
    return b ? { key, data: null, updatedAt: b.updatedAt, deleted: b.deleted } : null
  }
  if (kind === 'lesson') {
    const l = lessonDoc(id)
    return l ? { key, data: l.data, updatedAt: l.updatedAt } : null
  }
  return null
}

/** Allt som finns lokalt, för första uppladdningen från en enhet. */
async function everything(): Promise<Dirty> {
  const attempts = (await db.attempts.toArray()).flatMap((a) => (a.uid ? [a.uid] : []))
  const drawings = (await db.drawings.toCollection().primaryKeys()).map((id) => `drawing:${id}`)
  return { attempts, docs: [...drawings, ...bookmarkIds().map((id) => `bookmark:${id}`), ...lessonIds().map((id) => `lesson:${id}`)] }
}

/* ---------- Ändringar från andra enheter ---------- */

async function applyRemote(attempts: Attempt[], docs: Doc[]) {
  if (attempts.length) {
    const uids = attempts.map((a) => a.uid!).filter(Boolean)
    const have = new Set((await db.attempts.where('uid').anyOf(uids).toArray()).map((a) => a.uid))
    const fresh = attempts.filter((a) => a.uid && !have.has(a.uid)).map(({ id: _id, ...a }) => a)
    if (fresh.length) await db.attempts.bulkAdd(fresh)
  }
  for (const d of docs) {
    const [kind, ...rest] = d.key.split(':')
    const id = rest.join(':')
    if (kind === 'drawing' && !d.deleted && d.data) {
      const local = await db.drawings.get(id)
      if (!local || local.updatedAt < d.updatedAt) await db.drawings.put(d.data as Drawing)
    } else if (kind === 'bookmark') {
      applyRemoteBookmark(id, d.updatedAt, !!d.deleted)
    } else if (kind === 'lesson' && d.data) {
      applyRemoteLesson(id, d.data as LessonProgress, d.updatedAt)
    }
  }
}

/* ---------- Själva synken ---------- */

let creds: SyncCreds | null = null
let running: Promise<void> | null = null
let again = false
let timer: ReturnType<typeof setTimeout> | undefined
let interval: ReturnType<typeof setInterval> | undefined

/** Skickar i lagom stora paket så att stora skrivytor inte blir för tunga anrop. */
function batches(docs: Doc[], max = 1_500_000): Doc[][] {
  const out: Doc[][] = []
  let cur: Doc[] = []
  let size = 0
  for (const d of docs) {
    const s = JSON.stringify(d).length
    if (cur.length && size + s > max) {
      out.push(cur)
      cur = []
      size = 0
    }
    cur.push(d)
    size += s
  }
  if (cur.length) out.push(cur)
  return out
}

async function runOnce(c: SyncCreds) {
  if (!navigator.onLine) return setStatus({ kind: 'offline' })
  setStatus({ kind: 'syncing' })
  const state = readState()

  // 1. Hämta först, så att det som slås ihop lokalt också skickas tillbaka.
  type Pull = { attempts: Attempt[]; docs: Doc[]; cursor: number; resetAt?: number }
  // Lite marginal bakåt: att hämta något två gånger är ofarligt, att missa något är det inte.
  const pulled = await rpc<Pull>('sync_pull', { p_user: c.user, p_secret: c.secret, p_since: Math.max(0, state.cursor - 200) })
  // Har datan raderats från en annan enhet sedan förra synken? Rensa här också, och ladda inte upp något.
  if ((pulled.resetAt ?? 0) > (state.resetAt ?? 0)) {
    await wipeLocal()
    writeState({ owner: c.user, cursor: 0, resetAt: pulled.resetAt })
    return setStatus({ kind: 'ok', at: Date.now() })
  }
  await applyRemote(pulled.attempts, pulled.docs)

  // 2. Skicka det som ändrats här.
  const dirty = readDirty()
  if (dirty.attempts.length || dirty.docs.length) {
    const attempts = (await db.attempts.where('uid').anyOf(dirty.attempts).toArray()).map(({ id: _id, ...a }) => a)
    const docs = (await Promise.all(dirty.docs.map(docFor))).filter((d): d is Doc => !!d)
    for (let i = 0; i < Math.max(1, attempts.length); i += 500) {
      const part = attempts.slice(i, i + 500)
      if (part.length) await rpc('sync_push', { p_user: c.user, p_secret: c.secret, p_attempts: part, p_docs: [] })
    }
    for (const part of batches(docs)) await rpc('sync_push', { p_user: c.user, p_secret: c.secret, p_attempts: [], p_docs: part })
    clearDirty(dirty)
  }

  writeState({ ...readState(), owner: c.user, cursor: Math.max(state.cursor, pulled.cursor), resetAt: Math.max(state.resetAt ?? 0, pulled.resetAt ?? 0) })
  setStatus({ kind: 'ok', at: Date.now() })
}

/** Rensar framstegen i den här webbläsaren (inte inställningar, färger eller nycklar). */
async function wipeLocal() {
  await db.transaction('rw', db.attempts, db.drawings, async () => {
    await db.attempts.clear()
    await db.drawings.clear()
  })
  clearBookmarks()
  clearLessonProgress()
  replaceDirty({ attempts: [], docs: [] })
  try {
    sessionStorage.removeItem('matte.redo.session.v1')
  } catch {
    /* ingen lagring */
  }
}

/**
 * Raderar all din data: framsteg, skrivytor, bokmärken och genomgångar, här och på
 * synkservern. Dina andra enheter rensas vid sin nästa synk.
 */
export async function deleteAllData(): Promise<void> {
  if (creds) {
    const t = await rpc<number>('sync_reset', { p_user: creds.user, p_secret: creds.secret })
    await wipeLocal()
    writeState({ owner: creds.user, cursor: 0, resetAt: t })
  } else {
    await wipeLocal()
  }
}

/** Synkar nu (eller strax, om en synk redan pågår). */
export function syncNow(): Promise<void> {
  if (!creds) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  const c = creds
  running = (async () => {
    try {
      do {
        again = false
        await runOnce(c)
      } while (again && creds === c)
    } catch (e) {
      setStatus(navigator.onLine ? { kind: 'error', message: (e as Error).message } : { kind: 'offline' })
    } finally {
      running = null
    }
  })()
  return running
}

const soon = () => {
  clearTimeout(timer)
  timer = setTimeout(syncNow, 2500)
}
const onVisible = () => document.visibilityState === 'visible' && syncNow()

/**
 * Startar synken efter inloggning. Har någon annan använt den här webbläsaren rensas deras
 * lokala data först, så att framstegen inte blandas ihop mellan konton.
 */
export async function startSync(c: SyncCreds) {
  stopSync()
  const state = readState()
  if (state.owner && state.owner !== c.user) {
    await db.transaction('rw', db.attempts, db.drawings, async () => {
      await db.attempts.clear()
      await db.drawings.clear()
    })
    clearBookmarks()
    clearLessonProgress()
    replaceDirty({ attempts: [], docs: [] })
    writeState({ owner: c.user, cursor: 0 })
  } else if (!state.owner || localStorage.getItem(FULL_UPLOAD_KEY)) {
    // Första gången på den här enheten (eller efter en återställd backup): skicka upp allt.
    replaceDirty(await everything())
    localStorage.removeItem(FULL_UPLOAD_KEY)
    writeState({ owner: c.user, cursor: state.owner === c.user ? state.cursor : 0 })
  }
  creds = c
  setChangeListener(soon)
  addEventListener('online', syncNow)
  document.addEventListener('visibilitychange', onVisible)
  interval = setInterval(() => document.visibilityState === 'visible' && syncNow(), 45_000)
  await syncNow()
}

export function stopSync() {
  creds = null
  setChangeListener(null)
  clearTimeout(timer)
  clearInterval(interval)
  removeEventListener('online', syncNow)
  document.removeEventListener('visibilitychange', onVisible)
  setStatus({ kind: 'off' })
}
