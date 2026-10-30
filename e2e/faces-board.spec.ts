import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Faces (a child's, mine), the profile name, the message board on both sides, the phone's bottom tabs,
// the icons, and the invitation answering first. The API is stubbed like in the other specs.
import { PNG, fam, now } from './fixtures'

type Call = { method: string; path: string; full: string; body: unknown; type: string }
type Handler = (c: Call, url: URL) => { status?: number; json?: unknown } | undefined

async function host(page: Page, handlers: Record<string, Handler> = {}, extra: { me?: Record<string, unknown>; children?: unknown[] } = {}) {
  const calls: Call[] = []
  await page.route('**/api/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const path = url.pathname.replace('/api/', '')
    const type = req.headers()['content-type'] ?? ''
    const body = type.includes('json') && req.postData() ? req.postDataJSON() : req.postDataBuffer()
    const call: Call = { method: req.method(), path, full: path + url.search, body, type }
    calls.push(call)
    if (/^avatar\//.test(path)) return r.fulfill({ body: PNG, contentType: 'image/png' })
    const custom = handlers[`${req.method()} ${path}`]?.(call, url)
    if (custom) return r.fulfill({ status: custom.status ?? 200, json: custom.json ?? {} })
    const defaults: Record<string, unknown> = {
      health: { ok: true, mail: false, photos: true, invite: false },
      'auth/me': { signedIn: true, email: 'm@example.com', displayName: 'Marc', household: { id: 'h', name: 'Les Jeanson', tz: 'America/Toronto' }, mail: false, demo: false, ...extra.me },
      children: { children: extra.children ?? [{ id: 'c1', first_name: 'Noé', birthdate: '2023-04-10', colour: '#f2a03d', position: 0, photo: 'p1' }] },
      families: { families: [] },
      groups: { groups: [] },
      encounters: { encounters: [], invitations: [] },
      calendar: { items: [], birthdays: [], today: '2030-01-01' },
      circle: { children: [], book: [] },
      'home-card': { card: null },
      'parent-invite': { invites: [] },
      'cal-link': { token: null },
    }
    return r.fulfill({ json: defaults[path] ?? {} })
  })
  return calls
}

const msg = (id: string, who: 'host' | 'guest', label: string, text: string, ago: number, over: Record<string, unknown> = {}) => ({ id, author_kind: who, author_label: label, text, created_at: now - ago, pinned: 0, ...over })
const detail = (messages: unknown[]) => ({
  encounter: { id: 'e1', child_id: 'c1', kind: 'park', title: 'Au parc', starts_at: now + 86400, ends_at: null, place: 'Parc', address: null, map_url: null, note: null, status: 'proposed', series_id: null, details: {}, hereOpen: false, cover: null, show_guests: true },
  invitations: [],
  messages,
  relais: [],
  souvenirs: [],
  changes: [],
  bring: [],
})

test('a child\'s face: shown, changed from the edit form, removed — and added while adding a child', async ({ page }) => {
  const calls = await host(page)
  await page.goto('/enfants')
  await expect(page.locator('.face img').first()).toHaveAttribute('src', '/api/avatar/child/c1?v=p1')
  await page.getByRole('button', { name: 'Modifier' }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG })
  await expect.poll(() => calls.filter((c) => c.method === 'POST' && c.full === 'avatar?kind=child&id=c1').length).toBe(1)
  expect(calls.find((c) => c.full === 'avatar?kind=child&id=c1')!.type).toBe('image/jpeg')
  await page.getByRole('button', { name: 'Retirer la photo' }).click()
  await expect.poll(() => calls.filter((c) => c.method === 'DELETE' && c.path === 'avatar').length).toBe(1)
  expect(calls.find((c) => c.method === 'DELETE' && c.path === 'avatar')!.body).toEqual({ kind: 'child', id: 'c1' })
})

test('a face picked while adding a child goes up once the child exists', async ({ page }) => {
  const calls = await host(page, { 'POST children': () => ({ status: 201, json: { id: 'c9' } }) }, { children: [] })
  await page.goto('/enfants')
  await page.getByRole('button', { name: 'Ajouter un enfant' }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('.avatarpick .face img')).toBeVisible()
  await page.getByLabel('Prénom').fill('Alice')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect.poll(() => calls.filter((c) => c.full === 'avatar?kind=child&id=c9').length).toBe(1)
  // the order matters: the child first, then the picture
  const order = calls.map((c) => c.full).filter((p) => p === 'children' || p.startsWith('avatar'))
  expect(order.indexOf('children')).toBeLessThan(order.indexOf('avatar?kind=child&id=c9'))
})

test('my profile: a face and the first name shown on invitations', async ({ page }) => {
  let name = 'Marc'
  const calls = await host(page, {
    'PATCH profile': (c) => {
      name = (c.body as { displayName: string }).displayName
      return { json: { ok: true } }
    },
    'GET auth/me': () => ({ json: { signedIn: true, email: 'm@example.com', displayName: name, household: { id: 'h', name: 'Les Jeanson', tz: 'America/Toronto' }, mail: false, demo: false, photo: 'me1' } }),
  })
  await page.goto('/compte')
  await expect(page.locator('input[name=displayName]')).toBeVisible()
  await expect(page.locator('.avatarpick .face img')).toHaveAttribute('src', '/api/avatar/parent/me?v=me1')
  await page.getByLabel('Mon prénom').fill('Marc-Antoine')
  await page.locator('form', { has: page.getByLabel('Mon prénom') }).getByRole('button').click()
  await expect.poll(() => calls.filter((c) => c.method === 'PATCH' && c.path === 'profile').length).toBe(1)
  expect(calls.find((c) => c.path === 'profile')!.body).toEqual({ displayName: 'Marc-Antoine' })
  // the header shows the face only: the name is the button's label for a screen reader and its tooltip, never printed
  await expect(page.locator('.head .tool__name')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Menu (Marc-Antoine)' })).toBeVisible()
  await page.locator('input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG })
  await expect.poll(() => calls.filter((c) => c.full === 'avatar?kind=parent').length).toBe(1)
})

test('without photo storage there is no photo button, only the initial', async ({ page }) => {
  await host(page, { 'GET health': () => ({ json: { ok: true, mail: false, photos: false, invite: false } }) }, { children: [{ id: 'c1', first_name: 'Noé', birthdate: null, colour: '#f2a03d', position: 0, photo: null }] })
  await page.goto('/enfants')
  await page.getByRole('button', { name: 'Modifier' }).click()
  await expect(page.locator('input[type=file]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ajouter une photo' })).toHaveCount(0)
  await expect(page.locator('.avatarpick .face')).toHaveText('N')
})

test('the host\'s board: write, pin at the top, remove with an undo, links are links', async ({ page }) => {
  const calls = await host(page, {
    'GET encounters': (_c, url) =>
      url.searchParams.get('id')
        ? {
            json: detail([
              msg('m1', 'guest', 'Julie', 'Super, on arrive vers 14 h', 3600),
              msg('m2', 'host', 'Marc', 'Rendez-vous à la fontaine', 7200, { pinned: 1 }),
              msg('m3', 'guest', 'Paul', 'Le plan : https://maps.app.goo.gl/abc.', 600),
            ]),
          }
        : undefined,
    'POST messages': () => ({ status: 201, json: { id: 'm9' } }),
    'PATCH messages': () => ({ json: { ok: true } }),
  })
  await page.goto('/rencontres/e1')
  const board = page.getByLabel('Les messages', { exact: true })
  // closed until there is something new: one line with the count, opened when curious
  await expect(board.locator('summary')).toContainText('Les messages (3)')
  await board.locator('summary').click()
  // the pinned one leads, in its own block
  await expect(board.locator('.blist--pinned')).toContainText('Rendez-vous à la fontaine')
  await expect(board.locator('.blist--pinned .bmsg')).toHaveCount(1)
  // a link in a message is a real link, without the trailing dot, and opens safely
  const link = board.getByRole('link', { name: 'https://maps.app.goo.gl/abc' })
  await expect(link).toHaveAttribute('href', 'https://maps.app.goo.gl/abc')
  await expect(link).toHaveAttribute('rel', /noopener/)
  await expect(board).toContainText('il y a 1 heure')
  // write
  await board.getByRole('button', { name: 'Publier' }).click() // nothing written yet: a calm hint, never a dead button
  await expect(board.getByText('Écris un mot d’abord.')).toBeVisible()
  await board.getByLabel('Écrire un message…').fill('À samedi !')
  await board.getByRole('button', { name: 'Publier' }).click()
  await expect.poll(() => calls.filter((c) => c.method === 'POST' && c.path === 'messages').length).toBe(1)
  expect((calls.find((c) => c.method === 'POST' && c.path === 'messages')!.body as { text: string }).text).toBe('À samedi !')
  // pin another
  await board.getByRole('button', { name: 'Épingler' }).first().click()
  await expect.poll(() => calls.filter((c) => c.method === 'PATCH' && c.path === 'messages').length).toBe(1)
  expect(calls.find((c) => c.method === 'PATCH' && c.path === 'messages')!.body).toMatchObject({ pinned: true })
  // remove: gone at once, undoable, nothing sent yet
  await board.getByRole('button', { name: 'Retirer' }).first().click()
  await expect(board.locator('summary')).toContainText('Les messages (2)')
  expect(calls.filter((c) => c.method === 'DELETE' && c.path === 'messages')).toHaveLength(0)
  await page.locator('.toast').getByRole('button', { name: 'Annuler' }).click()
  await expect(board.locator('summary')).toContainText('Les messages (3)')
})

// ---- the invited side
const card = (over: Record<string, unknown> = {}) => ({
  alive: true,
  encounter: { id: 'e1', child_id: 'c1', kind: 'park', title: 'Au parc', starts_at: now + 3 * 86400, ends_at: null, place: 'Parc', address: null, map_url: null, note: null, status: 'proposed', details: {}, hereAt: null },
  host: { child_first_name: 'Noé', parent_name: 'Marc', household_name: 'Les Jeanson', tz: 'America/Toronto', childPhoto: 'p1', parentPhoto: 'me1' },
  you: { parent_name: 'Julie', email: null, phone: null, child_first_name: 'Léa', allergies: null, reply: null, replyNote: null, remind: false, adults: null, kids: null, scope: 'family' },
  homeCard: null, relais: null, souvenirs: [], souvenirsOpen: false, photos: false, series: [], changes: [], cover: null, guests: null, bring: [],
  messages: [],
  ...over,
})
async function guest(page: Page, data: unknown) {
  const posts: Record<string, unknown>[] = []
  await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, mail: false, photos: false, invite: false } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { signedIn: false } }))
  await page.route('**/api/r/**', async (r) => {
    if (/\/avatar\//.test(r.request().url())) return r.fulfill({ body: PNG, contentType: 'image/png' })
    if (r.request().method() === 'POST') {
      posts.push(r.request().postDataJSON())
      return r.fulfill({ json: { ok: true } })
    }
    return r.fulfill({ json: data })
  })
  return posts
}

test('an invited family sees the host faces, reads the board, marks what is new, writes and removes its own', async ({ page }) => {
  await page.addInitScript((t) => localStorage.setItem('vj-board-lune-miel', String(t)), now - 5000)
  const posts = await guest(page, card({ messages: [msg('m1', 'host', 'Marc', 'On se retrouve à la fontaine', 7200), msg('m2', 'guest', 'Paul', 'Je viens avec Max', 600), msg('m3', 'guest', 'Julie', 'Super !', 300, { mine: true })] }))
  await page.goto('/lune-miel')
  await expect(page.locator('.faces .face img')).toHaveCount(2)
  const board = page.getByLabel('Les messages', { exact: true })
  // new since the last visit on this device: Paul's note, not the older host one and not my own
  await expect(board.locator('.bmsg--new')).toHaveCount(1)
  await expect(board.locator('.bmsg--new')).toContainText('Je viens avec Max')
  await expect(board.getByText('1 nouveau')).toBeVisible()
  // the host can be told apart; I can remove only my own
  await expect(board.locator('.bmsg', { hasText: 'On se retrouve' })).toContainText('Hôte')
  await expect(board.getByRole('button', { name: 'Retirer' })).toHaveCount(1)
  await expect(board.getByRole('button', { name: 'Épingler' })).toHaveCount(0)
  await board.getByLabel('Écrire un message…').fill('On apporte des fruits')
  await board.getByRole('button', { name: 'Publier' }).click()
  await expect.poll(() => posts.length).toBe(1)
  expect(posts[0]).toEqual({ message: 'On apporte des fruits' })
  await board.getByRole('button', { name: 'Retirer' }).click()
  await expect.poll(() => posts.length).toBe(2)
  expect(posts[1]).toEqual({ deleteMessage: 'm3' })
})

test('once the get-together is over the board can still be read, not written', async ({ page }) => {
  await guest(page, card({ alive: false, messages: [msg('m1', 'host', 'Marc', 'Merci d’être venus !', 86400)] }))
  await page.goto('/lune-miel')
  const board = page.getByLabel('Les messages', { exact: true })
  await expect(board).toContainText('Merci d’être venus !')
  await expect(board.getByLabel('Écrire un message…')).toHaveCount(0)
  await expect(board).toContainText('les messages restent ouverts à la lecture')
})

test('the invitation asks first: « Vous venez ? » sits right under the facts, before the explanations', async ({ page }) => {
  await guest(page, card())
  await page.goto('/lune-miel')
  const y = async (t: RegExp | string) => (await page.getByText(t).first().boundingBox())!.y
  const ask = await y('Vous venez ?')
  expect(ask).toBeLessThan(await y('Comment ça marche'))
  expect(ask).toBeLessThan(await y('Les messages'))
  // and it is reachable without scrolling on a phone
  expect(ask).toBeLessThan(844)
})

test('the tabs sit under the thumb on a phone and on top on a desktop, with icons only on the phone', async ({ page }) => {
  await host(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/rencontres')
  const nav = page.getByRole('navigation', { name: 'Navigation' })
  const box = (await nav.boundingBox())!
  expect(box.y + box.height).toBeGreaterThan(830)
  await expect(nav.locator('svg.ico').first()).toBeVisible()
  for (const a of await nav.getByRole('link').all()) expect((await a.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.setViewportSize({ width: 1280, height: 800 })
  const top = (await nav.boundingBox())!
  expect(top.y).toBeLessThan(200)
  await expect(nav.locator('svg.ico').first()).toBeHidden()
})

test('inputs, questions and concepts carry an icon, and icons are decorative', async ({ page }) => {
  await host(page, { 'GET families': () => ({ json: { families: [{ id: 'f1', parent_name: 'Julie', email: null, phone: null, child_first_name: 'Léa', child_birthdate: null, allergies: null, notes: null, linked_household_id: null }] } }) })
  await page.goto('/rencontres/nouvelle')
  await page.getByText('Plus d’options').click()
  expect(await page.locator('label.field svg.ico').count()).toBeGreaterThanOrEqual(6)
  expect(await page.locator('h3 svg.ico').count()).toBeGreaterThanOrEqual(2)
  // every icon is hidden from assistive tech: the words carry the meaning
  const loud = await page.locator('svg.ico:not([aria-hidden=true])').count()
  expect(loud).toBe(0)
  const { violations } = await new AxeBuilder({ page }).analyze()
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
})

test('the new screens hold up at 320px in the dark', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, colorScheme: 'dark', locale: 'fr-CA' })
  const page = await ctx.newPage()
  // a long name on purpose: the header must not overflow whatever font the machine has
  await host(page, { 'GET encounters': (_c, url) => (url.searchParams.get('id') ? { json: detail([msg('m1', 'guest', 'Julie', 'x'.repeat(300), 100)]) } : undefined) }, { me: { displayName: 'Marc-Antoine Jeanson-Tremblay' } })
  for (const path of ['/rencontres', '/rencontres/e1', '/enfants', '/compte', '/amis']) {
    await page.goto(path)
    await expect(page.locator('h1').first()).toBeVisible()
    const over = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      return [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((el) => el.offsetParent !== null && !el.closest('.toasts'))
        .map((el) => ({ tag: el.tagName, cls: el.className?.toString?.() ?? '', right: Math.round(el.getBoundingClientRect().right) }))
        .filter((x) => x.right > vw + 1)
    })
    expect(over, path).toEqual([])
    const { violations } = await new AxeBuilder({ page }).analyze()
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), path).toEqual([])
  }
  await ctx.close()
})

test('« Courriel d’essai »: one tap sends a sample to my own address, and only when mail is wired for a real account', async ({ page }) => {
  const calls = await host(page, { 'POST test-mail': () => ({ json: { ok: true, to: 'm@example.com' } }) }, { me: { mail: true } })
  await page.goto('/compte')
  await page.getByText('Courriels et rappels', { exact: true }).click()
  await page.getByRole('button', { name: 'M’envoyer un courriel d’essai' }).click()
  await expect(page.getByText('Courriel envoyé à m@example.com.')).toBeVisible()
  expect(calls.filter((c) => c.method === 'POST' && c.path === 'test-mail')).toHaveLength(1)
})

test('no test-mail button without mail, or in a trial', async ({ page }) => {
  await host(page, {}, { me: { mail: false } })
  await page.goto('/compte')
  await expect(page.locator('input[name=displayName]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'M’envoyer un courriel d’essai' })).toHaveCount(0)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await host(page, {}, { me: { mail: true, demo: true } })
  await page.goto('/compte')
  await expect(page.getByRole('button', { name: 'M’envoyer un courriel d’essai' })).toHaveCount(0)
})

test('« Déjà ensemble »: a friend opens the past get-togethers and starts the same again from one', async ({ page }) => {
  const calls = await host(page, {
    'GET families': () => ({ json: { families: [fam('f1', 'Léa', 'Julie')] } }),
    'GET family-history': () => ({ json: { past: [{ id: 'e7', title: 'Au parc', kind: 'park', startsAt: now - 86400 * 9, place: 'Parc Lafontaine' }], next: { id: 'e8', startsAt: now + 86400 * 2 } } }),
  })
  await page.goto('/amis')
  expect(calls.filter((c) => c.path === 'family-history')).toHaveLength(0) // nothing is fetched until it is opened
  await page.locator('.friend > summary').click()
  await page.getByText('Déjà ensemble').click()
  await expect(page.getByText(/Au parc · Parc Lafontaine/)).toBeVisible()
  await page.getByRole('link', { name: 'Refaire pareil' }).click()
  await expect(page).toHaveURL(/\/rencontres\/nouvelle\?from=e7$/)
})

test('the host reminder is a plain checkbox in my profile, off unless asked for, and only when mail is wired', async ({ page }) => {
  const calls = await host(page, { 'PATCH profile': () => ({ json: { ok: true } }) }, { me: { mail: true } })
  await page.goto('/compte')
  await page.getByText('Courriels et rappels', { exact: true }).click()
  const box = page.getByLabel(/Me rappeler la veille de mes rencontres/)
  await expect(box).not.toBeChecked()
  await box.click()
  await expect.poll(() => calls.filter((c) => c.method === 'PATCH' && c.path === 'profile').map((c) => c.body)).toEqual([{ remindHost: true }])
})

test('small motion: pages settle in for those who allow motion, and stand still for those who ask for less', async ({ browser }) => {
  for (const [reducedMotion, expected] of [['no-preference', 'rise'], ['reduce', 'none']] as const) {
    const ctx = await browser.newContext({ reducedMotion, locale: 'fr-CA' })
    const page = await ctx.newPage()
    await host(page)
    await page.goto('/compte')
    const name = await page.locator('main > *').first().evaluate((el) => getComputedStyle(el).animationName)
    expect(name).toBe(expected)
    await ctx.close()
  }
})
