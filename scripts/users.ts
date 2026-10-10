// Lägger till eller tar bort inloggningar i den låsta boken. Du loggar först in med en
// befintlig inloggning. Användarnamn sparas inte i klartext, så listan visar bara antalet.
//
//   npm run users -- add      lägg till en inloggning
//   npm run users -- remove   ta bort en inloggning (ange dess användarnamn)
//   npm run users -- count    visa hur många inloggningar boken har
import { makeSlot, slotId } from '../src/vault/crypto.ts'
import { ask } from './prompt.ts'
import { askNewLogin, openWithLogin, readVault, writeVault } from './vaultfile.ts'

const cmd = process.argv[2]
const vault = readVault()
if (!vault) throw new Error('Hittar ingen public/vault.bin. Kör npm run lock först.')
if (vault.version !== 2) throw new Error('Boken har det äldre formatet. Kör npm run lock en gång först.')

if (cmd === 'count') {
  console.log(`Boken har ${vault.slots.length} ${vault.slots.length === 1 ? 'inloggning' : 'inloggningar'}.`)
} else if (cmd === 'add') {
  const me = await openWithLogin(vault)
  console.log('\nVälj den nya inloggningen.')
  const neu = await askNewLogin(false)
  const id = await slotId(neu.user)
  if (vault.slots.some((s) => s.id === id)) throw new Error(`Användarnamnet ”${neu.user}” finns redan. Ta bort det först om du vill byta lösenord.`)
  const slots = [...vault.slots, await makeSlot(neu.user, neu.password, me.bookKey!)]
  await writeVault(me.files, me.bookKey!, slots, [me, neu])
  console.log(`Klart: ”${neu.user.trim()}” kan nu logga in. Boken har ${slots.length} inloggningar. Pusha för att lägga ut ändringen.`)
} else if (cmd === 'remove') {
  const me = await openWithLogin(vault)
  const name = await ask('\nAnvändarnamn som ska tas bort: ')
  const id = await slotId(name)
  if (!vault.slots.some((s) => s.id === id)) throw new Error(`Hittar ingen inloggning som heter ”${name}”.`)
  const slots = vault.slots.filter((s) => s.id !== id)
  if (!slots.length) throw new Error('Det går inte att ta bort den sista inloggningen.')
  const keep = (await slotId(me.user)) === id ? [] : [me]
  await writeVault(me.files, me.bookKey!, slots, keep)
  console.log(`Klart: ”${name.trim()}” är borttagen. Boken har ${slots.length} ${slots.length === 1 ? 'inloggning' : 'inloggningar'}. Pusha för att lägga ut ändringen.`)
} else {
  console.log('Använd: npm run users -- add | remove | count')
}
