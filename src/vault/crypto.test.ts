import { describe, expect, it } from 'vitest'
import { decryptVault, deriveKey, encryptVault, parseVault } from './crypto.ts'

describe('vault', () => {
  it('låser upp med rätt inloggning och skiftläge spelar ingen roll för namnet', async () => {
    const bytes = await encryptVault({ files: { 'data/a.json': '{"x":1}' }, createdAt: 'nu' }, 'Elev', 'hemligt123')
    const key = await deriveKey('  elev ', 'hemligt123', parseVault(bytes).salt)
    expect((await decryptVault(bytes, key)).files['data/a.json']).toBe('{"x":1}')
  })
  it('vägrar fel lösenord och ändrad fil', async () => {
    const bytes = await encryptVault({ files: { a: 'b' }, createdAt: 'nu' }, 'elev', 'hemligt123')
    const salt = parseVault(bytes).salt
    await expect(decryptVault(bytes, await deriveKey('elev', 'Hemligt123', salt))).rejects.toThrow()
    const tampered = bytes.slice()
    tampered[tampered.length - 1] ^= 1
    await expect(decryptVault(tampered, await deriveKey('elev', 'hemligt123', salt))).rejects.toThrow()
  })
  it('innehållet syns inte i klartext', async () => {
    const bytes = await encryptVault({ files: { a: 'strumpor i lådan' }, createdAt: 'nu' }, 'elev', 'hemligt123')
    expect(new TextDecoder().decode(bytes)).not.toContain('strumpor')
  })
})
