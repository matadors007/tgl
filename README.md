# Tunisia Golden League — Application mobile

Application Android / iOS (**React Native / Expo SDK 57 + Firebase**) du complexe Tunisia Golden League :

- **Réservation** des terrains 6v6 / 7v7 (créneaux de 90 min) : le client envoie une demande, le créneau est bloqué aussitôt, l'administrateur (ou l'agent) traite la file **FIFO**, confirme ou refuse.
- **Championnat des entreprises** : calendrier aller-retour, scores et classement **en direct**, buteurs, passeurs, cartons, suspensions, live Facebook.
- **Espace entreprise** : chaque entreprise voit son équipe (classement, prochain match, effectif, statistiques, alertes de suspension, calendrier).
- **Opérateur de match** : saisit en direct le score, le buteur, le passeur, les cartons, les mi-temps.
- **Inscriptions en ligne** : une entreprise crée son compte, inscrit son équipe et ses joueurs (CIN, téléphone, poste, matricule) ; l'administrateur valide ou refuse chaque équipe et chaque joueur. Seuls les joueurs validés comptent.
- **Sélection des joueurs** par l'entreprise pour chaque match, jusqu'à **12 h avant** le coup d'envoi (verrouillée ensuite).
- **Tâches à faire** pour l'entreprise et pour l'administrateur, **notifications in-app** (cloche sur l'accueil) et message **WhatsApp** à l'administrateur à chaque demande de réservation.
- Réservations ouvertes sur une **fenêtre glissante de 7 jours** (réglable) ; créneaux **configurables par terrain**.
- Français / anglais. Charte noir & or de l'académie.

## Rôles

| Rôle | Ce qu'il peut faire |
| --- | --- |
| Joueur / client | Accueil (carrousel des terrains), **Réserver**, **Vidéos**, **À propos**, ses réservations. Ne voit pas le championnat. |
| Entreprise | **Ne réserve pas de terrain.** Matchs, classements et l'onglet **Mon équipe** : inscription de l'équipe, joueurs à soumettre, sélection des matchs, tâches à faire |
| Opérateur | Console live des matchs : coup d'envoi, mi-temps, buts (buteur + passeur), cartons, changements, feuille de match |
| Agent | File d'attente des réservations, planning des terrains |
| Administrateur | Tout : réservations, matchs, championnat, équipes, actualités, paramètres, rôles des comptes |

---

## 1. Essayer tout de suite (mode démo, sans Firebase)

Sans fichier `.env`, l'app démarre en **mode démo** (données fictives, sur un seul téléphone). À la connexion, choisis un rôle.

Prérequis : [Node.js 20+](https://nodejs.org) sur le PC et l'app **Expo Go** sur le téléphone.

Double-clique sur **`lancer-app.bat`** (ou `npm install` puis `npx expo start`), puis scanne le QR code avec Expo Go. Le PC et le téléphone doivent être sur le même Wi-Fi.

---

## 2. Tester en temps réel avec de vrais comptes (Firebase) — 10 minutes

C'est ce mode qu'il faut pour tester à plusieurs : un téléphone en client, un autre en opérateur, le PC en administrateur… Tout se met à jour en direct.

1. Va sur <https://console.firebase.google.com> → **Créer un projet** (nom : `tunisia-golden-academy`, Google Analytics inutile).
2. Dans le projet : **Paramètres du projet** (roue dentée) → **Comptes de service** → **Générer une nouvelle clé privée**.
   Enregistre le fichier téléchargé dans ce dossier sous le nom **`serviceAccount.json`**.
3. Double-clique sur **`setup-firebase.bat`**. Le script :
   - active la connexion e-mail / mot de passe,
   - crée la base Firestore et déploie les règles de sécurité,
   - écrit le fichier `.env`,
   - crée les terrains, la saison, 8 entreprises (80 joueurs), le calendrier (1re journée **aujourd'hui** à 19:30 et 21:00),
   - crée les comptes de test ci-dessous.

   Si une étape affiche ⚠, fais-la à la main dans la console comme indiqué, puis relance le script (il peut être relancé sans risque ; `setup-firebase.bat --reset` recrée le championnat de test).
4. Double-clique sur **`lancer-app.bat`** et scanne le QR code. Le bandeau « Mode démo » a disparu : tu es sur les vraies données.

### Comptes de test créés

Mot de passe **`Test1234`** pour tous les comptes (phase de test).

| Rôle | E-mail |
| --- | --- |
| Administrateur | `admin@tga.tn` |
| Opérateur | `operateur@tga.tn` |
| Agent | `agent@tga.tn` |
| Utilisateur particulier | `joueur@tga.tn` |
| Entreprises | `atlas@`, `carthage@`, `medina@`, `sahel@`, `jasmin@`, `olivier@`, `byrsa@`, `djerba@tga.tn` |

`mettre-a-jour.bat` remet `Test1234` sur **tous** les comptes du projet (y compris ceux créés depuis l'app).
⚠️ Ce sont des comptes de test : change les mots de passe (ou supprime-les dans Firebase → Authentication) avant l'ouverture au public. Les noms d'entreprises sont fictifs : renomme-les dans Administration → Championnat.

### Scénario de test en direct (2 appareils)

1. **Téléphone 1** : connecte-toi `joueur@tga.tn` → Réserver → choisis un créneau → Envoyer la demande.
2. **PC** (touche `w` dans le terminal pour ouvrir l'app dans le navigateur) : `admin@tga.tn` → Profil → Administration → File d'attente → **Confirmer**. Le téléphone 1 voit la réservation passer à « Confirmée ».
3. **Inscription d'une entreprise** : sur un téléphone, « Créer un compte » → type **Entreprise** → onglet **Mon équipe** → Inscrire mon équipe (pendant les inscriptions) → Mes joueurs → ajouter et soumettre. Sur le PC, `admin@tga.tn` → Administration → **Validation** → Valider.
4. **Téléphone 1** : déconnecte-toi, connecte-toi `operateur@tga.tn` → Administration → Matchs & live → un match de la journée 1 → coche les joueurs → **Coup d'envoi** → **But** → buteur → passeur.
5. **PC** : connecte-toi `atlas@tga.tn` (ou l'entreprise concernée) → onglet **Mon équipe** et **Classements** : le score, le classement live et les buteurs bougent en direct.

---

## Vitrine, WhatsApp, saison

- **Vitrine** (Administration → Vitrine) : photos du carrousel d'accueil (depuis la galerie du téléphone ou un lien), vidéos publicitaires (liens YouTube, Facebook ou .mp4) et textes de la page **À propos** (présentation, adresse, description et photo de chaque terrain). Tant qu'aucune photo n'est ajoutée, l'app affiche des images par défaut.
- **WhatsApp automatique** : à chaque demande de réservation, l'app envoie un WhatsApp à l'administrateur via le service gratuit **CallMeBot**. Activation une seule fois : sur callmebot.com (rubrique WhatsApp), active le service pour le numéro de l'admin, puis colle la clé reçue dans Administration → Paramètres (bouton « Envoyer un message de test » pour vérifier).
- **Réinitialiser la saison** : Administration → Championnat → *Réinitialiser la saison* (ou `reinitialiser-saison.bat`). Supprime équipes, joueurs, calendrier et résultats et rouvre les inscriptions ; les comptes sont conservés.
- **Créneaux par date** : Administration → Créneaux des terrains → *Date précise* (fermer un jour, horaires spéciaux…).

## Site web (même application, dans le navigateur)

Double-clic sur **`deployer-site.bat`** : le site est publié gratuitement sur **https://<ton-projet>.web.app** (Firebase Hosting). La première fois, une fenêtre s'ouvre pour te connecter à ton compte Google. Sur ordinateur, c'est l'outil idéal pour l'administration : aperçu direct des pièces jointes, impression des documents, des **cartes de licence** et des **feuilles de match**.

## Codes OTP (activation des comptes particuliers)

Un **utilisateur particulier** qui s'inscrit reçoit par e-mail un **code à 6 chiffres**, envoyé depuis l'adresse de l'académie. Son compte devient **actif** (réservation possible) dès qu'il saisit le bon code. Le code est **valable 30 minutes** ; passé ce délai il est inactif et l'utilisateur demande un nouveau code (bouton « Renvoyer », 1 envoi par minute au maximum, 5 essais par code).

Le code est créé, envoyé et vérifié **côté serveur** (dossier `functions/`) : l'application ne le voit jamais, et la base refuse toute réservation d'un compte non activé.

**Activation (une seule fois)** : double-clic sur **`activer-otp.bat`**. Prérequis :
1. Forfait **Blaze** sur le projet Firebase (paiement à l'usage ; à ce volume le coût est nul, mais une carte est demandée) : Console Firebase → *Utilisation et facturation* → *Modifier le forfait*.
2. Adresse d'envoi Gmail : activer la **validation en 2 étapes**, puis créer un **mot de passe d'application** sur https://myaccount.google.com/apppasswords (16 caractères). C'est ce mot de passe que le script demande, pas le mot de passe habituel. Outlook et autres messageries sont aussi pris en charge.

L'adresse et le mot de passe sont enregistrés comme **secrets Firebase** : ils ne sont ni dans l'application, ni dans ce dossier.

## Mot de passe oublié

Un lien est envoyé ; il ouvre la page `/auth-action` du site (qui propose d'ouvrir l'application) pour saisir et confirmer le nouveau mot de passe. `mettre-a-jour.bat` règle automatiquement l'adresse de ces liens ; si un ⚠ s'affiche : Console Firebase → Authentication → Modèles → (crayon) → *Personnaliser l'URL d'action* → `https://<ton-projet>.web.app/auth-action`.

## Inscription d'une équipe (entreprise)

1. **Équipe** : nom, abréviation, couleur, logo → *Suivant*.
2. **Responsables** (nom, téléphone, e-mail ; le premier est le délégué) et **entraîneur** → *Suivant*.
3. **Effectif** : chaque joueur avec nom, prénom, date de naissance, **CIN**, **photo**, **attestation de travail** et **certificat d'aptitude** (ces deux pièces peuvent être collectives). Avant l'envoi, l'app liste les joueurs aux informations incomplètes et rappelle de transmettre la pièce collective.
4. **Envoyer la demande** → l'administrateur est notifié, vérifie (aperçu des pièces) et valide : les numéros de licence sont attribués, l'entreprise est notifiée, puis elle indique numéros et postes dans **Mon équipe**.

## Mettre à jour une installation existante

Après une nouvelle version de l'app : double-clic sur **`mettre-a-jour.bat`**. Il déploie les nouvelles règles de sécurité et complète les données existantes sans rien effacer (heure des matchs pour le délai de 12 h, lien entre chaque équipe et son compte entreprise). Si le déploiement des règles affiche ⚠, copie `firestore.rules` dans Console Firebase → Firestore Database → Règles → **Publier**. Puis régénère l'APK.

Dans Administration → Paramètres, renseigne le **WhatsApp de l'administrateur** et le nombre de **jours réservables**.

---

## 3. Générer l'APK Android

- **Sur ton PC** (Android Studio installé) : double-clic sur **`generer-apk.bat`** → le fichier **`TunisiaGoldenLeague.apk`** apparaît dans ce dossier. Fais-le **après** `setup-firebase.bat` pour que l'APK soit relié à ta base.
- **Dans le cloud Expo** (sans Android Studio) : `build-apk.bat` (compte gratuit expo.dev ; ajoute les variables `EXPO_PUBLIC_FIREBASE_*` du `.env` dans les variables d'environnement du projet EAS).

iPhone : Expo Go pour tester ; pour une vraie installation, compte Apple Developer + `npx eas-cli build --platform ios` (voir la section 6).

---

---

## Notifications push

Envoyées automatiquement, sans serveur (service gratuit Expo Push) :

| Événement | Qui reçoit |
| --- | --- |
| Coup d'envoi, mi-temps, reprise, fin, match reporté / reprogrammé | Abonnés « Matchs » (tous les matchs, ou seulement équipes suivies ★ et son équipe pour les entreprises) |
| But (buteur, passeur, score), carton jaune / rouge | Idem, selon les réglages Buts / Cartons |
| Nouvelle demande de réservation | Administrateurs et agents |
| Réservation confirmée / refusée / annulée | Le client concerné |

Chaque utilisateur règle ses notifications dans **Profil → Notifications** ; on suit une équipe avec le bouton **★ Suivre** de sa fiche.

**Activation (une seule fois)** : double-clic sur **`activer-notifications.bat`** (compte gratuit expo.dev), puis régénère l'APK avec `generer-apk.bat`.
Les notifications ne fonctionnent **pas dans Expo Go ni dans le navigateur** : il faut l'app installée (APK Android ; sur iPhone, version TestFlight / App Store avec un compte Apple Developer).

## 4. Règles métier

| Règle | Où c'est codé |
| --- | --- |
| Une demande bloque le créneau immédiatement (un seul gagnant si deux clients cliquent en même temps) | `src/data/services.ts` → `requestBooking` |
| File FIFO, expiration automatique (30 min), verrou entre agents | `fifoQueue`, `computeExpiresAt`, `lockBooking` |
| Matchs du championnat prioritaires : leurs créneaux sont bloqués | `generateCalendar` |
| Inscriptions fermées au premier coup d'envoi | `startMatch`, `saveTeam` |
| Score, classement, buteurs, passeurs, suspensions calculés à partir des événements | `src/domain/model.ts` |
| Rouge = 1 match ; 2 jaunes dans le match = rouge auto ; 3 jaunes cumulés = 1 match | `addEvent`, `computePlayerStats` |
| Fenêtre de réservation glissante (7 jours par défaut) | `bookingWindow`, `requestBooking` |
| Joueurs : brouillon → en attente → validé / refusé ; seuls les validés comptent | `companySavePlayer`, `reviewPlayer`, `isPlayerApproved` |
| Sélection de l'entreprise fermée 12 h avant le match | `canCompanyEditLineup`, `setCompanyLineup`, `firestore.rules` |
| Tâches à faire (entreprise / admin) | `companyTodos`, `adminTodos` |
| Droits par rôle (lecture / écriture) | `firestore.rules` |

Tests : `npm test`.

---

## 5. Structure

```
src/app/(tabs)/     Accueil, Réserver, Matchs, Classements, Mon équipe (entreprise), Profil
src/app/admin/      File FIFO, planning, matchs & console live (opérateur), championnat, actus, paramètres
src/domain/         logique métier (testée)
src/data/           Firebase / mode démo, services, authentification
src/ui/             composants, thème noir & or (theme.ts), logo (assets/logo.png)
scripts/            setup-firebase.mjs (installation + comptes de test)
firestore.rules     règles de sécurité
```

## 6. Publication

`npx eas-cli@latest build --platform android|ios --profile production`, puis `eas submit`. Le compte Apple Developer est payant ; Google Play demande un paiement unique.
