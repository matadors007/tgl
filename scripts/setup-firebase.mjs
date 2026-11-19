/**
 * Tunisia Golden League — installation Firebase en une commande.
 *
 *   node scripts/setup-firebase.mjs            (ou double-clic sur setup-firebase.bat)
 *   node scripts/setup-firebase.mjs --reset    (recrée le championnat de test)
 *   node scripts/setup-firebase.mjs --update   (règles + mise à jour des données existantes)
 *
 * Prérequis : le fichier serviceAccount.json (clé du compte de service Firebase) à la racine du projet.
 *
 * Ce script :
 *  1. active la connexion e-mail / mot de passe (si les droits le permettent) ;
 *  2. crée la base Firestore si elle n'existe pas (si les droits le permettent) ;
 *  3. déploie les règles de sécurité (firestore.rules) ;
 *  4. écrit le fichier .env avec la configuration de l'application web Firebase (créée au besoin) ;
 *  5. crée les comptes de test : administrateur, opérateur, joueur, 8 entreprises ;
 *  6. crée les paramètres, 3 terrains, la saison, 8 équipes de 10 joueurs et le calendrier aller-retour.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getSecurityRules } from 'firebase-admin/security-rules';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESET = process.argv.includes('--reset');
const NOTIF_ONLY = process.argv.includes('--notifications-only');
const UPDATE_ONLY = process.argv.includes('--update');
const RESET_SEASON = process.argv.includes('--reset-season');
const ANDROID_PACKAGE = 'tn.tunisiagoldenacademy.app';

// ─────────────── Comptes de test (modifiable) ───────────────
/** Mot de passe commun à tous les comptes de test (phase de test uniquement). */
export const TEST_PASSWORD = 'Test1234';
export const ACCOUNTS = [
  { email: 'admin@tga.tn', password: TEST_PASSWORD, name: 'Administrateur TGL', phone: '+216 20 000 001', role: 'admin' },
  { email: 'operateur@tga.tn', password: TEST_PASSWORD, name: 'Opérateur de match', phone: '+216 20 000 002', role: 'operator' },
  { email: 'agent@tga.tn', password: TEST_PASSWORD, name: 'Agent d’accueil', phone: '+216 20 000 004', role: 'agent' },
  { email: 'joueur@tga.tn', password: TEST_PASSWORD, name: 'Utilisateur Test', phone: '+216 20 000 003', role: 'user' },
];
const COMPANY_PASSWORD = TEST_PASSWORD;
const COMPANIES = [
  ['atlas', 'Atlas Tech FC', 'Atlas Tech', 'ATL', '#3B82F6'],
  ['carthage', 'Carthage Consulting', 'Carthage Consulting', 'CAR', '#EF4444'],
  ['medina', 'Medina Soft', 'Medina Soft', 'MED', '#10B981'],
  ['sahel', 'Sahel Logistics', 'Sahel Logistics', 'SAH', '#F59E0B'],
  ['jasmin', 'Jasmin Assurances', 'Jasmin Assurances', 'JAS', '#A855F7'],
  ['olivier', 'Olivier Industries', 'Olivier Industries', 'OLI', '#84CC16'],
  ['byrsa', 'Byrsa Digital', 'Byrsa Digital', 'BYR', '#06B6D4'],
  ['djerba', 'Djerba Energie', 'Djerba Energie', 'DJE', '#F97316'],
];
const SEASON_ID = 'season-2026';

// ─────────────── Utilitaires ───────────────
const ok = (m) => console.log(`  ✔ ${m}`);
const warn = (m) => console.log(`  ⚠ ${m}`);
const step = (m) => console.log(`\n▶ ${m}`);
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (k, n) => {
  const [y, m, d] = k.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n));
};
const hhmm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const slotId = (pitchId, date, start) => `${pitchId}_${date}_${start.replace(':', '')}`;

/** Round-robin (méthode du cercle) — identique à src/domain/model.ts */
function roundRobin(ids, doubleRound) {
  const list = [...ids];
  if (list.length % 2) list.push('__bye__');
  const n = list.length;
  const rounds = [];
  let rot = list.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const circle = [list[0], ...rot];
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = circle[i];
      const b = circle[n - 1 - i];
      if (a === '__bye__' || b === '__bye__') continue;
      pairs.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)];
  }
  return doubleRound ? [...rounds, ...rounds.map((p) => p.map(([a, b]) => [b, a]))] : rounds;
}

async function api(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`${res.status} ${json?.error?.message ?? text.slice(0, 200)}`);
  return json;
}

/** Enregistre l'app Android dans Firebase et écrit google-services.json (notifications Android). */
async function androidConfig(token, projectId) {
  step('Fichier google-services.json (notifications Android)');
  try {
    const base = `https://firebase.googleapis.com/v1beta1/projects/${projectId}/androidApps`;
    let apps = (await api(token, 'GET', base)).apps ?? [];
    let app = apps.find((a) => a.packageName === ANDROID_PACKAGE);
    if (!app) {
      const op = await api(token, 'POST', base, { packageName: ANDROID_PACKAGE, displayName: 'Tunisia Golden League' });
      for (let i = 0; i < 15 && !op.done; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        Object.assign(op, await api(token, 'GET', `https://firebase.googleapis.com/v1beta1/${op.name}`));
      }
      apps = (await api(token, 'GET', base)).apps ?? [];
      app = apps.find((a) => a.packageName === ANDROID_PACKAGE);
    }
    const cfg = await api(token, 'GET', `${base}/${app.appId}/config`);
    fs.writeFileSync(path.join(ROOT, 'google-services.json'), Buffer.from(cfg.configFileContents, 'base64'));
    ok('google-services.json écrit');
  } catch (e) {
    warn(`Récupération impossible (${e.message}).
    → Console Firebase > Paramètres du projet > Vos applications > Ajouter une application Android
      (nom du package : ${ANDROID_PACKAGE}), télécharge google-services.json et place-le dans ce dossier.`);
  }
}

// ─────────────── Main ───────────────
/**
 * Mise à jour des données existantes (sans rien effacer) :
 *  - heure prévue (plannedAt) sur chaque match : sert au délai de sélection de 12 h
 *  - propriétaire (ownerId) des équipes : le compte entreprise rattaché à l'équipe
 */
async function migrate(db) {
  step('Mise à jour des données (sélection 12 h, comptes entreprise)');
  const matches = await db.collection('matches').get();
  let n = 0;
  for (let i = 0; i < matches.docs.length; i += 400) {
    const b = db.batch();
    for (const d of matches.docs.slice(i, i + 400)) {
      const m = d.data();
      if (!m.date || !m.start) continue;
      const [y, mo, da] = m.date.split('-').map(Number);
      const [h, mi] = m.start.split(':').map(Number);
      const plannedAt = new Date(y, mo - 1, da, h, mi).getTime();
      if (m.plannedAt !== plannedAt) {
        b.update(d.ref, { plannedAt });
        n++;
      }
    }
    await b.commit();
  }
  ok(`${n} match(s) mis à jour`);
  const companies = await db.collection('users').where('role', '==', 'company').get();
  let t = 0;
  for (const u of companies.docs) {
    const teamId = u.get('teamId');
    if (!teamId) continue;
    const ref = db.doc(`teams/${teamId}`);
    const team = await ref.get();
    if (team.exists && !team.get('ownerId')) {
      await ref.update({ ownerId: u.id, approved: true });
      t++;
    }
  }
  ok(`${t} équipe(s) reliée(s) à leur compte entreprise`);
  // Numéros de licence pour les joueurs déjà validés qui n'en ont pas
  const teams = await db.collection('teams').get();
  const year = String(new Date().getFullYear()).slice(-2);
  let l = 0;
  for (const tm of teams.docs) {
    if (tm.get('approved') === false) continue;
    const ps = (await db.collection('players').where('teamId', '==', tm.id).get()).docs;
    let next = ps.filter((p) => p.get('licenseNo')).length;
    const abr = String(tm.get('shortName') || 'TGL').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3).padEnd(3, 'X');
    for (const p of ps.sort((a, b) => String(a.get('name')).localeCompare(String(b.get('name'))))) {
      const st = p.get('status');
      if (p.get('licenseNo') || (st && st !== 'approved')) continue;
      await p.ref.update({ licenseNo: `TGL-${year}-${abr}-${String(++next).padStart(3, '0')}` });
      l++;
    }
  }
  ok(`${l} numéro(s) de licence attribué(s)`);
}

/**
 * Phase de test : met le mot de passe Test1234 sur TOUS les comptes du projet
 * (et confirme l'e-mail des comptes de test @tga.tn). À ne plus utiliser après l'ouverture au public.
 */
async function setTestPasswords(auth) {
  step(`Mot de passe « ${TEST_PASSWORD} » pour tous les comptes`);
  let n = 0;
  let token;
  do {
    const page = await auth.listUsers(1000, token);
    for (const u of page.users) {
      const isTest = (u.email ?? '').endsWith('@tga.tn');
      await auth.updateUser(u.uid, { password: TEST_PASSWORD, ...(isTest ? { emailVerified: true } : {}) });
      n++;
    }
    token = page.pageToken;
  } while (token);
  ok(`${n} compte(s) mis à jour`);
}

/** Lien des e-mails (mot de passe oublié, confirmation) vers la page /auth-action du site. */
async function setEmailActionUrl(token, projectId) {
  step('Lien des e-mails (mot de passe oublié, confirmation)');
  const url = `https://${projectId}.web.app/auth-action`;
  try {
    await api(token, 'PATCH', `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=notification.sendEmail.callbackUri`, {
      notification: { sendEmail: { callbackUri: url } },
    });
    ok(`URL d'action : ${url}`);
  } catch (e) {
    warn(`Réglage automatique impossible (${e.message}).
    → Console Firebase > Authentication > Modèles > (crayon) > Personnaliser l'URL d'action : ${url}`);
  }
}

/** Réinitialise la saison active : plus d'équipes, de joueurs ni de matchs ; inscriptions rouvertes. */
async function resetSeason(db) {
  step('Réinitialisation de la saison');
  const seasons = await db.collection('seasons').where('active', '==', true).get();
  const season = seasons.docs[0];
  if (!season) return warn('Aucune saison active.');
  const del = async (snap) => {
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = db.batch();
      snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
      await b.commit();
    }
    return snap.size;
  };
  const teams = await db.collection('teams').where('seasonId', '==', season.id).get();
  const teamIds = new Set(teams.docs.map((d) => d.id));
  const players = await db.collection('players').where('seasonId', '==', season.id).get();
  for (const p of players.docs) await db.doc(`playerInfo/${p.id}`).delete().catch(() => {});
  const nP = await del(players);
  const nT = await del(teams);
  const nM = await del(await db.collection('matches').where('seasonId', '==', season.id).get());
  await del(await db.collection('events').where('seasonId', '==', season.id).get());
  await del(await db.collection('slots').where('reason', '==', 'championship').get());
  const companies = await db.collection('users').where('role', '==', 'company').get();
  for (const u of companies.docs) if (teamIds.has(u.get('teamId'))) await u.ref.update({ teamId: null });
  await season.ref.update({ status: 'registration' });
  ok(`« ${season.get('name')} » : ${nM} matchs, ${nT} équipes, ${nP} joueurs supprimés — inscriptions ouvertes`);
}

async function main() {
  console.log('\n=== Tunisia Golden League — installation Firebase ===');
  const keyPath = path.join(ROOT, 'serviceAccount.json');
  if (!fs.existsSync(keyPath)) {
    console.error(`\n✖ Fichier introuvable : ${keyPath}
  Console Firebase > Paramètres du projet > Comptes de service > "Générer une nouvelle clé privée",
  puis enregistre le fichier sous le nom serviceAccount.json dans le dossier du projet.`);
    process.exit(1);
  }
  const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const projectId = sa.project_id;
  const credential = cert(sa);
  const app = initializeApp({ credential, projectId });
  const token = (await credential.getAccessToken()).access_token;
  console.log(`Projet : ${projectId}`);

  if (RESET_SEASON) {
    await resetSeason(getFirestore(app));
    console.log('\n✅ Saison réinitialisée. Les entreprises peuvent inscrire leur équipe depuis l\'app.\n');
    process.exit(0);
  }

  if (UPDATE_ONLY) {
    step('Mise à jour des règles de sécurité');
    try {
      await getSecurityRules(app).releaseFirestoreRulesetFromSource(fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8'));
      ok('Règles déployées');
    } catch (e) {
      warn(`Échec du déploiement des règles : ${e.message}
    → Copie le contenu de firestore.rules dans Console Firebase > Firestore Database > Règles > Publier.`);
    }
    await migrate(getFirestore(app));
    await setTestPasswords(getAuth(app));
    await setEmailActionUrl(token, projectId);
    console.log('\n✅ Mise à jour terminée.\n');
    process.exit(0);
  }

  if (NOTIF_ONLY) {
    step('Mise à jour des règles de sécurité');
    try {
      await getSecurityRules(app).releaseFirestoreRulesetFromSource(fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8'));
      ok('Règles déployées');
    } catch (e) {
      warn(`Échec du déploiement des règles : ${e.message}`);
    }
    await androidConfig(token, projectId);
    process.exit(0);
  }

  // 1. Connexion e-mail / mot de passe
  step('Activation de la connexion e-mail / mot de passe');
  try {
    await api(token, 'PATCH', `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=signIn.email`, {
      signIn: { email: { enabled: true, passwordRequired: true } },
    });
    ok('E-mail / mot de passe activé');
  } catch (e) {
    warn(`Impossible de l'activer automatiquement (${e.message}).
    → Console Firebase > Authentication > Sign-in method > E-mail/Mot de passe > Activer.`);
  }

  // 2. Base Firestore
  step('Base de données Firestore');
  try {
    await api(token, 'GET', `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`);
    ok('La base existe déjà');
  } catch {
    try {
      await api(token, 'POST', `https://firestore.googleapis.com/v1/projects/${projectId}/databases?databaseId=(default)`, {
        locationId: 'europe-west1',
        type: 'FIRESTORE_NATIVE',
      });
      ok('Base créée (europe-west1). Attente de 20 s…');
      await new Promise((r) => setTimeout(r, 20000));
    } catch (e) {
      warn(`Création automatique impossible (${e.message}).
    → Console Firebase > Firestore Database > Créer une base de données (mode production), puis relance ce script.`);
      process.exit(1);
    }
  }

  // 3. Règles de sécurité
  step('Déploiement des règles de sécurité');
  try {
    await getSecurityRules(app).releaseFirestoreRulesetFromSource(fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8'));
    ok('Règles déployées');
  } catch (e) {
    warn(`Échec du déploiement des règles : ${e.message}`);
  }

  // 4. Fichier .env (configuration de l'app web)
  step('Configuration de l’application (.env)');
  try {
    let apps = (await api(token, 'GET', `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`)).apps ?? [];
    if (!apps.length) {
      const op = await api(token, 'POST', `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`, {
        displayName: 'Tunisia Golden League',
      });
      for (let i = 0; i < 15 && !op.done; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        Object.assign(op, await api(token, 'GET', `https://firebase.googleapis.com/v1beta1/${op.name}`));
      }
      apps = (await api(token, 'GET', `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`)).apps ?? [];
    }
    const cfg = await api(token, 'GET', `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps/${apps[0].appId}/config`);
    const env = [
      '# Généré par scripts/setup-firebase.mjs',
      `EXPO_PUBLIC_FIREBASE_API_KEY=${cfg.apiKey}`,
      `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=${cfg.authDomain ?? `${projectId}.firebaseapp.com`}`,
      `EXPO_PUBLIC_FIREBASE_PROJECT_ID=${cfg.projectId ?? projectId}`,
      `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=${cfg.storageBucket ?? ''}`,
      `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${cfg.messagingSenderId ?? ''}`,
      `EXPO_PUBLIC_FIREBASE_APP_ID=${cfg.appId}`,
      '',
    ].join('\n');
    fs.writeFileSync(path.join(ROOT, '.env'), env);
    ok('.env écrit');
  } catch (e) {
    warn(`Configuration non récupérée automatiquement (${e.message}).
    → Console Firebase > Paramètres du projet > Vos applications > Web : copie les valeurs dans .env (voir .env.example).`);
  }

  await androidConfig(token, projectId);

  const auth = getAuth(app);
  const db = getFirestore(app);

  // 5. Paramètres + terrains
  step('Paramètres et terrains');
  await db.doc('config/app').set(
    {
      id: 'app',
      openMinutes: 540,
      closeMinutes: 1440,
      slotMinutes: 90,
      expiryMinutes: 30,
      maxPendingPerUser: 2,
      price6v6: 60,
      price7v7: 80,
      contactPhone: '+216 00 000 000',
    },
    { merge: true },
  );
  const pitches = [
    { id: 'p1', name: 'Terrain 1', type: '6v6', active: true, order: 1 },
    { id: 'p2', name: 'Terrain 2', type: '6v6', active: true, order: 2 },
    { id: 'p3', name: 'Terrain 3', type: '7v7', active: true, order: 3 },
  ];
  for (const p of pitches) {
    const ref = db.doc(`pitches/${p.id}`);
    if (!(await ref.get()).exists) await ref.set(p);
  }
  ok('Horaires 09:00–24:00, créneaux de 90 min, 3 terrains');

  // 6. Championnat
  step('Championnat des entreprises');
  const seasonRef = db.doc(`seasons/${SEASON_ID}`);
  const seasonExists = (await seasonRef.get()).exists;
  if (seasonExists && !RESET) {
    ok('Saison déjà présente (relance avec --reset pour la recréer)');
  } else {
    if (RESET) {
      for (const col of ['teams', 'players', 'matches', 'events']) {
        const snap = await db.collection(col).where('seasonId', '==', SEASON_ID).get();
        for (let i = 0; i < snap.docs.length; i += 400) {
          const b = db.batch();
          snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
          await b.commit();
        }
      }
      const slots = await db.collection('slots').where('reason', '==', 'championship').get();
      const b = db.batch();
      slots.docs.forEach((d) => b.delete(d.ref));
      await b.commit();
      ok('Ancien championnat de test supprimé');
    }
    const others = await db.collection('seasons').where('active', '==', true).get();
    for (const d of others.docs) if (d.id !== SEASON_ID) await d.ref.update({ active: false });
    await seasonRef.set({
      id: SEASON_ID,
      name: `Championnat des Entreprises ${new Date().getFullYear()}`,
      status: 'registration',
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      yellowLimit: 3,
      redBanMatches: 1,
      halfMinutes: 25,
      doubleRound: true,
      createdAt: Date.now(),
      active: true,
    });

    const first = ['Ahmed', 'Mohamed', 'Youssef', 'Karim', 'Amine', 'Walid', 'Hamza', 'Skander', 'Aymen', 'Oussama', 'Firas', 'Bilel', 'Nizar', 'Seif', 'Mehdi', 'Rami', 'Anis', 'Hatem', 'Wassim', 'Ghassen'];
    const last = ['Ben Salah', 'Trabelsi', 'Jebali', 'Gharbi', 'Mejri', 'Bouazizi', 'Chaabane', 'Hammami', 'Ayari', 'Khelifi', 'Sassi', 'Dridi', 'Mansouri', 'Jaziri', 'Ferchichi', 'Belhadj'];
    const positions = ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'MID'];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const batch = db.batch();
    COMPANIES.forEach(([slug, name, company, short, color]) => {
      const teamId = `team-${slug}`;
      batch.set(db.doc(`teams/${teamId}`), { id: teamId, seasonId: SEASON_ID, name, company, shortName: short, color, logoUrl: null, captainId: `${teamId}-p2` });
      for (let i = 0; i < 10; i++) {
        const pid = `${teamId}-p${i + 1}`;
        batch.set(db.doc(`players/${pid}`), {
          id: pid,
          seasonId: SEASON_ID,
          teamId,
          name: `${first[Math.floor(rnd() * first.length)]} ${last[Math.floor(rnd() * last.length)]}`,
          number: i === 0 ? 1 : i + 1 + (i > 5 ? 3 : 0),
          position: positions[i],
          photoUrl: null,
        });
      }
    });
    await batch.commit();
    ok('8 équipes et 80 joueurs créés');

    // Calendrier : journée 1 aujourd'hui (19:30 et 21:00 sur les terrains 3 et 1), puis chaque semaine
    const rounds = roundRobin(COMPANIES.map(([slug]) => `team-${slug}`), true);
    const today = dateKey(new Date());
    const champPitches = [pitches[2], pitches[0]];
    const mb = db.batch();
    let count = 0;
    rounds.forEach((pairs, r) => {
      const date = addDays(today, r * 7);
      pairs.forEach(([home, away], i) => {
        const pitch = champPitches[i % 2];
        const startMin = 19 * 60 + 30 + Math.floor(i / 2) * 90;
        const start = hhmm(startMin);
        const id = `m${pad(r + 1)}-${i + 1}`;
        mb.set(db.doc(`matches/${id}`), {
          id,
          seasonId: SEASON_ID,
          round: r + 1,
          homeTeamId: home,
          awayTeamId: away,
          date,
          start,
          pitchId: pitch.id,
          status: 'scheduled',
          homeScore: 0,
          awayScore: 0,
          homeLineup: [],
          awayLineup: [],
          fbLiveUrl: null,
          referee: null,
        });
        const sid = slotId(pitch.id, date, start);
        mb.set(db.doc(`slots/${sid}`), {
          id: sid,
          pitchId: pitch.id,
          date,
          start,
          end: hhmm(startMin + 90),
          status: 'blocked',
          reason: 'championship',
          matchId: id,
          bookingId: null,
          expiresAt: null,
        });
        count++;
      });
    });
    await mb.commit();
    ok(`${count} matchs créés (${rounds.length} journées, la 1re aujourd'hui ${today})`);

    await db.doc('news/welcome').set({
      id: 'welcome',
      type: 'article',
      title: 'Coup d’envoi du Championnat des Entreprises !',
      body: '8 entreprises, 14 journées, des matchs en direct chaque semaine. Suivez les scores, le classement et les buteurs en temps réel dans l’application Tunisia Golden League.',
      imageUrl: null,
      videoUrl: null,
      createdAt: Date.now(),
    });
  }

  // 7. Comptes
  step('Comptes de test');
  const all = [
    ...ACCOUNTS,
    ...COMPANIES.map(([slug, name, company]) => ({
      email: `${slug}@tga.tn`,
      password: COMPANY_PASSWORD,
      name: `${company} (entreprise)`,
      phone: '+216 70 000 000',
      role: 'company',
      teamId: `team-${slug}`,
      companyName: company,
    })),
  ];
  for (const a of all) {
    let user;
    try {
      user = await auth.getUserByEmail(a.email);
      await auth.updateUser(user.uid, { password: a.password, displayName: a.name, emailVerified: true });
    } catch {
      user = await auth.createUser({ email: a.email, password: a.password, displayName: a.name, emailVerified: true });
    }
    await db.doc(`users/${user.uid}`).set(
      {
        id: user.uid,
        name: a.name,
        phone: a.phone,
        email: a.email,
        role: a.role,
        lang: 'fr',
        teamId: a.teamId ?? null,
        companyName: a.companyName ?? null,
      },
      { merge: true },
    );
    ok(`${a.role.padEnd(8)} ${a.email.padEnd(22)} ${a.password}`);
  }

  await migrate(db);
  await setEmailActionUrl(token, projectId);

  console.log('\n✅ Terminé. Lance maintenant : npx expo start  (puis scanne le QR code avec Expo Go)\n');
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✖ Erreur :', e.message ?? e);
  process.exit(1);
});
