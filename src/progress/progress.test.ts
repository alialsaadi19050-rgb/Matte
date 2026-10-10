import { describe, expect, it } from 'vitest'
import type { Exercise } from '../content/types.ts'
import type { Attempt } from '../storage/db.ts'
import { computeProgress, recommend } from './progress.ts'

const ex = (id: string, parts = 1, section = '1.1'): Exercise => ({
  id,
  number: id,
  chapter: 1,
  section,
  level: 'a',
  page: 1,
  facitPage: 2,
  prompt: '',
  parts: Array.from({ length: parts }, (_, i) => ({ label: parts > 1 ? 'abc'[i] : null, answer: { type: 'self' }, facit: '' })),
})
const NOW = new Date(2026, 9, 10, 15).getTime()
const DAY = 86_400_000
const at = (id: string, part: number, status: Attempt['status'], t: number, self = false): Attempt => ({ exerciseId: id, part, label: null, input: '', status, self, hintUsed: false, at: t })

describe('framsteg', () => {
  const list = [ex('1'), ex('2', 2), ex('3'), ex('4'), ex('5', 1, '1.2')]
  it('status per uppgift', () => {
    const p = computeProgress(
      list,
      [at('1', 0, 'correct', NOW), at('2', 0, 'correct', NOW), at('3', 0, 'incorrect', NOW), at('3', 0, 'incorrect', NOW), at('3', 0, 'partial', NOW), at('5', 0, 'incorrect', NOW, true)],
      [{ exerciseId: '4', strokes: [{} as never], updatedAt: NOW }],
      NOW,
    )
    expect(p.byExercise['1'].status).toBe('correct')
    expect(p.byExercise['2']).toMatchObject({ status: 'attempted', done: 0.5 })
    expect(p.byExercise['3'].status).toBe('missed')
    expect(p.byExercise['4'].status).toBe('attempted')
    expect(p.byExercise['5'].status).toBe('missed')
    expect(p.solvedTotal).toBe(1)
  })

  it('dagar i rad, veckan och träffsäkerhet', () => {
    const p = computeProgress(list, [at('1', 0, 'incorrect', NOW - 2 * DAY), at('1', 0, 'correct', NOW - DAY), at('3', 0, 'correct', NOW), at('5', 0, 'correct', NOW - 10 * DAY)], [], NOW)
    expect(p.streakDays).toBe(3)
    expect(p.solvedThisWeek).toBe(2)
    expect(p.week).toEqual([0, 0, 0, 0, 0, 1, 1])
    // 1: fel först, 3: rätt först, 5: rätt först → 2 av 3
    expect(p.accuracy).toBeCloseTo(2 / 3)
    expect(p.sections.find((s) => s.section === '1.2')).toMatchObject({ solved: 1, accuracy: 1 })
  })

  it('räknar dagar i rad även om du inte räknat idag än', () => {
    const p = computeProgress(list, [at('1', 0, 'correct', NOW - DAY), at('2', 0, 'correct', NOW - 2 * DAY)], [], NOW)
    expect(p.streakDays).toBe(2)
  })

  it('föreslår påbörjad uppgift först, sedan nästa nya', () => {
    const p = computeProgress(list, [at('1', 0, 'correct', NOW - DAY), at('2', 0, 'correct', NOW)], [], NOW)
    expect(recommend(list, p).id).toBe('2')
    const q = computeProgress(list, [at('1', 0, 'correct', NOW)], [], NOW)
    expect(recommend(list, q).id).toBe('2')
    const empty = computeProgress(list, [], [], NOW)
    expect(recommend(list, empty).id).toBe('1')
  })
})
