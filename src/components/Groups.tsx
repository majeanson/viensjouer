import { useState, type FormEvent } from 'react'
import { ValidForm } from './ValidForm'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useT } from '../i18n'
import { FamilyPicker } from './FamilyPicker'
import { useDeferredRemove } from '../lib/toast'
import type { Family, Group } from '../lib/types'
import { useAutosave } from '../lib/autosave'
import { SwipeRow } from './SwipeRow'
import { EmptyState } from './EmptyState'
import { Sheet } from './Sheet'
import { Icon } from './Icon'
import { Face } from './Face'
import { colourOf } from '../lib/palette'

// Groups — the host's private shortcuts (« La garderie »). Lives under the friend-families
// list: a group is just a named set of those families.
export function Groups({ families }: { families: Family[] }) {
  const t = useT()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: K.groups, queryFn: () => api<{ groups: Group[] }>('groups') })
  const [editing, setEditing] = useState<Group | 'new' | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [err, setErr] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: K.groups })
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api('groups', { method: body.id ? 'PATCH' : 'POST', body }),
    onSuccess: () => {
      setEditing(null)
      setErr(null)
      void refresh()
    },
    onError: (e) => setErr(e.message),
  })
  const rm = useDeferredRemove()

  const groups = rm.visible(q.data?.groups ?? [])
  const cur = editing && editing !== 'new' ? editing : null
  const open = (g: Group | 'new') => {
    setEditing(g)
    setPicked(new Set(g === 'new' ? [] : g.families))
  }
  const removeGroup = (g: Group) => rm.remove(g.id, t.undo.removed, async () => { await api('groups', { method: 'DELETE', body: { id: g.id } }); void refresh() })
  const bodyOf = (f: HTMLFormElement): Record<string, unknown> => ({ name: new FormData(f).get('name'), families: [...picked], ...(cur ? { id: cur.id } : {}) })
  // A new group is saved with the button; an existing one saves itself as it is edited (its name, or a family ticked or not).
  const auto = useAutosave('group-form', async (f) => {
    await api('groups', { method: 'PATCH', body: bodyOf(f) })
    void refresh()
  })
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (cur) return void auto.flush()
    save.mutate(bodyOf(e.currentTarget))
  }

  return (
    <section>
      <p className="muted small">{t.groups.hint}</p>
      {err && <div className="notice notice--err">{err}</div>}
      {q.data && groups.length === 0 && !editing && <EmptyState>{t.groups.empty}</EmptyState>}
      <div className="stack">
        {groups.map((g) => {
          const members = g.families.map((id) => families.find((f) => f.id === id)).filter((f): f is Family => !!f)
          return (
            <SwipeRow key={g.id} onLeft={() => removeGroup(g)} onRight={() => open(g)} leftLabel={t.families.remove} rightLabel={t.encounters.edit}>
            <details className="card friend" style={{ marginBottom: 0 }}>
              <summary>
                <span className="faces" aria-hidden="true">{members.slice(0, 3).map((f) => <Face key={f.id} name={f.child_first_name} colour={colourOf(f.child_first_name)} size="md" />)}</span>
                <span className="friend__who"><strong>{g.name}</strong><span className="muted small">{members.map((f) => f.child_first_name).join(', ') || '—'}</span></span>
              </summary>
              <div className="cluster" style={{ marginTop: '0.75rem' }}>
                <button className="btn btn--small btn--icon" aria-label={t.encounters.edit} title={t.encounters.edit} onClick={() => open(g)}><Icon name="edit" /></button>
                <button className="btn btn--small btn--danger btn--icon" aria-label={t.families.remove} title={t.families.remove} onClick={() => removeGroup(g)}><Icon name="trash" /></button>
              </div>
            </details>
            </SwipeRow>
          )
        })}
      </div>
      {editing ? (
        <Sheet title={cur ? cur.name : t.groups.add} onBack={async () => { await auto.flush(); setEditing(null) }} formId={cur ? undefined : 'group-form'} saving={save.isPending} saveLabel={t.families.save} autosave={cur ? auto.state : undefined}>
        <ValidForm id="group-form" onSubmit={submit} onChange={cur ? auto.poke : undefined} key={cur?.id ?? 'new'}>
          <label className="field"><span><Icon name="tag" />{t.groups.name}</span><input className="input" name="name" required maxLength={60} defaultValue={cur?.name} placeholder={t.groups.namePlaceholder} /></label>
          <FamilyPicker families={families} groups={[]} selected={picked} onChange={(p) => { setPicked(p); if (cur) auto.poke() }} />
        </ValidForm>
        </Sheet>
      ) : (
        families.length > 0 && <button className="btn" style={{ marginTop: '0.75rem' }} onClick={() => open('new')}>{t.groups.add}</button>
      )}
    </section>
  )
}
