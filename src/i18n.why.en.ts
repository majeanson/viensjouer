// The English « Why? » notes, the same keys as WHY_FR (a key missing here fails tsc), loaded only when one is opened.
import type { WHY_FR } from './i18n.why.fr'

export const WHY_EN: typeof WHY_FR = {
  nap: 'Used for the “Before nap” and “After nap” choices when you propose a get-together. If you skip it: 10 am and 3 pm, and you change the time by hand.',
  childBirthdate: 'Used to show their age and birthday on the calendar. If you skip it: no age or birthday, everything else works.',
  friendBirthdate: 'Used for this friend’s birthday on the calendar. If you skip it: no birthday reminder for them.',
  friendEmail: 'Used to send the link and the reminder by email. If you skip it: you copy the link yourself.',
  phone: 'A note for you only; the app does not use it. If you skip it: nothing changes.',
  allergies: 'Used to alert you on the get-together’s page before the snack. If you skip it: no alert shown.',
  notes: 'A note for you alone (dog, nap…). If you skip it: nothing changes.',
  address: 'Used to show the exact place, only to families who say yes. If you skip it: write the place under “Where”, or say it in the thread.',
  mapUrl: 'Used to open the place in a map app in one tap (copy the link from Google Maps, Apple Maps or another). For a home, only families who say yes see it. If you skip it: write the address or the place.',
  homeCard: 'Everything is optional. Used to answer in advance what people do not dare ask. If you skip it: the other parent sees none of this before coming.',
  relais: 'Used to give news after the visit. If you skip it: you give it in person.',
  photos: 'Used to share the day’s photos with the families who were there. If you skip it: no shared souvenirs, you may never add one.',
  planB: 'Used to tell families what happens if it rains, before they ask. If you skip it: nothing shows, write on the board when needed.',
  gift: 'Used to guide the guests. If you skip it: no idea is shown.',
  headcount: 'Used by the host for chairs and snacks. If you skip it: they do not know how many of you.',
  replyEmail: 'Used to get the day-before reminder. If you skip it: no reminder, you can still answer.',
  replyPhone: 'A note for the host only; the app does not use it. If you skip it: nothing changes.',
  replyAllergies: 'Used to warn the host before the snack. If you skip it: the host gets no alert.',
  cover: 'Used to illustrate the invitation; any family with the link sees it. If you skip it: the invitation has no picture.',
  avatar: 'Used to recognise the child or the parent on the invitation: the invited families see these photos on their link’s page, and nowhere else. If you skip it: an initial on a colour.',
}
