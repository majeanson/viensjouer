import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import { Icon } from './Icon'

// A real full-screen sheet for editing one thing (a friend, a child, a group): a bar with « Retour » on the left and the confirm button on
// the right, always in reach, and the form under it. The confirm button submits the form whose id is `formId` (so the form keeps its own
// submit handler and its required fields). Escape goes back. It sits above the page and its tab bar, and the page behind does not scroll.
export function Sheet({ title, onBack, formId, saving, saveLabel, children }: { title: string; onBack: () => void; formId?: string; saving?: boolean; saveLabel?: string; children: ReactNode }) {
  const t = useT()
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', esc)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', esc)
    }
  }, [onBack])
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'fixed', inset: 0, zIndex: 45, overflowY: 'auto', background: 'var(--paper)', color: 'var(--ink)' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.6rem max(var(--gutter), env(safe-area-inset-left))', background: 'var(--card)', borderBottom: '1px solid var(--line)' }}>
        <button type="button" className="btn" onClick={onBack}>← {t.encounters.back}</button>
        <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</strong>
        {formId ? <button type="submit" form={formId} className="btn btn--primary" disabled={saving}><Icon name="check" />{saveLabel}</button> : <span style={{ width: '4.5rem' }} />}
      </div>
      <div style={{ maxWidth: '40rem', margin: '0 auto', padding: '1rem max(var(--gutter), env(safe-area-inset-left)) calc(2rem + env(safe-area-inset-bottom))' }}>{children}</div>
    </div>,
    document.body,
  )
}
