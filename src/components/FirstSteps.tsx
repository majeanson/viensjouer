import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { K } from '../lib/query'
import { useT } from '../i18n'
import { Icon } from './Icon'

// « Pour commencer » on an empty Rencontres page: three steps, and the one that is next is a single small form right here, so the first
// rencontre needs no trip to another page. Child, then a friend, then one sentence (it opens the new-rencontre form already filled).
export function FirstSteps({ noChild, noFriend }: { noChild: boolean; noFriend: boolean }) {
  const t = useT()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [err, setErr] = useState<string | null>(null)
  const done = (key: readonly string[]) => () => {
    setErr(null)
    void qc.invalidateQueries({ queryKey: key })
  }
  const addChild = useMutation({ mutationFn: (firstName: string) => api('children', { method: 'POST', body: { firstName } }), onSuccess: done(K.children), onError: (e) => setErr(e.message) })
  const addFriend = useMutation({
    mutationFn: (b: { childFirstName: string; parentName: string }) => api('families', { method: 'POST', body: b }),
    onSuccess: done(K.families),
    onError: (e) => setErr(e.message),
  })
  const data = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    return new FormData(e.currentTarget)
  }
  return (
    <div className="card">
      <h2><Icon name="check" />{t.first.title}</h2>
      <ol className="steps">
        <li className={noChild ? 'now' : 'done'}>{noChild ? t.first.child : t.first.childDone}</li>
        <li className={noChild ? '' : noFriend ? 'now' : 'done'}>{noFriend ? t.first.friend : t.first.friendDone}</li>
        <li className={noChild || noFriend ? '' : 'now'}>{noChild || noFriend ? t.first.later : t.first.go}</li>
      </ol>
      {err && <div className="notice notice--err" role="alert">{err}</div>}
      {noChild && (
        <form onSubmit={(e) => addChild.mutate(String(data(e).get('firstName') ?? '').trim())}>
          <label className="field"><span><Icon name="smile" />{t.first.childName}</span><input className="input" name="firstName" required maxLength={40} autoComplete="off" /></label>
          <button className="btn btn--primary" disabled={addChild.isPending}>{t.first.childBtn}</button>
        </form>
      )}
      {!noChild && noFriend && (
        <>
          <form onSubmit={(e) => { const f = data(e); addFriend.mutate({ childFirstName: String(f.get('child') ?? '').trim(), parentName: String(f.get('parent') ?? '').trim() }) }}>
            <label className="field"><span><Icon name="smile" />{t.first.friendChild}</span><input className="input" name="child" required maxLength={40} autoComplete="off" /></label>
            <label className="field"><span><Icon name="user" />{t.first.friendParent}</span><input className="input" name="parent" required maxLength={60} autoComplete="off" /></label>
            <button className="btn btn--primary" disabled={addFriend.isPending}>{t.first.friendBtn}</button>
          </form>
          <Link to="/amis?importer=1" className="btn btn--small" style={{ marginTop: '0.5rem' }}>{t.families.importOpen}</Link>
        </>
      )}
      {!noChild && !noFriend && (
        <form onSubmit={(e) => { const say = String(data(e).get('say') ?? '').trim(); nav(say ? `/rencontres/nouvelle?say=${encodeURIComponent(say)}` : '/rencontres/nouvelle') }}>
          <label className="field"><span><Icon name="sparkle" />{t.form.say}</span><input className="input" name="say" maxLength={200} placeholder={t.form.sayExample} autoComplete="off" /></label>
          <button className="btn btn--primary">{t.encounters.new}</button>
        </form>
      )}
    </div>
  )
}
