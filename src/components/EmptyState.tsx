import type { ReactNode } from 'react'

// Nothing here yet: one quiet sentence, centred, with room around it, and (when there is one) the action that fills it. The same on every
// list, instead of a bare grey line that sits against the next heading.
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="muted" style={{ textAlign: 'center', padding: '1.5rem 0.5rem' }}>
      <p style={{ margin: action ? '0 0 1rem' : 0 }}>{children}</p>
      {action}
    </div>
  )
}
