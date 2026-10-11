import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Answer, Exercise, Part } from '../content/types.ts'
import { loadContent, pageImageUrl, saveExercise, type Content } from '../content/load.ts'
import { describeAnswer } from '../content/describe.ts'
import { checkAnswer } from '../content/validate.ts'
import { MathText } from '../ui/MathText.tsx'
import { Figures } from '../ui/Figure.tsx'
import { PageViewer } from './PageViewer.tsx'
import './review.css'

type Filter = 'all' | 'review' | 'unreviewed' | 'self'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Alla' },
  { id: 'review', label: 'Misstänkta fel' },
  { id: 'unreviewed', label: 'Ej granskade' },
  { id: 'self', label: 'Självbedöms' },
]

const isReviewed = (ex: Exercise) => ex.parts.every((p) => p.reviewed)
const needsReview = (ex: Exercise) => ex.parts.some((p) => p.needsReview && !p.reviewed)
const partName = (ex: Exercise, p: Part) => `${ex.number}${p.label ?? ''}`

function readHashId(): string | null {
  const m = /[?&]id=([^&]+)/.exec(location.hash)
  return m ? decodeURIComponent(m[1]) : null
}

export function ReviewPage() {
  const [content, setContent] = useState<Content | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Record<string, Exercise>>({})
  const [drafts, setDrafts] = useState<Record<string, Exercise>>({})
  const [selected, setSelected] = useState<string | null>(readHashId())
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'page' | 'facit'>('page')
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; message?: string }>({ kind: 'idle' })

  useEffect(() => {
    loadContent()
      .then((c) => {
        setContent(c)
        setSaved(Object.fromEntries(c.exercises.map((e) => [e.id, e])))
        setSelected((s) => s ?? c.exercises[0]?.id ?? null)
      })
      .catch((e) => setLoadError(String(e)))
  }, [])

  useEffect(() => {
    const onHash = () => {
      const id = readHashId()
      if (id) setSelected(id)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const order = useMemo(() => content?.exercises.map((e) => e.id) ?? [], [content])
  const current = (id: string) => drafts[id] ?? saved[id]

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return order.filter((id) => {
      const ex = drafts[id] ?? saved[id]
      if (!ex) return false
      if (q && !ex.number.toLowerCase().startsWith(q) && !ex.id.toLowerCase().includes(q)) return false
      if (filter === 'review') return needsReview(ex)
      if (filter === 'unreviewed') return !isReviewed(ex)
      if (filter === 'self') return ex.parts.some((p) => p.answer.type === 'self' || p.motivation)
      return true
    })
  }, [order, drafts, saved, filter, query])

  const ex = selected ? current(selected) : undefined
  const dirty = !!(selected && drafts[selected])

  useEffect(() => {
    if (selected) history.replaceState(null, '', `#/granska?id=${encodeURIComponent(selected)}`)
    setStatus({ kind: 'idle' })
  }, [selected])

  const update = useCallback(
    (fn: (ex: Exercise) => Exercise) => {
      if (!selected) return
      setDrafts((d) => ({ ...d, [selected]: fn(structuredClone(d[selected] ?? saved[selected])) }))
    },
    [selected, saved],
  )

  const save = useCallback(
    async (exercise: Exercise) => {
      setStatus({ kind: 'saving' })
      try {
        await saveExercise(exercise)
        setSaved((s) => ({ ...s, [exercise.id]: exercise }))
        setDrafts((d) => {
          const { [exercise.id]: _, ...rest } = d
          return rest
        })
        setStatus({ kind: 'saved', message: 'Sparat' })
        return true
      } catch (e) {
        setStatus({ kind: 'error', message: (e as Error).message })
        return false
      }
    },
    [],
  )

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!visible.length) return
      const i = selected ? visible.indexOf(selected) : -1
      const next = visible[Math.min(visible.length - 1, Math.max(0, i + dir))]
      if (next) setSelected(next)
    },
    [visible, selected],
  )

  const approveAndNext = useCallback(async () => {
    if (!ex) return
    const approved = { ...structuredClone(ex), parts: ex.parts.map((p) => ({ ...p, reviewed: true })) }
    if (await save(approved)) step(1)
  }, [ex, save, step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select')
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (ex) save(ex)
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        approveAndNext()
      } else if (!typing && (e.key === 'ArrowDown' || e.key === 'j')) {
        e.preventDefault()
        step(1)
      } else if (!typing && (e.key === 'ArrowUp' || e.key === 'k')) {
        e.preventDefault()
        step(-1)
      } else if (!typing && e.key === 'f') {
        setTab((t) => (t === 'page' ? 'facit' : 'page'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ex, save, step, approveAndNext])

  if (loadError) return <div className="review-loading">Kunde inte läsa innehållet: {loadError}</div>
  if (!content) return <div className="review-loading">Läser in boken …</div>

  const all = order.map(current)
  const stats = {
    exercises: all.length,
    reviewed: all.filter(isReviewed).length,
    flagged: all.filter(needsReview).length,
  }

  let lastSection = ''
  return (
    <div className="review">
      <aside className="review-list">
        <div className="review-brand">
          <a href="#/">Matte</a> <span>/ Granskning</span>
        </div>
        <div className="review-progress">
          <div className="review-progress-bar">
            <span style={{ width: `${(100 * stats.reviewed) / stats.exercises}%` }} />
          </div>
          <p>
            {stats.reviewed} av {stats.exercises} granskade · {stats.flagged} misstänkta fel
          </p>
        </div>
        <input
          className="review-search"
          placeholder="Sök uppgift, t.ex. 1132"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="review-filters">
          {FILTERS.map((f) => (
            <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <ol>
          {visible.map((id) => {
            const e = current(id)
            const section = content.sections.find((s) => s.section === e.section)
            const heading = section && section.section !== lastSection ? section : null
            lastSection = e.section
            return (
              <li key={id}>
                {heading && <h3>{heading.section.includes('.') ? `${heading.section} ${heading.title}` : heading.title}</h3>}
                <button className={`review-item ${id === selected ? 'on' : ''}`} onClick={() => setSelected(id)}>
                  <span className="num">{e.number}</span>
                  <span className={`lvl lvl-${e.level}`}>{e.level}</span>
                  <span className="parts">{e.parts.length > 1 ? `${e.parts.length} delar` : ''}</span>
                  {drafts[id] && <span className="dot dirty" title="Osparade ändringar" />}
                  {needsReview(e) ? (
                    <span className="dot flag" title="Misstänkt fel i facit" />
                  ) : isReviewed(e) ? (
                    <span className="dot ok" title="Granskad" />
                  ) : null}
                </button>
              </li>
            )
          })}
          {visible.length === 0 && <li className="review-empty">Inga uppgifter matchar.</li>}
        </ol>
      </aside>

      <main className="review-main">
        {ex && (
          <>
            <div className="review-toolbar">
              <div className="review-toolbar-left">
                <button onClick={() => step(-1)} title="Föregående (↑)">↑</button>
                <button onClick={() => step(1)} title="Nästa (↓)">↓</button>
                <label className="toggle">
                  <input type="checkbox" checked={editing} onChange={(e) => setEditing(e.target.checked)} /> Redigera
                </label>
              </div>
              <div className="review-toolbar-right">
                <span className={`status ${status.kind}`}>
                  {status.kind === 'saving' ? 'Sparar …' : status.kind === 'error' ? 'Kunde inte spara' : dirty ? 'Osparade ändringar' : status.message ?? ''}
                </span>
                <button disabled={!dirty} onClick={() => save(ex)} title="Ctrl+S">
                  Spara
                </button>
                {dirty && (
                  <button onClick={() => setDrafts(({ [ex.id]: _, ...rest }) => rest)}>Ångra ändringar</button>
                )}
                <button className="primary" onClick={approveAndNext} title="Ctrl+Enter">
                  Stämmer – nästa
                </button>
              </div>
            </div>
            {status.kind === 'error' && <pre className="review-error">{status.message}</pre>}
            <ExerciseCard ex={ex} editing={editing} update={update} />
          </>
        )}
      </main>

      <section className="review-photo">
        {ex && (
          <>
            <div className="review-tabs">
              <button className={tab === 'page' ? 'on' : ''} onClick={() => setTab('page')}>
                Uppgift · s. {ex.page}
              </button>
              <button className={tab === 'facit' ? 'on' : ''} onClick={() => setTab('facit')}>
                Facit · s. {ex.facitPage}
              </button>
              <span className="review-tabs-hint">F växlar</span>
            </div>
            <PageViewer
              src={pageImageUrl(content.index, tab === 'page' ? ex.page : ex.facitPage, tab === 'facit')}
              alt={tab === 'page' ? `Boksida ${ex.page}` : `Facitsida ${ex.facitPage}`}
            />
          </>
        )}
      </section>
    </div>
  )
}

function ExerciseCard({ ex, editing, update }: { ex: Exercise; editing: boolean; update: (fn: (ex: Exercise) => Exercise) => void }) {
  return (
    <article className="paper">
      <header className="paper-head">
        <span className="paper-num">{ex.number}</span>
        <span className={`lvl lvl-${ex.level}`}>Nivå {ex.level}</span>
        <span className="paper-meta">
          {ex.topic && <>{ex.topic} · </>}s. {ex.page} · facit s. {ex.facitPage}
          {ex.calculator !== undefined && <> · {ex.calculator ? 'med räknare' : 'utan räknare'}</>}
        </span>
      </header>

      {editing && (
        <div className="edit-row">
          <label>
            Uppgiftstext
            <textarea value={ex.prompt} rows={Math.min(10, ex.prompt.split('\n').length + 2)} onChange={(e) => update((x) => ({ ...x, prompt: e.target.value }))} />
          </label>
          <label className="edit-inline">
            Nivå
            <select value={ex.level} onChange={(e) => update((x) => ({ ...x, level: e.target.value as Exercise['level'] }))}>
              <option value="a">a</option>
              <option value="b">b</option>
              <option value="c">c</option>
            </select>
          </label>
        </div>
      )}

      <MathText text={ex.prompt} className="paper-prompt" />
      <Figures figures={ex.figures} />

      {ex.parts.map((p, i) => (
        <PartView
          key={`${ex.id}-${i}`}
          ex={ex}
          part={p}
          editing={editing}
          onChange={(np) => update((x) => ({ ...x, parts: x.parts.map((q, j) => (j === i ? np : q)) }))}
        />
      ))}
    </article>
  )
}

function PartView({ ex, part, editing, onChange }: { ex: Exercise; part: Part; editing: boolean; onChange: (p: Part) => void }) {
  const d = describeAnswer(part.answer)
  return (
    <section className={`part ${part.needsReview && !part.reviewed ? 'flagged' : ''}`}>
      <div className="part-q">
        {part.label && <span className="part-label">{part.label})</span>}
        <MathText text={part.prompt ?? ''} />
        <Figures figures={part.figures} />
      </div>

      <div className="facit">
        <div className="facit-label">Facit</div>
        <div className="facit-body">
          <MathText text={part.facit} />
          <Figures figures={part.facitFigures} />
        </div>
      </div>

      <div className="answer-chip">
        <span className={`chip chip-${part.answer.type}`}>{d.kind}</span>
        <code>{d.detail}</code>
        {part.motivation && <span className="chip chip-self">+ motivering självbedöms</span>}
        {part.reviewed && <span className="chip chip-ok">Granskad</span>}
      </div>

      {part.hint && (
        <details className="extra">
          <summary>Ledtråd</summary>
          <MathText text={part.hint} />
        </details>
      )}
      {part.solution && (
        <details className="extra">
          <summary>Lösning / motivering</summary>
          <MathText text={part.solution} />
        </details>
      )}

      {part.needsReview && (
        <div className="review-note">
          <strong>{part.reviewed ? 'Granskad – ' : 'Misstänkt fel i facit – '}</strong>
          <MathText text={part.reviewNote ?? ''} />
        </div>
      )}

      {editing && <PartEditor key={partName(ex, part)} part={part} onChange={onChange} />}
    </section>
  )
}

function PartEditor({ part, onChange }: { part: Part; onChange: (p: Part) => void }) {
  const [answerText, setAnswerText] = useState(() => JSON.stringify(part.answer, null, 2))
  const [answerError, setAnswerError] = useState<string | null>(null)

  const setAnswer = (text: string) => {
    setAnswerText(text)
    try {
      const parsed = JSON.parse(text) as Answer
      const problems = checkAnswer(parsed)
      setAnswerError(problems.length ? problems.join('\n') : null)
      onChange({ ...part, answer: parsed })
    } catch (e) {
      setAnswerError(`Ogiltig JSON: ${(e as Error).message}`)
    }
  }

  const field = (key: 'prompt' | 'facit' | 'hint' | 'solution' | 'reviewNote', label: string) => (
    <label>
      {label}
      <textarea
        value={part[key] ?? ''}
        rows={Math.min(8, (part[key] ?? '').split('\n').length + 1)}
        onChange={(e) => onChange({ ...part, [key]: e.target.value || undefined })}
      />
    </label>
  )

  return (
    <div className="part-editor">
      {field('prompt', 'Deluppgiftens text')}
      {field('facit', 'Facit (som i boken)')}
      <label>
        Svar som rättas (JSON)
        <textarea className={answerError ? 'invalid' : ''} value={answerText} rows={Math.min(10, answerText.split('\n').length + 1)} onChange={(e) => setAnswer(e.target.value)} spellCheck={false} />
        {answerError && <span className="field-error">{answerError}</span>}
      </label>
      {field('hint', 'Ledtråd')}
      {field('solution', 'Lösning / motivering')}
      <div className="edit-flags">
        <label className="toggle">
          <input type="checkbox" checked={!!part.motivation} onChange={(e) => onChange({ ...part, motivation: e.target.checked || undefined })} /> Motivering självbedöms
        </label>
        <label className="toggle">
          <input type="checkbox" checked={!!part.needsReview} onChange={(e) => onChange({ ...part, needsReview: e.target.checked || undefined })} /> Misstänkt fel
        </label>
        <label className="toggle">
          <input type="checkbox" checked={!!part.reviewed} onChange={(e) => onChange({ ...part, reviewed: e.target.checked || undefined })} /> Granskad
        </label>
      </div>
      {part.needsReview && field('reviewNote', 'Granskningsanteckning')}
    </div>
  )
}
