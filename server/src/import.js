/**
 * Import de export-firebase.json (créé par scripts/export-firebase.mjs) dans PostgreSQL.
 *   docker compose run --rm -v ./export-firebase.json:/data/export.json api node src/import.js /data/export.json [--replace]
 *
 *  - Documents : rangés dans leurs tables, mêmes identifiants (les liens entre données restent valides).
 *  - Comptes : mêmes identifiants (uid), e-mail confirmé repris ; mot de passe à rechoisir
 *    (à la première connexion, un e-mail « nouveau mot de passe » est envoyé automatiquement).
 *  - Un document invalide n'est pas perdu : il est mis de côté dans la table documents (_rejete_…),
 *    une ligne dont la référence est cassée aussi (_orphelin_…). Le résumé s'affiche à la fin.
 *  --replace : vide d'abord les données existantes (les comptes de connexion sont gardés).
 *  --password=XXXX : (essai en local uniquement) même mot de passe pour tous les comptes importés.
 */
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { DATA_TABLES, cleanOrphans, loadDocs, migrate, pool, withTx } from './db.js';

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('Usage : node src/import.js <export-firebase.json> [--replace] [--password=XXXX]');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const pwArg = process.argv.find((a) => a.startsWith('--password='))?.slice(11);
const pwHash = pwArg ? await bcrypt.hash(pwArg, 10) : null;
await migrate();

await withTx(async (client) => {
  if (process.argv.includes('--replace')) {
    await client.query(`TRUNCATE ${DATA_TABLES.join(', ')}`);
    console.log('Données existantes supprimées (comptes gardés).');
  }
  // Comptes d'abord (les profils users y sont rattachés)
  let added = 0;
  let kept = 0;
  for (const a of data.accounts ?? []) {
    if (!a.email) continue;
    const r = await client.query(
      `INSERT INTO accounts (uid, email, password_hash, email_verified, disabled, must_reset, created_at)
       VALUES ($1, $2, $6, $3, $4, $7, COALESCE($5::timestamptz, now()))
       ON CONFLICT DO NOTHING`,
      [a.uid, a.email.toLowerCase(), !!a.emailVerified, !!a.disabled, a.createdAt ? new Date(a.createdAt).toISOString() : null, pwHash, !pwHash],
    );
    if (r.rowCount) added++;
    else kept++;
  }
  const entries = [];
  for (const [col, docs] of Object.entries(data.collections ?? {})) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(col)) {
      console.log(`  ⚠ collection ignorée : ${col}`);
      continue;
    }
    for (const d of docs) entries.push([col, d]);
  }
  const stats = await loadDocs(client, entries);
  const orphans = await cleanOrphans(client);

  console.log('\nImporté :');
  for (const [col, n] of Object.entries(stats.ok)) console.log(`  • ${col.padEnd(16)} ${n}`);
  console.log(`  • comptes          ${added} importé(s), ${kept} déjà présent(s)`);
  if (Object.keys(stats.rejected).length) {
    console.log('\n⚠ Mis de côté (valeur invalide) — table documents, col = _rejete_<collection> :');
    for (const [col, n] of Object.entries(stats.rejected)) console.log(`  • ${col.padEnd(16)} ${n}`);
  }
  if (Object.keys(orphans).length) {
    console.log('\n⚠ Références vers une donnée absente : référence vidée (ou ligne mise de côté dans documents, _orphelin_<table>) :');
    for (const [k, n] of Object.entries(orphans)) console.log(`  • ${k.padEnd(28)} ${n}`);
  }
});
console.log('\n✅ Import terminé. Pensez à supprimer export-firebase.json du serveur et de votre PC.');
await pool.end();
