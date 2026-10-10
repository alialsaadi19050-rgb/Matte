// Krypterar bokens innehåll (public/content/data och figures) till public/vault.bin med
// ditt användarnamn och lösenord. Kör om efter varje ändring i innehållet, eller för att
// byta lösenord.
//
//   npm run lock
//
// Användarnamn och lösenord frågas efter i terminalen, eller läses från MATTE_USER och
// MATTE_PASS. De sparas ingenstans.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decryptVault, deriveKey, encryptVault, parseVault } from '../src/vault/crypto.ts'
import { ask } from './prompt.ts'

const ROOT = join(import.meta.dirname, '..')
const CONTENT = join(ROOT, 'public', 'content')
const OUT = join(ROOT, 'public', 'vault.bin')

const files: Record<string, string> = {}
for (const dir of ['data', 'figures']) {
  for (const f of readdirSync(join(CONTENT, dir))) {
    if (/\.(json|svg)$/.test(f)) files[`${dir}/${f}`] = readFileSync(join(CONTENT, dir, f), 'utf8')
  }
}
if (!files['data/index.json']) throw new Error('Hittar inte public/content/data/index.json')

const user = process.env.MATTE_USER ?? (await ask('Användarnamn: '))
let password = process.env.MATTE_PASS
if (!password) {
  password = await ask('Lösenord: ', true)
  if ((await ask('Samma lösenord igen: ', true)) !== password) throw new Error('Lösenorden är inte samma.')
}
if (!user.trim()) throw new Error('Användarnamnet får inte vara tomt.')
if (password.length < 8) throw new Error('Lösenordet måste vara minst 8 tecken.')

const bytes = await encryptVault({ files, createdAt: new Date().toISOString() }, user, password)
// Kontrollera att det går att låsa upp igen innan filen skrivs.
const check = await decryptVault(bytes, await deriveKey(user, password, parseVault(bytes).salt))
if (Object.keys(check.files).length !== Object.keys(files).length) throw new Error('Kontrollen misslyckades.')
writeFileSync(OUT, bytes)
console.log(`Klart: ${Object.keys(files).length} filer krypterade till public/vault.bin (${(bytes.length / 1024).toFixed(0)} kB).`)
