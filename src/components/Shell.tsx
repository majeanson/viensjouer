import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useLang, useT } from '../i18n'
import { applyTheme, readTheme } from '../lib/theme'
import type { ReactNode } from 'react'

// The signed-in frame: brand, three tabs, sign-out. The reply page is NOT inside it.
export function Shell({ children }: { children: ReactNode }) {
  const { me, signOut } = useAuth()
  const { lang, setLang } = useLang()
  const t = useT()
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/rencontres" className="brand"><i />{t.appName}</Link>
        <div className="cluster small">
          <Link to="/compte" className="muted">{me.displayName}</Link>
          <button className="btn btn--ghost" onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}>{t.common.lang}</button>
          <button className="btn btn--ghost" onClick={() => applyTheme(readTheme() === 'dark' ? 'light' : 'dark')} aria-label={t.common.theme}>◐</button>
          <button className="btn btn--ghost" onClick={() => void signOut()}>{t.auth.logout}</button>
        </div>
      </header>
      <nav className="nav">
        <NavLink to="/rencontres" end>{t.nav.home}</NavLink>
        <NavLink to="/calendrier">{t.nav.calendar}</NavLink>
        <NavLink to="/fenetres">{t.nav.windows}</NavLink>
        <NavLink to="/cercle">{t.nav.circle}</NavLink>
        <NavLink to="/enfants">{t.nav.children}</NavLink>
        <NavLink to="/familles">{t.nav.families}</NavLink>
      </nav>
      {me.demo && (
        <div className="notice">
          {t.trial.banner} <Link to="/garder" className="btn btn--ghost">{t.trial.keep}</Link>
        </div>
      )}
      {children}
    </div>
  )
}
