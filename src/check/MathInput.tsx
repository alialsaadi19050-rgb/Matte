// Svarsrutan: ett mattefält (MathLive) för bråk, exponenter och rötter, eller en
// vanlig textruta med knappar för specialtecken. Båda ger vanlig text till rättningen.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { MathfieldElement } from 'mathlive'
import { latexToPlain } from './latex.ts'

/** Stänger MathLives skärmtangentbord om det är öppet. */
export function hideMathKeyboard() {
  const kb = (window as unknown as { mathVirtualKeyboard?: { visible: boolean; hide: () => void } }).mathVirtualKeyboard
  if (kb?.visible) kb.hide()
}

// Esc stänger alltid skärmtangentbordet, var fokus än är.
window.addEventListener('keydown', (e) => e.key === 'Escape' && hideMathKeyboard(), true)
window.addEventListener('hashchange', hideMathKeyboard)
// Ett klick utanför svarsrutan och tangentbordet stänger det också.
window.addEventListener(
  'pointerdown',
  (e) => {
    const path = e.composedPath() as Element[]
    const inside = path.some((n) => n instanceof Element && (n.tagName === 'MATH-FIELD' || n.classList?.contains('ML__keyboard') || n.tagName === 'MATH-VIRTUAL-KEYBOARD'))
    if (!inside) hideMathKeyboard()
  },
  true,
)

// Typsnitten finns redan via KaTeX, och ljud vill vi inte ha.
MathfieldElement.fontsDirectory = null
MathfieldElement.soundsDirectory = null
MathfieldElement.decimalSeparator = ','

export interface MathInputHandle {
  focus: () => void
  /** Det inskrivna som vanlig text, redo för rättning. */
  plain: () => string
  clear: () => void
}

interface Props {
  mode: 'math' | 'text'
  initial?: string
  readOnly?: boolean
  label: string
  placeholder?: string
  /** Tecken som visas som knappar under textrutan. */
  symbols?: string[]
  onEnter: () => void
  onInput?: () => void
}

export const MathInput = forwardRef<MathInputHandle, Props>(function MathInput({ mode, initial = '', readOnly, label, placeholder, symbols, onEnter, onInput }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const mf = useRef<MathfieldElement | null>(null)
  const text = useRef<HTMLInputElement>(null)
  const enter = useRef(onEnter)
  const input = useRef(onInput)
  enter.current = onEnter
  input.current = onInput

  useEffect(() => {
    if (mode !== 'math') return
    const el = new MathfieldElement()
    el.setAttribute('aria-label', label)
    el.className = 'ex-mathfield'
    // Inställningarna kräver att fältet redan sitter i sidan.
    host.current!.append(el)
    el.smartFence = true
    el.mathVirtualKeyboardPolicy = 'manual'
    el.menuItems = []
    if (initial) el.value = initial
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        enter.current()
      }
    })
    el.addEventListener('input', () => input.current?.())
    // Skärmtangentbordet stängs när du lämnar svarsrutan, så det aldrig fastnar.
    el.addEventListener('focusout', () => setTimeout(() => {
      if (!(document.activeElement instanceof HTMLElement && document.activeElement.tagName === 'MATH-FIELD')) hideMathKeyboard()
    }, 50))
    mf.current = el
    return () => {
      hideMathKeyboard()
      el.remove()
      mf.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    if (mf.current) mf.current.readOnly = !!readOnly
  }, [readOnly, mode])

  useImperativeHandle(ref, () => ({
    focus: () => (mode === 'math' ? mf.current?.focus() : text.current?.focus()),
    plain: () => (mode === 'math' ? latexToPlain(mf.current?.value ?? '') : (text.current?.value ?? '')),
    clear: () => {
      if (mf.current) mf.current.value = ''
      if (text.current) text.current.value = ''
    },
  }))

  const insert = (sym: string) => {
    const el = text.current
    if (!el) return
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const value = sym === '{ }' ? '{}' : sym
    el.value = el.value.slice(0, start) + value + el.value.slice(end)
    const caret = start + (sym === '{ }' ? 1 : value.length)
    el.focus()
    el.setSelectionRange(caret, caret)
    input.current?.()
  }

  if (mode === 'math') return <div className="ex-math-host" ref={host} />
  return (
    <div className="ex-text-wrap">
      <input
        ref={text}
        className="ex-text"
        defaultValue={initial}
        readOnly={readOnly}
        aria-label={label}
        placeholder={placeholder ?? 'Skriv ditt svar'}
        spellCheck={false}
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onEnter()
          }
        }}
        onInput={() => input.current?.()}
      />
      {symbols && !readOnly && (
        <div className="ex-symbols" aria-label="Specialtecken">
          {symbols.map((s) => (
            <button key={s} type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
