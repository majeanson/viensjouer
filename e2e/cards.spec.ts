import { expect, test, type Page } from '@playwright/test'
import { child, enc, fam, inv, soon } from './fixtures'

// Paper in the world: the printable cards, the answer the host notes by hand, the two words typed on the home page,
// and the calm way an invited parent who has answered can open an account. API stubbed.

async function hostStub(page: Page) {
  const patches: Record<string, unknown>[] = []
  const invitations = [inv('i1', 'f1', 'Léa', 'Julie', null, { token: 'lune-miel' }), inv('i2', 'f2', 'Zoé', 'Paul', 'yes', { token: 'ours-pomme' })]
  await page.route('**/api/**', async (r) => {
    const req = r.request()
    const p = new URL(req.url()).pathname.replace('/api/', '')
    const j = (json: unknown, status = 200) => r.fulfill({ status, json })
    if (p === 'health') return j({ ok: true, mail: false, photos: false, invite: false })
    if (p === 'auth/me') return j({ signedIn: true, email: 'marc@example.com', displayName: 'Marc', household: { id: 'h', name: 'Les Jeanson', tz: 'America/Toronto' }, mail: false, demo: false })
    if (p === 'children') return j({ children: [child] })
    if (p === 'families') return j({ families: [fam('f1', 'Léa', 'Julie'), fam('f2', 'Zoé', 'Paul')] })
    if (p === 'invitations' && req.method() === 'PATCH') {
      patches.push(req.postDataJSON() as Record<string, unknown>)
      return j({ ok: true })
    }
    if (p.startsWith('encounters')) return j({ encounter: enc({ kind: 'birthday', title: 'Au parc Lafontaine', place: 'Parc Lafontaine' }), invitations, messages: [], relais: [], souvenirs: [], changes: [], bring: [] })
    return j({})
  })
  return patches
}

test('the cards: one per family, the two words on them, never the place or the title', async ({ page }) => {
  await hostStub(page)
  await page.goto('/rencontres/e1/cartes')
  await expect(page.getByRole('heading', { name: 'Cartes à imprimer' })).toBeVisible()
  const lea = page.getByRole('article', { name: 'Pour Léa' })
  await expect(lea).toContainText('Noé t’invite')
  await expect(lea).toContainText('lune · miel')
  await expect(page.getByRole('article', { name: 'Pour Zoé' })).toContainText('ours · pomme')
  // a card can be read by anyone in a cubby: no place, no title (which often holds the place)
  await expect(page.locator('.sheet')).not.toContainText('Lafontaine')
  // untick a family and its card goes
  await page.getByRole('checkbox', { name: 'Zoé' }).uncheck()
  await expect(page.getByRole('article', { name: 'Pour Zoé' })).toHaveCount(0)
})

test('the host notes an answer given on paper or in person', async ({ page }) => {
  const patches = await hostStub(page)
  await page.goto('/rencontres/e1')
  await expect(page.getByRole('link', { name: 'Cartes à imprimer' })).toBeVisible()
  const row = page.locator('.linkrow').filter({ hasText: 'Léa' })
  await row.getByText('Plus d’options').click()
  await row.getByRole('group', { name: 'Noter sa réponse' }).getByRole('button', { name: 'Oui' }).click()
  await expect.poll(() => patches.length).toBe(1)
  expect(patches[0]).toEqual({ id: 'i1', reply: 'yes' })
})

test('two words that read badly can be drawn again, only while nothing depends on them', async ({ page }) => {
  const patches = await hostStub(page)
  await page.goto('/rencontres/e1')
  const lea = page.locator('.linkrow').filter({ hasText: 'Léa' })
  const zoe = page.locator('.linkrow').filter({ hasText: 'Zoé' })
  await lea.getByText('Plus d’options').click()
  await zoe.getByText('Plus d’options').click()
  // Zoé already said yes: her words are fixed
  await expect(zoe.getByRole('button', { name: 'Autres mots' })).toHaveCount(0)
  await lea.getByRole('button', { name: 'Autres mots' }).click()
  await expect.poll(() => patches.length).toBe(1)
  expect(patches[0]).toEqual({ id: 'i1', newCode: true })
  // one clear block per question: the link, who is invited, the answer by hand
  await expect(lea.getByRole('group', { name: 'Qui est invité ?' }).getByRole('button', { name: 'Toute la famille' })).toHaveAttribute('aria-pressed', 'true')
})

test('the home page takes the two words of a card, with a space, a capital or an accent', async ({ page }) => {
  await page.route('**/api/**', (r) => r.fulfill({ status: 404, json: { error: 'x' } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { signedIn: false } }))
  await page.goto('/')
  await page.getByLabel('Les deux mots').fill('bonjour')
  await page.getByRole('button', { name: 'Ouvrir' }).click()
  await expect(page.getByRole('alert')).toContainText('Il faut deux mots')
  await page.getByLabel('Les deux mots').fill('Lune  Miel')
  await page.getByRole('button', { name: 'Ouvrir' }).click()
  await expect(page).toHaveURL(/\/lune-miel$/)
})

test('an invited parent is offered an account only after answering, and it never blocks the answer', async ({ page }) => {
  let state: Record<string, unknown> = {
    alive: true,
    encounter: { id: 'e1', child_id: 'c1', kind: 'park', title: 'Au parc', starts_at: soon, ends_at: null, place: 'Parc', address: null, note: null, status: 'proposed', details: {}, hereAt: null },
    host: { child_first_name: 'Noé', parent_name: 'Marc', household_name: 'Les Jeanson', tz: 'America/Toronto' },
    you: { parent_name: 'Julie', email: null, phone: null, child_first_name: 'Léa', allergies: null, reply: null, replyNote: null, remind: false, adults: null, kids: null, scope: 'family' },
    homeCard: null, relais: null, souvenirs: [], souvenirsOpen: false, photos: false, messages: [], series: [],
  }
  await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, mail: false, photos: false, invite: false } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { signedIn: false } }))
  await page.route('**/api/r/**', (r) => {
    if (r.request().method() === 'POST') {
      state = { ...state, you: { ...(state.you as object), reply: (r.request().postDataJSON() as { reply: string }).reply } }
      return r.fulfill({ json: { ok: true } })
    }
    return r.fulfill({ json: state })
  })
  await page.goto('/lune-miel')
  await expect(page.getByRole('button', { name: 'Oui, on y sera' })).toBeVisible()
  // before the answer: no account pitch competing with the question
  await expect(page.getByRole('heading', { name: 'Envie de revoir Noé ?' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Oui, on y sera' }).click()
  await expect(page.getByRole('heading', { name: 'Envie de revoir Noé ?' })).toBeVisible()
  await expect(page.getByText(/Rien d’obligatoire/)).toBeVisible()
  await page.getByRole('button', { name: 'Créer mon compte pour inviter à mon tour' }).click()
  await expect(page.getByRole('button', { name: 'Créer mon compte', exact: true })).toBeVisible()
})

test('the host page lists each family once until someone has answered', async ({ page }) => {
  await hostStub(page)
  await page.goto('/rencontres/e1')
  // Léa has not answered, Zoé has: the roster is there
  await expect(page.getByLabel('Qui vient')).toBeVisible()
  await page.unroute('**/api/**')
  await page.route('**/api/**', async (r) => {
    const p = new URL(r.request().url()).pathname.replace('/api/', '')
    const j = (json: unknown) => r.fulfill({ json })
    if (p === 'health') return j({ ok: true, mail: false, photos: false, invite: false })
    if (p === 'auth/me') return j({ signedIn: true, email: 'marc@example.com', displayName: 'Marc', household: { id: 'h', name: 'Les Jeanson', tz: 'America/Toronto' }, mail: false, demo: false })
    if (p === 'children') return j({ children: [child] })
    if (p === 'families') return j({ families: [fam('f1', 'Léa', 'Julie')] })
    if (p.startsWith('encounters')) return j({ encounter: enc({}), invitations: [inv('i1', 'f1', 'Léa', 'Julie', null, { token: 'lune-miel' })], messages: [], relais: [], souvenirs: [], changes: [], bring: [] })
    return j({})
  })
  await page.reload()
  await expect(page.locator('.linkrow').filter({ hasText: 'Léa' })).toBeVisible()
  await expect(page.getByLabel('Qui vient')).toHaveCount(0)
})
