import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang, useT } from '../i18n'
import { whenLong } from '../lib/format'
import { Header } from '../components/Header'
import { Loading } from '../components/Loading'
import { QueryError } from '../components/QueryError'
import { Icon } from '../components/Icon'

interface Offer {
  alive: boolean
  window: { starts_at: number; ends_at: number; note: string | null }
  host: { child_first_name: string; parent_name: string; household_name: string }
  you: { child_first_name: string; parent_name: string; reply: 'yes' | 'no' | null; replyNote: string | null }
}

// The install-free side of an open window: « on est libres dimanche après-midi — on se voit ? »
// One tap, an optional word, done. No account.
export function WindowReply() {
  const { token = '' } = useParams()
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const key = ['window', token]
  const q = useQuery({ queryKey: key, queryFn: () => api<Offer>(`w/${token}`), retry: false })
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const post = useMutation({
    mutationFn: (body: { reply: 'yes' | 'no'; note: string | null }) => api(`w/${token}`, { method: 'POST', body }),
    onSuccess: () => {
      setDone(true)
      setErr(null)
      void qc.invalidateQueries({ queryKey: key })
    },
    onError: (e) => setErr(e.message),
  })
  if (q.isLoading) return <Loading page />
  if (!q.data) return <QueryError page error={q.error} dead={t.reply.dead} onRetry={() => void q.refetch()} />
  const { window: w, host, you, alive } = q.data
  const answer = (reply: 'yes' | 'no') => (e: FormEvent) => {
    e.preventDefault()
    const note = (document.getElementById('wnote') as HTMLInputElement | null)?.value.trim() || null
    post.mutate({ reply, note })
  }
  return (
    <div className="shell">
      <Header />
      <div className="card">
        <span className="chip chip--kind">{t.windows.chip}</span>
        <h1 style={{ marginTop: '0.5rem' }}>{t.windows.offer(host.child_first_name, you.child_first_name)}</h1>
        <p className="muted">{t.reply.from(host.parent_name || host.household_name)}</p>
        <p><strong>{whenLong(w.starts_at, lang)}</strong> → {whenLong(w.ends_at, lang)}</p>
        {w.note && <p className="muted">« {w.note} »</p>}
      </div>
      <p className="muted small">{t.windows.explain(host.parent_name || host.household_name, host.child_first_name)}</p>
      {!alive ? (
        <div className="notice">{t.windows.over}</div>
      ) : (
        <div className="card">
          {done && <div className="notice">{t.reply.saved}</div>}
          {you.reply && !done && <p className="muted small">{t.reply.yourReply} : <strong>{you.reply === 'yes' ? t.windows.yes : t.windows.no}</strong></p>}
          <h3>{t.windows.question}</h3>
          <label className="field"><span><Icon name="note" />{t.reply.note}</span><input id="wnote" className="input" maxLength={500} defaultValue={you.replyNote ?? ''} placeholder={t.windows.notePlaceholderReply} /></label>
          {err && <div className="notice notice--err">{err}</div>}
          <div className="stack">
            <button className="btn btn--yes btn--big" disabled={post.isPending} onClick={answer('yes')}>{t.windows.yes}</button>
            <button className="btn" disabled={post.isPending} onClick={answer('no')}>{t.windows.no}</button>
          </div>
        </div>
      )}
      <footer className="footer muted small">
        <p>{t.reply.footer}</p>
        <Link to="/" className="btn btn--ghost">{t.reply.create}</Link>
      </footer>
    </div>
  )
}
