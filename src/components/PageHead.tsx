import type { ReactNode } from 'react'

// One way to open every page: the title with the page's ONE main action beside it (small, on the right; it wraps under the title on a
// narrow screen). The big orange tile is gone: the action is always in the same place. (The « ← Retour » link is BackLink, apart: this
// file imports nothing from the router, so the many pages that open with it do not each pull the router into the shared chunk.)
export function PageHead({ title, action, level = 1 }: { title: ReactNode; action?: ReactNode; level?: 1 | 2 }) {
  const H = level === 1 ? 'h1' : 'h2'
  return (
    <div className="row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem 1rem', margin: '0 0 1rem' }}>
      <H style={{ margin: 0 }}>{title}</H>
      {action}
    </div>
  )
}
