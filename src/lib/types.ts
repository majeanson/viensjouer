// Shapes the SPA reads off the API (snake_case rows, as the server sends them).
export type Kind = 'park' | 'home' | 'birthday'
export type Status = 'proposed' | 'confirmed' | 'cancelled'
export type Reply = 'yes' | 'no' | 'maybe'

export interface Child {
  id: string
  first_name: string
  birthdate: string | null
  colour: string
  position: number
}

export interface Family {
  id: string
  parent_name: string
  email: string | null
  phone: string | null
  child_first_name: string
  child_birthdate: string | null
  allergies: string | null
  notes: string | null
  linked_household_id: string | null
}

export interface Encounter {
  id: string
  child_id: string
  kind: Kind
  title: string
  starts_at: number
  ends_at: number | null
  place: string | null
  address: string | null
  map_url: string | null
  cover?: string | null
  show_guests?: boolean
  thanked_at?: number | null
  note: string | null
  status: Status
  series_id?: string | null
  here_at?: number | null
  hereAt?: number | null
  hereOpen?: boolean
  details?: Record<string, string>
}

export interface InvitationSummary {
  encounter_id: string
  id: string
  reply: Reply | null
  parent_name: string
  child_first_name: string
}

export interface Invitation {
  id: string
  friend_family_id: string
  token: string
  reply: Reply | null
  reply_note: string | null
  reply_at: number | null
  sent_at: number | null
  parent_name: string
  child_first_name: string
  email: string | null
  allergies: string | null
  adults: number | null
  kids: number | null
  scope: 'friend' | 'family'
}

export interface Message {
  id: string
  author_kind: 'host' | 'guest'
  author_label: string
  text: string
  created_at: number
}

export interface Group {
  id: string
  name: string
  families: string[]
}

export interface WindowTarget {
  id: string
  window_id: string
  token: string
  reply: 'yes' | 'no' | null
  reply_note: string | null
  parent_name: string
  child_first_name: string
  email: string | null
}

export interface OpenWindow {
  id: string
  child_id: string
  starts_at: number
  ends_at: number
  note: string | null
  targets: WindowTarget[]
}

export interface HomeCard {
  dog: boolean
  pool: boolean
  screens: 'none' | 'little' | 'free' | null
  nutFree: boolean
  note: string
}

export interface Relais {
  invitation_id: string
  nap: string | null
  ate: string | null
  mood: string | null
  note: string | null
  expires_at: number
}

export interface Souvenir {
  id: string
  author_kind: 'host' | 'guest'
  author_label: string
  created_at: number
}
