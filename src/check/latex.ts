// Gör om LaTeX från mattefältet (MathLive) till samma enkla textformat som
// man kan skriva för hand, t.ex. \frac{3}{16} → (3)/(16).

const SYMBOLS: Record<string, string> = {
  cdot: '*',
  times: '*',
  div: '/',
  cap: '∩',
  cup: '∪',
  setminus: '\\',
  smallsetminus: '\\',
  complement: '∁',
  emptyset: '∅',
  varnothing: '∅',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  subseteq: '⊆',
  ge: '>=',
  geq: '>=',
  le: '<=',
  leq: '<=',
  ne: '!=',
  neq: '!=',
  pi: 'pi',
  ldots: '...',
  dots: '...',
  cdots: '...',
  infty: 'Infinity',
  '%': '%',
  '{': '{',
  '}': '}',
  lbrace: '{',
  rbrace: '}',
  ',': ' ',
  ';': ' ',
  ':': ' ',
  '!': '',
  ' ': ' ',
  quad: ' ',
  qquad: ' ',
  approx: '≈',
  pm: '±',
  vert: '|',
  mid: '|',
  lvert: '|',
  rvert: '|',
}

const DROP = new Set(['left', 'right', 'bigl', 'bigr', 'Bigl', 'Bigr', 'displaystyle', 'textstyle'])
const TEXTISH = new Set(['text', 'mathrm', 'operatorname', 'textrm', 'mathit', 'mathbf', 'textbf', 'mathbb', 'mathsf'])

export function latexToPlain(latex: string): string {
  let i = 0
  const s = latex

  function readGroup(): string {
    while (s[i] === ' ') i++
    if (s[i] === '{') {
      i++
      const out = readUntil('}')
      i++
      return out
    }
    if (s[i] === '\\') return readCommand()
    return s[i++] ?? ''
  }

  function readOptional(): string | null {
    while (s[i] === ' ') i++
    if (s[i] !== '[') return null
    i++
    const out = readUntil(']')
    i++
    return out
  }

  function readCommand(): string {
    i++ // backslash
    let name = ''
    if (/[a-zA-Z]/.test(s[i] ?? '')) {
      while (/[a-zA-Z]/.test(s[i] ?? '')) name += s[i++]
      // Mellanslag efter ett kommandonamn hör inte till matten (som i TeX).
      while (s[i] === ' ') i++
    } else name = s[i++] ?? ''
    if (DROP.has(name)) {
      // \left( och \right) – behåll själva parentesen, men \left. försvinner.
      if (s[i] === '.') i++
      return ''
    }
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
      const a = readGroup()
      const b = readGroup()
      return `((${a})/(${b}))`
    }
    if (name === 'binom' || name === 'dbinom' || name === 'tbinom') {
      const a = readGroup()
      const b = readGroup()
      return `binom(${a},${b})`
    }
    if (name === 'sqrt') {
      const n = readOptional()
      const a = readGroup()
      return n ? `nthRoot(${a},${n})` : `sqrt(${a})`
    }
    if (TEXTISH.has(name)) return readGroup()
    if (name in SYMBOLS) return SYMBOLS[name]
    return name
  }

  function readUntil(end: string): string {
    let out = ''
    while (i < s.length && s[i] !== end) {
      const c = s[i]
      if (c === '\\') out += readCommand()
      else if (c === '{') {
        // {,} är MathLives decimalkomma.
        if (s.startsWith('{,}', i)) {
          out += '.'
          i += 3
          continue
        }
        i++
        out += `(${readUntil('}')})`
        i++
      } else if (c === '^' || c === '_') {
        i++
        const g = readGroup()
        out += c === '^' ? `^(${g})` : g
      } else if (c === '~') {
        out += ' '
        i++
      } else {
        out += c
        i++
      }
    }
    return out
  }

  return readUntil('\u0000')
    .replace(/\^\((\w)\)/g, '^$1')
    .replace(/\s+/g, ' ')
    .trim()
}
