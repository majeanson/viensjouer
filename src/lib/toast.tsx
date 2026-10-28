import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'

// One calm undo bar instead of a browser confirm(). Two shapes:
//   - done(text, undo): the thing already happened; « Annuler » reverses it.
//   - later(text, commit): nothing has happened yet; the write runs after a few seconds unless undone.
//     The provider lives above the router, so navigating away does not cancel it, and leaving the page
//     (or closing the tab) flushes it rather than losing it.
interface Item {
  id: number
  text: string
  undo?: () => void
}
interface Api {
  done: (text: string, undo: () => void) => void
  later: (text: string, commit: () => Promise<unknown> | void, onUndo?: () => void) => void
}

const Ctx = createContext<Api>({ done: () => {}, later: () => {} })
export const useToast = () => useContext(Ctx)

export const UNDO_MS = 6000

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const [items, setItems] = useState<Item[]>([])
  const seq = useRef(0)
  const pending = useRef(new Map<number, { timer: ReturnType<typeof setTimeout>; commit: () => Promise<unknown> | void }>())

  const drop = useCallback((id: number) => setItems((l) => l.filter((x) => x.id !== id)), [])

  const done = useCallback(
    (text: string, undo: () => void) => {
      const id = ++seq.current
      setItems((l) => [...l.slice(-2), { id, text, undo: () => { undo(); drop(id) } }])
      setTimeout(() => drop(id), UNDO_MS)
    },
    [drop],
  )

  const later = useCallback(
    (text: string, commit: () => Promise<unknown> | void, onUndo?: () => void) => {
      const id = ++seq.current
      const timer = setTimeout(() => {
        pending.current.delete(id)
        void commit()
        drop(id)
      }, UNDO_MS)
      pending.current.set(id, { timer, commit })
      setItems((l) => [
        ...l.slice(-2),
        {
          id,
          text,
          undo: () => {
            const p = pending.current.get(id)
            if (p) clearTimeout(p.timer)
            pending.current.delete(id)
            onUndo?.()
            drop(id)
          },
        },
      ])
    },
    [drop],
  )

  // Closing the tab inside the window must not drop the write the person asked for.
  useEffect(() => {
    const flush = () => {
      for (const [id, p] of pending.current) {
        clearTimeout(p.timer)
        void p.commit()
        pending.current.delete(id)
      }
    }
    addEventListener('pagehide', flush)
    return () => removeEventListener('pagehide', flush)
  }, [])

  const api = useMemo(() => ({ done, later }), [done, later])
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className="toast">
            <span>{i.text}</span>
            {i.undo && <button className="linkbtn" onClick={i.undo}>{t.undo.undo}</button>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

// Hide a row at once, delete it for real after the undo window. `restore` brings it back.
export function useDeferredRemove() {
  const toast = useToast()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const remove = (id: string, text: string, commit: () => Promise<unknown>) => {
    setHidden((s) => new Set(s).add(id))
    const show = () => setHidden((s) => { const n = new Set(s); n.delete(id); return n })
    toast.later(text, async () => { try { await commit() } finally { show() } }, show)
  }
  return { hidden, remove, visible: <T extends { id: string }>(rows: T[]) => rows.filter((r) => !hidden.has(r.id)) }
}
