import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useLang, useT } from '../i18n'
import { applyTheme, readTheme } from '../lib/theme'

// One header for EVERY page, signed in or not, so the language switch is always in the
// same corner. Brand on the left; on the right the language, the theme and — when signed
// in — one account menu (account, what we keep, sign out) instead of three loose buttons.
export function Header() {
  const { me, signOut } = useAuth()
  const { lang, setLang } = useLang()
  const t = useT()
  const close = (e: { currentTarget: Element }) => {
    const d = e.currentTarget.closest('details')
    if (d) d.open = false
  }
  return (
    <header className="head">
      <Link to={me.signedIn ? '/rencontres' : '/'} className="brand"><i aria-hidden="true" />{t.appName}</Link>
      <div className="head__tools">
        <button
          className="tool"
          lang={lang === 'fr' ? 'en' : 'fr'}
          aria-label={lang === 'fr' ? 'EN (English)' : 'FR (français)'}
          onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
        >
          {lang === 'fr' ? 'EN' : 'FR'}
        </button>
        <button className="tool" aria-label={t.common.theme} onClick={() => applyTheme(readTheme() === 'dark' ? 'light' : 'dark')}>◐</button>
        {me.signedIn && (
          <details className="menu">
            <summary className="tool">{me.displayName ?? t.account.title}</summary>
            <div className="menu__panel">
              <span className="muted small">{me.email}</span>
              <Link to="/compte" onClick={close}>{t.account.title}</Link>
              <Link to="/confidentialite" onClick={close}>{t.privacy.title}</Link>
              <button onClick={() => void signOut()}>{t.auth.logout}</button>
            </div>
          </details>
        )}
      </div>
    </header>
  )
}
