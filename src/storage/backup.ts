// Backup av allt du gjort: försök, anteckningar, inställningar och färger.
import { db, type Attempt } from './db.ts'
import type { Drawing } from '../canvas/types.ts'

const LOCAL_KEYS = ['matte.settings.v1', 'matte.theme.v2', 'matte.bookmarks.v1', 'matte.lessons.v1']

export interface Backup {
  app: 'matte'
  version: 1
  exportedAt: string
  attempts: Attempt[]
  drawings: Drawing[]
  local: Record<string, string>
}

export async function createBackup(): Promise<Blob> {
  const [attempts, drawings] = await Promise.all([db.attempts.toArray(), db.drawings.toArray()])
  const local: Record<string, string> = {}
  for (const k of LOCAL_KEYS) {
    try {
      const v = localStorage.getItem(k)
      if (v !== null) local[k] = v
    } catch {
      /* ingen lagring */
    }
  }
  const backup: Backup = { app: 'matte', version: 1, exportedAt: new Date().toISOString(), attempts, drawings, local }
  return new Blob([JSON.stringify(backup)], { type: 'application/json' })
}

export interface BackupSummary {
  attempts: number
  drawings: number
  exportedAt: string
}

export async function readBackup(file: File): Promise<{ backup: Backup; summary: BackupSummary }> {
  let data: Backup
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('Filen är inte en giltig backup (kunde inte läsa JSON).')
  }
  if (data?.app !== 'matte' || data.version !== 1 || !Array.isArray(data.attempts) || !Array.isArray(data.drawings)) {
    throw new Error('Filen är inte en backup från den här appen.')
  }
  return { backup: data, summary: { attempts: data.attempts.length, drawings: data.drawings.length, exportedAt: data.exportedAt } }
}

/** Ersätter allt som finns nu med innehållet i backupen. */
export async function restoreBackup(b: Backup): Promise<void> {
  await db.transaction('rw', db.attempts, db.drawings, async () => {
    await db.attempts.clear()
    await db.drawings.clear()
    await db.attempts.bulkAdd(b.attempts.map(({ id: _id, ...a }) => a))
    await db.drawings.bulkPut(b.drawings)
  })
  for (const [k, v] of Object.entries(b.local ?? {})) {
    if (LOCAL_KEYS.includes(k)) {
      try {
        localStorage.setItem(k, v)
      } catch {
        /* ingen lagring */
      }
    }
  }
}
