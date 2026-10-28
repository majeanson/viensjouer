import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// The invited parent's walk — the screen most people will ever see. API stubbed.
const CODE = 'h7kq-3wpm'
const soon = Math.floor(Date.now() / 1000) + 3 * 86_400

const card = (over: Record<string, unknown> = {}) => ({
  alive: true,
  encounter: { id: 'e1', child_id: 'c1', kind: 'home', title: 'Chez nous après la sieste', starts_at: soon, ends_at: soon + 7200, place: 'Chez nous', address: null, note: 'Sieste à 13 h', status: 'proposed', details: {}, hereAt: null },
  host: { child_first_name: 'Noé', parent_name: 'Marc', household_name: 'Les Jeanson', tz: 'America/Toronto' },
  you: { parent_name: 'Julie', email: null, phone: null, child_first_name: 'Léa', allergies: null, reply: null, replyNote: null, remind: false, adults: null, kids: null, scope: 'family' },
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
  await page.route('**/api/r/**', async (r) => {
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
  // one tap: the answer is already saved, with nothing else sent
  await expect.poll(() => posts.length).toBe(1)
  expect(posts[0]).toEqual({ reply: 'yes' })
  // the details are an optional second step
  await expect(page.getByText('Ajouter mes coordonnées (facultatif)')).toBeVisible()
  await page.getByLabel('Votre prénom').fill('Julie')
  await page.locator('input[name=email]').fill('julie@example.com')
  await page.getByLabel('Me rappeler la veille par courriel').check()
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Réponse envoyée. Merci !')).toBeVisible()
  expect(posts[1]).toMatchObject({ remind: true, parentName: 'Julie', email: 'julie@example.com' })
  expect(posts[1]).not.toHaveProperty('reply')
})

test('a birthday asks how many come, only once the answer is yes', async ({ page }) => {
  const posts = await stub(page, card({ encounter: { ...card().encounter, kind: 'birthday', details: { gift: 'Un livre' } }, homeCard: null }))
  await page.goto(`/${CODE}`)
  await expect(page.getByText('Un livre')).toBeVisible()
  await expect(page.getByLabel('Adultes qui restent')).toHaveCount(0)
  await page.getByRole('button', { name: 'Oui, on y sera' }).click()
  await page.getByLabel('Adultes qui restent').fill('2')
  await page.getByLabel('Enfants qui viennent').fill('3')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Réponse envoyée. Merci !')).toBeVisible()
  expect(posts[0]).toEqual({ reply: 'yes' })
  expect(posts[1]).toMatchObject({ adults: 2, kids: 3 })
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

test('every optional field on the reply page has a « Pourquoi ? » that says what you lose by skipping it', async ({ page }) => {
  await stub(page, card())
  await page.goto(`/${CODE}`)
  await page.getByRole('button', { name: 'Oui, on y sera' }).click()
  // Collapsed by default so the form stays light; one tap opens the reason.
  // ONE « Pourquoi ? » for the group; it names every field and what you lose by skipping it.
  const whys = page.getByText('Pourquoi ?')
  await expect(whys).toHaveCount(1)
  await expect(page.getByText(/Sans ça : pas de rappel/)).toBeHidden()
  await whys.click()
  await expect(page.getByText(/Sans ça : pas de rappel/)).toBeVisible()
  await expect(page.getByText(/l’appli ne s’en sert pas/)).toBeVisible()
  await expect(page.getByText(/Sans ça : l’hôte n’a aucune alerte/)).toBeVisible()
  await expect(page.getByText(/Sans ça : il ne sait pas combien/)).toBeVisible()
})

test('the header with the language switch is there on every public page', async ({ page }) => {
  await stub(page, card())
  for (const path of ['/', `/${CODE}`, '/confidentialite']) {
    await page.goto(path)
    await expect(page.getByRole('button', { name: 'EN (English)' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Viens jouer' })).toBeVisible()
  }
})

test('whole family: the card says siblings are welcome and asks how many children come', async ({ page }) => {
  await stub(page, card())
  await page.goto(`/${CODE}`)
  await expect(page.getByText('Toute la famille est la bienvenue, frères et sœurs inclus.')).toBeVisible()
  await page.getByRole('button', { name: 'Oui, on y sera' }).click()
  await expect(page.getByLabel('Enfants qui viennent')).toBeVisible()
})

test('friend only (a paid birthday): the card names the child and never asks about siblings', async ({ page }) => {
  const posts = await stub(page, card({ encounter: { ...card().encounter, kind: 'birthday' }, homeCard: null, you: { ...card().you, scope: 'friend' } }))
  await page.goto(`/${CODE}`)
  await expect(page.getByText('Invitation pour Léa seulement.')).toBeVisible()
  await page.getByRole('button', { name: 'Oui, on y sera' }).click()
  await expect(page.getByLabel('Enfants qui viennent')).toHaveCount(0)
  await expect(page.getByLabel('Adultes qui restent')).toBeVisible()
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Réponse envoyée. Merci !')).toBeVisible()
  expect(posts[1]).toMatchObject({ adults: 1 })
  expect(posts[1]).not.toHaveProperty('kids')
})

test('the shared page says what it is, the facts, who it is for and what happens next', async ({ page }) => {
  await stub(page, card())
  await page.goto(`/${CODE}`)
  await expect(page.getByText(/^Invitation · /)).toBeVisible()
  await expect(page.getByText('Organisé par Marc, le parent de Noé.')).toBeVisible()
  // the facts as labelled rows
  for (const label of ['Quoi', 'Quand', 'Où', 'Adresse', 'À savoir']) await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Sieste à 13 h')).toBeVisible()
  // the three steps, the first one being "now"
  await expect(page.getByRole('heading', { name: 'Comment ça marche' })).toBeVisible()
  await expect(page.locator('.steps li')).toHaveCount(3)
  await expect(page.locator('.steps li.now')).toHaveCount(1)
  await expect(page.getByText('Pas de compte à créer.').first()).toBeVisible()
  await expect(page.getByText(/ne demande aucun compte/)).toBeVisible()
  // after the answer the page says the host already knows, and step one is done
  await page.getByRole('button', { name: 'Oui, on y sera' }).click()
  await expect(page.getByText('Marc voit ta réponse. Tu peux la changer jusqu’à la rencontre.')).toBeVisible()
  await expect(page.locator('.steps li.done')).toHaveCount(2)
})

test('a two-word link works in any case and with spaces or dots', async ({ page }) => {
  await stub(page, card())
  for (const path of ['/lune-miel', '/Lune-Miel', '/r/lune-miel']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'Noé invite Léa' })).toBeVisible()
  }
})

// ---- what changed: the invited parent is shown what the host edited
const t0 = Math.floor(Date.now() / 1000) + 3 * 86400
const edited = (over: Record<string, unknown> = {}) =>
  card({
    encounter: { ...card().encounter, kind: 'park', starts_at: t0 + 3600, place: 'Chez nous', note: 'Collation', address: null },
    homeCard: null,
    changes: [
      { field: 'starts_at', old_value: String(t0), new_value: String(t0 + 3600), created_at: Math.floor(Date.now() / 1000) - 60 },
      { field: 'place', old_value: 'Parc Lafontaine', new_value: 'Chez nous', created_at: Math.floor(Date.now() / 1000) - 60 },
      { field: 'address', old_value: null, new_value: null, created_at: Math.floor(Date.now() / 1000) - 60 },
    ],
    ...over,
  })

test('a parent who has seen the page before is shown exactly what changed, and can change their answer', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, String(Math.floor(Date.now() / 1000) - 3600)), `vj-seen-${CODE}`)
  await stub(page, edited({ you: { ...card().you, reply: 'yes' } }))
  await page.goto(`/${CODE}`)
  const banner = page.getByRole('status')
  await expect(banner.getByText('Mis à jour depuis ta dernière visite')).toBeVisible()
  await expect(banner.getByText('Chez nous', { exact: true })).toBeVisible()
  await expect(banner.getByText('L’adresse a été mise à jour.')).toBeVisible()
  // the rows that moved carry a « Modifié » mark with what they were before
  await expect(page.locator('.changed')).toHaveCount(2)
  await expect(page.locator('.was').first()).toContainText('avant :')
  await expect(banner.getByRole('button', { name: 'Changer ma réponse' })).toBeVisible()
})

test('a first-time visitor sees no « new » marks, but can read the history', async ({ page }) => {
  await stub(page, edited())
  await page.goto(`/${CODE}`)
  await expect(page.getByText('Mis à jour depuis ta dernière visite')).toHaveCount(0)
  await expect(page.locator('.changed')).toHaveCount(0)
  await page.getByText('Historique des modifications').click()
  await expect(page.getByText('Début :', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('L’adresse a été mise à jour.')).toBeVisible()
  // the address itself is never in the history
  await expect(page.getByText(/rue/)).toHaveCount(0)
})

test('an invited family sees the cover picture and who is coming (names of children, never a decline)', async ({ page }) => {
  await stub(page, card({ cover: 'abc123', guests: { yes: ['Max', 'Zoé'], maybe: ['Eli'], waiting: 2 }, homeCard: null }))
  await page.goto(`/${CODE}`)
  await expect(page.locator('img.cover')).toHaveAttribute('src', `/api/r/${CODE}/cover?v=abc123`)
  const guests = page.getByLabel('Qui vient')
  await expect(guests).toContainText('Viennent (2) : Max, Zoé')
  await expect(guests).toContainText('Peut-être (1) : Eli')
  await expect(guests).toContainText('2 familles n’ont pas encore répondu.')
  await expect(guests).toContainText('jamais ceux qui ont dit non')
})

test('the host can hide who is coming: the page then shows no list', async ({ page }) => {
  await stub(page, card({ cover: null, guests: null, homeCard: null }))
  await page.goto(`/${CODE}`)
  await expect(page.getByLabel('Qui vient')).toHaveCount(0)
  await expect(page.locator('img.cover')).toHaveCount(0)
})

test('« À apporter »: take a line, add your own, and a family that has not answered only reads', async ({ page }) => {
  const lines = [{ id: 'b1', label: 'la collation', by: null, mine: false }, { id: 'b2', label: 'des jus', by: 'Paul', mine: false }]
  const posts = await stub(page, card({ bring: lines, homeCard: null }))
  await page.goto(`/${CODE}`)
  const box = page.getByLabel('À apporter', { exact: true }).first()
  await expect(box).toContainText('la collation')
  await expect(box).toContainText('apporté par Paul')
  // not answered: no buttons, a sentence says why
  await expect(box.getByRole('button', { name: 'Je l’apporte' })).toHaveCount(0)
  await expect(box).toContainText('Réponds « oui » ou « peut-être » pour en prendre une.')
  await page.getByRole('button', { name: 'Oui, on y sera' }).click()
  await expect(box.getByRole('button', { name: 'Je l’apporte' })).toHaveCount(1)
  await box.getByRole('button', { name: 'Je l’apporte' }).click()
  await expect.poll(() => posts.filter((p) => (p as { claim?: string }).claim).length).toBe(1)
  expect(posts.find((p) => (p as { claim?: string }).claim)).toEqual({ claim: 'b1' })
  await box.getByLabel('J’apporte…').fill('des fruits')
  await box.getByRole('button', { name: 'Ajouter' }).click()
  await expect.poll(() => posts.filter((p) => (p as { add?: string }).add).length).toBe(1)
})

test('the calendar button is a download AND a link the calendar app keeps up to date', async ({ page }) => {
  await stub(page, card())
  await page.goto(`/${CODE}`)
  await expect(page.getByRole('link', { name: 'Ajouter à mon calendrier' })).toHaveAttribute('href', `/api/r/${CODE}/ics`)
  await expect(page.getByRole('link', { name: 'Suivre dans mon calendrier (se met à jour)' })).toHaveAttribute('href', new RegExp(`^webcal://[^/]+/api/r/${CODE}/ics\\?s=1$`))
})

// The Oui button is the main thing a parent taps; white on the dark theme's light green failed contrast and
// nothing noticed because axe only ran in the light theme. Both themes, the answer given and not yet.
test.describe('in the dark theme', () => {
  test.use({ colorScheme: 'dark' })
  test('no serious or critical accessibility violation on the reply page, before and after answering', async ({ page }) => {
    await stub(page, card())
    await page.goto(`/${CODE}`)
    await expect(page.getByRole('heading', { name: 'Noé invite Léa' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
    const scan = async () => {
      const { violations } = await new AxeBuilder({ page }).analyze()
      return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
    }
    expect(await scan()).toEqual([])
    await page.getByRole('button', { name: 'Oui, on y sera' }).click()
    await expect(page.getByText(/Ajouter mes coordonnées/)).toBeVisible()
    expect(await scan()).toEqual([])
  })
})
