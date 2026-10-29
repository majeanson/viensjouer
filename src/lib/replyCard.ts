// The shape of what GET /api/r/<code> sends, written ONCE for the page. The server builds the answer by hand (functions/api/r/
// [token].ts), so the two can drift without tsc noticing; `REPLY_CARD_KEYS` lists every field and `replyCard.test.ts` runs the
// real handler on a real database and compares its keys with this list: a field added on one side only fails the build.
import type { Encounter, HomeCard, Message, Reply as ReplyKind } from './types'
import type { ChangeRow } from './changes'

export interface ReplyCard {
  alive: boolean
  encounter: Omit<Encounter, 'address'> & { address: string | null }
  host: { child_first_name: string; parent_name: string; household_name: string; tz: string; childPhoto?: string | null; parentPhoto?: string | null }
  you: { parent_name: string; email: string | null; phone: string | null; child_first_name: string; allergies: string | null; reply: ReplyKind | null; replyNote: string | null; remind: boolean; adults: number | null; kids: number | null; scope: 'friend' | 'family' }
  homeCard: HomeCard | null
  relais: { nap: string | null; ate: string | null; mood: string | null; note: string | null } | null
  souvenirs: { id: string; author_label: string }[]
  souvenirsOpen: boolean
  photos: boolean
  messages: Message[]
  series: { token: string; starts_at: number; reply: ReplyKind | null }[]
  siblings?: { token: string; child: string; reply: ReplyKind | null }[]
  changes: ChangeRow[]
  cover: string | null
  guests: { yes: string[]; maybe: string[]; waiting: number } | null
  bring: { id: string; label: string; by: string | null; mine: boolean }[]
}

export const REPLY_CARD_KEYS: Record<keyof ReplyCard, true> = {
  alive: true,
  encounter: true,
  host: true,
  you: true,
  homeCard: true,
  relais: true,
  souvenirs: true,
  souvenirsOpen: true,
  photos: true,
  messages: true,
  series: true,
  siblings: true,
  changes: true,
  cover: true,
  guests: true,
  bring: true,
}

export const REPLY_YOU_KEYS: Record<keyof ReplyCard['you'], true> = {
  parent_name: true,
  email: true,
  phone: true,
  child_first_name: true,
  allergies: true,
  reply: true,
  replyNote: true,
  remind: true,
  adults: true,
  kids: true,
  scope: true,
}
