import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Exercise } from '../content/types.ts'
import { loadContent, type Content } from '../content/load.ts'
import { CoverArt, Poster, motifFor } from '../design/Cover.tsx'
import { Bookmark, Check, ChevronLeft, ChevronRight, Flame, Gear, Play, Target } from '../design/icons.tsx'
import { savedFirst, useBookmarks } from '../bookmarks/bookmarks.ts'
import { lessonHref, useLessons } from '../lessons/data.ts'
import { startRedoSession } from '../exercise/redoSession.ts'
import { useLessonProgress } from '../lessons/progress.ts'
import { MathText } from '../ui/MathText.tsx'
import { Figure } from '../ui/Figure.tsx'
import { ThemeEditor } from '../design/ThemeEditor.tsx'
import { SettingsDialog } from '../settings/SettingsDialog.tsx'
import { recommend, useProgress, type Progress, type Status } from '../progress/progress.ts'
import './library.css'

/** Innehållet laddas en gång och delas av biblioteket och kapitelsidan. */
let contentPromise: Promise<Content> | null = null
export function useContent() {
  const [content, setContent] = useState<Content | null>(null)
  useEffect(() => {
    contentPromise ??= loadContent()
    contentPromise.then(setContent)
  }, [])
  return content
}

export const exerciseHref = (id: string) => `#/uppgift/${encodeURIComponent(id)}`
export const sectionLabel = (s: { section: string; title: string }) => (s.section.includes('.') ? `${s.section} ${s.title}` : s.title)

const firstSentence = (s: string) => {
  const plain = s.replace(/\$[^$]*\$/g, '…').replace(/\*|\n|- /g, ' ')
  const m = /^(.{20,140}?[.?!])(\s|$)/.exec(plain)
  return (m ? m[1] : plain.slice(0, 120) + (plain.length > 120 ? '…' : '')).trim()
}

/** Låter kortets nummer ”flyga” in till uppgiftssidan (View Transitions). */
export function markTransition(e: React.MouseEvent<HTMLElement>) {
  document.querySelectorAll<HTMLElement>('[style*="view-transition-name"]').forEach((el) => (el.style.viewTransitionName = ''))
  const num = e.currentTarget.querySelector<HTMLElement>('[data-vt="num"]')
  if (num) num.style.viewTransitionName = 'ex-num'
}

export function Library() {
  const content = useContent()
  const bookmarks = useBookmarks()
  const lessons = useLessons()
  const lp = useLessonProgress()
  const progress = useProgress(content?.exercises)
  const [settingsOpen, setSettingsOpen] = useState(false)
  if (!content || !progress) return <div className="mk-loading">Laddar …</div>

  const { exercises } = content
  const st = (e: Exercise) => progress.byExercise[e.id].status
  const featured = recommend(exercises, progress)
  const resume = [
    ...exercises.filter((e) => st(e) === 'attempted').sort((a, b) => progress.byExercise[b.id].lastAt - progress.byExercise[a.id].lastAt),
    ...exercises.slice(Math.max(0, exercises.indexOf(featured))).filter((e) => st(e) === 'new').slice(0, 6),
  ].filter((e, i, all) => all.indexOf(e) === i)
  // Allt du fått fel på någon gång och inte gjort om felfritt: mest missade först.
  const redo = exercises.filter((e) => progress.byExercise[e.id].needsRedo).sort((a, b) => progress.byExercise[b.id].wrong - progress.byExercise[a.id].wrong || progress.byExercise[b.id].lastAt - progress.byExercise[a.id].lastAt)
  const saved = savedFirst(exercises, bookmarks)
  const topics = [...new Map(exercises.map((e) => [`${e.section}|${e.topic}`, e])).values()]

  return (
    <div className="mk grain">
      <Nav streak={progress.streakDays} onSettings={() => setSettingsOpen(true)} active="home" />
      <Hero ex={featured} progress={progress} total={exercises.length} />

      <div className="mk-rows">
        <Row title={progress.solvedTotal || resume.some((e) => st(e) === 'attempted') ? 'Fortsätt där du slutade' : 'Börja här'}>
          {resume.map((e) => (
            <Tile key={e.id} ex={e} progress={progress} />
          ))}
        </Row>
        {lessons && lessons.length > 0 && (
          <Row title="Lär dig" note="Bokens teori och exempel steg för steg – läs genomgången innan du övar." href="#/lar" variant="posters">
            {lessons.map((l) => (
              <a key={l.id} className="mk-poster-btn" href={lessonHref(l.id)} style={{ position: 'relative' }}>
                <Poster motif={motifFor(l.topic)} seed={`${l.section}-${l.topic}`} kicker="Genomgång" title={l.topic} />
                {lp[l.id]?.done && (
                  <span className="mk-badge ok" title="Klar">
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
              </a>
            ))}
          </Row>
        )}
        {saved.length > 0 && (
          <Row title="Sparade till senare" note="Tryck på bokmärket på en uppgift för att spara eller ta bort den.">
            {saved.map((e) => (
              <Tile key={e.id} ex={e} progress={progress} />
            ))}
          </Row>
        )}
        {redo.length > 0 && (
          <Row
            title="Gör om"
            note="Uppgifter du fått fel på. Gör om dem utan fel så försvinner de härifrån."
            meta={
              <button className="mk-redo-start" onClick={() => startRedoSession(redo.map((e) => e.id))}>
                <Play size={14} /> Starta repetition ({redo.length})
              </button>
            }
          >
            {redo.map((e) => (
              <Tile key={e.id} ex={e} progress={progress} />
            ))}
          </Row>
        )}
        <Row title="Avsnitt" variant="posters">
          {topics.map((e) => (
            <a key={`${e.section}${e.topic}`} className="mk-poster-btn" href={`#/kapitel/${e.chapter}?avsnitt=${encodeURIComponent(e.section)}&omrade=${encodeURIComponent(e.topic ?? '')}`}>
              <Poster motif={motifFor(e.topic)} seed={`${e.section}-${e.topic}`} kicker={e.section.includes('.') ? e.section : 'Blandat'} title={e.topic ?? ''} />
            </a>
          ))}
        </Row>
        {content.sections.map((s) => {
          const stats = progress.sections.find((x) => x.section === s.section)!
          return (
            <Row
              key={s.section}
              title={sectionLabel(s)}
              href={`#/kapitel/${s.exercises[0]?.chapter ?? 1}?avsnitt=${encodeURIComponent(s.section)}`}
              meta={
                <span className="mk-row-progress">
                  <span className="mk-bar">
                    <span style={{ width: `${(100 * stats.solved) / stats.total}%` }} />
                  </span>
                  {stats.solved} av {stats.total}
                </span>
              }
            >
              {s.exercises.map((e) => (
                <Tile key={e.id} ex={e} progress={progress} />
              ))}
            </Row>
          )
        })}
      </div>
      <footer className="mk-foot">Innehållet är avskrivet från din egen bok för eget bruk. Allt du gör sparas bara i den här webbläsaren – gör en backup under Inställningar → Data.</footer>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <ThemeEditor />
    </div>
  )
}

export function Nav({ streak, onSettings, active }: { streak: number; onSettings: () => void; active: 'home' | 'chapter' | 'learn' | 'stats' }) {
  return (
    <header className="mk-nav">
      <a className="mk-logo" href="#/">
        matte<span>.</span>
      </a>
      <nav>
        <a className={active === 'home' ? 'on' : ''} href="#/">
          Hem
        </a>
        <a className={active === 'chapter' ? 'on' : ''} href="#/kapitel/1">
          Kapitel
        </a>
        <a className={active === 'learn' ? 'on' : ''} href="#/lar">
          Lär dig
        </a>
        <a className={active === 'stats' ? 'on' : ''} href="#/statistik">
          Statistik
        </a>
      </nav>
      <div className="mk-nav-right">
        <span className="mk-streak" title="Dagar i rad">
          <Flame size={16} /> {streak}
        </span>
        <button aria-label="Inställningar" onClick={onSettings}>
          <Gear size={19} />
        </button>
      </div>
    </header>
  )
}

function Hero({ ex, progress, total }: { ex: Exercise; progress: Progress; total: number }) {
  const p = progress.byExercise[ex.id]
  const max = Math.max(1, ...progress.week)
  const kicker = p.status === 'attempted' ? 'Fortsätt räkna' : p.status === 'missed' ? 'Prova igen' : progress.solvedTotal ? 'Nästa uppgift' : 'Kom igång'
  return (
    <section className="mk-hero">
      <CoverArt className="mk-hero-art" motif={motifFor(ex.topic)} seed={`hero-${ex.topic}`} width={1600} height={900} />
      <div className="mk-hero-shade" />
      <div className="mk-hero-inner">
        <div className="mk-hero-copy">
          <p className="mk-kicker">
            {kicker} · {ex.section.includes('.') ? ex.section : 'Blandat'} {ex.topic}
          </p>
          <h1 className="mk-hero-num" data-vt="num">
            {ex.number}
          </h1>
          <p className="mk-hero-lead">{firstSentence(ex.prompt || ex.parts[0].prompt || '')}</p>
          <div className="mk-hero-meta">
            <span className={`mk-lvl mk-lvl-${ex.level}`}>Nivå {ex.level.toUpperCase()}</span>
            <span>{ex.parts.length > 1 ? `${ex.parts.length} deluppgifter` : '1 uppgift'}</span>
            {p.done > 0 && <span>{Math.round(p.done * 100)} % klar</span>}
          </div>
          <div className="mk-hero-actions">
            <a className="mk-btn-primary" href={exerciseHref(ex.id)} onClick={(e) => markTransition(e as never)}>
              <Play size={18} /> {p.status === 'attempted' ? 'Fortsätt räkna' : 'Börja räkna'}
            </a>
            <a className="mk-btn-ghost" href={`#/kapitel/${ex.chapter}?avsnitt=${encodeURIComponent(ex.section)}`}>
              Visa avsnittet
            </a>
          </div>
        </div>

        <a className="mk-hero-card" href={exerciseHref(ex.id)} aria-label={`Öppna uppgift ${ex.number}`}>
          <div className="mk-hero-card-inner">
            <span className="mk-hero-card-num">{ex.number}</span>
            <MathText text={ex.prompt} />
            {ex.figures?.[0] && <Figure figure={ex.figures[0]} />}
            {ex.parts.map(
              (part, i) =>
                part.label && (
                  <div key={i} className="mk-hero-card-part">
                    <b>{part.label})</b> <MathText text={part.prompt ?? ''} />
                  </div>
                ),
            )}
          </div>
        </a>
      </div>

      <div className="mk-stats">
        <div className="mk-stat">
          <Flame size={22} className="mk-stat-icon flame" />
          <div>
            <strong>{progress.streakDays === 1 ? '1 dag' : `${progress.streakDays} dagar`}</strong>
            <span>{progress.streakDays ? 'i rad – räkna idag för att hålla igång' : 'i rad – börja idag!'}</span>
          </div>
        </div>
        <div className="mk-stat">
          <div className="mk-spark" aria-hidden="true">
            {progress.week.map((v, i) => (
              <i key={i} style={{ height: `${12 + (v / max) * 88}%` }} className={i === progress.week.length - 1 ? 'today' : ''} />
            ))}
          </div>
          <div>
            <strong>{progress.solvedThisWeek} lösta</strong>
            <span>uppgifter den här veckan</span>
          </div>
        </div>
        <div className="mk-stat">
          <Ring value={progress.accuracy ?? 0} />
          <div>
            <strong>{progress.accuracy === null ? '–' : `${Math.round(progress.accuracy * 100)} % rätt`}</strong>
            <span>på första försöket</span>
          </div>
        </div>
        <a className="mk-stat" href="#/statistik">
          <Target size={22} className="mk-stat-icon" />
          <div>
            <strong>
              {progress.solvedTotal} av {total}
            </strong>
            <span>uppgifter klara i kapitel 1</span>
          </div>
        </a>
      </div>
    </section>
  )
}

export function Ring({ value, size = 34 }: { value: number; size?: number }) {
  const r = size / 2 - 3
  const c = 2 * Math.PI * r
  return (
    <svg className="mk-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="track" />
      <circle cx={size / 2} cy={size / 2} r={r} className="fill" strokeDasharray={`${c * value} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  )
}

function Row({ title, note, meta, href, variant, children }: { title: string; note?: string; meta?: ReactNode; href?: string; variant?: 'posters'; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })
  const update = () => {
    const el = track.current
    if (el) setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 })
  }
  useEffect(update, [])
  const scroll = (dir: number) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.85, behavior: 'smooth' })
  return (
    <section className={`mk-row ${variant ?? ''}`}>
      <div className="mk-row-head">
        <h2>{href ? <a href={href}>{title}</a> : title}</h2>
        {meta}
        {note && <p className="mk-row-note">{note}</p>}
        {href && (
          <a className="mk-row-all" href={href}>
            Visa alla <ChevronRight size={15} />
          </a>
        )}
      </div>
      <div className="mk-row-body">
        {!edges.start && (
          <button className="mk-arrow left" onClick={() => scroll(-1)} aria-label="Bläddra bakåt">
            <ChevronLeft size={28} />
          </button>
        )}
        <div className="mk-track" ref={track} onScroll={update}>
          {children}
        </div>
        {!edges.end && (
          <button className="mk-arrow right" onClick={() => scroll(1)} aria-label="Bläddra framåt">
            <ChevronRight size={28} />
          </button>
        )}
      </div>
    </section>
  )
}

const STATUS_LABEL: Record<Status, string> = { new: 'Ny', attempted: 'Påbörjad', correct: 'Klar', missed: 'Missad' }

export function Tile({ ex, progress }: { ex: Exercise; progress: Progress }) {
  const p = progress.byExercise[ex.id]
  const saved = !!useBookmarks()[ex.id]
  const fig = [...(ex.figures ?? []), ...ex.parts.flatMap((p) => p.figures ?? [])].find((f) => f.kind !== 'table')
  return (
    <a className={`mk-tile st-${p.status} ${saved ? 'saved' : ''}`} href={exerciseHref(ex.id)} onClick={markTransition} aria-label={`Uppgift ${ex.number}, nivå ${ex.level}, ${STATUS_LABEL[p.status]}${saved ? ', sparad till senare' : ''}`}>
      <div className="mk-tile-card">
        <div className="mk-tile-thumb" aria-hidden="true">
          <MathText text={ex.prompt || ex.parts[0].prompt || ''} />
          {fig && (
            <div className="mk-tile-fig">
              <Figure figure={fig} />
            </div>
          )}
        </div>
        <div className="mk-tile-shade" />
        <span className={`mk-lvl mk-lvl-${ex.level}`}>{ex.level.toUpperCase()}</span>
        {p.status === 'correct' && (
          <span className="mk-badge ok">
            <Check size={14} strokeWidth={3} />
          </span>
        )}
        {p.status !== 'correct' && p.needsRedo && <span className="mk-badge miss">{p.wrong} fel</span>}
        {saved && (
          <span className="mk-saved" title="Sparad till senare">
            <Bookmark size={14} filled />
          </span>
        )}
        <span className="mk-tile-num" data-vt="num">
          {ex.number}
        </span>
        {(p.status === 'attempted' || (p.status === 'missed' && p.done > 0)) && (
          <span className="mk-tile-progress">
            <span style={{ width: `${Math.max(0.08, p.done) * 100}%` }} />
          </span>
        )}
        <div className="mk-tile-more">
          <span className="mk-tile-play">
            <Play size={14} />
          </span>
          <span>
            {ex.topic} · {ex.parts.length > 1 ? `${ex.parts.length} delar` : '1 del'}
          </span>
        </div>
      </div>
    </a>
  )
}
