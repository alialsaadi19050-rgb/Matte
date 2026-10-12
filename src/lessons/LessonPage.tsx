// En genomgång: bokens teori, regler och exempel, med exempel som visas steg för steg
// och små testfrågor som rättas på samma sätt som uppgifterna.
import { useEffect, useRef, useState } from 'react'
import type { Exercise, LessonBlock } from '../content/types.ts'
import { lessonHref, practiceHref, useLessons } from './data.ts'
import { checkAnswer, type CheckStatus } from '../check/check.ts'
import { MathInput, type MathInputHandle } from '../check/MathInput.tsx'
import { inputKind } from '../exercise/AnswerPanel.tsx'
import { AskAi } from '../ai/AskAi.tsx'
import { MathText } from '../ui/MathText.tsx'
import { Figures } from '../ui/Figure.tsx'
import { Check, ChevronLeft, ChevronRight, Lightbulb, Sparkle } from '../design/icons.tsx'
import { useContent } from '../library/Library.tsx'
import { markCheck, markDone, markSeen, useLessonProgress } from './progress.ts'
import { updateSettings, useSettings } from '../settings/settings.ts'
import '../library/library.css'
import '../exercise/exercise.css'
import './lessons.css'


export function LessonPage({ id }: { id: string }) {
  const lessons = useLessons()
  const content = useContent()
  const progress = useLessonProgress()
  const [askOpen, setAskOpen] = useState(false)
  const [scroll, setScroll] = useState(0)

  useEffect(() => {
    markSeen(id)
  }, [id])
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight
      setScroll(max > 0 ? Math.min(1, scrollY / max) : 0)
    }
    onScroll()
    addEventListener('scroll', onScroll, { passive: true })
    return () => removeEventListener('scroll', onScroll)
  }, [lessons])

  if (!lessons) return <div className="mk-loading">Laddar …</div>
  const index = lessons.findIndex((l) => l.id === id)
  const lesson = lessons[index]
  if (!lesson) return <div className="mk-loading">Hittar ingen genomgång som heter ”{id}”.</div>
  const next = lessons[index + 1]
  const p = progress[lesson.id] ?? { checks: [] }
  const checks = lesson.blocks.flatMap((b, i) => (b.type === 'check' ? [i] : []))
  const examples = lesson.blocks.filter((b) => b.type === 'example').length
  const practice = content?.exercises.filter((e: Exercise) => e.topic === lesson.topic).length
  const section = content?.index.chapters.flatMap((c) => c.sections).find((s) => s.id === lesson.section)

  return (
    <div className="ls grain">
      <header className="ls-top">
        <a className="ex-back" href="#/lar">
          <ChevronLeft size={18} /> Lär dig
        </a>
        <span className="ls-top-title">{lesson.title}</span>
        <button className={`ls-ask ${askOpen ? 'on' : ''}`} onClick={() => setAskOpen((o) => !o)} aria-pressed={askOpen}>
          <Sparkle size={15} /> Fråga AI
        </button>
        <span className="ls-scroll" style={{ transform: `scaleX(${scroll})` }} />
      </header>

      <article className="ls-article">
        <div className="ls-hero">
          <span className="ls-kicker">
            {section ? (section.id.includes(".") ? `${section.id} ${section.title}` : section.title) : lesson.section} · Genomgång
          </span>
          <h1>{lesson.title}</h1>
          <p className="ls-summary">{lesson.summary}</p>
          <p className="ls-meta">
            <span>≈ {lesson.minutes} min</span>
            <span>{examples} exempel</span>
            <span>
              {p.checks.length} av {checks.length} testfrågor
            </span>
            <span>Boksidor {lesson.pages.join(', ')}</span>
          </p>
        </div>

        {lesson.blocks.map((b, i) => (
          <Block key={`${lesson.id}-${i}`} block={b} solved={p.checks.includes(i)} onSolved={() => markCheck(lesson.id, i)} />
        ))}

        <section className={`ls-end ${p.done ? 'done' : ''}`}>
          <h2>{p.done ? 'Klar med genomgången!' : 'Har du koll på det här?'}</h2>
          <p>
            {p.done
              ? 'Nu är det dags att öva. Uppgifterna börjar lätt och blir svårare.'
              : `Markera genomgången som klar när du förstått reglerna och exemplen${checks.length ? ` – du har klarat ${p.checks.length} av ${checks.length} testfrågor` : ''}.`}
          </p>
          <div className="ls-end-actions">
            <button className="ls-btn ghost" onClick={() => markDone(lesson.id, !p.done)} aria-pressed={!!p.done}>
              <Check size={16} strokeWidth={3} /> {p.done ? 'Markerad som klar' : 'Markera som klar'}
            </button>
            <a className="ls-btn" href={practiceHref(lesson)} onClick={() => !p.done && markDone(lesson.id, true)}>
              Öva på uppgifterna{practice ? ` (${practice})` : ''} <ChevronRight size={16} />
            </a>
            {next && (
              <a className="ls-btn ghost" href={lessonHref(next.id)}>
                Nästa: {next.title} <ChevronRight size={16} />
              </a>
            )}
          </div>
        </section>
      </article>

      {askOpen && (
        <div className="ls-ai">
          <AskAi context={{ kind: 'lesson', lesson }} onClose={() => setAskOpen(false)} />
        </div>
      )}
    </div>
  )
}

function Block({ block: b, solved, onSolved }: { block: LessonBlock; solved: boolean; onSolved: () => void }) {
  switch (b.type) {
    case 'text':
      return <MathText className="ls-text" text={b.text} />
    case 'term':
      return (
        <div className="ls-term">
          <dfn>{b.term}</dfn>
          <MathText text={b.text} />
        </div>
      )
    case 'rule':
      return (
        <div className="ls-rule">
          <span className="ls-rule-title">{b.title}</span>
          <MathText text={b.text} />
        </div>
      )
    case 'example':
      return <Example block={b} />
    case 'check':
      return <CheckBlock block={b} solved={solved} onSolved={onSolved} />
    case 'figure':
      return (
        <figure className="ls-figure">
          <Figures figures={b.figures} />
          {b.caption && (
            <figcaption>
              <MathText text={b.caption} />
            </figcaption>
          )}
        </figure>
      )
    case 'tip':
      return (
        <div className="ls-tip">
          <Lightbulb size={18} />
          <MathText text={b.text} />
        </div>
      )
    case 'aside':
      return (
        <aside className="ls-aside">
          <span className="ls-aside-title">{b.title}</span>
          <MathText text={b.text} />
        </aside>
      )
  }
}

function Example({ block: b }: { block: Extract<LessonBlock, { type: 'example' }> }) {
  const [shown, setShown] = useState(0)
  const all = shown >= b.steps.length
  const last = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (shown > 0) last.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [shown])
  return (
    <section className="ls-example">
      <header>
        <span className="ls-label">Exempel</span>
        <h3>{b.title}</h3>
      </header>
      <MathText className="ls-prompt" text={b.prompt} />
      <Figures figures={b.figures} />
      {shown > 0 && (
        <ol className="ls-steps">
          {b.steps.slice(0, shown).map((s, i) => (
            <li key={i} ref={i === shown - 1 ? last : undefined}>
              <MathText text={typeof s === 'string' ? s : s.text} />
              {typeof s !== 'string' && <Figures figures={s.figures} />}
            </li>
          ))}
        </ol>
      )}
      {all && b.answer && (
        <p className="ls-answer">
          <b>Svar:</b> <MathText text={b.answer} />
        </p>
      )}
      <div className="ls-example-actions">
        {!all ? (
          <>
            <button className="ls-btn small" onClick={() => setShown((n) => n + 1)}>
              {shown === 0 ? 'Visa lösningen steg för steg' : `Nästa steg (${shown + 1} av ${b.steps.length})`}
            </button>
            {b.steps.length > 1 && (
              <button className="ls-link" onClick={() => setShown(b.steps.length)}>
                Visa allt
              </button>
            )}
          </>
        ) : (
          <button className="ls-link" onClick={() => setShown(0)}>
            Dölj lösningen
          </button>
        )}
      </div>
    </section>
  )
}

function CheckBlock({ block: b, solved, onSolved }: { block: Extract<LessonBlock, { type: 'check' }>; solved: boolean; onSolved: () => void }) {
  const settings = useSettings()
  const kind = inputKind(b.answer)
  const field = useRef<MathInputHandle>(null)
  const [result, setResult] = useState<{ status: CheckStatus; message: string; hint?: string } | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [showSolution, setShowSolution] = useState(false)
  const [correct, setCorrect] = useState(solved)
  const mode = kind.mode === 'math' && settings.inputMode === 'text' ? 'text' : kind.mode === 'math' ? 'math' : 'text'

  const submit = (raw?: string) => {
    const input = raw ?? field.current?.plain() ?? ''
    const r = checkAnswer(b.answer, input)
    setResult(r)
    if (r.status === 'correct') {
      setCorrect(true)
      setShowSolution(true)
      onSolved()
    }
  }

  return (
    <section className={`ls-check ${correct ? 'solved' : ''}`}>
      <header>
        <span className="ls-label">Testa dig själv</span>
        {correct && (
          <span className="ls-check-ok">
            <Check size={14} strokeWidth={3} /> Klarad
          </span>
        )}
      </header>
      <MathText className="ls-prompt" text={b.prompt} />
      <Figures figures={b.figures} />
      {b.answer.type === 'choice' ? (
        <div className="ex-choices">
          {b.answer.options.map((o) => (
            <button key={o} className="ex-check" onClick={() => submit(o)}>
              {o}
            </button>
          ))}
        </div>
      ) : (
        <div className="ex-input-row">
          <div className="ex-input">
            <MathInput ref={field} mode={mode} label="Ditt svar" placeholder={kind.placeholder} symbols={kind.symbols} onEnter={() => submit()} onInput={() => result?.status === 'invalid' && setResult(null)} />
            {b.answer.type === 'number' && b.answer.noun && <span className="ex-unit">{b.answer.noun}</span>}
          </div>
          <button className="ex-check" onClick={() => submit()}>
            Kontrollera
          </button>
        </div>
      )}
      {result && <p className={`ex-msg ${result.status}`}>{result.status === 'correct' ? 'Rätt!' : result.message}</p>}
      {result?.hint && result.status !== 'correct' && <p className="ex-msg tip">{result.hint}</p>}
      <div className="ex-field-tools">
        {kind.mode === 'math' && (
          <button onClick={() => updateSettings({ inputMode: settings.inputMode === 'text' ? 'math' : 'text' })}>{settings.inputMode === 'text' ? 'Mattefält' : 'Vanlig text'}</button>
        )}
        {b.hint && !correct && (
          <button onClick={() => setShowHint((s) => !s)} aria-expanded={showHint}>
            <Lightbulb size={15} /> Ledtråd
          </button>
        )}
        <button onClick={() => setShowSolution((s) => !s)} aria-expanded={showSolution}>
          {showSolution ? 'Dölj lösningen' : 'Visa lösningen'}
        </button>
      </div>
      {showHint && b.hint && !correct && <MathText className="ex-reveal hint" text={b.hint} />}
      {showSolution && <MathText className="ex-reveal facit" text={b.solution} />}
    </section>
  )
}
