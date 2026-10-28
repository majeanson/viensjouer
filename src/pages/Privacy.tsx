import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Header } from '../components/Header'
import { Icon } from '../components/Icon'

// « Ce qu'on garde » — the plain list: what is required (a name and an email), and every
// optional extra with what it unlocks. Public, no account needed.
export function Privacy() {
  const t = useT()
  return (
    <div className="shell">
      <Header />
      <h1>{t.privacy.title}</h1>
      <p className="muted">{t.privacy.lead}</p>
      <div className="card">
        <h2><Icon name="info" />{t.privacy.purposeTitle}</h2>
        <p style={{ margin: 0 }}>{t.privacy.purpose}</p>
      </div>
      <div className="card">
        <h2><Icon name="check" />{t.privacy.requiredTitle}</h2>
        <ul>{t.privacy.required.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
      <div className="card">
        <h2><Icon name="sparkle" />{t.privacy.optionalTitle}</h2>
        <p className="muted small">{t.privacy.optionalLead}</p>
        <dl className="why-list">
          {t.privacy.optional.map(([what, gives]) => (
            <div key={what}><dt>{what}</dt><dd>{gives}</dd></div>
          ))}
        </dl>
      </div>
      <div className="card">
        <h2><Icon name="users" />{t.privacy.sharedTitle}</h2>
        <ul>{t.privacy.shared.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
      <div className="card">
        <h2><Icon name="lock" />{t.privacy.hostTitle}</h2>
        <ul>{t.privacy.host.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
      <div className="card">
        <h2><Icon name="trash" />{t.privacy.removeTitle}</h2>
        <ul>{t.privacy.remove.map((x) => <li key={x}>{x}</li>)}</ul>
        <Link to="/compte" className="btn">{t.account.title}</Link>
      </div>
      <p className="small"><Link to="/">{t.encounters.back}</Link></p>
    </div>
  )
}
