// Rättar ett svar mot facit. Förlåtande mot skrivsätt (decimalkomma, mellanslag,
// enheter som ”sätt”), men noga med matematiken. Ger ett konkret tips när svaret
// nästan är rätt.
import type { MathNode } from 'mathjs'
import type { Answer, ChoiceAnswer, ExpressionAnswer, InequalityAnswer, ListAnswer, NumberAnswer, SetAnswer, SetExpressionAnswer } from '../content/types.ts'
import { evalLog10, evalNumber, math, precisionOf, roundsTo } from '../math/expr.ts'
import { compareSetExprs, evalSet, parseSetExpr, regions } from '../math/sets.ts'

export type CheckStatus = 'correct' | 'partial' | 'incorrect' | 'invalid'

export interface CheckResult {
  status: CheckStatus
  /** Kort besked på svenska. */
  message: string
  /** Riktat tips när svaret är nära. */
  hint?: string
}

const ok = (message = 'Rätt!'): CheckResult => ({ status: 'correct', message })
const partial = (message: string, hint?: string): CheckResult => ({ status: 'partial', message, hint })
const wrong = (hint?: string, message = 'Inte riktigt.'): CheckResult => ({ status: 'incorrect', message, hint })
const invalid = (message: string): CheckResult => ({ status: 'invalid', message })

/* ---------- Städning av inmatningen ---------- */

const SUPERSCRIPT: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' }

/** Gemensam städning: unicode-tecken, upphöjt, mellanslag. */
export function tidy(raw: string): string {
  return raw
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => '^' + [...m].map((c) => SUPERSCRIPT[c]).join(''))
    .normalize('NFC')
    .replace(/[   ]/g, ' ')
    .replace(/[−–—]/g, '-')
    .replace(/[·×⋅∙]/g, '*')
    .replace(/÷/g, '/')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/…/g, '...')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*(\d+(?:[.,]\d+)?)/g, 'sqrt($1)')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tar bort mellanslag mellan tusental: 26 098 → 26098, 1 200 000 → 1200000. */
const joinThousands = (s: string) => s.replace(/(\d)[ ](?=\d{3}(?!\d))/g, '$1')

const FUNCTION_NAMES = ['sqrt', 'nthRoot', 'binom', 'combinations', 'permutations', 'factorial', 'pi', 'exp', 'log', 'ln', 'abs', 'Infinity']

/**
 * Gör multiplikation tydlig för mathjs: 3x^2y → 3x^2*y, n(n-1) → n*(n-1),
 * (n-1)!(n-1) → (n-1)!*(n-1).
 */
export function explicitMultiplication(s: string, variables: string[]): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    const rest = s.slice(i)
    const fn = FUNCTION_NAMES.find((f) => rest.startsWith(f) && !/[a-zA-Z]/.test(rest[f.length] ?? ''))
    if (fn) {
      out += fn
      i += fn.length
      continue
    }
    const m = /^[a-zA-ZåäöÅÄÖ]+/.exec(rest)
    if (m) {
      const word = m[0]
      const isVars = [...word].every((c) => variables.includes(c))
      if (isVars && /[\d)!a-zA-Z]$/.test(out.trimEnd())) out = out.trimEnd() + '*'
      out += isVars ? [...word].join('*') : word
      i += word.length
      continue
    }
    out += s[i]
    i++
  }
  // Variabel eller ) eller ! eller siffra direkt före ( eller en variabel.
  const v = variables.join('')
  if (v) out = out.replace(new RegExp(`([${v}])\\s*\\(`, 'g'), '$1*(')
  return out
    .replace(/\)\s*\(/g, ')*(')
    .replace(/!\s*(?=[(\w])/g, '!*')
    .replace(new RegExp(`\\)\\s*(?=[\\d${v}])`, 'g'), ')*')
}

/** Byter C(n,k), P(n,k) och binom(n,k) till mathjs-funktioner. */
const combinatorics = (s: string) =>
  s
    .replace(/\bbinom\s*\(/g, 'combinations(')
    .replace(/\bC\s*\(/g, 'combinations(')
    .replace(/\bP\s*\(/g, 'permutations(')
    .replace(/\bnCr\b/g, 'combinations')

/* ---------- Tal ---------- */

interface ParsedNumber {
  value: number
  /** För tal som inte får plats i ett vanligt flyttal. */
  log?: { sign: number; log10: number }
  percent: boolean
  /** Antal decimaler eller värdesiffror, om svaret är ett avrundat decimaltal. */
  precision?: { kind: 'decimals' | 'significant'; digits: number }
  /** Svaret är en uträkning (t.ex. 7! eller C(10,3)) och inte ett färdigt tal. */
  unevaluated: boolean
}

export function parseNumber(raw: string, noun?: string, variable?: string): ParsedNumber | { error: string } {
  let s = tidy(raw).replace(/\.$/, '')
  s = s.replace(/^(?:≈|ca\.?|cirka)\s*/i, '')
  // ”x = 26 098” → ”26 098”
  const v = variable ? new RegExp(`^${variable}\\s*=\\s*`) : /^[a-zA-Z]\s*=\s*/
  s = s.replace(v, '').replace(/^=\s*/, '')
  // Ord efter talet, t.ex. ”sätt”, ”cyklar”, ”st”.
  for (let k = 0; k < 3; k++) {
    const t = s.replace(/\s*[a-zA-ZåäöÅÄÖ]{2,}\.?$/u, (w) => (FUNCTION_NAMES.some((f) => w.trim().startsWith(f)) ? w : ''))
    if (t === s) break
    s = t
  }
  if (noun) s = s.replace(new RegExp(`\\s*${noun}$`, 'i'), '')
  s = s.replace(/\s*(?:≈.*)$/, '').trim()
  const percent = /%$/.test(s)
  s = s.replace(/\s*%$/, '')
  // Decimalkomma, men inte kommatecknet mellan argumenten i C(10,3).
  s = joinThousands(s).replace(/(\d),(\d)/g, (m, a: string, b: string, i: number, all: string) => (/[A-Za-z]\s*\([^)]*$/.test(all.slice(0, i)) ? m : `${a}.${b}`))
  if (!s) return { error: 'Skriv ett tal.' }
  const withoutKnown = s.replace(/(\d)e([+-]?\d)/gi, '$1$2').replace(/\b(?:sqrt|nthRoot|binom|C|P|pi|combinations|permutations)\b/g, '')
  if (/[a-zA-ZåäöÅÄÖ]/.test(withoutKnown)) {
    return { error: 'Svaret ska vara ett tal.' }
  }
  const unevaluated = /!|\bbinom\b|\bC\s*\(|\bP\s*\(/.test(s)
  const expr = combinatorics(s).replace(/\s*\*\s*10\s*\^\s*\(?\s*([+-]?\d+)\s*\)?/g, 'e$1')
  let precision: ParsedNumber['precision']
  if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(expr)) {
    try {
      precision = precisionOf(expr)
    } catch {
      /* inget avrundat decimaltal */
    }
  }
  try {
    const value = evalNumber(expr)
    if (Number.isFinite(value)) return { value: percent ? value / 100 : value, percent, precision, unevaluated }
    const log = evalLog10(expr)
    return { value, log, percent, precision, unevaluated }
  } catch {
    return { error: 'Jag kan inte läsa talet. Skriv t.ex. 120, 3/16 eller 0,25.' }
  }
}

const near = (a: number, b: number, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b))

/** Lika inom ungefär 2 % – nog för att känna igen ett avrundat svar. */
const roughly = (a: number, b: number) => Math.abs(a - b) <= 0.02 * Math.max(Math.abs(a), Math.abs(b)) + 1e-12

function numberHint(u: number, t: number, decimal: boolean): string | undefined {
  if (t !== 0 && roughly(u, -t)) return 'Kolla tecknet – du har rätt belopp men fel tecken.'
  if (t !== 0 && Math.abs(t) < 1 && roughly(u, t * 100)) return 'Svarar du i procent? Skriv då ett %-tecken efter, eller svara som decimaltal.'
  if (t !== 0 && roughly(u, t / 100)) return 'Det ser ut som att du delat med 100 en gång för mycket.'
  if (t > 0 && t < 1 && Math.abs(t - 0.5) > 0.02 && roughly(u, 1 - t)) return 'Det där är sannolikheten för den motsatta händelsen. Vad är det uppgiften frågar efter?'
  if (Number.isInteger(t) && Number.isInteger(u) && t > 0 && u > 0) {
    for (const k of [2, 6, 24, 120]) {
      if (u === t * k) return 'Ditt svar är för stort med en faktor ' + k + '. Spelar ordningen någon roll här?'
      if (t === u * k) return 'Ditt svar är för litet med en faktor ' + k + '. Ska ordningen räknas med?'
    }
    if (Math.abs(u - t) === 1) return 'Nästan – du är bara en ifrån. Kolla gränsfallen.'
  }
  if (t !== 0 && Math.abs(u - t) / Math.abs(t) < 0.03) return decimal ? 'Nära! Kontrollera avrundningen eller räkna med fler decimaler.' : 'Nära! Kontrollera uträkningen en gång till.'
  return undefined
}

export function checkNumber(a: NumberAnswer, raw: string): CheckResult {
  const p = parseNumber(raw, a.noun, a.variable)
  if ('error' in p) return invalid(p.error)

  for (const alt of a.alsoAccept ?? []) {
    if (near(p.value, evalNumber(alt))) return ok('Rätt – det här svaret godkänns, men facit säger något annat. Se granskningen.')
  }

  const t = evalNumber(a.value)
  // Väldigt stora tal: jämför logaritmen.
  if (!Number.isFinite(t) || (p.log && !Number.isFinite(p.value))) {
    const tl = evalLog10(a.value)
    const ul = p.log ?? { sign: Math.sign(p.value), log10: Math.log10(Math.abs(p.value)) }
    if (tl.sign === ul.sign && Math.abs(tl.log10 - ul.log10) < 1e-9) return ok()
    return wrong()
  }
  const u = p.value

  if (near(u, t)) {
    if (p.unevaluated && Number.isInteger(t)) return partial('Rätt uträkning!', `Räkna också ut talet – svaret är ett heltal.`)
    return ok()
  }

  // Avrundade svar: inom facits noggrannhet, eller korrekt avrundat med minst lika många siffror som facit.
  const facitPrecision = a.approx ? precisionOf(a.approx) : null
  const userRoundsRight = p.precision && roundsTo(t, String(u))
  if (a.approx) {
    if (roundsTo(u, a.approx) || near(u, Number(a.approx), 1e-12)) return ok()
    if (userRoundsRight) {
      if (p.precision && facitPrecision && p.precision.kind === facitPrecision.kind && p.precision.digits < facitPrecision.digits) {
        return partial('Rätt avrundat, men för grovt.', `Ange svaret med fler siffror, som facit: ${a.approx.replace('.', ',')}.`)
      }
      return ok()
    }
  } else if (userRoundsRight && p.precision) {
    // Exakt facit (t.ex. 1/6) men eleven svarar med ett avrundat decimaltal.
    const sig = String(Math.abs(u)).replace('.', '').replace(/^0+/, '').length
    if (sig >= 2) return ok('Rätt! (Exakt: ' + a.value.replace('.', ',') + ')')
    return partial('Rätt avrundat, men för grovt.', 'Ange minst två värdesiffror – eller svara exakt som ett bråk.')
  }
  return wrong(numberHint(u, t, !!p.precision))
}

/* ---------- Uttryck ---------- */

function samplePoints(variables: string[], integers: boolean): Record<string, number>[] {
  const pts: Record<string, number>[] = []
  for (let k = 0; k < 8; k++) {
    pts.push(Object.fromEntries(variables.map((v, i) => [v, integers ? 4 + ((k * 3 + i * 5) % 7) : 1.13 + ((k * 0.731 + i * 1.377) % 2.6)])))
  }
  return pts
}

const strip = (n: MathNode): MathNode => (n.type === 'ParenthesisNode' ? strip((n as unknown as { content: MathNode }).content) : n)
const isOp = (n: MathNode, ...ops: string[]) => n.type === 'OperatorNode' && ops.includes((n as unknown as { fn: string }).fn)
const args = (n: MathNode) => ((n as unknown as { args?: MathNode[] }).args ?? []).map(strip)
const hasVariable = (n: MathNode) => n.filter((x) => x.type === 'SymbolNode').length > 0

/** Inga parenteser med summor som multipliceras eller upphöjs. */
export function isExpanded(node: MathNode): boolean {
  let expanded = true
  node.traverse((n) => {
    const s = strip(n)
    if (isOp(s, 'multiply', 'pow', 'divide')) {
      const [first, ...rest] = args(s)
      const parts = isOp(s, 'pow') ? [first] : isOp(s, 'divide') ? [first] : [first, ...rest]
      if (parts.some((p) => isOp(p, 'add', 'subtract') && hasVariable(p))) expanded = false
    }
  })
  return expanded
}

/** Uttrycket är en produkt (eller potens) på högsta nivån. */
export function isFactored(node: MathNode): boolean {
  let n = strip(node)
  if (isOp(n, 'unaryMinus')) n = args(n)[0]
  if (isOp(n, 'multiply')) return args(n).filter((a) => hasVariable(a)).length >= 2 || args(n).some((a) => a.type === 'OperatorNode' && isOp(a, 'factorial'))
  if (isOp(n, 'pow')) return true
  return false
}

/**
 * I mattefältet hamnar det man skriver efter en exponent lätt i exponenten: 15x⁴y blir
 * x^(4y). Ett tal följt av variabler i exponenten (x^(4y), x^(3y^2)) är nästan alltid det
 * misstaget, så det läses som x^4·y.
 */
export function liftStuckExponents(s: string, variables: string[]): string {
  if (!variables.length) return s
  const v = variables.map((x) => x.replace(/[^a-zA-Z]/g, '')).join('')
  const stuck = new RegExp(String.raw`\^\((\d+)\s*\*?\s*((?:[${v}](?:\^\d+)?\s*\*?\s*)+)\)`, 'g')
  return s.replace(stuck, (_m, exp: string, rest: string) => `^${exp}*${rest.trim().replace(/\*$/, '')}`)
}

/** Facit har en variabel i någon exponent, t.ex. 2^n – då ska inget läsas om. */
const hasVarExponent = (t: string) => [...t.matchAll(/\^\s*(?:\(([^)]*)\)|([A-Za-z0-9.]+))/g)].some((m) => /[a-zA-Z]/.test(m[1] ?? m[2]))

function parseExpr(raw: string, variables: string[], lift = true): MathNode | { error: string } {
  let s = tidy(raw).replace(/\.$/, '')
  if (lift) s = liftStuckExponents(s, variables)
  if (s.includes('=')) s = s.slice(s.lastIndexOf('=') + 1)
  s = joinThousands(s).replace(/(\d),(\d)/g, '$1.$2')
  s = combinatorics(explicitMultiplication(s, variables))
  if (!s.trim()) return { error: 'Skriv ett uttryck.' }
  try {
    const node = math.parse(s)
    // Funktionsnamn (sqrt m.fl.) är också SymbolNode, men de finns i math.
    const bad = [
      ...new Set(
        node
          .filter((n) => n.type === 'SymbolNode')
          .map((n) => (n as unknown as { name: string }).name)
          .filter((name) => !variables.includes(name) && !(name in math)),
      ),
    ]
    if (bad.length) return { error: `Uttrycket ska bara innehålla ${variables.join(', ')}. Okänt: ${bad.join(', ')}.` }
    return node
  } catch {
    return { error: 'Jag kan inte läsa uttrycket. Skriv t.ex. x^2 + 3x eller n(n-1)/2.' }
  }
}

function equivalent(a: MathNode, b: MathNode, variables: string[], integers: boolean): boolean {
  const fa = a.compile()
  const fb = b.compile()
  for (const p of samplePoints(variables, integers)) {
    const x = Number(fa.evaluate({ ...p }))
    const y = Number(fb.evaluate({ ...p }))
    if (!Number.isFinite(x) || !Number.isFinite(y) || !near(x, y, 1e-7)) return false
  }
  return true
}

export function checkExpression(a: ExpressionAnswer, raw: string): CheckResult {
  const user = parseExpr(raw, a.variables, !hasVarExponent(a.value))
  if ('error' in user) return invalid(user.error)
  const target = math.parse(combinatorics(explicitMultiplication(a.value, a.variables)))
  const integers = a.value.includes('!') || raw.includes('!')
  if (!equivalent(user, target, a.variables, integers)) {
    const negated = math.parse(`-(${target.toString()})`)
    if (equivalent(user, negated, a.variables, integers)) return wrong('Kolla tecknen – ditt uttryck är facits med omvänt tecken.')
    return wrong('Pröva att sätta in ett tal för ' + a.variables[0] + ' i både ditt uttryck och det ursprungliga och jämför.')
  }
  if (a.form === 'expanded' && !isExpanded(user)) return partial('Rätt värde!', 'Men uppgiften vill att du utvecklar uttrycket – inga parenteser kvar.')
  if (a.form === 'factored' && !isFactored(user)) return partial('Rätt värde!', 'Men uppgiften vill att du skriver det som en produkt (faktoriserar).')
  return ok()
}

/* ---------- Listor ---------- */

export function splitList(raw: string): string[] {
  let s = tidy(raw).replace(/\.$/, '')
  s = s.replace(/^\{|\}$/g, '')
  s = s.replace(/\s+(?:och|eller|samt)\s+/gi, ';')
  let parts: string[]
  // Semikolon tillsammans med decimalkomma (0,5; 2) – annars är både , och ; avgränsare.
  if (s.includes(';') && /\d,\d/.test(s)) parts = s.split(';')
  else if (s.includes(';')) parts = s.split(/[;,]/)
  else if (/\d\s*,\s*\d/.test(s) && !/[a-zA-Z]/.test(s) && !/,\s/.test(s) && !/\s/.test(s)) parts = s.split(',')
  else if (s.includes(',')) parts = s.split(',')
  else if (/^-?\d+(\s+-?\d+)+$/.test(s)) parts = s.split(/\s+/)
  else parts = [s]
  return parts.map((p) => p.trim()).filter(Boolean)
}

export function checkList(a: ListAnswer, raw: string): CheckResult {
  const res = checkListItems(a, raw)
  if (res.status === 'correct' || res.status === 'invalid') return res
  for (const items of a.alsoAccept ?? []) if (checkListItems({ ...a, items }, raw).status === 'correct') return ok()
  return res
}

function checkListItems(a: ListAnswer, raw: string): CheckResult {
  const vars = a.variables ?? []
  const items = splitList(raw)
  if (!items.length) return invalid('Skriv svaret, med kommatecken mellan delarna.')
  const targets = a.items.map((t) => math.parse(combinatorics(explicitMultiplication(t, vars))))
  const lift = !a.items.some(hasVarExponent)
  const parsed = items.map((it) => (vars.length ? parseExpr(it, vars, lift) : parseNumber(it)))
  const bad = parsed.find((p) => 'error' in p)
  if (bad && 'error' in bad) return invalid(bad.error)
  const nodes = parsed.map((p) => ('value' in p ? math.parse(String(p.value)) : (p as MathNode)))
  const same = (n: MathNode, t: MathNode) => (vars.length ? equivalent(n, t, vars, false) : near(Number(n.evaluate()), Number(t.evaluate())))

  let matched = 0
  if (a.ordered) {
    targets.forEach((t, i) => nodes[i] && same(nodes[i], t) && matched++)
  } else {
    const left = [...nodes]
    for (const t of targets) {
      const i = left.findIndex((n) => same(n, t))
      if (i >= 0) {
        matched++
        left.splice(i, 1)
      }
    }
  }
  if (matched === targets.length && nodes.length === targets.length) return ok()
  if (!a.ordered || matched < targets.length) {
    if (nodes.length !== targets.length) return wrong(`Facit har ${targets.length} delar – du har ${nodes.length}.`)
  }
  if (a.ordered && !matched && checkListItems({ ...a, ordered: false }, raw).status === 'correct') return wrong('Rätt delar, men i fel ordning.')
  return wrong(matched ? `${matched} av ${targets.length} stämmer.` : undefined)
}

/* ---------- Olikheter ---------- */

export function checkInequality(a: InequalityAnswer, raw: string): CheckResult {
  const s = joinThousands(tidy(raw)).replace(/(\d),(\d)/g, '$1.$2')
  const v = a.variable
  let m = new RegExp(`^${v}\\s*(>=|<=|>|<|=)\\s*(.+)$`).exec(s)
  let op: string
  let boundText: string
  if (m) [, op, boundText] = m
  else {
    m = new RegExp(`^(.+?)\\s*(>=|<=|>|<)\\s*${v}$`).exec(s)
    if (!m) return invalid(`Skriv en olikhet, t.ex. ${v} > 8.`)
    boundText = m[1]
    op = { '>=': '<=', '<=': '>=', '>': '<', '<': '>' }[m[2]]!
  }
  if (op === '=') return wrong(`Svaret ska vara en olikhet: alla ${v} som fungerar, t.ex. ${v} ≥ …`)
  let bound: number
  try {
    bound = evalNumber(boundText)
  } catch {
    return invalid('Jag kan inte läsa gränsen.')
  }
  const canon = (o: string, b: number): [string, number] => {
    if (!a.integer) return [o, b]
    if (o === '>') return ['>=', Math.floor(b) + 1]
    if (o === '<') return ['<=', Math.ceil(b) - 1]
    if (o === '>=') return ['>=', Math.ceil(b)]
    return ['<=', Math.floor(b)]
  }
  const [uo, ub] = canon(op, bound)
  const [to, tb] = canon(a.op, evalNumber(a.bound))
  if (uo === to && near(ub, tb)) return ok()
  if (uo === to && Math.abs(ub - tb) === 1) return wrong('Nästan – kolla om gränsvärdet ska vara med eller inte.')
  if (uo !== to) return wrong('Olikheten pekar åt fel håll.')
  return wrong()
}

/* ---------- Mängder ---------- */

interface ParsedSet {
  elements: string[]
  infinite: boolean
}

const elementKey = (e: string) => {
  const t = e.trim().replace(/^["'”]|["'”]$/g, '')
  const numeric = joinThousands(t).replace(/\s/g, '')
  if (/^[-+\d.()/*^]+$/.test(numeric) && /\d/.test(numeric)) {
    try {
      const n = evalNumber(numeric)
      if (Number.isFinite(n)) return String(Math.round(n * 1e9) / 1e9)
    } catch {
      /* inte ett tal */
    }
  }
  return t.toLowerCase()
}

export function parseSet(raw: string): ParsedSet | { error: string } {
  let s = tidy(raw).replace(/\.$/, '')
  if (/^(?:∅|Ø|\{\s*\}|tomma mängden|tom mängd|tom)$/i.test(s.replace(/^[A-Za-z∁]+\s*=\s*/, ''))) return { elements: [], infinite: false }
  if (s.includes('=') && s.includes('{')) s = s.slice(s.indexOf('=') + 1).trim()
  s = s.replace(/^\{/, '').replace(/\}$/, '')
  const infinite = /\.\.\./.test(s)
  s = s.replace(/,?\s*\.\.\.\s*,?/g, ',').replace(/,\s*$/, '')
  // Semikolon som avgränsare betyder att kommatecken är decimalkomma: {−0,5; 0,5; 2}
  const parts = s.includes(';') ? s.split(';').map((p) => p.replace(/(\d),(\d)/g, '$1.$2')) : s.split(',')
  const elements = parts.map((p) => p.trim()).filter(Boolean)
  if (!elements.length && !infinite) return { error: 'Skriv elementen inom klamrar, t.ex. {1, 3, 5}.' }
  return { elements, infinite }
}

export function checkSet(a: SetAnswer, raw: string): CheckResult {
  const p = parseSet(raw)
  if ('error' in p) return invalid(p.error)
  const user = [...new Set(p.elements.map(elementKey))]

  const compare = (expected: string[]): CheckResult => {
    const exp = expected.map(elementKey)
    if (a.infinite) {
      const k = Math.min(user.length, exp.length)
      const prefixOk = k >= 2 && exp.slice(0, k).every((e, i) => e === user[i])
      if (prefixOk && p.infinite) return ok()
      if (prefixOk) return partial('Rätt början!', 'Mängden är oändlig – avsluta med … för att visa att den fortsätter.')
      return wrong('Börja med de minsta elementen och visa mönstret, avsluta med … .')
    }
    const missing = exp.filter((e) => !user.includes(e))
    const extra = user.filter((e) => !exp.includes(e))
    if (!missing.length && !extra.length) return ok()
    if (!exp.length) return wrong('Mängden har inga element alls – den är tom (∅).')
    if (missing.length && !extra.length) return wrong(missing.length === 1 ? 'Ett element saknas.' : `${missing.length} element saknas.`)
    if (extra.length && !missing.length) return wrong(extra.length === 1 ? `Elementet ${extra[0]} hör inte dit.` : `${extra.length} element hör inte dit.`)
    return wrong(`${exp.length - missing.length} av ${exp.length} element stämmer.`)
  }

  const main = compare(a.elements)
  if (main.status === 'correct') return main
  for (const alt of a.alsoAccept ?? []) {
    if (compare(alt).status === 'correct') return ok('Rätt – det här svaret godkänns, men facit säger något annat. Se granskningen.')
  }
  return main
}

/* ---------- Mängduttryck ---------- */

export function checkSetExpression(a: SetExpressionAnswer, raw: string): CheckResult {
  let s = tidy(raw).replace(/\.$/, '')
  s = s.replace(/^.*∈\s*/, '').replace(/^(?:i\s+)?mängden\s+/i, '')
  const ctx = { sets: a.sets, universe: a.universe, constraints: a.constraints }
  const r = compareSetExprs(s, a.value, ctx)
  if (r.ok) return ok()
  if (r.reason === 'syntax') return invalid('Jag kan inte läsa uttrycket. Använd t.ex. A ∩ (B ∪ C), B \\ A eller ∁A.')
  if (r.reason === 'unknown-set') return invalid(`Mängden ${r.names.join(', ')} finns inte i uppgiften.`)
  // Jämför områdena för att kunna ge ett tips.
  const user = parseSetExpr(s)
  const target = parseSetExpr(a.value)
  const regs = regions(ctx)
  const inUser = regs.map((m) => evalSet(user, m))
  const inTarget = regs.map((m) => evalSet(target, m))
  if (inUser.every((v, i) => v !== inTarget[i])) return wrong('Du har beskrivit precis det omvända området.')
  if (inUser.every((v, i) => !v || inTarget[i])) return wrong('Ditt område är för litet – det saknas en del.')
  if (inTarget.every((v, i) => !v || inUser[i])) return wrong('Ditt område är för stort – det tar med för mycket.')
  return wrong()
}

/* ---------- Val ---------- */

const CHOICE_SYNONYMS: Record<string, string[]> = {
  ja: ['ja', 'j', 'yes', 'sant', 'stämmer', 'japp'],
  nej: ['nej', 'n', 'no', 'falskt', 'stämmer inte'],
  '∈': ['∈', 'tillhör', 'in', 'e'],
  '∉': ['∉', 'tillhör inte', 'inte', 'not in'],
}

export function checkChoice(a: ChoiceAnswer, raw: string): CheckResult {
  const s = tidy(raw).toLowerCase().replace(/[.!]$/, '')
  const chosen = a.options.find((o) => o.toLowerCase() === s || (CHOICE_SYNONYMS[o.toLowerCase()] ?? []).includes(s) || s.startsWith(o.toLowerCase() + ','))
  if (!chosen) return invalid(`Välj ett av: ${a.options.join(', ')}.`)
  return chosen === a.value ? ok() : wrong()
}

/* ---------- Ingången ---------- */

export function checkAnswer(a: Answer, raw: string): CheckResult {
  if (!raw.trim()) return invalid('Skriv ett svar först.')
  switch (a.type) {
    case 'number':
      return checkNumber(a, raw)
    case 'expression':
      return checkExpression(a, raw)
    case 'list':
      return checkList(a, raw)
    case 'inequality':
      return checkInequality(a, raw)
    case 'set':
      return checkSet(a, raw)
    case 'set-expression':
      return checkSetExpression(a, raw)
    case 'choice':
      return checkChoice(a, raw)
    case 'self':
      return invalid('Den här uppgiften jämför du själv med facit.')
  }
}
