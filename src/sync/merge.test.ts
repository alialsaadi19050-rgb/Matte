import { describe, expect, it } from 'vitest'
import { applyRemoteLesson, lessonDoc, markCheck, markDone } from '../lessons/progress.ts'
import { applyRemoteBookmark, bookmarkDoc, toggleBookmark } from '../bookmarks/bookmarks.ts'

describe('synk: genomgångar', () => {
  it('slår ihop klarade testfrågor från två enheter', () => {
    markCheck('a', 1)
    applyRemoteLesson('a', { checks: [3] }, Date.now() + 10)
    expect(lessonDoc('a')!.data.checks).toEqual([1, 3])
  })

  it('”klar” från en annan enhet skrivs inte över av att genomgången bara öppnats här', () => {
    applyRemoteLesson('b', { checks: [], done: 100, doneChangedAt: 100, updatedAt: 100 }, 100)
    // Här öppnades genomgången senare, men ”klar” ändrades aldrig här.
    applyRemoteLesson('b', { checks: [], seen: 500, updatedAt: 500 }, 500)
    expect(lessonDoc('b')!.data.done).toBe(100)
  })

  it('den senaste ändringen av ”klar” vinner', () => {
    markDone('c', true)
    const later = Date.now() + 1000
    applyRemoteLesson('c', { checks: [], done: undefined, doneChangedAt: later }, later)
    expect(lessonDoc('c')!.data.done).toBeUndefined()
  })
})

describe('synk: bokmärken', () => {
  it('en borttagning på en annan enhet når hit om den är nyare', () => {
    toggleBookmark('1104')
    expect(bookmarkDoc('1104')!.deleted).toBe(false)
    applyRemoteBookmark('1104', Date.now() + 1000, true)
    expect(bookmarkDoc('1104')!.deleted).toBe(true)
  })

  it('en äldre ändring från en annan enhet ignoreras', () => {
    toggleBookmark('1105')
    applyRemoteBookmark('1105', 1, true)
    expect(bookmarkDoc('1105')!.deleted).toBe(false)
  })
})
