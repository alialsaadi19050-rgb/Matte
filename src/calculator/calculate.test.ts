import { describe, expect, it } from 'vitest'
import { calculate, formatNumber } from './calculate.ts'

const calc = (s: string, ans: number | null = null, angle: 'deg' | 'rad' = 'deg') => calculate(s, { angle, ans })
const text = (s: string, ans: number | null = null, angle: 'deg' | 'rad' = 'deg') => {
  const r = calc(s, ans, angle)
  return 'error' in r ? `FEL: ${r.error}` : r.text
}

describe('miniräknaren', () => {
  it('räknar med decimalkomma och svenska tecken', () => {
    expect(text('2,5 × 4')).toBe('10')
    expect(text('7 ÷ 2')).toBe('3,5')
    expect(text('10 − 3,25')).toBe('6,75')
    expect(text('0,1 + 0,2')).toBe('0,3')
  })
  it('potenser, rötter och fakultet', () => {
    expect(text('2^10')).toBe('1 024')
    expect(text('3²')).toBe('9')
    expect(text('√(16)')).toBe('4')
    expect(text('√16')).toBe('4')
    expect(text('7!')).toBe('5 040')
    expect(text('30!/200')).toBe('1,326264299·10³⁰')
  })
  it('kombinatorik', () => {
    expect(text('10 nCr 3')).toBe('120')
    expect(text('9 nPr 3')).toBe('504')
    expect(text('combinations(52,13)')).toBe('635 013 559 600')
    expect(text('(32 nCr 3)/(70 nCr 3)')).toBe('0,0906101571063')
  })
  it('vinklar i grader eller radianer', () => {
    expect(text('sin(30)')).toBe('0,5')
    expect(text('cos(60)')).toBe('0,5')
    expect(text('asin(0,5)')).toBe('30')
    expect(text('sin(π/2)', null, 'rad')).toBe('1')
  })
  it('logaritmer, procent och π', () => {
    expect(text('lg(1000)')).toBe('3')
    expect(text('ln(e)')).toBe('1')
    expect(text('25%')).toBe('0,25')
    expect(text('2π')).toBe('6,28318530718')
  })
  it('Ans och glömda parenteser', () => {
    expect(text('Ans × 2', 21)).toBe('42')
    expect(text('Ans + 1')).toBe('FEL: Det finns inget tidigare svar än.')
    expect(text('√(2·8')).toBe('4')
  })
  it('visar exakta bråk', () => {
    const r = calc('12/64')
    expect('error' in r ? null : r.fraction).toBe('3/16')
    const s = calc('1/3 + 1/6')
    expect('error' in s ? null : s.fraction).toBe('1/2')
    const p = calc('π')
    expect('error' in p ? null : p.fraction).toBeUndefined()
  })
  it('felmeddelanden', () => {
    expect(text('2 + ')).toMatch(/FEL/)
    expect(text('hej')).toMatch(/FEL/)
    expect(text('1/0')).toBe('∞')
  })
  it('formatering', () => {
    expect(formatNumber(-0.000000123)).toBe('−1,23·10⁻⁷')
    expect(formatNumber(1234567)).toBe('1 234 567')
  })
})
