import { useT } from '../i18n'

// One quiet line: who built it, as a plain link to the portfolio (the same line Horizon carries). Only on the front page and on the
// account page: a signature, never a banner under every screen. It leaves the app. Not printed.
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
