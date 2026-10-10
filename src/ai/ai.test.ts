import { describe, expect, it } from 'vitest'
import { describeTask } from './ai.ts'
import type { Exercise } from '../content/types.ts'

const ex: Exercise = {
  id: '1104',
  number: '1104',
  chapter: 1,
  section: '1.1',
  level: 'a',
  page: 10,
  facitPage: 300,
  prompt: 'På hur många sätt kan $5$ personer ställa sig i kö?',
  parts: [{ label: null, answer: { type: 'number', value: 120 } as never, facit: '$120$' }],
}

describe('describeTask', () => {
  it('tar med uppgift, facit och elevens svar', () => {
    const t = describeTask({ ex, part: ex.parts[0], attempts: [{ input: '25', status: 'incorrect' }], feedback: { status: 'incorrect', message: 'Inte riktigt.' }, solved: false, facitShown: false })
    expect(t).toContain('Uppgift 1104')
    expect(t).toContain('Bokens facit: $120$')
    expect(t).toContain('1. 25 – fel')
    expect(t).toContain('avslöja inte slutsvaret')
  })
  it('säger när eleven har sett facit', () => {
    const t = describeTask({ ex, part: ex.parts[0], attempts: [], solved: false, facitShown: true })
    expect(t).toContain('Eleven har inte svarat än.')
    expect(t).toContain('tittat på facit')
  })
})
