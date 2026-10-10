import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Answer, Exercise, SectionFile } from '../content/types.ts'
import { checkAnswer, isExpanded, isFactored, splitList } from './check.ts'
import { latexToPlain } from './latex.ts'
import { evalNumber, math } from '../math/expr.ts'

const DATA = join(import.meta.dirname, '..', '..', 'public', 'content', 'data')
const exercises: Exercise[] = ['1-1.json', '1-2.json', '1-blandade.json'].flatMap((f) => (JSON.parse(readFileSync(join(DATA, f), 'utf8')) as SectionFile).exercises)
const answer = (id: string, label: string | null = null): Answer => {
  const ex = exercises.find((e) => e.id === id)!
  return ex.parts.find((p) => p.label === label)!.answer
}
const status = (id: string, label: string | null, input: string) => checkAnswer(answer(id, label), input).status
const hint = (id: string, label: string | null, input: string) => checkAnswer(answer(id, label), input).hint ?? ''

describe('tal', () => {
  it('godtar heltal med mellanslag, räkneord och variabel', () => {
    expect(status('1104', null, '5')).toBe('correct')
    expect(status('1104', null, '5 strumpor')).toBe('correct')
    expect(status('1120', null, '8 019 000')).toBe('correct')
    expect(status('1120', null, '8019000 sätt')).toBe('correct')
    expect(status('1113', null, 'x = 26 098')).toBe('correct')
    expect(status('1113', null, '26098')).toBe('correct')
    expect(status('1124', null, '12 167 000')).toBe('correct')
  })

  it('godtar bråk och decimaltal för samma värde', () => {
    expect(status('1163', 'a', '12/64')).toBe('correct')
    expect(status('1163', 'a', '3/16')).toBe('correct')
    expect(status('1163', 'a', '0,1875')).toBe('correct')
    expect(status('1163', 'a', '0.1875')).toBe('correct')
    expect(status('1165', 'a', '0,25')).toBe('correct')
    expect(status('1172', null, '1/6')).toBe('correct')
    expect(status('1172', null, '0,17')).toBe('correct')
    expect(status('1172', null, '0,167')).toBe('correct')
  })

  it('kräver tillräckligt många siffror', () => {
    expect(status('1172', null, '0,2')).toBe('partial')
    expect(status('1177', 'a', '0,1')).toBe('partial')
  })

  it('rättar avrundade svar efter facits noggrannhet', () => {
    expect(status('1177', 'a', '0,09')).toBe('correct')
    expect(status('1177', 'a', '0,0906')).toBe('correct')
    expect(status('1177', 'a', '0,091')).toBe('correct')
    expect(status('1177', 'a', '0,08')).toBe('incorrect')
    expect(status('1174', 'a', '5/14')).toBe('correct')
    expect(status('1174', 'a', '0,36')).toBe('correct')
    expect(status('1174', 'a', '0,357')).toBe('correct')
    expect(status('1179', 'c', '0,107')).toBe('correct')
    expect(status('1181', 'b', '0,996')).toBe('correct')
    expect(status('1181', 'b', '242/243')).toBe('correct')
  })

  it('godtar procent eller andel', () => {
    expect(status('1167', 'a', '86 %')).toBe('correct')
    expect(status('1167', 'a', '86%')).toBe('correct')
    expect(status('1167', 'a', '0,86')).toBe('correct')
    expect(status('1167', 'a', '85,8 %')).toBe('correct')
    expect(status('1168', null, '7,1 %')).toBe('correct')
    expect(status('1168', null, '0,071')).toBe('correct')
    expect(status('k1b-15', 'b', '5 %')).toBe('correct')
    expect(hint('1167', 'a', '86')).toMatch(/procent/)
  })

  it('tiopotenser och jättestora tal', () => {
    expect(status('1147', null, '1,3·10^30')).toBe('correct')
    expect(status('1147', null, '1.3e30')).toBe('correct')
    expect(status('1147', null, '1,3 * 10^30 läsår')).toBe('correct')
    expect(status('1147', null, '1,4·10^30')).toBe('incorrect')
    expect(status('k1b-31', 'a', '6,35·10^11')).toBe('correct')
    expect(status('k1b-31', 'a', '635013559600')).toBe('correct')
    expect(status('k1b-21', 'c', '64^200')).toBe('correct')
    expect(status('k1b-21', 'c', '2^1200')).toBe('correct')
    expect(status('k1b-21', 'c', '4^600')).toBe('correct')
    expect(status('k1b-21', 'c', '64^199')).toBe('incorrect')
  })

  it('ger riktade tips', () => {
    expect(hint('1193', 'b', '945')).toMatch(/tecken/)
    expect(hint('1113', null, '26097')).toMatch(/en ifrån/)
    expect(hint('1145', 'a', '552')).toMatch(/faktor 2/)
    expect(hint('1155', 'a', '12')).toMatch(/faktor 2/)
    expect(hint('1170', 'a', '0,27')).toMatch(/motsatta/)
    expect(hint('1179', 'c', '0,109')).toMatch(/Nära/)
  })

  it('vill ha ett uträknat tal när svaret är ett heltal', () => {
    expect(status('1137', 'a', '4!')).toBe('partial')
    expect(status('1137', 'a', '24')).toBe('correct')
    expect(status('1153', 'a', 'C(10,3)')).toBe('partial')
  })

  it('godkänner båda svaren när facit misstänks vara fel', () => {
    expect(status('1132', null, '258')).toBe('correct')
    expect(status('1132', null, '158')).toBe('correct')
    expect(status('1158', null, '860 728')).toBe('correct')
    expect(status('1132', null, '157')).toBe('incorrect')
  })

  it('säger till när det inte är ett tal', () => {
    expect(status('1104', null, 'fem')).toBe('invalid')
    expect(status('1104', null, '')).toBe('invalid')
  })
})

describe('uttryck', () => {
  it('godtar likvärdiga uttryck', () => {
    expect(status('1115', null, 'n+1')).toBe('correct')
    expect(status('1115', null, '1 + n')).toBe('correct')
    expect(status('1115', null, 'n+2')).toBe('incorrect')
    expect(status('k1b-7', 'a', 'n(n-1)(n-2)/6')).toBe('correct')
    expect(status('k1b-7', 'a', '(n^3 - 3n^2 + 2n)/6')).toBe('correct')
    expect(status('k1b-7', 'b', '(n^2+n)/2')).toBe('correct')
  })

  it('kräver utvecklad form', () => {
    expect(status('1187', 'a', 'x^3+3x^2y+3xy^2+y^3')).toBe('correct')
    expect(status('1187', 'a', 'x³ + 3x²y + 3xy² + y³')).toBe('correct')
    expect(status('1187', 'a', 'y^3 + 3xy^2 + 3x^2y + x^3')).toBe('correct')
    expect(status('1187', 'a', '(x+y)^3')).toBe('partial')
    expect(status('1187', 'a', '(x+y)(x+y)^2')).toBe('partial')
    expect(status('1187', 'a', 'x^3+y^3')).toBe('incorrect')
    expect(status('k1b-17', 'c', 'x^4 - 4x^3y + 6x^2y^2 - 4xy^3 + y^4')).toBe('correct')
    expect(status('k1b-18', null, '6x^5+15x^4h+20x^3h^2+15x^2h^3+6xh^4+h^5')).toBe('correct')
  })

  it('kräver faktoriserad form', () => {
    expect(status('k1b-29', 'a', '(n-1)!(n-1)')).toBe('correct')
    expect(status('k1b-29', 'a', '(n-1)·(n-1)!')).toBe('correct')
    expect(status('k1b-29', 'a', 'n! - (n-1)!')).toBe('partial')
    expect(status('k1b-29', 'b', 'n!(n^2+3n)')).toBe('correct')
    expect(status('k1b-29', 'b', 'n(n+3)n!')).toBe('correct')
    expect(status('k1b-29', 'b', '(n+2)! - 2n!')).toBe('partial')
  })

  it('ger tips vid teckenfel', () => {
    expect(hint('1115', null, '-n-1')).toMatch(/tecken/)
  })

  it('formkontroller', () => {
    expect(isExpanded(math.parse('x^2 + 2*x*y + y^2'))).toBe(true)
    expect(isExpanded(math.parse('(x+y)^2'))).toBe(false)
    expect(isExpanded(math.parse('3*(x+1)'))).toBe(false)
    expect(isFactored(math.parse('(x+1)*(x-1)'))).toBe(true)
    expect(isFactored(math.parse('x^2-1'))).toBe(false)
  })
})

describe('listor', () => {
  it('termer i ordning', () => {
    expect(status('1188', 'a', 'x^5, 15x^4y, 90x^3y^2')).toBe('correct')
    expect(status('1188', 'a', 'x^5, 15x^4y och 90x^3y^2')).toBe('correct')
    expect(status('1188', 'b', 'x^5, -15x^4y, 90x^3y^2')).toBe('correct')
    expect(status('1188', 'a', '90x^3y^2, 15x^4y, x^5')).toBe('incorrect')
    expect(status('1189', 'b', '103 680a^8b^2, 414 720a^7b^3')).toBe('correct')
    expect(hint('1188', 'a', 'x^5, 15x^4y')).toMatch(/3 delar/)
  })
  it('Pascals rad med eller utan kommatecken', () => {
    expect(status('1192', 'a', '1 9 36 84 126 126 84 36 9 1')).toBe('correct')
    expect(status('1192', 'a', '1, 9, 36, 84, 126, 126, 84, 36, 9, 1')).toBe('correct')
    expect(status('1192', 'a', '1 9 36 84 126 84 36 9 1')).toBe('incorrect')
  })
  it('termer i valfri ordning', () => {
    expect(status('1192', 'b', '120a^3b^7 och 120a^7b^3')).toBe('correct')
    expect(status('1192', 'b', '120a^7b^3, 120a^3b^7')).toBe('correct')
  })
  it('delar upp listor', () => {
    expect(splitList('{1,3,5}')).toEqual(['1', '3', '5'])
    expect(splitList('2 och 5')).toEqual(['2', '5'])
  })
})

describe('mängder', () => {
  it('ordning och skrivsätt spelar ingen roll', () => {
    expect(status('1206', 'a', '{1,3,5,7,9,11}')).toBe('correct')
    expect(status('1206', 'a', '{11, 9, 7, 5, 3, 1}')).toBe('correct')
    expect(status('1206', 'a', '1, 3, 5, 7, 9, 11')).toBe('correct')
    expect(status('1216', 'a', '{d, b}')).toBe('correct')
    expect(status('1216', 'a', '{B, D}')).toBe('correct')
  })
  it('decimaltal med semikolon eller punkt', () => {
    expect(status('1206', 'd', '{-0,5; 0,5; 2}')).toBe('correct')
    expect(status('1206', 'd', '{−0.5, 0.5, 2}')).toBe('correct')
    expect(status('1206', 'd', '{2; -1/2; 1/2}')).toBe('correct')
  })
  it('tomma mängden', () => {
    expect(status('1216', 'b', '∅')).toBe('correct')
    expect(status('1216', 'b', '{}')).toBe('correct')
    expect(status('1216', 'b', '{f}')).toBe('incorrect')
  })
  it('säger vad som saknas eller är för mycket', () => {
    expect(hint('1216', 'a', '{b}')).toMatch(/saknas/)
    expect(hint('1216', 'a', '{b, d, f}')).toMatch(/f hör inte dit/)
  })
  it('oändliga mängder behöver …', () => {
    expect(status('1209', 'a', '{102, 104, 106, ...}')).toBe('correct')
    expect(status('1209', 'a', '{102, 104, 106, …}')).toBe('correct')
    expect(status('1209', 'a', '{102, 104, 106}')).toBe('partial')
    expect(status('1209', 'a', '{100, 102, 104, ...}')).toBe('incorrect')
  })
  it('mängden med A = framför', () => {
    expect(status('1209', 'b', 'B = {-2, 0, 2}')).toBe('correct')
  })
  it('alternativt svar när facit misstänks vara fel', () => {
    expect(status('1218', 'b', '{1, 8, 10, 15, 21, 45}')).toBe('correct')
    expect(status('1218', 'b', '{8, 10, 15, 21, 45}')).toBe('correct')
  })
})

describe('mängduttryck', () => {
  it('likvärdiga uttryck', () => {
    expect(status('1230', 'a', 'A∩(B∪C)')).toBe('correct')
    expect(status('1230', 'a', '(A n B) u (A n C)')).toBe('correct')
    expect(status('1230', 'b', 'A \\ (B ∪ C)')).toBe('correct')
    expect(status('k1b-3', 'b', '∁(A ∪ B)')).toBe('correct')
    expect(status('k1b-3', 'b', '∁A ∩ ∁B')).toBe('correct')
  })
  it('med villkor och grundmängd', () => {
    expect(status('1222', 'a', 'P')).toBe('correct')
    expect(status('1222', 'c', 'P ∩ R')).toBe('correct')
    expect(status('1232', 'b', 'B ∩ C')).toBe('correct')
    expect(status('1232', 'b', 'Mängden B ∩ C')).toBe('correct')
    expect(status('1233', 'b', 'C \\ Q')).toBe('correct')
    expect(status('1233', 'b', '∁Q')).toBe('correct')
    expect(status('1233', 'b', '5^(1/3) ∈ C \\ Q')).toBe('correct')
    expect(status('1233', 'a', 'ℤ')).toBe('correct')
  })
  it('tips om området', () => {
    expect(hint('1230', 'a', 'A ∩ B')).toMatch(/för litet/)
    expect(hint('1230', 'a', 'A')).toMatch(/för stort/)
    expect(hint('k1b-3', 'a', '∁(B \\ A)')).toMatch(/omvända/)
    expect(status('1230', 'a', 'A ∩ X')).toBe('invalid')
  })
})

describe('val och olikheter', () => {
  it('ja/nej och ∈/∉', () => {
    expect(status('1128', 'a', 'Ja')).toBe('correct')
    expect(status('1128', 'a', 'sant')).toBe('correct')
    expect(status('1128', 'a', 'nej')).toBe('incorrect')
    expect(status('1204', 'a', '∉')).toBe('correct')
    expect(status('1204', 'b', 'tillhör')).toBe('correct')
  })
  it('olikheter med heltal', () => {
    const a: Answer = { type: 'inequality', variable: 'n', op: '>', bound: '8', integer: true }
    expect(checkAnswer(a, 'n > 8').status).toBe('correct')
    expect(checkAnswer(a, 'n ≥ 9').status).toBe('correct')
    expect(checkAnswer(a, '8 < n').status).toBe('correct')
    expect(checkAnswer(a, 'n > 9').hint).toMatch(/gränsvärdet/)
    expect(checkAnswer(a, 'n < 8').hint).toMatch(/fel håll/)
    expect(checkAnswer(a, 'n = 9').hint).toMatch(/olikhet/)
  })
})

describe('LaTeX från mattefältet', () => {
  it('översätts till vanlig text', () => {
    expect(latexToPlain('\\frac{3}{16}')).toBe('((3)/(16))')
    expect(latexToPlain('0{,}25')).toBe('0.25')
    expect(latexToPlain('\\binom{10}{3}')).toBe('binom(10,3)')
    expect(latexToPlain('x^{3}+3x^2y')).toBe('x^3+3x^2y')
    expect(latexToPlain('\\left(x+y\\right)^{3}')).toBe('(x+y)^3')
    expect(latexToPlain('\\lbrace1,3,5\\rbrace')).toBe('{1,3,5}')
    expect(latexToPlain('A\\cap\\left(B\\cup C\\right)')).toBe('A∩(B∪C)')
    expect(latexToPlain('1{,}3\\cdot10^{30}')).toBe('1.3*10^(30)')
    expect(latexToPlain('86\\%')).toBe('86%')
    expect(latexToPlain('\\sqrt{2}')).toBe('sqrt(2)')
    expect(latexToPlain('n\\ge9')).toBe('n>=9')
  })
  it('och rättas som vanligt', () => {
    expect(status('1163', 'a', latexToPlain('\\frac{3}{16}'))).toBe('correct')
    expect(status('1147', null, latexToPlain('1{,}3\\cdot10^{30}'))).toBe('correct')
    expect(status('1187', 'a', latexToPlain('x^3+3x^2y+3xy^2+y^3'))).toBe('correct')
    expect(status('k1b-29', 'a', latexToPlain('\\left(n-1\\right)!\\left(n-1\\right)'))).toBe('correct')
    expect(status('1230', 'a', latexToPlain('A\\cap\\left(B\\cup C\\right)'))).toBe('correct')
    expect(status('1206', 'a', latexToPlain('\\lbrace1,3,5,7,9,11\\rbrace'))).toBe('correct')
    expect(status('1167', 'a', latexToPlain('86\\%'))).toBe('correct')
  })
})

/** Facits eget svar ska alltid godkännas, för varje deluppgift i boken. */
describe('hela boken: facit godkänns', () => {
  const canonical = (a: Answer): string[] => {
    switch (a.type) {
      case 'number': {
        const v = evalNumber(a.value)
        const out = [Number.isFinite(v) ? String(v) : a.value]
        if (a.approx) out.push(a.approx.replace('.', ','))
        if (a.percent && a.approx) out.push(`${(Number(a.approx) * 100).toFixed(1).replace('.', ',')} %`)
        return out
      }
      case 'expression':
        return [a.value]
      case 'list':
        return [a.items.join(', ')]
      case 'set':
        return [`{${a.elements.join('; ')}${a.infinite ? '; ...' : ''}}`]
      case 'set-expression':
      case 'choice':
        return [a.value]
      default:
        return []
    }
  }
  for (const ex of exercises) {
    for (const p of ex.parts) {
      const inputs = canonical(p.answer)
      if (!inputs.length) continue
      it(`${ex.number}${p.label ?? ''}`, () => {
        for (const input of inputs) expect(checkAnswer(p.answer, input), input).toMatchObject({ status: 'correct' })
      })
    }
  }
})
