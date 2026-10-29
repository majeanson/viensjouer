import { expect, test, type Page } from '@playwright/test'

// What a screen reader is given, read off the accessibility tree (not a real VoiceOver or TalkBack pass: that is
// still a human step). The invited parent's page is the one that matters, so it is held to: a main region and a skip
// link, headings that go h1 then h2, the three answers named as one group, a time range that is spoken, and an error
// that is announced.
const soon = Math.floor(Date.now() / 1000) + 3 * 86_400

async function reply(page: Page, fail = false) {
  await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, mail: false, photos: false, invite: false } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { signedIn: false } }))
  await page.route('**/api/r/**', async (r) => {
    if (r.request().method() === 'POST') return fail ? r.fulfill({ status: 500, json: { error: 'Oups, réessaie.' } }) : r.fulfill({ json: { ok: true } })
    return r.fulfill({
      json: {
        alive: true,
        encounter: { id: 'e1', child_id: 'c1', kind: 'park', title: 'Au parc', starts_at: soon, ends_at: soon + 7200, place: 'Parc', address: null, note: null, status: 'proposed', details: {} },
        host: { child_first_name: 'Noé', parent_name: 'Marc', household_name: 'H', tz: 'America/Toronto' },
        you: { parent_name: 'Julie', email: null, phone: null, child_first_name: 'Léa', allergies: null, reply: null, replyNote: null, remind: false, adults: null, kids: null, scope: 'family' },
        homeCard: null, relais: null, souvenirs: [], souvenirsOpen: false, photos: false, messages: [], series: [], bring: [], changes: [], guests: null, cover: null,
      },
    })
  })
}

test('the invitation has a main region, a skip link that lands in it, and headings that go h1 then h2', async ({ page }) => {
  await reply(page)
  await page.goto('/h7kq-3wpm')
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible()
  const levels = await page.locator('h1, h2, h3, h4').evaluateAll((els) => els.map((e) => Number(e.tagName[1])))
  for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], `heading levels ${levels.join(',')}`).toBeLessThanOrEqual(1)
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Aller au contenu' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
})

test('the three answers are one named group, and the time range is spoken', async ({ page }) => {
  await reply(page)
  await page.goto('/h7kq-3wpm')
  const group = page.getByRole('group', { name: 'Vous venez ?' }).first()
  await expect(group.getByRole('button')).toHaveCount(3)
  // « → » is drawn but hidden from the tree; the word is there for those who listen
  await expect(page.locator('.facts').first().locator('[aria-hidden="true"]', { hasText: '→' })).toHaveCount(1)
  await expect(page.locator('.facts').first().locator('.sr-only', { hasText: 'jusqu’à' })).toHaveCount(1)
})

test('a refused answer is announced as an alert', async ({ page }) => {
  await reply(page, true)
  await page.goto('/h7kq-3wpm')
  await page.getByRole('button', { name: 'Oui, on y sera' }).first().click()
  await expect(page.getByRole('alert')).toBeVisible()
})

test('every public screen has a main region and a skip link', async ({ page }) => {
  await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, mail: false, photos: false, invite: false } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { signedIn: false } }))
  for (const path of ['/', '/confidentialite', '/oubli']) {
    await page.goto(path)
    await expect(page.getByRole('main'), path).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Aller au contenu' }), path).toHaveCount(1)
  }
})
