import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import type { SaveState } from '../lib/autosave'
import { Icon } from './Icon'

// A real full-screen sheet for editing one thing (a friend, a child, a group): a bar with « Retour » on the left and the confirm button on
// the right, always in reach, and the form under it. The confirm button submits the form whose id is `formId` (so the form keeps its own
// submit handler and its required fields). Escape goes back. It sits above the page and its tab bar, and the page behind does not scroll.
// While a sheet is open the page behind is inert (no tab stop, no tap, hidden from a screen reader); several sheets can stack.
let openSheets = 0

export function Sheet({ title, onBack, formId, saving, saveLabel, autosave, children }: { title: string; onBack: () => void; formId?: string; saving?: boolean; saveLabel?: string; autosave?: SaveState; children: ReactNode }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  // Focus goes into the sheet when it opens and comes back to what opened it when it closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const root = document.getElementById('root')
    openSheets++
    root?.setAttribute('inert', '')
    box.current?.focus()
    return () => {
      if (--openSheets === 0) root?.removeAttribute('inert')
      before?.focus?.()
    }
  }, [])
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
    <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} style={{ position: 'fixed', inset: 0, zIndex: 45, overflowY: 'auto', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.5rem max(var(--gutter), env(safe-area-inset-left))', background: 'var(--card)', borderBottom: '1px solid var(--line)' }}>
        <button type="button" className="btn" onClick={onBack}>← {t.encounters.back}</button>
        <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</strong>
        {formId ? <button type="submit" form={formId} className="btn btn--primary" disabled={saving}><Icon name="check" />{saveLabel}</button> : <span className="muted small" role="status" style={{ minWidth: '4.5rem', textAlign: 'right' }}>{autosave === 'saving' ? '…' : autosave === 'saved' ? <><Icon name="check" />{t.profile.saved}</> : autosave === 'error' ? t.common.error : ''}</span>}
      </div>
      <div style={{ maxWidth: '40rem', margin: '0 auto', padding: '1rem max(var(--gutter), env(safe-area-inset-left)) calc(2rem + env(safe-area-inset-bottom))' }}>{children}</div>
    </div>,
    document.body,
  )
}
