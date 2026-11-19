import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { DEFAULT_CONFIG, bookingAmount, bookingSource, revenueSummary, weeklyDates, type Booking, type Pitch } from '../src/domain/model.ts';
// @ts-expect-error module JS sans types
import { buildDocs } from '../scripts/seed-teams.mjs';

const pitches: Pitch[] = [
  { id: 'p1', name: 'Terrain 1', type: '6v6', active: true, order: 1 },
  { id: 'p3', name: 'Terrain 3', type: '7v7', active: true, order: 3 },
];
const bk = (o: Partial<Booking>): Booking => ({
  id: Math.random().toString(36).slice(2),
  slotId: 's',
  pitchId: 'p1',
  pitchName: 'Terrain 1',
  date: '2026-10-05',
  start: '19:30',
  end: '21:00',
  userId: 'u',
  userName: 'Client',
  userPhone: '1',
  status: 'confirmed',
  createdAt: 0,
  expiresAt: 0,
  ...o,
});

test('montant : tarif du type de terrain ou montant saisi', () => {
  assert.equal(bookingAmount({}, pitches[0], DEFAULT_CONFIG), 60);
  assert.equal(bookingAmount({}, pitches[1], DEFAULT_CONFIG), 80);
  assert.equal(bookingAmount({ amount: 50 }, pitches[1], DEFAULT_CONFIG), 50);
  assert.equal(bookingSource({ private: true, manual: true }), 'private');
  assert.equal(bookingSource({ manual: true }), 'phone');
  assert.equal(bookingSource({}), 'app');
});

test('recettes : période, encaissé / à venir, terrains, origines', () => {
  const now = new Date(2026, 9, 10, 12, 0).getTime();
  const list = [
    bk({ date: '2026-10-05' }),
    bk({ date: '2026-10-05', pitchId: 'p3', start: '21:00', manual: true }),
    bk({ date: '2026-10-12', private: true, manual: true, amount: 50 }),
    bk({ date: '2026-10-12', status: 'cancelled' }),
    bk({ date: '2026-09-30' }), // hors période
  ];
  const s = revenueSummary(list, pitches, DEFAULT_CONFIG, '2026-10-01', '2026-10-31', now);
  assert.equal(s.total, 60 + 80 + 50);
  assert.equal(s.realized, 140);
  assert.equal(s.upcoming, 50);
  assert.equal(s.count, 3);
  assert.equal(s.byDay.length, 31);
  assert.equal(s.byDay.find((d) => d.date === '2026-10-05')?.amount, 140);
  assert.equal(s.byPitch[0].pitchId, 'p1'); // 60 + 50 > 80
  assert.deepEqual(s.bySource.private, { amount: 50, count: 1 });
  assert.deepEqual(s.bySource.phone, { amount: 80, count: 1 });
  // 2 terrains × 31 jours × 10 créneaux = 620 créneaux ouverts
  assert.equal(s.occupancy, Math.round((3 / 620) * 100));
});

test('créneau fixe : mêmes jour et heure chaque semaine', () => {
  assert.deepEqual(weeklyDates('2026-10-13', 3), ['2026-10-13', '2026-10-20', '2026-10-27']);
});

test('données d’exemple : 11 équipes complètes + 1 à compléter, dans chaque championnat', () => {
  const data = JSON.parse(fs.readFileSync('scripts/seed-data/equipes.json', 'utf8'));
  const owners = Object.fromEntries(data.teams.map((t: { slug: string }) => [t.slug, `uid-${t.slug}`]));
  const { docs, userUpdates } = buildDocs(data, { seasons: { mixte: { id: 'cm', year: 2026 }, 35: { id: 'c35', year: 2026 } }, owners, now: 1 });
  const teams = docs.filter((d: { col: string }) => d.col === 'teams').map((d: { data: unknown }) => d.data);
  for (const sid of ['cm', 'c35']) {
    const list = teams.filter((t: { seasonId: string }) => t.seasonId === sid);
    assert.equal(list.length, 12);
    assert.equal(list.filter((t: { approved: boolean }) => t.approved).length, 11);
    const draft = list.find((t: { approved: boolean }) => !t.approved);
    assert.equal(draft.requestStatus, 'draft');
    assert.equal(draft.company, 'Tabarka Agro');
  }
  const players = docs.filter((d: { col: string }) => d.col === 'players').map((d: { data: unknown }) => d.data);
  const atl = players.filter((p: { teamId: string }) => p.teamId === 'team-atlas-mixte').map((p: { licenseNo: string }) => p.licenseNo).sort();
  assert.equal(atl[0], 'TGL-26-ATL-001');
  assert.equal(new Set(atl).size, atl.length);
  const atl35 = players.filter((p: { teamId: string }) => p.teamId === 'team-atlas-35').map((p: { licenseNo: string }) => p.licenseNo).sort();
  assert.equal(atl35[0], 'TSL-26-ATL-001');
  // +35 : tous les joueurs ont au moins 35 ans au 1er janvier 2026
  assert.ok(players.filter((p: { seasonId: string }) => p.seasonId === 'c35').every((p: { birthDate: string }) => p.birthDate <= '1990-12-31'));
  // Dossier à compléter : un seul joueur sans pièce d'identité
  const infos = docs.filter((d: { col: string }) => d.col === 'playerInfo').map((d: { data: unknown }) => d.data);
  const tab = infos.filter((i: { teamId: string }) => i.teamId === 'team-tabarka-mixte');
  assert.equal(tab.filter((i: { cinFileId: string | null }) => !i.cinFileId).length, 1);
  // Chaque fiche complète a sa photo et sa pièce d'identité ; les pièces existent
  const fileIds = new Set(docs.filter((d: { col: string }) => d.col === 'files').map((d: { id: string }) => d.id));
  for (const i of infos) {
    assert.ok(fileIds.has(i.photoFileId));
    if (i.cinFileId) assert.ok(fileIds.has(i.cinFileId));
  }
  assert.ok(docs.every((d: { data: unknown }) => JSON.stringify(d.data).length < 1_000_000));
  assert.equal(userUpdates.length, 12);
  assert.equal(userUpdates.find((u: { uid: string }) => u.uid === 'uid-atlas').data.teamId, 'team-atlas-mixte');
  assert.equal(userUpdates.find((u: { uid: string }) => u.uid === 'uid-tabarka').data.teamId, null);
});

// ───────── Championnats, fair-play, permissions, feuille de match ─────────
import { ageAt, fairPlayTable, hasPerm, rosterOpen, sheetDue, underAge, type MatchEvent } from '../src/domain/model.ts';

test('fair-play : 0 au départ, jaune −2, rouge −5 (entraîneur compris)', () => {
  const ev = (teamId: string, type: MatchEvent['type'], coach = false) => ({ id: Math.random().toString(), matchId: 'm', seasonId: 's', teamId, type, minute: 10, half: 1, playerId: coach ? `coach:${teamId}` : 'p', coach, createdAt: 0 }) as MatchEvent;
  const rows = fairPlayTable(
    [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
    [ev('a', 'yellow'), ev('a', 'red', true), ev('b', 'yellow'), ev('b', 'goal')],
  );
  assert.deepEqual(rows.map((r) => [r.teamId, r.points]), [['c', 0], ['b', -2], ['a', -7]]);
  assert.equal(rows.find((r) => r.teamId === 'a')?.coachCards, 1);
});

test('permissions : rôle par défaut et réglages de l’administrateur', () => {
  assert.equal(hasPerm({ role: 'admin' }, 'champ.delete'), true);
  assert.equal(hasPerm({ role: 'admin', perms: { 'champ.delete': false } }, 'champ.delete'), false);
  assert.equal(hasPerm({ role: 'agent' }, 'queue'), true);
  assert.equal(hasPerm({ role: 'agent' }, 'private'), false);
  assert.equal(hasPerm({ role: 'agent', perms: { private: true } }, 'private'), true);
  assert.equal(hasPerm({ role: 'operator' }, 'matches.sheet'), true);
  assert.equal(hasPerm({ role: 'company', perms: { staff: true } }, 'staff'), false);
});

test('date limite d’ajout des joueurs et âge (+35)', () => {
  const now = new Date(2026, 10, 3, 12).getTime();
  assert.equal(rosterOpen({ rosterDeadline: null }, now), true);
  assert.equal(rosterOpen({ rosterDeadline: '2026-11-03' }, now), true);
  assert.equal(rosterOpen({ rosterDeadline: '2026-11-02' }, now), false);
  assert.equal(ageAt('1991-11-04', '2026-11-03'), 34);
  assert.equal(ageAt('1991-11-03', '2026-11-03'), 35);
  assert.equal(underAge({ category: 'over35', startDate: '2026-11-03' }, '1995-01-01', now), true);
  assert.equal(underAge({ category: 'over35', startDate: '2026-11-03' }, '1980-01-01', now), false);
  assert.equal(underAge({ category: 'mixed' }, '2005-01-01', now), false);
});

test('feuille de match due la veille', () => {
  const now = new Date(2026, 10, 3, 10).getTime();
  const m = { status: 'scheduled' as const, date: '2026-11-04', start: '19:30', plannedAt: null, sheet: null };
  assert.equal(sheetDue(m, now), true);
  assert.equal(sheetDue({ ...m, sheet: { status: 'ready', home: { playerIds: [] }, away: { playerIds: [] } } }, now), false);
  assert.equal(sheetDue({ ...m, date: '2026-11-10' }, now), false);
});
