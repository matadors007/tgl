# Sécurité — Tunisia Golden League

Dernier test automatique : **44 / 44 protections vérifiées** (`tester-securite.bat`).

## Ce qui protège l'application

| Domaine | Protection |
|---|---|
| Mots de passe | chiffrés (bcrypt), jamais lisibles, 6 caractères minimum |
| Connexion | jeton signé (HS256, clé secrète de 64 caractères générée sur le serveur), valable 60 jours, renouvelé à chaque ouverture |
| Changement de mot de passe | déconnecte tous les autres appareils (anciens jetons refusés) |
| Robots | 10 échecs de connexion en 15 min → blocage ; 600 requêtes / min / adresse IP maximum ; codes à 6 chiffres limités à 5 essais |
| Comptes | même réponse et même durée pour un e-mail existant ou non (on ne devine pas qui est inscrit) |
| Droits | chaque lecture et chaque écriture passent par les règles du serveur (`server/src/rules.js`) : un client ne voit que ses réservations, une entreprise que ses joueurs, un opérateur ne gère que les matchs… |
| Notifications | envoyées par le serveur ; les jetons des téléphones et la clé WhatsApp ne sont jamais envoyés aux applications ; envois limités par compte |
| Base de données | requêtes paramétrées (pas d'injection SQL), contraintes (valeurs et liens vérifiés), documents limités à 1,5 Mo, base non accessible depuis Internet |
| Réservations | verrou par créneau : deux clients ne peuvent pas obtenir le même créneau |
| Serveur | HTTPS obligatoire (HSTS), pare-feu (ports 22, 80, 443), fail2ban, en-têtes anti-« clickjacking », mises à jour de sécurité automatiques d'Ubuntu |
| Secrets | `.env` du serveur lisible par root seulement ; clés et exports exclus des images Docker et des envois |
| Sauvegardes | base copiée chaque nuit, 14 jours gardés |

## Corrigé lors de l'audit

1. **Clé WhatsApp** : elle était lisible par tout compte connecté. Elle est maintenant réservée à l'administration, et les messages partent du serveur.
2. **Jetons des téléphones** : tout compte connecté pouvait lire ceux du personnel, et donc leur envoyer des notifications. Ils ne sont plus lisibles, et les notifications partent du serveur après contrôle.
3. **Gestion du championnat** : elle pouvait modifier n'importe quel champ d'un compte, y compris son rôle. Elle ne peut plus que rattacher un compte entreprise à son équipe.
4. **Opérateur** : il pouvait modifier ou supprimer des joueurs. Il ne gère plus que les matchs et les feuilles de match.
5. **Changement de mot de passe** : il ne déconnectait pas les autres appareils. C'est corrigé.
6. **E-mails « nouveau mot de passe »** : on pouvait les envoyer en boucle. Ils sont limités à un par minute et par compte.
7. **Bibliothèque d'envoi d'e-mails** (nodemailer) : elle avait des failles connues. Elle est mise à jour (0 vulnérabilité connue).

## À faire avant l'ouverture au public (outils prêts)

| Action | Comment |
|---|---|
| Supprimer les comptes de test (`@tga.tn`, `@demo.tn`) | créer d'abord votre vrai compte administrateur (`admin-serveur.bat` → 2), puis `admin-serveur.bat` → 8. L'outil refuse s'il n'existe pas d'autre administrateur. |
| Notifications envoyées uniquement par votre serveur | expo.dev → *Access tokens* → créer un jeton, puis `admin-serveur.bat` → 9. Activer ensuite **Enhanced Security for Push Notifications** dans le projet Expo. |
| Connexion au serveur par clé SSH, mot de passe interdit | `securiser-ssh.bat`. Il crée la clé, l'installe, vérifie qu'elle marche, puis coupe le mot de passe après votre confirmation. Gardez une copie de `%USERPROFILE%\.ssh`. |
| Sauvegardes hors du serveur | `sauvegarde-auto.bat` (après `securiser-ssh.bat`) : copie quotidienne à 13:00 dans le dossier `sauvegardes` de ce PC, 60 jours gardés. Activer aussi la sauvegarde OVH. |
| Vérifier après chaque modification importante | `tester-securite.bat` (essai local) |
