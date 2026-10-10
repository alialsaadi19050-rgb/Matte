// Tema som byggs av några få val (läge, accentfärg, bakgrundston, mjukhet).
// Alla övriga färger räknas fram i OKLCH så att kontrasten alltid håller.

export type Mode = 'dark' | 'light'

export interface ThemeSettings {
  mode: Mode
  /** Accentfärg som hex, t.ex. "#ff6a2b". */
  accent: string
  /** Bakgrundens färgton i grader, 0–360. */
  bgHue: number
  /** Hur färgad bakgrunden är, 0–1. */
  bgTint: number
  /** Mörkt läge: hur djupt svart. Ljust läge: hur mjukt vitt. 0–1. */
  softness: number
}

export const PRESETS: { id: string; name: string; settings: Omit<ThemeSettings, 'mode' | 'softness'> }[] = [
  { id: 'glod', name: 'Glöd', settings: { accent: '#ff6a2b', bgHue: 45, bgTint: 0.35 } },
  { id: 'neon', name: 'Neon', settings: { accent: '#ff2e88', bgHue: 295, bgTint: 0.45 } },
  { id: 'syra', name: 'Syra', settings: { accent: '#b6ff3b', bgHue: 150, bgTint: 0.35 } },
  { id: 'hav', name: 'Hav', settings: { accent: '#2bb6ff', bgHue: 235, bgTint: 0.4 } },
  { id: 'lavendel', name: 'Lavendel', settings: { accent: '#a78bfa', bgHue: 280, bgTint: 0.3 } },
  { id: 'guld', name: 'Guld', settings: { accent: '#f5c542', bgHue: 70, bgTint: 0.25 } },
  { id: 'koral', name: 'Korall', settings: { accent: '#ff5d73', bgHue: 15, bgTint: 0.3 } },
  { id: 'grafit', name: 'Grafit', settings: { accent: '#e9e7e2', bgHue: 60, bgTint: 0 } },
]

export const DEFAULT_THEME: ThemeSettings = { mode: 'dark', ...PRESETS[0].settings, softness: 0.5 }

/* ---------- Färgmatematik: sRGB ↔ OKLCH ---------- */

type RGB = [number, number, number]
type LCH = [number, number, number]

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) return [1, 0.5, 0.2]
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function rgbToOklch([r, g, b]: RGB): LCH {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360]
}

function oklchToRgbRaw([L, C, H]: LCH): RGB {
  const a = C * Math.cos((H * Math.PI) / 180)
  const b = C * Math.sin((H * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

const inGamut = (rgb: RGB) => rgb.every((v) => v >= -0.0005 && v <= 1.0005)

/** OKLCH → sRGB, med kromat sänkt tills färgen går att visa. */
export function oklch(L: number, C: number, H: number): RGB {
  let c = C
  let rgb = oklchToRgbRaw([L, c, H])
  while (!inGamut(rgb) && c > 0) {
    c = Math.max(0, c - 0.005)
    rgb = oklchToRgbRaw([L, c, H])
  }
  return rgb.map((v) => Math.min(1, Math.max(0, v))) as RGB
}

function luminance([r, g, b]: RGB) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

export function contrast(a: RGB, b: RGB) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** Ändrar ljusheten tills kontrasten mot bakgrunden räcker. */
function ensureContrast(color: LCH, bg: RGB, min: number, direction: 1 | -1): RGB {
  let [L, C, H] = color
  let rgb = oklch(L, C, H)
  for (let i = 0; i < 60 && contrast(rgb, bg) < min; i++) {
    L = Math.min(0.99, Math.max(0.05, L + direction * 0.01))
    rgb = oklch(L, C, H)
  }
  return rgb
}

const rgbList = (c: RGB) => c.map((v) => Math.round(v * 255)).join(', ')

/* ---------- Bygg alla CSS-variabler ---------- */

export function buildTheme(t: ThemeSettings): Record<string, string> {
  const accentRgb = hexToRgb(t.accent)
  const [aL, aC, aH] = rgbToOklch(accentRgb)
  const dark = t.mode === 'dark'
  const tint = 0.006 + t.bgTint * 0.03
  const H = t.bgHue

  // Mörkt: softness 0 = nästan svart, 1 = mjukare grafit. Ljust: 0 = nästan vitt, 1 = mjukt papper.
  const baseL = dark ? 0.13 + t.softness * 0.08 : 0.985 - t.softness * 0.06
  const bg = oklch(baseL, tint, H)
  const raised = oklch(dark ? baseL + 0.04 : Math.min(0.99, baseL + 0.012), tint * 0.8, H)
  const sunken = oklch(dark ? baseL - 0.035 : baseL - 0.035, tint * 1.1, H)
  const line = oklch(dark ? baseL + 0.1 : baseL - 0.085, tint * 1.2, H)
  const text = ensureContrast(dark ? [0.95, 0.012, H] : [0.3, Math.min(0.03, tint * 1.6), H], bg, 7, dark ? 1 : -1)
  const dim = ensureContrast(dark ? [0.72, 0.02, H] : [0.52, Math.min(0.035, tint * 1.6), H], bg, 4.6, dark ? 1 : -1)
  const tint1 = oklch(dark ? baseL + 0.06 : baseL - 0.05, Math.min(0.12, aC * 0.45), aH)
  const tint2 = oklch(dark ? baseL + 0.03 : baseL - 0.03, tint * 2.2, (H + 40) % 360)

  // Accenten fylls som användaren valt. Text i accentfärg justeras för läsbarhet.
  const accentText = ensureContrast([aL, aC, aH], bg, 4.5, dark ? 1 : -1)
  const accent2 = oklch(dark ? Math.max(0.68, aL) : Math.min(0.7, aL), Math.max(0.1, aC * 0.9), (aH + 40) % 360)
  const ink: RGB = contrast(accentRgb, [0, 0, 0]) >= contrast(accentRgb, [1, 1, 1]) ? oklch(0.18, 0.04, aH) : [1, 1, 1]
  const danger = dark ? oklch(0.68, 0.19, 18) : oklch(0.56, 0.2, 22)
  const dangerText = ensureContrast([dark ? 0.86 : 0.48, 0.08, 18], bg, 4.5, dark ? 1 : -1)
  const heroTop = dark ? text : oklch(Math.min(0.62, aL), Math.min(0.2, aC), aH)

  return {
    '--bg': rgbToHex(bg),
    '--bg-raised': rgbToHex(raised),
    '--bg-sunken': rgbToHex(sunken),
    '--bg-tint-1': rgbToHex(tint1),
    '--bg-tint-2': rgbToHex(tint2),
    '--line': rgbToHex(line),
    '--text': rgbToHex(text),
    '--text-dim': rgbToHex(dim),
    '--fg-rgb': rgbList(text),
    '--scrim-rgb': rgbList(bg),
    '--glass-rgb': dark ? '255, 255, 255' : rgbList(raised),
    '--accent': t.accent,
    '--accent-rgb': rgbList(accentRgb),
    '--accent-text': rgbToHex(accentText),
    '--accent-2': rgbToHex(accent2),
    '--accent-ink': rgbToHex(ink),
    '--accent-soft': `rgba(${rgbList(accentRgb)}, ${dark ? 0.14 : 0.12})`,
    '--hero-num-top': rgbToHex(heroTop),
    '--danger': rgbToHex(danger),
    '--danger-rgb': rgbList(danger),
    '--danger-text': rgbToHex(dangerText),
    '--ok': rgbToHex(accent2),
  }
}

/* ---------- Spara och använda ---------- */

const KEY = 'matte.theme.v2'

export function loadTheme(): ThemeSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_THEME, ...JSON.parse(raw) }
  } catch {
    /* ingen lagring tillgänglig */
  }
  return DEFAULT_THEME
}

export function saveTheme(t: ThemeSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t))
  } catch {
    /* temat gäller då bara den här sessionen */
  }
}

export function applyTheme(t: ThemeSettings, root: HTMLElement = document.documentElement) {
  root.dataset.theme = t.mode
  for (const [k, v] of Object.entries(buildTheme(t))) root.style.setProperty(k, v)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', buildTheme(t)['--bg'])
}
