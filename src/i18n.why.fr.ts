// The « Pourquoi ? » notes under optional fields, in their own lazy chunk: they are read only when someone opens one, so they are not
// downloaded with the dictionary every screen needs. src/lib/whyText.ts loads them on the first open.
export const WHY_FR = {
  nap: 'Sert aux choix « Avant la sieste » et « Après la sieste » quand tu proposes une rencontre. Sans ça : 10 h et 15 h, et tu changes l’heure à la main.',
  childBirthdate: 'Sert à afficher son âge et son anniversaire au calendrier. Sans ça : ni âge ni anniversaire, tout le reste marche.',
  friendBirthdate: 'Sert à l’anniversaire de cet ami dans le calendrier. Sans ça : pas de rappel d’anniversaire pour lui.',
  friendEmail: 'Sert à envoyer le lien et le rappel par courriel. Sans ça : tu copies le lien toi-même.',
  phone: 'Une note pour toi seulement ; l’appli ne s’en sert pas. Sans ça : rien ne change.',
  allergies: 'Sert à t’alerter sur la fiche de la rencontre avant la collation. Sans ça : aucune alerte affichée.',
  notes: 'Une note pour toi seul (chien, sieste…). Sans ça : rien ne change.',
  address: 'Sert à montrer le lieu exact, seulement aux familles qui disent oui. Sans ça : écris le lieu dans « Où », ou dis-le dans le fil.',
  mapUrl: 'Sert à ouvrir le lieu dans une appli de carte en un toucher (copie le lien depuis Google Maps, Plans ou autre). Pour une maison, seules les familles qui disent oui le voient. Sans ça : écris l’adresse ou le lieu.',
  homeCard: 'Tout est facultatif. Sert à répondre d’avance aux questions qu’on n’ose pas poser. Sans ça : l’autre parent ne voit rien de tout ça avant de venir.',
  relais: 'Sert à donner des nouvelles après la visite. Sans ça : tu les donnes de vive voix.',
  photos: 'Sert à partager les photos de la journée avec les familles présentes. Sans ça : pas de souvenirs partagés, tu peux n’en ajouter jamais.',
  planB: 'Sert à dire aux familles quoi faire s’il pleut, avant qu’elles te le demandent. Sans ça : rien ne s’affiche, tu écris au besoin sur le babillard.',
  gift: 'Sert à guider les invités. Sans ça : aucune idée affichée.',
  headcount: 'Sert à l’hôte pour les chaises et les collations. Sans ça : il ne sait pas combien vous êtes.',
  replyEmail: 'Sert à recevoir le rappel de la veille. Sans ça : pas de rappel, tu réponds quand même.',
  replyPhone: 'Une note pour l’hôte seulement ; l’appli ne s’en sert pas. Sans ça : rien ne change.',
  replyAllergies: 'Sert à prévenir l’hôte avant la collation. Sans ça : l’hôte n’a aucune alerte.',
  cover: 'Sert à illustrer l’invitation ; toute famille qui a le lien la voit. Sans ça : l’invitation n’a pas d’image.',
  avatar: 'Sert à reconnaître l’enfant ou le parent sur l’invitation : les familles invitées voient ces photos sur la page de leur lien, et nulle part ailleurs. Sans ça : une initiale sur une couleur.',
}
