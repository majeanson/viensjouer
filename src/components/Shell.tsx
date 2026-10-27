import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'
import { Header } from './Header'
import type { ReactNode } from 'react'

// The signed-in frame: the header (always there), four tabs, and the page. Windows live under
// Rencontres and the friend families under Le cercle, so the bar stays one short row.
export function Shell({ children }: { children: ReactNode }) {
  const { me } = useAuth()
  const t = useT()
  return (
    <div className="shell">
      <Header />
      <nav className="nav" aria-label="Navigation">
        <NavLink to="/rencontres">{t.nav.home}</NavLink>
        <NavLink to="/calendrier">{t.nav.calendar}</NavLink>
        <NavLink to="/cercle">{t.nav.circle}</NavLink>
        <NavLink to="/enfants">{t.nav.children}</NavLink>
      </nav>
      {me.demo && (
        <div className="notice">
          {t.trial.banner} <Link to="/garder" className="btn btn--small">{t.trial.keep}</Link>
        </div>
      )}
      {children}
    </div>
  )
}
