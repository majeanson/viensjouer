import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useAuth } from '../lib/auth'
import { useLang, useT } from '../i18n'
import { fromLocalInput, toLocalInput, whenLong } from '../lib/format'
import { linkFor, linkLabel } from '../lib/link'
import { FamilyPicker } from '../components/FamilyPicker'
import { useDeferredRemove } from '../lib/toast'
import type { Child, Family, Group, OpenWindow } from '../lib/types'
import { Icon, BigAction } from '../components/Icon'

const wlink = (token: string) => linkFor(token, 'w')
const wlabel = (token: string) => linkLabel(token, 'w')

// « Une fenêtre ouverte » — we are free Sunday afternoon: offer it to chosen families, each
// answers « on se voit ! » from a link, the host turns a yes into a rencontre. It dies at its end.
export function Windows({ embedded = false }: { embedded?: boolean }) {
  const t = useT()
  const { lang } = useLang()
  const { me } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()
  const wins = useQuery({ queryKey: K.windows, queryFn: () => api<{ windows: OpenWindow[] }>('windows'), refetchInterval: 30_000 })
  const kids = useQuery({ queryKey: K.children, queryFn: () => api<{ children: Child[] }>('children') })
  const fams = useQuery({ queryKey: K.families, queryFn: () => api<{ families: Family[] }>('families') })
  const grp = useQuery({ queryKey: K.groups, queryFn: () => api<{ groups: Group[] }>('groups') })
  const rm = useDeferredRemove()
  const [adding, setAdding] = useState(embedded)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [childId, setChildId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: K.windows })

  const create = useMutation({
    mutationFn: (body: unknown) => api('windows', { method: 'POST', body }),
    onSuccess: () => {
      setAdding(false)
      setPicked(new Set())
      setErr(null)
      void refresh()
      void qc.invalidateQueries({ queryKey: K.calendar })
      if (embedded) nav('/rencontres')
    },
    onError: (e) => setErr(e.message),
  })
  const send = useMutation({ mutationFn: (targetId: string) => api('windows', { method: 'PUT', body: { targetId } }), onError: (e) => setErr(e.message) })

  const children = kids.data?.children ?? []
  const pickedChild = childId ?? children[0]?.id ?? null
  const now = Math.floor(Date.now() / 1000)

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
  async function copy(token: string) {
    const link = wlink(token)
    try {
      await navigator.clipboard.writeText(link)
      setCopied(token)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      prompt(t.encounters.copy, link)
    }
  }

  const defaultStart = (() => {
    const d = new Date()
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7))
    d.setHours(13, 0, 0, 0)
    return Math.floor(d.getTime() / 1000)
  })()

  return (
    <>
      {!embedded && (
        <>
          <h1>{t.windows.title}</h1>
          {!adding && <BigAction icon="clock" onClick={() => setAdding(true)}>{t.windows.new}</BigAction>}
          <p className="small"><Link to="/rencontres">← {t.nav.home}</Link></p>
        </>
      )}
      <p className="muted small">{t.windows.hint}</p>
      {err && <div className="notice notice--err">{err}</div>}

      {adding && (
        <form className="card" onSubmit={submit}>
          <h3><Icon name="smile" />{t.encounters.whoInvites}</h3>
          <div className="seg" style={{ marginBottom: '0.75rem' }}>
            {children.map((c) => (
              <button type="button" key={c.id} className={`btn ${pickedChild === c.id ? 'btn--on' : ''}`} onClick={() => setChildId(c.id)}>{c.first_name}</button>
            ))}
          </div>
          <label className="field"><span><Icon name="calendar" />{t.windows.from}</span><input className="input" name="startsAt" type="datetime-local" required defaultValue={toLocalInput(defaultStart)} /></label>
          <label className="field"><span><Icon name="clock" />{t.windows.to}</span><input className="input" name="endsAt" type="datetime-local" required defaultValue={toLocalInput(defaultStart + 3 * 3600)} /></label>
          <label className="field"><span><Icon name="note" />{t.encounters.note}</span><input className="input" name="note" maxLength={500} placeholder={t.windows.notePlaceholder} /></label>
          <h3><Icon name="users" />{t.encounters.invite}</h3>
          <FamilyPicker loaded={!!fams.data} families={fams.data?.families ?? []} groups={grp.data?.groups ?? []} selected={picked} onChange={setPicked} />
          <div className="cluster" style={{ marginTop: '0.75rem' }}>
            <button className="btn btn--primary" disabled={create.isPending || picked.size === 0 || !pickedChild}>{t.windows.create}</button>
            <button type="button" className="btn btn--ghost" onClick={() => setAdding(false)}>{t.encounters.back}</button>
          </div>
        </form>
      )}

      {wins.data && wins.data.windows.length === 0 && !adding && <p className="muted">{t.windows.empty}</p>}
      {rm.visible(wins.data?.windows ?? []).map((w) => {
        const over = w.ends_at <= now
        return (
          <div key={w.id} className="card" style={over ? { opacity: 0.6 } : undefined}>
            <div className="row">
              <span className="cluster"><strong>{whenLong(w.starts_at, lang)}</strong></span>
              <button className="btn btn--ghost btn--danger" onClick={() => rm.remove(w.id, t.undo.removed, async () => { await api('windows', { method: 'DELETE', body: { id: w.id } }); void refresh() })}>{t.encounters.delete}</button>
            </div>
            {over && <p className="muted small">{t.windows.over}</p>}
            {w.note && <p className="muted small">« {w.note} »</p>}
            {w.targets.map((tg) => (
              <div key={tg.id} className="linkrow">
                <div className="row">
                  <span className="cluster"><span><strong>{tg.child_first_name}</strong> <span className="muted small">· {tg.parent_name}</span></span></span>
                  <span className={`chip ${tg.reply === 'yes' ? 'chip--yes' : tg.reply === 'no' ? 'chip--no' : ''}`}>{tg.reply === 'yes' ? t.windows.yes : tg.reply === 'no' ? t.windows.no : t.encounters.reply.none}</span>
                </div>
                {tg.reply_note && <p className="small" style={{ margin: 0 }}>« {tg.reply_note} »</p>}
                {!over && (
                  <>
                    <div className="paper">{wlabel(tg.token)}</div>
                    <div className="cluster">
                      <button className="btn" onClick={() => void copy(tg.token)}>{copied === tg.token ? t.encounters.copied : t.encounters.copy}</button>
                      {me.mail && tg.email && <button className="btn" disabled={send.isPending} onClick={() => send.mutate(tg.id)}>{t.encounters.send}</button>}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}
