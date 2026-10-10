// Mängduttryck: tolkning och utvärdering över Venndiagrammets områden.
//
// Syntax (det som står i boken plus det som är lätt att skriva på tangentbordet):
//   snitt         ∩   n   &   snitt
//   union         ∪   u   |   +   union
//   differens     \   −   -
//   komplement    ∁X  ∁(…)  ~X  ¬X  X'  Xᶜ
//   tomma mängden ∅   Ø   {}
// Mängder heter med en stor bokstav (A, B, C, Q, Z …). Små bokstäver n och u
// är därför lediga som operatorer.

export type SetNode =
  | { kind: 'set'; name: string }
  | { kind: 'empty' }
  | { kind: 'not'; arg: SetNode }
  | { kind: 'and' | 'or' | 'minus'; left: SetNode; right: SetNode }

type Token =
  | { t: 'name'; v: string }
  | { t: 'empty' }
  | { t: 'and' | 'or' | 'minus' | 'not' | 'postnot' | '(' | ')' }

export class SetSyntaxError extends Error {}

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  const s = src.normalize('NFC')
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) { i++; continue }
    const rest = s.slice(i)
    const word = /^(snitt|union|komplement)\b/i.exec(rest)
    if (word) {
      const w = word[1].toLowerCase()
      out.push({ t: w === 'snitt' ? 'and' : w === 'union' ? 'or' : 'not' })
      i += w.length
      continue
    }
    if (rest.startsWith('{}')) { out.push({ t: 'empty' }); i += 2; continue }
    if ('∩&n'.includes(c)) { out.push({ t: 'and' }); i++; continue }
    if ('∪|+u'.includes(c)) { out.push({ t: 'or' }); i++; continue }
    if ('\\−-∖'.includes(c)) { out.push({ t: 'minus' }); i++; continue }
    if ('∁~¬'.includes(c)) { out.push({ t: 'not' }); i++; continue }
    if ("'ᶜ′".includes(c)) { out.push({ t: 'postnot' }); i++; continue }
    if ('∅Ø⌀'.includes(c)) { out.push({ t: 'empty' }); i++; continue }
    if (c === '(' || c === ')') { out.push({ t: c }); i++; continue }
    // 𝕌, ℚ, ℤ, ℂ m.fl. skrivs om till vanliga bokstäver.
    const blackboard: Record<string, string> = { 'ℚ': 'Q', 'ℤ': 'Z', 'ℂ': 'C', 'ℝ': 'R', 'ℕ': 'N' }
    if (blackboard[c]) { out.push({ t: 'name', v: blackboard[c] }); i++; continue }
    if (/[A-ZÅÄÖ]/.test(c)) { out.push({ t: 'name', v: c }); i++; continue }
    throw new SetSyntaxError(`Okänt tecken ”${c}”`)
  }
  return out
}

/** Tolkar ett mängduttryck. ∩ binder hårdare än ∪ och \. */
export function parseSetExpr(src: string): SetNode {
  const tokens = tokenize(src)
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]

  function parseUnionLevel(): SetNode {
    let left = parseIntersectionLevel()
    while (peek() && (peek().t === 'or' || peek().t === 'minus')) {
      const op = next().t as 'or' | 'minus'
      left = { kind: op, left, right: parseIntersectionLevel() }
    }
    return left
  }
  function parseIntersectionLevel(): SetNode {
    let left = parseUnary()
    while (peek() && peek().t === 'and') {
      next()
      left = { kind: 'and', left, right: parseUnary() }
    }
    return left
  }
  function parseUnary(): SetNode {
    const tok = peek()
    if (!tok) throw new SetSyntaxError('Uttrycket tar slut för tidigt')
    if (tok.t === 'not') {
      next()
      return { kind: 'not', arg: parseUnary() }
    }
    return parsePostfix(parseAtom())
  }
  function parsePostfix(node: SetNode): SetNode {
    while (peek() && peek().t === 'postnot') {
      next()
      node = { kind: 'not', arg: node }
    }
    return node
  }
  function parseAtom(): SetNode {
    const tok = next()
    if (!tok) throw new SetSyntaxError('Uttrycket tar slut för tidigt')
    if (tok.t === 'name') return { kind: 'set', name: tok.v }
    if (tok.t === 'empty') return { kind: 'empty' }
    if (tok.t === '(') {
      const inner = parseUnionLevel()
      if (!peek() || next().t !== ')') throw new SetSyntaxError('En parentes stängs inte')
      return inner
    }
    throw new SetSyntaxError('Oväntad operator')
  }

  if (tokens.length === 0) throw new SetSyntaxError('Tomt uttryck')
  const tree = parseUnionLevel()
  if (pos !== tokens.length) throw new SetSyntaxError('Oväntat tecken efter uttrycket')
  return tree
}

export function setNames(node: SetNode, acc = new Set<string>()): Set<string> {
  switch (node.kind) {
    case 'set': acc.add(node.name); break
    case 'empty': break
    case 'not': setNames(node.arg, acc); break
    default: setNames(node.left, acc); setNames(node.right, acc)
  }
  return acc
}

/** Utvärderar uttrycket för en punkt som ligger i de mängder som är true i `member`. */
export function evalSet(node: SetNode, member: (name: string) => boolean): boolean {
  switch (node.kind) {
    case 'set': return member(node.name)
    case 'empty': return false
    case 'not': return !evalSet(node.arg, member)
    case 'and': return evalSet(node.left, member) && evalSet(node.right, member)
    case 'or': return evalSet(node.left, member) || evalSet(node.right, member)
    case 'minus': return evalSet(node.left, member) && !evalSet(node.right, member)
  }
}

export interface Constraint {
  lhs: SetNode
  rel: 'subset' | 'equal'
  rhs: SetNode
}

/** Tolkar villkor som "B ⊆ A", "R = ∅", "A ∩ D = ∅", "Q = R". */
export function parseConstraint(src: string): Constraint {
  const m = /^(.*?)(⊆|⊂|=)(.*)$/.exec(src)
  if (!m) throw new SetSyntaxError(`Villkoret ”${src}” saknar ⊆ eller =`)
  return { lhs: parseSetExpr(m[1]), rel: m[2] === '=' ? 'equal' : 'subset', rhs: parseSetExpr(m[3]) }
}

function holds(c: Constraint, member: (name: string) => boolean): boolean {
  const l = evalSet(c.lhs, member)
  const r = evalSet(c.rhs, member)
  return c.rel === 'subset' ? !l || r : l === r
}

export interface SetContext {
  sets: string[]
  universe?: string
  constraints?: string[]
}

/** Alla områden i Venndiagrammet som villkoren tillåter, som funktioner namn → tillhör. */
export function regions(ctx: SetContext): ((name: string) => boolean)[] {
  const constraints = (ctx.constraints ?? []).map(parseConstraint)
  const out: ((name: string) => boolean)[] = []
  const n = ctx.sets.length
  for (let mask = 0; mask < 1 << n; mask++) {
    const member = (name: string) => {
      if (name === ctx.universe) return true
      const i = ctx.sets.indexOf(name)
      return i >= 0 && (mask & (1 << i)) !== 0
    }
    if (constraints.every((c) => holds(c, member))) out.push(member)
  }
  return out
}

export type SetCompare =
  | { ok: true }
  | { ok: false; reason: 'syntax'; message: string }
  | { ok: false; reason: 'unknown-set'; names: string[] }
  | { ok: false; reason: 'different' }

/** Är två mängduttryck lika i alla områden som villkoren tillåter? */
export function compareSetExprs(answer: string, expected: string, ctx: SetContext): SetCompare {
  let a: SetNode
  try {
    a = parseSetExpr(answer)
  } catch (e) {
    return { ok: false, reason: 'syntax', message: (e as Error).message }
  }
  const known = new Set([...ctx.sets, ...(ctx.universe ? [ctx.universe] : [])])
  const unknown = [...setNames(a)].filter((n) => !known.has(n))
  if (unknown.length) return { ok: false, reason: 'unknown-set', names: unknown }
  const e = parseSetExpr(expected)
  for (const member of regions(ctx)) {
    if (evalSet(a, member) !== evalSet(e, member)) return { ok: false, reason: 'different' }
  }
  return { ok: true }
}
