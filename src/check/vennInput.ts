// Logiken bakom att svara med ett Venndiagram: var cirklarna ligger, vilket område en punkt
// hör till, och hur de skuggade områdena blir ett mängduttryck som rättas som vanligt.
import { evalSet, parseSetExpr } from '../math/sets.ts'

export const VENN_W = 300
export const VENN_H = 210
export const VENN_INSET = 6

export interface VennCircle {
  cx: number
  cy: number
  r: number
  /** Var bokstaven står. */
  lx: number
  ly: number
}

/**
 * Cirklarnas placering. Med två cirklar följer layouten uppgiftens villkor:
 * ”B ⊆ A” ritar B inuti A och ”A ∩ B = ∅” ritar dem åtskilda.
 */
export function vennLayout(labels: string[], constraints: string[] = []): VennCircle[] {
  const c = (cx: number, cy: number, r: number, lx: number, ly: number): VennCircle => ({ cx, cy, r, lx, ly })
  if (labels.length === 1) return [c(150, 108, 72, 150, 52)]
  if (labels.length === 2) {
    const [a, b] = labels
    for (const k of constraints) {
      const m = /^\s*([A-ZÅÄÖ])\s*[⊆⊂]\s*([A-ZÅÄÖ])\s*$/.exec(k)
      if (m && ((m[1] === a && m[2] === b) || (m[1] === b && m[2] === a))) {
        // Den inre mängden ritas mindre, inuti den yttre.
        const inner = m[1] === a ? 0 : 1
        const outer = c(150, 108, 82, 96, 52)
        const innerC = c(170, 118, 40, 170, 104)
        return inner === 0 ? [innerC, outer] : [outer, innerC]
      }
      const d = /^\s*([A-ZÅÄÖ])\s*∩\s*([A-ZÅÄÖ])\s*=\s*∅\s*$/.exec(k)
      if (d && [d[1], d[2]].sort().join() === [a, b].sort().join()) return [c(84, 110, 56, 84, 64), c(216, 110, 56, 216, 64)]
    }
    return [c(116, 108, 64, 86, 56), c(184, 108, 64, 214, 56)]
  }
  return [c(120, 86, 56, 90, 46), c(180, 86, 56, 210, 46), c(150, 138, 56, 150, 180)]
}

/** Området för en punkt: en bit per cirkel, t.ex. ”10” = i första men inte andra. Null utanför rektangeln. */
export function regionAt(x: number, y: number, circles: VennCircle[]): string | null {
  if (x < VENN_INSET || y < VENN_INSET || x > VENN_W - VENN_INSET || y > VENN_H - VENN_INSET) return null
  return circles.map((k) => ((x - k.cx) ** 2 + (y - k.cy) ** 2 <= k.r ** 2 ? '1' : '0')).join('')
}

/** De skuggade områdena som mängduttryck, t.ex. ”(A ∩ ∁B) ∪ (A ∩ B)”. Inget skuggat blir ∅. */
export function regionsToExpr(labels: string[], keys: Iterable<string>): string {
  const terms = [...keys]
    .filter((k) => k.length === labels.length)
    .sort()
    .reverse()
    .map((k) => labels.map((l, i) => (k[i] === '1' ? l : `∁${l}`)).join(' ∩ '))
  if (!terms.length) return '∅'
  return terms.length === 1 ? terms[0] : terms.map((t) => (labels.length > 1 ? `(${t})` : t)).join(' ∪ ')
}

/** Alla områden för n cirklar, inklusive området utanför alla. */
export const allRegions = (n: number) => Array.from({ length: 2 ** n }, (_, i) => i.toString(2).padStart(n, '0'))

/** Tillbaka från ett uttryck till skuggade områden (för att visa ett sparat svar). */
export function exprToRegions(expr: string, labels: string[]): Set<string> {
  try {
    const tree = parseSetExpr(expr)
    return new Set(allRegions(labels.length).filter((k) => evalSet(tree, (name) => k[labels.indexOf(name)] === '1')))
  } catch {
    return new Set()
  }
}
