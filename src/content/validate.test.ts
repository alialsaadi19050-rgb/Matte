import { describe, expect, it } from 'vitest'
import type { Exercise } from './types.ts'
import { validateExercise } from './validate.ts'

const base = (parts: Exercise['parts'], extra: Partial<Exercise> = {}): Exercise => ({
  id: '9999',
  number: '9999',
  chapter: 1,
  section: '1.2',
  level: 'a',
  page: 1,
  facitPage: 2,
  prompt: 'Skriv med mängdbyggaren',
  parts,
  ...extra,
})
const part = (label: string, prompt = '', figures?: Exercise['figures']) => ({ label, prompt, figures, answer: { type: 'self' as const }, facit: 'x' })
const venn = { kind: 'venn' as const, alt: 'B', spec: { width: 100, height: 100, shapes: [] } }
const messages = (e: Exercise) => validateExercise(e).map((i) => `${i.level}: ${i.where} ${i.message}`)

describe('kontroller som fångar avskrivningsfel', () => {
  it('en tom deluppgift utan figur är ett fel (så som 1207 a var)', () => {
    expect(messages(base([part('a'), part('b', '$A = \\{5, 10\\}$')])).some((m) => m.includes('9999a') && m.includes('tom'))).toBe(true)
  })

  it('en deluppgift med egen figur är okej', () => {
    expect(messages(base([part('a', '', [venn]), part('b', 'text')]))).toEqual([])
  })

  it('bokstäver som hoppar över någon upptäcks', () => {
    expect(messages(base([part('a', 'x'), part('c', 'y')])).some((m) => m.includes('saknas någon'))).toBe(true)
  })

  it('text som nämner en figur som saknas ger en varning', () => {
    expect(messages(base([part('a', 'Beskriv den färgade delen av Venndiagrammet')])).some((m) => m.startsWith('warning') && m.toLowerCase().includes('venndiagrammet'))).toBe(true)
  })
})
