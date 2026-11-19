/**
 * Tunisia Golden League — liste des utilisateurs (comptes de connexion + profils).
 *   node scripts/list-users.mjs      (ou double-clic sur lister-utilisateurs.bat)
 * Affiche la liste à l'écran et l'enregistre dans utilisateurs.csv (ouvrable dans Excel).
 * Lecture seule : rien n'est modifié.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROLE = { admin: 'Administrateur', agent: 'Agent', operator: 'Opérateur', company: 'Entreprise', user: 'Particulier' };

const keyPath = path.join(ROOT, 'serviceAccount.json');
if (!fs.existsSync(keyPath)) {
  console.error(`✖ Fichier introuvable : ${keyPath}`);
  process.exit(1);
}
const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const app = initializeApp({ credential: cert(sa), projectId: sa.project_id });
const auth = getAuth(app);
const db = getFirestore(app);

const accounts = [];
let token;
do {
  const page = await auth.listUsers(1000, token);
  accounts.push(...page.users);
  token = page.pageToken;
} while (token);
const profiles = new Map((await db.collection('users').get()).docs.map((d) => [d.id, d.data()]));
const teams = new Map((await db.collection('teams').get()).docs.map((d) => [d.id, d.data()]));

const rows = accounts.map((a) => {
  const p = profiles.get(a.uid) ?? {};
  const owned = [...teams.values()].filter((t) => t.ownerId === a.uid).map((t) => t.name);
  return {
    role: ROLE[p.role] ?? (p.role || '—'),
    name: p.name || a.displayName || '',
    email: a.email || '',
    phone: p.phone || a.phoneNumber || '',
    teams: owned.join(' / '),
    verified: a.emailVerified ? 'oui' : 'non',
    disabled: a.disabled ? 'oui' : 'non',
    created: a.metadata.creationTime ? new Date(a.metadata.creationTime).toLocaleDateString('fr-FR') : '',
    last: a.metadata.lastSignInTime ? new Date(a.metadata.lastSignInTime).toLocaleDateString('fr-FR') : 'jamais',
  };
});
const order = ['Administrateur', 'Agent', 'Opérateur', 'Entreprise', 'Particulier'];
rows.sort((x, y) => (order.indexOf(x.role) + 1 || 99) - (order.indexOf(y.role) + 1 || 99) || x.email.localeCompare(y.email));

console.log(`\n=== Utilisateurs du projet ${sa.project_id} : ${rows.length} compte(s) ===`);
for (const r of order.concat(['—'])) {
  const list = rows.filter((x) => x.role === r || (r === '—' && !order.includes(x.role)));
  if (!list.length) continue;
  console.log(`\n${r} (${list.length})`);
  for (const x of list) console.log(`  ${x.email.padEnd(30)} ${x.name.padEnd(32)} ${x.phone.padEnd(18)} ${x.teams}${x.disabled === 'oui' ? '  [désactivé]' : ''}`);
}

const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
const csv = ['Rôle;Nom;E-mail;Téléphone;Équipes;E-mail vérifié;Désactivé;Créé le;Dernière connexion']
  .concat(rows.map((r) => [r.role, r.name, r.email, r.phone, r.teams, r.verified, r.disabled, r.created, r.last].map(esc).join(';')))
  .join('\r\n');
fs.writeFileSync(path.join(ROOT, 'utilisateurs.csv'), '﻿' + csv, 'utf8');
console.log(`\n✅ Liste enregistrée dans utilisateurs.csv (dossier GFL), ouvrable dans Excel.\n`);
process.exit(0);
