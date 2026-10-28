import { expect, test } from '@playwright/test'

// The host's first run: an EMPTY book. They must be able to invite a family they have never
// entered, without leaving the form.
test('a new host adds a family inside the form, it ticks itself, and the invitation goes to it', async ({ page }) => {
  const families: Record<string, unknown>[] = []
  const posted: { families: unknown[]; encounters: Record<string, unknown>[] } = { families: [], encounters: [] }
  await page.route('**/api/**', async (r) => {
    const req = r.request()
    const p = new URL(req.url()).pathname.replace('/api/', '')
    const j = (json: unknown, status = 200) => r.fulfill({ status, json })
    if (p === 'health') return j({ ok: true, mail: false, photos: false, invite: false })
    if (p === 'auth/me') return j({ signedIn: true, email: 'marc@example.com', displayName: 'Marc', household: { id: 'h', name: 'Les Jeanson', tz: 'America/Toronto' }, mail: false, demo: false })
    if (p === 'children') return j({ children: [{ id: 'c1', first_name: 'Noé', birthdate: null, colour: '#e8922a', position: 0 }] })
    if (p === 'groups') return j({ groups: [] })
    if (p === 'families' && req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>
      posted.families.push(body)
      families.push({ id: 'f-new', parent_name: body.parentName, email: body.email ?? null, phone: null, child_first_name: body.childFirstName, child_birthdate: null, allergies: null, notes: null, linked_household_id: null })
      return j({ id: 'f-new' }, 201)
    }
    if (p === 'families') return j({ families })
    if (p === 'encounters' && req.method() === 'POST') {
      posted.encounters.push(req.postDataJSON() as Record<string, unknown>)
      return j({ id: 'e1', ids: ['e1'] }, 201)
    }
    if (p.startsWith('encounters')) return j({ encounter: { id: 'e1', child_id: 'c1', kind: 'park', title: 'Parc', starts_at: Math.floor(Date.now() / 1000) + 86400, ends_at: null, place: null, address: null, note: null, status: 'proposed', details: {}, hereOpen: false }, invitations: [], messages: [], relais: [], souvenirs: [], encounters: [] })
    return j({})
  })

  await page.goto('/rencontres/nouvelle')

  // The invitee questions come BEFORE the title, date and place.
  const y = async (text: RegExp | string) => (await page.getByText(text).first().boundingBox())!.y
  expect(await y('Qui est invité ?')).toBeLessThan(await y('Titre'))
  expect(await y('Qui est invité ?')).toBeLessThan(await y('Quand'))

  // Empty book: the add form is already open, no detour to another page.
  await expect(page.getByText(/Pas encore de famille dans ton carnet/)).toBeVisible()
  await page.getByLabel('Prénom de l’ami').fill('Léa')
  await page.getByLabel('Prénom du parent').fill('Julie')
  await page.getByRole('button', { name: 'Ajouter et inviter' }).click()
  await expect(page.getByRole('checkbox', { name: /Léa/ })).toBeChecked()
  expect(posted.families[0]).toEqual({ childFirstName: 'Léa', parentName: 'Julie' })

  await page.getByLabel('Titre').fill('Au parc')
  await page.getByRole('button', { name: 'Créer et obtenir les liens' }).click()
  await expect.poll(() => posted.encounters.length).toBe(1)
  expect(posted.encounters[0]).toMatchObject({ kind: 'park', title: 'Au parc', scope: 'family', invite: ['f-new'] })
})

test('adding a family needs both names, and says so', async ({ page }) => {
  await page.route('**/api/**', async (r) => {
    const p = new URL(r.request().url()).pathname.replace('/api/', '')
    if (p === 'auth/me') return r.fulfill({ json: { signedIn: true, email: 'm@example.com', displayName: 'Marc', household: null, mail: false, demo: false } })
    if (p === 'children') return r.fulfill({ json: { children: [{ id: 'c1', first_name: 'Noé', birthdate: null, colour: '#e8922a', position: 0 }] } })
    if (p === 'families') return r.fulfill({ json: { families: [] } })
    return r.fulfill({ json: p === 'groups' ? { groups: [] } : {} })
  })
  await page.goto('/rencontres/nouvelle')
  await page.getByLabel('Prénom de l’ami').fill('Léa')
  await page.getByRole('button', { name: 'Ajouter et inviter' }).click()
  await expect(page.getByText('Il faut le prénom de l’ami et celui du parent.')).toBeVisible()
})

test('repeat is a frequency (once, every week, every 2 weeks, every month), with a count only when it repeats', async ({ page }) => {
  const posted: Record<string, unknown>[] = []
  await page.route('**/api/**', async (r) => {
    const req = r.request()
    const p = new URL(req.url()).pathname.replace('/api/', '')
    const j = (json: unknown, status = 200) => r.fulfill({ status, json })
    if (p === 'auth/me') return j({ signedIn: true, email: 'm@example.com', displayName: 'Marc', household: null, mail: false, demo: false })
    if (p === 'children') return j({ children: [{ id: 'c1', first_name: 'Noé', birthdate: null, colour: '#e8922a', position: 0 }] })
    if (p === 'families') return j({ families: [{ id: 'f1', parent_name: 'Julie', email: null, phone: null, child_first_name: 'Léa', child_birthdate: null, allergies: null, notes: null, linked_household_id: null }] })
    if (p === 'groups') return j({ groups: [] })
    if (p === 'encounters' && req.method() === 'POST') {
      posted.push(req.postDataJSON() as Record<string, unknown>)
      return j({ id: 'e1', ids: ['e1'] }, 201)
    }
    return j({ encounter: { id: 'e1', child_id: 'c1', kind: 'park', title: 'P', starts_at: 1, ends_at: null, place: null, address: null, note: null, status: 'proposed', details: {}, hereOpen: false }, invitations: [], messages: [], relais: [], souvenirs: [] })
  })
  await page.goto('/rencontres/nouvelle')
  await page.getByText('Plus d’options').click()
  const freq = page.getByLabel('Répéter')
  await expect(freq.locator('option')).toHaveText(['Une seule fois', 'Chaque semaine', 'Aux 2 semaines', 'Chaque mois'])
  await expect(page.getByLabel('Nombre de rencontres')).toHaveCount(0)

  await freq.selectOption('biweek')
  await page.getByLabel('Nombre de rencontres').selectOption('3')
  await page.getByRole('checkbox', { name: /Léa/ }).check()
  await page.getByLabel('Titre').fill('Parc aux deux semaines')
  await page.getByRole('button', { name: 'Créer et obtenir les liens' }).click()
  await expect.poll(() => posted.length).toBe(1)

  const list = posted[0].startsAtList as number[]
  expect(list).toHaveLength(3)
  expect(list[0]).toBe(posted[0].startsAt)
  // every 14 days on the wall clock (a daylight-saving change may make it 14 days ± 1 h)
  for (let i = 1; i < list.length; i++) expect(Math.abs(list[i] - list[i - 1] - 14 * 86400)).toBeLessThanOrEqual(3600)
})

test('a family with no email gets a ready-to-send message with the short link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined }))
  const soon = Math.floor(Date.now() / 1000) + 86400
  await page.route('**/api/**', async (r) => {
    const p = new URL(r.request().url()).pathname.replace('/api/', '')
    const j = (json: unknown) => r.fulfill({ json })
    if (p === 'auth/me') return j({ signedIn: true, email: 'm@example.com', displayName: 'Marc', household: null, mail: true, demo: false })
    if (p === 'health') return j({ ok: true, mail: true, photos: false })
    if (p === 'families') return j({ families: [] })
    if (p.startsWith('encounters')) {
      return j({
        encounter: { id: 'e1', child_id: 'c1', kind: 'park', title: 'Au parc Lafontaine', starts_at: soon, ends_at: null, place: null, address: null, note: null, status: 'proposed', details: {}, hereOpen: false },
        invitations: [
          { id: 'i1', friend_family_id: 'f1', token: 'lune-miel', reply: null, reply_note: null, reply_at: null, sent_at: null, parent_name: 'Julie', child_first_name: 'Léa', email: null, allergies: null, adults: null, kids: null, scope: 'family' },
          { id: 'i2', friend_family_id: 'f2', token: 'ours-miel', reply: null, reply_note: null, reply_at: null, sent_at: null, parent_name: 'Paul', child_first_name: 'Max', email: 'paul@example.com', allergies: null, adults: null, kids: null, scope: 'friend' },
        ],
        messages: [], relais: [], souvenirs: [],
      })
    }
    return j({})
  })
  await page.goto('/rencontres/e1')
  // one calm line per family; the short link and the hint sit under « Plus d'options »
  await page.getByText('Plus d’options').first().click()
  await expect(page.getByText(/\/lune-miel$/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Partager le lien' })).toHaveCount(2)
  await page.getByRole('button', { name: 'Partager le lien' }).first().click()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toContain('Salut Julie !')
  expect(text).toContain('Marc organise « Au parc Lafontaine »')
  expect(text).toContain('Toute la famille est la bienvenue.')
  expect(text).toContain('/lune-miel')
})

test('the host edits a rencontre, sees what will change, and the PATCH carries only the real change', async ({ page }) => {
  const patched: Record<string, unknown>[] = []
  const soon = Math.floor(Date.now() / 1000) + 86400
  await page.route('**/api/**', async (r) => {
    const req = r.request()
    const p = new URL(req.url()).pathname.replace('/api/', '')
    const j = (json: unknown) => r.fulfill({ json })
    if (p === 'auth/me') return j({ signedIn: true, email: 'm@example.com', displayName: 'Marc', household: null, mail: true, demo: false })
    if (p === 'health') return j({ ok: true, mail: true, photos: false })
    if (p === 'families') return j({ families: [] })
    if (p === 'encounters' && req.method() === 'PATCH') {
      patched.push(req.postDataJSON() as Record<string, unknown>)
      return j({ changed: 1, notified: 1 })
    }
    if (p.startsWith('encounters')) {
      return j({
        encounter: { id: 'e1', child_id: 'c1', kind: 'park', title: 'Au parc', starts_at: soon, ends_at: null, place: 'Parc Lafontaine', address: null, note: null, status: 'proposed', details: {}, hereOpen: false },
        invitations: [{ id: 'i1', friend_family_id: 'f1', token: 'lune-miel', reply: 'yes', reply_note: null, reply_at: 1, sent_at: null, parent_name: 'Julie', child_first_name: 'Léa', email: 'j@example.com', allergies: null, adults: null, kids: null, scope: 'family' }],
        messages: [], relais: [], souvenirs: [],
        changes: [{ field: 'place', old_value: 'Parc', new_value: 'Parc Lafontaine', created_at: soon - 5000 }],
      })
    }
    return j({})
  })
  await page.goto('/rencontres/e1')
  await expect(page.getByText('Historique des modifications')).toBeVisible()
  await page.getByRole('button', { name: 'Modifier', exact: true }).click()
  // untouched form: nothing to save
  await expect(page.getByText('Rien n’a changé.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enregistrer les changements' })).toBeDisabled()
  // change the place: the preview shows old → new and Save wakes up
  await page.getByLabel('Où').fill('Chez nous')
  await expect(page.getByText('Ce qui va changer')).toBeVisible()
  await expect(page.locator('.changes-preview s', { hasText: 'Parc Lafontaine' })).toBeVisible()
  await expect(page.locator('.changes-preview strong', { hasText: 'Chez nous' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /Prévenir par courriel/ })).toBeChecked()
  await page.getByRole('button', { name: 'Enregistrer les changements' }).click()
  await expect.poll(() => patched.length).toBe(1)
  expect(patched[0]).toMatchObject({ id: 'e1', title: 'Au parc', place: 'Chez nous', notify: true })
  await expect(page.getByText('Modifié. 1 courriel envoyé.')).toBeVisible()
})
