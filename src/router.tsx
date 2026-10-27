import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { Door } from './pages/Door'
import { Encounters } from './pages/Encounters'
import { EncounterNew } from './pages/EncounterNew'
import { EncounterDetail } from './pages/EncounterDetail'
import { Children } from './pages/Children'
import { Families } from './pages/Families'
import { Reply } from './pages/Reply'
import { Circle } from './pages/Circle'
import { Join } from './pages/Join'
import { Calendar } from './pages/Calendar'
import { Windows } from './pages/Windows'
import { WindowReply } from './pages/WindowReply'
import { Forgot, Reset } from './pages/Forgot'
import { Shell } from './components/Shell'
import { useT } from './i18n'
import { CODE_RE } from './lib/link'

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
  return (
    <Routes>
      <Route path="/" element={<Door />} />
      <Route path="/r/:token" element={<Reply />} />
      <Route path="/rencontres" element={<Private><Encounters /></Private>} />
      <Route path="/rencontres/nouvelle" element={<Private><EncounterNew /></Private>} />
      <Route path="/rencontres/:id" element={<Private><EncounterDetail /></Private>} />
      <Route path="/enfants" element={<Private><Children /></Private>} />
      <Route path="/calendrier" element={<Private><Calendar /></Private>} />
      <Route path="/fenetres" element={<Private><Windows /></Private>} />
      <Route path="/w/:token" element={<WindowReply />} />
      <Route path="/cercle" element={<Private><Circle /></Private>} />
      <Route path="/rejoindre" element={<Join />} />
      <Route path="/oubli" element={<Forgot />} />
      <Route path="/reinitialiser" element={<Reset />} />
      <Route path="/familles" element={<Private><Families /></Private>} />
      <Route path="/:token" element={<CodeOrHome />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
