import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  buildDaySlots,
  computeExpiresAt,
  computePlayerStats,
  computeStandings,
  dateTimeToMs,
  fifoQueue,
  liveMinuteLabel,
  roundRobin,
  scoreFromEvents,
  topScorers,
  facebookEmbedUrl,
} from '../src/domain/model.ts';
import type { Booking, Match, MatchEvent, Player, Season, SlotDoc, Team } from '../src/domain/model.ts';

const season: Season = {
  id: 's',
  name: 'S',
  status: 'running',
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  yellowLimit: 3,
  redBanMatches: 1,
  halfMinutes: 25,
  doubleRound: true,
  createdAt: 0,
  active: true,
};

const team = (id: string): Team => ({ id, seasonId: 's', name: id, company: id, shortName: id, color: '#fff' });
const match = (id: string, h: string, a: string, hs: number, as: number, date: string, status: Match['status'] = 'finished'): Match => ({
  id, seasonId: 's', round: 1, homeTeamId: h, awayTeamId: a, date, start: '20:00', status,
  homeScore: hs, awayScore: as, homeLineup: [], awayLineup: [],
});
let seq = 0;
const ev = (matchId: string, type: MatchEvent['type'], teamId: string, playerId: string, assistId?: string): MatchEvent => ({
  id: `e${++seq}`, matchId, seasonId: 's', type, minute: seq, half: 1, teamId, playerId, assistId, createdAt: seq,
});

test('grille 90 min de 09:00 à 24:00 = 10 créneaux', () => {
  const slots = buildDaySlots(DEFAULT_CONFIG, 'p1', '2030-01-01', [], 0);
  assert.equal(slots.length, 10);
  assert.equal(slots[0].start, '09:00');
  assert.equal(slots[9].start, '22:30');
  assert.equal(slots[9].end, '24:00');
});

test('une demande expirée libère le créneau', () => {
  const doc: SlotDoc = { id: 'p1_2030-01-01_0900', pitchId: 'p1', date: '2030-01-01', start: '09:00', end: '10:30', status: 'pending', expiresAt: 1000 };
  assert.equal(buildDaySlots(DEFAULT_CONFIG, 'p1', '2030-01-01', [doc], 500)[0].status, 'pending');
  assert.equal(buildDaySlots(DEFAULT_CONFIG, 'p1', '2030-01-01', [doc], 1500)[0].status, 'free');
});

test('expiration plafonnée à 1 h avant le créneau', () => {
  const start = dateTimeToMs('2030-01-01', '20:00');
  const now = start - 70 * 60_000; // 1h10 avant
  assert.equal(computeExpiresAt(DEFAULT_CONFIG, '2030-01-01', '20:00', now), now + 10 * 60_000);
});

test('FIFO : plus ancienne en premier, expirées exclues', () => {
  const b = (id: string, createdAt: number, expiresAt: number, status: Booking['status'] = 'pending') =>
    ({ id, createdAt, expiresAt, status }) as Booking;
  const q = fifoQueue([b('c', 30, 999), b('a', 10, 999), b('x', 5, 50), b('d', 1, 999, 'confirmed'), b('b', 20, 999)], 100);
  assert.deepEqual(q.map((x) => x.id), ['a', 'b', 'c']);
});

test('classement : points, différence, confrontation directe', () => {
  const teams = ['A', 'B', 'C'].map(team);
  const ms = [match('m1', 'A', 'B', 2, 1, '2030-01-01'), match('m2', 'B', 'C', 2, 1, '2030-01-08'), match('m3', 'C', 'A', 2, 1, '2030-01-15')];
  const st = computeStandings(season, teams, ms);
  // tous 3 pts, diff 0, 3 buts : départage par h2h indécis → ordre alphabétique stable
  assert.deepEqual(st.map((r) => r.points), [3, 3, 3]);
  const st2 = computeStandings(season, teams, [...ms, match('m4', 'A', 'C', 3, 0, '2030-01-22')]);
  assert.equal(st2[0].teamId, 'A');
  assert.equal(st2[0].points, 6);
  assert.deepEqual(st2[0].form, ['W', 'L', 'W']);
});

test('classement live : un match en cours compte et donne la variation', () => {
  const teams = ['A', 'B', 'C'].map(team);
  const ms = [match('m1', 'A', 'B', 1, 0, '2030-01-01'), match('m2', 'C', 'B', 3, 0, '2030-01-08', 'second_half')];
  const off = computeStandings(season, teams, ms, false);
  assert.equal(off[0].teamId, 'A');
  const live = computeStandings(season, teams, ms, true);
  assert.equal(live[0].teamId, 'C');
  assert.equal(live[0].live, true);
  assert.equal(live[0].liveMove, 1);
});

test('score : CSC compté pour l\'adversaire', () => {
  const m = match('m', 'A', 'B', 0, 0, '2030-01-01', 'first_half');
  const s = scoreFromEvents(m, [ev('m', 'goal', 'A', 'a1'), ev('m', 'own_goal', 'A', 'a2'), ev('m', 'penalty_goal', 'B', 'b1')]);
  assert.deepEqual(s, { homeScore: 1, awayScore: 2 });
});

test('stats : buteurs, passeurs, suspension rouge et cumul de jaunes', () => {
  const players: Player[] = ['a1', 'a2', 'b1'].map((id) => ({ id, seasonId: 's', teamId: id[0].toUpperCase(), name: id, number: 1, position: 'MID' }));
  const ms = [
    match('m1', 'A', 'B', 1, 0, '2030-01-01'),
    match('m2', 'A', 'B', 0, 0, '2030-01-08'),
    match('m3', 'A', 'B', 0, 0, '2030-01-15'),
    match('m4', 'A', 'B', 0, 0, '2030-01-22', 'scheduled'),
  ];
  const evs = [
    ev('m1', 'goal', 'A', 'a1', 'a2'),
    ev('m1', 'yellow', 'A', 'a1'),
    ev('m1', 'red', 'B', 'b1'),
    ev('m2', 'yellow', 'A', 'a1'),
    ev('m3', 'yellow', 'A', 'a1'),
  ];
  const st = computePlayerStats(season, players, ms, evs);
  assert.equal(st.get('a1')!.goals, 1);
  assert.equal(st.get('a2')!.assists, 1);
  assert.equal(st.get('b1')!.suspendedMatches, 0, 'rouge purgé au match m2');
  assert.equal(st.get('a1')!.suspendedMatches, 1, '3 jaunes → suspendu pour m4');
  assert.equal(st.get('a1')!.yellowAccum, 0);
  assert.equal(topScorers(st)[0].playerId, 'a1');
});

test('deux jaunes + rouge dans un match : 1 match, jaunes non cumulés', () => {
  const players: Player[] = [{ id: 'a1', seasonId: 's', teamId: 'A', name: 'a1', number: 1, position: 'MID' }];
  const ms = [match('m1', 'A', 'B', 0, 0, '2030-01-01')];
  const st = computePlayerStats(season, players, ms, [ev('m1', 'yellow', 'A', 'a1'), ev('m1', 'yellow', 'A', 'a1'), ev('m1', 'red', 'A', 'a1')]);
  assert.equal(st.get('a1')!.suspendedMatches, 1);
  assert.equal(st.get('a1')!.yellowAccum, 0);
});

test('round-robin 8 équipes aller-retour : 14 journées, 56 matchs, chaque paire 2 fois', () => {
  const ids = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const rounds = roundRobin(ids, true);
  assert.equal(rounds.length, 14);
  const all = rounds.flat();
  assert.equal(all.length, 56);
  const seen = new Set(all.map(([h, a]) => `${h}-${a}`));
  assert.equal(seen.size, 56, 'chaque affiche domicile/extérieur unique');
  for (const r of rounds) assert.equal(new Set(r.flat()).size, 8, 'chaque équipe joue une fois par journée');
});

test('minute live', () => {
  const m = { ...match('m', 'A', 'B', 0, 0, '2030-01-01', 'first_half'), kickoffAt: 0 };
  assert.equal(liveMinuteLabel(m, 25, 10 * 60_000 + 1), "11'");
  assert.equal(liveMinuteLabel(m, 25, 26 * 60_000), '25+2\'');
  const m2 = { ...m, status: 'second_half' as const, secondHalfAt: 0 };
  assert.equal(liveMinuteLabel(m2, 25, 4 * 60_000), "30'");
});

test('URL embed Facebook', () => {
  assert.match(facebookEmbedUrl('https://www.facebook.com/GFL/videos/123/'), /plugins\/video\.php\?href=https%3A%2F%2Fwww\.facebook\.com/);
});

// ───────── Nouvelles fonctionnalités ─────────
import {
  adminTodos,
  bookingWindow,
  canCompanyEditLineup,
  companyTodos,
  generateStartTimes,
  isWithinBookingWindow,
  lineupDeadline,
  toDateKey,
  addDays,
} from '../src/domain/model.ts';

test('créneaux personnalisés par terrain', () => {
  const pitch = { slotStarts: ['20:00', '18:30'], slotMinutes: 60 };
  const slots = buildDaySlots(DEFAULT_CONFIG, 'p1', '2030-01-01', [], 0, pitch);
  assert.deepEqual(slots.map((s) => `${s.start}-${s.end}`), ['18:30-19:30', '20:00-21:00']);
  assert.deepEqual(generateStartTimes(9 * 60, 12 * 60, 60), ['09:00', '10:00', '11:00']);
});

test('une réservation hors grille reste visible', () => {
  const doc: SlotDoc = { id: 'p1_2030-01-01_1000', pitchId: 'p1', date: '2030-01-01', start: '10:00', end: '11:30', status: 'booked' };
  const slots = buildDaySlots(DEFAULT_CONFIG, 'p1', '2030-01-01', [doc], 0, { slotStarts: ['18:00'] });
  assert.deepEqual(slots.map((s) => s.start), ['10:00', '18:00']);
});

test('fenêtre de réservation glissante de 7 jours', () => {
  const now = new Date(2030, 0, 10, 15).getTime();
  const w = bookingWindow(now, 7);
  assert.equal(w.length, 7);
  assert.equal(w[0], '2030-01-10');
  assert.equal(w[6], '2030-01-16');
  assert.equal(isWithinBookingWindow('2030-01-16', now, 7), true);
  assert.equal(isWithinBookingWindow('2030-01-17', now, 7), false);
  assert.equal(isWithinBookingWindow('2030-01-09', now, 7), false);
});

test('sélection des joueurs verrouillée 12 h avant le match', () => {
  const m = { date: '2030-01-10', start: '20:00', status: 'scheduled' as const };
  const dl = lineupDeadline(m);
  assert.equal(dl, new Date(2030, 0, 10, 8, 0).getTime());
  assert.equal(canCompanyEditLineup(m, dl - 1), true);
  assert.equal(canCompanyEditLineup(m, dl), false);
  assert.equal(canCompanyEditLineup({ ...m, status: 'first_half' }, dl - 1000), false);
});

test('tâches entreprise et admin', () => {
  const now = new Date(2030, 0, 10, 9).getTime();
  const today = toDateKey(new Date(now));
  const tm = team('A');
  const players = [
    { id: 'p1', seasonId: 's', teamId: 'A', name: 'x', number: 1, position: 'GK' as const, status: 'draft' as const },
    { id: 'p2', seasonId: 's', teamId: 'A', name: 'y', number: 2, position: 'DEF' as const, status: 'rejected' as const },
    { id: 'p3', seasonId: 's', teamId: 'A', name: 'z', number: 3, position: 'DEF' as const, status: 'pending' as const },
  ];
  const ms = [{ ...match('m1', 'A', 'B', 0, 0, addDays(today, 1), 'scheduled') }];
  const ct = companyTodos({ team: tm, seasonOpen: false, players, matches: ms, now });
  const kinds = ct.map((x) => x.kind);
  assert.ok(kinds.includes('submitPlayers'));
  assert.ok(kinds.includes('fixRejected'));
  assert.ok(kinds.includes('selectLineup'));
  assert.deepEqual(companyTodos({ team: null, seasonOpen: true, players: [], matches: [], now }).map((x) => x.kind), ['registerTeam']);
  const at = adminTodos({ pendingBookings: 2, teams: [{ ...tm, approved: false }], players, matches: ms, now, whatsappConfigured: false });
  assert.deepEqual(at.map((x) => x.kind), ['pendingBookings', 'pendingTeams', 'pendingPlayers', 'sheetDue', 'configureWhatsapp']);
});

test('créneaux par date : priorité date > terrain > horaires généraux', async () => {
  const { pitchSchedule, buildDaySlots, pruneDateSlots, DEFAULT_CONFIG } = await import('../src/domain/model.ts');
  const pitch = { slotStarts: ['10:00', '18:00'], slotMinutes: 90, dateSlots: { '2030-01-05': ['14:00', '09:00'], '2030-01-06': [] } };
  assert.deepEqual(pitchSchedule(DEFAULT_CONFIG, pitch, '2030-01-05').starts, ['09:00', '14:00']);
  assert.deepEqual(pitchSchedule(DEFAULT_CONFIG, pitch, '2030-01-06').starts, []); // fermé ce jour-là
  assert.deepEqual(pitchSchedule(DEFAULT_CONFIG, pitch, '2030-01-07').starts, ['10:00', '18:00']);
  assert.equal(pitchSchedule(DEFAULT_CONFIG, null, '2030-01-07').starts[0], '09:00');
  const slots = buildDaySlots(DEFAULT_CONFIG, 'p1', '2030-01-05', [], 0, pitch);
  assert.deepEqual(slots.map((s) => `${s.start}-${s.end}`), ['09:00-10:30', '14:00-15:30']);
  assert.deepEqual(Object.keys(pruneDateSlots(pitch.dateSlots, '2030-01-06')), ['2030-01-06']);
});

test('vidéos : YouTube, Facebook, mp4', async () => {
  const { videoSource, videoThumbnail, canRequestBooking, canSeeLeague } = await import('../src/domain/model.ts');
  assert.deepEqual(videoSource('https://youtu.be/dQw4w9WgXcQ'), { type: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(videoSource('https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share'), { type: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.equal(videoSource('https://www.facebook.com/page/videos/123/')?.type, 'facebook');
  assert.equal(videoSource('https://cdn.site.tn/promo.mp4')?.type, 'file');
  assert.equal(videoSource('https://example.com/page'), null);
  assert.equal(videoThumbnail({ videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }), 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  // Rôles : seuls les clients réservent ; le championnat est réservé aux entreprises et au personnel
  assert.equal(canRequestBooking('user'), true);
  assert.equal(canRequestBooking(null), true);
  assert.equal(canRequestBooking('company'), false);
  assert.equal(canSeeLeague('user'), true); // matchs et classements publics
  assert.equal(canSeeLeague(null), true);
  assert.equal(canSeeLeague('company'), true);
  assert.equal(canSeeLeague('operator'), true);
});

test('inscription : contrôle de l’effectif, licences, statut de demande', async () => {
  const { checkSquad, licenseNumber, teamRequestStatus, fullName, MIN_SQUAD } = await import('../src/domain/model.ts');
  const players = Array.from({ length: MIN_SQUAD }, (_, i) => ({ id: `p${i}`, birthDate: i === 0 ? null : '1990-01-01' }));
  const infos = new Map(players.map((p, i) => [p.id, { cinFileId: 'c', photoFileId: i === 1 ? null : 'ph', attestationFileId: i < 2 ? 'a' : null, certificateFileId: null }]));
  const c = checkSquad({ collectiveAttestationId: null, collectiveCertificateId: null }, players, infos);
  assert.equal(c.tooFew, false);
  assert.deepEqual(c.missingRequired.map((m) => [m.playerId, m.missing]), [['p0', ['birthDate']], ['p1', ['photo']]]);
  assert.equal(c.missingAttestation.length, MIN_SQUAD - 2);
  assert.equal(c.missingCertificate.length, MIN_SQUAD);
  // Une pièce collective couvre tous les joueurs
  const c2 = checkSquad({ collectiveAttestationId: 'x', collectiveCertificateId: 'y' }, players, infos);
  assert.equal(c2.missingAttestation.length + c2.missingCertificate.length, 0);
  assert.equal(checkSquad({}, players.slice(0, 2), infos).tooFew, true);
  assert.equal(licenseNumber(2026, 'atl', 7), 'TGL-26-ATL-007');
  assert.equal(licenseNumber(2026, 'A', 12), 'TGL-26-AXX-012');
  assert.equal(teamRequestStatus({ approved: false }), 'submitted');
  assert.equal(teamRequestStatus({}), 'approved');
  assert.equal(teamRequestStatus({ requestStatus: 'draft', approved: false }), 'draft');
  assert.equal(fullName(' Ali ', 'Ben Salah'), 'Ali Ben Salah');
});

test('documents imprimables : feuille de match et cartes de licence', async () => {
  const { matchSheetHtml, licenseCardsHtml } = await import('../src/print/templates.ts');
  const html = matchSheetHtml({
    date: '2030-01-05',
    start: '19:30',
    team1: { name: 'Atlas <FC>', players: [{ number: 7, name: 'Ali Ben Salah', captain: true }], coach: 'Coach A', delegate: 'Del A' },
    team2: { name: 'Carthage', players: [], coach: null },
  });
  assert.match(html, /TUNISIA GOLDEN LEAGUE/);
  assert.match(html, /Atlas &lt;FC&gt;/);
  assert.match(html, /Ali Ben Salah <b>\(C\)<\/b>/);
  assert.match(html, /05\/01\/2030/);
  assert.match(html, /AVERTISSEMENT/);
  assert.equal((html.match(/<tr class="p">/g) ?? []).length, 12);
  const cards = licenseCardsHtml(
    Array.from({ length: 11 }, (_, i) => ({ firstName: 'Ali', lastName: `Joueur${i}`, birthDate: '1990-02-03', licenseNo: `TGL-26-ATL-00${i}`, teamName: 'Atlas', season: '2026' })),
  );
  assert.equal((cards.match(/class="card front"/g) ?? []).length, 11);
  assert.equal((cards.match(/class="card back"/g) ?? []).length, 11);
  assert.equal((cards.match(/class="page"/g) ?? []).length, 4); // 2 pages recto + 2 verso
  assert.match(cards, /03\/02\/1990/);
});
