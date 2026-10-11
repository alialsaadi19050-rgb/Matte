// Inställningar som gäller hela appen: papper, kortkommandon, skrivzon och ljud.
import { useSyncExternalStore } from 'react'
import type { Background, Paper } from '../canvas/types.ts'
import { DEFAULT_TOOLS, type ToolState } from '../canvas/InkCanvas.ts'

export type ActionId =
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'lasso'
  | 'eraserMode'
  | 'undo'
  | 'redo'
  | 'color1'
  | 'color2'
  | 'color3'
  | 'color4'
  | 'zoomReset'
  | 'submit'
  | 'next'
  | 'prev'
  | 'calculator'
  | 'bookmark'
  | 'hand'

export const ACTIONS: { id: ActionId; label: string }[] = [
  { id: 'pen', label: 'Penna' },
  { id: 'highlighter', label: 'Överstrykningspenna' },
  { id: 'eraser', label: 'Sudd' },
  { id: 'lasso', label: 'Markera och flytta' },
  { id: 'hand', label: 'Flytta runt på skrivytan (hand)' },
  { id: 'eraserMode', label: 'Växla hela streck / delsudd' },
  { id: 'undo', label: 'Ångra' },
  { id: 'redo', label: 'Gör om' },
  { id: 'color1', label: 'Färg 1 (svart)' },
  { id: 'color2', label: 'Färg 2 (blå)' },
  { id: 'color3', label: 'Färg 3 (röd)' },
  { id: 'color4', label: 'Färg 4 (grön)' },
  { id: 'zoomReset', label: 'Återställ zoom' },
  { id: 'submit', label: 'Kontrollera svaret' },
  { id: 'next', label: 'Nästa uppgift' },
  { id: 'prev', label: 'Föregående uppgift' },
  { id: 'calculator', label: 'Miniräknare' },
  { id: 'bookmark', label: 'Spara uppgiften till senare' },
]

export const DEFAULT_SHORTCUTS: Record<ActionId, string> = {
  pen: 'P',
  highlighter: 'H',
  eraser: 'E',
  lasso: 'L',
  eraserMode: 'Shift+E',
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Y',
  color1: '1',
  color2: '2',
  color3: '3',
  color4: '4',
  zoomReset: '0',
  submit: 'Enter',
  next: 'N',
  prev: 'Shift+N',
  calculator: 'R',
  bookmark: 'B',
  hand: 'M',
}

/** Gaomon S620: aktiv yta 165 × 101 mm. */
export const S620_ASPECT = 165 / 101

export interface WritingZone {
  enabled: boolean
  /** Position och bredd i CSS-pixlar i fönstret. Höjden följer plattans proportioner. */
  x: number
  y: number
  width: number
}

export interface Settings {
  paper: Paper
  background: Background
  sound: boolean
  shortcuts: Record<ActionId, string>
  zone: WritingZone
  tools: ToolState
  pressureHintDismissed: boolean
  /** Svarsrutan: mattefält eller vanlig text. */
  inputMode: 'math' | 'text'
  /** Skrivytan ritar direkt till skärmen (desynchronized canvas). */
  lowLatency: boolean
  /** Miniräknarens position (CSS-pixlar). */
  calculator?: { x: number; y: number }
  /** Miniräknarens läge: den inbyggda eller TI-84-emulatorn. */
  calculatorMode?: 'simple' | 'ti84'
  /** TI-84-emulatorns storlek (1 = 780 px hög). */
  tiScale?: number
}

export const DEFAULT_SETTINGS: Settings = {
  paper: 'light',
  background: 'grid',
  sound: true,
  shortcuts: DEFAULT_SHORTCUTS,
  zone: { enabled: false, x: 24, y: 300, width: 900 },
  tools: DEFAULT_TOOLS,
  pressureHintDismissed: false,
  inputMode: 'math',
  lowLatency: true,
}

const KEY = 'matte.settings.v1'

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw)
      return { ...DEFAULT_SETTINGS, ...s, shortcuts: { ...DEFAULT_SHORTCUTS, ...s.shortcuts }, zone: { ...DEFAULT_SETTINGS.zone, ...s.zone }, tools: { ...DEFAULT_TOOLS, ...s.tools } }
    }
  } catch {
    /* ingen lagring */
  }
  return DEFAULT_SETTINGS
}

let current = load()
const listeners = new Set<() => void>()

export function getSettings() {
  return current
}

export function updateSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  const p = typeof patch === 'function' ? patch(current) : patch
  current = { ...current, ...p }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* gäller bara den här sessionen */
  }
  listeners.forEach((l) => l())
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

/* ---------- Kortkommandon ---------- */

const KEY_NAMES: Record<string, string> = { ' ': 'Mellanslag', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc' }

/** Gör om en tangenttryckning till en sträng som "Ctrl+Shift+Z". */
export function comboFromEvent(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  // Shift räknas bara med för bokstäver och namngivna tangenter, inte för tecken som ! eller ?.
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
  if (e.shiftKey && (e.key.length > 1 || /[A-ZÅÄÖ]/i.test(e.key))) parts.push('Shift')
  // Siffror via e.code så att Shift+1 inte blir "!".
  const digit = /^Digit(\d)$/.exec(e.code)
  parts.push(digit && !e.shiftKey ? digit[1] : key)
  return parts.join('+')
}

export const prettyCombo = (combo: string) =>
  combo
    .split('+')
    .map((k) => KEY_NAMES[k] ?? k)
    .join(' + ')

export function actionForEvent(e: KeyboardEvent, shortcuts: Record<ActionId, string>): ActionId | null {
  const combo = comboFromEvent(e)
  if (!combo) return null
  if (combo === 'Ctrl+Shift+Z') return 'redo'
  const hit = (Object.keys(shortcuts) as ActionId[]).find((id) => shortcuts[id] === combo)
  return hit ?? null
}
