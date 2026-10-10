import { describe, expect, it } from 'vitest'
import { actionForEvent, comboFromEvent, DEFAULT_SHORTCUTS } from './settings.ts'

const key = (key: string, mods: Partial<KeyboardEvent> = {}, code = '') => ({ key, code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods }) as KeyboardEvent

describe('kortkommandon', () => {
  it('läser tangenter', () => {
    expect(comboFromEvent(key('z', { ctrlKey: true }))).toBe('Ctrl+Z')
    expect(comboFromEvent(key('E', { shiftKey: true }))).toBe('Shift+E')
    expect(comboFromEvent(key('1', {}, 'Digit1'))).toBe('1')
    expect(comboFromEvent(key('Shift', { shiftKey: true }))).toBeNull()
  })
  it('hittar rätt handling', () => {
    expect(actionForEvent(key('p'), DEFAULT_SHORTCUTS)).toBe('pen')
    expect(actionForEvent(key('Z', { ctrlKey: true, shiftKey: true }), DEFAULT_SHORTCUTS)).toBe('redo')
    expect(actionForEvent(key('N', { shiftKey: true }), DEFAULT_SHORTCUTS)).toBe('prev')
    expect(actionForEvent(key('Enter'), DEFAULT_SHORTCUTS)).toBe('submit')
    expect(actionForEvent(key('q'), DEFAULT_SHORTCUTS)).toBeNull()
  })
})
