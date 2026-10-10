import type { Answer } from './types.ts'

/** Kort beskrivning på svenska av hur ett svar rättas. */
export function describeAnswer(a: Answer): { kind: string; detail: string } {
  switch (a.type) {
    case 'number': {
      const parts = [a.variable ? `${a.variable} = ${a.value}` : a.value]
      if (a.approx) parts.push(`≈ ${a.approx.replace('.', ',')}`)
      if (a.percent) parts.push('(procent eller andel)')
      if (a.noun) parts.push(`– ”${a.noun}” får skrivas`)
      if (a.alsoAccept?.length) parts.push(`· godkänner även ${a.alsoAccept.join(', ')}`)
      return { kind: 'Tal', detail: parts.join(' ') }
    }
    case 'expression': {
      const form = { any: '', expanded: ' · ska vara utvecklat', factored: ' · ska vara faktoriserat', 'prime-factors': ' · primtalsfaktorer' }[a.form ?? 'any']
      return { kind: `Uttryck i ${a.variables.join(', ')}`, detail: a.value + form }
    }
    case 'list':
      return { kind: a.ordered ? 'Lista i ordning' : 'Lista i valfri ordning', detail: a.items.join(';  ') }
    case 'inequality':
      return { kind: 'Olikhet', detail: `${a.variable} ${a.op} ${a.bound}${a.integer ? ' (heltal)' : ''}` }
    case 'set':
      return {
        kind: a.infinite ? 'Oändlig mängd' : 'Mängd',
        detail: `{${a.elements.join(', ')}${a.infinite ? ', …' : ''}}` + (a.alsoAccept?.length ? ` · godkänner även ${a.alsoAccept.map((e) => `{${e.join(', ')}}`).join(', ')}` : ''),
      }
    case 'set-expression':
      return {
        kind: 'Mängduttryck',
        detail: a.value + (a.constraints?.length ? `   (villkor: ${a.constraints.join(', ')})` : ''),
      }
    case 'choice':
      return { kind: 'Val', detail: `${a.options.join(' / ')} → ${a.value}` }
    case 'self':
      return { kind: 'Självbedöms', detail: 'Du jämför med facit och markerar rätt eller fel.' }
  }
}
