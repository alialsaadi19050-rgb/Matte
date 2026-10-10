import { useMemo, useState } from 'react'
import type { Level } from '../content/types.ts'
import { CoverArt } from '../design/Cover.tsx'
import { ThemeEditor } from '../design/ThemeEditor.tsx'
import { SettingsDialog } from '../settings/SettingsDialog.tsx'
import { recommend, useProgress, type Status } from '../progress/progress.ts'
import { useBookmarks } from '../bookmarks/bookmarks.ts'
import { lessonHref, useLessons } from '../lessons/data.ts'
import { useLessonProgress } from '../lessons/progress.ts'
import { ChevronRight, Play } from '../design/icons.tsx'
import { exerciseHref, markTransition, Nav, sectionLabel, Tile, useContent } from './Library.tsx'

type Filter = Status | 'all' | 'saved'

const STATUS_FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Alla' },
  { id: 'new', label: 'Nya' },
  { id: 'attempted', label: 'Påbörjade' },
  { id: 'missed', label: 'Missade' },
  { id: 'correct', label: 'Klara' },
  { id: 'saved', label: 'Sparade' },
]

function readQuery() {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '')
  return { section: q.get('avsnitt'), topic: q.get('omrade') }
}

export function ChapterPage({ chapterId }: { chapterId: number }) {
  const content = useContent()
  const progress = useProgress(content?.exercises)
  const bookmarks = useBookmarks()
  const lessons = useLessons()
  const lp = useLessonProgress()
  const initial = useMemo(readQuery, [])
  const [section, setSection] = useState<string | null>(initial.section)
  const [topic, setTopic] = useState<string | null>(initial.topic || null)
  const [status, setStatus] = useState<Filter>('all')
  const [levels, setLevels] = useState<Set<Level>>(new Set())
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (!content || !progress) return <div className="mk-loading">Laddar …</div>
  const chapter = content.index.chapters.find((c) => c.id === chapterId) ?? content.index.chapters[0]
  const all = content.exercises.filter((e) => e.chapter === chapter.id)
  const solved = all.filter((e) => progress.byExercise[e.id].status === 'correct').length
  const share = all.length ? solved / all.length : 0
  const next = recommend(all, progress)

  const visible = all.filter(
    (e) =>
      (!section || e.section === section) &&
      (!topic || e.topic === topic) &&
      (status === 'all' || (status === 'saved' ? !!bookmarks[e.id] : progress.byExercise[e.id].status === status)) &&
      (!levels.size || levels.has(e.level)),
  )
  const topics = [...new Set(all.filter((e) => !section || e.section === section).map((e) => e.topic).filter(Boolean))] as string[]
  const groups = content.sections
    .filter((s) => s.exercises.some((e) => e.chapter === chapter.id))
    .map((s) => ({ s, items: visible.filter((e) => e.section === s.section) }))
    .filter((g) => g.items.length)

  const r = 54
  const c = 2 * Math.PI * r

  return (
    <div className="mk grain">
      <Nav streak={progress.streakDays} onSettings={() => setSettingsOpen(true)} active="chapter" />
      <section className="ch-hero">
        <CoverArt className="mk-hero-art" motif="lattice" seed={`kapitel-${chapter.id}`} width={1600} height={600} />
        <div className="mk-hero-shade" />
        <div className="ch-hero-inner">
          <div>
            <p className="mk-kicker">Kapitel {chapter.id}</p>
            <h1 className="ch-title">{chapter.title}</h1>
            <p className="mk-hero-lead">
              {solved} av {all.length} uppgifter klara · {progress.sections.filter((s) => chapter.sections.some((x) => x.id === s.section)).length} avsnitt
            </p>
            <div className="mk-hero-actions">
              <a className="mk-btn-primary" href={exerciseHref(next.id)} onClick={markTransition}>
                <Play size={18} /> {solved ? 'Fortsätt' : 'Börja'} med {next.number}
              </a>
            </div>
          </div>
          <div className="ch-ring" aria-label={`${Math.round(share * 100)} procent klart`}>
            <svg viewBox="0 0 128 128" aria-hidden="true">
              <circle cx="64" cy="64" r={r} className="track" />
              <circle cx="64" cy="64" r={r} className="fill" strokeDasharray={`${c * share} ${c}`} transform="rotate(-90 64 64)" />
            </svg>
            <span>
              <strong>{Math.round(share * 100)}</strong> %
            </span>
          </div>
        </div>
      </section>

      <div className="ch-body">
        <div className="ch-sections">
          <button className={`ch-section ${!section ? 'on' : ''}`} onClick={() => (setSection(null), setTopic(null))}>
            <span>Hela kapitlet</span>
            <span className="mk-bar">
              <span style={{ width: `${share * 100}%` }} />
            </span>
            <small>
              {solved} / {all.length}
            </small>
          </button>
          {chapter.sections.map((s) => {
            const st = progress.sections.find((x) => x.section === s.id)
            if (!st) return null
            return (
              <button key={s.id} className={`ch-section ${section === s.id ? 'on' : ''}`} onClick={() => (setSection(s.id), setTopic(null))}>
                <span>{sectionLabel({ section: s.id, title: s.title })}</span>
                <span className="mk-bar">
                  <span style={{ width: `${(100 * st.solved) / st.total}%` }} />
                </span>
                <small>
                  {st.solved} / {st.total}
                  {st.accuracy !== null && ` · ${Math.round(st.accuracy * 100)} % rätt direkt`}
                </small>
              </button>
            )
          })}
        </div>

        <div className="ch-filters" role="toolbar" aria-label="Filter">
          <div className="ch-chips">
            {STATUS_FILTERS.map((f) => (
              <button key={f.id} className={status === f.id ? 'on' : ''} onClick={() => setStatus(f.id)} aria-pressed={status === f.id}>
                {f.label}
                {f.id !== 'all' && <i>{all.filter((e) => (f.id === 'saved' ? !!bookmarks[e.id] : progress.byExercise[e.id].status === f.id) && (!section || e.section === section)).length}</i>}
              </button>
            ))}
          </div>
          <div className="ch-chips">
            {(['a', 'b', 'c'] as Level[]).map((l) => (
              <button
                key={l}
                className={levels.has(l) ? 'on' : ''}
                aria-pressed={levels.has(l)}
                onClick={() =>
                  setLevels((s) => {
                    const n = new Set(s)
                    if (n.has(l)) n.delete(l)
                    else n.add(l)
                    return n
                  })
                }
              >
                Nivå {l.toUpperCase()}
              </button>
            ))}
          </div>
          {topics.length > 1 && (
            <div className="ch-chips">
              {topics.map((t) => (
                <button key={t} className={topic === t ? 'on' : ''} aria-pressed={topic === t} onClick={() => setTopic(topic === t ? null : t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {(() => {
          const lesson = topic ? lessons?.find((l) => l.topic === topic) : null
          return (
            lesson && (
              <a className={`ch-lesson ${lp[lesson.id]?.done ? 'done' : ''}`} href={lessonHref(lesson.id)}>
                <span className="ls-label">Genomgång</span>
                <span>
                  <b>{lesson.title}</b> – {lp[lesson.id]?.done ? 'repetera teorin och exemplen.' : 'läs teorin och exemplen innan du börjar.'}
                </span>
                <ChevronRight size={16} />
              </a>
            )
          )
        })()}
        {groups.map(({ s, items }) => (
          <section key={s.section} className="ch-group">
            <h2>{sectionLabel(s)}</h2>
            <div className="ch-grid">
              {items.map((e) => (
                <Tile key={e.id} ex={e} progress={progress} />
              ))}
            </div>
          </section>
        ))}
        {!groups.length && <p className="ch-empty">Inga uppgifter matchar filtren.</p>}
      </div>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <ThemeEditor />
    </div>
  )
}
