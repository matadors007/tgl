/**
 * Publie le site web Tunisia Golden League sur Firebase Hosting (gratuit) :
 *   https://<projet>.web.app
 * 1. export web de l'application (dossier dist/)
 * 2. déploiement Firebase Hosting (+ règles de sécurité)
 * 3. fonction serveur du rappel « feuille de match » (la veille de chaque match)
 * Usage : node scripts/deploy-site.mjs   (ou double-clic sur deployer-site.bat)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureProjectAccess } from './firebase-account.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(ROOT, '.env');
if (!fs.existsSync(envFile)) {
  console.error('✖ Fichier .env introuvable : lance d’abord setup-firebase.bat');
  process.exit(1);
}
const env = Object.fromEntries(
  fs
    .readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const project = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
if (!project) {
  console.error('✖ EXPO_PUBLIC_FIREBASE_PROJECT_ID manquant dans .env');
  process.exit(1);
}
const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, env: { ...process.env, EXPO_PUBLIC_SITE_URL: `https://${project}.web.app` } });
};
await ensureProjectAccess(project);
run('npx expo export -p web');
run(`npx -y firebase-tools@latest deploy --only hosting,firestore:rules --project ${project}`);
console.log(`\n✅ Site en ligne : https://${project}.web.app\n`);
