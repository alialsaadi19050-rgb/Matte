import type { ContentIndex, Exercise, SectionFile } from './types.ts'
import { contentText } from '../vault/vault.ts'

export interface Content {
  index: ContentIndex
  sections: SectionFile[]
  exercises: Exercise[]
}

const url = (path: string) => `${import.meta.env.BASE_URL}content/${path}`

export async function loadContent(): Promise<Content> {
  const fetchJson = async <T,>(path: string): Promise<T> => JSON.parse(await contentText(path)) as T
  const index = await fetchJson<ContentIndex>('data/index.json')
  const files = index.chapters.flatMap((c) => c.sections.map((s) => s.file))
  const sections = await Promise.all(files.map((f) => fetchJson<SectionFile>(`data/${f}`)))
  return { index, sections, exercises: sections.flatMap((s) => s.exercises) }
}

export const pageImageUrl = (index: ContentIndex, page: number, facit = false) => {
  const file = (facit ? index.facitPages : index.pages)[String(page)]
  return file ? url(file) : null
}

export async function saveExercise(ex: Exercise): Promise<void> {
  const res = await fetch(`/api/exercises/${encodeURIComponent(ex.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ex),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const details = body.issues?.map((i: { where: string; message: string }) => `${i.where}: ${i.message}`).join('\n')
    throw new Error([body.error ?? `Sparandet misslyckades (${res.status})`, details].filter(Boolean).join('\n'))
  }
}
