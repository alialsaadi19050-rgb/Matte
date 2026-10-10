// Omslagskonst som genereras i kod: varje avsnitt får ett eget motiv med
// gradienter, former och mattesymboler, i den valda palettens färger.
import { useId, type CSSProperties, type ReactNode } from 'react'

export type Motif =
  | 'boxes'
  | 'tree'
  | 'perm'
  | 'lattice'
  | 'dice'
  | 'pascal'
  | 'venn2'
  | 'ops'
  | 'venn3'
  | 'mix'

const TOPIC_MOTIF: Record<string, Motif> = {
  'Lådprincipen': 'boxes',
  'Multiplikations- och additionsprincipen': 'tree',
  'Permutationer': 'perm',
  'Kombinationer': 'lattice',
  'Sannolikhet': 'dice',
  'Binomialsatsen': 'pascal',
  'Mängder': 'venn2',
  'Mängdoperationer': 'ops',
  'Venndiagram': 'venn3',
}

const GLYPH: Record<Motif, string> = {
  boxes: '□',
  tree: '×',
  perm: 'n!',
  lattice: '(ⁿₖ)',
  dice: 'P',
  pascal: 'Σ',
  venn2: '{ }',
  ops: '∩',
  venn3: '∪',
  mix: '√',
}

/** Kortare namn där bokens namn inte får plats på en affisch. */
const SHORT_TITLE: Record<string, string> = {
  'Multiplikations- och additionsprincipen': 'Multiplikation och addition',
  'Del I – utan räknare': 'Del I · utan räknare',
  'Del II – med räknare': 'Del II · med räknare',
}

export const motifFor = (topic?: string): Motif => (topic && TOPIC_MOTIF[topic]) || 'mix'

/** Liten deterministisk slumpgenerator så att samma avsnitt alltid ser likadant ut. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

const A = 'var(--accent)'
const A2 = 'var(--accent-2)'
const T = 'var(--text)'

function motifShapes(m: Motif, w: number, h: number, r: () => number): ReactNode {
  const cx = w / 2
  const cy = h * 0.42
  const s = Math.min(w, h)
  switch (m) {
    case 'boxes': {
      const n = 3
      const size = s * 0.2
      const gap = size * 0.28
      const x0 = cx - (n * size + (n - 1) * gap) / 2
      const y0 = cy - (n * size + (n - 1) * gap) / 2
      const hot = Math.floor(r() * 9)
      return Array.from({ length: 9 }, (_, i) => {
        const x = x0 + (i % n) * (size + gap)
        const y = y0 + Math.floor(i / n) * (size + gap)
        const isHot = i === hot
        return (
          <g key={i}>
            <rect x={x} y={y} width={size} height={size} rx={size * 0.16} style={{ fill: isHot ? A : 'none', fillOpacity: 0.22, stroke: isHot ? A : T, strokeOpacity: isHot ? 1 : 0.22 }} strokeWidth={isHot ? 2.5 : 1.5} />
            <circle cx={x + size * (isHot ? 0.35 : 0.5)} cy={y + size * 0.5} r={size * 0.11} style={{ fill: isHot ? A : T, fillOpacity: isHot ? 1 : 0.45 }} />
            {isHot && <circle cx={x + size * 0.65} cy={y + size * 0.5} r={size * 0.11} style={{ fill: A2 }} />}
          </g>
        )
      })
    }
    case 'tree': {
      const levels = 4
      const out: ReactNode[] = []
      const walk = (x: number, y: number, depth: number, spread: number, key: string) => {
        if (depth === levels) {
          out.push(<circle key={key} cx={x} cy={y} r={3.2} style={{ fill: r() > 0.6 ? A : T, fillOpacity: 0.9 }} />)
          return
        }
        const kids = depth === 0 ? 3 : 2
        for (let k = 0; k < kids; k++) {
          const ny = y + (k - (kids - 1) / 2) * spread
          const nx = x + w * 0.2
          const hot = key.split('-').length < 3 && k === 0
          out.push(<path key={`${key}-${k}l`} d={`M${x} ${y} C ${x + w * 0.1} ${y}, ${nx - w * 0.1} ${ny}, ${nx} ${ny}`} style={{ stroke: hot ? A : T, strokeOpacity: hot ? 0.95 : 0.25 }} strokeWidth={hot ? 2.4 : 1.3} fill="none" />)
          walk(nx, ny, depth + 1, spread / 2.1, `${key}-${k}`)
        }
        out.push(<circle key={`${key}n`} cx={x} cy={y} r={4.5} style={{ fill: A }} />)
      }
      walk(w * 0.1, cy, 0, h * 0.28, 't')
      return out
    }
    case 'perm': {
      const n = 5
      const gap = w / (n + 1)
      const y = cy + h * 0.05
      return (
        <>
          {Array.from({ length: n }, (_, i) => {
            const j = (i * 2 + 1) % n
            const x1 = gap * (i + 1)
            const x2 = gap * (j + 1)
            return <path key={`a${i}`} d={`M${x1} ${y} Q ${(x1 + x2) / 2} ${y - h * 0.28 - r() * h * 0.08} ${x2} ${y}`} fill="none" style={{ stroke: i % 2 ? T : A, strokeOpacity: i % 2 ? 0.3 : 0.85 }} strokeWidth={i % 2 ? 1.4 : 2.2} />
          })}
          {Array.from({ length: n }, (_, i) => (
            <circle key={i} cx={gap * (i + 1)} cy={y} r={s * 0.045} style={{ fill: i === 2 ? A : 'var(--bg)', stroke: i === 2 ? A : T, strokeOpacity: 0.7 }} strokeWidth={1.6} />
          ))}
        </>
      )
    }
    case 'lattice': {
      const cols = 6
      const rows = 7
      const cell = Math.min(w * 0.7 / cols, h * 0.62 / rows)
      const x0 = cx - (cols * cell) / 2
      const y0 = cy - (rows * cell) / 2
      let x = 0
      let y = rows
      const path = [`M${x0} ${y0 + rows * cell}`]
      while (x < cols || y > 0) {
        if (y === 0 || (x < cols && r() > 0.5)) x++
        else y--
        path.push(`L${x0 + x * cell} ${y0 + y * cell}`)
      }
      return (
        <>
          {Array.from({ length: cols + 1 }, (_, i) => (
            <line key={`v${i}`} x1={x0 + i * cell} y1={y0} x2={x0 + i * cell} y2={y0 + rows * cell} style={{ stroke: T, strokeOpacity: 0.16 }} />
          ))}
          {Array.from({ length: rows + 1 }, (_, i) => (
            <line key={`h${i}`} x1={x0} y1={y0 + i * cell} x2={x0 + cols * cell} y2={y0 + i * cell} style={{ stroke: T, strokeOpacity: 0.16 }} />
          ))}
          <path d={path.join(' ')} fill="none" style={{ stroke: A }} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x0} cy={y0 + rows * cell} r={5} style={{ fill: A2 }} />
          <rect x={x0 + cols * cell - 6} y={y0 - 6} width={12} height={12} style={{ fill: A }} />
        </>
      )
    }
    case 'dice': {
      return Array.from({ length: 34 }, (_, i) => {
        const a = r() * Math.PI * 2
        const d = Math.sqrt(r()) * s * 0.42
        const hot = r() > 0.82
        return <circle key={i} cx={cx + Math.cos(a) * d} cy={cy + Math.sin(a) * d * 1.1} r={2 + r() * (hot ? 11 : 6)} style={{ fill: hot ? A : T, fillOpacity: hot ? 0.9 : 0.12 + r() * 0.25 }} />
      })
    }
    case 'pascal': {
      const rows = 7
      const step = Math.min(w * 0.11, h * 0.085)
      const out: ReactNode[] = []
      const choose = (n: number, k: number): number => (k === 0 || k === n ? 1 : choose(n - 1, k - 1) + choose(n - 1, k))
      for (let n = 0; n < rows; n++) {
        for (let k = 0; k <= n; k++) {
          const x = cx + (k - n / 2) * step
          const y = h * 0.14 + n * step * 0.92
          const v = choose(n, k)
          out.push(<circle key={`${n}-${k}`} cx={x} cy={y} r={2.5 + Math.log2(v + 1) * 1.7} style={{ fill: k % 2 ? A : T, fillOpacity: k % 2 ? 0.9 : 0.35 }} />)
        }
      }
      return out
    }
    case 'venn2':
    case 'venn3': {
      const rad = s * 0.24
      const pts =
        m === 'venn2'
          ? [
              [cx - rad * 0.55, cy],
              [cx + rad * 0.55, cy],
            ]
          : [
              [cx - rad * 0.5, cy - rad * 0.3],
              [cx + rad * 0.5, cy - rad * 0.3],
              [cx, cy + rad * 0.5],
            ]
      return pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={rad} style={{ fill: i === 0 ? A : i === 1 ? A2 : T, fillOpacity: i === 2 ? 0.08 : 0.2, stroke: i === 2 ? T : i === 0 ? A : A2, strokeOpacity: 0.85, mixBlendMode: 'var(--venn-blend)' as CSSProperties['mixBlendMode'] }} strokeWidth={2} />
      ))
    }
    case 'ops':
    case 'mix': {
      const glyphs = m === 'ops' ? ['∩', '∪', '∖', '∁', '∅', '⊂'] : ['Σ', 'π', '√', 'x²', '∞', '÷', 'n!', '%']
      return Array.from({ length: 11 }, (_, i) => {
        const g = glyphs[Math.floor(r() * glyphs.length)]
        const hot = i % 4 === 0
        return (
          <text key={i} x={w * (0.1 + r() * 0.8)} y={h * (0.12 + r() * 0.62)} fontSize={s * (0.08 + r() * 0.16)} textAnchor="middle" fontFamily="var(--font-display)" fontWeight={700} style={{ fill: hot ? A : T, fillOpacity: hot ? 0.9 : 0.16 }}>
            {g}
          </text>
        )
      })
    }
  }
}

interface ArtProps {
  motif: Motif
  seed: string
  width: number
  height: number
  glyph?: boolean
  className?: string
}

/** Bara konsten, utan text. Används i hjälteytan och på affischerna. */
export function CoverArt({ motif, seed, width, height, glyph = true, className }: ArtProps) {
  const id = useId().replace(/:/g, '')
  const r = rng(seed)
  const angle = Math.floor(r() * 360)
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id={`g1${id}`} cx={`${20 + r() * 60}%`} cy={`${15 + r() * 40}%`} r="85%">
          <stop offset="0" style={{ stopColor: A, stopOpacity: 0.55 }} />
          <stop offset="0.45" style={{ stopColor: 'var(--bg-tint-1)', stopOpacity: 1 }} />
          <stop offset="1" style={{ stopColor: 'var(--bg)', stopOpacity: 1 }} />
        </radialGradient>
        <linearGradient id={`g2${id}`} gradientTransform={`rotate(${angle} .5 .5)`}>
          <stop offset="0" style={{ stopColor: 'var(--bg-tint-2)', stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: 'var(--bg-tint-2)', stopOpacity: 0.9 }} />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill={`url(#g1${id})`} />
      <rect width={width} height={height} fill={`url(#g2${id})`} />
      {glyph && (
        <text x={width * (0.55 + r() * 0.3)} y={height * 0.78} fontSize={Math.min(width, height) * 0.9} textAnchor="middle" fontFamily="var(--font-display)" fontWeight={800} style={{ fill: 'none', stroke: T, strokeOpacity: 0.08 }} strokeWidth={2}>
          {GLYPH[motif]}
        </text>
      )}
      {motifShapes(motif, width, height, r)}
    </svg>
  )
}

/** Stående affisch för ett avsnitt eller delområde (2:3), som en filmaffisch. */
export function Poster({ motif, seed, kicker, title }: { motif: Motif; seed: string; kicker: string; title: string }) {
  return (
    <div className="poster">
      <CoverArt motif={motif} seed={seed} width={200} height={300} />
      <div className="poster-fade" />
      <div className="poster-text">
        <span className="poster-kicker">{kicker}</span>
        <span className={`poster-title ${title.length > 14 ? 'long' : ''}`}>{SHORT_TITLE[title] ?? title}</span>
      </div>
    </div>
  )
}
