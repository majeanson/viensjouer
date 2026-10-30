import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useLang, useT } from '../i18n'
import { OS_DARK, applyChoice, nextChoice, readChoice, resolveTheme, type ThemeChoice } from '../lib/theme'
import { Face } from './Face'
import { Icon } from './Icon'

// The bell loads after the first paint (it is not what a parent opening a link came for).
const NotificationBell = lazy(() => import('./NotificationBell').then((m) => ({ default: m.NotificationBell })))

// One header for EVERY page, signed in or not. Brand on the left. Signed out: the language and the theme. Signed in: the bell and
// your face; one tap on the face opens a small menu (account, language, theme, sign out), so the bar never holds words on a phone.
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
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  // On « auto » the app follows the device as it changes (dusk, a schedule), without a reload.
  useEffect(() => {
    if (choice !== 'auto') return
    const mq = matchMedia(OS_DARK)
    const follow = () => applyChoice('auto')
    mq.addEventListener('change', follow)
    return () => mq.removeEventListener('change', follow)
  }, [choice])
  // In the menu the same buttons are bare icons (the labels stay for a screen reader and as tooltips); signed out they stay small tools.
  const langBtn = (
    <button className={me.signedIn ? 'btn btn--icon' : 'tool'} lang={lang === 'fr' ? 'en' : 'fr'} aria-label={lang === 'fr' ? 'EN (English)' : 'FR (français)'} title={lang === 'fr' ? 'English' : 'Français'} onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}>
      {me.signedIn ? <Icon name="globe" /> : lang === 'fr' ? 'EN' : 'FR'}
    </button>
  )
  const themeBtn = (
    <button className={me.signedIn ? 'btn btn--icon' : 'tool tool--icon'} aria-label={t.common.themeNow[choice]} title={t.common.themeNow[choice]} onClick={flip}>
      <Icon name={choice === 'auto' ? 'monitor' : resolveTheme(choice) === 'dark' ? 'moon' : 'sun'} />
    </button>
  )
  return (
    <>
    <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }}>{t.common.skip}</a>
    <header className="head">
      <Link to={me.signedIn ? '/rencontres' : '/'} className="brand"><i aria-hidden="true" />{t.appName}</Link>
      <div className="head__tools">
        {!me.signedIn && (
          <>
            {langBtn}
            {themeBtn}
          </>
        )}
        {me.signedIn && (
          <>
            <Suspense fallback={null}><NotificationBell /></Suspense>
            <div className="bell" ref={box}>
              <button type="button" className="tool" aria-label={`${t.account.menu}${me.displayName ? ` (${me.displayName})` : ''}`} title={me.displayName ?? t.account.menu} aria-expanded={open} aria-controls="me-menu" onClick={() => setOpen((o) => !o)}>
                <Face name={me.displayName ?? '·'} colour="var(--host)" src={me.photo ? `/api/avatar/parent/me?v=${me.photo}` : null} size="sm" />
              </button>
              {open && (
                <div id="me-menu" className="bell__panel cluster" style={{ width: 'auto', padding: '0.5rem' }}>
                  {langBtn}
                  {themeBtn}
                  <button className="btn btn--icon" aria-label={t.auth.logout} title={t.auth.logout} onClick={() => void signOut()}><Icon name="logout" /></button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>
    </>
  )
}
