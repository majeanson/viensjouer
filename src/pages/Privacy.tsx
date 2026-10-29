import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang, useT } from '../i18n'
import type { PRIVACY_FR } from '../i18n.privacy.fr'
import { Header } from '../components/Header'
import { Icon } from '../components/Icon'

// « Ce qu'on garde » — the plain list: what is required (a name and an email), and every
// optional extra with what it unlocks. Public, no account needed.
export function Privacy() {
  const t = useT()
  const { lang } = useLang()
  // The long text is its own chunk (it is most of the French dictionary, and only this page reads it).
  const [text, setText] = useState<typeof PRIVACY_FR | null>(null)
  useEffect(() => {
    let live = true
    void (lang === 'fr' ? import('../i18n.privacy.fr').then((m) => m.PRIVACY_FR) : import('../i18n.privacy.en').then((m) => m.PRIVACY_EN)).then((x) => live && setText(x))
    return () => {
      live = false
    }
  }, [lang])
  return (
    <div className="shell">
      <Header />
      <main id="main" tabIndex={-1}>
      <h1>{t.privacy.title}</h1>
      {!text ? <p className="muted" aria-busy="true">{t.common.loading}</p> : <>
      <p className="muted">{text.lead}</p>
      <div className="card">
        <h2><Icon name="info" />{text.purposeTitle}</h2>
        <p style={{ margin: 0 }}>{text.purpose}</p>
      </div>
      <div className="card">
        <h2><Icon name="check" />{text.requiredTitle}</h2>
        <ul>{text.required.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
      <div className="card">
        <h2><Icon name="sparkle" />{text.optionalTitle}</h2>
        <p className="muted small">{text.optionalLead}</p>
        <dl className="why-list">
          {text.optional.map(([what, gives]) => (
            <div key={what}><dt>{what}</dt><dd>{gives}</dd></div>
          ))}
        </dl>
      </div>
      <div className="card">
        <h2><Icon name="users" />{text.sharedTitle}</h2>
        <ul>{text.shared.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
      <div className="card">
        <h2><Icon name="lock" />{text.hostTitle}</h2>
        <ul>{text.host.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
      <div className="card">
        <h2><Icon name="trash" />{text.removeTitle}</h2>
        <ul>{text.remove.map((x) => <li key={x}>{x}</li>)}</ul>
        <Link to="/compte" className="btn">{t.account.title}</Link>
      </div>
      </>}
      <p className="small"><Link to="/">{t.encounters.back}</Link></p>
      </main>
    </div>
  )
}
