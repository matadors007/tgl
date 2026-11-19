/**
 * Active l'envoi des codes OTP par e-mail :
 *  1. demande l'adresse d'envoi et choisit le serveur (Gmail, Outlook, autre)
 *  2. enregistre l'adresse et le mot de passe d'application comme SECRETS Firebase (jamais dans l'app)
 *  3. déploie les fonctions serveur + les règles de sécurité
 * Usage : node scripts/setup-otp.mjs   (ou double-clic sur activer-otp.bat)
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureProjectAccess } from './firebase-account.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const project = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
if (!project) throw new Error('EXPO_PUBLIC_FIREBASE_PROJECT_ID manquant dans .env');
const run = (cmd, cwd = ROOT) => execSync(cmd, { stdio: 'inherit', cwd });
const fb = `npx -y firebase-tools@latest`;

await ensureProjectAccess(project);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const email = (await rl.question('\nAdresse e-mail qui envoie les codes (ex. codes.tgl@gmail.com) : ')).trim();
const domain = email.split('@')[1]?.toLowerCase() ?? '';
let host = 'smtp.gmail.com';
let port = '465';
if (/(outlook|hotmail|live|msn)\./.test(domain)) {
  host = 'smtp.office365.com';
  port = '587';
} else if (!/gmail\.com$|googlemail\.com$/.test(domain)) {
  host = (await rl.question(`Serveur SMTP de ${domain} (ex. mail.${domain}) : `)).trim() || `mail.${domain}`;
  port = (await rl.question('Port SMTP (465 ou 587) [465] : ')).trim() || '465';
}
rl.close();
fs.writeFileSync(path.join(ROOT, 'functions', '.env'), `SMTP_HOST=${host}\nSMTP_PORT=${port}\n`);
console.log(`\n✔ Serveur d'envoi : ${host}:${port}`);

console.log('\n▶ Installation des dépendances des fonctions…');
run('npm install --no-audit --no-fund', path.join(ROOT, 'functions'));

console.log(`\n▶ Secret SMTP_USER : colle l'adresse ${email} puis Entrée`);
run(`${fb} functions:secrets:set SMTP_USER --project ${project}`);
console.log(`\n▶ Secret SMTP_PASS : colle le MOT DE PASSE D'APPLICATION (16 caractères pour Gmail) puis Entrée`);
run(`${fb} functions:secrets:set SMTP_PASS --project ${project}`);

console.log('\n▶ Déploiement des fonctions (2 à 5 minutes)…');
run(`${fb} deploy --only functions,firestore:rules --project ${project} --force`);
console.log('\n✅ Codes OTP actifs : chaque nouvel utilisateur particulier reçoit son code par e-mail.\n');
