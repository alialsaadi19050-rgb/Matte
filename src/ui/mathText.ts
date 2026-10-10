// Gör om bokens texter till HTML: stycken, punktlistor, tabeller, *kursiv*,
// **fet** och matte med KaTeX mellan $…$ och $$…$$.
import katex from 'katex'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: false })
  } catch (e) {
    return `<span class="math-error" title="${escapeHtml((e as Error).message)}">${escapeHtml(tex)}</span>`
  }
}

function inline(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    if (src.startsWith('$$', i)) {
      const end = src.indexOf('$$', i + 2)
      if (end !== -1) {
        out += renderMath(src.slice(i + 2, end), true)
        i = end + 2
        continue
      }
    }
    if (src[i] === '$') {
      const end = src.indexOf('$', i + 1)
      if (end !== -1) {
        out += renderMath(src.slice(i + 1, end), false)
        i = end + 1
        continue
      }
    }
    const nextMath = src.indexOf('$', i)
    const chunk = src.slice(i, nextMath === -1 ? src.length : nextMath === i ? i + 1 : nextMath)
    out += escapeHtml(chunk)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
    i += chunk.length
  }
  return out
}

function table(lines: string[]): string {
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
  const rows = lines.filter((l) => !/^\s*\|?\s*-{3}/.test(l)).map(cells)
  const [head, ...body] = rows
  return (
    '<table class="mt-table"><thead><tr>' +
    head.map((c) => `<th>${inline(c)}</th>`).join('') +
    '</tr></thead><tbody>' +
    body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
    '</tbody></table>'
  )
}

export function mathTextToHtml(src: string): string {
  if (!src) return ''
  return src
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n')
      if (lines.every((l) => /^\s*-\s+/.test(l))) {
        return '<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*-\s+/, ''))}</li>`).join('') + '</ul>'
      }
      if (lines.every((l) => l.trim().startsWith('|'))) return table(lines)
      if (/^\$\$[\s\S]*\$\$$/.test(block.trim())) return `<div class="mt-display">${inline(block.trim())}</div>`
      return `<p>${lines.map(inline).join('<br>')}</p>`
    })
    .join('')
}
