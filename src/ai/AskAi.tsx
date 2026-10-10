import { useEffect, useRef, useState } from 'react'
import { AiError, ask, PROVIDERS, useAi, type AskContext, type ChatImage, type ChatMessage } from './ai.ts'
import { loadDrawing } from '../storage/db.ts'
import { MathText } from '../ui/MathText.tsx'
import { Send, Sparkle } from '../design/icons.tsx'
import { SettingsDialog } from '../settings/SettingsDialog.tsx'
import { MaxBackdrop, MaxButton, useMaximize } from '../ui/Maximize.tsx'
import './ai.css'

/** Förslag på frågor beroende på var eleven är. */
function suggestions(c: AskContext): string[] {
  if (c.kind === 'lesson') return ['Förklara det här enklare', 'Ge mig ett eget exempel', 'Hur vet jag vilken metod jag ska välja?']
  const wrong = c.attempts.some((a) => a.status !== 'correct')
  if (c.solved) return ['Förklara lösningen steg för steg', 'Finns det ett snabbare sätt?', 'Varför fungerar metoden?']
  if (wrong && c.facitShown) return ['Varför blev mitt svar fel?', 'Förklara facit steg för steg', 'Vad ska jag tänka på nästa gång?']
  if (wrong) return ['Varför blev mitt svar fel?', 'Ge mig en ledtråd', 'Vilken metod ska jag använda?']
  if (c.facitShown) return ['Varför blir svaret så här?', 'Förklara lösningen steg för steg']
  return ['Ge mig en ledtråd', 'Hur ska jag börja?', 'Vilken metod ska jag använda?']
}

export function AskAi({ context, onClose }: { context: AskContext; onClose: () => void }) {
  const { provider, keys } = useAi()
  const key = keys[provider]
  const name = PROVIDERS[provider].name
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)
  const [error, setError] = useState<AiError | null>(null)
  const [draft, setDraft] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const partial = useRef('')
  const big = useMaximize()
  const busy = streaming !== null
  const exerciseId = context.kind === 'lesson' ? null : context.ex.id
  // Skicka med en bild av skrivytan? Bara om det finns något skrivet.
  const [hasWork, setHasWork] = useState(false)
  const [withWork, setWithWork] = useState(true)
  useEffect(() => {
    if (!exerciseId) return
    const check = () => loadDrawing(exerciseId).then((d) => setHasWork(!!d?.strokes.some((s) => s.tool === 'pen')))
    check()
    const t = setInterval(check, 3000)
    return () => clearInterval(t)
  }, [exerciseId])

  const snapshot = async (): Promise<ChatImage | undefined> => {
    if (!exerciseId || !withWork) return undefined
    // Ge skrivytan en stund att spara det senaste strecket.
    await new Promise((r) => setTimeout(r, 400))
    const d = await loadDrawing(exerciseId)
    if (!d?.strokes.length) return undefined
    const { snapshotForAi } = await import('../canvas/export.ts')
    return (await snapshotForAi(d.strokes)) ?? undefined
  }

  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [chat.length, streaming, error])

  const send = async (question: string) => {
    const q = question.trim()
    if (!q || busy) return
    setDraft('')
    setError(null)
    setStreaming('')
    const image = await snapshot().catch(() => undefined)
    const history: ChatMessage[] = [...chat, { role: 'user', content: q, image }]
    setChat(history)
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      partial.current = ''
      const answer = await ask(
        context,
        history,
        (t) => {
          partial.current = t
          setStreaming(t)
        },
        ctrl.signal,
      )
      setChat([...history, { role: 'assistant', content: answer }])
    } catch (e) {
      if (ctrl.signal.aborted) {
        // Stoppad av eleven: behåll det som hann komma, annars ta bort frågan.
        const s = partial.current
        setChat(s ? [...history, { role: 'assistant', content: `${s} …` }] : chat)
      } else {
        setChat(chat)
        setDraft(q)
        setError(e as AiError)
      }
    } finally {
      setStreaming(null)
      abort.current = null
    }
  }

  return (
    <div className={`ai ${big.max ? 'is-max' : ''}`} role="region" aria-label={`Fråga ${name}`}>
      <div className="ai-head">
        <Sparkle size={15} />
        <b>Fråga {name}</b>
        {chat.length > 0 && !busy && (
          <button className="ai-link" onClick={() => setChat([])}>
            Börja om
          </button>
        )}
        <MaxButton max={big.max} onClick={big.toggle} />
        <button className="ai-close" onClick={onClose} aria-label="Stäng">
          ×
        </button>
      </div>

      {!key ? (
        <div className="ai-nokey">
          <p>Lägg in en egen API-nyckel från Claude eller DeepSeek, så kan du fråga varför ett svar blir som det blir.</p>
          <button className="ex-check" onClick={() => setSettingsOpen(true)}>
            Lägg in nyckel
          </button>
        </div>
      ) : (
        <>
          {chat.length === 0 && !busy && (
            <div className="ai-chips">
              {suggestions(context).map((s) => (
                <button key={s} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="ai-log">
            {chat.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="ai-q">
                  {m.image && <img src={m.image.dataUrl} alt="Din uträkning" className="ai-q-img" />}
                  <p>{m.content}</p>
                </div>
              ) : (
                <MathText key={i} className="ai-a" text={m.content} />
              ),
            )}
            {busy &&
              (streaming ? (
                <MathText className="ai-a" text={streaming} />
              ) : (
                <p className="ai-thinking" aria-live="polite">
                  <i />
                  <i />
                  <i /> {name} tänker …
                </p>
              ))}
            {error && (
              <p className="ex-msg incorrect">
                {error.message}{' '}
                {(error.kind === 'auth' || error.kind === 'nokey') && (
                  <button className="ai-link" onClick={() => setSettingsOpen(true)}>
                    Öppna inställningarna
                  </button>
                )}
              </p>
            )}
            <div ref={end} />
          </div>

          {hasWork && (
            <label className="ai-work">
              <input type="checkbox" checked={withWork} onChange={(e) => setWithWork(e.target.checked)} />
              Visa min uträkning från skrivytan
              {withWork && provider === 'deepseek' && <span> · DeepSeek Flash läser bilden</span>}
            </label>
          )}
          <form
            className="ai-form"
            onSubmit={(e) => {
              e.preventDefault()
              send(draft)
            }}
          >
            <textarea
              value={draft}
              rows={1}
              placeholder={chat.length ? 'Fråga vidare …' : 'Skriv en egen fråga …'}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter skickar, Shift+Enter ger ny rad. Låt inte appens kortkommandon se tangenterna.
                e.stopPropagation()
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(draft)
                }
              }}
            />
            {busy ? (
              <button type="button" className="ai-send stop" onClick={() => abort.current?.abort()} aria-label="Stoppa">
                <i />
              </button>
            ) : (
              <button type="submit" className="ai-send" disabled={!draft.trim()} aria-label="Skicka">
                <Send size={17} strokeWidth={2.5} />
              </button>
            )}
          </form>
        </>
      )}
      {big.max && <MaxBackdrop onClose={() => big.setMax(false)} />}
      {settingsOpen && <SettingsDialog initialTab="ai" onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
