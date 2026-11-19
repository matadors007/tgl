import {
  DEFAULT_CONFIG,
  addDays,
  computeExpiresAt,
  minutesToHHmm,
  hhmmToMinutes,
  roundRobin,
  scoreFromEvents,
  slotId,
  toDateKey,
  type Booking,
  type Match,
  type MatchEvent,
  type NewsItem,
  type Pitch,
  type Player,
  type Position,
  type Season,
  type SlotDoc,
  type Team,
  type StoredFile,
  type PlayerInfo,
  type UserProfile,
} from '../domain/model';
import { COL } from './store';

/** Données fictives pour le mode démo (entreprises et joueurs inventés). */
export function buildDemoSeed(now = Date.now()) {
  let s = 20260925;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const today = toDateKey(new Date(now));

  const users: UserProfile[] = [
    { id: 'demo-user', name: 'Sami Ben Ali', phone: '+216 20 111 222', role: 'user', lang: 'fr' },
    { id: 'demo-agent', name: 'Agent Accueil', phone: '+216 20 333 444', role: 'agent', lang: 'fr' },
    { id: 'demo-operator', name: 'Opérateur Match', phone: '+216 20 777 888', role: 'operator', lang: 'fr' },
    { id: 'demo-company', name: 'Atlas Tech (entreprise)', phone: '+216 71 000 111', role: 'company', lang: 'fr', teamId: 't1', companyName: 'Atlas Tech' },
    { id: 'demo-company-new', name: 'Hannibal Services (entreprise)', phone: '+216 71 222 333', role: 'company', lang: 'fr', teamId: null, companyName: 'Hannibal Services' },
    { id: 'demo-admin', name: 'Administrateur TGL', phone: '+216 20 555 666', role: 'admin', lang: 'fr' },
  ];

  const pitches: Pitch[] = [
    { id: 'p1', name: 'Terrain 1', type: '6v6', active: true, order: 1 },
    { id: 'p2', name: 'Terrain 2', type: '6v6', active: true, order: 2 },
    { id: 'p3', name: 'Terrain 3', type: '7v7', active: true, order: 3 },
  ];

  const season: Season = {
    id: 'season-2026',
    name: 'Tunisia Golden League',
    category: 'mixed',
    startDate: addDays(today, -35),
    rosterDeadline: addDays(today, 20),
    status: 'running',
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
    yellowLimit: 3,
    redBanMatches: 1,
    halfMinutes: 25,
    doubleRound: true,
    createdAt: now - 60 * 86400000,
    active: true,
  };

  const teamDefs: [string, string, string, string][] = [
    ['Atlas Tech FC', 'Atlas Tech', 'ATL', '#3B82F6'],
    ['Carthage Consulting', 'Carthage Consulting', 'CAR', '#EF4444'],
    ['Medina Soft', 'Medina Soft', 'MED', '#10B981'],
    ['Sahel Logistics', 'Sahel Logistics', 'SAH', '#F59E0B'],
    ['Jasmin Assurances', 'Jasmin Assurances', 'JAS', '#A855F7'],
    ['Olivier Industries', 'Olivier Industries', 'OLI', '#84CC16'],
    ['Byrsa Digital', 'Byrsa Digital', 'BYR', '#06B6D4'],
    ['Djerba Energie', 'Djerba Energie', 'DJE', '#F97316'],
  ];
  const teams: Team[] = teamDefs.map(([name, company, shortName, color], i) => ({
    id: `t${i + 1}`,
    seasonId: season.id,
    name,
    company,
    shortName,
    color,
    logoUrl: null,
    captainId: `t${i + 1}p2`,
    ownerId: i === 0 ? 'demo-company' : null,
    approved: true,
    requestStatus: 'approved' as const,
    managers: [{ name: `Responsable ${shortName}`, phone: `+216 71 00${i} 000`, email: `contact@${shortName.toLowerCase()}.tn` }],
    coach: { name: `Coach ${shortName}`, phone: `+216 98 00${i} 000` },
  }));

  const first = ['Ahmed', 'Mohamed', 'Youssef', 'Karim', 'Amine', 'Walid', 'Hamza', 'Skander', 'Aymen', 'Oussama', 'Firas', 'Bilel', 'Nizar', 'Seif', 'Mehdi', 'Rami', 'Anis', 'Hatem', 'Wassim', 'Ghassen'];
  const last = ['Ben Salah', 'Trabelsi', 'Jebali', 'Gharbi', 'Mejri', 'Bouazizi', 'Chaabane', 'Hammami', 'Ayari', 'Khelifi', 'Sassi', 'Dridi', 'Mansouri', 'Jaziri', 'Ferchichi', 'Belhadj'];
  const positions: Position[] = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'DEF', 'FWD'];
  const players: Player[] = [];
  for (const t of teams) {
    for (let i = 0; i < 10; i++) {
      players.push({
        id: `${t.id}p${i + 1}`,
        seasonId: season.id,
        teamId: t.id,
        name: `${pick(first)} ${pick(last)}`,
        number: i === 0 ? 1 : i + 2 + Math.floor(rnd() * 3) * 10,
        position: positions[i],
        photoUrl: null,
      });
    }
  }
  const teamPlayers = (tid: string) => players.filter((p) => p.teamId === tid);

  // Calendrier : journée 6 = aujourd'hui, journées 1–5 terminées.
  const rounds = roundRobin(
    teams.map((t) => t.id),
    true,
  );
  const matches: Match[] = [];
  const events: MatchEvent[] = [];
  const slots: SlotDoc[] = [];
  const champPitches = [pitches[2], pitches[0]];
  const CURRENT = 6;
  let evSeq = 0;

  rounds.forEach((pairs, r) => {
    const round = r + 1;
    const date = addDays(today, (round - CURRENT) * 7);
    pairs.forEach(([home, away], i) => {
      const pitch = champPitches[i % 2];
      const startMin = hhmmToMinutes('19:30') + Math.floor(i / 2) * 90;
      const start = minutesToHHmm(startMin);
      const id = `m${round}_${i + 1}`;
      const m: Match = {
        id,
        seasonId: season.id,
        round,
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
      };
      slots.push({
        id: slotId(pitch.id, date, start),
        pitchId: pitch.id,
        date,
        start,
        end: minutesToHHmm(startMin + 90),
        status: 'blocked',
        reason: 'championship',
        matchId: id,
        bookingId: null,
        expiresAt: null,
      });

      const played = round < CURRENT;
      const liveIdx = round === CURRENT ? i : -1;
      if (played || liveIdx === 0 || liveIdx === 1) {
        const hp = teamPlayers(home);
        const ap = teamPlayers(away);
        m.homeLineup = hp.slice(0, 9).map((p) => p.id);
        m.awayLineup = ap.slice(0, 9).map((p) => p.id);
        let kickoff: number;
        let maxMinute = 50;
        if (played) {
          kickoff = new Date(`${date}T${start}:00`).getTime();
          m.status = 'finished';
          m.finishedAt = kickoff + 55 * 60000;
          m.secondHalfAt = kickoff + 30 * 60000;
        } else if (liveIdx === 0) {
          kickoff = now - 38 * 60000;
          m.secondHalfAt = now - 8 * 60000;
          m.status = 'second_half';
          m.fbLiveUrl = 'https://www.facebook.com/facebook/videos/10153231379946729/';
          maxMinute = 33;
        } else {
          kickoff = now - 14 * 60000;
          m.status = 'first_half';
          maxMinute = 14;
        }
        m.kickoffAt = kickoff;
        const addGoals = (tid: string, squad: Player[], n: number) => {
          for (let g = 0; g < n; g++) {
            const outfield = squad.filter((p) => p.position !== 'GK');
            const scorer = pick(outfield.filter((p) => p.position !== 'DEF').concat(outfield));
            const assist = rnd() < 0.6 ? pick(outfield.filter((p) => p.id !== scorer.id)) : null;
            const minute = 1 + Math.floor(rnd() * maxMinute);
            const pen = rnd() < 0.1;
            events.push({
              id: `ev${++evSeq}`,
              matchId: id,
              seasonId: season.id,
              type: pen ? 'penalty_goal' : 'goal',
              minute,
              half: minute > 25 ? 2 : 1,
              teamId: tid,
              playerId: scorer.id,
              assistId: pen ? null : assist?.id ?? null,
              createdAt: kickoff + minute * 60000,
            });
          }
        };
        const scale = played ? 1 : maxMinute / 50;
        addGoals(home, hp, Math.round(Math.floor(rnd() * 5) * scale));
        addGoals(away, ap, Math.round(Math.floor(rnd() * 4) * scale));
        const nCards = Math.floor(rnd() * 3);
        for (let c = 0; c < nCards; c++) {
          const tid = rnd() < 0.5 ? home : away;
          const p = pick(teamPlayers(tid).slice(0, 9));
          const minute = 1 + Math.floor(rnd() * maxMinute);
          events.push({
            id: `ev${++evSeq}`,
            matchId: id,
            seasonId: season.id,
            type: rnd() < 0.08 ? 'red' : 'yellow',
            minute,
            half: minute > 25 ? 2 : 1,
            teamId: tid,
            playerId: p.id,
            createdAt: kickoff + minute * 60000,
          });
        }
        Object.assign(m, scoreFromEvents(m, events));
        // Feuille de match : finale pour les matchs joués, remplie pour les matchs en cours
        m.sheet = {
          status: played ? 'final' : 'ready',
          home: { playerIds: m.homeLineup, captainId: `${home}p2`, coach: `Coach ${teams.find((x) => x.id === home)?.shortName}`, delegate: null },
          away: { playerIds: m.awayLineup, captainId: `${away}p2`, coach: `Coach ${teams.find((x) => x.id === away)?.shortName}`, delegate: null },
          referee: 'Arbitre officiel',
          filledBy: 'Administrateur TGL',
          filledAt: kickoff - 86400000,
          finalizedBy: played ? 'Administrateur TGL' : null,
          finalizedAt: played ? kickoff + 60 * 60000 : null,
        };
      }
      matches.push(m);
    });
  });

  // Second championnat : « Tunisia Silver League » (4 équipes, inscriptions ouvertes, 1re journée demain)
  const season35: Season = {
    ...season,
    id: 'season-35',
    name: 'Tunisia Silver League',
    category: 'over35',
    status: 'registration',
    doubleRound: false,
    startDate: addDays(today, 1),
    rosterDeadline: addDays(today, 10),
    createdAt: season.createdAt + 1000,
  };
  const defs35: [string, string, string, string][] = [
    ['Vétérans Atlas', 'Atlas Tech', 'VAT', '#1D4ED8'],
    ['Carthage Seniors', 'Carthage Consulting', 'CSE', '#B91C1C'],
    ['Sahel Masters', 'Sahel Logistics', 'SMA', '#B45309'],
    ['Djerba Classics', 'Djerba Energie', 'DJC', '#C2410C'],
  ];
  const teams35: Team[] = defs35.map(([name, company, shortName, color], i) => ({
    id: `v${i + 1}`,
    seasonId: season35.id,
    name,
    company,
    shortName,
    color,
    logoUrl: null,
    captainId: `v${i + 1}p2`,
    ownerId: i === 0 ? 'demo-company' : null,
    approved: true,
    requestStatus: 'approved' as const,
    managers: [{ name: `Responsable ${shortName}`, phone: `+216 72 00${i} 000` }],
    coach: { name: `Coach ${shortName}`, phone: `+216 97 00${i} 000` },
  }));
  for (const t of teams35)
    for (let i = 0; i < 8; i++)
      players.push({
        id: `${t.id}p${i + 1}`,
        seasonId: season35.id,
        teamId: t.id,
        name: `${pick(first)} ${pick(last)}`,
        number: i + 1,
        position: positions[i],
        photoUrl: null,
        birthDate: `19${70 + Math.floor(rnd() * 20)}-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}`,
      });
  roundRobin(teams35.map((t) => t.id), false).forEach((pairs, r) => {
    const date = addDays(today, 1 + r * 7);
    pairs.forEach(([home, away], i) => {
      const pitch = pitches[1];
      const start = i === 0 ? '18:00' : '22:30';
      const id = `v${r + 1}_${i + 1}`;
      matches.push({ id, seasonId: season35.id, round: r + 1, homeTeamId: home, awayTeamId: away, date, start, pitchId: pitch.id, status: 'scheduled', homeScore: 0, awayScore: 0, homeLineup: [], awayLineup: [], fbLiveUrl: null, referee: null });
      slots.push({ id: slotId(pitch.id, date, start), pitchId: pitch.id, date, start, end: minutesToHHmm(hhmmToMinutes(start) + 90), status: 'blocked', reason: 'championship', matchId: id, bookingId: null, expiresAt: null });
    });
  });
  teams.push(...teams35);

  // Tournoi de démonstration : 6 équipes, 2 poules, demi-finales jouées, finale à venir
  const cup: Season = {
    ...season,
    id: 'cup-ete',
    name: 'Tournoi d’été',
    category: 'mixed',
    status: 'running',
    doubleRound: false,
    kind: 'cup',
    cupFormat: 'groups',
    maxTeams: 6,
    groupCount: 2,
    startDate: addDays(today, -14),
    rosterDeadline: addDays(today, -15),
    createdAt: season.createdAt + 2000,
  };
  const defsCup: [string, string, string, string, string][] = [
    ['Atlas Stars', 'Atlas Tech', 'AST', '#2563EB', 'A'],
    ['Medina United', 'Medina Soft', 'MDU', '#059669', 'A'],
    ['Olivier FC', 'Olivier Industries', 'OFC', '#65A30D', 'A'],
    ['Sahel Rangers', 'Sahel Logistics', 'SHR', '#D97706', 'B'],
    ['Jasmin Club', 'Jasmin Assurances', 'JCL', '#9333EA', 'B'],
    ['Byrsa City', 'Byrsa Digital', 'BYC', '#0891B2', 'B'],
  ];
  const teamsCup: Team[] = defsCup.map(([name, company, shortName, color, group], i) => ({
    id: `c${i + 1}`,
    seasonId: cup.id,
    name,
    company,
    shortName,
    color,
    logoUrl: null,
    captainId: null,
    ownerId: null,
    approved: true,
    requestStatus: 'approved' as const,
    managers: [{ name: `Responsable ${shortName}`, phone: `+216 73 00${i} 000` }],
    coach: { name: `Coach ${shortName}`, phone: `+216 98 00${i} 000` },
    group,
  }));
  for (const t of teamsCup)
    for (let i = 0; i < 7; i++)
      players.push({ id: `${t.id}p${i + 1}`, seasonId: cup.id, teamId: t.id, name: `${pick(first)} ${pick(last)}`, number: i + 1, position: positions[i % positions.length], photoUrl: null });
  const cupMatch = (id: string, o: Partial<Match> & Pick<Match, 'homeTeamId' | 'awayTeamId' | 'date'>): Match => ({
    id,
    seasonId: cup.id,
    round: 1,
    start: '19:30',
    pitchId: pitches[2].id,
    status: 'finished',
    homeScore: 0,
    awayScore: 0,
    homeLineup: [],
    awayLineup: [],
    fbLiveUrl: null,
    referee: null,
    ...o,
  });
  matches.push(
    cupMatch('cg1', { stage: 'group', group: 'A', homeTeamId: 'c1', awayTeamId: 'c2', date: addDays(today, -13), homeScore: 2, awayScore: 1 }),
    cupMatch('cg2', { stage: 'group', group: 'A', homeTeamId: 'c2', awayTeamId: 'c3', date: addDays(today, -11), homeScore: 3, awayScore: 0 }),
    cupMatch('cg3', { stage: 'group', group: 'A', homeTeamId: 'c3', awayTeamId: 'c1', date: addDays(today, -9), homeScore: 1, awayScore: 1 }),
    cupMatch('cg4', { stage: 'group', group: 'B', homeTeamId: 'c4', awayTeamId: 'c5', date: addDays(today, -13), start: '21:00', homeScore: 0, awayScore: 0 }),
    cupMatch('cg5', { stage: 'group', group: 'B', homeTeamId: 'c5', awayTeamId: 'c6', date: addDays(today, -11), start: '21:00', homeScore: 2, awayScore: 2 }),
    cupMatch('cg6', { stage: 'group', group: 'B', homeTeamId: 'c6', awayTeamId: 'c4', date: addDays(today, -9), start: '21:00', homeScore: 1, awayScore: 3 }),
    cupMatch('ck1', { stage: 'ko', koRound: 4, round: 5, homeTeamId: 'c1', awayTeamId: 'c5', date: addDays(today, -4), homeScore: 1, awayScore: 1, homePens: 4, awayPens: 2 }),
    cupMatch('ck2', { stage: 'ko', koRound: 4, round: 5, homeTeamId: 'c4', awayTeamId: 'c2', date: addDays(today, -4), start: '21:00', homeScore: 0, awayScore: 2 }),
    cupMatch('ck3', { stage: 'ko', koRound: 1, round: 6, homeTeamId: 'c5', awayTeamId: 'c4', date: addDays(today, 3), start: '18:00', status: 'scheduled' }),
    cupMatch('ck4', { stage: 'ko', koRound: 2, round: 7, homeTeamId: 'c1', awayTeamId: 'c2', date: addDays(today, 3), start: '21:00', status: 'scheduled' }),
  );
  for (const m of matches.filter((x) => x.seasonId === cup.id && x.status === 'scheduled'))
    slots.push({ id: slotId(m.pitchId!, m.date, m.start), pitchId: m.pitchId!, date: m.date, start: m.start, end: minutesToHHmm(hhmmToMinutes(m.start) + 90), status: 'blocked', reason: 'championship', matchId: m.id, bookingId: null, expiresAt: null });
  teams.push(...teamsCup);

  // Réservations fictives pour aujourd'hui et demain
  const config = { ...DEFAULT_CONFIG };
  const bookings: Booking[] = [];
  const fakeClients = [
    ['Omar Ferjani', '+216 22 145 780'],
    ['Nour Kallel', '+216 55 902 331'],
    ['Aziz Hadded', '+216 98 441 206'],
    ['Houssem Rekik', '+216 24 667 019'],
  ];
  const addBooking = (idx: number, pitch: Pitch, date: string, start: string, status: Booking['status'], ageMin: number) => {
    const sid = slotId(pitch.id, date, start);
    if (slots.some((x) => x.id === sid)) return;
    const [name, phone] = fakeClients[idx % fakeClients.length];
    const createdAt = now - ageMin * 60000;
    const end = minutesToHHmm(hhmmToMinutes(start) + 90);
    const b: Booking = {
      id: `b${bookings.length + 1}`,
      slotId: sid,
      pitchId: pitch.id,
      pitchName: pitch.name,
      date,
      start,
      end,
      userId: `client${idx}`,
      userName: name,
      userPhone: phone,
      status,
      createdAt,
      expiresAt: status === 'pending' ? Math.max(computeExpiresAt(config, date, start, createdAt), now + 10 * 60000) : createdAt,
    };
    bookings.push(b);
    slots.push({
      id: sid,
      pitchId: pitch.id,
      date,
      start,
      end,
      status: status === 'pending' ? 'pending' : 'booked',
      bookingId: b.id,
      expiresAt: status === 'pending' ? b.expiresAt : null,
      matchId: null,
      reason: null,
    });
  };
  const tomorrow = addDays(today, 1);
  addBooking(0, pitches[1], tomorrow, '18:00', 'pending', 12);
  addBooking(1, pitches[2], tomorrow, '21:00', 'pending', 7);
  addBooking(2, pitches[0], tomorrow, '16:30', 'pending', 3);
  addBooking(3, pitches[1], tomorrow, '19:30', 'confirmed', 120);
  addBooking(0, pitches[1], tomorrow, '21:00', 'confirmed', 300);
  addBooking(2, pitches[2], tomorrow, '19:30', 'confirmed', 240);
  // Historique des 25 derniers jours (tableau de bord des recettes)
  const times = ['10:30', '12:00', '16:30', '18:00', '19:30', '21:00', '22:30'];
  let r = 11;
  const next = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  for (let d = -25; d <= 0; d++) {
    const date = addDays(today, d);
    const n = 2 + Math.floor(next() * 5);
    for (let k = 0; k < n; k++) {
      const before = bookings.length;
      addBooking(Math.floor(next() * 4), pitches[Math.floor(next() * pitches.length)], date, times[Math.floor(next() * times.length)], 'confirmed', 60 * 24 * (1 - d));
      if (bookings.length > before && next() < 0.3) bookings[bookings.length - 1].manual = true;
    }
  }

  // Créneau fixe privé (réservé par téléphone auprès de l'administrateur), chaque mardi 20:00 → 21:00 ici le surlendemain 22:30
  const privateBookings: Booking[] = [];
  for (const w of [0, 7, 14]) {
    const date = addDays(today, 2 + w);
    const pitch = pitches[0];
    const sid = slotId(pitch.id, date, '22:30');
    if (slots.some((x) => x.id === sid)) continue;
    const id = `pb${w}`;
    privateBookings.push({
      id,
      slotId: sid,
      pitchId: pitch.id,
      pitchName: pitch.name,
      date,
      start: '22:30',
      end: '24:00',
      userId: 'demo-admin',
      userName: 'Sofiane Mrad',
      userPhone: '+216 23 410 556',
      status: 'confirmed',
      createdAt: now,
      expiresAt: now,
      handledBy: 'demo-admin',
      handledByName: 'Administrateur',
      manual: true,
      private: true,
      amount: 50,
      note: 'Créneau fixe hebdomadaire — payé sur place',
      seriesId: 'series-demo',
    });
    slots.push({ id: sid, pitchId: pitch.id, date, start: '22:30', end: '24:00', status: 'booked', bookingId: id, private: true, expiresAt: null, matchId: null, reason: null });
  }

  // Joueurs en cours de validation (démo des fonctionnalités entreprise / admin)
  const extraPlayers: Player[] = [
    { id: 't1x1', seasonId: season.id, teamId: 't1', name: 'Yassine Mabrouk', number: 33, position: 'MID', status: 'draft' },
    { id: 't1x2', seasonId: season.id, teamId: 't1', name: 'Fares Kchaou', number: 44, position: 'DEF', status: 'pending', submittedAt: now - 3600_000 },
    { id: 't1x3', seasonId: season.id, teamId: 't1', name: 'Malek Zouari', number: 55, position: 'FWD', status: 'rejected', rejectReason: 'Justificatif d’emploi manquant' },
    { id: 't3x1', seasonId: season.id, teamId: 't3', name: 'Hédi Ghanmi', number: 21, position: 'GK', status: 'pending', submittedAt: now - 7200_000 },
  ];
  players.push(...extraPlayers);
  const playerInfo: PlayerInfo[] = extraPlayers.map((p, i) => ({
    id: p.id,
    teamId: p.teamId,
    ownerId: p.teamId === 't1' ? 'demo-company' : null,
    birthDate: `199${i}-0${i + 3}-1${i}`,
    phone: `+216 50 000 00${i}`,
    cin: `0${i}234567`,
    jobTitle: ['Développeur', 'Comptable', 'Commercial', 'Technicien'][i],
    employeeId: `EMP-${100 + i}`,
  }));
  teams.push({
    id: 't9',
    seasonId: season.id,
    name: 'Hannibal Services',
    company: 'Hannibal Services',
    shortName: 'HAN',
    color: '#EC4899',
    logoUrl: null,
    captainId: null,
    ownerId: 'demo-company-new',
    approved: false,
    requestStatus: 'submitted',
    submittedAt: now - 5400_000,
    managers: [
      { name: 'Leila Hannibal', phone: '+216 71 222 333', email: 'rh@hannibal.tn' },
      { name: 'Omar Trabelsi', phone: '+216 22 444 555', email: 'omar@hannibal.tn' },
    ],
    coach: { name: 'Nabil Coach', phone: '+216 98 777 888' },
    collectiveCertificatePromised: true,
  });
  // Effectif de la demande Hannibal (pièces jointes de démonstration)
  // Base64 (ASCII) : les data URI SVG en "utf8" ne s'affichent pas partout
  const b64 = (str: string) => {
    const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    for (let i = 0; i < str.length; i += 3) {
      const [a, b, d] = [str.charCodeAt(i), str.charCodeAt(i + 1), str.charCodeAt(i + 2)];
      const n = (a << 16) | ((b || 0) << 8) | (d || 0);
      out += c[(n >> 18) & 63] + c[(n >> 12) & 63] + (isNaN(b) ? '=' : c[(n >> 6) & 63]) + (isNaN(d) ? '=' : c[n & 63]);
    }
    return out;
  };
  const demoDoc = (label: string, bg: string) =>
    `data:image/svg+xml;base64,${b64(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260"><rect width="400" height="260" rx="16" fill="${bg}"/><text x="200" y="120" font-family="Arial" font-size="24" font-weight="bold" fill="#111" text-anchor="middle">${label}</text><text x="200" y="160" font-family="Arial" font-size="16" fill="#333" text-anchor="middle">Document de demonstration</text></svg>`,
    )}`;
  const files: StoredFile[] = [];
  const hanNames = [['Karim', 'Ayari'], ['Sami', 'Jaziri'], ['Walid', 'Dridi'], ['Anis', 'Sassi'], ['Hatem', 'Mejri'], ['Rami', 'Gharbi'], ['Seif', 'Hammami']];
  hanNames.forEach(([fn, ln], i) => {
    const id = `t9p${i + 1}`;
    const doc = (kind: StoredFile['kind'], label: string, bg: string) => {
      const fid = `f-${id}-${kind}`;
      files.push({ id: fid, teamId: 't9', ownerId: 'demo-company-new', kind, mime: 'image/svg+xml', name: `${label}.svg`, size: 1000, data: demoDoc(`${label} - ${fn} ${ln}`, bg), createdAt: now });
      return fid;
    };
    players.push({ id, seasonId: season.id, teamId: 't9', name: `${fn} ${ln}`, number: 0, position: 'MID', status: 'pending', submittedAt: now - 5400_000, birthDate: `199${i}-0${(i % 9) + 1}-1${i}` });
    playerInfo.push({
      id,
      teamId: 't9',
      ownerId: 'demo-company-new',
      firstName: fn,
      lastName: ln,
      birthDate: `199${i}-0${(i % 9) + 1}-1${i}`,
      cinFileId: doc('cin', 'CIN', '#F4E7C5'),
      photoFileId: doc('photo', 'PHOTO', '#D9E6F5'),
      attestationFileId: i < 5 ? doc('attestation', 'ATTESTATION', '#E3F2E1') : null,
      certificateFileId: null,
    });
  });

  const news: NewsItem[] = [
    {
      id: 'n1',
      type: 'article',
      title: 'Journée 5 : Atlas Tech reste invaincu',
      body: "Nouvelle victoire pour Atlas Tech FC qui confirme sa place en haut du classement. Carthage Consulting s'accroche, tandis que la lutte pour le podium reste très ouverte.",
      imageUrl: null,
      createdAt: now - 3 * 86400000,
    },
    {
      id: 'n2',
      type: 'video',
      title: 'Les plus beaux buts du mois',
      body: 'Retour en vidéo sur les 5 plus beaux buts de la phase aller.',
      videoUrl: 'https://www.facebook.com/facebook/videos/10153231379946729/',
      createdAt: now - 5 * 86400000,
    },
    {
      id: 'n3',
      type: 'award',
      title: 'Joueur du mois : votez !',
      body: 'Trois joueurs sont nominés pour le titre de joueur du mois. Résultat annoncé à la fin de la journée 7.',
      createdAt: now - 7 * 86400000,
    },
  ];

  return {
    [COL.config]: [{ ...config, id: 'app' }],
    [COL.users]: users,
    [COL.pitches]: pitches,
    [COL.seasons]: [season, season35, cup],
    [COL.teams]: teams,
    [COL.players]: players,
    [COL.matches]: matches,
    [COL.events]: events,
    [COL.slots]: slots,
    [COL.bookings]: bookings,
    [COL.privateBookings]: privateBookings,
    [COL.news]: news,
    [COL.playerInfo]: playerInfo,
    [COL.inbox]: [],
    [COL.files]: files,
  } as unknown as Record<string, ({ id: string } & Record<string, unknown>)[]>;
}
