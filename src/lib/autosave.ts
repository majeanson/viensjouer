import { useEffect, useRef, useState } from 'react'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// An existing thing is edited with no « Enregistrer »: a moment after the last change the form is saved as it stands (only when it is
// valid), and « Retour » saves what is waiting before it closes. `poke` is called on every change (a form's onChange, or by hand for
// a control that is not a field), `flush` before leaving. `run` always sees the latest state, whichever render it was made in.
export function useAutosave(formId: string, run: (form: HTMLFormElement) => Promise<unknown>, delay = 700) {
  const [state, setState] = useState<SaveState>('idle')
  const latest = useRef(run)
  latest.current = run
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const fire = async () => {
    timer.current = undefined
    const f = document.getElementById(formId)
    if (!(f instanceof HTMLFormElement) || !f.checkValidity()) return
    setState('saving')
    try {
      await latest.current(f)
      setState('saved')
    } catch {
      setState('error')
    }
  }
  const poke = () => {
    clearTimeout(timer.current)
    setState('idle')
    timer.current = setTimeout(() => void fire(), delay)
  }
  const flush = async () => {
    if (!timer.current) return
    clearTimeout(timer.current)
    await fire()
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return { state, poke, flush }
}
