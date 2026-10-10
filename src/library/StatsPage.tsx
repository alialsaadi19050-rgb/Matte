import { useState } from 'react'
import { ThemeEditor } from '../design/ThemeEditor.tsx'
import { SettingsDialog } from '../settings/SettingsDialog.tsx'
import { useProgress } from '../progress/progress.ts'
import { Flame } from '../design/icons.tsx'
import { Nav, Ring, sectionLabel, useContent } from './Library.tsx'

const DAYS = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör']

export function StatsPage() {
  const content = useContent()
  const progress = useProgress(content?.exercises)
  const [settingsOpen, setSettingsOpen] = useState<null | 'data' | 'tablet'>(null)
  if (!content || !progress) return <div className="mk-loading">Laddar …</div>

  const max = Math.max(1, ...progress.week)
  const today = new Date().getDay()
  const levels = (['a', 'b', 'c'] as const).map((l) => {
    const list = content.exercises.filter((e) => e.level === l)
    return { l, total: list.length, solved: list.filter((e) => progress.byExercise[e.id].status === 'correct').length }
  })

  return (
    <div className="mk grain">
      <Nav streak={progress.streakDays} onSettings={() => setSettingsOpen('tablet')} active="stats" />
      <main className="stp">
        <h1 className="ch-title">Statistik</h1>

        <div className="stp-cards">
          <div className="stp-card big">
            <Flame size={30} className="mk-stat-icon flame" />
            <strong>{progress.streakDays}</strong>
            <span>{progress.streakDays === 1 ? 'dag i rad' : 'dagar i rad'}</span>
          </div>
          <div className="stp-card big">
            <strong>{progress.solvedThisWeek}</strong>
            <span>uppgifter lösta den här veckan</span>
          </div>
          <div className="stp-card big">
            <Ring value={progress.accuracy ?? 0} size={46} />
            <strong>{progress.accuracy === null ? '–' : `${Math.round(progress.accuracy * 100)} %`}</strong>
            <span>rätt på första försöket</span>
          </div>
          <div className="stp-card big">
            <strong>
              {progress.solvedTotal}
              <small> / {content.exercises.length}</small>
            </strong>
            <span>uppgifter klara totalt</span>
          </div>
        </div>

        <section className="stp-section">
          <h2>De senaste sju dagarna</h2>
          <p className="mk-row-note">Antal rätta deluppgifter per dag.</p>
          <div className="stp-week" role="img" aria-label={`Rätta deluppgifter per dag: ${progress.week.join(', ')}`}>
            {progress.week.map((v, i) => (
              <div key={i} className={`stp-day ${i === 6 ? 'today' : ''}`}>
                <span className="stp-val">{v || ''}</span>
                <i style={{ height: `${(v / max) * 100}%` }} />
                <span className="stp-lbl">{i === 6 ? 'idag' : DAYS[(today - 6 + i + 7) % 7]}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="stp-section">
          <h2>Per avsnitt</h2>
          <div className="stp-rows">
            {progress.sections.map((s) => {
              const sec = content.sections.find((x) => x.section === s.section)!
              return (
                <a key={s.section} className="stp-row" href={`#/kapitel/1?avsnitt=${encodeURIComponent(s.section)}`}>
                  <span className="stp-name">{sectionLabel(sec)}</span>
                  <span className="stp-bar">
                    <span style={{ width: `${(100 * s.solved) / s.total}%` }} />
                  </span>
                  <span className="stp-num">
                    {s.solved} / {s.total}
                  </span>
                  <span className="stp-acc">{s.accuracy === null ? 'inga försök än' : `${Math.round(s.accuracy * 100)} % rätt direkt`}</span>
                </a>
              )
            })}
          </div>
        </section>

        <section className="stp-section">
          <h2>Per nivå</h2>
          <div className="stp-rows">
            {levels.map((x) => (
              <div key={x.l} className="stp-row">
                <span className="stp-name">
                  <span className={`mk-lvl mk-lvl-${x.l}`}>{x.l.toUpperCase()}</span> Nivå {x.l.toUpperCase()}
                </span>
                <span className="stp-bar">
                  <span style={{ width: `${(100 * x.solved) / x.total}%` }} />
                </span>
                <span className="stp-num">
                  {x.solved} / {x.total}
                </span>
                <span />
              </div>
            ))}
          </div>
        </section>

        <section className="stp-section">
          <h2>Din data</h2>
          <p className="mk-row-note">Allt sparas bara i den här webbläsaren. Gör en backup då och då, och flytta den till en annan dator om du byter.</p>
          <button className="mk-btn-ghost" onClick={() => setSettingsOpen('data')}>
            Backup och återställning
          </button>
        </section>
      </main>
      {settingsOpen && <SettingsDialog initialTab={settingsOpen} onClose={() => setSettingsOpen(null)} />}
      <ThemeEditor />
    </div>
  )
}
