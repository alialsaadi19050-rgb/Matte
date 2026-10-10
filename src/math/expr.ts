// Hjälpfunktioner kring mathjs för tal och uttryck i facit.
import { create, all, type MathJsInstance } from 'mathjs'

export const math: MathJsInstance = create(all, {})
/** Instans med godtycklig precision för stora tal som 64^200 och 52 över 13. */
export const bigMath: MathJsInstance = create(all, { number: 'BigNumber', precision: 64 })

/**
 * Skriver om ett uttryck så att mathjs tolkar det som en elev menar:
 * ·/× blir *, − blir -, och en variabel direkt före en parentes betyder
 * multiplikation (n(n-1) är inte ett funktionsanrop). Med `decimalComma`
 * (för det eleven skriver) blir 2,5 till 2.5 – i lagrade facitvärden är
 * kommatecken i stället argumentavgränsare, t.ex. combinations(10,3).
 */
export function prepareExpr(src: string, variables: string[] = [], opts: { decimalComma?: boolean } = {}): string {
  let s = src
    .normalize('NFC')
    .replace(/[·×⋅]/g, '*')
    .replace(/[−–]/g, '-')
    .replace(/(\d)\s+(?=\d{3}\b)/g, '$1')
  if (opts.decimalComma) s = s.replace(/(\d),(\d)/g, '$1.$2')
  for (const v of variables) {
    s = s.replace(new RegExp(`(^|[^A-Za-z_])${v}\\s*\\(`, 'g'), `$1${v}*(`)
  }
  return s
}

/** Räknar ut ett facitvärde som ett vanligt tal. */
export function evalNumber(src: string): number {
  const v = math.evaluate(prepareExpr(src))
  return typeof v === 'number' ? v : Number(v)
}

/** Räknar ut ett facitvärde med hög precision. Returnerar log10 av beloppet och tecknet. */
export function evalLog10(src: string): { sign: number; log10: number } {
  const v = bigMath.evaluate(prepareExpr(src))
  const big = bigMath.bignumber(v as never) as unknown as { isZero(): boolean; isNegative(): boolean; abs(): { log(base: number): { toNumber(): number } } }
  if (big.isZero()) return { sign: 0, log10: -Infinity }
  return { sign: big.isNegative() ? -1 : 1, log10: big.abs().log(10).toNumber() }
}

/** Antal decimaler eller värdesiffror som ett avrundat facitvärde anger. */
export function precisionOf(approx: string): { kind: 'decimals' | 'significant'; digits: number } {
  const s = approx.replace(',', '.').trim()
  const sci = /^-?(\d+)(?:\.(\d+))?e[+-]?\d+$/i.exec(s)
  if (sci) return { kind: 'significant', digits: sci[1].replace(/^0+/, '').length + (sci[2]?.length ?? 0) }
  const dec = /^-?\d+(?:\.(\d+))?$/.exec(s)
  if (!dec) throw new Error(`Kan inte läsa avrundat värde ”${approx}”`)
  return { kind: 'decimals', digits: dec[1]?.length ?? 0 }
}

/** Ligger `value` inom avrundningen av `approx`? (t.ex. 0,0906 och "0.09") */
export function roundsTo(value: number, approx: string): boolean {
  const a = Number(approx.replace(',', '.'))
  const p = precisionOf(approx)
  if (p.kind === 'decimals') return Math.abs(value - a) <= 0.5 * 10 ** -p.digits + 1e-12
  const exp = Math.floor(Math.log10(Math.abs(a)))
  return Math.abs(value - a) <= 0.5 * 10 ** (exp - p.digits + 1) * (1 + 1e-9)
}

/** Räknar ut ett uttryck med variabler i en given punkt. */
export function evalAt(src: string, variables: string[], point: Record<string, number>): number {
  const v = math.evaluate(prepareExpr(src, variables), point)
  return typeof v === 'number' ? v : Number(v)
}
