// Framsteg och statistik, uträknade från dina sparade försök och anteckningar.
import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import type { Exercise } from '../content/types.ts'
import { db, type Attempt } from '../storage/db.ts'
import type { Drawing } from '../canvas/types.ts'

export type Status = 'new' | 'attempted' | 'correct' | 'missed'

export interface ExerciseProgress {
  status: Status
  /** Andel lösta deluppgifter, 0–1. */
  done: number
  /** Senaste aktivitet (försök eller anteckning). */
  lastAt: number
  /** När sista deluppgiften blev löst. */
  solvedAt?: number
}

export interface SectionStats {
  section: string
  total: number
  solved: number
  /** Andel deluppgifter som blev rätt på första försöket, bland de du försökt. */
  accuracy: number | null
}

export interface Progress {
  byExercise: Record<string, ExerciseProgress>
  streakDays: number
  /** Antal uppgifter som blev helt lösta de senaste sju dagarna. */
  solvedThisWeek: number
  /** Rätt på första försöket, alla deluppgifter du försökt. */
  accuracy: number | null
  /** Antal rätta deluppgifter per dag, de senaste sju dagarna (äldst först). */
  week: number[]
  sections: SectionStats[]
  solvedTotal: number
}

const DAY = 86_400_000
const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
const startOfDay = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Ren funktion så att den går att testa. */
export function computeProgress(exercises: Exercise[], attempts: Attempt[], drawings: Pick<Drawing, 'exerciseId' | 'strokes' | 'updatedAt'>[], now = Date.now()): Progress {
  const byEx = new Map<string, Attempt[]>()
  for (const a of attempts) {
    const list = byEx.get(a.exerciseId) ?? []
    list.push(a)
    byEx.set(a.exerciseId, list)
  }
  const drawn = new Map(drawings.filter((d) => d.strokes.length).map((d) => [d.exerciseId, d.updatedAt]))

  const byExercise: Record<string, ExerciseProgress> = {}
  let firstTries = 0
  let firstCorrect = 0
  const sectionFirst = new Map<string, { tries: number; correct: number }>()

  for (const ex of exercises) {
    const list = (byEx.get(ex.id) ?? []).sort((a, b) => a.at - b.at)
    const lastAt = Math.max(list.at(-1)?.at ?? 0, drawn.get(ex.id) ?? 0)
    let solvedParts = 0
    let missedPart = false
    let solvedAt = 0
    ex.parts.forEach((_, i) => {
      const mine = list.filter((a) => a.part === i)
      if (!mine.length) return
      const sec = sectionFirst.get(ex.section) ?? { tries: 0, correct: 0 }
      sec.tries++
      firstTries++
      if (mine[0].status === 'correct') {
        sec.correct++
        firstCorrect++
      }
      sectionFirst.set(ex.section, sec)
      const win = mine.find((a) => a.status === 'correct')
      if (win) {
        solvedParts++
        solvedAt = Math.max(solvedAt, win.at)
      } else if (mine.filter((a) => a.status !== 'correct').length >= 3 || mine.some((a) => a.self && a.status === 'incorrect')) {
        missedPart = true
      }
    })
    const done = solvedParts / ex.parts.length
    const status: Status = done === 1 ? 'correct' : missedPart ? 'missed' : lastAt ? 'attempted' : 'new'
    byExercise[ex.id] = { status, done, lastAt, solvedAt: done === 1 ? solvedAt : undefined }
  }

  // Dagar i rad: räknas bakåt från idag (eller igår, om du inte hunnit räkna idag än).
  const activeDays = new Set([...attempts.map((a) => dayKey(a.at)), ...[...drawn.values()].map(dayKey)])
  let streak = 0
  let day = startOfDay(now)
  if (!activeDays.has(dayKey(day))) day -= DAY
  while (activeDays.has(dayKey(day))) {
    streak++
    day -= DAY
  }

  const weekStart = startOfDay(now) - 6 * DAY
  const week = Array.from({ length: 7 }, (_, i) => {
    const from = weekStart + i * DAY
    return attempts.filter((a) => a.status === 'correct' && a.at >= from && a.at < from + DAY).length
  })

  const sectionIds = [...new Set(exercises.map((e) => e.section))]
  const sections = sectionIds.map((section) => {
    const list = exercises.filter((e) => e.section === section)
    const f = sectionFirst.get(section)
    return { section, total: list.length, solved: list.filter((e) => byExercise[e.id].status === 'correct').length, accuracy: f && f.tries ? f.correct / f.tries : null }
  })

  const values = Object.values(byExercise)
  return {
    byExercise,
    streakDays: streak,
    solvedThisWeek: values.filter((p) => p.solvedAt && p.solvedAt >= weekStart).length,
    accuracy: firstTries ? firstCorrect / firstTries : null,
    week,
    sections,
    solvedTotal: values.filter((p) => p.status === 'correct').length,
  }
}

/** Framstegen uppdateras automatiskt när du gör ett nytt försök. */
export function useProgress(exercises: Exercise[] | undefined): Progress | null {
  const [progress, setProgress] = useState<Progress | null>(null)
  useEffect(() => {
    if (!exercises) return
    const sub = liveQuery(async () => {
      const [attempts, drawings] = await Promise.all([db.attempts.toArray(), db.drawings.toArray()])
      return computeProgress(exercises, attempts, drawings)
    }).subscribe({ next: setProgress, error: () => setProgress(computeProgress(exercises, [], [])) })
    return () => sub.unsubscribe()
  }, [exercises])
  return progress
}

/** Uppgiften som hjälteytan föreslår: påbörjad, annars nästa nya, annars en missad. */
export function recommend(exercises: Exercise[], p: Progress): Exercise {
  const started = exercises.filter((e) => p.byExercise[e.id].status === 'attempted').sort((a, b) => p.byExercise[b.id].lastAt - p.byExercise[a.id].lastAt)
  if (started[0]) return started[0]
  const lastTouched = [...exercises].sort((a, b) => p.byExercise[b.id].lastAt - p.byExercise[a.id].lastAt)[0]
  const from = lastTouched && p.byExercise[lastTouched.id].lastAt ? exercises.indexOf(lastTouched) : 0
  const next = [...exercises.slice(from), ...exercises.slice(0, from)].find((e) => p.byExercise[e.id].status === 'new')
  return next ?? exercises.find((e) => p.byExercise[e.id].status === 'missed') ?? exercises[0]
}
