// The English privacy text, the same shape as PRIVACY_FR (a key missing here fails tsc), loaded only for English visitors of that page.
import type { PRIVACY_FR } from './i18n.privacy.fr'

export const PRIVACY_EN: typeof PRIVACY_FR = {
  lead: 'A first name and an email are enough to do everything. The rest is optional, and each field says what it is for and what you lose by skipping it.',
  requiredTitle: 'Required',
  required: ['Your first name and email (with a password) to have an account.', 'Your child’s first name and your friends’, a nickname is fine.', 'A title and a time for each get-together.', 'To answer a link: nothing at all, just “yes”, “maybe” or “no”.'],
  optionalTitle: 'Optional, and what it unlocks',
  optionalLead: 'Skipping any of these never blocks the rest.',
  optional: [
    ['Birth date', 'Age and birthdays on the calendar.'],
    ['A friend’s email', 'Sending the link and the reminder by email (otherwise you copy the link).'],
    ['Allergies', 'An alert on the page before the snack.'],
    ['Address', 'The exact place, shown only to families who say yes.'],
    ['Phone and notes', 'Nothing in the app: they are notes for you.'],
    ['“Our place” card', 'Answering in advance: dog, pool, screens, nut-free.'],
    ['Hand-off note', 'News after a visit (disappears in a week).'],
    ['Photos', 'Souvenirs shared with the families who were there.'],
    ['Get-together picture', 'Illustrates the invitation; any family with the link sees it.'],
    ['A child’s or a parent’s photo', 'The invited families see it on their link’s page, nothing more.'],
    ['The board', 'Notes written on a get-together are read by the invited families; the host can remove anything, everyone removes their own.'],
    ['To bring', 'The parent’s first name shows next to what they bring, for the invited families.'],
    ['My calendar', 'A secret link to your get-togethers, which you can change or switch off.'],
  ] as [string, string][],
  sharedTitle: 'Who sees what',
  shared: ['Each family sees only what concerns it: its get-togethers, its invitations, and the first names of the children coming to the same get-togethers (the host can turn that off).', 'A reply link shows the address only after a “yes”.', 'When a link is texted, the preview shows only the title, date, place and picture: what the page already shows to whoever holds the link.', 'Nothing is public, nothing is searchable, there is no map of families.', 'A trial without an account is erased after 24 hours.'],
  purposeTitle: 'What it is for',
  purpose: 'Viens jouer does one thing: helps parents of toddlers organize get-togethers, at the park, at home, at a party, and answer them without an account. No ads, no selling data, no public profile, no map of families.',
  hostTitle: 'Where the data lives',
  host: ['Hosted on Cloudflare: the site, the database (placed in eastern North America) and the photos are stored there.', 'Invitation and reminder emails go out through Resend (United States), only when you ask.', 'Cloudflare may measure traffic in aggregate. At signup and « forgot password », a Cloudflare bot check (Turnstile) may appear. No other third-party service, no advertising tracker.', 'Notifications: if you allow them, we keep only your device’s technical address to wake it. The text does not go through Apple or Google. News is erased after 30 days.', 'Your device’s language (French or English) is kept so we write to you in it. A counter of emails sent per host family, with no address or text, caps sending at 60 a day and is erased after two days.'],
  removeTitle: 'Removing it all',
  remove: ['“My account” → “Erase everything”: the family, children, friend families, get-togethers, messages, photos and each parent’s account go at once, for good, immediately. Your password is needed.', '“Download my data” gives you everything in one file before you erase.', 'Removing a child, a family or a get-together elsewhere in the app hides it right away; after 30 days it is erased for good (if a past get-together still names it, only the first name stays in that history), or at once with “Erase everything”.', 'A family that answers without an account: its answers sit in the host’s book. It can ask the host to remove it, or create an account and erase everything.', 'A trial without an account erases itself after 24 hours.'],
}
