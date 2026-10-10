// Översikten över genomgångarna, ordnade efter avsnitt.
import { useState } from 'react'
import { Poster, motifFor } from '../design/Cover.tsx'
import { Check, Play } from '../design/icons.tsx'
import { Nav, useContent } from '../library/Library.tsx'
import { useProgress } from '../progress/progress.ts'
import { SettingsDialog } from '../settings/SettingsDialog.tsx'
import { ThemeEditor } from '../design/ThemeEditor.tsx'
import { lessonHref, practiceHref, useLessons } from './data.ts'
import { useLessonProgress } from './progress.ts'
import '../library/library.css'
import './lessons.css'

export function LessonsIndex() {
  const lessons = useLessons()
  const content = useContent()
  const progress = useProgress(content?.exercises)
  const lp = useLessonProgress()
  const [settingsOpen, setSettingsOpen] = useState(false)
  if (!lessons || !content || !progress) return <div className="mk-loading">Laddar …</div>

  if (!lessons.length) return <div className="mk-loading">Genomgångarna finns inte i den här versionen av boken än.</div>
  const done = lessons.filter((l) => lp[l.id]?.done).length
  // Fortsätt med den senast öppnade som inte är klar, annars nästa som inte är klar.
  const started = lessons.filter((l) => lp[l.id]?.seen && !lp[l.id]?.done).sort((a, b) => (lp[b.id]!.seen ?? 0) - (lp[a.id]!.seen ?? 0))[0]
  const upNext = started ?? lessons.find((l) => !lp[l.id]?.done) ?? lessons[0]
  const sections = content.index.chapters.flatMap((c) => c.sections).filter((s) => lessons.some((l) => l.section === s.id))

  return (
    <div className="mk grain">
      <Nav streak={progress.streakDays} onSettings={() => setSettingsOpen(true)} active="learn" />
      <section className="li-hero">
        <span className="ls-kicker">Lär dig</span>
        <h1>Förstå först – öva sedan.</h1>
        <p>
          Bokens teori och exempel, en genomgång per delområde. Exemplen visas steg för steg, och små testfrågor kollar att du hängt med. {done} av {lessons.length} genomgångar klara.
        </p>
        <a className="mk-btn-primary li-cta" href={lessonHref(upNext.id)}>
          <Play size={18} /> {lp[upNext.id]?.seen ? 'Fortsätt' : 'Börja'} med {upNext.title}
        </a>
      </section>

      {sections.map((s) => (
        <section key={s.id} className="li-section">
          <h2>
            {s.id} {s.title}
          </h2>
          <div className="li-grid">
            {lessons
              .filter((l) => l.section === s.id)
              .map((l) => {
                const p = lp[l.id]
                const checks = l.blocks.filter((b) => b.type === 'check').length
                const inTopic = content.exercises.filter((e) => e.topic === l.topic)
                const topic = { total: inTopic.length, solved: inTopic.filter((e) => progress.byExercise[e.id].status === 'correct').length }
                return (
                  <div key={l.id} className={`li-card ${p?.done ? 'done' : ''}`}>
                    <a className="mk-poster-btn li-poster" href={lessonHref(l.id)}>
                      <Poster motif={motifFor(l.topic)} seed={`${l.section}-${l.topic}`} kicker="Genomgång" title={l.topic} />
                      {p?.done && (
                        <span className="mk-badge ok" title="Klar">
                          <Check size={14} strokeWidth={3} />
                        </span>
                      )}
                    </a>
                    <div className="li-info">
                      <a href={lessonHref(l.id)} className="li-title">
                        {l.title}
                      </a>
                      <p>{l.summary}</p>
                      <span className="li-meta">
                        ≈ {l.minutes} min · {(p?.checks.length ?? 0)}/{checks} testfrågor
                      </span>
                      <a className="li-practice" href={practiceHref(l)}>
                        Öva · {topic.solved} av {topic.total} uppgifter klara
                      </a>
                    </div>
                  </div>
                )
              })}
          </div>
        </section>
      ))}

      <footer className="mk-foot">Genomgångarna bygger på bokens sidor och är bara för eget bruk.</footer>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <ThemeEditor />
    </div>
  )
}
