import { useEffect, useState } from 'react'
import { useT } from '../i18n'

// A day and an hour as two plain pickers (a phone opens each at once), submitted as ONE value under `name`,
// « 2026-10-31T10:00 », the shape toLocalInput / fromLocalInput already speak. Controlled with `value` + `onChange`,
// or on its own with `defaultValue`.
export function WhenInput({ name, label, value, defaultValue, onChange }: { name: string; label: string; value?: string; defaultValue?: string; onChange?: (v: string) => void }) {
  const t = useT()
  const start = value ?? defaultValue ?? ''
  const [day, setDay] = useState(start.split('T')[0] ?? '')
  const [hour, setHour] = useState(start.split('T')[1] ?? '')
  // A quick chip (or « Refaire pareil ») changes the value from outside.
  useEffect(() => {
    if (value === undefined) return
    setDay(value.split('T')[0] ?? '')
    setHour(value.split('T')[1] ?? '')
  }, [value])
  const set = (d: string, h: string) => {
    setDay(d)
    setHour(h)
    onChange?.(d && h ? `${d}T${h}` : '')
  }
  return (
    <div className="when" role="group" aria-label={label}>
      <label className="field"><span>{t.form.day}</span><input className="input" type="date" required value={day} onChange={(e) => set(e.target.value, hour)} /></label>
      <label className="field"><span>{t.form.hour}</span><input className="input" type="time" required value={hour} onChange={(e) => set(day, e.target.value)} /></label>
      <input type="hidden" name={name} value={day && hour ? `${day}T${hour}` : ''} />
    </div>
  )
}
