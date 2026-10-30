import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useLang, useT } from '../i18n'
import { OS_DARK, applyChoice, nextChoice, readChoice, resolveTheme, type ThemeChoice } from '../lib/theme'
import { Face } from './Face'
import { Icon } from './Icon'

// One header for EVERY page, signed in or not, so the language switch is always in the
// same corner. Brand on the left; on the right the language, the theme and — when signed in — your face and name
// (one tap: your account) and, apart, a sign-out button. No menu to open: each thing is one tap.
export function Header() {
  const { me, signOut } = useAuth()
  const { lang, setLang } = useLang()
  const t = useT()
  const [choice, setChoice] = useState<ThemeChoice>(readChoice)
  const flip = () => {
    const next = nextChoice(choice)
    applyChoice(next)
    setChoice(next)
  }
  // On « auto » the app follows the device as it changes (dusk, a schedule), without a reload.
  useEffect(() => {
    if (choice !== 'auto') return
    const mq = matchMedia(OS_DARK)
    const follow = () => applyChoice('auto')
    mq.addEventListener('change', follow)
    return () => mq.removeEventListener('change', follow)
  }, [choice])
  return (
    <>
    <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }}>{t.common.skip}</a>
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
        <button className="tool tool--icon" aria-label={t.common.themeNow[choice]} title={t.common.themeNow[choice]} onClick={flip}><Icon name={choice === 'auto' ? 'monitor' : resolveTheme(choice) === 'dark' ? 'moon' : 'sun'} /></button>
        {me.signedIn && (
          <>
            <Link to="/compte" className="tool" aria-label={`${t.account.title}${me.displayName ? ` (${me.displayName})` : ''}`} title={me.displayName ?? t.account.title}><Face name={me.displayName ?? '·'} colour="var(--host)" src={me.photo ? `/api/avatar/parent/me?v=${me.photo}` : null} size="sm" /></Link>
            <button className="tool tool--icon" aria-label={t.auth.logout} title={t.auth.logout} onClick={() => void signOut()}><Icon name="logout" /><span className="tool__t">{t.auth.logout}</span></button>
          </>
        )}
      </div>
    </header>
    </>
  )
}
