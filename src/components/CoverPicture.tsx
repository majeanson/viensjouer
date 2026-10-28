import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { useT } from '../i18n'
import { resizeToJpeg } from '../lib/photo'
import { useToast } from '../lib/toast'

// The host's cover picture for a rencontre: shown at the top of the card and on every invitation.
// Optional like every photo: with no bucket (`enabled` false) and no picture, nothing is shown.
// The picker offers the camera AND the library; the phone decides.
export function CoverPicture({ encounterId, cover, enabled, onChanged }: { encounterId: string; cover: string | null; enabled: boolean; onChanged: () => void }) {
  const t = useT()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)

  async function pick(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setBusy(true)
    setErr(null)
    try {
      await api(`cover?encounter=${encounterId}`, { method: 'POST', body: await resizeToJpeg(f) })
      setHidden(false)
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

  const shown = cover && !hidden
  if (!shown && !enabled) return null
  return (
    <div className="coverbox">
      {shown && <img className="cover" src={`/api/cover/${encounterId}?v=${cover}`} alt="" />}
      {enabled && (
        <div className="cluster">
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files)} />
          <button type="button" className="linkbtn" disabled={busy} onClick={() => input.current?.click()}>{busy ? t.souvenirs.adding : shown ? t.cover.change : t.cover.add}</button>
          {shown && <button type="button" className="linkbtn linkbtn--danger" onClick={remove}>{t.cover.remove}</button>}
        </div>
      )}
      {err && <div className="notice notice--err">{err}</div>}
    </div>
  )
}
