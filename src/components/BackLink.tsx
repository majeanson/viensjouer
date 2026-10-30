import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

// « ← Retour » at the top of a page: always the same words, size and place.
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="muted small" style={{ display: 'inline-block', marginBottom: '0.5rem' }}>← {children}</Link>
}
