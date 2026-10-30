import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { resizeToSquare } from '../lib/photo'
import { Face } from './Face'
import { Icon } from './Icon'
import { Why } from './Why'

// Add, change or remove one face (a child's, or mine). The phone offers the camera AND the library. The
// browser crops to a small square before sending, so the server only ever holds a few kilobytes. With no
// photo storage (`enabled` false) only the face is shown — never a button that cannot work.
//   - with `onUpload`: the picture goes up at once (an existing person)
//   - with `onPick`: the picture is kept in memory and shown as a preview until the person is saved
export function AvatarPicker({
  name,
  colour,
  src,
  enabled,
  onUpload,
  onPick,
  onRemove,
  label,
}: {
  name: string
  colour?: string
  src?: string | null
  enabled: boolean
  onUpload?: (blob: Blob) => Promise<void>
  onPick?: (blob: Blob | null) => void
  onRemove?: () => void | Promise<void>
  label: string
}) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  async function pick(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setBusy(true)
    setErr(null)
    try {
      const blob = await resizeToSquare(f)
      if (onUpload) await onUpload(blob)
      else {
        setPreview(URL.createObjectURL(blob))
        onPick?.(blob)
      }
    } catch (e) {
      setErr(e instanceof Error && e.message && !['canvas', 'encode'].includes(e.message) && !/decode|source/i.test(e.message) ? e.message : t.souvenirs.failed)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  const shown = preview ?? src ?? null
  const badge = { position: 'absolute', display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 999, border: '2px solid var(--card)' } as const
  return (
    <div className="avatarpick">
      <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
        {enabled ? (
          <button type="button" aria-label={shown ? t.avatar.change : t.avatar.add} title={shown ? t.avatar.change : t.avatar.add} disabled={busy} onClick={() => input.current?.click()} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', borderRadius: 999, opacity: busy ? 0.6 : 1 }}>
            <Face name={name || '·'} colour={colour} src={shown} size="xl" />
            <span aria-hidden="true" style={{ ...badge, right: 0, bottom: 0, background: 'var(--accent)', color: 'var(--accent-ink)' }}><Icon name="camera" /></span>
          </button>
        ) : (
          <Face name={name || '·'} colour={colour} src={shown} size="xl" />
        )}
        {enabled && shown && (
          <button type="button" aria-label={t.avatar.remove} title={t.avatar.remove} onClick={() => { if (preview) { setPreview(null); onPick?.(null) } else void onRemove?.() }} style={{ ...badge, right: 0, top: 0, background: 'var(--card)', color: 'var(--ink)', borderColor: 'var(--line)', cursor: 'pointer', padding: 0, width: 36, height: 36 }}>
            <Icon name="x" />
          </button>
        )}
      </div>
      {enabled && (
        <div className="avatarpick__side">
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files)} aria-label={label} />
          <Why k="avatar" />
          {err && <div className="notice notice--err">{err}</div>}
        </div>
      )}
    </div>
  )
}
