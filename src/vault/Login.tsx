import { useState } from 'react'
import { login } from './vault.ts'
import './login.css'

export function Login() {
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <main className="lg">
      <form
        className="lg-card"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!user.trim() || !password || busy) return
          setBusy(true)
          setError(null)
          try {
            await login(user, password)
          } catch (err) {
            setError((err as Error).message)
            setPassword('')
            setBusy(false)
          }
        }}
      >
        <div className="lg-logo">
          matte<span>.</span>
        </div>
        <p className="lg-sub">Logga in för att öppna boken.</p>
        <label>
          Användarnamn
          <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus />
        </label>
        <label>
          Lösenord
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && (
          <p className="lg-error" role="alert">
            {error}
          </p>
        )}
        <button className="lg-btn" disabled={busy || !user.trim() || !password}>
          {busy ? 'Låser upp …' : 'Logga in'}
        </button>
      </form>
    </main>
  )
}
