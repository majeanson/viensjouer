import { api } from './api'

// Notifications on THIS device (Web Push). The page asks permission, subscribes through the service worker and tells the
// server the device's endpoint; the server wakes it with an empty push and the worker fetches the text (public/sw.js).
export const pushSupported = (): boolean => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window

export const pushPermission = (): NotificationPermission | 'unsupported' => (pushSupported() ? Notification.permission : 'unsupported')

const toKey = (b64: string): Uint8Array<ArrayBuffer> => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

// The service worker is only registered in production builds: waiting forever on it in development would freeze the button.
async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 5000))])
  if (!reg) throw new Error('worker')
  return reg
}

export async function isSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false
  const reg = await navigator.serviceWorker.getRegistration()
  return !!(await reg?.pushManager.getSubscription())
}

/** Ask permission, subscribe this device and tell the server. Throws `denied` when the person said no. */
export async function enablePush(publicKey: string): Promise<void> {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('denied')
  const reg = await registration()
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }))
  await api('push', { method: 'POST', body: { endpoint: sub.endpoint } })
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await api('push', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => {})
  await sub.unsubscribe()
}
