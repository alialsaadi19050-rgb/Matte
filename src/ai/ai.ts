// Fråga en AI om en uppgift: Claude (Anthropic) eller DeepSeek. Anropen går direkt från
// webbläsaren med din egen API-nyckel. Nycklarna sparas bara i den här webbläsaren
// (localStorage) och följer inte med i backupen.
import { useSyncExternalStore } from 'react'
import type Anthropic from '@anthropic-ai/sdk'
import type { Exercise, Lesson, Part } from '../content/types.ts'

export type Provider = 'claude' | 'deepseek'

export const PROVIDERS: Record<Provider, { name: string; model: string; keyUrl: string; placeholder: string }> = {
  claude: { name: 'Claude', model: 'claude-opus-5-5', keyUrl: 'https://console.anthropic.com/settings/keys', placeholder: 'sk-ant-…' },
  deepseek: { name: 'DeepSeek', model: 'deepseek-v4-pro', keyUrl: 'https://platform.deepseek.com/api_keys', placeholder: 'sk-…' },
}

const KEYS: Record<Provider, string> = { claude: 'matte.claude.v1', deepseek: 'matte.deepseek.v1' }
const PROVIDER_KEY = 'matte.ai.provider'

function read(k: string): string {
  try {
    return localStorage.getItem(k) ?? ''
  } catch {
    return ''
  }
}
function write(k: string, v: string) {
  try {
    if (v) localStorage.setItem(k, v)
    else localStorage.removeItem(k)
  } catch {
    /* gäller bara den här sessionen */
  }
}

interface AiState {
  provider: Provider
  keys: Record<Provider, string>
}

function load(): AiState {
  const keys = { claude: read(KEYS.claude), deepseek: read(KEYS.deepseek) }
  const saved = read(PROVIDER_KEY)
  const provider: Provider = saved === 'claude' || saved === 'deepseek' ? saved : keys.deepseek && !keys.claude ? 'deepseek' : 'claude'
  return { provider, keys }
}

let state = load()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function setApiKey(provider: Provider, key: string) {
  state = { ...state, keys: { ...state.keys, [provider]: key.trim() } }
  write(KEYS[provider], key.trim())
  emit()
}

export function setProvider(provider: Provider) {
  state = { ...state, provider }
  write(PROVIDER_KEY, provider)
  emit()
}

export function useAi(): AiState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** Visar bara början och slutet av nyckeln. */
export const maskKey = (k: string) => (k.length > 16 ? `${k.slice(0, 7)}…${k.slice(-4)}` : '••••')

// SDK:n laddas först när du frågar något, så att resten av appen förblir liten.
async function claudeClient(key: string): Promise<Anthropic> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 })
}

/* ---------- Fel ---------- */

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: 'nokey' | 'auth' | 'credit' | 'rate' | 'offline' | 'overloaded' | 'refusal' | 'other',
  ) {
    super(message)
  }
}

async function friendly(e: unknown): Promise<AiError> {
  if (e instanceof AiError) return e
  // DeepSeek-fel är redan AiError; ladda inte Claude-SDK:n i onödan.
  if (state.provider === 'deepseek') return new AiError(`Något gick fel: ${(e as Error)?.message ?? e}`, 'other')
  const { default: A } = await import('@anthropic-ai/sdk')
  if (e instanceof A.AuthenticationError) return new AiError('Nyckeln fungerar inte. Kontrollera att du klistrat in hela nyckeln under Inställningar → AI.', 'auth')
  if (e instanceof A.PermissionDeniedError) return new AiError('Nyckeln får inte använda den här modellen. Kontrollera ditt konto på console.anthropic.com.', 'auth')
  if (e instanceof A.RateLimitError) return new AiError('Du har frågat för mycket på kort tid. Vänta en minut och försök igen.', 'rate')
  if (e instanceof A.BadRequestError && /credit|balance|billing/i.test(e.message)) return new AiError('Det finns inga krediter kvar på ditt Anthropic-konto. Fyll på under Billing på console.anthropic.com.', 'credit')
  if (e instanceof A.APIConnectionError) return new AiError(navigator.onLine ? 'Kom inte fram till Claude. Försök igen om en stund.' : 'Du är offline. Claude behöver internet.', 'offline')
  if (e instanceof A.InternalServerError) return new AiError('Claude är överbelastad just nu. Försök igen om en stund.', 'overloaded')
  return new AiError(`Något gick fel: ${(e as Error)?.message ?? e}`, 'other')
}

/** Ett gratis anrop som visar om nyckeln fungerar. */
export async function testKey(provider: Provider, key: string): Promise<void> {
  try {
    if (provider === 'claude') {
      const c = await claudeClient(key.trim())
      await c.models.list({ limit: 1 })
    } else {
      const res = await deepseekFetch('/user/balance', key.trim(), { method: 'GET' })
      const body = (await res.json()) as { is_available?: boolean }
      if (body.is_available === false) throw new AiError('Nyckeln fungerar, men det finns inget saldo kvar på ditt DeepSeek-konto. Fyll på under Top up på platform.deepseek.com.', 'credit')
    }
  } catch (e) {
    throw await friendly(e)
  }
}

/* ---------- DeepSeek ---------- */

async function deepseekFetch(path: string, key: string, init: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`https://api.deepseek.com${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new AiError(navigator.onLine ? 'Kom inte fram till DeepSeek. Försök igen om en stund.' : 'Du är offline. DeepSeek behöver internet.', 'offline')
  }
  if (res.ok) return res
  const detail = await res.text().catch(() => '')
  switch (res.status) {
    case 401:
      throw new AiError('Nyckeln fungerar inte. Kontrollera att du klistrat in hela nyckeln under Inställningar → AI.', 'auth')
    case 402:
      throw new AiError('Det finns inget saldo kvar på ditt DeepSeek-konto. Fyll på under Top up på platform.deepseek.com.', 'credit')
    case 429:
      throw new AiError('Du har frågat för mycket på kort tid. Vänta en minut och försök igen.', 'rate')
    case 500:
    case 503:
      throw new AiError('DeepSeek är överbelastad just nu. Försök igen om en stund.', 'overloaded')
    default:
      throw new AiError(`Något gick fel (${res.status}): ${detail.slice(0, 200)}`, 'other')
  }
}

/** Strömmar ett svar från DeepSeek (OpenAI-format, server-sent events). */
async function askDeepSeek(key: string, history: ChatMessage[], onText: (snapshot: string) => void, signal: AbortSignal): Promise<string> {
  const vision = history.some((m) => m.image)
  const messages = history.map((m) =>
    m.image
      ? { role: m.role, content: [{ type: 'text', text: `${m.content}\n\n${IMAGE_NOTE}` }, { type: 'image_url', image_url: { url: m.image.dataUrl } }] }
      : { role: m.role, content: m.content },
  )
  const res = await deepseekFetch('/chat/completions', key, {
    method: 'POST',
    signal,
    body: JSON.stringify({ model: vision ? DEEPSEEK_VISION_MODEL : PROVIDERS.deepseek.model, stream: true, max_tokens: 8000, messages: [{ role: 'system', content: SYSTEM }, ...messages] }),
  })
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let text = ''
  let finish: string | null = null
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const data = line.startsWith('data:') ? line.slice(5).trim() : ''
      if (!data || data === '[DONE]') continue
      const chunk = JSON.parse(data) as { choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[] }
      const choice = chunk.choices?.[0]
      // Tankarna (reasoning_content) visas inte, bara själva svaret.
      if (choice?.delta?.content) {
        text += choice.delta.content
        onText(text)
      }
      if (choice?.finish_reason) finish = choice.finish_reason
    }
  }
  if (finish === 'content_filter') throw new AiError('DeepSeek ville inte svara på det här. Prova att formulera frågan på ett annat sätt.', 'refusal')
  return finish === 'length' ? `${text}\n\n*(Svaret blev för långt och klipptes av.)*` : text
}

/* ---------- Frågan ---------- */

const SYSTEM = `Du är en tålmodig och varm mattelärare för en svensk gymnasieelev som läser Matematik 5 (kapitlet Diskret matematik: kombinatorik och mängdlära). Eleven räknar uppgifter i en övningsapp och undrar varför ett svar blir som det blir.

Så här svarar du:
- Svara alltid på svenska, kort och tydligt. Börja med det viktigaste. Använd vanligtvis högst 150–250 ord, om eleven inte ber om mer.
- Förklara resonemanget, inte bara uträkningen: varför man använder just den metoden (t.ex. permutationer eller kombinationer, multiplikationsprincipen, komplement), och vad som skiljer elevens tankesätt från rätt tankesätt.
- Om eleven har svarat fel: utgå från elevens svar, gissa vilket tankefel som ger just det talet och förklara vänligt var det går snett.
- Om facit inte är visat och uppgiften inte är löst: avslöja inte slutsvaret. Ge en ledtråd eller en fråga som hjälper eleven vidare, och erbjud att visa hela lösningen om eleven vill.
- Om facit är visat eller uppgiften löst: förklara hela lösningen steg för steg.
- Om du tror att bokens facit är fel, säg det och förklara varför.
- Ibland bifogar eleven en bild av sin handskrivna uträkning. Läs den noga och utgå från den: säg vad som är rätt, och peka ut exakt vilket steg eller vilken rad som går fel (citera det eleven skrev). Är något svårläst, säg hur du tolkar det.
- Ibland läser eleven en genomgång (teori och exempel) i stället för en uppgift. Förklara då begreppen med egna ord, gärna med ett nytt enkelt exempel, och koppla till genomgångens regler.

Formatering (texten visas med en enkel renderare):
- Skriv all matte med KaTeX mellan $…$, t.ex. $\\binom{5}{2} = 10$ eller $A \\cap B$. Använd $$…$$ för en egen rad. Använd aldrig \\( \\) eller \\[ \\].
- Stycken skiljs med en tom rad. Punktlistor skrivs med "- " i början av varje rad. **fet** och *kursiv* fungerar.
- Inga rubriker, inga tabeller och inga kodblock.`

/** Frågor om en uppgift eller om en genomgång. */
export type AskContext = TaskContext | LessonContext

export interface LessonContext {
  kind: 'lesson'
  lesson: Lesson
}

export interface TaskContext {
  kind?: 'task'
  ex: Exercise
  part: Part
  /** Elevens tidigare svar på den här deluppgiften, äldst först. */
  attempts: { input: string; status: string }[]
  /** Det senaste beskedet från rättningen. */
  feedback?: { status: string; message: string; hint?: string }
  solved: boolean
  facitShown: boolean
}

const STATUS: Record<string, string> = { correct: 'rätt', partial: 'nästan rätt', incorrect: 'fel', invalid: 'gick inte att tolka' }

/** Beskriver uppgiften för Claude. Matte står som i boken, med $…$. */
export function describeTask(c: AskContext): string {
  if (c.kind === 'lesson') return describeLesson(c.lesson)
  const { ex, part } = c
  const lines = [`Uppgift ${ex.number} (avsnitt ${ex.section}${ex.topic ? `, ${ex.topic}` : ''}, nivå ${ex.level.toUpperCase()}${ex.calculator === false ? ', utan räknare' : ''}).`, '', ex.prompt]
  if (ex.parts.length > 1 || part.label) lines.push('', `Deluppgift ${part.label ?? ''}: ${part.prompt ?? ''}`)
  lines.push('', `Bokens facit: ${part.facit}`)
  if (part.solution) lines.push(`Bokens lösning: ${part.solution}`)
  if (part.hint) lines.push(`Bokens ledtråd: ${part.hint}`)
  if (part.needsReview) lines.push(`Obs: facit kan vara fel här${part.reviewNote ? ` (${part.reviewNote})` : ''}.`)
  lines.push('')
  if (c.attempts.length) {
    lines.push('Elevens svar hittills:')
    c.attempts.forEach((a, i) => lines.push(`${i + 1}. ${a.input || '(självbedömd)'} – ${STATUS[a.status] ?? a.status}`))
  } else {
    lines.push('Eleven har inte svarat än.')
  }
  if (c.feedback) lines.push(`Appens rättning sa: ”${c.feedback.message}”${c.feedback.hint ? ` Tips: ”${c.feedback.hint}”` : ''}`)
  lines.push(c.solved ? 'Eleven har löst uppgiften.' : c.facitShown ? 'Eleven har tittat på facit.' : 'Eleven har inte sett facit än – avslöja inte slutsvaret.')
  return lines.join('\n')
}

/** Genomgångens text i korthet: begrepp, regler och exempel. */
function describeLesson(l: Lesson): string {
  const lines = [`Eleven läser genomgången ”${l.title}” (avsnitt ${l.section}, boksidor ${l.pages.join(', ')}). Den innehåller:`, '']
  for (const b of l.blocks) {
    if (b.type === 'text' || b.type === 'tip') lines.push(b.text)
    else if (b.type === 'term') lines.push(`Begrepp – ${b.term}: ${b.text}`)
    else if (b.type === 'rule') lines.push(`Regel – ${b.title}: ${b.text}`)
    else if (b.type === 'example') lines.push(`Exempel – ${b.title}: ${b.prompt}\nLösning: ${b.steps.map((s) => (typeof s === 'string' ? s : s.text)).join(' ')}`)
    else if (b.type === 'check') lines.push(`Testfråga: ${b.prompt} (lösning: ${b.solution})`)
    lines.push('')
  }
  return lines.join('\n')
}

/** En bild av elevens uträkning på skrivytan. */
export interface ChatImage {
  base64: string
  mediaType: 'image/jpeg'
  dataUrl: string
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string; image?: ChatImage }

/** DeepSeek läser bara bilder med Flash-modellen. */
export const DEEPSEEK_VISION_MODEL = 'deepseek-flash'

const IMAGE_NOTE = '(Bifogat: en bild av elevens handskrivna uträkning från appens skrivyta.)'

/**
 * Ställer en fråga och strömmar svaret. `history` är samtalet hittills; den
 * första användarfrågan får uppgiftens beskrivning framför sig.
 */
export async function ask(ctx: AskContext, history: ChatMessage[], onText: (snapshot: string) => void, signal: AbortSignal): Promise<string> {
  const { provider, keys } = state
  const key = keys[provider]
  try {
    if (!key) throw new AiError(`Lägg in din ${PROVIDERS[provider].name}-nyckel under Inställningar → AI först.`, 'nokey')
    // Bara den senaste bilden skickas med, så att följdfrågor inte kostar en bild per fråga.
    const lastImage = history.findLastIndex((m) => m.image)
    const withTask = history.map((m, i) => {
      const own = i === lastImage ? m : { ...m, image: undefined }
      return i === 0 && m.role === 'user' ? { ...own, content: `${describeTask(ctx)}\n\nElevens fråga: ${m.content}` } : own
    })
    if (provider === 'deepseek') return await askDeepSeek(key, withTask, onText, signal)
    const messages = withTask.map((m) =>
      m.image
        ? {
            role: m.role,
            content: [
              { type: 'image' as const, source: { type: 'base64' as const, media_type: m.image.mediaType, data: m.image.base64 } },
              { type: 'text' as const, text: `${m.content}\n\n${IMAGE_NOTE}` },
            ],
          }
        : { role: m.role, content: m.content },
    )
    const c = await claudeClient(key)
    const stream = c.beta.messages.stream(
      {
        model: PROVIDERS.claude.model,
        max_tokens: 8000,
        // Om modellen är överbelastad svarar en annan modell i stället.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: SYSTEM,
        messages,
      },
      { signal },
    )
    stream.on('text', (_delta, snapshot) => onText(snapshot))
    const msg = await stream.finalMessage()
    if (msg.stop_reason === 'refusal') throw new AiError('Claude ville inte svara på det här. Prova att formulera frågan på ett annat sätt.', 'refusal')
    const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    return msg.stop_reason === 'max_tokens' ? `${text}\n\n*(Svaret blev för långt och klipptes av.)*` : text
  } catch (e) {
    throw await friendly(e)
  }
}
