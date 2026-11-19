# Tunisia Golden League — Mise en ligne sur le VPS et dans les stores

## Ce qui change

Avant : site, base de données et comptes chez **Firebase** (Google).
Maintenant : tout est sur **votre serveur OVH**, dans 4 conteneurs Docker :

```
 Téléphones (Android / iPhone)          Navigateurs (site web)
            │  HTTPS + temps réel              │
            ▼                                  ▼
 ┌─────────────────────── VPS OVH (Ubuntu 24.04) ────────────────────────┐
 │  web     : Caddy — site web + certificat HTTPS automatique            │
 │            /api et /ws  ──►  api                                       │
 │  api     : Node.js — comptes, règles de sécurité, temps réel, e-mails │
 │  db      : PostgreSQL 16 — toutes les données (non exposée à Internet)│
 │  backup  : sauvegarde de la base chaque nuit à 03:30 (14 jours)       │
 └────────────────────────────────────────────────────────────────────────┘
 Notifications push : Expo → Google (Android, FCM) / Apple (iPhone, APNs)
```

L'application mobile parle directement au serveur (`https://votre-domaine/api`) : les scores en direct, les réservations, les validations apparaissent instantanément sur tous les téléphones.

**Firebase n'est plus utilisé pour les données ni les comptes.** On garde seulement le projet Firebase gratuit pour les notifications Android (FCM).

## Fichiers ajoutés

| Fichier | Rôle |
|---|---|
| `server/` | L'API (Node.js) : comptes, données, règles de sécurité, temps réel, e-mails |
| `deploy/docker-compose.yml` | Les 4 conteneurs |
| `deploy/web.Dockerfile`, `deploy/Caddyfile` | Compilation et service du site web, HTTPS |
| `deploy/.env.example` | Modèle de configuration du serveur (domaine, mots de passe) |
| `exporter-firebase.bat` | Exporte toutes les données de Firebase dans `export-firebase.json` |
| `envoyer-sur-serveur.bat` | Envoie l'application sur le VPS et (re)démarre tout |
| `importer-sur-serveur.bat` | Importe `export-firebase.json` dans la base du serveur |
| `admin-serveur.bat` | Utilisateurs, comptes admin, suppressions, journaux, sauvegardes |
| `configurer-domaine.bat` | Relie l'application mobile à votre serveur |
| `publier-stores.bat` | Compile pour Google Play (.aab), l'App Store, ou un APK de test |

## Étape 1 — Préparer (une seule fois)

1. **Nom de domaine** (ex. `tunisiagoldenleague.tn` chez un registrar tunisien, ou un `.com` chez OVH).
2. **Commander le VPS** OVH : VPS-2, **Ubuntu 24.04**, datacenter en Europe. OVH vous envoie par e-mail l'adresse IP, l'utilisateur (`ubuntu`) et le mot de passe. **Ne les envoyez à personne.**
3. **DNS** (chez le registrar du domaine) : créez deux enregistrements de type **A** :
   - `@` → IP du VPS
   - `www` → IP du VPS

   Attendez 10 min à quelques heures (propagation).
4. **Mot de passe d'application Gmail** pour l'adresse qui envoie les codes :
   compte Google → Sécurité → Validation en 2 étapes (activée) → **Mots de passe des applications** → créer « TGL serveur ». Notez les 16 lettres.

## Étape 2 — Exporter les données de Firebase

Double-cliquez sur **`exporter-firebase.bat`**. Il crée `export-firebase.json` (toutes les équipes, joueurs, matchs, réservations, comptes…). Firebase n'est pas modifié.

> Faites-le à un moment calme : ce qui sera saisi dans l'ancienne application **après** l'export ne sera pas repris.

## Étape 3 — Installer le serveur

Double-cliquez sur **`envoyer-sur-serveur.bat`**.

1. La 1re fois, il demande : IP du serveur, utilisateur (`ubuntu`), nom de domaine, adresse Gmail d'envoi. Ces réponses sont gardées dans `deploy\serveur.txt`.
2. Windows demande le **mot de passe du serveur** (deux fois) : tapez-le vous-même (rien ne s'affiche pendant la frappe, c'est normal).
3. L'éditeur `nano` s'ouvre sur la configuration : sur la ligne `SMTP_PASS=`, collez le **mot de passe d'application Gmail** (clic droit pour coller), puis **Ctrl+O**, **Entrée**, **Ctrl+X**.
4. Le serveur installe Docker, le pare-feu, puis compile et démarre tout (10 à 15 minutes la 1re fois).

Les mots de passe de la base et la clé secrète des connexions sont **générés automatiquement sur le serveur** (fichier `/opt/tgl/deploy/.env`, jamais sur votre PC).

## Étape 4 — Importer les données

Double-cliquez sur **`importer-sur-serveur.bat`**, puis confirmez avec `O`.

Ensuite, **supprimez `export-firebase.json` de votre PC** : il contient des données personnelles.

## Étape 5 — Vérifier le site

Ouvrez `https://votre-domaine`.

**Mots de passe** : Firebase ne permet pas d'exporter les mots de passe. À la **première connexion** de chaque compte, l'application affiche « Nouveau système : nous venons de t'envoyer un e-mail pour choisir un nouveau mot de passe ». La personne clique le lien reçu, choisit son mot de passe, puis se connecte. Rien d'autre à faire.

Pour vous (administrateur) : connectez-vous avec votre e-mail habituel et suivez l'e-mail reçu.

## Étape 6 — Application Android (Google Play)

1. **`configurer-domaine.bat`** → tapez votre domaine. L'application sera reliée à votre serveur.
2. **Notifications Android** (si pas encore fait) : dans la console Firebase, ajoutez l'application Android `tn.tunisiagoldenleague.app`, remplacez `google-services.json` dans le dossier, puis lancez `envoyer-cle-fcm.bat`.
3. **`publier-stores.bat`** :
   - choix **3** : APK de test à installer sur votre téléphone. Vérifiez la connexion, une réservation, une notification.
   - choix **1** : fichier **.aab** pour Google Play. Téléchargez-le depuis le lien affiché, puis dans la Play Console : *Tester et publier → Production (ou Test fermé) → Créer une release → importer le .aab*.

> Les anciens APK (reliés à Firebase) continuent à écrire dans Firebase : désinstallez-les et installez le nouveau.

## Étape 7 — iPhone (App Store), après validation du compte Apple

1. Compte Apple Developer validé (99 $/an).
2. **`publier-stores.bat`** → choix **2**. Connectez-vous avec votre identifiant Apple quand EAS le demande, et répondez **Y** (oui) pour qu'il crée les certificats et la clé de notifications (APNs).
3. La compilation est envoyée automatiquement dans **App Store Connect**. Complétez la fiche (captures, description, confidentialité : `https://votre-domaine/confidentialite`, suppression de compte : `https://votre-domaine/suppression-compte`), puis **Soumettre pour vérification**.

## Mettre à jour plus tard

- **Site web et serveur** : relancez `envoyer-sur-serveur.bat` (les données et la configuration sont conservées).
- **Application mobile** : `publier-stores.bat` (choix 1 et/ou 2), puis publiez la nouvelle version dans chaque store.

## Administration — `admin-serveur.bat`

1. Liste des utilisateurs → `utilisateurs.csv` (s'ouvre dans Excel)
2. Créer un compte administrateur (il choisit son mot de passe via « mot de passe oublié »)
3. Obliger un compte à choisir un nouveau mot de passe
4. Voir les demandes de suppression de compte
5. Supprimer les comptes qui l'ont demandé
6. État du serveur et derniers messages de l'API
7. Télécharger les sauvegardes de la base (dossier `sauvegardes`)

## Sauvegardes

- Chaque nuit à 03:30, la base est copiée dans `/opt/tgl/deploy/backups` sur le serveur (14 jours gardés). Le choix 7 de `admin-serveur.bat` les copie sur votre PC : faites-le régulièrement.
- Conseillé en plus : l'option **sauvegarde automatique** d'OVH (copie complète du VPS).
- Restauration (sur le serveur, base vide) :
  ```
  cd /opt/tgl/deploy
  gunzip -c backups/tgl-AAAA-MM-JJ_0330.sql.gz | sudo docker compose exec -T db psql -U tgl tgl
  ```

## Sécurité

- Ne partagez **jamais** : `deploy/.env` du serveur, `serviceAccount.json`, `export-firebase.json`, le mot de passe du VPS, le mot de passe d'application Gmail.
- La base n'est pas accessible depuis Internet (seuls les ports 22, 80 et 443 sont ouverts ; fail2ban bloque les attaques sur SSH).
- Les règles de sécurité de Firebase (qui peut lire / modifier quoi) ont été reprises à l'identique dans `server/src/rules.js`.

## Dépannage

| Problème | Solution |
|---|---|
| Le site ne s'ouvre pas en HTTPS | Les DNS ne pointent pas encore vers le VPS : attendez, puis `admin-serveur.bat` → 6 |
| Les codes d'activation n'arrivent pas | `SMTP_PASS` absent ou faux : relancez `envoyer-sur-serveur.bat` après avoir corrigé, ou sur le serveur `sudo nano /opt/tgl/deploy/.env` puis `cd /opt/tgl/deploy && sudo docker compose up -d` |
| « Connexion refusée » avec ssh | Vérifiez l'IP et l'utilisateur dans `deploy\serveur.txt` |
| Pas de notifications Android | `google-services.json` doit contenir `tn.tunisiagoldenleague.app` ; relancez `envoyer-cle-fcm.bat` puis recompilez |

Une erreur ? Copiez le message affiché (sans aucun mot de passe) et envoyez-le moi.
