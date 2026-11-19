import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLLECTIONS, fromRow, toRow, whereSql } from '../src/schema.js';

/** Simule l'aller-retour base de données (types renvoyés par PostgreSQL). */
function roundTrip(col, doc) {
  const def = COLLECTIONS[col];
  const { columns, values } = toRow(def, doc);
  const row = { id: doc.id, row_version: 3 };
  columns.forEach((c, i) => {
    let v = values[i];
    if (v !== null && (c === 'extra' || def.fields[Object.keys(def.fields).find((f) => def.fields[f].column === c)]?.type === 'json')) v = JSON.parse(v);
    else if (v !== null && Object.values(def.fields).find((f) => f.column === c)?.type === 'ts') v = new Date(v);
    row[c] = v;
  });
  return fromRow(def, row);
}

test('un match fait l’aller-retour sans perte', () => {
  const m = {
    id: 'm1', seasonId: 's', round: 2, homeTeamId: 'a', awayTeamId: 'b', date: '2026-11-20', start: '19:30',
    status: 'finished', homeScore: 2, awayScore: 1, plannedAt: 1795000000123, homeLineup: ['p1'], awayLineup: [],
    sheet: { status: 'final', home: { playerIds: ['p1'], starters: ['p1'] }, away: { playerIds: [] } }, futureField: { x: 1 },
  };
  const back = roundTrip('matches', m);
  assert.equal(back.__v, 3);
  delete back.__v;
  assert.deepEqual(back, m);
});

test('champs vides omis (comme Firestore)', () => {
  const back = roundTrip('players', { id: 'p', seasonId: 's', teamId: 't', name: 'X', number: 7, position: 'FWD', licenseNo: null, birthDate: '' });
  assert.equal('licenseNo' in back, false);
  assert.equal('birthDate' in back, false);
});

test('filtres : colonne connue, champ futur dans extra', () => {
  const params = [];
  const sql = whereSql(COLLECTIONS.teams, [['seasonId', 's1'], ['sponsor', 'X']], params);
  assert.equal(sql, 'season_id = $1 AND extra @> $2::jsonb');
  assert.deepEqual(params, ['s1', '{"sponsor":"X"}']);
});

test('réglages : document clé → valeur', () => {
  const def = COLLECTIONS.config;
  const { values } = toRow(def, { id: 'app', price6v6: 60, address: 'Tunis' });
  assert.deepEqual(fromRow(def, { id: 'app', value: JSON.parse(values[0]), row_version: 1 }), { id: 'app', price6v6: 60, address: 'Tunis', __v: 1 });
});
