// Datamodellen för det du skriver. Allt lagras som vektorer i dokumentkoordinater
// (1 enhet = 1 CSS-pixel vid 100 % zoom), så att det går att zooma och exportera skarpt.

export type Tool = 'pen' | 'highlighter' | 'eraser' | 'lasso'
export type EraserMode = 'stroke' | 'partial'
export type Background = 'grid' | 'lined' | 'blank'
export type Paper = 'light' | 'dark'

/** Färger lagras som namn så att samma streck syns på både ljust och mörkt papper. */
export type InkColor = 'ink' | 'blue' | 'red' | 'green'
export type HighlightColor = 'yellow' | 'green' | 'pink'

/** En punkt: x, y och tryck (0–1). */
export type Point = [number, number, number]

export interface Stroke {
  id: string
  /** Ritordning. Ångra lägger tillbaka streck på rätt plats. */
  z: number
  tool: 'pen' | 'highlighter'
  color: InkColor | HighlightColor
  /** Diameter i dokumentenheter. */
  size: number
  /** Trycket kom från pennan (annars simuleras det från hastigheten). */
  pressure: boolean
  points: Point[]
}

export interface Drawing {
  exerciseId: string
  strokes: Stroke[]
  background: Background
  updatedAt: number
}

export interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Höjden på en ”sida” vid export till PDF (A4-proportioner med bredden 1000). */
export const PAGE_W = 1000
export const PAGE_H = Math.round(PAGE_W * Math.SQRT2)

export const INK: Record<Paper, Record<InkColor, string>> = {
  light: { ink: '#1d2733', blue: '#2f62d0', red: '#d0342c', green: '#23874b' },
  dark: { ink: '#ece6dc', blue: '#7db0ff', red: '#ff7a6b', green: '#6fdc95' },
}

export const HIGHLIGHT: Record<HighlightColor, string> = {
  yellow: '#ffd84a',
  green: '#7dea8c',
  pink: '#ff8fc4',
}

export const PEN_SIZES = [2.6, 4, 6.5]
export const HIGHLIGHTER_SIZES = [12, 18, 26]
export const ERASER_SIZES = [8, 16, 30]
