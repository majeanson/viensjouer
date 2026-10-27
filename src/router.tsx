import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { Door } from './pages/Door'
import { Encounters } from './pages/Encounters'
import { EncounterNew } from './pages/EncounterNew'
import { EncounterDetail } from './pages/EncounterDetail'
import { Children } from './pages/Children'
import { Families } from './pages/Families'
import { Reply } from './pages/Reply'
import { Shell } from './components/Shell'
import { useT } from './i18n'

// `/r/:token` is the one route a stranger lands on; everything else is the host's.
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
      <Route path="/familles" element={<Private><Families /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
