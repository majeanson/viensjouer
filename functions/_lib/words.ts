// The word list behind the share links: « lune-pain-482 », two plain French words and a number.
// Words a parent can say out loud and spell without accents: 3–6 letters, a–z only, nothing rude,
// nothing obscure (EXCLUDE below drops the ones nobody would spell right the first time).
//
// HONEST TRADE: two words from ~400 plus a 3-digit number is ≈ 27 bits (≈ 1.3e8), against ≈ 40 for
// the old 8 random characters. Short and sayable costs strength. What keeps it acceptable: the code
// is still the only credential for ONE rencontre and ONE family, it dies the day after the date,
// the doors that read it are rate-limited by address (30 a minute), and a guess has to land on one
// of the few LIVE codes. What a guesser could see is a first name, a time and a place; the address
// stays hidden until a « yes ». Older 8-character codes keep working. words.test.ts pins the list's
// size and shape.
const RAW = `
ours loup renard chat chien lapin canard poule cheval vache mouton cochon souris singe tigre lion zebre panda koala
phoque requin crabe poisson oiseau hibou merle pigeon cygne oie dindon veau chevre ane lievre biche cerf daim
blaireau castor loutre taupe renne bison yack lama raie thon sole truite carpe homard huitre moule limace guepe
fourmi mouche tortue lezard poney paon aigle faucon heron pinson coq poulet canari caille geai grue manchot otarie
morse lynx puma jaguar cobra gecko iguane lemur tapir okapi dingo ibis cigale criquet mulot loir martre fouine
chacal hyene gnou buffle elan hippo ocelot oryx

lune soleil etoile nuage vent pluie neige givre brume orage eclair ciel mer lac source plage dune sable roche
pierre galet mont val pre champ foret bois arbre chene sapin pin erable saule tilleul orme houx lierre mousse
herbe fleur rose lys tulipe lilas jasmin muguet menthe thym sauge persil ile cap baie golfe delta oasis grotte
chemin route rue quai port gare place jardin verger ferme moulin grange etable puits mare etang ruche nid
cabane chalet manoir tipi igloo aurore crepus brise vague ecume rive gue cime pic crete vallon prairie

pomme poire prune cerise fraise mure peche abricot citron orange banane kiwi mangue ananas raisin melon datte noix
amande miel pain gateau tarte crepe beurre lait yaourt oeuf riz pate soupe sucre sel poivre the cafe cacao
carotte navet radis chou pois mais ble avoine seigle olive tomate salade courge ail oignon cresson brioche
flan glace bonbon sirop jus eau miche baguet semoule lentil figue groseille

table chaise lit lampe livre stylo crayon ballon velo train bus avion bateau voile ancre phare pont tour porte
toit mur cle cloche bougie tapis miroir panier sac seau pelle rateau jouet poupee cube puzzle flute piano harpe
cirque piste manege tente camp feu braise four poele bol tasse verre couteau nappe botte bonnet gant echarpe
robe pull jupe veste short ceinture bague perle ruban fil aiguille bouton lacet cartable gomme regle craie

rouge bleu vert jaune violet gris noir blanc brun beige dore argent ocre azur rubis jade ambre ivoire corail
indigo cyan petit grand doux joli rond lent vif calme gai clair frais tendre sage brave fier drole chaud tiede
leger lourd rapide fort tendre neuf vieux plat haut bas long court large fin pur franc beau

balle boule filet patin ski luge kayak canoe rame nage saut danse chant conte fable reve jeu rire bravo merci
salut hop youpi ronde farce bulle plume paille ficelle noeud pomme tambour grelot sifflet

nord sud est ouest midi aube soir nuit jour mois an hiver ete autom printemps matin soleil minute heure
`

const EXCLUDE = new Set('gue crepus baguet lentil loris okapi dingo ibis oryx yack gnou tipi igloo delta oasis golfe lemur tapir cyan indigo ocre azur lys ane oie sol raie moule puma lynx hyene chacal martre fouine geai grue caille canari tambour grelot sifflet farce hop youpi mais pate aube autom midi mois'.split(' '))

export const WORDS: readonly string[] = [...new Set(RAW.split(/\s+/).filter((w) => /^[a-z]{3,6}$/.test(w) && !EXCLUDE.has(w)))]
