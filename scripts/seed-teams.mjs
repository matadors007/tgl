/**
 * Tunisia Golden League — équipes d'exemple dans les deux championnats :
 *   12 entreprises, chacune avec une équipe dans « Tunisia Golden League » et une dans « Tunisia Silver League ».
 *   11 dossiers complets (équipes validées, licences attribuées) et 1 dossier à compléter
 *   (Tabarka Agro : brouillon, il manque les pièces d'un seul joueur).
 *
 *   node scripts/seed-teams.mjs            (ou double-clic sur creer-equipes.bat)
 *   node scripts/seed-teams.mjs --dry-run  (vérifie les données sans rien écrire)
 *
 * Données : scripts/seed-data/equipes.json (généré par scripts/seed-data/generate.py).
 * Chaque entreprise a le compte <slug>@tga.tn (mot de passe Test1234).
 * Seules les équipes, joueurs, pièces et matchs des deux championnats sont remplacés ;
 * les autres championnats / tournois, les comptes, terrains et réservations sont conservés.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAMPIONSHIPS, championshipDoc } from './init-championships.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');
const PASSWORD = 'Test1234';
const ok = (m) => console.log(`  ✔ ${m}`);
const step = (m) => console.log(`\n▶ ${m}`);

/** Identique à licenseNumber() de src/domain/model.ts (préfixe TGL ou TSL). */
export function licenseNumber(seasonYear, shortName, index, prefix = 'TGL') {
  const abr = (shortName || 'TGL').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3).padEnd(3, 'X');
  return `${prefix}-${String(seasonYear).slice(-2)}-${abr}-${String(index).padStart(3, '0')}`;
}

const sizeOf = (dataUri) => Math.round((dataUri.length - dataUri.indexOf(',') - 1) * 0.75);
const mimeOf = (dataUri) => dataUri.slice(5, dataUri.indexOf(';'));

/**
 * Construit tous les documents à écrire (fonction pure : testable sans Firebase).
 * seasons : { mixte: { id, year }, 35: { id, year } } · owners : slug → uid du compte entreprise.
 */
export function buildDocs(data, { seasons, owners, now = Date.now() }) {
  const docs = []; // { col, id, data }
  const put = (col, id, d) => docs.push({ col, id, data: d });
  const userUpdates = new Map();
  for (const t of data.teams) {
    const season = seasons[t.championship];
    if (!season) continue;
    const prefix = t.championship === '35' ? 'TSL' : 'TGL';
    const teamId = `team-${t.slug}-${t.championship}`;
    const ownerId = owners[t.slug] ?? null;
    const done = t.complete;
    const file = (kind, dataUri, name, suffix) => {
      const id = `f-${t.slug}-${t.championship}-${suffix}`;
      put('files', id, { id, teamId, ownerId: ownerId ?? '', kind, mime: mimeOf(dataUri), name, size: sizeOf(dataUri), data: dataUri, createdAt: now });
      return id;
    };
    const collAtt = t.collectiveAttestation ? file('collectiveAttestation', t.collectiveAttestation, 'attestation-collective.jpg', 'att-coll') : null;
    const collCert = t.collectiveCertificate ? file('collectiveCertificate', t.collectiveCertificate, 'certificat-collectif.jpg', 'cert-coll') : null;
    // Numéros de licence : ordre alphabétique des noms (comme approveTeam dans l'app)
    const order = [...t.players].map((p, i) => ({ i, name: `${p.firstName} ${p.lastName}` })).sort((a, b) => a.name.localeCompare(b.name));
    const licIndex = new Map(order.map((o, k) => [o.i, k + 1]));
    let captainId = null;
    t.players.forEach((p, i) => {
      const pid = `${teamId}-p${i + 1}`;
      if (i === 1) captainId = pid;
      const photoFileId = p.photo ? file('photo', p.photo, 'photo.jpg', `p${i + 1}-photo`) : null;
      const cinFileId = p.cinDoc ? file('cin', p.cinDoc, 'piece-identite.jpg', `p${i + 1}-cin`) : null;
      const attestationFileId = p.attestation ? file('attestation', p.attestation, 'attestation.jpg', `p${i + 1}-att`) : null;
      const certificateFileId = p.certificate ? file('certificate', p.certificate, 'certificat.jpg', `p${i + 1}-cert`) : null;
      put('players', pid, {
        id: pid,
        seasonId: season.id,
        teamId,
        name: `${p.firstName} ${p.lastName}`,
        number: p.number,
        position: p.position,
        photoUrl: null,
        status: done ? 'approved' : 'draft',
        rejectReason: null,
        submittedAt: done ? now - 86_400_000 : null,
        birthDate: p.birthDate,
        licenseNo: done ? licenseNumber(season.year, t.shortName, licIndex.get(i), prefix) : null,
      });
      put('playerInfo', pid, {
        id: pid,
        teamId,
        ownerId,
        firstName: p.firstName,
        lastName: p.lastName,
        birthDate: p.birthDate,
        cinFileId,
        photoFileId,
        attestationFileId,
        certificateFileId,
        phone: p.phone,
        cin: p.incomplete ? null : p.cin,
        jobTitle: p.jobTitle,
        employeeId: p.employeeId,
      });
    });
    put('teams', teamId, {
      id: teamId,
      seasonId: season.id,
      name: t.name,
      company: t.company,
      shortName: t.shortName,
      color: t.color,
      logoUrl: t.logo,
      captainId,
      ownerId,
      approved: done,
      requestStatus: done ? 'approved' : 'draft',
      rejectReason: null,
      submittedAt: done ? now - 86_400_000 : null,
      managers: t.managers,
      coach: t.coach,
      collectiveAttestationId: collAtt,
      collectiveCertificateId: collCert,
      collectiveAttestationPromised: false,
      collectiveCertificatePromised: false,
    });
    if (ownerId) {
      const cur = userUpdates.get(ownerId) ?? { uid: ownerId, data: { teamId: null, companyName: t.company } };
      if (done && t.championship === 'mixte') cur.data.teamId = teamId;
      userUpdates.set(ownerId, cur);
    }
  }
  return { docs, userUpdates: [...userUpdates.values()] };
}

async function resetSeason(db, season) {
  const del = async (snap) => {
    for (let i = 0; i < snap.docs.length; i += 300) {
      const b = db.batch();
      snap.docs.slice(i, i + 300).forEach((d) => b.delete(d.ref));
      await b.commit();
    }
    return snap.size;
  };
  const teams = await db.collection('teams').where('seasonId', '==', season.id).get();
  const teamIds = teams.docs.map((d) => d.id);
  const players = await db.collection('players').where('seasonId', '==', season.id).get();
  for (const p of players.docs) await db.doc(`playerInfo/${p.id}`).delete().catch(() => {});
  // Pièces jointes des anciennes équipes
  for (let i = 0; i < teamIds.length; i += 10) await del(await db.collection('files').where('teamId', 'in', teamIds.slice(i, i + 10)).get());
  const nP = await del(players);
  const nT = await del(teams);
  const matches = await db.collection('matches').where('seasonId', '==', season.id).get();
  for (const m of matches.docs) {
    const slots = await db.collection('slots').where('matchId', '==', m.id).get();
    for (const sl of slots.docs) await sl.ref.delete();
  }
  const nM = await del(matches);
  await del(await db.collection('events').where('seasonId', '==', season.id).get());
  const companies = await db.collection('users').where('role', '==', 'company').get();
  for (const u of companies.docs) if (teamIds.includes(u.get('teamId'))) await u.ref.update({ teamId: null });
  await season.ref.update({ status: 'registration' });
  ok(`« ${season.get('name')} » vidé : ${nM} matchs, ${nT} équipes, ${nP} joueurs — inscriptions ouvertes`);
}

async function main() {
  console.log('\n=== Tunisia Golden League — équipes d’exemple (mixte et +35) ===');
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'seed-data', 'equipes.json'), 'utf8'));
  const summary = () => {
    for (const c of ['mixte', '35']) {
      const list = data.teams.filter((t) => t.championship === c);
      console.log(`  ${c === 'mixte' ? 'Tunisia Golden League' : 'Tunisia Silver League'} : ${list.filter((t) => t.complete).length} équipes complètes, ${list.filter((t) => !t.complete).length} à compléter`);
    }
  };

  if (DRY) {
    const owners = Object.fromEntries(data.teams.map((t) => [t.slug, `uid-${t.slug}`]));
    const { docs, userUpdates } = buildDocs(data, { seasons: { mixte: { id: 'champ-mixte', year: 2026 }, 35: { id: 'champ-35', year: 2026 } }, owners });
    const count = (c) => docs.filter((d) => d.col === c).length;
    const biggest = Math.max(...docs.map((d) => JSON.stringify(d.data).length));
    console.log(`Équipes ${count('teams')} · joueurs ${count('players')} · fiches ${count('playerInfo')} · pièces ${count('files')} · comptes ${userUpdates.length}`);
    console.log(`Plus gros document : ${(biggest / 1024).toFixed(0)} Ko (limite Firestore : 1024 Ko)`);
    summary();
    return;
  }

  const keyPath = path.join(ROOT, 'serviceAccount.json');
  if (!fs.existsSync(keyPath)) {
    console.error(`\n✖ Fichier introuvable : ${keyPath}`);
    process.exit(1);
  }
  const { cert, initializeApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore } = await import('firebase-admin/firestore');
  const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const app = initializeApp({ credential: cert(sa), projectId: sa.project_id });
  const db = getFirestore(app);
  const auth = getAuth(app);
  console.log(`Projet : ${sa.project_id}`);

  step('Championnats');
  const all = await db.collection('seasons').get();
  const find = (category) =>
    all.docs.find((d) => d.get('active') !== false && d.get('kind') !== 'cup' && (d.get('category') ?? 'mixed') === category);
  const seasons = {};
  for (const [key, category] of [['mixte', 'mixed'], ['35', 'over35']]) {
    let doc = find(category);
    if (!doc) {
      const c = CHAMPIONSHIPS.find((x) => x.category === category);
      await db.doc(`seasons/${c.id}`).set(championshipDoc(c, Date.now()));
      doc = await db.doc(`seasons/${c.id}`).get();
      ok(`« ${c.name} » créé`);
    }
    // Nouveaux noms : Tunisia Golden League (mixte) et Tunisia Silver League (+35)
    const wanted = CHAMPIONSHIPS.find((x) => x.category === category).name;
    if (doc.get('name') !== wanted) {
      await doc.ref.update({ name: wanted });
      ok(`« ${doc.get('name')} » renommé « ${wanted} »`);
      doc = await doc.ref.get();
    }
    await resetSeason(db, doc);
    const year = Number(String(doc.get('startDate') ?? '').slice(0, 4)) || new Date().getFullYear();
    seasons[key] = { id: doc.id, year };
  }

  step('Comptes entreprises');
  const owners = {};
  for (const t of data.teams) {
    if (owners[t.slug]) continue;
    const email = `${t.slug}@tga.tn`;
    let u;
    try {
      u = await auth.getUserByEmail(email);
    } catch {
      u = await auth.createUser({ email, password: PASSWORD, displayName: `${t.company} (entreprise)`, emailVerified: true });
    }
    owners[t.slug] = u.uid;
    await db.doc(`users/${u.uid}`).set(
      { id: u.uid, name: `${t.company} (entreprise)`, phone: t.managers[0]?.phone ?? '', email, role: 'company', lang: 'fr', active: true, companyName: t.company },
      { merge: true },
    );
    ok(`${email.padEnd(22)} ${PASSWORD}${t.complete ? '' : '   ← dossier à compléter'}`);
  }

  step('Équipes, joueurs, photos et pièces jointes');
  const { docs, userUpdates } = buildDocs(data, { seasons, owners });
  // Les photos et pièces font ~20-30 Ko : lots de 40 documents pour rester sous la limite d'un lot
  for (let i = 0; i < docs.length; i += 40) {
    const b = db.batch();
    for (const d of docs.slice(i, i + 40)) b.set(db.doc(`${d.col}/${d.id}`), d.data);
    await b.commit();
    process.stdout.write(`\r  … ${Math.min(i + 40, docs.length)}/${docs.length} documents`);
  }
  console.log('');
  for (const u of userUpdates) await db.doc(`users/${u.uid}`).set(u.data, { merge: true });
  summary();

  console.log(`
✅ Terminé.
   - 11 entreprises complètes dans chaque championnat : équipes validées, licences prêtes (Administration > Championnats).
   - Tabarka Agro (tabarka@tga.tn) : dossier à compléter dans les deux championnats ;
     il manque les pièces d'un joueur. Connectez-vous avec ce compte pour le compléter et l'envoyer.
   - Mot de passe de tous les comptes : ${PASSWORD} (à changer avant l'ouverture au public).
`);
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('\n✖ Erreur :', e.message ?? e);
    process.exit(1);
  });
}
