import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useT } from '../i18n'
import { fromLocalInput, toLocalInput } from '../lib/format'
import { FamilyPicker } from '../components/FamilyPicker'
import type { Child, Family, Group } from '../lib/types'
import { WhenInput } from '../components/WhenInput'
import { Icon } from '../components/Icon'

// « Une fenêtre ouverte » — we are free Sunday afternoon: offer it to chosen families, each answers « on se voit ! » from a link, the host
// turns a yes into a rencontre. It dies at its end. This is where one is made (the second tab of the new-rencontre page); the open ones
// are rows of the Rencontres list (WindowRow).
export function Windows() {
  const t = useT()
  const qc = useQueryClient()
  const nav = useNavigate()
  const kids = useQuery({ queryKey: K.children, queryFn: () => api<{ children: Child[] }>('children') })
  const fams = useQuery({ queryKey: K.families, queryFn: () => api<{ families: Family[] }>('families') })
  const grp = useQuery({ queryKey: K.groups, queryFn: () => api<{ groups: Group[] }>('groups') })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [childId, setChildId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (body: unknown) => api('windows', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.windows })
      void qc.invalidateQueries({ queryKey: K.calendar })
      nav('/rencontres')
    },
    onError: (e) => setErr(e.message),
  })

  const children = kids.data?.children ?? []
  const pickedChild = childId ?? children[0]?.id ?? null

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    create.mutate({
      childId: pickedChild,
      startsAt: fromLocalInput(String(f.get('startsAt') ?? '')),
      endsAt: fromLocalInput(String(f.get('endsAt') ?? '')),
      note: f.get('note') || undefined,
      families: [...picked],
    })
  }

  const defaultStart = (() => {
    const d = new Date()
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7))
    d.setHours(13, 0, 0, 0)
    return Math.floor(d.getTime() / 1000)
  })()

  return (
    <>
      <p className="muted small">{t.windows.hint}</p>
      {err && <div className="notice notice--err">{err}</div>}
      <form className="card" onSubmit={submit}>
          <h3><Icon name="smile" />{t.encounters.whoInvites}</h3>
          <div className="seg" style={{ marginBottom: '0.75rem' }}>
            {children.map((c) => (
              <button type="button" key={c.id} className={`btn ${pickedChild === c.id ? 'btn--on' : ''}`} onClick={() => setChildId(c.id)}>{c.first_name}</button>
            ))}
          </div>
          <div className="field"><span><Icon name="calendar" />{t.windows.from}</span><WhenInput name="startsAt" label={t.windows.from} defaultValue={toLocalInput(defaultStart)} /></div>
          <div className="field"><span><Icon name="clock" />{t.windows.to}</span><WhenInput name="endsAt" label={t.windows.to} defaultValue={toLocalInput(defaultStart + 3 * 3600)} /></div>
          <label className="field"><span><Icon name="note" />{t.encounters.note}</span><input className="input" name="note" maxLength={500} placeholder={t.windows.notePlaceholder} /></label>
          <h3><Icon name="users" />{t.encounters.invite}</h3>
          <FamilyPicker loaded={!!fams.data} families={fams.data?.families ?? []} groups={grp.data?.groups ?? []} selected={picked} onChange={setPicked} />
          <div className="cluster" style={{ marginTop: '0.75rem' }}>
            <button className="btn btn--primary" disabled={create.isPending || picked.size === 0 || !pickedChild}>{t.windows.create}</button>
          </div>
      </form>
    </>
  )
}
