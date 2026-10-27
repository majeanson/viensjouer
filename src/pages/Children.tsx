import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { ageLabel } from '../lib/format'
import { Face } from '../components/Face'
import { HomeCardForm } from '../components/HomeCard'
import type { Child } from '../lib/types'

// The same six colours the server hands out in turn (functions/api/children.ts).
const COLOURS = ['#f2a03d', '#5b9a8b', '#c76b6b', '#7c83c9', '#b98b3a', '#4f8fbf']

// Add · edit (name, birthdate, colour) · remove. One form for add and edit, like the
// families page: `editing` is 'new', a child, or closed.
export function Children() {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: K.children, queryFn: () => api<{ children: Child[] }>('children') })
  const [editing, setEditing] = useState<Child | 'new' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const invalidate = () => qc.invalidateQueries({ queryKey: K.children })

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api('children', { method: body.id ? 'PATCH' : 'POST', body }),
    onSuccess: () => {
      setEditing(null)
      setErr(null)
      void invalidate()
    },
    onError: (e) => setErr(e.message),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api('children', { method: 'DELETE', body: { id } }),
    onSuccess: () => void invalidate(),
    onError: (e) => setErr(e.message),
  })

  const cur = editing && editing !== 'new' ? editing : null

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const birthdate = String(f.get('birthdate') ?? '')
    const body: Record<string, unknown> = { firstName: String(f.get('firstName') ?? ''), colour: String(f.get('colour') ?? COLOURS[0]) }
    if (cur) {
      body.id = cur.id
      // An emptied date clears it; the endpoint reads `null` as "clear", absent as "keep".
      body.birthdate = birthdate || null
    } else if (birthdate) body.birthdate = birthdate
    save.mutate(body)
  }

  const kids = q.data?.children ?? []
  return (
    <>
      <h1>{t.children.title}</h1>
      {err && <div className="notice notice--err">{err}</div>}
      {q.isLoading && <p className="muted">{t.common.loading}</p>}
      {q.data && kids.length === 0 && !editing && <p className="muted">{t.children.empty}</p>}
      <div className="stack">
        {kids.map((c) => (
          <div key={c.id} className="card row">
            <span className="cluster"><Face name={c.first_name} colour={c.colour} /><strong>{c.first_name}</strong><span className="muted small">{ageLabel(c.birthdate, lang)}</span></span>
            <span className="cluster">
              <button className="btn btn--ghost" onClick={() => setEditing(c)}>{t.children.edit}</button>
              <button className="btn btn--ghost btn--danger" onClick={() => confirm(t.children.removeConfirm) && remove.mutate(c.id)}>{t.children.remove}</button>
            </span>
          </div>
        ))}
      </div>
      {editing ? (
        <form className="card" onSubmit={submit} key={cur?.id ?? 'new'}>
          <label className="field"><span>{t.children.firstName}</span><input className="input" name="firstName" required maxLength={40} defaultValue={cur?.first_name} autoFocus /></label>
          <label className="field"><span>{t.children.birthdate}</span><input className="input" name="birthdate" type="date" defaultValue={cur?.birthdate ?? ''} /></label>
          <div className="field">
            <span>{t.children.colour}</span>
            <div className="cluster" role="radiogroup" aria-label={t.children.colour}>
              {COLOURS.map((col, i) => (
                <label key={col} className="swatch" style={{ background: col }}>
                  <input type="radio" name="colour" value={col} defaultChecked={cur ? cur.colour === col : i === kids.length % COLOURS.length} />
                </label>
              ))}
            </div>
          </div>
          <div className="cluster">
            <button className="btn btn--primary" disabled={save.isPending}>{t.children.save}</button>
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>{t.encounters.back}</button>
          </div>
        </form>
      ) : (
        <button className="btn btn--primary" style={{ marginTop: '0.75rem' }} onClick={() => setEditing('new')}>{t.children.add}</button>
      )}
      <HomeCardForm />
    </>
  )
}
