/**
 * Tunisia Golden League — renomme les deux championnats sans toucher aux équipes ni aux matchs :
 *   mixte → « Tunisia Golden League » · +35 → « Tunisia Silver League ».
 *   node scripts/rename-championships.mjs   (ou double-clic sur renommer-championnats.bat)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { CHAMPIONSHIPS } from './init-championships.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keyPath = path.join(ROOT, 'serviceAccount.json');
if (!fs.existsSync(keyPath)) {
  console.error(`✖ Fichier introuvable : ${keyPath}`);
  process.exit(1);
}
const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: sa.project_id }));
const seasons = await db.collection('seasons').get();
let n = 0;
for (const d of seasons.docs) {
  if (d.get('kind') === 'cup') continue;
  const c = CHAMPIONSHIPS.find((x) => x.category === (d.get('category') ?? 'mixed'));
  if (!c || d.get('name') === c.name) continue;
  await d.ref.update({ name: c.name });
  console.log(`  ✔ « ${d.get('name')} » → « ${c.name} »`);
  n++;
}
console.log(n ? `\n✅ ${n} championnat(s) renommé(s).\n` : '\nRien à renommer : les noms sont déjà à jour.\n');
process.exit(0);
