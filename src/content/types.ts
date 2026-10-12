// Datamodell för bokens innehåll. Texter är "MathText": vanlig text där
// matte skrivs med KaTeX mellan $...$ (inline) eller $$...$$ (block).

export type Level = 'a' | 'b' | 'c'

/** Hur svaret rättas. Allt som inte går att rätta automatiskt är "self". */
export type Answer =
  | NumberAnswer
  | ExpressionAnswer
  | ListAnswer
  | InequalityAnswer
  | SetAnswer
  | SetExpressionAnswer
  | ChoiceAnswer
  | SelfAnswer

export interface NumberAnswer {
  type: 'number'
  /** Exakt värde i mathjs-syntax, t.ex. "3/16", "factorial(30)/200", "combinations(52,13)". */
  value: string
  /** Avrundat värde som facit visar (punkt som decimaltecken), t.ex. "0.09" eller "1.3e30". Styr toleransen. */
  approx?: string
  /** Facit anger svaret i procent (värdet lagras som andel). Både 0,86 och 86 % godkänns. */
  percent?: boolean
  /** Räkneord som får (men inte måste) skrivas efter talet, t.ex. "sätt". */
  noun?: string
  /** Svaret skrivs som "x = …". Variabeln får utelämnas. */
  variable?: string
  /** Fler värden som också godkänns (t.ex. när facit misstänks vara fel). */
  alsoAccept?: string[]
}

export interface ExpressionAnswer {
  type: 'expression'
  /** Uttryck i mathjs-syntax, t.ex. "x^3 + 3x^2*y + 3x*y^2 + y^3". */
  value: string
  variables: string[]
  /** Krav på formen: utvecklat, faktoriserat, primtalsfaktorer eller valfritt. */
  form?: 'any' | 'expanded' | 'factored' | 'prime-factors'
}

export interface ListAnswer {
  type: 'list'
  /** Varje element är ett tal eller uttryck i mathjs-syntax. */
  items: string[]
  ordered: boolean
  variables?: string[]
  /** Namn på rutorna, t.ex. ["n", "k"], när delarna är olika storheter. */
  labels?: string[]
  /** Fler listor som också godkänns (t.ex. när det finns flera lösningar). */
  alsoAccept?: string[][]
}

export interface InequalityAnswer {
  type: 'inequality'
  variable: string
  op: '>' | '>=' | '<' | '<='
  bound: string
  /** Variabeln är ett heltal, så n > 8 och n ≥ 9 är samma svar. */
  integer?: boolean
}

export interface SetAnswer {
  type: 'set'
  /** Elementen som text. Tal jämförs numeriskt, övrigt som text. */
  elements: string[]
  /** Oändlig mängd; elements är de första elementen i mönstret. */
  infinite?: boolean
  /** Fler elementlistor som också godkänns (t.ex. när facit misstänks vara fel). */
  alsoAccept?: string[][]
}

export interface SetExpressionAnswer {
  type: 'set-expression'
  /** Mängduttryck med ∩ ∪ \ ∁, t.ex. "A ∩ (B ∪ C)". */
  value: string
  sets: string[]
  /** Namn på grundmängden om den får användas i svaret, t.ex. "G" eller "C". */
  universe?: string
  /** Villkor som gäller i uppgiften, t.ex. "B ⊆ A", "R = ∅", "A ∩ D = ∅". */
  constraints?: string[]
  /** Svara helst genom att skugga i ett Venndiagram (t.ex. ”Rita av och skugga …”). */
  draw?: boolean
}

export interface ChoiceAnswer {
  type: 'choice'
  options: string[]
  value: string
}

export interface SelfAnswer {
  type: 'self'
}

export type Figure =
  | { kind: 'svg'; src: string; alt: string; width?: number }
  | { kind: 'venn'; alt: string; spec: VennSpec }
  | { kind: 'table'; alt: string; head: string[]; rows: string[][] }

export interface VennShape {
  name: string
  shape: 'ellipse'
  cx: number
  cy: number
  rx: number
  ry: number
  /** Etikettens position. Utelämnas för att dölja etiketten. */
  label?: { x: number; y: number }
}

export interface VennSpec {
  width: number
  height: number
  /** Etikett för grundmängden (ritas i rektangelns hörn). */
  universe?: string
  shapes: VennShape[]
  /** Mängduttryck som skuggas, t.ex. "A ∩ B". */
  shade?: string
  texts?: { x: number; y: number; text: string; size?: number }[]
}

export interface Part {
  /** "a", "b" … eller null när uppgiften inte har deluppgifter. */
  label: string | null
  prompt?: string
  /** Figur som hör till just den här deluppgiften (t.ex. ett Venndiagram i a). */
  figures?: Figure[]
  answer: Answer
  /** Facitsvaret så som det står i boken (MathText). */
  facit: string
  facitFigures?: Figure[]
  /** Uppgiften ber om motivering/förklaring utöver svaret – den självbedöms. */
  motivation?: boolean
  /** Bokens ledtråd (blå text). */
  hint?: string
  /** Bokens lösning eller motivering (blå text). */
  solution?: string
  needsReview?: boolean
  reviewNote?: string
  reviewed?: boolean
}

export interface Exercise {
  /** Unikt id, t.ex. "1104" eller "k1b-13". */
  id: string
  /** Numret som visas, t.ex. "1104" eller "13". */
  number: string
  chapter: number
  /** Avsnitt, t.ex. "1.1", eller "1-blandade". */
  section: string
  /** Delområde inom avsnittet, t.ex. "Lådprincipen". */
  topic?: string
  level: Level
  /** Bara för blandade övningar: Del I utan räknare / Del II med räknare. */
  calculator?: boolean
  /** Boksida där uppgiften står. */
  page: number
  /** Boksida där facit står. */
  facitPage: number
  /** Gemensam uppgiftstext före deluppgifterna. */
  prompt: string
  figures?: Figure[]
  parts: Part[]
}

export interface SectionFile {
  section: string
  title: string
  exercises: Exercise[]
}

export interface ContentIndex {
  book: { title: string; note?: string }
  chapters: {
    id: number
    title: string
    sections: { id: string; title: string; file: string }[]
  }[]
  /** Boksida → bildfil. */
  pages: Record<string, string>
  facitPages: Record<string, string>
}

/* ---------- Genomgångar ---------- */

/** En del av en genomgång. Alla texter är MathText. */
export type LessonBlock =
  /** Vanlig brödtext. */
  | { type: 'text'; text: string }
  /** Ett begrepp som förklaras (bokens marginalord). */
  | { type: 'term'; term: string; text: string }
  /** En regel eller formel i bokens röda ruta. */
  | { type: 'rule'; title: string; text: string }
  /** Ett löst exempel som visas steg för steg. */
  | { type: 'example'; title: string; prompt: string; figures?: Figure[]; steps: LessonStep[]; answer?: string }
  /** En fråga att testa sig själv på, med samma rättning som uppgifterna. */
  | { type: 'check'; prompt: string; figures?: Figure[]; answer: Answer; solution: string; hint?: string }
  /** En eller flera figurer. */
  | { type: 'figure'; figures: Figure[]; caption?: string }
  /** Tips, t.ex. om räknaren. */
  | { type: 'tip'; text: string }
  /** Historik eller fördjupning. */
  | { type: 'aside'; title: string; text: string }

/** Ett steg i ett exempel: text, eventuellt med en figur. */
export type LessonStep = string | { text: string; figures?: Figure[] }

export interface Lesson {
  /** T.ex. "ladprincipen". */
  id: string
  chapter: number
  section: string
  /** Samma delområde som uppgifterna har (Exercise.topic). */
  topic: string
  title: string
  /** En mening om vad genomgången handlar om. */
  summary: string
  /** Boksidor genomgången bygger på. */
  pages: number[]
  /** Ungefärlig tid i minuter. */
  minutes: number
  blocks: LessonBlock[]
}

export interface LessonFile {
  lessons: Lesson[]
}
