import {
  startersReady,
  FORFEIT_SCORE,
  SQUAD_MAX,
  squadPlacesUsed,
  planCalendar,
  pitchSchedule,
  weekdayOf,
  type PlannedMatch,
  cupFull,
  type KoRound,
  computeExpiresAt,
  effectiveSlotStatus,
  isBookingActivePending,
  isLockedByOther,
  minutesToHHmm,
  hhmmToMinutes,
  addDays,
  roundRobin,
  scoreFromEvents,
  slotId,
  dateTimeToMs,
  canCompanyEditLineup,
  isWithinBookingWindow,
  endOfDayMs,
  rosterOpen,
  sheetReady,
  LIVE_STATUSES,
  SHEET_MIN_PLAYERS,
  type MatchSheetInfo,
  type Perm,
  type SheetSide,
  type AppConfig,
  type ShowcaseItem,
  type StoredFile,
  type TeamContact,
  type Role,
  fullName,
  isPlayerApproved,
  licenseNumber,
  licensePrefix,
  type PlayerInfo,
  type Booking,
  type Match,
  type MatchEvent,
  type NewsItem,
  type Pitch,
  type Player,
  type Season,
  type SlotDoc,
  type Team,
  type UserProfile,
} from '../domain/model';
import { COL, clean, type Store } from './store';

export class AppError extends Error {
  constructor(public key: string) {
    super(key);
  }
}

export interface SlotRef {
  pitch: Pitch;
  date: string;
  start: string;
  end: string;
}

export type Services = ReturnType<typeof createServices>;

export function createServices(store: Store) {
  // ───────────── Profil ─────────────
  async function saveProfile(p: UserProfile) {
    await store.set(COL.users, p.id, p);
  }
  async function updateProfile(id: string, data: Partial<UserProfile>) {
    await store.update(COL.users, id, data);
  }
  /** Demande de suppression du compte (les données restent jusqu'au traitement par l'administration). */
  async function requestAccountDeletion(id: string, cancel = false) {
    await store.update(COL.users, id, { deletionRequestedAt: cancel ? null : Date.now() });
  }

  // ───────────── Réservations (utilisateur) ─────────────
  async function requestBooking(
    user: UserProfile,
    ref: SlotRef,
    config: AppConfig,
    myActivePending: number,
  ): Promise<string> {
    const now = Date.now();
    if (dateTimeToMs(ref.date, ref.start) <= now) throw new AppError('err.past');
    if (!isWithinBookingWindow(ref.date, now, config.bookingWindowDays || 7)) throw new AppError('err.outOfWindow');
    if (myActivePending >= config.maxPendingPerUser) throw new AppError('err.tooManyPending');
    if (ref.pitch.disabledStarts?.includes(ref.start) || ref.pitch.active === false) throw new AppError('err.slotTaken');
    const sid = slotId(ref.pitch.id, ref.date, ref.start);
    const bookingId = store.newId(COL.bookings);
    const expiresAt = computeExpiresAt(config, ref.date, ref.start, now);
    await store.runTransaction(async (tx) => {
      const slot = await tx.get<SlotDoc>(COL.slots, sid);
      if (effectiveSlotStatus(slot, now) !== 'free') throw new AppError('err.slotTaken');
      const booking: Booking = {
        id: bookingId,
        slotId: sid,
        pitchId: ref.pitch.id,
        pitchName: ref.pitch.name,
        date: ref.date,
        start: ref.start,
        end: ref.end,
        userId: user.id,
        userName: user.name,
        userPhone: user.phone,
        status: 'pending',
        createdAt: now,
        expiresAt,
      };
      tx.set(COL.bookings, bookingId, booking);
      const doc: SlotDoc = {
        id: sid,
        pitchId: ref.pitch.id,
        date: ref.date,
        start: ref.start,
        end: ref.end,
        status: 'pending',
        bookingId,
        expiresAt,
        matchId: null,
        reason: null,
      };
      tx.set(COL.slots, sid, doc);
    });
    return bookingId;
  }

  /** Libère le créneau seulement s'il pointe encore sur cette réservation. */
  async function releaseSlotTx(
    tx: Parameters<Parameters<Store['runTransaction']>[0]>[0],
    b: Booking,
  ) {
    const slot = await tx.get<SlotDoc>(COL.slots, b.slotId);
    return slot && slot.bookingId === b.id ? () => tx.remove(COL.slots, b.slotId) : () => {};
  }

  async function cancelMyBooking(bookingId: string) {
    await store.runTransaction(async (tx) => {
      const b = await tx.get<Booking>(COL.bookings, bookingId);
      if (!b || b.status !== 'pending') throw new AppError('err.notPending');
      const release = await releaseSlotTx(tx, b);
      tx.update(COL.bookings, bookingId, { status: 'cancelled', handledAt: Date.now() });
      release();
    });
  }

  // ───────────── Réservations (agent) ─────────────
  async function lockBooking(bookingId: string, agent: UserProfile) {
    await store.runTransaction(async (tx) => {
      const b = await tx.get<Booking>(COL.bookings, bookingId);
      if (!b || !isBookingActivePending(b, Date.now())) throw new AppError('err.notPending');
      if (isLockedByOther(b, agent.id, Date.now())) throw new AppError('err.locked');
      tx.update(COL.bookings, bookingId, { lockedBy: agent.id, lockedByName: agent.name, lockedAt: Date.now() });
    });
  }

  async function confirmBooking(bookingId: string, agent: UserProfile) {
    await store.runTransaction(async (tx) => {
      const now = Date.now();
      const b = await tx.get<Booking>(COL.bookings, bookingId);
      if (!b || b.status !== 'pending') throw new AppError('err.notPending');
      if (isLockedByOther(b, agent.id, now)) throw new AppError('err.locked');
      const slot = await tx.get<SlotDoc>(COL.slots, b.slotId);
      // Le créneau doit encore appartenir à cette demande (sinon elle a expiré et été reprise).
      if (slot && slot.bookingId !== b.id && effectiveSlotStatus(slot, now) !== 'free')
        throw new AppError('err.slotTaken');
      tx.update(COL.bookings, bookingId, {
        status: 'confirmed',
        handledBy: agent.id,
        handledByName: agent.name,
        handledAt: now,
        lockedBy: null,
        lockedAt: null,
      });
      tx.set(COL.slots, b.slotId, {
        id: b.slotId,
        pitchId: b.pitchId,
        date: b.date,
        start: b.start,
        end: b.end,
        status: 'booked',
        bookingId: b.id,
        expiresAt: null,
        matchId: null,
        reason: null,
      } satisfies SlotDoc);
    });
  }

  async function refuseBooking(bookingId: string, agent: UserProfile, reason: string) {
    await store.runTransaction(async (tx) => {
      const b = await tx.get<Booking>(COL.bookings, bookingId);
      if (!b || b.status !== 'pending') throw new AppError('err.notPending');
      const release = await releaseSlotTx(tx, b);
      tx.update(COL.bookings, bookingId, {
        status: 'refused',
        reason,
        handledBy: agent.id,
        handledByName: agent.name,
        handledAt: Date.now(),
        lockedBy: null,
        lockedAt: null,
      });
      release();
    });
  }

  /** Annulation d'une réservation confirmée (par l'agent, à la demande du client). */
  async function cancelConfirmed(bookingId: string, agent: UserProfile, reason: string) {
    await store.runTransaction(async (tx) => {
      const b = await tx.get<Booking>(COL.bookings, bookingId);
      if (!b || b.status !== 'confirmed') throw new AppError('common.error');
      const release = await releaseSlotTx(tx, b);
      tx.update(COL.bookings, bookingId, {
        status: 'cancelled',
        reason,
        handledBy: agent.id,
        handledByName: agent.name,
        handledAt: Date.now(),
      });
      release();
    });
  }

  /** Passe en "expirée" les demandes dépassées (lancé périodiquement par l'écran agent). */
  async function expireOverdue(bookings: Booking[]) {
    const now = Date.now();
    for (const b of bookings) {
      if (b.status !== 'pending' || b.expiresAt > now) continue;
      try {
        await store.runTransaction(async (tx) => {
          const cur = await tx.get<Booking>(COL.bookings, b.id);
          if (!cur || cur.status !== 'pending' || cur.expiresAt > Date.now()) return;
          const release = await releaseSlotTx(tx, cur);
          tx.update(COL.bookings, b.id, { status: 'expired', handledAt: Date.now() });
          release();
        });
      } catch (e) {
        console.warn('expireOverdue', e);
      }
    }
  }

  /** Réservation saisie par l'agent pour un client au téléphone : confirmée directement. */
  async function createManualBooking(agent: UserProfile, ref: SlotRef, clientName: string, clientPhone: string) {
    const now = Date.now();
    const sid = slotId(ref.pitch.id, ref.date, ref.start);
    const bookingId = store.newId(COL.bookings);
    await store.runTransaction(async (tx) => {
      const slot = await tx.get<SlotDoc>(COL.slots, sid);
      if (effectiveSlotStatus(slot, now) !== 'free') throw new AppError('err.slotTaken');
      const booking: Booking = {
        id: bookingId,
        slotId: sid,
        pitchId: ref.pitch.id,
        pitchName: ref.pitch.name,
        date: ref.date,
        start: ref.start,
        end: ref.end,
        userId: agent.id,
        userName: clientName,
        userPhone: clientPhone,
        status: 'confirmed',
        createdAt: now,
        expiresAt: now,
        handledBy: agent.id,
        handledByName: agent.name,
        handledAt: now,
        manual: true,
      };
      tx.set(COL.bookings, bookingId, booking);
      tx.set(COL.slots, sid, {
        id: sid,
        pitchId: ref.pitch.id,
        date: ref.date,
        start: ref.start,
        end: ref.end,
        status: 'booked',
        bookingId,
        expiresAt: null,
        matchId: null,
        reason: null,
      } satisfies SlotDoc);
    });
  }

  async function setSlotBlocked(ref: SlotRef, blocked: boolean, reason: string) {
    const sid = slotId(ref.pitch.id, ref.date, ref.start);
    await store.runTransaction(async (tx) => {
      const slot = await tx.get<SlotDoc>(COL.slots, sid);
      const status = effectiveSlotStatus(slot, Date.now());
      if (blocked) {
        if (status !== 'free') throw new AppError('err.slotTaken');
        tx.set(COL.slots, sid, {
          id: sid,
          pitchId: ref.pitch.id,
          date: ref.date,
          start: ref.start,
          end: ref.end,
          status: 'blocked',
          reason,
          bookingId: null,
          matchId: null,
          expiresAt: null,
        } satisfies SlotDoc);
      } else if (slot && slot.status === 'blocked') {
        tx.remove(COL.slots, sid);
      }
    });
  }

  // ───────────── Paramètres ─────────────
  async function saveConfig(config: AppConfig) {
    await store.set(COL.config, 'app', config);
  }
  async function savePitch(p: Pitch) {
    const id = p.id || store.newId(COL.pitches);
    await store.set(COL.pitches, id, clean({ ...p, id }));
  }

  /** Supprime un terrain (refusé s'il accueille encore des matchs à venir du championnat). */
  async function deletePitch(pitch: Pitch) {
    const matches = await store.query<Match>(COL.matches, [['pitchId', pitch.id]]);
    if (matches.some((m) => m.status === 'scheduled' || m.status === 'postponed' || LIVE_STATUSES.includes(m.status))) throw new AppError('err.pitchInUse');
    await store.remove(COL.pitches, pitch.id);
  }

  /** Clé CallMeBot : envoi automatique des messages WhatsApp à l'administrateur. */
  async function saveWhatsappKey(apiKey: string) {
    await store.set(COL.config, 'whatsapp', { apiKey: apiKey.trim() });
  }

  // ───────────── Vitrine : carrousel et vidéos ─────────────
  async function saveShowcase(item: Omit<ShowcaseItem, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) {
    const id = item.id || store.newId(COL.showcase);
    await store.set(COL.showcase, id, clean({ ...item, id, createdAt: item.createdAt ?? Date.now() }));
    return id;
  }
  async function deleteShowcase(id: string) {
    await store.remove(COL.showcase, id);
  }

  /**
   * Réinitialise la saison : supprime calendrier, résultats, équipes et joueurs,
   * libère les créneaux du championnat et rouvre les inscriptions.
   * Les comptes entreprise sont détachés de leur équipe pour pouvoir se réinscrire depuis l'app.
   */
  async function resetSeason(season: Season) {
    const ops: Parameters<Store['batch']>[0] = [];
    const [matches, events, teams, players] = await Promise.all([
      store.query<Match>(COL.matches, [['seasonId', season.id]]),
      store.query<MatchEvent>(COL.events, [['seasonId', season.id]]),
      store.query<Team>(COL.teams, [['seasonId', season.id]]),
      store.query<Player>(COL.players, [['seasonId', season.id]]),
    ]);
    const champSlots = await store.query<SlotDoc>(COL.slots, [['reason', 'championship']]);
    for (const m of matches) ops.push({ type: 'remove', col: COL.matches, id: m.id });
    for (const e of events) ops.push({ type: 'remove', col: COL.events, id: e.id });
    for (const t of teams) ops.push({ type: 'remove', col: COL.teams, id: t.id });
    for (const p of players) {
      ops.push({ type: 'remove', col: COL.players, id: p.id });
      ops.push({ type: 'remove', col: COL.playerInfo, id: p.id });
    }
    const matchIds = new Set(matches.map((m) => m.id));
    for (const sl of champSlots) if (!sl.matchId || matchIds.has(sl.matchId)) ops.push({ type: 'remove', col: COL.slots, id: sl.id });
    const teamIds = new Set(teams.map((t) => t.id));
    const companies = await store.query<UserProfile>(COL.users, [['role', 'company']]);
    for (const u of companies) if (u.teamId && teamIds.has(u.teamId)) ops.push({ type: 'update', col: COL.users, id: u.id, data: { teamId: null } });
    for (let i = 0; i < ops.length; i += 400) await store.batch(ops.slice(i, i + 400));
    await store.update(COL.seasons, season.id, { status: 'registration' });
    return { matches: matches.length, teams: teams.length, players: players.length };
  }
  async function setUserRole(userId: string, role: UserProfile['role'], team?: Team | null) {
    await store.update(COL.users, userId, {
      role,
      teamId: role === 'company' ? team?.id ?? null : null,
      companyName: role === 'company' ? team?.company ?? null : null,
    });
  }

  /** Permissions d'un compte du personnel (null = valeurs par défaut du rôle). */
  async function setUserPerms(userId: string, perms: Partial<Record<Perm, boolean>> | null) {
    await store.update(COL.users, userId, { perms });
  }

  // ───────────── Championnat : saison, équipes, joueurs ─────────────
  /** Nouveau championnat (plusieurs peuvent être actifs en même temps : mixte, +35…). */
  async function createSeason(
    name: string,
    opts: {
      category?: Season['category'];
      startDate?: string | null;
      rosterDeadline?: string | null;
      kind?: Season['kind'];
      cupFormat?: Season['cupFormat'];
      maxTeams?: number | null;
      groupCount?: number | null;
    } = {},
  ): Promise<string> {
    const id = store.newId(COL.seasons);
    const season: Season = {
      id,
      name,
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
      category: opts.category ?? 'mixed',
      startDate: opts.startDate ?? null,
      rosterDeadline: opts.rosterDeadline ?? null,
      rosterDeadlineAt: opts.rosterDeadline ? endOfDayMs(opts.rosterDeadline) : null,
      kind: opts.kind ?? 'league',
      ...(opts.kind === 'cup'
        ? {
            cupFormat: opts.cupFormat ?? 'groups',
            maxTeams: opts.maxTeams ?? null,
            groupCount: opts.cupFormat === 'knockout' ? null : Math.max(1, opts.groupCount ?? 2),
            doubleRound: false,
          }
        : {}),
    };
    await store.set(COL.seasons, id, season);
    return id;
  }
  /** Tirage au sort entre équipes à égalité parfaite : ordre aléatoire enregistré dans le championnat. */
  async function drawLots(season: Season, teamIds: string[]): Promise<string[]> {
    const order = [...teamIds];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const rest = (season.lotOrder ?? []).filter((id) => !teamIds.includes(id));
    await store.update(COL.seasons, season.id, { lotOrder: [...rest, ...order] });
    return order;
  }
  async function updateSeason(id: string, data: Partial<Season>) {
    const extra = 'rosterDeadline' in data ? { rosterDeadlineAt: data.rosterDeadline ? endOfDayMs(data.rosterDeadline) : null } : {};
    await store.update(COL.seasons, id, { ...data, ...extra });
  }

  /** Supprime un championnat et tout son contenu (équipes, joueurs, pièces, matchs, résultats). */
  async function deleteSeason(season: Season) {
    const teams = await store.query<Team>(COL.teams, [['seasonId', season.id]]);
    await resetSeason(season);
    const ops: Parameters<Store['batch']>[0] = [];
    for (const t of teams) {
      const files = await store.query<StoredFile>(COL.files, [['teamId', t.id]]).catch(() => [] as StoredFile[]);
      for (const f of files) ops.push({ type: 'remove', col: COL.files, id: f.id });
    }
    ops.push({ type: 'remove', col: COL.seasons, id: season.id });
    for (let i = 0; i < ops.length; i += 400) await store.batch(ops.slice(i, i + 400));
  }

  async function saveTeam(season: Season, team: Omit<Team, 'id'> & { id?: string }) {
    if (!team.id && season.status !== 'registration') throw new AppError('err.seasonStarted');
    const id = team.id || store.newId(COL.teams);
    await store.set(COL.teams, id, { ...team, id, seasonId: season.id });
    return id;
  }
  /** Tournoi à poules : poule d'une équipe (null = sans poule). */
  async function setTeamGroup(teamId: string, group: string | null) {
    await store.update(COL.teams, teamId, { group });
  }
  async function deleteTeam(season: Season, teamId: string) {
    if (season.status !== 'registration') throw new AppError('err.seasonStarted');
    const players = await store.query<Player>(COL.players, [['teamId', teamId]]);
    await store.batch([
      { type: 'remove', col: COL.teams, id: teamId },
      ...players.map((p) => ({ type: 'remove' as const, col: COL.players, id: p.id })),
    ]);
  }
  async function savePlayer(player: Omit<Player, 'id'> & { id?: string }) {
    if (!player.id) {
      const squad = await store.query<Player>(COL.players, [['teamId', player.teamId]]);
      if (squadPlacesUsed(squad) >= SQUAD_MAX) throw new AppError('err.squadFull');
    }
    const id = player.id || store.newId(COL.players);
    await store.set(COL.players, id, { ...player, id });
    return id;
  }
  async function deletePlayer(id: string) {
    await store.remove(COL.players, id);
  }

  /**
   * Génère le calendrier (round-robin) : une journée par semaine à partir de startDate.
   * Les matchs d'une journée sont répartis sur les terrains choisis, créneau après créneau.
   * Les créneaux correspondants sont bloqués dans le module réservation.
   */
  async function generateCalendar(
    season: Season,
    teams: Team[],
    opts: { startDate: string; startTime: string; pitches: Pitch[]; daysBetweenRounds: number; slotMinutes: number },
    existingMatches: Match[],
  ): Promise<{ created: number; conflicts: string[] }> {
    if (season.status !== 'registration') throw new AppError('err.seasonStarted');
    if (teams.length < 2 || opts.pitches.length === 0) throw new AppError('err.calendarInput');
    const rounds = roundRobin(
      teams.map((t) => t.id),
      season.doubleRound,
    );
    const ops: Parameters<Store['batch']>[0] = [];
    // Nettoyage de l'ancien calendrier et de ses blocages
    for (const m of existingMatches) {
      ops.push({ type: 'remove', col: COL.matches, id: m.id });
      if (m.pitchId) {
        const sid = slotId(m.pitchId, m.date, m.start);
        const s = await store.get<SlotDoc>(COL.slots, sid);
        if (s && s.matchId === m.id) ops.push({ type: 'remove', col: COL.slots, id: sid });
      }
    }
    const conflicts: string[] = [];
    let created = 0;
    for (let r = 0; r < rounds.length; r++) {
      const date = addDays(opts.startDate, r * opts.daysBetweenRounds);
      for (let i = 0; i < rounds[r].length; i++) {
        const [home, away] = rounds[r][i];
        const pitch = opts.pitches[i % opts.pitches.length];
        const startMin = hhmmToMinutes(opts.startTime) + Math.floor(i / opts.pitches.length) * opts.slotMinutes;
        const start = minutesToHHmm(startMin);
        const end = minutesToHHmm(startMin + opts.slotMinutes);
        const id = store.newId(COL.matches);
        const match: Match = {
          id,
          seasonId: season.id,
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
          plannedAt: dateTimeToMs(date, start),
        };
        ops.push({ type: 'set', col: COL.matches, id, data: match });
        created++;
        const sid = slotId(pitch.id, date, start);
        const existing = await store.get<SlotDoc>(COL.slots, sid);
        if (existing && effectiveSlotStatus(existing, Date.now()) !== 'free' && !existingMatches.some((m) => m.id === existing.matchId)) {
          conflicts.push(`${date} ${start} — ${pitch.name}`);
          continue;
        }
        ops.push({
          type: 'set',
          col: COL.slots,
          id: sid,
          data: {
            id: sid,
            pitchId: pitch.id,
            date,
            start,
            end,
            status: 'blocked',
            reason: 'championship',
            matchId: id,
            bookingId: null,
            expiresAt: null,
          } satisfies SlotDoc,
        });
      }
    }
    await store.batch(ops);
    return { created, conflicts };
  }

  /**
   * Générateur automatique (site) : propose un calendrier sur les jours, heures et terrains choisis.
   * Les matchs joués ou en cours sont conservés ; les matchs à venir seront remplacés à la validation.
   */
  async function planAutoCalendar(
    teams: Team[],
    existing: Match[],
    opts: { startDate: string; weekdays: number[]; times: string[]; pitches: Pitch[]; doubleRound: boolean; seed: number },
    config: AppConfig,
  ): Promise<{ matches: PlannedMatch[]; unplaced: [string, string][]; replaced: number; kept: number }> {
    if (teams.length < 2 || !opts.pitches.length || !opts.times.length || !opts.weekdays.length) throw new AppError('err.calendarInput');
    const keep = existing.filter((m) => m.status !== 'scheduled' && m.status !== 'postponed');
    const replaceIds = new Set(existing.filter((m) => m.status === 'scheduled' || m.status === 'postponed').map((m) => m.id));
    const DAYS = 240;
    const dates: string[] = [];
    for (let i = 0; i < DAYS; i++) {
      const d = addDays(opts.startDate, i);
      if (opts.weekdays.includes(weekdayOf(d))) dates.push(d);
    }
    // Créneaux déjà occupés sur la période (réservations, blocages, autres championnats)
    const byDate = new Map<string, Map<string, SlotDoc>>();
    await Promise.all(
      dates.map(async (d) => {
        const list = await store.query<SlotDoc>(COL.slots, [['date', d]]);
        byDate.set(d, new Map(list.map((x) => [x.id, x])));
      }),
    );
    const now = Date.now();
    const pitchById = new Map(opts.pitches.map((p) => [p.id, p]));
    const free = (pitchId: string, date: string, start: string) => {
      const pitch = pitchById.get(pitchId);
      if (!pitch || !pitch.active) return false;
      if (!pitchSchedule(config, pitch, date).starts.includes(start)) return false;
      if (pitch.disabledStarts?.includes(start)) return false;
      if (dateTimeToMs(date, start) <= now) return false;
      const doc = byDate.get(date)?.get(slotId(pitchId, date, start));
      if (doc?.matchId && replaceIds.has(doc.matchId)) return true;
      return effectiveSlotStatus(doc, now) === 'free';
    };
    const plan = planCalendar({
      teamIds: teams.map((x) => x.id),
      doubleRound: opts.doubleRound,
      keep,
      startDate: opts.startDate,
      weekdays: opts.weekdays,
      times: opts.times,
      pitchIds: opts.pitches.map((p) => p.id),
      free,
      maxDays: DAYS,
      seed: opts.seed,
    });
    return { ...plan, replaced: replaceIds.size, kept: keep.length };
  }

  /** Enregistre le calendrier proposé : supprime les matchs à venir, crée les nouveaux et bloque leurs créneaux. */
  async function applyCalendarPlan(season: Season, plan: PlannedMatch[], existing: Match[], slotMinutes: number, doubleRound: boolean): Promise<number> {
    const ops: Parameters<Store['batch']>[0] = [];
    for (const m of existing.filter((x) => x.status === 'scheduled' || x.status === 'postponed')) {
      ops.push({ type: 'remove', col: COL.matches, id: m.id });
      if (m.pitchId) {
        const sid = slotId(m.pitchId, m.date, m.start);
        const sl = await store.get<SlotDoc>(COL.slots, sid);
        if (sl && sl.matchId === m.id) ops.push({ type: 'remove', col: COL.slots, id: sid });
      }
    }
    for (const p of plan) {
      const id = store.newId(COL.matches);
      const match: Match = {
        id,
        seasonId: season.id,
        round: p.round,
        homeTeamId: p.homeTeamId,
        awayTeamId: p.awayTeamId,
        date: p.date,
        start: p.start,
        pitchId: p.pitchId,
        status: 'scheduled',
        homeScore: 0,
        awayScore: 0,
        homeLineup: [],
        awayLineup: [],
        fbLiveUrl: null,
        referee: null,
        plannedAt: dateTimeToMs(p.date, p.start),
      };
      ops.push({ type: 'set', col: COL.matches, id, data: match });
      const sid = slotId(p.pitchId, p.date, p.start);
      ops.push({
        type: 'set',
        col: COL.slots,
        id: sid,
        data: {
          id: sid,
          pitchId: p.pitchId,
          date: p.date,
          start: p.start,
          end: minutesToHHmm(hhmmToMinutes(p.start) + slotMinutes),
          status: 'blocked',
          reason: 'championship',
          matchId: id,
          bookingId: null,
          expiresAt: null,
        } satisfies SlotDoc,
      });
    }
    if (season.doubleRound !== doubleRound) ops.push({ type: 'update', col: COL.seasons, id: season.id, data: { doubleRound } });
    await store.batch(ops);
    return plan.length;
  }

  async function updateMatch(id: string, data: Partial<Match>) {
    await store.update(COL.matches, id, data);
  }

  /** Feuille de match : joueurs de chaque équipe, capitaine, entraîneur, délégué, arbitre (obligatoire avant le coup d'envoi). */
  async function saveSheet(match: Match, sheet: { home: SheetSide; away: SheetSide; referee?: string | null }, by: UserProfile) {
    if (sheet.home.playerIds.length < SHEET_MIN_PLAYERS || sheet.away.playerIds.length < SHEET_MIN_PLAYERS) throw new AppError('err.sheetPlayers');
    // Titulaires déjà choisis : on ne garde que ceux encore présents sur la feuille
    for (const side of [sheet.home, sheet.away]) side.starters = (side.starters ?? []).filter((x) => side.playerIds.includes(x));
    const info: MatchSheetInfo = {
      status: match.sheet?.status === 'final' ? 'final' : 'ready',
      home: sheet.home,
      away: sheet.away,
      referee: sheet.referee ?? null,
      filledBy: by.name,
      filledAt: Date.now(),
      finalizedBy: match.sheet?.finalizedBy ?? null,
      finalizedAt: match.sheet?.finalizedAt ?? null,
    };
    await store.update(COL.matches, match.id, {
      sheet: info,
      homeLineup: sheet.home.playerIds,
      awayLineup: sheet.away.playerIds,
      referee: sheet.referee ?? match.referee ?? null,
    });
    return info;
  }

  /** Après le match : la feuille est complétée (score, buteurs, cartons, remplacements) et validée. */
  async function finalizeSheet(match: Match, by: UserProfile) {
    if (match.status !== 'finished') throw new AppError('err.sheetNotFinished');
    if (!match.sheet) throw new AppError('err.sheetMissing');
    await store.update(COL.matches, match.id, { sheet: { ...match.sheet, status: 'final', finalizedBy: by.name, finalizedAt: Date.now() } });
  }

  /** Coup d'envoi : la saison passe "en cours" et les inscriptions sont fermées. */
  /** Avant le coup d'envoi : titulaires (équipe qui commence) de chaque équipe, parmi les joueurs présents sur la feuille. */
  async function saveStarters(match: Match, home: string[], away: string[], max: number) {
    if (!match.sheet) throw new AppError('err.sheetMissing');
    const sheet = match.sheet;
    const clean = (ids: string[], side: SheetSide) => ids.filter((x) => side.playerIds.includes(x));
    const h = clean(home, sheet.home);
    const a = clean(away, sheet.away);
    if (h.length < SHEET_MIN_PLAYERS || a.length < SHEET_MIN_PLAYERS) throw new AppError('err.sheetStarters');
    if (h.length > max || a.length > max) throw new AppError('err.tooManyStarters');
    await updateMatch(match.id, { sheet: { ...sheet, home: { ...sheet.home, starters: h }, away: { ...sheet.away, starters: a } } });
  }

  async function startMatch(match: Match, season: Season) {
    // Le match ne peut commencer que si la feuille de match est remplie et l'équipe qui commence choisie
    if (!sheetReady(match)) throw new AppError('err.sheetMissing');
    if (!startersReady(match)) throw new AppError('err.startersMissing');
    const ops: Parameters<Store['batch']>[0] = [
      { type: 'update', col: COL.matches, id: match.id, data: { status: 'first_half', kickoffAt: Date.now() } },
    ];
    if (season.status === 'registration')
      ops.push({ type: 'update', col: COL.seasons, id: season.id, data: { status: 'running' } });
    await store.batch(ops);
  }
  async function halfTime(match: Match) {
    await updateMatch(match.id, { status: 'half_time' });
  }
  async function startSecondHalf(match: Match) {
    await updateMatch(match.id, { status: 'second_half', secondHalfAt: Date.now() });
  }
  async function finishMatch(match: Match) {
    await updateMatch(match.id, { status: 'finished', finishedAt: Date.now() });
  }
  /** Tirs au but (match à élimination terminé sur un nul) ; null efface. */
  async function setPenalties(match: Match, home: number | null, away: number | null) {
    if (home != null && away != null && home === away) throw new AppError('err.pensDraw');
    await updateMatch(match.id, { homePens: home, awayPens: away });
  }
  async function reopenMatch(match: Match) {
    await updateMatch(match.id, { status: 'second_half' });
  }

  /** Ajoute un événement et met à jour le score. Un 2e jaune génère automatiquement le rouge. */
  async function addEvent(
    match: Match,
    matchEvents: MatchEvent[],
    ev: Omit<MatchEvent, 'id' | 'createdAt' | 'matchId' | 'seasonId'>,
  ): Promise<{ autoRed: boolean; homeScore: number; awayScore: number }> {
    const now = Date.now();
    const newEv: MatchEvent = { ...ev, id: store.newId(COL.events), matchId: match.id, seasonId: match.seasonId, createdAt: now };
    const toAdd: MatchEvent[] = [newEv];
    let autoRed = false;
    if (ev.type === 'yellow') {
      const prevYellows = matchEvents.filter((e) => e.type === 'yellow' && e.playerId === ev.playerId).length;
      const alreadyRed = matchEvents.some((e) => e.type === 'red' && e.playerId === ev.playerId);
      if (prevYellows >= 1 && !alreadyRed) {
        autoRed = true;
        toAdd.push({ ...newEv, id: store.newId(COL.events), type: 'red', secondYellow: true, assistId: null, createdAt: now + 1 });
      }
    }
    const all = [...matchEvents, ...toAdd];
    const score = scoreFromEvents(match, all);
    await store.batch([
      ...toAdd.map((e) => ({ type: 'set' as const, col: COL.events, id: e.id, data: e })),
      { type: 'update', col: COL.matches, id: match.id, data: score },
    ]);
    return { autoRed, ...score };
  }

  async function deleteEvent(match: Match, matchEvents: MatchEvent[], ev: MatchEvent) {
    const toRemove = [ev.id];
    if (ev.type === 'yellow') {
      const auto = matchEvents.find((e) => e.type === 'red' && e.secondYellow && e.playerId === ev.playerId);
      if (auto) toRemove.push(auto.id);
    }
    const rest = matchEvents.filter((e) => !toRemove.includes(e.id));
    const score = scoreFromEvents(match, rest);
    await store.batch([
      ...toRemove.map((id) => ({ type: 'remove' as const, col: COL.events, id })),
      { type: 'update', col: COL.matches, id: match.id, data: score },
    ]);
  }

  async function updateEvent(match: Match, matchEvents: MatchEvent[], ev: MatchEvent) {
    const all = matchEvents.map((e) => (e.id === ev.id ? ev : e));
    await store.batch([
      { type: 'set', col: COL.events, id: ev.id, data: ev },
      { type: 'update', col: COL.matches, id: match.id, data: scoreFromEvents(match, all) },
    ]);
  }

  /** Déplace un match (date/heure/terrain) et son blocage de créneau. */
  async function rescheduleMatch(match: Match, date: string, start: string, pitch: Pitch, slotMinutes: number) {
    const newSid = slotId(pitch.id, date, start);
    await store.runTransaction(async (tx) => {
      const target = await tx.get<SlotDoc>(COL.slots, newSid);
      if (target && target.matchId !== match.id && effectiveSlotStatus(target, Date.now()) !== 'free')
        throw new AppError('err.slotTaken');
      if (match.pitchId) {
        const oldSid = slotId(match.pitchId, match.date, match.start);
        const old = await tx.get<SlotDoc>(COL.slots, oldSid);
        if (old && old.matchId === match.id && oldSid !== newSid) tx.remove(COL.slots, oldSid);
      }
      tx.update(COL.matches, match.id, {
        date,
        start,
        plannedAt: dateTimeToMs(date, start),
        pitchId: pitch.id,
        status: match.status === 'postponed' ? 'scheduled' : match.status,
      });
      tx.set(COL.slots, newSid, {
        id: newSid,
        pitchId: pitch.id,
        date,
        start,
        end: minutesToHHmm(hhmmToMinutes(start) + slotMinutes),
        status: 'blocked',
        reason: 'championship',
        matchId: match.id,
        bookingId: null,
        expiresAt: null,
      } satisfies SlotDoc);
    });
  }


  // ───────────── Calendrier saisi par l'administrateur ─────────────

  /** Bloque le créneau d'un match dans le module réservation (dans une transaction). */
  function blockMatchSlot(tx: Parameters<Parameters<Store['runTransaction']>[0]>[0], matchId: string, pitch: Pitch, date: string, start: string, slotMinutes: number) {
    const sid = slotId(pitch.id, date, start);
    tx.set(COL.slots, sid, {
      id: sid,
      pitchId: pitch.id,
      date,
      start,
      end: minutesToHHmm(hhmmToMinutes(start) + slotMinutes),
      status: 'blocked',
      reason: 'championship',
      matchId,
      bookingId: null,
      expiresAt: null,
    } satisfies SlotDoc);
  }

  /** Ajoute un match au calendrier (journée, équipes, date, heure, terrain). */
  async function createMatch(
    season: Season,
    data: {
      round: number;
      homeTeamId: string;
      awayTeamId: string;
      date: string;
      start: string;
      pitch: Pitch;
      stage?: 'group' | 'ko' | null;
      group?: string | null;
      koRound?: KoRound | null;
    },
    slotMinutes: number,
  ): Promise<string> {
    if (!data.homeTeamId || !data.awayTeamId || data.homeTeamId === data.awayTeamId) throw new AppError('err.calendarInput');
    const id = store.newId(COL.matches);
    const sid = slotId(data.pitch.id, data.date, data.start);
    await store.runTransaction(async (tx) => {
      const slot = await tx.get<SlotDoc>(COL.slots, sid);
      if (effectiveSlotStatus(slot, Date.now()) !== 'free') throw new AppError('err.slotTaken');
      const match: Match = {
        id,
        seasonId: season.id,
        round: Math.max(1, data.round),
        homeTeamId: data.homeTeamId,
        awayTeamId: data.awayTeamId,
        date: data.date,
        start: data.start,
        pitchId: data.pitch.id,
        status: 'scheduled',
        homeScore: 0,
        awayScore: 0,
        homeLineup: [],
        awayLineup: [],
        fbLiveUrl: null,
        referee: null,
        plannedAt: dateTimeToMs(data.date, data.start),
        ...(data.stage ? { stage: data.stage, group: data.stage === 'group' ? data.group ?? null : null, koRound: data.stage === 'ko' ? data.koRound ?? null : null } : {}),
      };
      tx.set(COL.matches, id, match);
      blockMatchSlot(tx, id, data.pitch, data.date, data.start, slotMinutes);
    });
    return id;
  }

  /** Modifie la journée ou les équipes d'un match (la date/heure passe par rescheduleMatch). */
  async function editMatchTeams(
    match: Match,
    data: { round: number; homeTeamId: string; awayTeamId: string; stage?: 'group' | 'ko' | null; group?: string | null; koRound?: KoRound | null },
  ) {
    if (data.homeTeamId === data.awayTeamId) throw new AppError('err.calendarInput');
    const changed = data.homeTeamId !== match.homeTeamId || data.awayTeamId !== match.awayTeamId;
    await store.update(COL.matches, match.id, {
      round: Math.max(1, data.round),
      ...(data.stage ? { stage: data.stage, group: data.stage === 'group' ? data.group ?? null : null, koRound: data.stage === 'ko' ? data.koRound ?? null : null } : {}),
      homeTeamId: data.homeTeamId,
      awayTeamId: data.awayTeamId,
      // Nouvelles équipes : les sélections précédentes ne sont plus valables
      ...(changed ? { homeLineup: [], awayLineup: [] } : {}),
    });
  }

  /** Match reporté (date à fixer) : le créneau est libéré pour les réservations. */
  async function postponeMatch(match: Match) {
    await store.runTransaction(async (tx) => {
      if (match.pitchId) {
        const sid = slotId(match.pitchId, match.date, match.start);
        const slot = await tx.get<SlotDoc>(COL.slots, sid);
        if (slot && slot.matchId === match.id) tx.remove(COL.slots, sid);
      }
      tx.update(COL.matches, match.id, { status: 'postponed' });
    });
  }

  /**
   * Forfait : l'équipe a moins de 4 joueurs au coup d'envoi → match terminé, perdu 0-2.
   * (Les deux équipes incomplètes : le match est reporté avec postponeMatch.)
   */
  async function declareForfeit(match: Match, side: 'home' | 'away') {
    if (match.status !== 'scheduled' && match.status !== 'postponed') throw new AppError('err.forfeitStarted');
    await updateMatch(match.id, {
      status: 'finished',
      forfeit: side,
      homeScore: side === 'home' ? 0 : FORFEIT_SCORE,
      awayScore: side === 'away' ? 0 : FORFEIT_SCORE,
      kickoffAt: null,
      finishedAt: Date.now(),
    });
  }
  /** Annule un forfait déclaré par erreur : le match redevient « programmé ». */
  async function cancelForfeit(match: Match) {
    await updateMatch(match.id, { status: 'scheduled', forfeit: null, homeScore: 0, awayScore: 0, finishedAt: null });
  }

  /** Supprime un match du calendrier (avec ses événements et son blocage de créneau). */
  async function deleteMatch(match: Match) {
    const events = await store.query<MatchEvent>(COL.events, [['matchId', match.id]]);
    const ops: Parameters<Store['batch']>[0] = [{ type: 'remove', col: COL.matches, id: match.id }];
    for (const e of events) ops.push({ type: 'remove', col: COL.events, id: e.id });
    if (match.pitchId) {
      const sid = slotId(match.pitchId, match.date, match.start);
      const slot = await store.get<SlotDoc>(COL.slots, sid);
      if (slot && slot.matchId === match.id) ops.push({ type: 'remove', col: COL.slots, id: sid });
    }
    await store.batch(ops);
  }

  // ───────────── Réservations privées (administrateur, client au téléphone) ─────────────

  /**
   * Fixe un créneau à un particulier qui a réservé par téléphone.
   * Le créneau disparaît de l'application des particuliers ; les détails ne sont visibles que par l'administrateur.
   * weeks > 1 : créneau fixe répété chaque semaine (les dates déjà prises sont ignorées et signalées).
   */
  async function createPrivateBooking(
    admin: UserProfile,
    ref: SlotRef,
    client: { name: string; phone: string; amount?: number | null; note?: string | null },
    weeks = 1,
  ): Promise<{ created: string[]; conflicts: string[] }> {
    const now = Date.now();
    const seriesId = weeks > 1 ? store.newId(COL.privateBookings) : null;
    const created: string[] = [];
    const conflicts: string[] = [];
    for (let w = 0; w < Math.max(1, Math.min(52, weeks)); w++) {
      const date = addDays(ref.date, w * 7);
      const sid = slotId(ref.pitch.id, date, ref.start);
      const id = store.newId(COL.privateBookings);
      try {
        await store.runTransaction(async (tx) => {
          const slot = await tx.get<SlotDoc>(COL.slots, sid);
          if (effectiveSlotStatus(slot, now) !== 'free') throw new AppError('err.slotTaken');
          const booking: Booking = {
            id,
            slotId: sid,
            pitchId: ref.pitch.id,
            pitchName: ref.pitch.name,
            date,
            start: ref.start,
            end: ref.end,
            userId: admin.id,
            userName: client.name,
            userPhone: client.phone,
            status: 'confirmed',
            createdAt: now,
            expiresAt: now,
            handledBy: admin.id,
            handledByName: admin.name,
            handledAt: now,
            manual: true,
            private: true,
            amount: client.amount ?? null,
            note: client.note || null,
            seriesId,
          };
          tx.set(COL.privateBookings, id, booking);
          tx.set(COL.slots, sid, {
            id: sid,
            pitchId: ref.pitch.id,
            date,
            start: ref.start,
            end: ref.end,
            status: 'booked',
            bookingId: id,
            private: true,
            expiresAt: null,
            matchId: null,
            reason: null,
          } satisfies SlotDoc);
        });
        created.push(date);
      } catch (e) {
        if (w === 0 && weeks === 1) throw e;
        conflicts.push(date);
      }
    }
    return { created, conflicts };
  }

  /** Annule une réservation privée (et, au choix, les suivantes de la même série). */
  async function cancelPrivateBooking(b: Booking, admin: UserProfile, wholeSeries = false) {
    const list =
      wholeSeries && b.seriesId
        ? (await store.query<Booking>(COL.privateBookings, [['seriesId', b.seriesId]])).filter((x) => x.status === 'confirmed' && x.date >= b.date)
        : [b];
    for (const x of list) {
      await store.runTransaction(async (tx) => {
        const slot = await tx.get<SlotDoc>(COL.slots, x.slotId);
        if (slot && slot.bookingId === x.id) tx.remove(COL.slots, x.slotId);
        tx.update(COL.privateBookings, x.id, { status: 'cancelled', handledBy: admin.id, handledByName: admin.name, handledAt: Date.now() });
      });
    }
    return list.length;
  }

  async function getPrivateBooking(id: string) {
    return store.get<Booking>(COL.privateBookings, id);
  }

  // ───────────── Entreprises : équipe, joueurs, sélection ─────────────

  /** L'entreprise inscrit son équipe (en attente de validation). */
  /** Étape 1 de l'inscription : l'équipe est créée en brouillon (rien n'est envoyé à l'admin). */
  async function registerTeam(user: UserProfile, season: Season, data: { name: string; shortName: string; color: string; logoUrl?: string | null }) {
    if (season.status !== 'registration') throw new AppError('err.seasonStarted');
    // Une seule équipe par entreprise et par championnat
    const mine = await store.query<Team>(COL.teams, [['ownerId', user.id]]);
    if (mine.some((x) => x.seasonId === season.id)) throw new AppError('err.teamExists');
    // Tournoi : nombre d'équipes limité
    if (cupFull(season, await store.query<Team>(COL.teams, [['seasonId', season.id]]), season.id)) throw new AppError('err.cupFull');
    const id = store.newId(COL.teams);
    const team: Team = {
      id,
      seasonId: season.id,
      name: data.name,
      company: user.companyName || data.name,
      shortName: data.shortName.toUpperCase().slice(0, 3),
      color: data.color,
      logoUrl: data.logoUrl ?? null,
      captainId: null,
      ownerId: user.id,
      approved: false,
      requestStatus: 'draft',
      managers: [],
      coach: null,
    };
    await store.set(COL.teams, id, team);
    return team;
  }

  /** Modification par l'entreprise : identité, logo, responsables, entraîneur, pièces collectives. */
  async function updateOwnTeam(
    teamId: string,
    data: Partial<
      Pick<
        Team,
        | 'name'
        | 'shortName'
        | 'color'
        | 'logoUrl'
        | 'managers'
        | 'coach'
        | 'collectiveAttestationId'
        | 'collectiveCertificateId'
        | 'collectiveAttestationPromised'
        | 'collectiveCertificatePromised'
      >
    >,
  ) {
    await store.update(COL.teams, teamId, data);
  }

  /** Envoi de la demande d'inscription : équipe + effectif partent en vérification. */
  async function submitTeamRequest(team: Team) {
    const season = await store.get<Season>(COL.seasons, team.seasonId);
    const others = (await store.query<Team>(COL.teams, [['seasonId', team.seasonId]])).filter((x) => x.id !== team.id);
    if (cupFull(season, others, team.seasonId)) throw new AppError('err.cupFull');
    const players = await store.query<Player>(COL.players, [['teamId', team.id]]);
    const now = Date.now();
    await store.batch([
      { type: 'update', col: COL.teams, id: team.id, data: { requestStatus: 'submitted', submittedAt: now, rejectReason: null, approved: false } },
      ...players
        .filter((p) => p.status === 'draft' || p.status === 'rejected')
        .map((p) => ({ type: 'update' as const, col: COL.players, id: p.id, data: { status: 'pending', submittedAt: now, rejectReason: null } })),
    ]);
    return players.length;
  }

  /** Attribue les numéros de licence manquants aux joueurs validés d'une équipe. */
  async function licenseOps(team: Team, players: Player[], approvedIds: Set<string>, seasonYear: number): Promise<Parameters<Store['batch']>[0]> {
    const season = await store.get<Season>(COL.seasons, team.seasonId).catch(() => null);
    const prefix = licensePrefix(season);
    const year = season?.startDate ? Number(season.startDate.slice(0, 4)) : seasonYear;
    let next = players.filter((p) => p.licenseNo).length;
    return players
      .filter((p) => approvedIds.has(p.id) && !p.licenseNo)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ type: 'update' as const, col: COL.players, id: p.id, data: { licenseNo: licenseNumber(year, team.shortName, ++next, prefix) } }));
  }

  /** Validation de l'équipe (et, au choix, de tous ses joueurs en attente) + numéros de licence. */
  async function approveTeam(team: Team, withPlayers = true, seasonYear = new Date().getFullYear()) {
    const players = await store.query<Player>(COL.players, [['teamId', team.id]]);
    const toApprove = withPlayers ? players.filter((p) => p.status === 'pending') : [];
    const approvedIds = new Set([...players.filter((p) => isPlayerApproved(p)).map((p) => p.id), ...toApprove.map((p) => p.id)]);
    const ops: Parameters<Store['batch']>[0] = [
      { type: 'update', col: COL.teams, id: team.id, data: { approved: true, requestStatus: 'approved', rejectReason: null } },
      ...toApprove.map((p) => ({ type: 'update' as const, col: COL.players, id: p.id, data: { status: 'approved', rejectReason: null } })),
      ...(await licenseOps(team, players, approvedIds, seasonYear)),
    ];
    if (team.ownerId) ops.push({ type: 'update', col: COL.users, id: team.ownerId, data: { teamId: team.id, companyName: team.company } });
    await store.batch(ops);
    return toApprove.length;
  }

  /** Refus de la demande : l'équipe reste, l'entreprise corrige et renvoie. */
  async function rejectTeamRequest(team: Team, reason: string) {
    await store.update(COL.teams, team.id, { requestStatus: 'rejected', rejectReason: reason || null, approved: false });
  }

  /** Après validation : numéro de maillot et poste (sans nouvelle vérification). */
  async function setPlayerNumber(playerId: string, number: number, position: Player['position']) {
    await store.update(COL.players, playerId, { number, position });
  }

  /** Joueur de l'effectif (inscription) : nom, prénom, date de naissance et pièces jointes. */
  async function saveSquadPlayer(
    team: Team,
    ownerId: string,
    seasonId: string,
    data: {
      id?: string;
      status?: Player['status'];
      firstName: string;
      lastName: string;
      birthDate: string | null;
      number?: number;
      position?: Player['position'];
      cinFileId?: string | null;
      photoFileId?: string | null;
      attestationFileId?: string | null;
      certificateFileId?: string | null;
      phone?: string | null;
      cin?: string | null;
    },
  ) {
    if (!data.id) {
      // Après la date limite du championnat, l'entreprise ne peut plus ajouter de joueurs
      const season = await store.get<Season>(COL.seasons, seasonId);
      if (!rosterOpen(season, Date.now())) throw new AppError('err.rosterClosed');
      // 18 places au maximum (les joueurs validés puis retirés gardent leur place)
      const squad = await store.query<Player>(COL.players, [['teamId', team.id]]);
      if (squadPlacesUsed(squad) >= SQUAD_MAX) throw new AppError('err.squadFull');
    }
    const id = data.id || store.newId(COL.players);
    // On conserve ce que l'entreprise ne modifie pas ici (n° de licence, numéro, poste)
    const existing = data.id ? await store.get<Player>(COL.players, data.id) : null;
    const teamStatus = team.requestStatus ?? (team.approved === false ? 'submitted' : 'approved');
    // Brouillon tant que la demande n'est pas envoyée ; sinon toute modification repart en vérification
    const status: Player['status'] = teamStatus === 'draft' ? 'draft' : data.status === 'draft' ? 'draft' : 'pending';
    const player: Player = {
      ...(existing ?? {}),
      id,
      seasonId,
      teamId: team.id,
      name: fullName(data.firstName, data.lastName),
      number: existing?.number ?? data.number ?? 0,
      position: existing?.position ?? data.position ?? 'MID',
      photoUrl: null,
      status,
      rejectReason: null,
      submittedAt: status === 'pending' ? Date.now() : null,
      birthDate: data.birthDate,
      licenseNo: existing?.licenseNo ?? null,
    };
    await store.batch([
      { type: 'set', col: COL.players, id, data: player },
      {
        type: 'set',
        col: COL.playerInfo,
        id,
        data: {
          id,
          teamId: team.id,
          ownerId,
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          birthDate: data.birthDate,
          cinFileId: data.cinFileId ?? null,
          photoFileId: data.photoFileId ?? null,
          attestationFileId: data.attestationFileId ?? null,
          certificateFileId: data.certificateFileId ?? null,
          phone: data.phone ?? null,
          cin: data.cin ?? null,
        },
      },
    ]);
    return player;
  }

  // ───────────── Pièces jointes ─────────────
  async function saveFile(f: Omit<StoredFile, 'id' | 'createdAt'> & { id?: string }) {
    const id = f.id || store.newId(COL.files);
    await store.set(COL.files, id, { ...f, id, createdAt: Date.now() });
    return id;
  }
  const getFile = (id: string) => store.get<StoredFile>(COL.files, id);
  async function deleteFile(id: string) {
    await store.remove(COL.files, id);
  }

  // ───────────── Gestion du personnel ─────────────
  const listUsers = (role: Role) => store.query<UserProfile>(COL.users, [['role', role]]);
  async function createMember(
    createAccount: (email: string, password: string) => Promise<string>,
    data: { name: string; phone: string; email: string; role: Role; password: string; companyName?: string },
  ) {
    const uid = await createAccount(data.email, data.password);
    const profile: UserProfile = {
      id: uid,
      name: data.name,
      phone: data.phone,
      email: data.email,
      role: data.role,
      lang: 'fr',
      teamId: null,
      companyName: data.role === 'company' ? data.companyName || data.name : null,
    };
    await store.set(COL.users, uid, profile);
    return profile;
  }

  async function rejectTeam(team: Team) {
    const players = await store.query<Player>(COL.players, [['teamId', team.id]]);
    await store.batch([
      { type: 'remove', col: COL.teams, id: team.id },
      ...players.flatMap((p) => [
        { type: 'remove' as const, col: COL.players, id: p.id },
        { type: 'remove' as const, col: COL.playerInfo, id: p.id },
      ]),
    ]);
  }

  /**
   * Création / modification d'un joueur par l'entreprise.
   * Toute modification d'un joueur validé ou refusé le repasse "en attente" (nouvelle vérification).
   */
  async function companySavePlayer(
    player: Omit<Player, 'id' | 'status'> & { id?: string; status?: Player['status'] },
    info: Omit<PlayerInfo, 'id' | 'teamId'>,
    submit: boolean,
    ownerId: string,
  ) {
    const id = player.id || store.newId(COL.players);
    const status = submit || player.status === 'approved' || player.status === 'rejected' || player.status === 'pending' ? 'pending' : 'draft';
    const data: Player = {
      ...player,
      id,
      status,
      rejectReason: null,
      submittedAt: status === 'pending' ? Date.now() : null,
    } as Player;
    await store.batch([
      { type: 'set', col: COL.players, id, data },
      { type: 'set', col: COL.playerInfo, id, data: { ...info, id, teamId: player.teamId, ownerId } },
    ]);
    return data;
  }

  async function submitPlayers(ids: string[]) {
    const now = Date.now();
    await store.batch(ids.map((id) => ({ type: 'update' as const, col: COL.players, id, data: { status: 'pending', submittedAt: now, rejectReason: null } })));
  }

  /**
   * L'entreprise retire un joueur : un joueur validé est désactivé (licence plus valable, place perdue),
   * un joueur non validé est supprimé (sa place est libérée).
   */
  async function companyRemovePlayer(p: Player) {
    if ((p.status ?? 'approved') === 'approved') await store.update(COL.players, p.id, { status: 'removed', removedAt: Date.now() });
    else await companyDeletePlayer(p.id);
  }
  async function companyDeletePlayer(id: string) {
    await store.batch([
      { type: 'remove', col: COL.players, id },
      { type: 'remove', col: COL.playerInfo, id },
    ]);
  }

  async function reviewPlayer(id: string, approved: boolean, reason?: string, team?: Team, seasonYear = new Date().getFullYear()) {
    await store.update(COL.players, id, { status: approved ? 'approved' : 'rejected', rejectReason: approved ? null : reason ?? null });
    if (approved && team) {
      const players = await store.query<Player>(COL.players, [['teamId', team.id]]);
      const ops = await licenseOps(team, players, new Set([id]), seasonYear);
      if (ops.length) await store.batch(ops);
    }
  }

  async function savePlayerInfo(info: PlayerInfo) {
    await store.set(COL.playerInfo, info.id, info);
  }

  /** Sélection des joueurs par l'entreprise (au plus tard 12 h avant le match). */
  async function setCompanyLineup(match: Match, teamId: string, playerIds: string[]) {
    if (!canCompanyEditLineup(match, Date.now())) throw new AppError('err.lineupLocked');
    const key = match.homeTeamId === teamId ? 'homeLineup' : match.awayTeamId === teamId ? 'awayLineup' : null;
    if (!key) throw new AppError('common.error');
    await store.update(COL.matches, match.id, { [key]: playerIds });
  }

  // ───────────── Actualités ─────────────
  async function saveNews(item: Omit<NewsItem, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) {
    const id = item.id || store.newId(COL.news);
    await store.set(COL.news, id, { ...item, id, createdAt: item.createdAt ?? Date.now() });
    return id;
  }
  async function deleteNews(id: string) {
    await store.remove(COL.news, id);
  }

  return {
    saveProfile,
    updateProfile,
    requestAccountDeletion,
    requestBooking,
    cancelMyBooking,
    lockBooking,
    confirmBooking,
    refuseBooking,
    cancelConfirmed,
    expireOverdue,
    createManualBooking,
    setSlotBlocked,
    saveConfig,
    savePitch,
    deletePitch,
    saveWhatsappKey,
    saveShowcase,
    deleteShowcase,
    resetSeason,
    submitTeamRequest,
    rejectTeamRequest,
    setPlayerNumber,
    saveSquadPlayer,
    saveFile,
    getFile,
    deleteFile,
    listUsers,
    createMember,
    setUserRole,
    setUserPerms,
    createSeason,
    deleteSeason,
    updateSeason,
    drawLots,
    saveTeam,
    deleteTeam,
    setTeamGroup,
    savePlayer,
    deletePlayer,
    generateCalendar,
    planAutoCalendar,
    applyCalendarPlan,
    updateMatch,
    startMatch,
    saveStarters,
    saveSheet,
    finalizeSheet,
    halfTime,
    startSecondHalf,
    finishMatch,
    declareForfeit,
    cancelForfeit,
    setPenalties,
    reopenMatch,
    addEvent,
    deleteEvent,
    updateEvent,
    rescheduleMatch,
    createMatch,
    editMatchTeams,
    postponeMatch,
    deleteMatch,
    createPrivateBooking,
    cancelPrivateBooking,
    getPrivateBooking,
    saveNews,
    deleteNews,
    registerTeam,
    updateOwnTeam,
    approveTeam,
    rejectTeam,
    companySavePlayer,
    submitPlayers,
    companyDeletePlayer,
    companyRemovePlayer,
    reviewPlayer,
    savePlayerInfo,
    setCompanyLineup,
  };
}
