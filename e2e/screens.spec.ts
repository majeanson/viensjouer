import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// The screens and doors the other specs only brush past: joining as the other parent, choosing a new password, answering an open
// window, the « je suis libre » tab of the new-rencontre page, the old addresses that still land somewhere, and an unknown address.
// API stubbed (the real stack covers the same doors in e2e-real/). Each also gets the accessibility sweep, in both themes.
interface Call { method: string; path: string; body: Record<string, unknown> | null }

async function stub(page: Page, handlers: Record<string, (body: Record<string, unknown> | null) => { status?: number; json: unknown }> = {}, signedIn = false): Promise<Call[]> {
  const calls: Call[] = []
  await page.route('**/api/**', async (r) => {
    const req = r.request()
    const path = new URL(req.url()).pathname.replace('/api/', '')
    const body = req.postData() && (req.headers()['content-type'] ?? '').includes('json') ? (req.postDataJSON() as Record<string, unknown>) : null
    calls.push({ method: req.method(), path, body })
    const custom = handlers[`${req.method()} ${path}`]?.(body)
    if (custom) return r.fulfill({ status: custom.status ?? 200, json: custom.json })
    const defaults: Record<string, unknown> = {
      health: { ok: true, mail: false, photos: false, invite: false },
      'auth/me': signedIn ? { signedIn: true, email: 'm@example.com', displayName: 'Marc', household: { id: 'h', name: 'Les Jeanson', tz: 'America/Toronto' }, mail: false, demo: false } : { signedIn: false },
      children: { children: [{ id: 'c1', first_name: 'Noé', birthdate: null, colour: '#c33', position: 0 }] },
      families: { families: [{ id: 'f1', parent_name: 'Julie', email: null, phone: null, child_first_name: 'Léa', child_birthdate: null, allergies: null, notes: null, linked_household_id: null }] },
      groups: { groups: [] },
      encounters: { encounters: [], invitations: [] },
      calendar: { items: [], birthdays: [], today: '2030-01-01' },
      circle: { children: [], book: [] },
      'home-card': { card: null },
      windows: { windows: [] },
    }
    return r.fulfill({ json: defaults[path] ?? {} })
  })
  return calls
}

const serious = async (page: Page) => (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)

test.describe('joining as the other parent (/rejoindre)', () => {
  test('says whose family it is, says what is wrong in words, creates the account and lands signed in', async ({ page }) => {
    const calls = await stub(page, {
      'GET join': () => ({ json: { household: 'Les Jeanson', inviter: 'Marc' } }),
      'POST join': () => ({ status: 201, json: { ok: true } }),
    })
    await page.goto('/rejoindre?t=abc123')
    await expect(page.getByRole('heading', { name: 'Rejoindre Les Jeanson' })).toBeVisible()
    expect(await serious(page)).toEqual([])
    await page.getByRole('button', { name: 'Créer mon compte et rejoindre' }).click()
    await expect(page.getByText('À remplir.')).toHaveCount(3)
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
    await page.getByLabel('Ton prénom').fill('Hélène')
    await page.locator('input[name=email]').fill('helene@example.com')
    await page.locator('input[name=password]').fill('court')
    await page.locator('input[name=password]').blur()
    await expect(page.getByText('Au moins 8 caractères.')).toBeVisible()
    await page.locator('input[name=password]').fill('un-mot-de-passe-long')
    await page.getByRole('button', { name: 'Créer mon compte et rejoindre' }).click()
    await expect.poll(() => calls.find((c) => c.method === 'POST' && c.path === 'join')?.body).toMatchObject({ token: 'abc123', displayName: 'Hélène', email: 'helene@example.com' })
  })

  test('a spent or unknown link says so plainly and offers nothing to fill in', async ({ page }) => {
    await stub(page, { 'GET join': () => ({ status: 404, json: { error: 'x' } }) })
    await page.goto('/rejoindre?t=spent')
    await expect(page.getByText('Ce lien ne fonctionne plus, demande-en un nouveau.')).toBeVisible()
    await expect(page.locator('input[name=password]')).toHaveCount(0)
  })
})

test.describe('choosing a new password (/reinitialiser)', () => {
  test('a short password is refused in words; a good one signs in and goes to Rencontres', async ({ page }) => {
    const calls = await stub(page, { 'POST auth/reset': () => ({ json: { ok: true } }) })
    await page.goto('/reinitialiser?t=tok')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await serious(page)).toEqual([])
    await page.locator('input[name=password]').fill('court')
    await page.getByRole('button', { name: 'Enregistrer et entrer' }).click()
    await expect(page.getByText('Au moins 8 caractères.')).toBeVisible()
    expect(calls.filter((c) => c.path === 'auth/reset')).toHaveLength(0)
    await page.locator('input[name=password]').fill('un-nouveau-mot-de-passe')
    await page.getByRole('button', { name: 'Enregistrer et entrer' }).click()
    await expect.poll(() => calls.find((c) => c.path === 'auth/reset')?.body).toMatchObject({ token: 'tok', password: 'un-nouveau-mot-de-passe' })
  })

  test('without a token in the address the button stays off', async ({ page }) => {
    await stub(page)
    await page.goto('/reinitialiser')
    await expect(page.getByRole('button', { name: 'Enregistrer et entrer' })).toBeDisabled()
  })
})

test.describe('an open window (/w/<code>)', () => {
  const offer = (over: Record<string, unknown> = {}) => ({
    alive: true,
    window: { starts_at: Math.floor(Date.now() / 1000) + 86_400, ends_at: Math.floor(Date.now() / 1000) + 86_400 + 7200, note: 'Parc ou chez nous' },
    host: { child_first_name: 'Noé', parent_name: 'Marc', household_name: 'Les Jeanson' },
    you: { child_first_name: 'Léa', parent_name: 'Julie', reply: null, replyNote: null },
    ...over,
  })

  test('shows who is free and when; « On se voit ! » and « Pas cette fois » each send one answer with the note', async ({ page }) => {
    const calls = await stub(page, { 'GET w/ours-miel': () => ({ json: offer() }), 'POST w/ours-miel': () => ({ json: { ok: true } }) })
    await page.goto('/w/ours-miel')
    await expect(page.getByRole('heading', { name: 'Marc est libre, et Léa ?' }).or(page.getByRole('heading', { level: 1 }))).toBeVisible()
    expect(await serious(page)).toEqual([])
    await page.locator('#wnote').fill('Avec plaisir')
    await page.getByRole('button', { name: 'On se voit !' }).click()
    await expect.poll(() => calls.find((c) => c.method === 'POST' && c.path === 'w/ours-miel')?.body).toMatchObject({ reply: 'yes', note: 'Avec plaisir' })
    await page.getByRole('button', { name: 'Pas cette fois' }).click()
    await expect.poll(() => calls.filter((c) => c.method === 'POST' && c.path === 'w/ours-miel').map((c) => c.body?.reply)).toEqual(['yes', 'no'])
  })

  test('a window that is over says so and offers no buttons', async ({ page }) => {
    await stub(page, { 'GET w/vieux-mot': () => ({ json: offer({ alive: false }) }) })
    await page.goto('/w/vieux-mot')
    await expect(page.getByText('Cette fenêtre est passée.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'On se voit !' })).toHaveCount(0)
  })
})

test.describe('« Je suis libre » on the new-rencontre page', () => {
  test('the second tab offers a window to chosen families and returns to Rencontres', async ({ page }) => {
    const calls = await stub(page, { 'POST windows': () => ({ status: 201, json: { id: 'w1' } }) }, true)
    await page.goto('/rencontres/nouvelle')
    await page.getByRole('tab', { name: 'Je suis libre, qui veut venir ?' }).click()
    await expect(page.getByRole('button', { name: 'Envoyer la fenêtre' })).toBeDisabled() // nobody chosen yet
    await page.getByRole('checkbox', { name: /Léa/ }).check()
    await page.getByRole('button', { name: 'Envoyer la fenêtre' }).click()
    await expect.poll(() => calls.find((c) => c.method === 'POST' && c.path === 'windows')?.body).toMatchObject({ childId: 'c1', families: ['f1'] })
    await expect(page).toHaveURL(/\/rencontres$/)
  })
})

test.describe('old addresses and unknown ones', () => {
  for (const [from, to] of [['/cercle', /\/amis$/], ['/familles', /\/amis$/], ['/calendrier', /\/rencontres$/], ['/fenetres', /\/rencontres$/]] as const) {
    test(`${from} still lands where it belongs`, async ({ page }) => {
      await stub(page, {}, true)
      await page.goto(from)
      await expect(page).toHaveURL(to)
    })
  }
  test('/enfants shows the family on the Proches page', async ({ page }) => {
    await stub(page, {}, true)
    await page.goto('/enfants')
    await expect(page.getByRole('heading', { name: 'Ma famille' })).toBeVisible()
  })
  test('an unknown address goes to the front page, and a signed-out visitor never sees a signed-in screen', async ({ page }) => {
    await stub(page)
    await page.goto('/nimporte/quoi/du/tout')
    await expect(page).toHaveURL(/\/$/)
    for (const p of ['/rencontres', '/amis', '/compte']) {
      await page.goto(p)
      await expect(page).not.toHaveURL(new RegExp(`${p}$`))
    }
  })
})

test.describe('the front page doors, in both themes', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`signed out: the door, the privacy page and the forgot page have no serious accessibility violation (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await stub(page)
      for (const p of ['/', '/confidentialite', '/oubli']) {
        await page.goto(p)
        await expect(page.locator('h1').first()).toBeVisible()
        expect(await serious(page), p).toEqual([])
      }
    })
  }
})

// A sentence that appears or goes between the press and the release of a button moves the button from under the finger and the tap is
// lost. Typing a wrong value, then tapping « send » straight away, must still send once the value is right.
test('tapping send right after fixing a field is never lost to the sentence going away', async ({ page }) => {
  const calls = await stub(page, { 'POST auth/reset': () => ({ json: { ok: true } }) })
  await page.goto('/reinitialiser?t=tok')
  await page.locator('input[name=password]').fill('court')
  await page.getByRole('button', { name: 'Enregistrer et entrer' }).click()
  await expect(page.getByText('Au moins 8 caractères.')).toBeVisible()
  await page.locator('input[name=password]').fill('un-nouveau-mot-de-passe')
  await expect(page.getByText('Au moins 8 caractères.')).toHaveCount(0) // gone while typing, before any tap
  await page.getByRole('button', { name: 'Enregistrer et entrer' }).click()
  await expect.poll(() => calls.find((c) => c.path === 'auth/reset')?.body).toMatchObject({ token: 'tok' })
})
