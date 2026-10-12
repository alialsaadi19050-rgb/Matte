// npm run ingest
//
// Läser in bokens innehåll (public/content/data), kontrollerar varje uppgift
// och skriver en sammanställning. Avslutar med felkod om något är fel, så att
// trasigt innehåll aldrig når appen.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ContentIndex, Exercise, SectionFile } from '../src/content/types.ts'
import { validateExercise, type Issue } from '../src/content/validate.ts'

const ROOT = join(import.meta.dirname, '..', 'public', 'content')
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

const index = readJson<ContentIndex>(join(ROOT, 'data', 'index.json'))
const issues: Issue[] = []
const all: Exercise[] = []

for (const [page, file] of [...Object.entries(index.pages), ...Object.entries(index.facitPages)]) {
  if (!existsSync(join(ROOT, file))) issues.push({ level: 'error', where: `sida ${page}`, message: `bilden ${file} saknas` })
}

for (const chapter of index.chapters) {
  for (const section of chapter.sections) {
    const data = readJson<SectionFile>(join(ROOT, 'data', section.file))
    for (const ex of data.exercises) {
      all.push(ex)
      issues.push(...validateExercise(ex, { figureExists: (src) => existsSync(join(ROOT, src)) }))
      // Sida 0: uppgiften kommer inte från boken.
      if (ex.page && !index.pages[String(ex.page)]) issues.push({ level: 'warning', where: ex.id, message: `ingen bild för boksida ${ex.page}` })
      if (ex.facitPage && !index.facitPages[String(ex.facitPage)]) issues.push({ level: 'warning', where: ex.id, message: `ingen bild för facitsida ${ex.facitPage}` })
    }
  }
}

const ids = new Map<string, number>()
for (const ex of all) ids.set(ex.id, (ids.get(ex.id) ?? 0) + 1)
for (const [id, n] of ids) if (n > 1) issues.push({ level: 'error', where: id, message: `id:t används ${n} gånger` })

const parts = all.flatMap((ex) => ex.parts.map((p) => ({ ex, p })))
const byType = new Map<string, number>()
for (const { p } of parts) byType.set(p.answer.type, (byType.get(p.answer.type) ?? 0) + 1)
const auto = parts.filter(({ p }) => p.answer.type !== 'self').length
const review = parts.filter(({ p }) => p.needsReview && !p.reviewed)

console.log(`\n${all.length} uppgifter, ${parts.length} deluppgifter`)
console.log(`Rättas automatiskt: ${auto} (${Math.round((100 * auto) / parts.length)} %), självbedöms: ${parts.length - auto}`)
console.log('Svarstyper: ' + [...byType].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(', '))

if (review.length) {
  console.log(`\nBehöver granskas (${review.length}):`)
  for (const { ex, p } of review) console.log(`  ${ex.number}${p.label ?? ''}  ${(p.reviewNote ?? '').slice(0, 90)}…`)
}

const errors = issues.filter((i) => i.level === 'error')
const warnings = issues.filter((i) => i.level === 'warning')
for (const i of warnings) console.log(`varning  ${i.where}: ${i.message}`)
for (const i of errors) console.log(`FEL      ${i.where}: ${i.message}`)
console.log(errors.length ? `\n${errors.length} fel.` : '\nInnehållet är OK.')
process.exit(errors.length ? 1 : 0)
