import { useT } from '../i18n'

// One quiet line at the foot of every screen: who built it, as a plain link to the portfolio (the same line Horizon
// carries). It leaves the app, so it opens nothing of the profile. Not printed (the paper cards stay clean).
export function Credit() {
  const t = useT()
  return (
    <p className="credit muted small">
      {t.common.builtBy}{' '}
      <a href="https://marcportal.com" rel="noopener">
        marc.portal
      </a>
    </p>
  )
}
