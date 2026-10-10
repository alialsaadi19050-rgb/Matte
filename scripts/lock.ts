// Krypterar bokens innehåll (public/content/data och figures) till public/vault.bin. Kör om
// efter varje ändring i innehållet.
//
//   npm run lock            låser med samma inloggningar som förut (du loggar in med en av dem)
//   npm run lock -- --ny    börjar om med en enda ny inloggning (t.ex. om alla lösenord glömts)
//
// Inloggningar läggs till och tas bort med npm run users. Lösenord sparas ingenstans.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeSlot, newBookKey, type Slot } from '../src/vault/crypto.ts'
import { askNewLogin, openWithLogin, readVault, ROOT, writeVault } from './vaultfile.ts'

const CONTENT = join(ROOT, 'public', 'content')
const files: Record<string, string> = {}
for (const dir of ['data', 'figures']) {
  for (const f of readdirSync(join(CONTENT, dir))) {
    if (/\.(json|svg)$/.test(f)) files[`${dir}/${f}`] = readFileSync(join(CONTENT, dir, f), 'utf8')
  }
}
if (!files['data/index.json']) throw new Error('Hittar inte public/content/data/index.json')
const content = { files, createdAt: new Date().toISOString() }

const vault = process.argv.includes('--ny') ? null : readVault()
let bookKey: Uint8Array
let slots: Slot[]
let check: { user: string; password: string }[]

if (vault?.version === 2) {
  // Samma boknyckel och samma inloggningar som förut.
  const me = await openWithLogin(vault)
  bookKey = me.bookKey!
  slots = vault.slots
  check = [me]
} else if (vault?.version === 1) {
  // Äldre bok med en inloggning: flytta över den till det nya formatet.
  const me = await openWithLogin(vault, 'din inloggning')
  bookKey = newBookKey()
  slots = [await makeSlot(me.user, me.password, bookKey)]
  check = [me]
} else {
  console.log('Välj användarnamn och lösenord för boken.')
  const me = await askNewLogin()
  bookKey = newBookKey()
  slots = [await makeSlot(me.user, me.password, bookKey)]
  check = [me]
}

const bytes = await writeVault(content, bookKey, slots, check)
console.log(`Klart: ${Object.keys(files).length} filer krypterade till public/vault.bin (${(bytes.length / 1024).toFixed(0)} kB), ${slots.length} ${slots.length === 1 ? 'inloggning' : 'inloggningar'}.`)
