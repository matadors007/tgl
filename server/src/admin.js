/**
 * Outils d'administration en ligne de commande (sur le VPS) :
 *   docker compose exec api node src/admin.js create-admin <email> <motdepasse> "<Nom>"
 *   docker compose exec api node src/admin.js users [--csv]
 *   docker compose exec api node src/admin.js set-password <email> <motdepasse>
 *   docker compose exec api node src/admin.js force-reset <email>
 *   docker compose exec api node src/admin.js delete-test-accounts [--yes]
 *   docker compose exec api node src/admin.js deletion-requests
 *   docker compose exec api node src/admin.js delete-requested --yes
 *   docker compose exec api node src/admin.js clear-teams --yes        (vide équipes, joueurs, matchs, événements)
 */
import bcrypt from 'bcryptjs';
import { deleteDoc, getDoc, migrate, pool, putDoc, queryDocs } from './db.js';
import { createAccount } from './auth.js';

const [cmd, ...args] = process.argv.slice(2);
const yes = args.includes('--yes');

async function allUsers() {
  const a = await pool.query('SELECT uid, email, email_verified, must_reset, created_at, last_login FROM accounts ORDER BY created_at');
  const profiles = new Map((await queryDocs(pool, 'users', [])).map((u) => [u.id, u]));
  return a.rows.map((r) => ({ ...r, profile: profiles.get(r.uid) ?? null }));
}

/** Supprime un compte et toutes ses données personnelles (comme scripts/delete-accounts.mjs). */
async function deleteUser(uid) {
  // Entreprise : fiches et pièces des joueurs supprimées, équipes gardées sans coordonnées
  for (const col of ['playerInfo', 'files']) for (const d of await queryDocs(pool, col, [['ownerId', uid]])) await deleteDoc(pool, col, d.id);
  for (const t of await queryDocs(pool, 'teams', [['ownerId', uid]])) await putDoc(pool, 'teams', t.id, { ...t, ownerId: null, managers: [], coach: null });
  for (const col of ['pushTokens', 'inbox']) for (const d of await queryDocs(pool, col, [['userId', uid]])) await deleteDoc(pool, col, d.id);
  await deleteDoc(pool, 'users', uid);
  await pool.query('DELETE FROM otp_codes WHERE uid = $1', [uid]);
  await pool.query('DELETE FROM reset_codes WHERE uid = $1', [uid]);
  await pool.query('DELETE FROM accounts WHERE uid = $1', [uid]);
}

await migrate();
switch (cmd) {
  case 'create-admin': {
    const [email, password, name = 'Administrateur'] = args;
    if (!email || !password) throw new Error('Usage : create-admin <email> <motdepasse> "<Nom>"');
    const uid = await createAccount(email, password, { verified: true });
    await putDoc(pool, 'users', uid, { id: uid, name, email: email.toLowerCase(), phone: '', role: 'admin', lang: 'fr', createdAt: Date.now() });
    console.log(`✔ Administrateur créé : ${email} (uid ${uid})`);
    break;
  }
  case 'set-password': {
    const [email, password] = args;
    if (!email || !password || password.length < 6) throw new Error('Usage : set-password <email> <motdepasse (6 caractères min.)>');
    const r = await pool.query('UPDATE accounts SET password_hash = $2, must_reset = false, token_version = token_version + 1 WHERE email = $1 RETURNING uid', [email.toLowerCase(), await bcrypt.hash(password, 10)]);
    console.log(r.rowCount ? `✔ Mot de passe changé pour ${email}` : `✖ Aucun compte ${email}`);
    break;
  }
  case 'delete-test-accounts': {
    // Comptes d'essai : @tga.tn (créés pendant le développement) et @demo.tn (données de démonstration)
    const isTest = (e) => /@(tga|demo)\.tn$/i.test(e);
    const list = await allUsers();
    const realAdmins = list.filter((u) => u.profile?.role === 'admin' && !isTest(u.email));
    const tests = list.filter((u) => isTest(u.email));
    if (!realAdmins.length) {
      console.log('✖ Aucun administrateur avec une vraie adresse : créez-le d’abord (admin-serveur.bat → 2), sinon plus personne ne pourra administrer.');
      break;
    }
    for (const u of tests) console.log(`  • ${u.email}  ${u.profile?.name ?? ''}`);
    if (!tests.length) console.log('Aucun compte de test.');
    else if (!yes) console.log(`\n${tests.length} compte(s) de test. Ajoutez --yes pour les supprimer définitivement.`);
    else {
      for (const u of tests) await deleteUser(u.uid);
      console.log(`✔ ${tests.length} compte(s) de test supprimé(s). Administrateur(s) conservé(s) : ${realAdmins.map((a) => a.email).join(', ')}`);
    }
    break;
  }
  case 'force-reset': {
    const [email] = args;
    const r = await pool.query('UPDATE accounts SET must_reset = true, token_version = token_version + 1 WHERE email = $1', [String(email ?? '').toLowerCase()]);
    console.log(r.rowCount ? `✔ ${email} : nouveau mot de passe demandé à la prochaine connexion` : `✖ Aucun compte ${email}`);
    break;
  }
  case 'users': {
    const list = await allUsers();
    if (args.includes('--csv')) {
      console.log('\ufeffemail;nom;role;email_confirme;entreprise;cree_le;derniere_connexion');
      for (const u of list)
        console.log([u.email, u.profile?.name ?? '', u.profile?.role ?? '', u.email_verified ? 'oui' : 'non', u.profile?.companyName ?? '', u.created_at?.toISOString?.() ?? '', u.last_login?.toISOString?.() ?? ''].join(';'));
    } else {
      for (const u of list) console.log(`${(u.profile?.role ?? '?').padEnd(9)} ${u.email.padEnd(36)} ${u.profile?.name ?? ''}${u.must_reset ? '  (nouveau mot de passe à choisir)' : ''}`);
      console.log(`\n${list.length} compte(s)`);
    }
    break;
  }
  case 'deletion-requests':
  case 'delete-requested': {
    const list = (await allUsers()).filter((u) => u.profile?.deletionRequestedAt);
    for (const u of list) console.log(`${u.email}  ${u.profile.name ?? ''}  demandé le ${new Date(u.profile.deletionRequestedAt).toLocaleString('fr-FR')}`);
    if (!list.length) console.log('Aucune demande de suppression.');
    if (cmd === 'delete-requested') {
      if (!yes) console.log('\nAjoutez --yes pour supprimer définitivement ces comptes.');
      else {
        for (const u of list) {
          if (['admin'].includes(u.profile?.role)) {
            console.log(`⚠ ${u.email} est administrateur : ignoré`);
            continue;
          }
          await deleteUser(u.uid);
          console.log(`✔ supprimé : ${u.email}`);
        }
      }
    }
    break;
  }
  case 'clear-teams': {
    if (!yes) {
      console.log('Ajoutez --yes pour vider équipes, joueurs, matchs, événements, fiches et fichiers des joueurs.');
      break;
    }
    // Les équipes entraînent leurs joueurs, fiches, pièces jointes, matchs et faits de match (clés étrangères en cascade)
    const r = await pool.query('DELETE FROM teams');
    await pool.query('DELETE FROM matches');
    await pool.query("DELETE FROM slots WHERE match_id IS NOT NULL");
    console.log(`✔ ${r.rowCount} équipe(s) supprimée(s), avec leurs joueurs et matchs`);
    break;
  }
  default:
    console.log('Commandes : create-admin, users [--csv], set-password, force-reset, delete-test-accounts [--yes], deletion-requests, delete-requested --yes, clear-teams --yes');
}
void getDoc;
await pool.end();
