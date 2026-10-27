import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// The invited parent's walk — the screen most people will ever see. API stubbed.
const CODE = 'h7kq-3wpm'
const soon = Math.floor(Date.now() / 1000) + 3 * 86_400

const card = (over: Record<string, unknown> = {}) => ({
  alive: true,
  encounter: { id: 'e1', child_id: 'c1', kind: 'home', title: 'Chez nous après la sieste', starts_at: soon, ends_at: soon + 7200, place: 'Chez nous', address: null, note: 'Sieste à 13 h', status: 'proposed', details: {}, hereAt: null },
  host: { child_first_name: 'Noé', parent_name: 'Marc', household_name: 'Les Jeanson', tz: 'America/Toronto' },
  you: { parent_name: 'Julie', email: null, phone: null, child_first_name: 'Léa', allergies: null, reply: null, replyNote: null, remind: false, adults: null, kids: null },
  homeCard: { dog: true, pool: false, screens: 'little', nutFree: true, note: 'Le chien est doux' },
  relais: null,
  souvenirs: [],
  souvenirsOpen: false,
  photos: false,
  messages: [],
  series: [],
  ...over,
})

async function stub(page: Page, data: unknown, status = 200) {
  const posts: unknown[] = []
  // Like the real server: once a reply is posted, the next read carries it.
  let state = data as { you?: Record<string, unknown> }
  await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, mail: false, photos: false, invite: false } }))
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { signedIn: false } }))
  await page.route('**/api/r/*', async (r) => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON() as { reply?: string }
      posts.push(body)
      if (body.reply && state.you) state = { ...state, you: { ...state.you, reply: body.reply } }
      return r.fulfill({ json: { ok: true } })
    }
    return r.fulfill({ status, json: state })
  })
  return posts
}

test('the invited parent sees the plan and the home card, then answers yes', async ({ page }) => {
  const posts = await stub(page, card())
  await page.goto(`/${CODE}`)
  await expect(page.getByRole('heading', { name: 'Noé invite Léa' })).toBeVisible()
  await expect(page.getByText('À savoir avant de venir')).toBeVisible()
  await expect(page.getByText('Le chien est doux')).toBeVisible()
  // The address is NOT shown before a yes.
  await expect(page.getByText(/L’adresse s’affiche/)).toBeVisible()
  await page.getByRole('button', { name: 'Oui, on y sera' }).click()
  await page.getByLabel('Votre prénom').fill('Julie')
  await page.locator('input[name=email]').fill('julie@example.com')
  await page.getByLabel('Me rappeler la veille par courriel').check()
  await page.getByRole('button', { name: 'Répondre', exact: true }).click()
  await expect(page.getByText('Réponse envoyée. Merci !')).toBeVisible()
  expect(posts[0]).toMatchObject({ reply: 'yes', remind: true, parentName: 'Julie', email: 'julie@example.com' })
})

test('a birthday asks how many come, only once the answer is yes', async ({ page }) => {
  const posts = await stub(page, card({ encounter: { ...card().encounter, kind: 'birthday', details: { gift: 'Un livre' } }, homeCard: null }))
  await page.goto(`/${CODE}`)
  await expect(page.getByText('🎁 Un livre')).toBeVisible()
  await expect(page.getByLabel('Adultes qui restent')).toHaveCount(0)
  await page.getByRole('button', { name: 'Oui, on y sera' }).click()
  await page.getByLabel('Adultes qui restent').fill('2')
  await page.getByLabel('Enfants', { exact: true }).fill('3')
  await page.getByRole('button', { name: 'Répondre', exact: true }).click()
  await expect(page.getByText('Réponse envoyée. Merci !')).toBeVisible()
  expect(posts[0]).toMatchObject({ reply: 'yes', adults: 2, kids: 3 })
})

test('English toggle, and the paper spelling works in any case', async ({ page }) => {
  await stub(page, card())
  await page.goto(`/${CODE.toUpperCase()}`)
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('heading', { name: 'Noé invites Léa' })).toBeVisible()
  await expect(page.getByText('Good to know before you come')).toBeVisible()
})

test('a dead link says so calmly', async ({ page }) => {
  await stub(page, { error: 'Ce lien ne mène nulle part.' }, 404)
  await page.goto(`/${CODE}`)
  await expect(page.getByText(/ne mène nulle part/)).toBeVisible()
})

test('nothing bleeds off the right edge, even at 320px (per-child bounds, not scrollWidth)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await stub(page, card({ series: [{ token: 'aaaabbbb', starts_at: soon + 7 * 86_400, reply: null }] }))
  await page.goto(`/${CODE}`)
  await expect(page.getByRole('heading', { name: 'Noé invite Léa' })).toBeVisible()
  const overflowing = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    return [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
      .map((el) => ({ tag: el.tagName, cls: el.className?.toString?.() ?? '', right: Math.round(el.getBoundingClientRect().right) }))
      .filter((x) => x.right > vw + 1)
  })
  expect(overflowing).toEqual([])
})

test('no serious or critical accessibility violation on the reply page', async ({ page }) => {
  await stub(page, card())
  await page.goto(`/${CODE}`)
  await expect(page.getByRole('heading', { name: 'Noé invite Léa' })).toBeVisible()
  const { violations } = await new AxeBuilder({ page }).analyze()
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
})

test('"What we keep" says the purpose, where it is hosted and how to erase everything', async ({ page }) => {
  await stub(page, card())
  await page.goto('/confidentialite')
  await expect(page.getByRole('heading', { name: 'Ce qu’on garde' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'À quoi ça sert' })).toBeVisible()
  await expect(page.getByText(/Hébergé chez Cloudflare/)).toBeVisible()
  await expect(page.getByText(/Tout effacer/).first()).toBeVisible()
  await expect(page.getByText(/Un prénom et un courriel suffisent/)).toBeVisible()
})

test('every optional field on the reply page says why it is asked and what you lose by skipping it', async ({ page }) => {
  await stub(page, card())
  await page.goto(`/${CODE}`)
  await page.getByRole('button', { name: 'Oui, on y sera' }).click()
  await expect(page.getByText(/Sans ça : pas de rappel/)).toBeVisible()
  await expect(page.getByText(/Sans ça : l’hôte n’a aucune alerte/)).toBeVisible()
  await expect(page.getByText(/l’appli ne s’en sert pas/)).toBeVisible()
})
