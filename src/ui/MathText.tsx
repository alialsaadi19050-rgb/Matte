import { useMemo } from 'react'
import { mathTextToHtml } from './mathText.ts'

export function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => mathTextToHtml(text), [text])
  if (!text) return null
  return <div className={`math-text ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />
}
