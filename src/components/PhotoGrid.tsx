import { useRef, useState } from 'react'
import { useT } from '../i18n'
import { resizeToJpeg } from '../lib/photo'

// « Souvenirs » — the day's photos. One grid for the host and the families that said yes:
// the caller says where the bytes come from (`src`), how to upload (`onUpload`, given an
// already-shrunk JPEG) and whether a photo can be removed. The picker offers the camera
// AND the library (no `capture` attribute): the phone decides.
export function PhotoGrid({
  items,
  src,
  onUpload,
  onDelete,
  enabled,
}: {
  items: { id: string; author_label?: string }[]
  src: (id: string) => string
  onUpload: (blob: Blob) => Promise<void>
  onDelete?: (id: string) => void
  enabled: boolean
}) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function pick(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setErr(null)
    try {
      for (const f of Array.from(files).slice(0, 6)) await onUpload(await resizeToJpeg(f))
    } catch (e) {
      setErr(e instanceof Error && e.message && !['canvas', 'encode'].includes(e.message) && !/decode|source/i.test(e.message) ? e.message : t.souvenirs.failed)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div>
      {items.length === 0 && <p className="muted small">{t.souvenirs.empty}</p>}
      <div className="photos">
        {items.map((p) => (
          <figure key={p.id} className="photo">
            <a href={src(p.id)} target="_blank" rel="noopener"><img src={src(p.id)} alt={p.author_label ? `${t.souvenirs.by} ${p.author_label}` : t.souvenirs.title} loading="lazy" /></a>
            {onDelete && <button type="button" className="photo__x" aria-label={t.souvenirs.remove} onClick={() => onDelete(p.id)}>×</button>}
          </figure>
        ))}
      </div>
      {err && <div className="notice notice--err">{err}</div>}
      {enabled && (
        <>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void pick(e.target.files)} />
          <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? t.souvenirs.adding : t.souvenirs.add}</button>
        </>
      )}
    </div>
  )
}
