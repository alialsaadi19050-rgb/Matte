// Kontrollerar att en uppgift är fullständig och att facitvärdena går att räkna med.
// Används både av `npm run ingest` och av granskningssidan innan något sparas.
import type { Answer, Exercise, Figure } from './types.ts'
import { evalAt, evalLog10, evalNumber, precisionOf, roundsTo } from '../math/expr.ts'
import { compareSetExprs, parseConstraint, parseSetExpr, regions } from '../math/sets.ts'

export interface Issue {
  level: 'error' | 'warning'
  where: string
  message: string
}

const ANSWER_TYPES = ['number', 'expression', 'list', 'inequality', 'set', 'set-expression', 'choice', 'self']

export function validateExercise(ex: Exercise, opts: { figureExists?: (src: string) => boolean } = {}): Issue[] {
  const issues: Issue[] = []
  const err = (where: string, message: string) => issues.push({ level: 'error', where, message })
  const warn = (where: string, message: string) => issues.push({ level: 'warning', where, message })
  const id = ex.id ?? '?'

  for (const key of ['id', 'number', 'chapter', 'section', 'level', 'page', 'facitPage', 'prompt', 'parts'] as const) {
    if (ex[key] === undefined) err(id, `saknar fältet ”${key}”`)
  }
  if (!['a', 'b', 'c'].includes(ex.level)) err(id, `okänd nivå ”${ex.level}”`)
  if (!Array.isArray(ex.parts) || ex.parts.length === 0) {
    err(id, 'har inga deluppgifter')
    return issues
  }

  const checkFigures = (where: string, figs: Figure[] | undefined) => {
    for (const f of figs ?? []) {
      if (!f.alt) warn(where, 'figur saknar alt-text')
      if (f.kind === 'svg' && opts.figureExists && !opts.figureExists(f.src)) err(where, `figuren ${f.src} finns inte`)
      if (f.kind === 'venn') {
        if (f.spec.shade) {
          try { parseSetExpr(f.spec.shade) } catch (e) { err(where, `Venn-skuggning ”${f.spec.shade}”: ${(e as Error).message}`) }
        }
      }
    }
  }
  checkFigures(id, ex.figures)

  const labels = new Set<string>()
  ex.parts.forEach((p, i) => {
    const where = `${id}${p.label ?? ''}`
    if (p.label !== null && labels.has(p.label)) err(where, 'deluppgiften finns två gånger')
    labels.add(p.label ?? `#${i}`)
    if (!p.facit) err(where, 'saknar facittext')
    if (!p.answer || !ANSWER_TYPES.includes(p.answer.type)) {
      err(where, `okänd svarstyp ”${p.answer?.type}”`)
      return
    }
    checkFigures(where, p.figures)
    checkFigures(where, p.facitFigures)
    for (const m of checkAnswer(p.answer)) err(where, m)
    // En deluppgift med bokstav måste ha en text eller en egen figur – annars ser den ut att saknas.
    if (p.label && !(p.prompt ?? '').trim() && !p.figures?.length && ex.parts.length > 1) err(where, 'deluppgiften är tom: lägg till text eller en figur till just den')
  })
  // Bokstäverna ska komma i ordning: a, b, c …
  const letters = ex.parts.map((p) => p.label).filter((l): l is string => !!l)
  if (letters.length && letters.join('') !== 'abcdefghijklmnop'.slice(0, letters.length)) err(id, `deluppgifterna heter ${letters.join(', ')} – saknas någon?`)
  // Texten nämner en figur eller tabell som inte finns.
  const anyFigure = (ex.figures?.length ?? 0) + ex.parts.reduce((n, p) => n + (p.figures?.length ?? 0), 0)
  const text = [ex.prompt, ...ex.parts.map((p) => p.prompt ?? '')].join(' ')
  const mention = /figuren|venndiagrammet|tabellen|grafen|bilden/i.exec(text)
  if (mention && !anyFigure) warn(id, `texten nämner ”${mention[0]}” men uppgiften har ingen figur`)
  return issues
}

/** Returnerar felmeddelanden för ett svar som inte går att räkna med. */
export function checkAnswer(a: Answer): string[] {
  const out: string[] = []
  try {
    switch (a.type) {
      case 'number': {
        for (const v of [a.value, ...(a.alsoAccept ?? [])]) {
          const { log10 } = evalLog10(v)
          if (Number.isNaN(log10)) out.push(`värdet ”${v}” går inte att räkna ut`)
        }
        if (a.approx !== undefined) {
          precisionOf(a.approx)
          const value = evalNumber(a.value)
          if (Number.isFinite(value) && !roundsTo(value, a.approx)) {
            out.push(`värdet ${a.value} = ${value} avrundas inte till facits ${a.approx}`)
          }
        }
        break
      }
      case 'expression': {
        const point = Object.fromEntries(a.variables.map((v, i) => [v, 3 + i * 1.7]))
        const usesFactorial = a.value.includes('!')
        if (usesFactorial) for (const v of a.variables) point[v] = 5 + a.variables.indexOf(v)
        const y = evalAt(a.value, a.variables, point)
        if (!Number.isFinite(y)) out.push(`uttrycket ”${a.value}” går inte att räkna ut`)
        break
      }
      case 'list': {
        const vars = a.variables ?? []
        const point = Object.fromEntries(vars.map((v, i) => [v, 2 + i]))
        for (const item of a.items) {
          if (!Number.isFinite(evalAt(item, vars, point))) out.push(`elementet ”${item}” går inte att räkna ut`)
        }
        break
      }
      case 'inequality':
        if (!Number.isFinite(evalNumber(a.bound))) out.push(`gränsen ”${a.bound}” går inte att räkna ut`)
        break
      case 'set':
        if (new Set(a.elements).size !== a.elements.length) out.push('mängden har dubbletter')
        break
      case 'set-expression': {
        for (const c of a.constraints ?? []) parseConstraint(c)
        if (regions(a).length === 0) out.push('villkoren går inte att uppfylla')
        const r = compareSetExprs(a.value, a.value, a)
        if (!r.ok) out.push(`mängduttrycket ”${a.value}” går inte att tolka`)
        break
      }
      case 'choice':
        if (!a.options.includes(a.value)) out.push(`rätt alternativ ”${a.value}” finns inte bland alternativen`)
        break
      case 'self':
        break
    }
  } catch (e) {
    out.push((e as Error).message)
  }
  return out
}
