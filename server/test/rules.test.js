import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affectedKeys, canRead, canWrite, permOf, redact } from '../src/rules.js';

const ctx = (me, docs = {}) => ({
  uid: me?.id ?? null,
  emailVerified: true,
  me,
  now: Date.now(),
  get: async (c, id) => docs[`${c}/${id}`] ?? null,
  getAfter: async (c, id) => docs[`${c}/${id}`] ?? null,
});

test('permissions par rôle', () => {
  assert.equal(permOf({ role: 'admin' }, 'settings'), true);
  assert.equal(permOf({ role: 'agent' }, 'queue'), true);
  assert.equal(permOf({ role: 'agent' }, 'settings'), false);
  assert.equal(permOf({ role: 'operator', perms: { 'matches.live': false } }, 'matches.live'), false);
  assert.equal(permOf({ role: 'company' }, 'queue'), false);
});

test('clés modifiées', () => {
  assert.deepEqual(affectedKeys({ a: 1, b: 2, id: 'x' }, { a: 1, b: 3, c: null, id: 'x' }).sort(), ['b', 'c']);
});

test('un utilisateur ne peut pas devenir administrateur', async () => {
  const me = { id: 'u1', role: 'user' };
  assert.equal(await canWrite(ctx(me), { kind: 'update', col: 'users', id: 'u1', before: me, after: { ...me, role: 'admin' } }), false);
  assert.equal(await canWrite(ctx(me), { kind: 'update', col: 'users', id: 'u1', before: me, after: { ...me, name: 'X' } }), true);
});

test('lecture des profils et réservations', () => {
  const me = { id: 'u1', role: 'user' };
  assert.equal(canRead(ctx(me), 'users', { id: 'u2' }), false);
  assert.equal(canRead(ctx(me), 'bookings', { id: 'b', userId: 'u1' }), true);
  assert.equal(canRead(ctx(null), 'bookings', { id: 'b', userId: 'u1' }), false);
  assert.equal(canRead(ctx(null), 'matches', { id: 'm' }), true);
});

test("l'entreprise ne modifie que ses joueurs, sans toucher la licence", async () => {
  const me = { id: 'c1', role: 'company', teamId: 't1' };
  const docs = { 'teams/t1': { id: 't1', ownerId: 'c1' } };
  const p = { id: 'p', teamId: 't1', status: 'approved', licenseNo: 'TGL-1', number: 7 };
  assert.equal(await canWrite(ctx(me, docs), { kind: 'update', col: 'players', id: 'p', before: p, after: { ...p, number: 9 } }), true);
  assert.equal(await canWrite(ctx(me, docs), { kind: 'update', col: 'players', id: 'p', before: p, after: { ...p, licenseNo: 'X' } }), false);
  assert.equal(await canWrite(ctx(me, docs), { kind: 'delete', col: 'players', id: 'p', before: p, after: null }), false);
});

test('coordonnées des équipes et dates de naissance masquées aux visiteurs', async () => {
  const team = { id: 't1', name: 'FC', ownerId: 'c1', managers: [{ name: 'Ali', phone: '+216 1', email: 'a@x.tn' }], coach: { name: 'Sami', phone: '+216 2', email: 's@x.tn' } };
  const player = { id: 'p1', teamId: 't1', name: 'Joueur', birthDate: '1990-01-01' };
  const docs = { 'teams/t1': team };
  // Visiteur, client, autre entreprise : noms visibles, coordonnées et date de naissance cachées
  for (const me of [null, { id: 'u1', role: 'user' }, { id: 'c2', role: 'company', teamId: 't2' }]) {
    const t = await redact(ctx(me, docs), 'teams', team);
    assert.equal(t.managers[0].name, 'Ali');
    assert.equal(t.managers[0].phone, '');
    assert.equal('email' in t.managers[0], false);
    assert.equal(t.coach.phone, '');
    assert.equal('birthDate' in (await redact(ctx(me, docs), 'players', player)), false);
  }
  // Entreprise propriétaire et personnel : tout est visible
  for (const me of [{ id: 'c1', role: 'company' }, { id: 'a1', role: 'agent' }, { id: 'ad', role: 'admin' }]) {
    assert.deepEqual(await redact(ctx(me, docs), 'teams', team), team);
    assert.deepEqual(await redact(ctx(me, docs), 'players', player), player);
  }
  // Le document d'origine n'est jamais modifié
  assert.equal(team.managers[0].phone, '+216 1');
  assert.equal(player.birthDate, '1990-01-01');
});

test('le personnel ne lit que les profils dont il a besoin', () => {
  const client = { id: 'u2', role: 'user' };
  const company = { id: 'c1', role: 'company' };
  const agent = { id: 'a1', role: 'agent' };
  const operator = { id: 'o1', role: 'operator' };
  // Agent et opérateur : comptes entreprise oui, clients non
  for (const me of [agent, operator]) {
    assert.equal(canRead(ctx(me), 'users', client), false);
    assert.equal(canRead(ctx(me), 'users', company), true);
    assert.equal(canRead(ctx(me), 'users', me), true);
  }
  // Gestion du personnel ou paramètres : tous les comptes
  assert.equal(canRead(ctx({ id: 'ad', role: 'admin' }), 'users', client), true);
  assert.equal(canRead(ctx({ ...agent, perms: { settings: true } }), 'users', client), true);
});
