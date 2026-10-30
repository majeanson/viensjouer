import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useLang, useT } from '../i18n'
import { ageLabel } from '../lib/format'
import { Face } from '../components/Face'
import { AvatarPicker } from '../components/AvatarPicker'
import { Why } from '../components/Why'
import { useDeferredRemove } from '../lib/toast'
import type { Child } from '../lib/types'
import { Loading } from '../components/Loading'
import { QueryError } from '../components/QueryError'
import { Sheet } from '../components/Sheet'
import { Icon, BigAction } from '../components/Icon'
import { PALETTE } from '../lib/palette'

// The same six colours the server hands out in turn (functions/api/children.ts).
const COLOURS = PALETTE

// Add · edit (name, birthdate, colour) · remove. One form for add and edit, like the
// families page: `editing` is 'new', a child, or closed.
export function Children({ embedded = false }: { embedded?: boolean }) {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: K.children, queryFn: () => api<{ children: Child[] }>('children') })
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ photos: boolean }>('health'), staleTime: 60_000 })
  const [pending, setPending] = useState<Blob | null>(null)
  const [editing, setEditing] = useState<Child | 'new' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const invalidate = () => qc.invalidateQueries({ queryKey: K.children })

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ id?: string }>('children', { method: body.id ? 'PATCH' : 'POST', body }),
    onSuccess: async (r, body) => {
      // A face picked while adding goes up once the child exists (best effort: it can be added again).
      if (!body.id && pending && r?.id) await api(`avatar?kind=child&id=${r.id}`, { method: 'POST', body: pending }).catch(() => {})
      setPending(null)
      setEditing(null)
      setErr(null)
      void invalidate()
    },
    onError: (e) => setErr(e.message),
  })
  const rm = useDeferredRemove()

  const cur = editing && editing !== 'new' ? editing : null

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const birthdate = String(f.get('birthdate') ?? '')
    const body: Record<string, unknown> = { firstName: String(f.get('firstName') ?? ''), colour: String(f.get('colour') ?? COLOURS[0]), napStart: String(f.get('napStart') ?? '') || null, napEnd: String(f.get('napEnd') ?? '') || null }
    if (cur) {
      body.id = cur.id
      // An emptied date clears it; the endpoint reads `null` as "clear", absent as "keep".
      body.birthdate = birthdate || null
    } else if (birthdate) body.birthdate = birthdate
    save.mutate(body)
  }

  const kids = rm.visible(q.data?.children ?? [])
  return (
    <>
      {embedded ? <h2><Icon name="smile" />{t.children.title}</h2> : <h1>{t.children.title}</h1>}
      {!editing && (embedded ? <button type="button" className="btn btn--small" onClick={() => { setPending(null); setEditing('new') }}>{t.children.add}</button> : <BigAction icon="smile" onClick={() => { setPending(null); setEditing('new') }}>{t.children.add}</BigAction>)}
      {err && <div className="notice notice--err">{err}</div>}
      {q.isLoading && <Loading />}
      {q.isError && !q.data && <QueryError error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && kids.length === 0 && !editing && <p className="muted">{t.children.empty}</p>}
      <div className="stack">
        {kids.map((c) => (
          <div key={c.id} className="card row">
            <span className="cluster"><Face name={c.first_name} colour={c.colour} src={c.photo ? `/api/avatar/child/${c.id}?v=${c.photo}` : null} size="lg" /><strong>{c.first_name}</strong><span className="muted small">{ageLabel(c.birthdate, lang)}</span></span>
            <span className="cluster">
              <button className="btn btn--small" onClick={() => { setPending(null); setEditing(c) }}>{t.children.edit}</button>
              <button className="btn btn--small btn--danger" onClick={() => rm.remove(c.id, t.undo.removed, async () => { await api('children', { method: 'DELETE', body: { id: c.id } }); void invalidate() })}>{t.children.remove}</button>
            </span>
          </div>
        ))}
      </div>
      {editing ? (
        <Sheet title={cur ? cur.first_name : t.children.add} onBack={() => setEditing(null)} formId="child-form" saving={save.isPending} saveLabel={t.children.save}>
        <form id="child-form" onSubmit={submit} key={cur?.id ?? 'new'}>
          <AvatarPicker
            name={cur?.first_name ?? ''}
            colour={cur?.colour}
            src={cur?.photo ? `/api/avatar/child/${cur.id}?v=${cur.photo}` : null}
            enabled={!!health.data?.photos}
            label={t.avatar.add}
            onPick={cur ? undefined : setPending}
            onUpload={cur ? async (blob) => { await api(`avatar?kind=child&id=${cur.id}`, { method: 'POST', body: blob }); await invalidate() } : undefined}
            onRemove={cur ? async () => { await api('avatar', { method: 'DELETE', body: { kind: 'child', id: cur.id } }); await invalidate() } : undefined}
          />
          <label className="field"><span><Icon name="smile" />{t.children.firstName}</span><input className="input" name="firstName" required maxLength={40} defaultValue={cur?.first_name} /></label>
          <label className="field"><span><Icon name="cake" />{t.children.birthdate}</span><input className="input" name="birthdate" type="date" defaultValue={cur?.birthdate ?? ''} /><Why k="childBirthdate" /></label>
          <details className="more" open={!!cur?.nap_start || !!cur?.nap_end} style={{ marginBottom: '0.75rem' }}>
            <summary>{t.encounters.moreOptions}</summary>
            <div>
              <div className="field">
                <span><Icon name="clock" />{t.children.nap}</span>
                <div className="when when--even">
                  <label className="field"><span>{t.children.napFrom}</span><input className="input" name="napStart" type="time" step={900} defaultValue={cur?.nap_start ?? ''} /></label>
                  <label className="field"><span>{t.children.napTo}</span><input className="input" name="napEnd" type="time" step={900} defaultValue={cur?.nap_end ?? ''} /></label>
                </div>
                <Why k="nap" />
              </div>
              <div className="field">
                <span><Icon name="palette" />{t.children.colour}</span>
                <div className="cluster" role="radiogroup" aria-label={t.children.colour}>
                  {COLOURS.map((col, i) => (
                    <label key={col} className="swatch" style={{ background: col }}>
                      <input type="radio" name="colour" value={col} defaultChecked={cur ? cur.colour === col : i === kids.length % COLOURS.length} />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </details>
        </form>
        </Sheet>
      ) : null}
    </>
  )
}
