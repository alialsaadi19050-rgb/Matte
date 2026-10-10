import { lazy, Suspense, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { Library } from './library/Library.tsx'
import { ChapterPage } from './library/ChapterPage.tsx'
import { StatsPage } from './library/StatsPage.tsx'
import { Login } from './vault/Login.tsx'
import { restoreSession, useVaultStatus } from './vault/vault.ts'

// Uppgiftssidan (skrivyta, mattefält) och granskningen laddas först när de behövs.
const ExercisePage = lazy(() => import('./exercise/ExercisePage.tsx').then((m) => ({ default: m.ExercisePage })))
const ReviewPage = lazy(() => import('./review/ReviewPage.tsx').then((m) => ({ default: m.ReviewPage })))
const loading = <div className="mk-loading">Laddar …</div>

restoreSession()

const routeOf = () => location.hash.replace(/^#\/?/, '').split('?')[0]

export function App() {
  const vault = useVaultStatus()
  if (vault === 'checking') return loading
  if (vault === 'locked') return <Login />
  return <Routes />
}

function Routes() {
  const [route, setRoute] = useState(routeOf)
  useEffect(() => {
    const onHash = () => {
      const next = routeOf()
      const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } }
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
      // Mjuk övergång mellan sidor där webbläsaren stöder det.
      if (doc.startViewTransition && !calm) {
        // En övergång som avbryts (t.ex. vid snabba klick) är ofarlig.
        const t = doc.startViewTransition(() => flushSync(() => setRoute(next)))
        t.ready.catch(() => {})
        t.finished.catch(() => {})
      }
      else setRoute(next)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (route === 'granska')
    return (
      <Suspense fallback={loading}>
        <ReviewPage />
      </Suspense>
    )
  if (route.startsWith('uppgift/'))
    return (
      <Suspense fallback={loading}>
        <ExercisePage id={decodeURIComponent(route.slice('uppgift/'.length))} />
      </Suspense>
    )
  if (route.startsWith('kapitel')) return <ChapterPage key={location.hash} chapterId={Number(route.split('/')[1] ?? 1) || 1} />
  if (route === 'statistik') return <StatsPage />
  return <Library />
}
