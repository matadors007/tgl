/**
 * Relie l'application (mobile et web en local) au serveur de l'académie.
 *   node scripts/set-domain.mjs tunisiagoldenleague.tn   (ou configurer-domaine.bat)
 * Met à jour eas.json (compilations APK / AAB / iOS) et .env (lancement local).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const domain = String(process.argv[2] ?? '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
  console.error('✖ Nom de domaine invalide. Exemple : tunisiagoldenleague.tn');
  process.exit(1);
}
const url = `https://${domain}`;
const env = { EXPO_PUBLIC_API_URL: url, EXPO_PUBLIC_SITE_URL: url };

const easPath = path.join(ROOT, 'eas.json');
const eas = JSON.parse(fs.readFileSync(easPath, 'utf8'));
for (const p of ['development', 'preview', 'production']) if (eas.build?.[p]) eas.build[p].env = { ...(eas.build[p].env ?? {}), ...env };
fs.writeFileSync(easPath, JSON.stringify(eas, null, 2) + '\n');

const envPath = path.join(ROOT, '.env');
let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
for (const [k, v] of Object.entries(env)) {
  const re = new RegExp(`^${k}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text.replace(/\s*$/, '\n')}${k}=${v}\n`;
}
fs.writeFileSync(envPath, text.replace(/^\n/, ''));
console.log(`✅ Application reliée à ${url} (eas.json et .env mis à jour).`);
