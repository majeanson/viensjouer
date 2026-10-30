import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'
import { Header } from './Header'
import { Icon } from './Icon'
import { OfflineNotice } from './ErrorBoundary'
import type { ReactNode } from 'react'

// The signed-in frame: the header (always there), three tabs, and the page. The agenda holds the
// birthdays and the « je suis libre » moments; the friends list holds the groups and the circle.
export function Shell({ children }: { children: ReactNode }) {
  const { me } = useAuth()
  const t = useT()
  return (
    <div className="shell">
      <Header />
      <OfflineNotice />
      <nav className="nav" aria-label="Navigation">
        <NavLink to="/rencontres"><Icon name="calendar" /><span>{t.nav.home}</span></NavLink>
        <NavLink to="/amis"><Icon name="users" /><span>{t.nav.friends}</span></NavLink>
        <NavLink to="/enfants"><Icon name="home" /><span>{t.nav.children}</span></NavLink>
        <NavLink to="/compte"><Icon name="user" /><span>{t.account.title}</span></NavLink>
      </nav>
      {me.demo && (
        <div className="notice">
          {t.trial.banner} <Link to="/garder" className="btn btn--small">{t.trial.keep}</Link>
        </div>
      )}
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
