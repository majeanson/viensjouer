import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useT } from '../i18n'
import { Why } from './Why'
import type { HomeCard as HomeCardData } from '../lib/types'

// « Chez nous » — what the other parent is too polite to ask, written once and shown on
// every invitation to a home rencontre.
export function HomeCardForm({ bare = false }: { bare?: boolean }) {
  const t = useT()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: K.homeCard, queryFn: () => api<{ card: HomeCardData | null }>('home-card') })
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (body: HomeCardData) => api('home-card', { method: 'PUT', body }),
    onSuccess: () => {
      setSaved(true)
      setErr(null)
      void qc.invalidateQueries({ queryKey: K.homeCard })
    },
    onError: (e) => setErr(e.message),
  })
  if (q.isLoading) return null
  const c = q.data?.card
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const screens = String(f.get('screens') ?? '')
    save.mutate({
      dog: f.get('dog') === 'on',
      pool: f.get('pool') === 'on',
      nutFree: f.get('nutFree') === 'on',
      screens: screens === 'none' || screens === 'little' || screens === 'free' ? screens : null,
      note: String(f.get('note') ?? ''),
    })
  }
  return (
    <section style={{ marginTop: bare ? 0 : '1.5rem' }}>
      {!bare && <h2>{t.kinds.home.title}</h2>}
      <p className="muted small">{t.kinds.home.hint}</p>
      <Why k="homeCard" />
      <form className="card" onSubmit={submit} onChange={() => setSaved(false)} key={JSON.stringify(c ?? null)}>
        <label className="check"><input type="checkbox" name="dog" defaultChecked={c?.dog} /><span>{t.kinds.home.dog}</span></label>
        <label className="check"><input type="checkbox" name="pool" defaultChecked={c?.pool} /><span>{t.kinds.home.pool}</span></label>
        <label className="check"><input type="checkbox" name="nutFree" defaultChecked={c?.nutFree} /><span>{t.kinds.home.nutFree}</span></label>
        <label className="field">
          <span>{t.kinds.home.screensLabel}</span>
          <select className="input" name="screens" defaultValue={c?.screens ?? ''}>
            <option value="">{t.kinds.home.screensUnset}</option>
            <option value="none">{t.kinds.home.screens.none}</option>
            <option value="little">{t.kinds.home.screens.little}</option>
            <option value="free">{t.kinds.home.screens.free}</option>
          </select>
        </label>
        <label className="field"><span>{t.kinds.home.note}</span><textarea className="input" name="note" maxLength={400} defaultValue={c?.note} placeholder={t.kinds.home.notePlaceholder} /></label>
        {err && <div className="notice notice--err">{err}</div>}
        {saved && <div className="notice">{t.kinds.home.saved}</div>}
        <button className="btn btn--primary" disabled={save.isPending}>{t.families.save}</button>
      </form>
    </section>
  )
}

// The read-only face, on the invited parent's page: a few chips and a line.
export function HomeCardView({ card }: { card: HomeCardData }) {
  const t = useT()
  return (
    <div className="card">
      <h3>{t.kinds.home.beforeYouCome}</h3>
      <div className="cluster" style={{ marginBottom: card.note ? '0.5rem' : 0 }}>
        {card.dog && <span className="chip">{t.kinds.home.dog}</span>}
        {card.pool && <span className="chip">{t.kinds.home.pool}</span>}
        {card.nutFree && <span className="chip chip--yes">{t.kinds.home.nutFree}</span>}
        {card.screens && <span className="chip">{t.kinds.home.screens[card.screens]}</span>}
      </div>
      {card.note && <p style={{ margin: 0 }}>{card.note}</p>}
    </div>
  )
}
