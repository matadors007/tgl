/**
 * Tunisia Golden League — export complet de Firebase avant le passage au serveur (VPS).
 *   node scripts/export-firebase.mjs   (ou double-clic sur exporter-firebase.bat)
 *
 * Crée export-firebase.json : toutes les collections Firestore + la liste des comptes de connexion
 * (e-mail, e-mail confirmé, désactivé). Les mots de passe ne peuvent pas être exportés :
 * à la première connexion sur le nouveau système, chacun reçoit un e-mail pour en choisir un nouveau.
 *
 * Lecture seule : rien n'est modifié dans Firebase.
 * ⚠ Ce fichier contient des données personnelles : ne le partagez pas, supprimez-le après l'import.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, GeoPoint, DocumentReference } from 'firebase-admin/firestore';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keyPath = path.join(ROOT, 'serviceAccount.json');
if (!fs.existsSync(keyPath)) {
  console.error(`✖ Fichier introuvable : ${keyPath}`);
  process.exit(1);
}
const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const app = initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore(app);
const auth = getAuth(app);

/** Valeurs Firestore → JSON simple (dates en millisecondes). */
function plain(v) {
  if (v instanceof Timestamp) return v.toMillis();
  if (v instanceof GeoPoint) return { latitude: v.latitude, longitude: v.longitude };
  if (v instanceof DocumentReference) return v.path;
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

const out = { exportedAt: Date.now(), projectId: sa.project_id, collections: {}, accounts: [] };
console.log(`\nExport du projet ${sa.project_id}…`);
for (const ref of await db.listCollections()) {
  const snap = await ref.get();
  out.collections[ref.id] = snap.docs.map((d) => ({ ...plain(d.data()), id: d.id }));
  console.log(`  • ${ref.id.padEnd(16)} ${snap.size} document(s)`);
}
let token;
do {
  const page = await auth.listUsers(1000, token);
  for (const u of page.users)
    out.accounts.push({ uid: u.uid, email: u.email ?? null, emailVerified: u.emailVerified, disabled: u.disabled, createdAt: u.metadata.creationTime });
  token = page.pageToken;
} while (token);
console.log(`  • comptes          ${out.accounts.length}`);

const file = path.join(ROOT, 'export-firebase.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log(`\n✅ ${file} (${(fs.statSync(file).size / 1e6).toFixed(1)} Mo)`);
console.log('   Copiez-le sur le serveur puis lancez l’import (voir DEPLOIEMENT-VPS.md).\n');
process.exit(0);
