// Packar upp public/vault.bin till public/content (data och figures), t.ex. på en ny dator
// efter git clone. Befintliga filer skrivs över.
//
//   npm run unlock
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { openWithLogin, readVault, ROOT } from './vaultfile.ts'

const vault = readVault()
if (!vault) throw new Error('Hittar ingen public/vault.bin.')
const { files } = (await openWithLogin(vault, 'din inloggning')).files
for (const [path, text] of Object.entries(files)) {
  const out = join(ROOT, 'public', 'content', path)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, text, 'utf8')
}
console.log(`Klart: ${Object.keys(files).length} filer uppackade i public/content.`)
