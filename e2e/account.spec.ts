import { expect, test, type Page } from '@playwright/test'

// The header has no menu to open (your face is one tap to your account, sign-out is its own button) and the account
// page shows one tab at a time, kept in the address. API stubbed.
async function signedIn(page: Page) {
  let out = 0
  await page.route('**/api/**', async (r) => {
    const req = r.request()
    const p = new URL(req.url()).pathname.replace('/api/', '')
    const j = (json: unknown) => r.fulfill({ json })
    if (p === 'auth/me') return j({ signedIn: true, email: 'marc@example.com', displayName: 'Marc', household: { id: 'h', name: 'Les Jeanson', tz: 'America/Toronto' }, mail: true, demo: false })
    if (p === 'auth/logout') { out++; return j({ ok: true }) }
    if (p === 'health') return j({ ok: true, mail: true, photos: false })
    return j({})
  })
  return () => out
}

test('your face is one tap to your account and sign-out is its own button', async ({ page }) => {
  const signedOut = await signedIn(page)
  await page.goto('/rencontres')
  await expect(page.locator('details.menu')).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'Compte' }).click()
  await expect(page).toHaveURL(/\/compte$/)
  await page.getByRole('button', { name: /^Menu/ }).click()
  await page.getByRole('button', { name: 'Déconnexion' }).click()
  await expect.poll(signedOut).toBe(1)
})

test('the account is one row open at a time, and the open row is in the address', async ({ page }) => {
  await signedIn(page)
  await page.goto('/compte')
  const row = (name: string) => page.locator('details.fold').filter({ has: page.locator('summary', { hasText: name }) })
  await expect(row('Profil')).toHaveAttribute('open', '')
  await expect(page.locator('input[name=displayName]')).toBeVisible()
  // the other rows' content is not on the page yet
  await expect(page.getByRole('button', { name: 'Tout effacer' })).toHaveCount(0)
  await row('Sécurité').locator('summary').click()
  await expect(page).toHaveURL(/tab=security/)
  await expect(page.getByLabel('Mot de passe actuel')).toBeVisible()
  await expect(row('Profil')).not.toHaveAttribute('open', '')
  await row('Données').locator('summary').click()
  await expect(page.getByRole('link', { name: 'Ce qu’on garde' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tout effacer' })).toBeVisible()
  // a link or a refresh lands on the same row
  await page.reload()
  await expect(row('Données')).toHaveAttribute('open', '')
})

test('the groups sheet names itself once: no second « Groupes » heading inside it', async ({ page }) => {
  await signedIn(page)
  await page.route('**/api/families', (r) => r.fulfill({ json: { families: [] } }))
  await page.route('**/api/groups', (r) => r.fulfill({ json: { groups: [] } }))
  await page.goto('/amis')
  await page.getByRole('button', { name: 'Groupes' }).click()
  await expect(page.getByText('Groupes', { exact: true })).toHaveCount(1)
})
