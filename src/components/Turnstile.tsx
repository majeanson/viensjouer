import { useEffect, useRef } from 'react'

// The Turnstile bot check (Cloudflare): renders its widget and hands the token to the form through a hidden field named
// `turnstile`. Only mounted when /api/health says a site key is configured. The script comes from challenges.cloudflare.com
// (the one third party the policy allows, said on the privacy page) and is loaded once.
type Api = { render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string; remove: (id: string) => void }
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

export function Turnstile({ siteKey }: { siteKey: string }) {
  const box = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let id: string | undefined
    let gone = false
    void load()
      .then(() => {
        if (gone || !box.current || !window.turnstile) return
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          callback: (t) => field.current && (field.current.value = t),
          'expired-callback': () => field.current && (field.current.value = ''),
          'error-callback': () => field.current && (field.current.value = ''),
        })
      })
      .catch(() => {})
    return () => {
      gone = true
      if (id) window.turnstile?.remove(id)
    }
  }, [siteKey])
  return (
    <div className="field">
      <div ref={box} data-testid="turnstile" />
      <input ref={field} type="hidden" name="turnstile" defaultValue="" />
    </div>
  )
}
