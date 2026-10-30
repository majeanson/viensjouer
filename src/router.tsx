import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
const Door = lazy(() => import('./pages/Door').then((m) => ({ default: m.Door })))
const Encounters = lazy(() => import('./pages/Encounters').then((m) => ({ default: m.Encounters })))
const EncounterNew = lazy(() => import('./pages/EncounterNew').then((m) => ({ default: m.EncounterNew })))
const EncounterDetail = lazy(() => import('./pages/EncounterDetail').then((m) => ({ default: m.EncounterDetail })))
const Cards = lazy(() => import('./pages/Cards').then((m) => ({ default: m.Cards })))
const Children = lazy(() => import('./pages/Children').then((m) => ({ default: m.Children })))
const Friends = lazy(() => import('./pages/Friends').then((m) => ({ default: m.Friends })))
const Reply = lazy(() => import('./pages/Reply').then((m) => ({ default: m.Reply })))
const Join = lazy(() => import('./pages/Join').then((m) => ({ default: m.Join })))
const StopMail = lazy(() => import('./pages/StopMail').then((m) => ({ default: m.StopMail })))
const Keep = lazy(() => import('./pages/Keep').then((m) => ({ default: m.Keep })))
const Privacy = lazy(() => import('./pages/Privacy').then((m) => ({ default: m.Privacy })))
const Account = lazy(() => import('./pages/Account').then((m) => ({ default: m.Account })))
const WindowReply = lazy(() => import('./pages/WindowReply').then((m) => ({ default: m.WindowReply })))
const Forgot = lazy(() => import('./pages/Forgot').then((m) => ({ default: m.Forgot })))
const Reset = lazy(() => import('./pages/Forgot').then((m) => ({ default: m.Reset })))
import { Shell } from './components/Shell'
import { useT } from './i18n'
import { CODE_RE } from './lib/link'
import { usePageTitle } from './lib/pageTitle'
import { ErrorBoundary } from './components/ErrorBoundary'

// `/r/:token` — and its paper spelling, a bare `/<xxxx-xxxx>` — is the one route a
// stranger lands on; everything else is the host's.
function CodeOrHome() {
  const code = location.pathname.replace(/^\/+|\/+$/g, '')
  return CODE_RE.test(code) ? <Reply /> : <Navigate to="/" replace />
}
function Private({ children }: { children: React.ReactNode }) {
  const { loading, me } = useAuth()
  const t = useT()
  if (loading) return <p className="shell muted">{t.common.loading}</p>
  if (!me.signedIn) return <Navigate to="/" replace />
  return <Shell>{children}</Shell>
}

export function AppRoutes() {
  const t = useT()
  usePageTitle(t.appName)
  const { pathname } = useLocation()
  return (
    <ErrorBoundary resetKey={pathname}>
    <Suspense fallback={<div className="shell" aria-busy="true"><div className="card skeleton" style={{ marginTop: '4rem' }} /></div>}>
    <Routes>
      <Route path="/" element={<Door />} />
      <Route path="/r/:token" element={<Reply />} />
      <Route path="/rencontres" element={<Private><Encounters /></Private>} />
      <Route path="/rencontres/nouvelle" element={<Private><EncounterNew /></Private>} />
      <Route path="/rencontres/:id" element={<Private><EncounterDetail /></Private>} />
      <Route path="/rencontres/:id/cartes" element={<Private><Cards /></Private>} />
      <Route path="/enfants" element={<Private><Children /></Private>} />
      <Route path="/calendrier" element={<Navigate to="/rencontres" replace />} />
      <Route path="/fenetres" element={<Navigate to="/rencontres" replace />} />
      <Route path="/w/:token" element={<WindowReply />} />
      <Route path="/amis" element={<Private><Friends /></Private>} />
      <Route path="/cercle" element={<Navigate to="/amis" replace />} />
      <Route path="/confidentialite" element={<Privacy />} />
      <Route path="/compte" element={<Private><Account /></Private>} />
      <Route path="/garder" element={<Keep />} />
      <Route path="/stop/:token" element={<StopMail />} />
      <Route path="/rejoindre" element={<Join />} />
      <Route path="/oubli" element={<Forgot />} />
      <Route path="/reinitialiser" element={<Reset />} />
      <Route path="/familles" element={<Navigate to="/amis" replace />} />
      <Route path="/:token" element={<CodeOrHome />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </ErrorBoundary>
  )
}
