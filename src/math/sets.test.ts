import { describe, expect, it } from 'vitest'
import { compareSetExprs, parseSetExpr, SetSyntaxError } from './sets.ts'

const abc = { sets: ['A', 'B', 'C'] }

describe('mängduttryck', () => {
  it('godkänner bokens svar och likvärdiga skrivsätt (1230a)', () => {
    expect(compareSetExprs('A ∩ (B ∪ C)', 'A ∩ (B ∪ C)', abc).ok).toBe(true)
    expect(compareSetExprs('(A ∩ B) ∪ (A ∩ C)', 'A ∩ (B ∪ C)', abc).ok).toBe(true)
    expect(compareSetExprs('A n (B u C)', 'A ∩ (B ∪ C)', abc).ok).toBe(true)
    expect(compareSetExprs('A & (B | C)', 'A ∩ (B ∪ C)', abc).ok).toBe(true)
  })

  it('underkänner fel område', () => {
    expect(compareSetExprs('A ∩ B', 'A ∩ (B ∪ C)', abc)).toEqual({ ok: false, reason: 'different' })
    expect(compareSetExprs('A ∪ (B ∩ C)', 'A ∩ (B ∪ C)', abc).ok).toBe(false)
  })

  it('hanterar differens och komplement (1230b, blandade 3)', () => {
    expect(compareSetExprs('A \\ (B ∪ C)', 'A \\ (B ∪ C)', abc).ok).toBe(true)
    expect(compareSetExprs('A ∩ ∁B ∩ ∁C', 'A \\ (B ∪ C)', abc).ok).toBe(true)
    expect(compareSetExprs("A ∩ (B ∪ C)'", 'A \\ (B ∪ C)', abc).ok).toBe(true)
    expect(compareSetExprs('B - A', 'B \\ A', { sets: ['A', 'B'] }).ok).toBe(true)
    expect(compareSetExprs('∁A ∩ ∁B', '∁(A ∪ B)', { sets: ['A', 'B'] }).ok).toBe(true)
    expect(compareSetExprs('~(A u B)', '∁(A ∪ B)', { sets: ['A', 'B'] }).ok).toBe(true)
  })

  it('tar hänsyn till villkor i uppgiften (1222)', () => {
    const ctx = { sets: ['P', 'Q', 'R'] }
    expect(compareSetExprs('P', 'P', { ...ctx, constraints: ['P ⊆ R'] }).ok).toBe(true)
    expect(compareSetExprs('P ∩ (Q ∪ R)', 'P', { ...ctx, constraints: ['P ⊆ R'] }).ok).toBe(true)
    expect(compareSetExprs('P ∩ Q', 'P', { ...ctx, constraints: ['P ⊆ R'] }).ok).toBe(false)
    expect(compareSetExprs('P ∩ Q', 'P ∩ Q', { ...ctx, constraints: ['R = ∅'] }).ok).toBe(true)
    expect(compareSetExprs('P ∩ R', 'P ∩ Q', { ...ctx, constraints: ['Q = R'] }).ok).toBe(true)
  })

  it('använder grundmängden (1233)', () => {
    const ctx = { sets: ['Q', 'Z'], universe: 'C', constraints: ['Z ⊆ Q'] }
    expect(compareSetExprs('C \\ Q', 'C \\ Q', ctx).ok).toBe(true)
    expect(compareSetExprs('∁Q', 'C \\ Q', ctx).ok).toBe(true)
    expect(compareSetExprs('ℚ \\ ℤ', 'Q \\ Z', ctx).ok).toBe(true)
    expect(compareSetExprs('Z', 'Z', ctx).ok).toBe(true)
    expect(compareSetExprs('Q', 'Z', ctx).ok).toBe(false)
  })

  it('kvadrater är B ∩ C i fyrhörningsdiagrammet (1232b)', () => {
    const ctx = { sets: ['A', 'B', 'C', 'D'], universe: 'G', constraints: ['B ⊆ A', 'C ⊆ A', 'A ∩ D = ∅'] }
    expect(compareSetExprs('B ∩ C', 'B ∩ C', ctx).ok).toBe(true)
    expect(compareSetExprs('A ∩ B ∩ C', 'B ∩ C', ctx).ok).toBe(true)
    expect(compareSetExprs('B', 'B ∩ C', ctx).ok).toBe(false)
  })

  it('säger till om okända mängder och syntaxfel', () => {
    expect(compareSetExprs('A ∩ X', 'A', abc)).toEqual({ ok: false, reason: 'unknown-set', names: ['X'] })
    expect(compareSetExprs('A ∩ (B', 'A', abc).ok).toBe(false)
    expect(() => parseSetExpr('A ∩')).toThrow(SetSyntaxError)
    expect(() => parseSetExpr('')).toThrow(SetSyntaxError)
  })

  it('∩ binder hårdare än ∪', () => {
    expect(compareSetExprs('A ∪ B ∩ C', 'A ∪ (B ∩ C)', abc).ok).toBe(true)
    expect(compareSetExprs('A ∪ B ∩ C', '(A ∪ B) ∩ C', abc).ok).toBe(false)
  })
})
