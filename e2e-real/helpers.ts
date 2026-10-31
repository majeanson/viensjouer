import { expect, type BrowserContext } from '@playwright/test'

// Shared by the real-stack specs: a real account made through the real signup door (fake address, a mail-less local stack, nothing leaves),
// and calls to the real API with the session and CSRF cookies of that browser context.
export const PASSWORD = 'correct-horse-battery-9'
const stamp = Date.now().toString(36)
export const addressOf = (who: string, tag = '') => `${who.toLowerCase()}${tag}-${stamp}@example.test`

export async function csrf(ctx: BrowserContext): Promise<string> {
  return (await ctx.cookies()).find((c) => c.name === 'vj-csrf' || c.name === 'vj_csrf')?.value ?? ''
}

export async function call<T = Record<string, unknown>>(ctx: BrowserContext, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, data?: unknown): Promise<{ status: number; body: T }> {
  const r = await ctx.request.fetch(`/api/${path}`, { method, ...(data === undefined ? {} : { data }), headers: { 'x-csrf-token': await csrf(ctx) } })
  const text = await r.text()
  let body: unknown = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { text }
  }
  return { status: r.status(), body: body as T }
}

export async function signup(ctx: BrowserContext, who: string, tag = ''): Promise<string> {
  const email = addressOf(who, tag)
  const r = await ctx.request.post('/api/auth/signup', { data: { email, password: PASSWORD, displayName: who } })
  expect(r.status(), `signup ${who}`).toBe(201)
  return email
}

// A time ahead (or behind, with a negative number of days), at a wall-clock hour.
export const inDays = (n: number, hour = 14): number => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(hour, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

// A 1x1 PNG, the smallest picture the photo doors accept.
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

export interface Detail {
  encounter: { id: string; status: string; co_child_name?: string | null; starts_at: number }
  invitations: { id: string; token: string; friend_family_id: string; reply: string | null; reply_note: string | null; scope: string }[]
  messages: { id: string; text: string; pinned?: number | boolean }[]
  relais: { invitation_id: string; nap: string | null }[]
  souvenirs: { id: string }[]
  bring: { id: string; label: string; claimed_label: string | null }[]
  slots?: { id: string; yes: number }[]
}
