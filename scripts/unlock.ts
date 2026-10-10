// Packar upp public/vault.bin till public/content (data och figures), t.ex. på en ny dator
// efter git clone. Befintliga filer skrivs över.
//
//   npm run unlock
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { decryptVault, deriveKey, parseVault } from '../src/vault/crypto.ts'
import { ask } from './prompt.ts'

const ROOT = join(import.meta.dirname, '..')
const bytes = new Uint8Array(readFileSync(join(ROOT, 'public', 'vault.bin')))
const user = process.env.MATTE_USER ?? (await ask('Användarnamn: '))
const password = process.env.MATTE_PASS ?? (await ask('Lösenord: ', true))

let files: Record<string, string>
try {
  files = (await decryptVault(bytes, await deriveKey(user, password, parseVault(bytes).salt))).files
} catch {
  throw new Error('Fel användarnamn eller lösenord.')
}
for (const [path, text] of Object.entries(files)) {
  const out = join(ROOT, 'public', 'content', path)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, text, 'utf8')
}
console.log(`Klart: ${Object.keys(files).length} filer uppackade i public/content.`)
