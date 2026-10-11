import { describe, expect, it } from 'vitest'
import { checkAnswer } from './check.ts'
import { exprToRegions, regionAt, regionsToExpr, vennLayout } from './vennInput.ts'

describe('Venndiagram som svar', () => {
  it('hittar rätt område för en punkt', () => {
    const c = vennLayout(['A', 'B'])
    expect(regionAt(150, 108, c)).toBe('11')
    expect(regionAt(70, 108, c)).toBe('10')
    expect(regionAt(230, 108, c)).toBe('01')
    expect(regionAt(20, 20, c)).toBe('00')
    expect(regionAt(2, 2, c)).toBeNull()
  })

  it('ritar en delmängd inuti och disjunkta mängder isär', () => {
    const sub = vennLayout(['A', 'B'], ['B ⊆ A'])
    expect(regionAt(sub[1].cx, sub[1].cy, sub)).toBe('11')
    const dis = vennLayout(['A', 'B'], ['A ∩ B = ∅'])
    expect(regionAt(150, 110, dis)).toBe('00')
  })

  it('skuggning blir ett uttryck som rättas som vanligt', () => {
    const labels = ['A', 'B', 'C']
    const expr = regionsToExpr(labels, ['110', '101', '111'])
    expect(checkAnswer({ type: 'set-expression', value: 'A ∩ (B ∪ C)', sets: labels }, expr).status).toBe('correct')
    expect(checkAnswer({ type: 'set-expression', value: '∁(A ∪ B ∪ C)', sets: labels }, regionsToExpr(labels, ['000'])).status).toBe('correct')
    expect(regionsToExpr(['A', 'B'], [])).toBe('∅')
  })

  it('ett sparat uttryck ger tillbaka samma skuggning', () => {
    expect([...exprToRegions('(A ∩ B ∩ ∁C) ∪ (A ∩ ∁B ∩ C) ∪ (A ∩ B ∩ C)', ['A', 'B', 'C'])].sort()).toEqual(['101', '110', '111'])
  })
})
