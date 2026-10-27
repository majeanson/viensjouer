import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { ageLabel } from '../lib/format'
import { Face } from '../components/Face'
import type { Child } from '../lib/types'

export function Children() {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: K.children, queryFn: () => api<{ children: Child[] }>('children') })
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const invalidate = () => qc.invalidateQueries({ queryKey: K.children })

  const add = useMutation({
    mutationFn: (body: { firstName: string; birthdate?: string }) => api('children', { method: 'POST', body }),
    onSuccess: () => {
      setAdding(false)
      void invalidate()
    },
    onError: (e) => setErr(e.message),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api('children', { method: 'DELETE', body: { id } }),
    onSuccess: () => void invalidate(),
    onError: (e) => setErr(e.message),
  })

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const birthdate = String(f.get('birthdate') ?? '')
    add.mutate({ firstName: String(f.get('firstName') ?? ''), ...(birthdate ? { birthdate } : {}) })
  }

  const kids = q.data?.children ?? []
  return (
    <>
      <h1>{t.children.title}</h1>
      {err && <div className="notice notice--err">{err}</div>}
      {q.isLoading && <p className="muted">{t.common.loading}</p>}
      {q.data && kids.length === 0 && !adding && <p className="muted">{t.children.empty}</p>}
      <div className="stack">
        {kids.map((c) => (
          <div key={c.id} className="card row">
            <span className="cluster"><Face name={c.first_name} colour={c.colour} /><strong>{c.first_name}</strong><span className="muted small">{ageLabel(c.birthdate, lang)}</span></span>
            <button className="btn btn--ghost btn--danger" onClick={() => confirm(t.children.removeConfirm) && remove.mutate(c.id)}>{t.children.remove}</button>
          </div>
        ))}
      </div>
      {adding ? (
        <form className="card" onSubmit={submit}>
          <label className="field"><span>{t.children.firstName}</span><input className="input" name="firstName" required maxLength={40} autoFocus /></label>
          <label className="field"><span>{t.children.birthdate}</span><input className="input" name="birthdate" type="date" /></label>
          <div className="cluster">
            <button className="btn btn--primary" disabled={add.isPending}>{t.children.save}</button>
            <button type="button" className="btn btn--ghost" onClick={() => setAdding(false)}>{t.encounters.back}</button>
          </div>
        </form>
      ) : (
        <button className="btn btn--primary" style={{ marginTop: '0.75rem' }} onClick={() => setAdding(true)}>{t.children.add}</button>
      )}
    </>
  )
}
