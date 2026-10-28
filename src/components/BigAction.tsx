import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from './Icon'

// The one main action of a page: a wide centred tile, the icon above the words, right under the title.
// Everything else on the page stays smaller and lower. Give it `to` (a link) or `onClick` (a button).
export function BigAction({ icon, to, onClick, children }: { icon: IconName; to?: string; onClick?: () => void; children: ReactNode }) {
  const inner = (
    <>
      <Icon name={icon} />
      <span>{children}</span>
    </>
  )
  return to ? (
    <Link to={to} className="bigaction">{inner}</Link>
  ) : (
    <button type="button" className="bigaction" onClick={onClick}>{inner}</button>
  )
}
