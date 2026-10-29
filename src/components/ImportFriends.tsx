import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { MAX_IMPORT, parseList, type ImportProblem } from '../lib/importList'
import { useT } from '../i18n'
import { Icon } from './Icon'

// « Importer une liste » — a first host adds a whole class of friends in one paste (a note, a spreadsheet column, the phone's
// contacts where the browser offers a picker). It says what it understood BEFORE saving: how many are ready, which lines
// need a fix. Nothing is invented: a line missing the child's first name stays a line to fix.
type Picked = { name?: string[]; email?: string[] }
type ContactsApi = { select: (props: string[], opts: { multiple: boolean }) => Promise<Picked[]> }

export function ImportFriends({ onClose }: { onClose: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const parsed = parseList(text)
  const contacts = typeof navigator !== 'undefined' ? (navigator as unknown as { contacts?: ContactsApi }).contacts : undefined
  const why: Record<ImportProblem, string> = { child: t.families.importWhy.child, parent: t.families.importWhy.parent, extra: t.families.importWhy.extra, email: t.families.importWhy.email }

  const save = useMutation({
    mutationFn: () => api<{ added: number; skipped: number }>('families', { method: 'POST', body: { import: parsed.rows } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: K.families })
      setText('')
      setDone(t.families.importDone(r.added, r.skipped))
    },
    onError: (e) => setErr(e.message),
  })

  async function pick() {
    try {
      const got = await contacts!.select(['name', 'email'], { multiple: true })
      // The contact gives the parent; the child's first name is theirs to type, so the line is left for the host to finish.
      const lines = got.map((c) => [c.name?.[0] ?? '', '', c.email?.[0] ?? ''].join(', ')).filter((l) => l.replace(/[, ]/g, ''))
      setText((x) => [x.trim(), ...lines].filter(Boolean).join('\n'))
    } catch {
      /* closed the picker */
    }
  }

  return (
    <div className="card">
      <h3><Icon name="users" />{t.families.importTitle}</h3>
      <p className="muted small">{t.families.importHint(MAX_IMPORT)}</p>
      <label className="field">
        <span className="sr-only">{t.families.importTitle}</span>
        <textarea className="input" rows={6} value={text} onChange={(e) => { setText(e.target.value); setDone(null); setErr(null) }} placeholder={t.families.importPlaceholder} />
      </label>
      {contacts && <button type="button" className="btn btn--small" onClick={() => void pick()}><Icon name="user" />{t.families.importPick}</button>}
      <div aria-live="polite">
        {parsed.rows.length > 0 && <p className="small">{t.families.importReady(parsed.rows.length)}</p>}
        {parsed.bad.length > 0 && (
          <ul className="small">
            {parsed.bad.map((b) => <li key={b.line}>{t.families.importLine(b.line)} : « {b.text} » {why[b.why]}</li>)}
          </ul>
        )}
        {parsed.rows.length > MAX_IMPORT && <p className="small">{t.families.importTooMany(MAX_IMPORT)}</p>}
        {done && <div className="notice notice--ok" role="status"><Icon name="check" />{done}</div>}
        {err && <div className="notice notice--err" role="alert">{err}</div>}
      </div>
      <div className="cluster">
        <button type="button" className="btn btn--primary" disabled={save.isPending || parsed.rows.length === 0 || parsed.rows.length > MAX_IMPORT} onClick={() => { setErr(null); save.mutate() }}>{t.families.importGo}</button>
        <button type="button" className="btn" onClick={onClose}>{t.edit.cancel}</button>
      </div>
    </div>
  )
}
