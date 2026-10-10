// Lättviktiga hjälpare för genomgångarna, så att startsidan kan visa dem utan att ladda
// mattefältet och resten av genomgångssidan.
import { useEffect, useState } from 'react'
import type { Lesson } from '../content/types.ts'
import { loadLessons } from '../content/load.ts'

export function useLessons(): Lesson[] | null {
  const [lessons, setLessons] = useState<Lesson[] | null>(null)
  useEffect(() => {
    // Saknas genomgångarna (t.ex. en äldre låst bok) visas helt enkelt inga.
    loadLessons().then(setLessons, () => setLessons([]))
  }, [])
  return lessons
}

export const lessonHref = (id: string) => `#/lar/${encodeURIComponent(id)}`
export const practiceHref = (l: Lesson) => `#/kapitel/${l.chapter}?avsnitt=${encodeURIComponent(l.section)}&omrade=${encodeURIComponent(l.topic)}`
