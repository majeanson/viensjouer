// Draws the app icons and the link-preview image into public/ with the Chromium Playwright already
// installs. Run again after changing the brand:   node scripts/make-icons.mjs
//   icon-192.png / icon-512.png     "any" icons (rounded square, transparent corners)
//   icon-maskable-512.png           full-bleed, the mark inside the 80 % safe zone (Android adaptive icons)
//   apple-touch-icon.png (180)      full-bleed, iOS rounds it itself
//   favicon-32.png                  the tab icon where SVG favicons are not used
//   og-image.png (1200x630)         what a texted link shows
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const PAPER = '#faf7f1'
const ORANGE = '#f2a03d'
const GREEN = '#5b9a8b'

// The mark: two overlapping circles (two families meeting), centred on a 100 x 100 box.
const mark = (scale = 1) => `<g transform="translate(50 50) scale(${scale}) translate(-50 -50)"><circle cx="36" cy="50" r="25" fill="${ORANGE}"/><circle cx="64" cy="50" r="25" fill="${GREEN}" fill-opacity="0.85"/></g>`
const svg = (size, body, round = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${round ? `<rect width="100" height="100" rx="22" fill="${PAPER}"/>` : `<rect width="100" height="100" fill="${PAPER}"/>`}${body}</svg>`

const jobs = [
  ['icon-192.png', 192, svg(192, mark(0.82), true), true],
  ['icon-512.png', 512, svg(512, mark(0.82), true), true],
  ['icon-maskable-512.png', 512, svg(512, mark(0.62)), false],
  ['apple-touch-icon.png', 180, svg(180, mark(0.7)), false],
  ['favicon-32.png', 32, svg(32, mark(0.95), true), true],
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, size, markup, transparent] of jobs) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>html,body{margin:0;background:${transparent ? 'transparent' : PAPER}}</style>${markup}`)
  await page.screenshot({ path: join(out, name), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } })
  console.log('wrote', name)
}

await page.setViewportSize({ width: 1200, height: 630 })
await page.setContent(`<style>
  html,body{margin:0;width:1200px;height:630px;background:${PAPER};font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#26201a}
  .wrap{display:flex;align-items:center;gap:56px;height:630px;padding:0 96px}
  h1{font-size:92px;margin:0 0 18px;letter-spacing:-2px}
  p{font-size:36px;margin:0;color:#6b6258;line-height:1.3;max-width:640px}
</style><div class="wrap">${svg(300, mark(1))}<div><h1>Viens jouer</h1><p>Les parents s’organisent pour que les tout-petits se voient.</p></div></div>`)
await page.screenshot({ path: join(out, 'og-image.png') })
console.log('wrote og-image.png')
await browser.close()
