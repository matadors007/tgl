import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bracketRounds,
  computeStandings,
  cupFull,
  groupLetters,
  groupStandings,
  koRoundsFor,
  matchWinner,
  needsPenalties,
  type Match,
  type Season,
  type Team,
} from '../src/domain/model.ts';

const team = (id: string, group?: string, o: Partial<Team> = {}): Team => ({ id, seasonId: 'c', name: id, company: id, shortName: id, color: '#000', group, ...o });
const match = (o: Partial<Match>): Match => ({
  id: Math.random().toString(36).slice(2),
  seasonId: 'c',
  round: 1,
  homeTeamId: 'a',
  awayTeamId: 'b',
  date: '2026-11-10',
  start: '19:30',
  status: 'finished',
  homeScore: 0,
  awayScore: 0,
  homeLineup: [],
  awayLineup: [],
  ...o,
});
const season: Season = {
  id: 'c', name: 'Tournoi', status: 'running', pointsWin: 3, pointsDraw: 1, pointsLoss: 0, yellowLimit: 3, redBanMatches: 1,
  halfMinutes: 20, doubleRound: false, createdAt: 0, active: true, kind: 'cup', cupFormat: 'groups', maxTeams: 6, groupCount: 2,
};

test('vainqueur : score, puis tirs au but', () => {
  assert.equal(matchWinner(match({ homeScore: 2, awayScore: 1 })), 'a');
  assert.equal(matchWinner(match({ homeScore: 1, awayScore: 1 })), null);
  assert.equal(matchWinner(match({ homeScore: 1, awayScore: 1, homePens: 3, awayPens: 4 })), 'b');
  assert.equal(matchWinner(match({ status: 'scheduled', homeScore: 0, awayScore: 0 })), null);
  assert.equal(needsPenalties(match({ stage: 'ko', homeScore: 2, awayScore: 2 })), true);
  assert.equal(needsPenalties(match({ stage: 'group', homeScore: 2, awayScore: 2 })), false);
});

test('poules : un classement par poule, sans les matchs à élimination', () => {
  const teams = [team('a', 'A'), team('b', 'A'), team('c', 'A'), team('d', 'B'), team('e', 'B'), team('f', 'B')];
  const matches = [
    match({ stage: 'group', group: 'A', homeTeamId: 'a', awayTeamId: 'b', homeScore: 2, awayScore: 0 }),
    match({ stage: 'group', group: 'B', homeTeamId: 'd', awayTeamId: 'e', homeScore: 1, awayScore: 1 }),
    match({ stage: 'ko', koRound: 2, homeTeamId: 'b', awayTeamId: 'e', homeScore: 5, awayScore: 0 }),
  ];
  const g = groupStandings(season, teams, matches);
  assert.deepEqual(g.map((x) => x.group), ['A', 'B']);
  assert.equal(g[0].rows.length, 3);
  assert.equal(g[0].rows[0].teamId, 'a');
  assert.equal(g[0].rows[0].points, 3);
  assert.equal(g[1].rows.find((r) => r.teamId === 'd')?.points, 1);
  // l'élimination ne compte pas dans les classements
  const all = computeStandings(season, teams, matches);
  assert.equal(all.find((r) => r.teamId === 'b')?.played, 1);
});

test('tours proposés selon le nombre d’équipes', () => {
  assert.deepEqual(koRoundsFor(8), [8, 4, 2, 1]);
  assert.deepEqual(koRoundsFor(6), [8, 4, 2, 1]);
  assert.deepEqual(koRoundsFor(4), [4, 2, 1]);
  assert.deepEqual(koRoundsFor(20), [32, 16, 8, 4, 2, 1]);
  assert.deepEqual(groupLetters(3), ['A', 'B', 'C']);
});

test('tableau : tours dans l’ordre, finale', () => {
  const r = bracketRounds([match({ stage: 'ko', koRound: 2 }), match({ stage: 'ko', koRound: 4 }), match({ stage: 'ko', koRound: 4 }), match({ stage: 'group', group: 'A' })]);
  assert.deepEqual(r.map((x) => [x.round, x.matches.length]), [[4, 2], [2, 1]]);
});

test('tournoi complet : équipes envoyées ou validées', () => {
  const teams = [
    team('a', undefined, { requestStatus: 'approved', approved: true }),
    team('b', undefined, { requestStatus: 'submitted', approved: false }),
    team('c', undefined, { requestStatus: 'draft', approved: false }),
  ];
  assert.equal(cupFull({ kind: 'cup', maxTeams: 3 }, teams, 'c'), false);
  assert.equal(cupFull({ kind: 'cup', maxTeams: 2 }, teams, 'c'), true);
  assert.equal(cupFull({ kind: 'league', maxTeams: 2 }, teams, 'c'), false);
});

// ───────── Générateur automatique du calendrier ─────────
import { planCalendar, weekdayOf } from '../src/domain/model.ts';

test('calendrier auto : toutes les rencontres, jours / heures / terrains choisis, pas deux matchs par jour', () => {
  const teams = ['a', 'b', 'c', 'd', 'e', 'f'];
  const taken = new Set(['p1|2026-11-10|19:30']); // créneau déjà réservé
  const res = planCalendar({
    teamIds: teams,
    doubleRound: true,
    keep: [],
    startDate: '2026-11-09', // lundi
    weekdays: [2, 4], // mardi, jeudi
    times: ['21:00', '19:30'],
    pitchIds: ['p1', 'p2'],
    free: (p, d, s) => !taken.has(`${p}|${d}|${s}`),
    seed: 3,
  });
  assert.equal(res.unplaced.length, 0);
  assert.equal(res.matches.length, 30); // 6 équipes aller-retour
  assert.ok(res.matches.every((m) => [2, 4].includes(weekdayOf(m.date)) && ['19:30', '21:00'].includes(m.start)));
  assert.ok(!res.matches.some((m) => m.pitchId === 'p1' && m.date === '2026-11-10' && m.start === '19:30'));
  const slots = new Set(res.matches.map((m) => `${m.pitchId}|${m.date}|${m.start}`));
  assert.equal(slots.size, res.matches.length);
  for (const d of new Set(res.matches.map((m) => m.date))) {
    const ids = res.matches.filter((m) => m.date === d).flatMap((m) => [m.homeTeamId, m.awayTeamId]);
    assert.equal(new Set(ids).size, ids.length);
  }
  // chaque paire se rencontre une fois dans chaque sens
  const pairs = new Set(res.matches.map((m) => `${m.homeTeamId}-${m.awayTeamId}`));
  assert.equal(pairs.size, 30);
  // les journées se suivent dans le temps
  const firstOf = (r: number) => res.matches.filter((m) => m.round === r).map((m) => m.date).sort()[0];
  assert.ok(firstOf(2) > firstOf(1));
});

test('calendrier auto : les rencontres déjà jouées ne sont pas reprogrammées', () => {
  const res = planCalendar({
    teamIds: ['a', 'b', 'c', 'd'],
    doubleRound: false,
    keep: [{ homeTeamId: 'b', awayTeamId: 'a' }],
    startDate: '2026-11-09',
    weekdays: [6],
    times: ['18:00', '19:30'],
    pitchIds: ['p1'],
    free: () => true,
  });
  assert.equal(res.matches.length, 5);
  assert.ok(!res.matches.some((m) => (m.homeTeamId === 'a' && m.awayTeamId === 'b') || (m.homeTeamId === 'b' && m.awayTeamId === 'a')));
});

// ───────── Départage, effectif de 18, licences Silver League ─────────
import { computeStandings as standings2, leagueTitle, licensePrefix, squadPlacesUsed, SQUAD_MAX, type MatchEvent } from '../src/domain/model.ts';

const lg: Season = { ...season, kind: 'league', cupFormat: null, groupCount: null };
const t3 = ['a', 'b', 'c', 'd'].map((id) => team(id));

test('égalité : différence de buts, puis buts marqués, avant la confrontation directe', () => {
  // a et b : 3 pts chacun ; b a la meilleure différence malgré la défaite contre a
  const ms = [
    match({ homeTeamId: 'a', awayTeamId: 'b', homeScore: 1, awayScore: 0 }),
    match({ homeTeamId: 'b', awayTeamId: 'c', homeScore: 5, awayScore: 0 }),
    match({ homeTeamId: 'c', awayTeamId: 'a', homeScore: 3, awayScore: 0 }),
  ];
  const r = standings2(lg, t3, ms, false);
  assert.deepEqual(r.slice(0, 3).map((x) => x.teamId), ['b', 'c', 'a']);
});

test('égalité à 2 : confrontation directe quand différence et buts sont égaux', () => {
  const tie = [
    match({ homeTeamId: 'a', awayTeamId: 'b', homeScore: 2, awayScore: 1 }),
    match({ homeTeamId: 'b', awayTeamId: 'c', homeScore: 2, awayScore: 1 }),
    match({ homeTeamId: 'c', awayTeamId: 'a', homeScore: 2, awayScore: 1 }),
    match({ homeTeamId: 'd', awayTeamId: 'b', homeScore: 0, awayScore: 0 }),
    match({ homeTeamId: 'a', awayTeamId: 'd', homeScore: 0, awayScore: 0 }),
  ];
  const r = standings2(lg, t3, tie, false);
  // a, b : 4 pts, diff 0, 3 buts ; a a battu b → a devant b
  const pa = r.findIndex((x) => x.teamId === 'a');
  const pb = r.findIndex((x) => x.teamId === 'b');
  assert.equal(r[pa].points, r[pb].points);
  assert.equal(r[pa].goalDiff, r[pb].goalDiff);
  assert.equal(r[pa].goalsFor, r[pb].goalsFor);
  assert.ok(pa < pb);
});

test('égalité à 3 : mini-classement, puis fair-play, puis tirage au sort', () => {
  // a, b, c : chacun bat l'autre 1-0 → égalité parfaite même en confrontations directes
  const ms = [
    match({ homeTeamId: 'a', awayTeamId: 'b', homeScore: 1, awayScore: 0 }),
    match({ homeTeamId: 'b', awayTeamId: 'c', homeScore: 1, awayScore: 0 }),
    match({ homeTeamId: 'c', awayTeamId: 'a', homeScore: 1, awayScore: 0 }),
  ];
  const ev = (teamId: string, type: MatchEvent['type']) => ({ id: Math.random().toString(), matchId: 'm', seasonId: 'c', teamId, type, minute: 1, half: 1, playerId: 'p', createdAt: 0 }) as MatchEvent;
  // fair-play : c propre, a un jaune, b un rouge → c, a, b
  const r = standings2(lg, t3.slice(0, 3), ms, false, [ev('a', 'yellow'), ev('b', 'red')]);
  assert.deepEqual(r.map((x) => x.teamId), ['c', 'a', 'b']);
  assert.ok(r.every((x) => !x.tieLot));
  // sans cartons : égalité parfaite → tirage au sort
  const r2 = standings2(lg, t3.slice(0, 3), ms, false, []);
  assert.ok(r2.every((x) => x.tieLot));
  const r3 = standings2({ ...lg, lotOrder: ['b', 'c', 'a'] }, t3.slice(0, 3), ms, false, []);
  assert.deepEqual(r3.map((x) => x.teamId), ['b', 'c', 'a']);
  assert.ok(r3.every((x) => !x.tieLot));
});

test('égalité à 3 dont 2 restent à égalité : on reprend la confrontation directe entre ces 2', () => {
  // a, b, c à 3 pts, même différence et mêmes buts ; dans le mini-classement a est 1er, puis b et c égaux → b a battu… (même score) → fair-play
  const ms = [
    match({ homeTeamId: 'a', awayTeamId: 'b', homeScore: 2, awayScore: 0 }),
    match({ homeTeamId: 'b', awayTeamId: 'c', homeScore: 2, awayScore: 1 }),
    match({ homeTeamId: 'c', awayTeamId: 'a', homeScore: 2, awayScore: 1 }),
    match({ homeTeamId: 'd', awayTeamId: 'b', homeScore: 0, awayScore: 1 }),
    match({ homeTeamId: 'a', awayTeamId: 'd', homeScore: 0, awayScore: 1 }),
    match({ homeTeamId: 'c', awayTeamId: 'd', homeScore: 1, awayScore: 1 }),
  ];
  const r = standings2(lg, t3, ms, false);
  assert.equal(r.length, 4);
  assert.equal(new Set(r.map((x) => x.position)).size, 4);
});

test('effectif : 18 places, les joueurs retirés gardent la leur, les refusés non', () => {
  const ps = [
    ...Array.from({ length: 15 }, () => ({ status: 'approved' as const })),
    { status: 'removed' as const },
    { status: 'removed' as const },
    { status: 'rejected' as const },
    { status: 'draft' as const },
  ];
  assert.equal(squadPlacesUsed(ps), 18);
  assert.equal(SQUAD_MAX, 18);
});

test('Silver League : nom et préfixe de licence TSL', () => {
  assert.equal(licensePrefix({ category: 'over35' }), 'TSL');
  assert.equal(licensePrefix({ category: 'mixed' }), 'TGL');
  assert.equal(leagueTitle({ category: 'over35' }), 'Tunisia Silver League');
  assert.equal(leagueTitle({ category: 'mixed' }), 'Tunisia Golden League');
});
