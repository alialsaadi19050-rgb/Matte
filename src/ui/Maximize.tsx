// Förstora en ruta (facit, AI-svar) till mitten av skärmen. Rutan stannar kvar i sidan och
// byter bara utseende, så att det du skrivit och pågående svar inte försvinner.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Expand, Shrink } from '../design/icons.tsx'
import './maximize.css'

export function useMaximize() {
  const [max, setMax] = useState(false)
  useEffect(() => {
    if (!max) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setMax(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    document.documentElement.classList.add('has-max')
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.documentElement.classList.remove('has-max')
    }
  }, [max])
  return { max, setMax, toggle: () => setMax((m) => !m) }
}

export function MaxButton({ max, onClick, className = '' }: { max: boolean; onClick: () => void; className?: string }) {
  return (
    <button className={`max-btn ${className}`} onClick={onClick} aria-pressed={max} aria-label={max ? 'Förminska' : 'Förstora'} title={max ? 'Förminska (Esc)' : 'Förstora'}>
      {max ? <Shrink size={15} /> : <Expand size={15} />}
    </button>
  )
}

export function MaxBackdrop({ onClose }: { onClose: () => void }) {
  return createPortal(<div className="max-backdrop" onClick={onClose} aria-hidden="true" />, document.body)
}
