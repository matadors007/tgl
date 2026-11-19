# Essai sur le PC avec Podman Desktop

Le même système que sur le VPS (site, API, base de données), mais sur votre PC, sans domaine ni HTTPS, plus **Adminer** pour consulter la base.

## 1. Installer (une seule fois)

1. Installez **Podman Desktop** : https://podman-desktop.io
2. Au premier lancement, laissez-le créer et démarrer la **machine Podman** (bouton *Start*).
3. Dans Podman Desktop : **Paramètres → Ressources → Compose → Installer** (ajoute la commande `podman compose`).

## 2. Lancer

Double-cliquez sur **`lancer-local.bat`**.

- La 1re fois, la construction prend 10 à 20 minutes (téléchargement des images et compilation du site).
- À la question « Données », choisissez **2** pour charger les données de démonstration.
- Le site et Adminer s'ouvrent dans le navigateur.

| Adresse | Contenu |
|---|---|
| http://localhost:8080 | Site / application web (comme sur le futur domaine) |
| http://localhost:8081 | Adminer : consultation de la base |
| localhost:5432 | La base, pour DBeaver ou pgAdmin si vous préférez |

**Comptes de démonstration** (mot de passe `Test1234`, essai local uniquement) :
`admin@demo.tn`, `agent@demo.tn`, `op@demo.tn` (opérateur), `company@demo.tn` (entreprise), `user@demo.tn` (particulier).

Les e-mails ne partent pas en local : les **codes d'activation** et les **liens « mot de passe oublié »** s'affichent dans **`journaux-local.bat`**.

Les conteneurs sont aussi visibles dans Podman Desktop (onglet *Containers*, groupe `tgl-local`) avec leurs journaux.

Pour arrêter, lancez **`arreter-local.bat`**. Le choix 2 efface aussi la base locale.

## 3. Comment le système fonctionne

```
Navigateur / téléphone
   │  http://localhost:8080
   ▼
web (Caddy) ──── /           → fichiers du site (application Expo compilée)
   │       ├──── /api/...    → api   (lecture, écriture, connexion)
   │       └──── /ws         → api   (temps réel)
   ▼
api (Node.js) ── vérifie qui vous êtes (jeton de connexion) et les règles de sécurité
   ▼
db (PostgreSQL)
```

1. **Connexion** : l'application envoie e-mail et mot de passe à `/api/auth/login`. Le serveur compare au mot de passe chiffré (table `accounts`) et renvoie un **jeton** valable 30 jours, renouvelé à chaque ouverture.
2. **Lecture en temps réel** : l'application ouvre une seule connexion WebSocket (`/ws`) et s'abonne aux données dont l'écran a besoin, par exemple « les matchs du championnat Golden League ». Le serveur envoie la liste, puis la renvoie à chaque changement.
3. **Écriture** : un but, une réservation ou une validation passe par `/api/db/commit`. Le serveur :
   - verrouille les documents concernés (deux personnes ne peuvent pas prendre le même créneau) ;
   - applique les **règles de sécurité** (`server/src/rules.js`) : un particulier ne peut pas valider une réservation, une entreprise ne modifie que ses propres joueurs, etc. ;
   - enregistre, puis prévient en moins d'une seconde tous les écrans abonnés.
4. **Notifications push** : envoyées par l'application via Expo vers les téléphones. Elles ne fonctionnent que dans l'APK, pas sur le web.

## 4. Consulter la base (Adminer, http://localhost:8081)

Connexion :

| Champ | Valeur |
|---|---|
| Système | PostgreSQL |
| Serveur | `db` |
| Utilisateur | `tgl` |
| Mot de passe | `tgl_local` |
| Base de données | `tgl` |

### Les tables

Une table par élément de l'application : `users`, `teams`, `players`, `matches`, `match_events`, `bookings`, `pitches`, `seasons`… Le plan complet, le diagramme de classes et les règles sont dans **`docs/base-de-donnees/README.md`**.

### Les vues lisibles (lecture seule)

`v_utilisateurs` · `v_championnats` · `v_equipes` · `v_joueurs` · `v_matchs` · `v_evenements` · `v_buteurs` · `v_reservations`

Dans Adminer, cliquez sur une vue, puis sur **Afficher les données**.

### Requêtes utiles

Dans Adminer, menu **Requête SQL** :

```sql
-- Matchs terminés du championnat Golden League
SELECT journee, date, domicile, buts_dom, buts_ext, exterieur
FROM v_matchs WHERE championnat = 'Tunisia Golden League' AND statut = 'finished'
ORDER BY journee;

-- Meilleurs buteurs
SELECT * FROM v_buteurs ORDER BY buts DESC LIMIT 10;

-- Réservations en attente
SELECT * FROM v_reservations WHERE statut = 'pending' ORDER BY date, debut;

-- Joueurs d'une équipe
SELECT numero, joueur, poste, statut, licence FROM v_joueurs WHERE equipe = 'Atlas Tech FC' ORDER BY numero;

-- Feuille de match complète d'un match
SELECT jsonb_pretty(sheet) FROM matches WHERE id = 'm1_1';

-- Derniers changements
SELECT id, name, row_version, row_updated_at FROM teams ORDER BY row_updated_at DESC LIMIT 20;
```

> Vous pouvez tout regarder librement. Pour **modifier**, passez par l'application : une modification directe dans la base contourne les règles de sécurité et les calculs (classements, licences…).

## Dépannage

| Problème | Solution |
|---|---|
| `podman compose` inconnu | Podman Desktop → Paramètres → Ressources → Compose → Installer |
| « La machine Podman n'est pas démarrée » | Podman Desktop → bouton *Start* |
| Port 8080, 8081 ou 5432 déjà utilisé | Fermez l'autre programme (ex. un PostgreSQL installé sur le PC), ou changez le premier nombre dans `deploy/docker-compose.local.yml` (ex. `"5433:5432"`) |
| Page blanche sur http://localhost:8080 | Attendez la fin de la construction, puis rechargez la page. Sinon : `journaux-local.bat` |
| Après une modification du code | Relancez `lancer-local.bat` (choix 1 : les données sont gardées) |
