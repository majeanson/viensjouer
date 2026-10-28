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
