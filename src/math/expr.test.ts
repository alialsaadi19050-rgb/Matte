import { describe, expect, it } from 'vitest'
import { evalAt, evalLog10, evalNumber, precisionOf, prepareExpr, roundsTo } from './expr.ts'

describe('facitvärden', () => {
  it('räknar ut kombinatorik', () => {
    expect(evalNumber('combinations(10,3)')).toBe(120)
    expect(evalNumber('factorial(7)')).toBe(5040)
    expect(evalNumber('4*combinations(13,4)*combinations(13,3)^3')).toBe(66905856160)
  })

  it('hanterar tal större än vad ett vanligt flyttal klarar (blandade 21c)', () => {
    const big = evalLog10('64^200')
    expect(big.sign).toBe(1)
    expect(big.log10).toBeCloseTo(200 * Math.log10(64), 9)
  })

  it('ser hur noga facit avrundat', () => {
    expect(precisionOf('0.09')).toEqual({ kind: 'decimals', digits: 2 })
    expect(precisionOf('0,996')).toEqual({ kind: 'decimals', digits: 3 })
    expect(precisionOf('1.3e30')).toEqual({ kind: 'significant', digits: 2 })
    expect(precisionOf('6.35e11')).toEqual({ kind: 'significant', digits: 3 })
  })

  it('kontrollerar avrundning', () => {
    expect(roundsTo(0.0906, '0.09')).toBe(true)
    expect(roundsTo(0.0956, '0.09')).toBe(false)
    expect(roundsTo(1.326e30, '1.3e30')).toBe(true)
    expect(roundsTo(1.36e30, '1.3e30')).toBe(false)
    expect(roundsTo(1 / 6724520, '0.00000015')).toBe(true)
  })

  it('tolkar elevens skrivsätt', () => {
    expect(prepareExpr('2,5 · 3', [], { decimalComma: true })).toBe('2.5 * 3')
    expect(prepareExpr('1 200 000')).toBe('1200000')
    expect(prepareExpr('n(n−1)', ['n'])).toBe('n*(n-1)')
    expect(evalAt('n(n-1)(n-2)/6', ['n'], { n: 10 })).toBe(120)
    expect(evalAt('(n-1)! * (n-1)', ['n'], { n: 5 })).toBe(96)
    expect(evalAt('3x^2*y', ['x', 'y'], { x: 2, y: 5 })).toBe(60)
  })
})
