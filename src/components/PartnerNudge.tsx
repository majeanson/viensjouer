import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'
import { Icon } from './Icon'

const KEY = 'vj_partner_nudge'
const read = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

// One account is one forgotten password away from losing the book of friends. After the first rencontre has happened,
// ONE calm line suggests inviting the other parent; « Plus tard » hides it on this device for good.
// Whether the nudge is due: the install offer waits while it is (one banner at a time).
export const nudgeDue = (ready: boolean, me: { soloHost?: boolean; demo?: boolean }): boolean => ready && !!me.soloHost && !me.demo && !read()

export function PartnerNudge({ ready }: { ready: boolean }) {
  const t = useT()
  const { me } = useAuth()
  const [hidden, setHidden] = useState(read)
  if (!ready || !me.soloHost || me.demo || hidden) return null
  return (
    <div className="notice" role="status">
      <span><Icon name="users" />{t.parent.nudge}</span>
      <div className="cluster">
        <Link className="btn btn--small" to="/compte">{t.parent.nudgeGo}</Link>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            try {
              localStorage.setItem(KEY, '1')
            } catch {
              /* private window: hidden for this visit only */
            }
            setHidden(true)
          }}
        >
          {t.parent.nudgeLater}
        </button>
      </div>
    </div>
  )
}
