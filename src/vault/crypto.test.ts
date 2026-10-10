import { describe, expect, it } from 'vitest'
import { buildVault, login, makeSlot, newBookKey, openVault, parseVault } from './crypto.ts'

const files = { files: { 'data/a.json': '{"x":1}' }, createdAt: 'nu' }

async function twoUsers() {
  const bookKey = newBookKey()
  const slots = [await makeSlot('Elev', 'hemligt123', bookKey), await makeSlot('Kompis', 'annat456', bookKey)]
  return buildVault(files, bookKey, slots)
}

describe('vault', () => {
  it('båda inloggningarna öppnar boken, och skiftläge spelar ingen roll för namnet', async () => {
    const bytes = await twoUsers()
    expect((await login(parseVault(bytes), '  elev ', 'hemligt123')).files.files['data/a.json']).toBe('{"x":1}')
    expect((await login(parseVault(bytes), 'kompis', 'annat456')).files.files['data/a.json']).toBe('{"x":1}')
  })

  it('vägrar fel lösenord, okänt namn och ändrad fil', async () => {
    const bytes = await twoUsers()
    await expect(login(parseVault(bytes), 'elev', 'Hemligt123')).rejects.toThrow()
    await expect(login(parseVault(bytes), 'någon', 'hemligt123')).rejects.toThrow()
    const tampered = bytes.slice()
    tampered[tampered.length - 1] ^= 1
    await expect(login(parseVault(tampered), 'elev', 'hemligt123')).rejects.toThrow()
  })

  it('en sparad inloggning slutar fungera när den tas bort', async () => {
    const bookKey = newBookKey()
    const a = await makeSlot('elev', 'hemligt123', bookKey)
    const b = await makeSlot('kompis', 'annat456', bookKey)
    const { unlock } = await login(parseVault(await buildVault(files, bookKey, [a, b])), 'kompis', 'annat456')
    const withoutB = parseVault(await buildVault(files, bookKey, [a]))
    await expect(openVault(withoutB, unlock)).rejects.toThrow()
    const stillA = await login(withoutB, 'elev', 'hemligt123')
    expect(await openVault(withoutB, stillA.unlock)).toEqual(files)
  })

  it('varken innehåll eller användarnamn syns i klartext', async () => {
    const text = new TextDecoder().decode(await twoUsers())
    expect(text).not.toContain('"x":1')
    expect(text.toLowerCase()).not.toContain('kompis')
  })
})
