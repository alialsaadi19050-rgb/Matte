// Gemensamt för npm run lock, unlock och users: läsa och skriva public/vault.bin.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildVault, login, parseVault, type Slot, type Vault, type VaultFiles } from '../src/vault/crypto.ts'
import { ask } from './prompt.ts'

export const ROOT = join(import.meta.dirname, '..')
export const VAULT = join(ROOT, 'public', 'vault.bin')

export function readVault(): Vault | null {
  return existsSync(VAULT) ? parseVault(new Uint8Array(readFileSync(VAULT))) : null
}

/** Ber om en befintlig inloggning och öppnar boken med den. */
export async function openWithLogin(vault: Vault, prompt = 'en befintlig inloggning') {
  console.log(`Logga in med ${prompt}.`)
  const user = process.env.MATTE_USER ?? (await ask('Användarnamn: '))
  const password = process.env.MATTE_PASS ?? (await ask('Lösenord: ', true))
  try {
    return { user, password, ...(await login(vault, user, password)) }
  } catch {
    console.error('\nFel användarnamn eller lösenord. Här loggar du in med ett konto som redan finns – inte det nya. Inget har ändrats.')
    process.exit(1)
  }
}

/** Frågar efter ett nytt användarnamn och lösenord (två gånger). */
export async function askNewLogin(env = true) {
  const user = (env && process.env.MATTE_NEW_USER) || (await ask('Nytt användarnamn: '))
  let password = env ? process.env.MATTE_NEW_PASS : undefined
  if (!password) {
    password = await ask('Lösenord: ', true)
    if ((await ask('Samma lösenord igen: ', true)) !== password) throw new Error('Lösenorden är inte samma.')
  }
  if (!user.trim()) throw new Error('Användarnamnet får inte vara tomt.')
  if (password.length < 8) throw new Error('Lösenordet måste vara minst 8 tecken.')
  return { user, password }
}

/** Skriver boken och kontrollerar att varje inloggning man just angett fungerar. */
export async function writeVault(files: VaultFiles, bookKey: Uint8Array, slots: Slot[], check: { user: string; password: string }[]) {
  const bytes = await buildVault(files, bookKey, slots)
  for (const c of check) {
    const res = await login(parseVault(bytes), c.user, c.password)
    if (Object.keys(res.files.files).length !== Object.keys(files.files).length) throw new Error('Kontrollen misslyckades.')
  }
  writeFileSync(VAULT, bytes)
  return bytes
}
