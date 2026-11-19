/**
 * Test de sécurité automatique : essaie de contourner les protections, comme le ferait un pirate.
 *   node test/securite.mjs [adresse]        (défaut : http://localhost:8080)
 * Utilise les comptes de démonstration (@demo.tn, mot de passe Test1234) : lancez-le sur une base d'essai.
 * Chaque ligne doit être « OK ». Rien n'est cassé : les tentatives sont refusées par le serveur.
 */
import crypto from 'node:crypto';

const BASE = (process.argv[2] ?? 'http://localhost:8080').replace(/\/$/, '');
const API = `${BASE}/api`;
const PW = 'Test1234';
const results = [];

async function call(path, body, token, method = body ? 'POST' : 'GET') {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
const commit = (ops, token) => call('/db/commit', { ops }, token);
const query = async (col, where, token) => (await call('/db/query', { col, where }, token)).json.rows ?? [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '  OK   ' : '  ÉCHEC'} ${name}${!ok && detail ? `  → ${detail}` : ''}`);
}
const denied = (r) => r.status === 401 || r.status === 403;
async function login(email) {
  const r = await call('/auth/login', { email, password: PW });
  if (r.status !== 200) throw new Error(`Connexion impossible pour ${email} (${r.status}) : chargez les données de démonstration (choix 2).`);
  return r.json;
}
function wsRows(col, where, token) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws`);
    const t = setTimeout(() => (ws.close(), resolve(null)), 5000);
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'auth', token: token ?? null }));
      ws.send(JSON.stringify({ t: 'sub', sid: 'a', col, where }));
    };
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.sid === 'a') {
        clearTimeout(t);
        ws.close();
        resolve(m.rows ?? []);
      }
    };
    ws.onerror = () => (clearTimeout(t), resolve(null));
  });
}

console.log(`\nTest de sécurité de ${BASE}\n`);

// Préparation : une clé WhatsApp d'essai (si aucune n'est réglée), retirée à la fin
const adminSetup = await login('admin@demo.tn');
const hadKey = (await call('/db/get', { col: 'config', id: 'whatsapp' }, adminSetup.token)).json.doc;
if (!hadKey) await commit([{ type: 'set', col: 'config', id: 'whatsapp', data: { apiKey: 'cle-de-test-securite' } }], adminSetup.token);
const hidden = (r) => denied(r) || !r.json.doc;

// ───────── Visiteur non connecté ─────────
console.log('Visiteur non connecté');
for (const col of ['users', 'bookings', 'privateBookings', 'playerInfo', 'files', 'pushTokens'])
  check(`ne lit pas « ${col} »`, (await query(col, [])).length === 0);
check('ne lit pas la clé WhatsApp', hidden(await call('/db/get', { col: 'config', id: 'whatsapp' })));
check('ne peut rien écrire', denied(await commit([{ type: 'set', col: 'news', id: 'x', data: { type: 'article', title: 'pirate' } }])));
check('temps réel : ne voit pas les comptes', ((await wsRows('users', [])) ?? []).length === 0);

// ───────── Injections et jetons falsifiés ─────────
console.log('\nInjections et jetons falsifiés');
check('nom de table piégé refusé', (await call('/db/query', { col: 'users; DROP TABLE users', where: [] })).status === 400);
check('identifiant piégé refusé', (await call('/db/get', { col: 'users', id: "x' OR '1'='1" })).status === 400);
check('filtre piégé sans effet', (await query('matches', [["status' OR 1=1 --", 'x']])).length === 0);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const admin0 = await login('admin@demo.tn');
check('jeton « sans signature » refusé', (await call('/auth/me', null, `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ uid: admin0.uid })}.`)).status === 401);
const fake = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ uid: admin0.uid, tv: 0 })}`;
check('jeton signé avec une autre clé refusé', (await call('/auth/me', null, `${fake}.${crypto.createHmac('sha256', 'devine').update(fake).digest('base64url')}`)).status === 401);

// ───────── Client (particulier) ─────────
console.log('\nClient (particulier)');
const user = await login('user@demo.tn');
const U = user.token;
check('ne voit que son propre profil', (await query('users', [], U)).every((u) => u.id === user.uid));
check('ne voit que ses réservations', (await query('bookings', [], U)).every((b) => b.userId === user.uid));
check('ne devient pas administrateur', denied(await commit([{ type: 'update', col: 'users', id: user.uid, data: { role: 'admin' } }], U)));
check('ne se donne pas de permissions', denied(await commit([{ type: 'update', col: 'users', id: user.uid, data: { perms: { settings: true } } }], U)));
check('ne modifie pas un autre compte', denied(await commit([{ type: 'update', col: 'users', id: admin0.uid, data: { name: 'pirate' } }], U)));
const other = (await call('/db/get', { col: 'bookings', id: 'b1' }, U));
check('ne lit pas la réservation d’un autre', denied(other) || other.json.doc?.userId === user.uid);
check('ne confirme pas sa propre réservation', denied(await commit([{ type: 'set', col: 'bookings', id: 'pirate1', data: { userId: user.uid, status: 'confirmed', slotId: 's', pitchId: 'p1', date: '2030-01-01', start: '10:00', end: '11:00', createdAt: Date.now(), expiresAt: Date.now() } }], U)));
check('ne réserve pas au nom d’un autre', denied(await commit([{ type: 'set', col: 'bookings', id: 'pirate2', data: { userId: admin0.uid, status: 'pending', slotId: 's', pitchId: 'p1', date: '2030-01-01', start: '10:00', end: '11:00', createdAt: Date.now(), expiresAt: Date.now() } }], U)));
check('ne modifie pas un score', denied(await commit([{ type: 'update', col: 'matches', id: 'm1_1', data: { homeScore: 9 } }], U)));
check('ne crée pas de championnat', denied(await commit([{ type: 'set', col: 'seasons', id: 'pirate', data: { name: 'x', status: 'running' } }], U)));
check('ne lit pas la clé WhatsApp', hidden(await call('/db/get', { col: 'config', id: 'whatsapp' }, U)));
check('ne voit pas les téléphones des autres', (await query('pushTokens', [], U)).every((t) => t.userId === user.uid));
check('n’envoie pas de notification à un autre compte', denied(await call('/notify/push', { target: 'users', userIds: [admin0.uid], texts: { fr: { title: 'x', body: 'y' } }, url: '/' }, U)));
check('n’envoie pas de notification de match', denied(await call('/notify/push', { target: 'match', match: { id: 'm1_1' }, texts: { fr: { title: 'x', body: 'y' } }, url: '/' }, U)));
check('n’utilise pas WhatsApp de l’administrateur', denied(await call('/notify/whatsapp', { test: true, phone: '+21600000000' }, U)));
check('document géant refusé', (await commit([{ type: 'update', col: 'users', id: user.uid, data: { photo: 'x'.repeat(1_600_000) } }], U)).status === 413);

// ───────── Entreprise ─────────
console.log('\nEntreprise');
const company = await login('company@demo.tn');
const C = company.token;
const myTeam = (await call('/db/get', { col: 'users', id: company.uid }, C)).json.doc?.teamId;
const teams = await query('teams', [], C);
const foreign = teams.find((t) => t.id !== myTeam);
check('ne modifie pas l’équipe d’une autre entreprise', denied(await commit([{ type: 'update', col: 'teams', id: foreign.id, data: { name: 'pirate' } }], C)));
check('ne change pas son équipe de championnat', denied(await commit([{ type: 'update', col: 'teams', id: myTeam, data: { seasonId: 'cup-ete' } }], C)));
check('ne change pas le propriétaire de son équipe', denied(await commit([{ type: 'update', col: 'teams', id: myTeam, data: { ownerId: user.uid } }], C)));
check('ne lit pas les données privées des autres joueurs', (await query('playerInfo', [], C)).every((i) => i.ownerId === company.uid));
const myPlayer = (await query('players', [['teamId', myTeam]], C))[0];
check('ne change pas un numéro de licence', denied(await commit([{ type: 'update', col: 'players', id: myPlayer.id, data: { licenseNo: 'FAUX-1' } }], C)));
check('ne s’attribue pas une autre équipe', denied(await commit([{ type: 'update', col: 'users', id: company.uid, data: { teamId: foreign.id } }], C)));

// ───────── Opérateur de match ─────────
console.log('\nOpérateur de match');
const op = await login('op@demo.tn');
const O = op.token;
check('ne supprime pas de joueur', denied(await commit([{ type: 'remove', col: 'players', id: myPlayer.id }], O)));
check('ne change pas le rôle d’un compte', denied(await commit([{ type: 'update', col: 'users', id: user.uid, data: { role: 'admin' } }], O)));
check('ne modifie pas les réglages', denied(await commit([{ type: 'update', col: 'config', id: 'app', data: { price6v6: 1 } }], O)));
check('ne lit pas la clé WhatsApp', hidden(await call('/db/get', { col: 'config', id: 'whatsapp' }, O)));

// ───────── Mots de passe et connexions ─────────
console.log('\nMots de passe et connexions');
let blocked = false;
for (let i = 0; i < 12; i++) if ((await call('/auth/login', { email: 'robot-test@demo.tn', password: `essai${i}` })).status === 429) blocked = true;
check('connexions répétées bloquées (anti-robot)', blocked);
const wrong = await call('/auth/login', { email: 'user@demo.tn', password: 'mauvais' });
const unknown = await call('/auth/login', { email: 'inconnu-xyz@demo.tn', password: 'mauvais' });
check('même réponse pour un compte existant ou non', wrong.status === unknown.status && wrong.json.code === unknown.json.code);
const fresh = await login('user@demo.tn');
const changed = await call('/auth/password', { current: PW, next: 'Temporaire99' }, fresh.token);
check('changer le mot de passe déconnecte les autres appareils', (await call('/auth/me', null, U)).status === 401 && (await call('/auth/me', null, changed.json.token)).status === 200);
await call('/auth/password', { current: 'Temporaire99', next: PW }, changed.json.token);
check('mot de passe trop court refusé', (await call('/auth/signup', { email: `court${Date.now()}@demo.tn`, password: '123' })).status === 400);

if (!hadKey) await commit([{ type: 'remove', col: 'config', id: 'whatsapp' }], adminSetup.token);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} / ${results.length} protections vérifiées.`);
console.log(failed.length ? `⚠ ${failed.length} problème(s) : copiez ce résultat et envoyez-le.` : '✅ Aucune faille trouvée par ce test.');
process.exit(failed.length ? 1 : 0);
