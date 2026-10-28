import { useEffect, useState } from 'react'

// Installing the app on the home screen. Android and desktop Chrome hand the page a prompt it can fire
// from a button; iOS Safari has none, so we only describe the two taps (Partager, Sur l'écran d'accueil).
interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
}

export const isIos = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true)

export function useInstall() {
  const [, tick] = useState(0)
  useEffect(() => {
    const l = () => tick((n) => n + 1)
    listeners.add(l)
    return () => void listeners.delete(l)
  }, [])
  return {
    installed: isStandalone(),
    canPrompt: !!deferred,
    ios: isIos() && !isStandalone(),
    async install() {
      if (!deferred) return
      await deferred.prompt()
      await deferred.userChoice.catch(() => null)
      deferred = null
      listeners.forEach((l) => l())
    },
  }
}
