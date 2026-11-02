import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { child, fam } from './fixtures'

// Shared circles (« Les amis du parc », migration 0025), in the browser, API stubbed. The Worker side (first names only, hidden book
// entries, one invitation per account, no Reply-To, nobody linked) is held by functions/api/shared-circles.test.ts on a real database.
type Reply = { status?: number; json: unknown }
type Handler = (body: Record<string, unknown> | null, url: URL) => Reply | undefined
interface Stub {
  calls: { method: string; path: string; body: Record<string, unknown> | null }[]
}

const ME = { signedIn: true, email: 'm@example.com', displayName: 'Marc', household: { id: 'h', name: 'Les Jeanson', tz: 'America/Toronto' }, mail: true, demo: false }
const PARK = {
  id: 's1',
  name: 'Les amis du parc',
  myChildId: 'c1',
  members: [
    { key: 'm1', me: true, parentName: 'Marc', childName: 'Noé', familyId: null },
    { key: 'm2', me: false, parentName: 'Julie', childName: 'Léa', familyId: 'f1' },
    { key: 'm3', me: false, parentName: 'Paul', childName: 'Max', familyId: 'hidden-max' },
  ],
  invites: [] as { id: string; familyId: string; token: string; expiresAt: number }[],
}

async function host(page: Page, handlers: Record<string, Handler> = {}, signedIn = true): Promise<Stub> {
  const stub: Stub = { calls: [] }
  await page.route('**/api/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const path = url.pathname.replace('/api/', '')
    const body = req.postData() && (req.headers()['content-type'] ?? '').includes('json') ? (req.postDataJSON() as Record<string, unknown>) : null
    stub.calls.push({ method: req.method(), path, body })
    const custom = handlers[`${req.method()} ${path}`]?.(body, url)
    if (custom) return r.fulfill({ status: custom.status ?? 200, json: custom.json })
    const defaults: Record<string, unknown> = {
      health: { ok: true, mail: true, photos: false, invite: false },
      'auth/me': signedIn ? ME : { signedIn: false },
      children: { children: [child] },
      families: { families: [fam('f1', 'Léa', 'Julie', { email: 'j@example.com' }), fam('f2', 'Zoé', 'Sonia', { email: 's@example.com' })] },
      groups: { groups: [] },
      'shared-circles': { circles: [PARK] },
      encounters: { encounters: [], invitations: [] },
      calendar: { items: [], birthdays: [], today: '2030-01-01' },
      circle: { children: [], book: [] },
      'home-card': { card: null },
      windows: { windows: [] },
    }
    return r.fulfill({ json: defaults[path] ?? {} })
  })
  return stub
}

test('Amis lists a shared circle as one closed row; open, it shows first names only and invites a family of MY book', async ({ page }) => {
  let invites: typeof PARK.invites = []
  const stub = await host(page, {
    'GET shared-circles': () => ({ json: { circles: [{ ...PARK, invites }] } }),
    'POST shared-circle-invite': (b) => {
      invites = [{ id: 'x1', familyId: 'f2', token: 'banquet-liseron', expiresAt: 0 }]
      return { json: { id: 'x1', token: 'banquet-liseron', sent: b?.send === true } }
    },
    'DELETE shared-circle-invite': () => ((invites = []), { json: { ok: true } }),
  })
  await page.goto('/amis')
  const row = page.locator('details.friend', { hasText: 'Les amis du parc' })
  await expect(row.locator(':scope > summary')).toContainText('Noé, Léa, Max')
  await row.locator(':scope > summary').click()
  await expect(row.locator('.meta')).toContainText('Noé · toi')
  await expect(row.locator('.meta')).toContainText('Max · Paul')
  await row.getByText('Inviter une famille', { exact: true }).click()
  // Léa is already in the circle: only Zoé can be picked.
  const pick = row.getByLabel('Quelle famille ?')
  await expect(pick.locator('option')).toHaveText(['…', 'Zoé · Sonia'])
  await pick.selectOption('f2')
  await row.getByRole('button', { name: 'Créer le code' }).click()
  await expect.poll(() => stub.calls.find((c) => c.method === 'POST' && c.path === 'shared-circle-invite')?.body).toEqual({ circleId: 's1', familyId: 'f2', send: false })
  await expect(row.locator('.paper', { hasText: 'banquet-liseron' })).toBeVisible()
  await row.getByRole('button', { name: 'Envoyer par courriel' }).click()
  await expect.poll(() => stub.calls.filter((c) => c.method === 'POST' && c.path === 'shared-circle-invite').at(-1)?.body).toEqual({ circleId: 's1', familyId: 'f2', send: true })
  await row.getByRole('button', { name: 'Retirer le code' }).click()
  await expect.poll(() => stub.calls.find((c) => c.method === 'DELETE' && c.path === 'shared-circle-invite')?.body).toEqual({ id: 'x1' })
})

test('starting a circle asks only its name; leaving waits behind the undo bar', async ({ page }) => {
  page.on('dialog', (d) => {
    throw new Error(`a browser dialog appeared: ${d.message()}`)
  })
  const stub = await host(page, { 'POST shared-circles': () => ({ status: 201, json: { id: 's2' } }) })
  await page.goto('/amis')
  await page.getByRole('button', { name: 'Créer un cercle' }).click()
  await page.getByLabel('Nom du cercle').fill('La garderie')
  await page.getByRole('button', { name: 'Créer un cercle' }).click()
  await expect.poll(() => stub.calls.find((c) => c.method === 'POST' && c.path === 'shared-circles')?.body).toEqual({ name: 'La garderie' })

  const row = page.locator('details.friend', { hasText: 'Les amis du parc' })
  await row.locator(':scope > summary').click()
  await row.getByRole('button', { name: 'Quitter le cercle' }).click()
  await expect(row).toHaveCount(0)
  await expect(page.locator('.toast')).toContainText('Cercle quitté.')
  await expect.poll(() => stub.calls.filter((c) => c.method === 'DELETE' && c.path === 'shared-circles').length, { timeout: 9000 }).toBe(1)
  expect(stub.calls.find((c) => c.method === 'DELETE' && c.path === 'shared-circles')!.body).toEqual({ id: 's1' })
})

test('« Qui inviter ? »: one tap picks the whole circle, members outside my book are listed by first name', async ({ page }) => {
  await host(page)
  await page.goto('/rencontres/nouvelle')
  const circle = page.getByRole('group', { name: 'Cercle « Les amis du parc »' })
  await expect(circle.getByText('Max', { exact: true })).toBeVisible()
  // Léa is in my book: she is ticked through my own entry, not listed twice.
  await expect(circle.getByText('Léa', { exact: true })).toHaveCount(0)
  await circle.getByRole('button', { name: 'Cercle « Les amis du parc »' }).click()
  await expect(circle.getByRole('checkbox')).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Léa/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Zoé/ })).not.toBeChecked()
})

const DOOR = { circle: { hostName: 'Julie', hostChild: '', familyChild: 'Zoé', used: false, circleName: 'Les amis du parc' } }

test('a visitor opens a shared circle code: its name, who asks, that only first names show, and a quick account', async ({ page }) => {
  const stub = await host(page, { 'GET r/banquet-liseron': () => ({ json: DOOR }), 'POST r/banquet-liseron/claim': () => ({ status: 201, json: { ok: true } }) }, false)
  await page.goto('/banquet-liseron')
  await expect(page.getByRole('heading', { name: 'Julie t’invite dans « Les amis du parc »' })).toBeVisible()
  await expect(page.getByText(/ne verront que vos prénoms/)).toBeVisible()
  await page.getByLabel('Votre prénom').fill('Sonia')
  await page.locator('input[name=email]').fill('sonia@example.com')
  await page.locator('input[name=password]').fill('long-enough-pass')
  await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click()
  await expect.poll(() => stub.calls.find((c) => c.method === 'POST' && c.path === 'r/banquet-liseron/claim')?.body).toEqual({ displayName: 'Sonia', email: 'sonia@example.com', password: 'long-enough-pass' })
})

test('signed in: the shared code asks for one tap to join, and never offers to link the two families', async ({ page }) => {
  const stub = await host(page, {
    'GET r/banquet-liseron': () => ({ json: DOOR }),
    'GET shared-circle-join': () => ({ json: { state: 'joinable', circleName: 'Les amis du parc', hostName: 'Julie', children: [{ id: 'c1', first_name: 'Noé' }] } }),
    'POST shared-circle-join': () => ({ json: { state: 'member' } }),
  })
  await page.goto('/banquet-liseron')
  await expect(page.getByRole('region', { name: 'Ajouter à mes amis' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Entrer dans le cercle' }).click()
  await expect.poll(() => stub.calls.find((c) => c.method === 'POST' && c.path === 'shared-circle-join')?.body).toEqual({ code: 'banquet-liseron' })
})

test('the open circle and its door have no serious accessibility violation and fit a 320 px screen, in light and dark', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await host(page, { 'GET r/banquet-liseron': () => ({ json: DOOR }) })
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/amis')
    const row = page.locator('details.friend', { hasText: 'Les amis du parc' })
    await row.locator(':scope > summary').click()
    await row.getByText('Inviter une famille', { exact: true }).click()
    for (const where of ['/amis', '/banquet-liseron']) {
      if (where !== '/amis') await page.goto(where)
      await expect(page.locator('h1, h2').first()).toBeVisible()
      const { violations } = await new AxeBuilder({ page }).analyze()
      expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id), `${where} ${scheme}`).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${where} ${scheme}`).toBeLessThanOrEqual(320)
    }
  }
})
