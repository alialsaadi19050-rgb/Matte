// Miniräknarens uträkning: tar det du skrivit (med decimalkomma, ×, ÷, √, π,
// nCr, nPr, Ans …) och räknar ut det med mathjs.
import { math } from '../math/expr.ts'

export type Angle = 'deg' | 'rad'

export interface CalcResult {
  value: number
  /** Resultatet formaterat på svenska, t.ex. ”0,1875” eller ”1,3263·10³⁰”. */
  text: string
  /** Exakt bråk när resultatet är rationellt, t.ex. ”3/16”. */
  fraction?: string
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }

export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : 'Ej definierat'
  if (v === 0) return '0'
  const abs = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (Number.isInteger(v) && abs < 1e15) {
    return sign + String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  }
  if (abs >= 1e12 || abs < 1e-6) {
    const [m, e] = abs.toExponential(9).split('e')
    const mant = m.replace(/\.?0+$/, '').replace('.', ',')
    return `${sign}${mant}·10${[...String(Number(e))].map((c) => SUP[c]).join('')}`
  }
  return sign + Number(abs.toPrecision(12)).toString().replace('.', ',')
}

/** Skriver om det inskrivna till mathjs-syntax. */
export function prepare(input: string, ans: number | null): string {
  let s = input
    .normalize('NFC')
    .replace(/[×·⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√\s*(\d+(?:[.,]\d+)?)/g, 'sqrt($1)')
    .replace(/√/g, 'sqrt')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    // Decimalkomma – men inte kommatecknet mellan argumenten i t.ex. combinations(52,13).
    .replace(/(\d),(\d)/g, (m, a: string, b: string, i: number, all: string) => (/(?:combinations|permutations|nthRoot|max|min|gcd|lcm)\s*\([^)]*$/.test(all.slice(0, i)) ? m : `${a}.${b}`))
    .replace(/(\d)\s+(?=\d{3}\b)/g, '$1')
    .replace(/\bAns\b/gi, ans === null ? 'NaN' : `(${ans})`)
    .replace(/%/g, '/100')
    .replace(/\blg\s*\(/g, 'log10(')
    .replace(/\blog\s*\(/g, 'log10(')
    .replace(/\bln\s*\(/g, 'log(')
  // 10 nCr 3 → combinations(10, 3)
  s = s.replace(/(\d+(?:\.\d+)?|\([^()]*\))\s*nCr\s*(\d+(?:\.\d+)?|\([^()]*\))/g, 'combinations($1,$2)')
  s = s.replace(/(\d+(?:\.\d+)?|\([^()]*\))\s*nPr\s*(\d+(?:\.\d+)?|\([^()]*\))/g, 'permutations($1,$2)')
  // Stäng parenteser som glömts, som på en vanlig räknare.
  const open = (s.match(/\(/g) ?? []).length - (s.match(/\)/g) ?? []).length
  if (open > 0) s += ')'.repeat(open)
  return s
}

const toRad = (x: number) => (x * Math.PI) / 180
const toDeg = (x: number) => (x * 180) / Math.PI

export function calculate(input: string, opts: { angle: Angle; ans: number | null }): CalcResult | { error: string } {
  if (!input.trim()) return { error: '' }
  const deg = opts.angle === 'deg'
  const scope = {
    sin: (x: number) => Math.sin(deg ? toRad(x) : x),
    cos: (x: number) => Math.cos(deg ? toRad(x) : x),
    tan: (x: number) => Math.tan(deg ? toRad(x) : x),
    asin: (x: number) => (deg ? toDeg(Math.asin(x)) : Math.asin(x)),
    acos: (x: number) => (deg ? toDeg(Math.acos(x)) : Math.acos(x)),
    atan: (x: number) => (deg ? toDeg(Math.atan(x)) : Math.atan(x)),
  }
  let value: number
  try {
    const raw = math.evaluate(prepare(input, opts.ans), scope)
    value = typeof raw === 'number' ? raw : Number(raw)
  } catch (e) {
    const msg = (e as Error).message
    return { error: /Undefined symbol/.test(msg) ? 'Okänt tecken eller namn.' : 'Uttrycket går inte att räkna ut.' }
  }
  if (Number.isNaN(value)) return { error: opts.ans === null && /ans/i.test(input) ? 'Det finns inget tidigare svar än.' : 'Ej definierat.' }
  // Rätta små avrundningsfel, t.ex. sin(30°) = 0,49999999999999994.
  if (Math.abs(value - Math.round(value * 1e12) / 1e12) < 1e-15 * Math.max(1, Math.abs(value))) value = Math.round(value * 1e12) / 1e12
  const result: CalcResult = { value, text: formatNumber(value) }
  if (Number.isFinite(value) && !Number.isInteger(value) && Math.abs(value) < 1e9) {
    try {
      const f = math.fraction(value) as unknown as { n: number | bigint; d: number | bigint; s: number | bigint }
      const n = Number(f.n) * Number(f.s)
      const d = Number(f.d)
      if (d > 1 && d <= 100000 && Math.abs(n / d - value) < 1e-12) result.fraction = `${n < 0 ? '−' : ''}${Math.abs(n)}/${d}`
    } catch {
      /* inget bråk */
    }
  }
  return result
}
