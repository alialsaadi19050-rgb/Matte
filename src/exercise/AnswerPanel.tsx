import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Answer, Exercise, Part } from '../content/types.ts'
import { checkAnswer, type CheckStatus } from '../check/check.ts'
import { MathInput, type MathInputHandle } from '../check/MathInput.tsx'
import { emptyVenn, VennInput, vennExpr, type VennValue } from '../check/VennInput.tsx'
import { exprToRegions } from '../check/vennInput.ts'
import { attemptsFor, currentRound, recordAttempt, type Attempt } from '../storage/db.ts'
import { MathText } from '../ui/MathText.tsx'
import { Figures } from '../ui/Figure.tsx'
import { Check, ChevronRight, Lightbulb, Sparkle } from '../design/icons.tsx'
import { AskAi } from '../ai/AskAi.tsx'
import { MaxBackdrop, MaxButton, useMaximize } from '../ui/Maximize.tsx'
import { updateSettings, useSettings } from '../settings/settings.ts'

const MAX_TRIES = 3

/**
 * Rätt-ljudet går ner i tonhöjd ju fler försök som behövdes:
 * första försöket A5→E6 (kvint upp), andra E5→A5 (kvart upp), tredje eller senare C5→E5 (ters upp).
 */
const CORRECT_NOTES = [
  [880, 1318.5],
  [659.3, 880],
  [523.3, 659.3],
]

function playChime(kind: 'correct' | 'wrong', missesBefore = 0) {
  try {
    const ctx = new AudioContext()
    const notes = kind === 'correct' ? CORRECT_NOTES[Math.min(missesBefore, CORRECT_NOTES.length - 1)] : [220]
    notes.forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = kind === 'correct' ? 'sine' : 'triangle'
      o.frequency.value = f
      const t = ctx.currentTime + i * 0.09
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(kind === 'correct' ? 0.16 : 0.08, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'correct' ? 0.5 : 0.25))
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.6)
    })
  } catch {
    /* ljud är inte nödvändigt */
  }
}

/** Mängder och mängduttryck skrivs lättast som text med knappar för symbolerna. */
export function inputKind(a: Answer): { mode: 'math' | 'text' | 'buttons' | 'self'; symbols?: string[]; placeholder?: string } {
  switch (a.type) {
    case 'self':
      return { mode: 'self' }
    case 'choice':
      return { mode: 'buttons' }
    case 'set':
      return { mode: 'text', symbols: ['{ }', '∅', '…', ';'], placeholder: 't.ex. {1, 3, 5}' }
    case 'set-expression':
      return { mode: 'text', symbols: ['∩', '∪', '\\', '∁', '(', ')', '∅'], placeholder: 't.ex. A ∩ (B ∪ C)' }
    case 'list':
      return { mode: 'math', placeholder: 'Skilj talen åt med kommatecken eller mellanslag' }
    default:
      return { mode: 'math' }
  }
}

export function AnswerPanel({ ex, panelRef, next, onRedo, redoLabel }: { ex: Exercise; panelRef: React.RefObject<HTMLElement | null>; next?: Exercise; onRedo?: (blank: boolean) => void; redoLabel?: string }) {
  const [history, setHistory] = useState<Attempt[] | null>(null)
  const [solved, setSolved] = useState<Set<number>>(new Set())
  const [confirmRedo, setConfirmRedo] = useState(false)
  const [pastWrong, setPastWrong] = useState(0)
  /** Du har svarat under det här besöket. */
  const [active, setActive] = useState(false)

  useEffect(() => {
    attemptsFor(ex.id).then((all) => {
      const a = currentRound(all)
      setPastWrong(all.filter((x) => x.status === 'incorrect' || x.status === 'partial').length)
      setHistory(a)
      setSolved(new Set(a.filter((x) => x.status === 'correct').map((x) => x.part)))
    })
  }, [ex.id])

  return (
    <aside className="ex-answer" ref={panelRef}>
      <div className="ex-answer-head">
        <h2>Ditt svar</h2>
        <span>
          {solved.size} av {ex.parts.length} klara
        </span>
        {onRedo && history && (history.length > 0 || pastWrong > 0 || active) && (
          <button className="ex-redo" onClick={() => setConfirmRedo((c) => !c)} aria-expanded={confirmRedo} title="Börja om uppgiften från början">
            ↺ Gör om
          </button>
        )}
      </div>
      {confirmRedo && onRedo && (
        <div className="ex-redo-confirm">
          <p>
            <b>Gör om uppgiften?</b> Dina svar nollställs och facit döljs. Tidigare försök finns kvar i statistiken{pastWrong ? ` (${pastWrong} fel hittills)` : ''}.
          </p>
          <div>
            <button className="ex-check" onClick={() => onRedo(true)}>
              Med tom skrivyta
            </button>
            <button className="ex-check ghost" onClick={() => onRedo(false)}>
              Behåll skrivytan
            </button>
            <button className="ex-redo-cancel" onClick={() => setConfirmRedo(false)}>
              Avbryt
            </button>
          </div>
          <p className="ex-redo-note">Tom skrivyta går att ångra med Ctrl+Z.</p>
        </div>
      )}
      {redoLabel && <p className="ex-redo-banner">{redoLabel}</p>}
      {history &&
        ex.parts.map((p, i) => (
          <AnswerField
            key={`${ex.id}-${i}`}
            ex={ex}
            index={i}
            part={p}
            previous={history.filter((a) => a.part === i)}
            onSolved={() => setSolved((s) => new Set(s).add(i))}
            onAttempt={() => setActive(true)}
          />
        ))}
      <div className="ex-answer-foot">
        <p className="ex-kbd">
          <kbd>Enter</kbd> kontrollera · <kbd>N</kbd> nästa uppgift
        </p>
        {next && (
          <a className={`mk-btn-primary ex-next ${solved.size === ex.parts.length ? 'ready' : ''}`} href={`#/uppgift/${encodeURIComponent(next.id)}`}>
            Nästa uppgift <ChevronRight size={18} />
          </a>
        )}
      </div>
    </aside>
  )
}

type Feedback = { status: CheckStatus | 'info'; message: string; hint?: string; key: number } | null

const PRAISE = ['Snyggt!', 'Precis rätt.', 'Klockrent.', 'Helt rätt!', 'Bra jobbat!']

function AnswerField({ ex, index, part, previous, onSolved, onAttempt }: { ex: Exercise; index: number; part: Part; previous: Attempt[]; onSolved: () => void; onAttempt: () => void }) {
  const settings = useSettings()
  const kind = inputKind(part.answer)
  const lastCorrect = previous.findLast((a) => a.status === 'correct')
  const [tries, setTries] = useState(previous.filter((a) => a.status !== 'correct').length)
  const [solvedInput, setSolvedInput] = useState<string | null>(lastCorrect ? lastCorrect.input : null)
  const [feedback, setFeedback] = useState<Feedback>(lastCorrect ? { status: 'info', message: 'Du har redan löst den här.', key: 0 } : null)
  const [showHint, setShowHint] = useState(false)
  const [showFacit, setShowFacit] = useState(!lastCorrect && tries >= MAX_TRIES)
  const [selfStage, setSelfStage] = useState<'idle' | 'compare'>('idle')
  const [askOpen, setAskOpen] = useState(false)
  const facitMax = useMaximize()
  const [log, setLog] = useState(() => previous.map((a) => ({ input: a.input, status: a.status })))
  /** Senaste felrättade försöket – det som ”Jag hade rätt” godkänner. */
  const [lastWrong, setLastWrong] = useState<{ uid: string; input: string } | null>(() => {
    if (lastCorrect) return null
    const w = previous.findLast((a) => a.status === 'incorrect' || a.status === 'partial')
    return w?.uid ? { uid: w.uid, input: w.input } : null
  })
  const field = useRef<MathInputHandle>(null)
  const box = useRef<HTMLDivElement>(null)
  const correct = solvedInput !== null

  // Starta om skak- eller glödanimationen vid varje nytt besked, utan att tappa det du skrivit.
  useEffect(() => {
    const el = box.current
    if (!el || !feedback?.key) return
    el.style.animation = 'none'
    void el.offsetWidth
    el.style.animation = ''
  }, [feedback?.key])
  const textMode = kind.mode === 'math' && settings.inputMode === 'text' ? 'text' : kind.mode
  // Listor med uttryck (eller några få tal) får en ruta per del i stället för kommatecken i en ruta.
  const answer = part.answer
  const boxes = answer.type === 'list' && (answer.variables?.length || answer.items.length <= 4) ? answer.items.length : 0
  const boxRefs = useRef<(MathInputHandle | null)[]>([])
  const solvedParts = solvedInput?.split(';').map((x) => x.trim()) ?? []
  const hasVariables = (answer.type === 'expression' || answer.type === 'list') && !!answer.variables?.length
  // Mängduttryck med högst tre mängder kan också besvaras genom att skugga i ett Venndiagram.
  const vennable = answer.type === 'set-expression' && answer.sets.length <= 3
  const [drawMode, setDrawMode] = useState(answer.type === 'set-expression' && !!answer.draw && answer.sets.length <= 3)
  const [venn, setVenn] = useState<VennValue>(() => {
    if (answer.type !== 'set-expression') return emptyVenn([])
    const start = emptyVenn(answer.sets)
    return solvedInput ? { ...start, shaded: exprToRegions(solvedInput, start.labels) } : start
  })
  const ordinal = (i: number) => `${i + 1}:${i === 0 || i === 1 ? 'a' : 'e'}`

  const save = (status: 'correct' | 'partial' | 'incorrect', input: string, self = false) => {
    setLog((l) => [...l, { input, status }])
    onAttempt()
    return recordAttempt({ exerciseId: ex.id, part: index, label: part.label, input, status, self, hintUsed: showHint }).then((uid) => {
      if (status !== 'correct') setLastWrong({ uid, input })
    })
  }

  /** Rättningen sa fel, men du vet att du hade rätt (t.ex. skrev svaret på ett annat sätt). */
  const overrule = () => {
    const w = lastWrong
    if (!w || correct) return
    setLastWrong(null)
    setLog((l) => {
      const i = l.findLastIndex((x) => x.status === 'incorrect' || x.status === 'partial')
      return i < 0 ? l : l.map((x, j) => (j === i ? { ...x, status: 'correct' } : x))
    })
    setTries((t) => Math.max(0, t - 1))
    onAttempt()
    void recordAttempt({ exerciseId: ex.id, part: index, label: part.label, input: w.input, status: 'correct', self: true, hintUsed: showHint, overrides: w.uid })
    succeed(w.input, 'Okej, ditt svar räknas som rätt.')
  }

  const succeed = (input: string, message: string) => {
    setSolvedInput(input)
    setFeedback({ status: 'correct', message, key: Date.now() })
    onSolved()
    if (settings.sound) playChime('correct', tries)
  }

  const submit = (raw?: string) => {
    if (correct) return
    let input = raw ?? (drawMode ? vennExpr(venn) : field.current?.plain()) ?? ''
    if (raw === undefined && boxes) {
      const parts = Array.from({ length: boxes }, (_, i) => boxRefs.current[i]?.plain().trim() ?? '')
      if (parts.some((p) => !p)) {
        setFeedback({ status: 'invalid', message: `Fyll i alla ${boxes} rutorna.`, key: Date.now() })
        boxRefs.current[parts.findIndex((p) => !p)]?.focus()
        return
      }
      input = parts.join('; ')
    }
    const r = checkAnswer(part.answer, input)
    if (r.status === 'invalid') {
      setFeedback({ status: 'invalid', message: r.message, key: Date.now() })
      return
    }
    save(r.status, input)
    if (r.status === 'correct') {
      succeed(input, r.message === 'Rätt!' ? PRAISE[(tries + index) % PRAISE.length] : r.message)
      return
    }
    const n = tries + 1
    setTries(n)
    const left = MAX_TRIES - n
    const tail = left > 0 ? ` ${left === 1 ? 'Ett försök' : `${left} försök`} kvar innan facit visas.` : ''
    setFeedback({ status: r.status, message: r.message + (r.status === 'incorrect' ? tail : ''), hint: r.hint, key: Date.now() })
    if (n >= MAX_TRIES) setShowFacit(true)
    if (settings.sound && r.status === 'incorrect') playChime('wrong')
  }

  return (
    <div className={`ex-field ${feedback && feedback.status !== 'info' && feedback.status !== 'invalid' ? `fb-${feedback.status === 'correct' ? 'correct' : feedback.status === 'partial' ? 'partial' : 'wrong'}` : ''} ${correct ? 'solved' : ''}`} ref={box}>
      <div className="ex-field-label">
        {part.label && <b>{part.label})</b>}
        <MathText text={part.prompt || (part.label ? '' : 'Svar')} />
      </div>
      {part.figures?.length ? (
        <div className="ex-field-fig">
          <Figures figures={part.figures} />
        </div>
      ) : null}

      {kind.mode === 'self' ? (
        <div className="ex-self">
          {correct ? null : selfStage === 'idle' ? (
            <button
              className="ex-check wide"
              onClick={() => {
                setSelfStage('compare')
                setShowFacit(true)
              }}
            >
              Jämför med facit
            </button>
          ) : (
            <div className="ex-self-buttons">
              <span>Stämmer din lösning med facit?</span>
              <button
                className="ex-check"
                onClick={() => {
                  save('correct', '', true)
                  succeed('', 'Bra jobbat!')
                }}
              >
                <Check size={16} /> Rätt
              </button>
              <button
                className="ex-check"
                onClick={() => {
                  save('incorrect', '', true)
                  setTries((t) => t + 1)
                  setFeedback({ status: 'incorrect', message: 'Okej! Titta på lösningen och prova igen senare – den dyker upp under ”Uppgifter du missat”.', key: Date.now() })
                }}
              >
                Fel
              </button>
            </div>
          )}
        </div>
      ) : kind.mode === 'buttons' && part.answer.type === 'choice' ? (
        <div className="ex-choices" role="group" aria-label="Välj svar">
          {part.answer.options.map((o) => (
            <button key={o} className={`ex-check ${correct && solvedInput === o ? 'chosen' : ''}`} disabled={correct} onClick={() => submit(o)}>
              {o}
            </button>
          ))}
          {correct && (
            <span className="ex-ok">
              <Check size={16} strokeWidth={3} />
            </span>
          )}
        </div>
      ) : (
        <>
        {vennable && !correct && (
          <div className="ex-mode" role="radiogroup" aria-label="Svara genom att">
            <button role="radio" aria-checked={!drawMode} className={!drawMode ? 'on' : ''} onClick={() => setDrawMode(false)}>
              Skriv
            </button>
            <button role="radio" aria-checked={drawMode} className={drawMode ? 'on' : ''} onClick={() => setDrawMode(true)}>
              Rita Venndiagram
            </button>
          </div>
        )}
        {drawMode && answer.type === 'set-expression' ? (
          <div className="ex-venn-row">
            <VennInput value={venn} onChange={(v) => {
              setVenn(v)
              if (feedback?.status === 'invalid') setFeedback(null)
            }} sets={answer.sets} universe={answer.universe} constraints={answer.constraints} readOnly={correct} />
            {correct ? (
              <span className="ex-ok">
                <Check size={16} strokeWidth={3} />
              </span>
            ) : (
              <button className="ex-check" onClick={() => submit()}>
                Kontrollera
              </button>
            )}
          </div>
        ) : (
        <div className={`ex-input-row ${boxes ? 'multi' : ''}`}>
          {boxes ? (
            <div className="ex-boxes">
              {Array.from({ length: boxes }, (_, i) => (
                <label key={i} className="ex-box">
                  <span>{answer.type === 'list' && answer.labels?.[i] ? answer.labels[i] : answer.type === 'list' && answer.ordered ? `${ordinal(i)} ${hasVariables ? 'termen' : 'talet'}` : `${hasVariables ? 'Term' : 'Tal'} ${i + 1}`}</span>
                  <div className="ex-input">
                    <MathInput
                      ref={(h) => {
                        boxRefs.current[i] = h
                      }}
                      mode={textMode === 'text' ? 'text' : 'math'}
                      initial={solvedParts[i] ?? ''}
                      readOnly={correct}
                      label={`Svar ${part.label ?? ''} del ${i + 1}`}
                      onEnter={() => (i < boxes - 1 ? boxRefs.current[i + 1]?.focus() : submit())}
                      onInput={() => feedback?.status === 'invalid' && setFeedback(null)}
                    />
                  </div>
                </label>
              ))}
              {correct && (
                <span className="ex-ok">
                  <Check size={16} strokeWidth={3} />
                </span>
              )}
            </div>
          ) : (
          <div className="ex-input">
            <MathInput
              ref={field}
              mode={textMode === 'text' ? 'text' : 'math'}
              initial={solvedInput ?? ''}
              readOnly={correct}
              label={`Svar ${part.label ?? ''}`}
              placeholder={kind.placeholder}
              symbols={kind.symbols}
              onEnter={() => submit()}
              onInput={() => feedback?.status === 'invalid' && setFeedback(null)}
            />
            {part.answer.type === 'number' && part.answer.noun && <span className="ex-unit">{part.answer.noun}</span>}
            {correct && (
              <span className="ex-ok">
                <Check size={16} strokeWidth={3} />
              </span>
            )}
            {correct && feedback?.status === 'correct' && <Burst />}
          </div>
          )}
          {!correct && (
            <button className="ex-check" onClick={() => submit()}>
              Kontrollera
            </button>
          )}
        </div>
        )}
        </>
      )}

      {hasVariables && textMode === 'math' && !correct && <p className="ex-exp-tip">Tips: tryck → (högerpil) för att komma ut ur en exponent.</p>}
      {feedback && <p className={`ex-msg ${feedback.status}`}>{feedback.message}</p>}
      {feedback?.hint && !correct && <p className="ex-msg tip">{feedback.hint}</p>}
      {lastWrong && !correct && (
        <button className="ex-overrule" onClick={overrule} title="Rättningen sa fel, men ditt svar var rätt (t.ex. skrivet på ett annat sätt). Räknas som rätt.">
          <Check size={14} strokeWidth={3} /> Jag hade rätt
        </button>
      )}
      {part.motivation && correct && <p className="ex-msg info">Glöm inte motiveringen – jämför den med facit.</p>}

      <div className="ex-field-tools">
        <span className="ex-tries" aria-label={`${tries} missade försök av ${MAX_TRIES}`}>
          {Array.from({ length: MAX_TRIES }, (_, i) => (
            <i key={i} className={i < tries ? 'used' : correct && i === tries ? 'ok' : ''} />
          ))}
        </span>
        {kind.mode === 'math' && !correct && (
          <button onClick={() => updateSettings({ inputMode: settings.inputMode === 'text' ? 'math' : 'text' })} title="Växla mellan mattefält och vanlig text">
            {settings.inputMode === 'text' ? 'Mattefält' : 'Vanlig text'}
          </button>
        )}
        {part.hint && !correct && (
          <button onClick={() => setShowHint((s) => !s)} aria-expanded={showHint}>
            <Lightbulb size={15} /> Ledtråd
          </button>
        )}
        <button onClick={() => setShowFacit((s) => !s)} aria-expanded={showFacit}>
          {showFacit ? 'Dölj facit' : 'Visa facit'}
        </button>
        <button className="ai-open" onClick={() => setAskOpen((s) => !s)} aria-expanded={askOpen} title="Fråga AI:n varför svaret blir som det blir">
          <Sparkle size={15} /> Fråga
        </button>
      </div>
      {showHint && part.hint && <MathText className="ex-reveal hint" text={part.hint} />}
      {showFacit && (
        <div className={`ex-reveal facit ${facitMax.max ? 'is-max' : ''}`}>
          <MaxButton className="ex-reveal-max" max={facitMax.max} onClick={facitMax.toggle} />
          {facitMax.max && (
            <div className="max-context">
              <h3>
                Uppgift {ex.number}
                {part.label ? ` ${part.label})` : ''}
              </h3>
              <MathText text={[ex.prompt, part.prompt].filter(Boolean).join('\n\n')} />
            </div>
          )}
          <MathText text={`**Facit:** ${part.facit}`} />
          <Figures figures={part.facitFigures} />
          {part.solution && <MathText className="ex-solution" text={part.solution} />}
        </div>
      )}
      {showFacit && facitMax.max && <MaxBackdrop onClose={() => facitMax.setMax(false)} />}
      {askOpen && (
        <AskAi
          context={{
            ex,
            part,
            attempts: log,
            feedback: feedback && feedback.status !== 'info' ? feedback : undefined,
            solved: correct,
            facitShown: showFacit,
          }}
          onClose={() => setAskOpen(false)}
        />
      )}
    </div>
  )
}

function Burst() {
  const particles = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3
        const d = 38 + Math.random() * 34
        return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, s: 3 + Math.random() * 4, delay: Math.random() * 60 }
      }),
    [],
  )
  return (
    <span className="ex-burst" aria-hidden="true">
      {particles.map((p, i) => (
        <i key={i} style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, width: p.s, height: p.s, animationDelay: `${p.delay}ms` } as CSSProperties} />
      ))}
    </span>
  )
}
