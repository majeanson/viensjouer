import { useEffect, useRef } from 'react'

// The Turnstile bot check (Cloudflare): renders its widget and hands the token to the form through a hidden field named
// `turnstile`. Only mounted when /api/health says a site key is configured. The script comes from challenges.cloudflare.com
// (the one third party the policy allows, said on the privacy page) and is loaded once.
type Api = { reset: (id: string) => void; render: (el: HTMLElement, o: { sitekey: string; action: string; callback: (t: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string; remove: (id: string) => void }
declare global {
  interface Window {
    turnstile?: Api
  }
}
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<void> | null = null
function load(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      reject(new Error('turnstile'))
    }
    document.head.appendChild(s)
  })
  return loading
}

// `action` names the surface (signup, forgot): the server refuses a token solved for another one. A token works once, so
// `resetKey` goes up after each attempt and the widget is reset to hand out a fresh one.
export function Turnstile({ siteKey, action, resetKey = 0 }: { siteKey: string; action: 'signup' | 'forgot'; resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const widget = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (resetKey === 0 || !widget.current) return
    if (field.current) field.current.value = ''
    window.turnstile?.reset(widget.current)
  }, [resetKey])
  useEffect(() => {
    let id: string | undefined
    let gone = false
    void load()
      .then(() => {
        if (gone || !box.current || !window.turnstile) return
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          action,
          callback: (t) => field.current && (field.current.value = t),
          'expired-callback': () => field.current && (field.current.value = ''),
          'error-callback': () => field.current && (field.current.value = ''),
        })
        widget.current = id
      })
      .catch(() => {})
    return () => {
      gone = true
      if (id) window.turnstile?.remove(id)
    }
  }, [siteKey, action])
  return (
    <div className="field">
      <div ref={box} data-testid="turnstile" />
      <input ref={field} type="hidden" name="turnstile" defaultValue="" />
    </div>
  )
}
