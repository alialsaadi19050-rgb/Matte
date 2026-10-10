// Ingång för Matte-appen: kör emulatorn med användarens egen ROM.
// ROM-filen väljs en gång och sparas lokalt i webbläsaren (IndexedDB) –
// den skickas aldrig någonstans. Ingen ROM följer med appen.
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Calculator } from './Calculator'
import './index.css'

const DB = 'matte-ti84'
const STORE = 'rom'

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function getRom(): Promise<Uint8Array | null> {
  const d = await db()
  return new Promise((res) => {
    const g = d.transaction(STORE).objectStore(STORE).get('rom')
    g.onsuccess = () => res(g.result ? new Uint8Array(g.result) : null)
    g.onerror = () => res(null)
  })
}
async function putRom(data: Uint8Array | null): Promise<void> {
  const d = await db()
  await new Promise<void>((res) => {
    const tx = d.transaction(STORE, 'readwrite')
    if (data) tx.objectStore(STORE).put(data.buffer, 'rom')
    else tx.objectStore(STORE).delete('rom')
    tx.oncomplete = () => res()
  })
}

function App() {
  const [rom, setRom] = useState<Uint8Array | null | undefined>(undefined)
  const [error, setError] = useState('')
  useEffect(() => {
    getRom().then(setRom)
    const onMsg = async (e: MessageEvent) => {
      if (e.origin === location.origin && e.data === 'matte:forget-rom') {
        await putRom(null)
        setRom(null)
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  if (rom === undefined) return null
  if (!rom)
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 20, textAlign: 'center' }}>
        <div style={{ maxWidth: 300 }}>
          <p style={{ fontWeight: 700, fontSize: 16, margin: '0 0 6px' }}>Välj din ROM-fil</p>
          <p style={{ fontSize: 13, opacity: 0.75, margin: '0 0 14px' }}>
            Filen från din egen TI-84 Plus CE (.rom). Den sparas bara i den här webbläsaren, så du behöver bara välja den en gång.
          </p>
          <label style={{ display: 'inline-block', padding: '9px 16px', borderRadius: 10, background: '#ff6a2b', color: '#1c0c03', fontWeight: 700, cursor: 'pointer' }}>
            Välj ROM-fil …
            <input
              type="file"
              accept=".rom,.bin"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const data = new Uint8Array(await f.arrayBuffer())
                if (data.length < 1024 * 1024) {
                  setError('Filen är för liten för att vara en TI-84 Plus CE-ROM (den brukar vara 4 MB).')
                  return
                }
                await putRom(data)
                setRom(data)
              }}
            />
          </label>
          {error && <p style={{ color: '#ff8a8a', fontSize: 13 }}>{error}</p>}
        </div>
      </div>
    )
  return <Calculator useBundledRom defaultBackend="rust" customRomLoader={async () => rom} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
