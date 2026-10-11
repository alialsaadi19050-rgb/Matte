// En gömd överraskning i miniräknaren. Bilden ligger i den låsta boken (inte öppet på GitHub)
// och hämtas först när den behövs.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { contentText } from '../vault/vault.ts'
import './secret.css'

/** Ordet som visar bilden (även med ett vanligt stavfel). */
export const isSecretWord = (s: string) => /minox[io]dil/i.test(s.replace(/\s/g, ''))

export function SecretPopup({ onClose }: { onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let url: string | null = null
    contentText('figures/hemlig-minoxidil.svg')
      .then((svg) => {
        url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
        setSrc(url)
      })
      .catch(onClose)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('keydown', onKey)
      if (url) URL.revokeObjectURL(url)
    }
  }, [onClose])

  if (!src) return null
  return createPortal(
    <div className="secret" onClick={onClose} role="dialog" aria-label="Hemlig bild">
      <img src={src} alt="" />
      <span>Klicka för att stänga</span>
    </div>,
    document.body,
  )
}
