import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { useT } from '../i18n'
import { Icon } from './Icon'
import { resizeToJpeg } from '../lib/photo'
import { useToast } from '../lib/toast'

// The host's cover picture for a rencontre: shown at the top of the card and on every invitation.
// Optional like every photo: with no bucket (`enabled` false) and no picture, nothing is shown.
// The picker offers the camera AND the library; the phone decides.
// `mode`: « show » is the picture alone (the top of the card), « controls » is the buttons alone (under « Plus d'options »).
export function CoverPicture({ encounterId, cover, enabled, onChanged, mode }: { encounterId: string; cover: string | null; enabled: boolean; onChanged: () => void; mode?: 'show' | 'controls' }) {
  const t = useT()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [broken, setBroken] = useState(false)

  async function pick(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setBusy(true)
    setErr(null)
    try {
      await api(`cover?encounter=${encounterId}`, { method: 'POST', body: await resizeToJpeg(f) })
      setHidden(false)
      setBroken(false)
      onChanged()
    } catch (e) {
      setErr(e instanceof Error && e.message && !['canvas', 'encode'].includes(e.message) && !/decode|source/i.test(e.message) ? e.message : t.souvenirs.failed)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  // Hide it now, remove it for real after the undo window.
  function remove() {
    setHidden(true)
    toast.later(
      t.undo.removed,
      async () => {
        await api('cover', { method: 'DELETE', body: { encounter: encounterId } })
        onChanged()
      },
      () => setHidden(false),
    )
  }

  const shown = cover && !hidden && !broken
  const showPicture = mode !== 'controls' && !!shown
  const showControls = mode !== 'show' && enabled
  if (!showPicture && !showControls) return null
  return (
    <div className="coverbox">
      {showPicture && <img className="cover" src={`/api/cover/${encounterId}?v=${cover}`} alt="" onError={() => setBroken(true)} />}
      {showControls && (
        <div className="cluster">
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files)} />
          <button type="button" className="btn btn--small" disabled={busy} onClick={() => input.current?.click()}><Icon name="camera" />{busy ? t.souvenirs.adding : shown ? t.cover.change : t.cover.add}</button>
          {shown && <button type="button" className="btn btn--small btn--danger btn--icon" aria-label={t.cover.remove} title={t.cover.remove} onClick={remove}><Icon name="x" /></button>}
        </div>
      )}
      {err && <div className="notice notice--err">{err}</div>}
    </div>
  )
}
