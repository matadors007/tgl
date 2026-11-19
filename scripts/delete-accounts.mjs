/**
 * Tunisia Golden League — traite les demandes de suppression de compte.
 *   node scripts/delete-accounts.mjs            liste les demandes (rien n'est supprimé)
 *   node scripts/delete-accounts.mjs --delete   supprime les comptes demandés (après confirmation dans le .bat)
 * Supprimé : compte de connexion, profil, jetons de notification, boîte de notifications ;
 *            pour une entreprise : fiches privées des joueurs et pièces jointes.
 * Conservé : équipes, joueurs, résultats et statistiques (historique), réservations passées.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DELETE = process.argv.includes('--delete');
const keyPath = path.join(ROOT, 'serviceAccount.json');
if (!fs.existsSync(keyPath)) {
  console.error(`✖ Fichier introuvable : ${keyPath}`);
  process.exit(1);
}
const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const app = initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore(app);
const auth = getAuth(app);

const users = (await db.collection('users').get()).docs.filter((d) => d.get('deletionRequestedAt'));
if (!users.length) {
  console.log('\nAucune demande de suppression de compte.\n');
  process.exit(0);
}
console.log(`\n=== ${users.length} demande(s) de suppression ===`);
for (const u of users) console.log(`  • ${String(u.get('email') ?? '').padEnd(30)} ${u.get('name') ?? ''} (${u.get('role')}) — demandé le ${new Date(u.get('deletionRequestedAt')).toLocaleDateString('fr-FR')}`);
if (!DELETE) {
  console.log('\n(Liste seulement : rien n’a été supprimé.)\n');
  process.exit(0);
}

const delAll = async (snap) => {
  for (let i = 0; i < snap.docs.length; i += 300) {
    const b = db.batch();
    snap.docs.slice(i, i + 300).forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  return snap.size;
};
for (const u of users) {
  const uid = u.id;
  let detail = '';
  if (u.get('role') === 'company') {
    const infos = await delAll(await db.collection('playerInfo').where('ownerId', '==', uid).get());
    const files = await delAll(await db.collection('files').where('ownerId', '==', uid).get());
    const teams = await db.collection('teams').where('ownerId', '==', uid).get();
    for (const t of teams.docs) await t.ref.update({ ownerId: null, managers: [], coach: null });
    detail = ` · ${infos} fiche(s) joueur, ${files} pièce(s) jointe(s) supprimées · équipes gardées sans coordonnées`;
  }
  await delAll(await db.collection('pushTokens').where('userId', '==', uid).get());
  await delAll(await db.collection('inbox').where('userId', '==', uid).get());
  await u.ref.delete();
  await auth.deleteUser(uid).catch((e) => console.warn(`  (compte de connexion : ${e.message})`));
  console.log(`  ✔ ${u.get('email') ?? uid} supprimé${detail}`);
}
console.log('\n✅ Terminé.\n');
process.exit(0);
