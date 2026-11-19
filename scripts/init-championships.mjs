/**
 * Tunisia Golden League — repartir de zéro avec deux championnats :
 *   « Tunisia Golden League » et « Tunisia Silver League » (vides, inscriptions ouvertes).
 * Supprime TOUS les championnats existants avec leurs équipes, joueurs, pièces jointes, matchs et résultats.
 * Les comptes, terrains, réservations et paramètres sont conservés.
 *
 *   node scripts/init-championships.mjs      (ou double-clic sur initialiser-championnats.bat)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ok = (m) => console.log(`  ✔ ${m}`);

export const CHAMPIONSHIPS = [
  { id: 'champ-mixte', name: 'Tunisia Golden League', category: 'mixed' },
  { id: 'champ-35', name: 'Tunisia Silver League', category: 'over35' },
];

export function championshipDoc(c, createdAt) {
  return {
    id: c.id,
    name: c.name,
    category: c.category,
    status: 'registration',
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
    yellowLimit: 3,
    redBanMatches: 1,
    halfMinutes: 25,
    doubleRound: true,
    createdAt,
    active: true,
    startDate: null,
    rosterDeadline: null,
    rosterDeadlineAt: null,
  };
}

async function main() {
  const keyPath = path.join(ROOT, 'serviceAccount.json');
  if (!fs.existsSync(keyPath)) {
    console.error(`✖ Fichier introuvable : ${keyPath}`);
    process.exit(1);
  }
  const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const db = getFirestore(initializeApp({ credential: cert(sa), projectId: sa.project_id }));
  console.log(`\n=== Tunisia Golden League — deux championnats (projet ${sa.project_id}) ===\n`);

  const del = async (snap) => {
    for (let i = 0; i < snap.docs.length; i += 300) {
      const b = db.batch();
      snap.docs.slice(i, i + 300).forEach((d) => b.delete(d.ref));
      await b.commit();
    }
    return snap.size;
  };

  const seasons = await db.collection('seasons').get();
  let nT = 0;
  let nP = 0;
  let nM = 0;
  for (const s of seasons.docs) {
    const teams = await db.collection('teams').where('seasonId', '==', s.id).get();
    const teamIds = teams.docs.map((d) => d.id);
    for (let i = 0; i < teamIds.length; i += 10) await del(await db.collection('files').where('teamId', 'in', teamIds.slice(i, i + 10)).get());
    const players = await db.collection('players').where('seasonId', '==', s.id).get();
    for (const p of players.docs) await db.doc(`playerInfo/${p.id}`).delete().catch(() => {});
    nP += await del(players);
    nT += await del(teams);
    nM += await del(await db.collection('matches').where('seasonId', '==', s.id).get());
    await del(await db.collection('events').where('seasonId', '==', s.id).get());
  }
  await del(await db.collection('slots').where('reason', '==', 'championship').get());
  const n = await del(seasons);
  const companies = await db.collection('users').where('role', '==', 'company').get();
  for (const u of companies.docs) if (u.get('teamId')) await u.ref.update({ teamId: null });
  ok(`${n} ancien(s) championnat(s) supprimé(s) : ${nT} équipes, ${nP} joueurs, ${nM} matchs`);

  const now = Date.now();
  for (const [i, c] of CHAMPIONSHIPS.entries()) {
    await db.doc(`seasons/${c.id}`).set(championshipDoc(c, now + i));
    ok(`« ${c.name} » créé (inscriptions ouvertes)`);
  }
  console.log(`
✅ Terminé. Dans l'application : Administration > Championnats
   - réglez pour chacun la date de début et le dernier jour d'ajout des joueurs ;
   - les entreprises peuvent inscrire leur équipe dans l'un ou l'autre championnat.
`);
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('\n✖ Erreur :', e.message ?? e);
    process.exit(1);
  });
}
