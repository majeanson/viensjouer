import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useT } from '../i18n'

// « Mon calendrier » — one secret link that puts every rencontre into Google Agenda, Apple Calendrier or
// Outlook and keeps it up to date (a time moved, a rencontre cancelled). The link holds the host's own
// addresses, so it says so; a new link kills the old one, and it can be switched off. Not in a trial.
export function CalendarFeed() {
  const t = useT()
  const { me } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['cal-link'], queryFn: () => api<{ token: string | null }>('cal-link'), enabled: !me.demo })
  const [asking, setAsking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const done = () => {
    setAsking(false)
    setErr(null)
    void qc.invalidateQueries({ queryKey: ['cal-link'] })
  }
  const make = useMutation({ mutationFn: () => api('cal-link', { method: 'POST', body: {} }), onSuccess: done, onError: (e) => setErr(e.message) })
  const off = useMutation({ mutationFn: () => api('cal-link', { method: 'DELETE' }), onSuccess: done, onError: (e) => setErr(e.message) })
  if (me.demo || !q.data) return null
  const token = q.data.token
  const https = token ? `${location.origin}/api/feed/${token}` : ''
  const webcal = token ? `webcal://${location.host}/api/feed/${token}` : ''
  async function copy() {
    try {
      await navigator.clipboard.writeText(https)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      prompt(t.calfeed.copy, https)
    }
  }
  return (
    <div className="card">
      <h2>{t.calfeed.title}</h2>
      <p className="muted small">{t.calfeed.hint}</p>
      {err && <div className="notice notice--err">{err}</div>}
      {!token ? (
        <button className="btn" disabled={make.isPending} onClick={() => make.mutate()}>{t.calfeed.make}</button>
      ) : (
        <>
          <p className="muted small">{t.calfeed.warn}</p>
          <div className="cluster">
            <a className="btn btn--primary" href={webcal}>{t.calfeed.open}</a>
            <button className="btn" onClick={() => void copy()}>{copied ? t.calfeed.copied : t.calfeed.copy}</button>
          </div>
          {asking ? (
            <div className="cluster" style={{ marginTop: '0.75rem' }}>
              <span className="small">{t.calfeed.rotateWarn}</span>
              <button className="btn btn--small" disabled={make.isPending} onClick={() => make.mutate()}>{t.calfeed.confirm}</button>
              <button className="linkbtn" onClick={() => setAsking(false)}>{t.calfeed.cancel}</button>
            </div>
          ) : (
            <div className="cluster" style={{ marginTop: '0.5rem' }}>
              <button className="linkbtn" onClick={() => setAsking(true)}>{t.calfeed.rotate}</button>
              <button className="linkbtn linkbtn--danger" disabled={off.isPending} onClick={() => off.mutate()}>{t.calfeed.off}</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
