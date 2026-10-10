// Kryptering av bokens innehåll. Samma kod körs i webbläsaren (inloggningen) och i Node
// (npm run lock). Nyckeln härleds från användarnamn och lösenord med PBKDF2, och innehållet
// krypteras med AES-GCM, som också avslöjar fel lösenord eller ändrad fil.
//
// Filformat (vault.bin): "MATTE1" | salt (16 byte) | iv (12 byte) | krypterad JSON.

export interface VaultFiles {
  /** Sökväg under content/, t.ex. "data/1-1.json" → filens text. */
  files: Record<string, string>
  createdAt: string
}

const MAGIC = new TextEncoder().encode('MATTE1')
const ITERATIONS = 600_000

export function keyMaterial(user: string, password: string): string {
  return `${user.trim().toLowerCase()}\n${password}`
}

export async function deriveKey(user: string, password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(keyMaterial(user, password)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function parseVault(bytes: Uint8Array): { salt: Uint8Array; iv: Uint8Array; data: Uint8Array } {
  if (bytes.length < 34 || MAGIC.some((b, i) => bytes[i] !== b)) throw new Error('Filen är inte en Matte-vault.')
  return { salt: bytes.slice(6, 22), iv: bytes.slice(22, 34), data: bytes.slice(34) }
}

export async function encryptVault(files: VaultFiles, user: string, password: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(user, password, salt)
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(files))))
  const out = new Uint8Array(MAGIC.length + salt.length + iv.length + data.length)
  out.set(MAGIC, 0)
  out.set(salt, 6)
  out.set(iv, 22)
  out.set(data, 34)
  return out
}

/** Kastar om nyckeln är fel. */
export async function decryptVault(bytes: Uint8Array, key: CryptoKey): Promise<VaultFiles> {
  const { iv, data } = parseVault(bytes)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource)
  return JSON.parse(new TextDecoder().decode(plain)) as VaultFiles
}
