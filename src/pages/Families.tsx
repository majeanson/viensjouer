import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useT } from '../i18n'
import { Face } from '../components/Face'
import { Why } from '../components/Why'
import { Groups } from '../components/Groups'
import type { Family } from '../lib/types'

// « Les familles amies » — the book. Add by hand here, or let a reply fill it.
export function Families() {
  const t = useT()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: K.families, queryFn: () => api<{ families: Family[] }>('families') })
  const [editing, setEditing] = useState<Family | 'new' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const invalidate = () => qc.invalidateQueries({ queryKey: K.families })

  const save = useMutation({
    mutationFn: (body: Record<string, string | null>) => api('families', { method: body.id ? 'PATCH' : 'POST', body }),
    onSuccess: () => {
      setEditing(null)
      void invalidate()
    },
    onError: (e) => setErr(e.message),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api('families', { method: 'DELETE', body: { id } }),
    onSuccess: () => void invalidate(),
    onError: (e) => setErr(e.message),
  })

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const body = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string | null>
    if (body.childBirthdate === '') body.childBirthdate = null
    if (editing && editing !== 'new') body.id = editing.id
    save.mutate(body)
  }

  const fams = q.data?.families ?? []
  const cur = editing && editing !== 'new' ? editing : null
  return (
    <>
      <h1>{t.families.title}</h1>
      <p className="muted small">{t.families.hint}</p>
      {err && <div className="notice notice--err">{err}</div>}
      {q.data && fams.length === 0 && !editing && <p className="muted">{t.families.empty}</p>}
      <div className="stack">
        {fams.map((f) => (
          <div key={f.id} className="card">
            <div className="row">
              <span className="cluster"><Face name={f.child_first_name} /><span><strong>{f.child_first_name}</strong><br /><span className="muted small">{f.parent_name}{f.email ? ` · ${f.email}` : ''}{f.phone ? ` · ${f.phone}` : ''}</span></span></span>
              <span className="cluster">
                <button className="btn btn--ghost" onClick={() => setEditing(f)}>{t.encounters.edit}</button>
                <button className="btn btn--ghost btn--danger" onClick={() => confirm(t.families.removeConfirm) && remove.mutate(f.id)}>{t.families.remove}</button>
              </span>
            </div>
            {(f.allergies || f.notes) && <p className="small muted" style={{ margin: '0.5rem 0 0' }}>{[f.allergies && `⚠ ${f.allergies}`, f.notes].filter(Boolean).join(' · ')}</p>}
          </div>
        ))}
      </div>
      {editing ? (
        <form className="card" onSubmit={submit} key={cur?.id ?? 'new'}>
          <label className="field"><span>{t.families.childFirstName}</span><input className="input" name="childFirstName" required maxLength={40} defaultValue={cur?.child_first_name} autoFocus /></label>
          <label className="field"><span>{t.families.birthdate}</span><input className="input" name="childBirthdate" type="date" defaultValue={cur?.child_birthdate ?? ''} /><Why k="friendBirthdate" /></label>
          <label className="field"><span>{t.families.parentName}</span><input className="input" name="parentName" required maxLength={60} defaultValue={cur?.parent_name} /></label>
          <label className="field"><span>{t.families.email}</span><input className="input" name="email" type="email" defaultValue={cur?.email ?? ''} /><Why k="friendEmail" /></label>
          <label className="field"><span>{t.families.phone}</span><input className="input" name="phone" type="tel" defaultValue={cur?.phone ?? ''} /><Why k="phone" /></label>
          <label className="field"><span>{t.families.allergies}</span><input className="input" name="allergies" maxLength={300} defaultValue={cur?.allergies ?? ''} /><Why k="allergies" /></label>
          <label className="field"><span>{t.families.notes}</span><input className="input" name="notes" maxLength={1000} defaultValue={cur?.notes ?? ''} /><Why k="notes" /></label>
          <div className="cluster">
            <button className="btn btn--primary" disabled={save.isPending}>{t.families.save}</button>
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>{t.encounters.back}</button>
          </div>
        </form>
      ) : (
        <button className="btn btn--primary" style={{ marginTop: '0.75rem' }} onClick={() => setEditing('new')}>{t.families.add}</button>
      )}
      <Groups families={fams} />
    </>
  )
}
