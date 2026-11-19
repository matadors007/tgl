/**
 * Vérifie que le compte Google connecté à l'outil Firebase a bien accès au projet.
 * Sinon : affiche le compte utilisé et propose de se reconnecter avec le bon compte.
 */
import { execSync } from 'node:child_process';
import readline from 'node:readline/promises';

export const FB = 'npx -y firebase-tools@latest';

function quiet(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return String(e.stdout ?? '') + String(e.stderr ?? '');
  }
}

function currentAccount() {
  // Compte actif = celui défini par login:use, sinon le compte principal
  const used = quiet(`${FB} login:use --json`).match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  if (used) return used;
  const out = quiet(`${FB} login:list`);
  return out.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;
}

function hasProject(project) {
  const out = quiet(`${FB} projects:list --json`);
  try {
    const list = JSON.parse(out.slice(out.indexOf('{'))).result ?? [];
    return list.some((p) => p.projectId === project);
  } catch {
    return out.includes(project);
  }
}

export async function ensureProjectAccess(project) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const account = currentAccount();
    console.log(`\nCompte Google utilisé par Firebase : ${account ?? '(aucun)'}`);
    if (account && hasProject(project)) {
      console.log(`✔ Accès au projet « ${project} » confirmé.`);
      return;
    }
    console.log(`
✖ Ce compte n'a pas accès au projet « ${project} ».
  Il faut utiliser le compte Google avec lequel tu ouvres la console Firebase
  (https://console.firebase.google.com) et où tu vois le projet « ${project} ».
  Autre solution : dans la console, Paramètres du projet > Utilisateurs et autorisations >
  Ajouter un membre (rôle Propriétaire) avec l'adresse ${account ?? 'de ce compte'}.`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = (await rl.question('\nSe reconnecter maintenant avec le bon compte Google ? (O/N) : ')).trim().toLowerCase();
    rl.close();
    if (!ans.startsWith('o') && !ans.startsWith('y')) process.exit(1);
    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
    const email = (await rl2.question('Adresse du compte Google qui possède le projet : ')).trim();
    rl2.close();
    if (!email) process.exit(1);
    // Page Google pré-remplie avec CETTE adresse, puis ce compte devient celui utilisé par défaut
    try {
      execSync(`${FB} login:add ${email}`, { stdio: 'inherit' });
    } catch {
      /* déjà ajouté */
    }
    quiet(`${FB} login:use ${email}`); // « Already using » n'est pas une erreur
  }
  console.log('\n✖ Toujours pas d’accès au projet. Vérifie le compte dans la console Firebase puis relance.');
  process.exit(1);
}
