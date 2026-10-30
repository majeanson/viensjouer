# Checking it on a real phone and a real desktop

The automated checks (`npm run check:all`) cover the logic, both languages, both themes, the layout at 320 px and 1280 px, accessibility
(axe) and two real accounts on a real Worker and D1. What they cannot feel is a finger and a real screen. Ten minutes, once per release.

**On a phone** (open the live address; add it to the home screen once)
1. Rencontres: the orange « Proposer une rencontre » sits beside the title (under it on a small phone). Tap it.
2. New rencontre: type « Parc samedi 10 h avec <un prénom> » in the sentence box, tap « Remplir ». Day, hour, place and the friend are set.
3. Proches: slide a friend row to the LEFT, slowly. It follows the finger over a red bin; let go early and it slides back; past the mark it removes and « Annuler » appears.
   Slide to the RIGHT: pencil, and the edit sheet opens. (A scroll up or down must never start a slide.)
4. Edit sheet: change a name, wait a second: « Enregistré » appears; « Retour » closes. Empty the name: a red sentence under the field, nothing saved.
5. Mon compte: Profil is first; change the first name, no button, it saves. The photo: tap the face to change it, the bin beside it removes it.
6. Open an invitation link from a text message: cover, when and where, three answers; the slim bar shows only when the question is off screen.
7. Turn the phone to dark mode and to a larger text size: nothing cut off, nothing overlapping.

**On a desktop** (a window at least 1200 px wide)
1. Rencontres: the list on the left, the open rencontre on the right, the open one outlined. Resize under 1200 px: back to one column.
2. Tab through a sheet: focus stays inside it, Escape closes it and puts the focus back on the button that opened it.
3. Two children: new rencontre, tick both « Qui invite ? ». The invitation page says « X et Y invitent … » with both faces.

**Anything off?** Tell me the screen and what you saw (a screenshot is best); I reproduce it in a test first, then fix it.
