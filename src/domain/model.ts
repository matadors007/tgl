/**
 * Tunisia Golden League — modèle métier (types + logique pure).
 * Ce fichier n'importe rien : il est partagé par l'app, le mode démo et les tests.
 */

// ───────────────────────── Types ─────────────────────────

/**
 * Rôles :
 *  - user     : client / joueur (réserve un terrain)
 *  - company  : entreprise du championnat (espace dédié à son équipe)
 *  - operator : opérateur de match (score, buteurs, cartons en direct)
 *  - agent    : agent d'accueil (traite les réservations)
 *  - admin    : administrateur (tout)
 */
export type Role = 'user' | 'company' | 'operator' | 'agent' | 'admin';
export const ROLES: Role[] = ['user', 'company', 'operator', 'agent', 'admin'];

export const canHandleBookings = (r?: Role | null) => r === 'agent' || r === 'admin';
export const canOperateMatches = (r?: Role | null) => r === 'operator' || r === 'admin';
export const isStaffRole = (r?: Role | null) => r === 'agent' || r === 'operator' || r === 'admin';
/** Seuls les clients (et les visiteurs, invités à se connecter) réservent un terrain depuis l'app. */
export const canRequestBooking = (r?: Role | null) => !r || r === 'user';
/** Le championnat (matchs, calendrier, classements) n'est visible que des entreprises et du personnel. */
/** Matchs et classements : visibles par tous (visiteurs compris). */
export const canSeeLeague = (_r?: Role | null) => true;
export type Lang = 'fr' | 'en';

export interface UserProfile {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: Role;
  lang: Lang;
  followedTeamIds?: string[];
  /** Compte entreprise : équipe liée (saison en cours) et nom de l'entreprise. */
  teamId?: string | null;
  companyName?: string | null;
  /** Photo de profil (data URI réduite). */
  photo?: string | null;
  /** Permissions réglées par l'administrateur (absent = valeur par défaut du rôle). */
  perms?: Partial<Record<Perm, boolean>> | null;
  /** Demande de suppression du compte (date) : traitée ensuite par l'administration. */
  deletionRequestedAt?: number | null;
}

export type PitchType = '6v6' | '7v7';

export interface Pitch {
  id: string;
  name: string;
  type: PitchType;
  active: boolean;
  order: number;
  /** Créneaux personnalisés (heures de début "HH:mm"). Vide = horaires généraux. */
  slotStarts?: string[] | null;
  /** Durée des créneaux de ce terrain (min). Vide = durée générale. */
  slotMinutes?: number | null;
  /** Créneaux d'une date précise ("YYYY-MM-DD" → heures de début ; liste vide = terrain fermé ce jour-là). */
  dateSlots?: Record<string, string[]> | null;
  /** Créneaux désactivés (heures de début) : visibles mais non réservables, tous les jours. */
  disabledStarts?: string[] | null;
  /** Présentation (écran « À propos »). */
  description?: string | null;
  surface?: string | null;
  dimensions?: string | null;
  features?: string[] | null;
  /** Photo : data URI (photo du téléphone) ou URL. */
  photo?: string | null;
}

export interface AppConfig {
  /** Ouverture en minutes depuis minuit (ex. 540 = 09:00). */
  openMinutes: number;
  /** Fermeture en minutes depuis minuit (ex. 1440 = 24:00). */
  closeMinutes: number;
  /** Durée d'un créneau en minutes. */
  slotMinutes: number;
  /** Délai avant expiration automatique d'une demande non traitée. */
  expiryMinutes: number;
  /** Nombre maximum de demandes en attente par compte. */
  maxPendingPerUser: number;
  /** Prix indicatif (TND) par type de terrain. */
  price6v6: number;
  price7v7: number;
  /** Téléphone du complexe (affiché aux clients). */
  contactPhone: string;
  /** E-mail de contact (politique de confidentialité, suppression de compte). */
  contactEmail?: string;
  /** Numéro WhatsApp de l'administrateur (prévenu à chaque demande). */
  whatsappNumber: string;
  /** Nombre de jours réservables à l'avance (fenêtre glissante, aujourd'hui inclus). */
  bookingWindowDays: number;
  /** Écran « À propos » : présentation du complexe et adresse. */
  aboutText: string;
  address: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  openMinutes: 9 * 60,
  closeMinutes: 24 * 60,
  slotMinutes: 90,
  expiryMinutes: 30,
  maxPendingPerUser: 2,
  price6v6: 60,
  price7v7: 80,
  contactPhone: '+216 00 000 000',
  contactEmail: '',
  whatsappNumber: '',
  bookingWindowDays: 7,
  aboutText:
    'Tunisia Golden League vous accueille sur des terrains de foot à 6 et à 7 en gazon synthétique dernière génération, éclairés pour jouer de jour comme de nuit. Vestiaires, douches, parking et espace détente sur place. Réservez votre créneau de 90 minutes en quelques secondes.',
  address: 'Tunis, Tunisie',
};

export type SlotStatus = 'free' | 'pending' | 'booked' | 'blocked';

/** Un document "slot" n'existe que si le créneau n'est pas libre (ou l'a été). */
export interface SlotDoc {
  id: string;
  pitchId: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string; // HH:mm
  status: SlotStatus;
  bookingId?: string | null;
  matchId?: string | null;
  expiresAt?: number | null;
  reason?: string | null;
  /** Réservation privée saisie par l'administrateur (client au téléphone) : invisible pour les particuliers. */
  private?: boolean;
}

export interface Slot {
  id: string;
  pitchId: string;
  date: string;
  start: string;
  end: string;
  status: SlotStatus;
  past: boolean;
  doc?: SlotDoc;
}

export type BookingStatus = 'pending' | 'confirmed' | 'refused' | 'expired' | 'cancelled';

export interface Booking {
  id: string;
  slotId: string;
  pitchId: string;
  pitchName: string;
  date: string;
  start: string;
  end: string;
  userId: string;
  userName: string;
  userPhone: string;
  status: BookingStatus;
  createdAt: number;
  expiresAt: number;
  handledBy?: string | null;
  handledByName?: string | null;
  handledAt?: number | null;
  reason?: string | null;
  lockedBy?: string | null;
  lockedByName?: string | null;
  lockedAt?: number | null;
  /** Réservation saisie par un agent (client au téléphone). */
  manual?: boolean;
  /** Réservation privée de l'administrateur (collection à part, visible par l'administrateur seul). */
  private?: boolean;
  /** Montant encaissé (TND) si différent du tarif du terrain. */
  amount?: number | null;
  note?: string | null;
  /** Série hebdomadaire (créneau fixe) : identifiant commun aux réservations de la série. */
  seriesId?: string | null;
}

export type SeasonStatus = 'registration' | 'running' | 'finished';

export interface Season {
  id: string;
  name: string;
  status: SeasonStatus;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  /** Nombre de jaunes (sur des matchs différents) déclenchant une suspension. */
  yellowLimit: number;
  /** Matchs de suspension pour un carton rouge. */
  redBanMatches: number;
  /** Durée d'une mi-temps en minutes. */
  halfMinutes: number;
  doubleRound: boolean;
  createdAt: number;
  active: boolean;
  /** Type de championnat : mixte ou +35 ans. */
  category?: ChampionshipCategory;
  /** Date de début du championnat (AAAA-MM-JJ). */
  startDate?: string | null;
  /** Dernier jour pour ajouter des joueurs (AAAA-MM-JJ) ; ensuite les entreprises ne peuvent plus en ajouter. */
  rosterDeadline?: string | null;
  /** Même limite en ms (fin de journée), utilisée par les règles de sécurité. */
  rosterDeadlineAt?: number | null;
  /** Tirage au sort des égalités parfaites (ordre des équipes), fait par l'administrateur. */
  lotOrder?: string[] | null;
  /** league = championnat (aller / retour) · cup = tournoi. Absent = championnat. */
  kind?: CompetitionKind;
  /** Tournoi : poules puis élimination, ou élimination directe. */
  cupFormat?: CupFormat | null;
  /** Tournoi : nombre d'équipes participantes (inscriptions fermées au-delà). */
  maxTeams?: number | null;
  /** Tournoi à poules : nombre de poules (A, B, C…). */
  groupCount?: number | null;
}

export type CompetitionKind = 'league' | 'cup';
export type CupFormat = 'groups' | 'knockout';
export const CUP_MIN_TEAMS = 3;
export const CUP_MAX_TEAMS = 32;

export const isCup = (s: Pick<Season, 'kind'> | null | undefined) => s?.kind === 'cup';
export const hasGroups = (s: Pick<Season, 'kind' | 'cupFormat'> | null | undefined) => isCup(s) && s?.cupFormat === 'groups';

/** Lettres des poules : A, B, C… */
export function groupLetters(count: number | null | undefined): string[] {
  const n = Math.max(1, Math.min(8, count ?? 1));
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
}

/** Tours à élimination : nombre d'équipes encore en lice (2 = finale) ; 1 = match pour la 3e place. */
export const KO_ROUNDS = [32, 16, 8, 4, 2, 1] as const;
export type KoRound = (typeof KO_ROUNDS)[number];

/** Tours proposés pour un tournoi de n équipes (du premier tour à la finale). */
export function koRoundsFor(teams: number | null | undefined): KoRound[] {
  const n = Math.max(2, teams ?? 32);
  return KO_ROUNDS.filter((r) => r === 1 || r === 2 || r < n * 2);
}

/** Le tournoi est-il complet ? (équipes inscrites ou validées, hors brouillons et refus) */
export function cupFull(season: Pick<Season, 'kind' | 'maxTeams'> | null | undefined, teams: Pick<Team, 'seasonId' | 'requestStatus' | 'approved'>[], seasonId: string): boolean {
  if (!isCup(season) || !season?.maxTeams) return false;
  const n = teams.filter((x) => x.seasonId === seasonId && ['submitted', 'approved'].includes(teamRequestStatus(x))).length;
  return n >= season.maxTeams;
}

export type ChampionshipCategory = 'mixed' | 'over35';
export const CATEGORY_MIN_AGE: Record<ChampionshipCategory, number | null> = { mixed: null, over35: 35 };

/** Les entreprises peuvent-elles encore ajouter des joueurs ? */
export function rosterOpen(season: Pick<Season, 'rosterDeadline'> | null | undefined, now: number): boolean {
  if (!season?.rosterDeadline) return true;
  return toDateKey(new Date(now)) <= season.rosterDeadline;
}

/** Fin de journée (23:59:59) d'une date, en ms. */
export function endOfDayMs(dateKey: string): number {
  return dateTimeToMs(dateKey, '00:00') + 86_400_000 - 1;
}

/** Âge à une date donnée (années révolues). */
export function ageAt(birthDate: string | null | undefined, dateKey: string): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = dateKey.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Joueur trop jeune pour un championnat +35 (avertissement seulement). */
export function underAge(season: Pick<Season, 'category' | 'startDate'> | null | undefined, birthDate: string | null | undefined, now: number): boolean {
  const min = season?.category ? CATEGORY_MIN_AGE[season.category] : null;
  if (!min) return false;
  const age = ageAt(birthDate, season?.startDate || toDateKey(new Date(now)));
  return age !== null && age < min;
}

export interface Team {
  id: string;
  seasonId: string;
  name: string;
  company: string;
  shortName: string;
  color: string;
  logoUrl?: string | null;
  captainId?: string | null;
  /** Compte entreprise propriétaire (équipe inscrite depuis l'app). */
  ownerId?: string | null;
  /** false = inscription en attente de validation par l'administrateur. */
  approved?: boolean;
  /** Suivi de la demande d'inscription (absent = équipe créée par l'admin, validée). */
  requestStatus?: TeamRequestStatus;
  rejectReason?: string | null;
  submittedAt?: number | null;
  /** Responsables de l'équipe (le premier sert de délégué sur la feuille de match). */
  managers?: TeamContact[];
  coach?: TeamContact | null;
  /** Pièces collectives (identifiants de fichiers) : une attestation / un certificat pour tout l'effectif. */
  collectiveAttestationId?: string | null;
  collectiveCertificateId?: string | null;
  /** L'entreprise s'engage à transmettre une pièce collective plus tard. */
  collectiveAttestationPromised?: boolean;
  collectiveCertificatePromised?: boolean;
  /** Tournoi à poules : poule de l'équipe (A, B…). */
  group?: string | null;
}

export type TeamRequestStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface TeamContact {
  name: string;
  phone: string;
  email?: string | null;
}

export function teamRequestStatus(t: Pick<Team, 'requestStatus' | 'approved'>): TeamRequestStatus {
  if (t.requestStatus) return t.requestStatus;
  return t.approved === false ? 'submitted' : 'approved';
}

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface Player {
  id: string;
  seasonId: string;
  teamId: string;
  name: string;
  number: number;
  position: Position;
  photoUrl?: string | null;
  /** Validation par l'administrateur (absent = validé, joueurs créés par l'admin). */
  status?: PlayerStatus;
  rejectReason?: string | null;
  submittedAt?: number | null;
  /** Numéro de licence (attribué à la validation). */
  licenseNo?: string | null;
  birthDate?: string | null;
  /** Joueur validé retiré par l'entreprise (date). */
  removedAt?: number | null;
}

/** draft = brouillon de l'entreprise · pending = soumis · approved / rejected = décision de l'admin · removed = joueur validé retiré par l'entreprise (licence désactivée, place perdue) */
export type PlayerStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'removed';

/** Informations personnelles d'un joueur (privées : entreprise + admin). */
export interface PlayerInfo {
  id: string; // = id du joueur
  teamId: string;
  firstName?: string | null;
  lastName?: string | null;
  /** Pièces jointes (identifiants dans la collection "files"). */
  cinFileId?: string | null;
  photoFileId?: string | null;
  attestationFileId?: string | null;
  certificateFileId?: string | null;
  /** Compte entreprise propriétaire de l'équipe (droits de lecture). */
  ownerId?: string | null;
  birthDate?: string | null; // YYYY-MM-DD
  phone?: string | null;
  cin?: string | null;
  jobTitle?: string | null;
  employeeId?: string | null;
}

export function isPlayerApproved(p: Pick<Player, 'status'>): boolean {
  return !p.status || p.status === 'approved';
}

export function isTeamApproved(t: Pick<Team, 'approved'>): boolean {
  return t.approved !== false;
}

export type MatchStatus =
  | 'scheduled'
  | 'first_half'
  | 'half_time'
  | 'second_half'
  | 'finished'
  | 'postponed';

export const LIVE_STATUSES: MatchStatus[] = ['first_half', 'half_time', 'second_half'];

export interface Match {
  id: string;
  seasonId: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  pitchId?: string | null;
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
  kickoffAt?: number | null;
  secondHalfAt?: number | null;
  finishedAt?: number | null;
  fbLiveUrl?: string | null;
  homeLineup: string[];
  awayLineup: string[];
  referee?: string | null;
  notes?: string | null;
  /** Date/heure prévue du coup d'envoi (ms) — sert au délai de sélection des joueurs. */
  plannedAt?: number | null;
  /** Feuille de match remplie par l'administration (obligatoire avant le coup d'envoi). */
  sheet?: MatchSheetInfo | null;
  /** Tournoi : phase de poules ou élimination directe (absent = match de championnat). */
  stage?: 'group' | 'ko' | null;
  /** Phase de poules : lettre de la poule. */
  group?: string | null;
  /** Élimination : tour (8 = quarts, 4 = demies, 2 = finale, 1 = 3e place). */
  koRound?: KoRound | null;
  /** Élimination : tirs au but en cas d'égalité. */
  homePens?: number | null;
  awayPens?: number | null;
  /** Équipe forfait (moins de 4 joueurs au coup d'envoi) : match perdu 0-2. */
  forfeit?: 'home' | 'away' | null;
}

/** Vainqueur d'un match terminé (tirs au but compris) ; null si nul ou non joué. */
export function matchWinner(m: Pick<Match, 'status' | 'homeScore' | 'awayScore' | 'homePens' | 'awayPens' | 'homeTeamId' | 'awayTeamId'>): string | null {
  if (m.status !== 'finished') return null;
  if (m.homeScore !== m.awayScore) return m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId;
  if (m.homePens != null && m.awayPens != null && m.homePens !== m.awayPens) return m.homePens > m.awayPens ? m.homeTeamId : m.awayTeamId;
  return null;
}

/** Match à élimination terminé sur un nul sans tirs au but saisis. */
export const needsPenalties = (m: Match) => m.stage === 'ko' && m.status === 'finished' && m.homeScore === m.awayScore && matchWinner(m) == null;

/** Matchs comptant pour un classement : championnat entier, ou phase de poules d'un tournoi. */
export const countsForTable = (m: Pick<Match, 'stage'>) => !m.stage || m.stage === 'group';

export interface SheetSide {
  /** Joueurs inscrits sur la feuille (identifiants) ; le capitaine en premier si choisi. */
  playerIds: string[];
  /** Titulaires (équipe qui commence le match) ; les autres joueurs de la feuille sont remplaçants. */
  starters?: string[];
  captainId?: string | null;
  coach?: string | null;
  delegate?: string | null;
}

export interface MatchSheetInfo {
  /** ready = joueurs saisis (le match peut commencer) · final = complétée après le match */
  status: 'ready' | 'final';
  home: SheetSide;
  away: SheetSide;
  referee?: string | null;
  filledBy?: string | null;
  filledAt?: number | null;
  finalizedBy?: string | null;
  finalizedAt?: number | null;
}

/** Nombre minimum de joueurs par équipe sur la feuille de match. */
/** Minimum de joueurs présents pour qu'une équipe puisse jouer (6v6, 5v6, 4v6… sont permis). */
export const SHEET_MIN_PLAYERS = 4;
/** Nombre de titulaires maximum selon le terrain : 6 (foot à 6) ou 7 (foot à 7). */
export function maxStarters(pitchType: string | null | undefined): number {
  return pitchType === '7v7' ? 7 : 6;
}
/**
 * Titulaires / remplaçants d'une équipe sur la feuille.
 * chosen = false tant que l'équipe qui commence n'est pas choisie (tous les joueurs présents sont alors renvoyés dans starters).
 */
export function sheetLineup(side: Pick<SheetSide, 'playerIds' | 'starters'> | null | undefined): { starters: string[]; subs: string[]; chosen: boolean } {
  const ids = side?.playerIds ?? [];
  const st = (side?.starters ?? []).filter((x) => ids.includes(x));
  if (!st.length) return { starters: ids, subs: [], chosen: false };
  return { starters: st, subs: ids.filter((x) => !st.includes(x)), chosen: true };
}

/** Équipe qui commence choisie pour les deux équipes (au moins 4 titulaires chacune) ? */
export function startersReady(m: Pick<Match, 'sheet'>): boolean {
  const ok = (s?: SheetSide | null) => !!s && (s.starters ?? []).filter((x) => s.playerIds.includes(x)).length >= SHEET_MIN_PLAYERS;
  return ok(m.sheet?.home) && ok(m.sheet?.away);
}

/** Score d'un match perdu par forfait (équipe avec moins de 4 joueurs au coup d'envoi). */
export const FORFEIT_SCORE = 2;

export function sheetReady(m: Pick<Match, 'sheet'>): boolean {
  return !!m.sheet && (m.sheet.status === 'ready' || m.sheet.status === 'final');
}

/** Match du lendemain (ou des prochaines 24 h) dont la feuille n'est pas encore remplie. */
export function sheetDue(m: Pick<Match, 'sheet' | 'status' | 'date' | 'start' | 'plannedAt'>, now: number): boolean {
  if (m.status !== 'scheduled' || sheetReady(m)) return false;
  const t = matchPlannedAt(m);
  return t > now && t - now <= 36 * 3_600_000;
}

/** Délai de sélection des joueurs par l'entreprise : jusqu'à 12 h avant le match. */
export const LINEUP_DEADLINE_MS = 12 * 60 * 60_000;

export function matchPlannedAt(m: Pick<Match, 'date' | 'start' | 'plannedAt'>): number {
  return m.plannedAt ?? dateTimeToMs(m.date, m.start);
}

export function lineupDeadline(m: Pick<Match, 'date' | 'start' | 'plannedAt'>): number {
  return matchPlannedAt(m) - LINEUP_DEADLINE_MS;
}

export function canCompanyEditLineup(m: Pick<Match, 'date' | 'start' | 'plannedAt' | 'status'>, now: number): boolean {
  return (m.status === 'scheduled' || m.status === 'postponed') && now < lineupDeadline(m);
}

export type EventType = 'goal' | 'penalty_goal' | 'own_goal' | 'yellow' | 'red' | 'sub';

export interface MatchEvent {
  id: string;
  matchId: string;
  seasonId: string;
  type: EventType;
  minute: number;
  half: 1 | 2;
  /** Équipe du joueur concerné (pour un CSC : l'équipe du joueur qui marque contre son camp). */
  teamId: string;
  playerId: string;
  assistId?: string | null;
  /** Remplacement : joueur entrant. */
  playerInId?: string | null;
  /** Rouge généré automatiquement par un 2e jaune. */
  secondYellow?: boolean;
  /** Carton donné à l'entraîneur (playerId = "coach:<équipe>"). */
  coach?: boolean;
  personName?: string | null;
  createdAt: number;
}

export const coachPlayerId = (teamId: string) => `coach:${teamId}`;

export type NewsType = 'article' | 'video' | 'gallery' | 'award';

export interface NewsItem {
  id: string;
  type: NewsType;
  title: string;
  body: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  matchId?: string | null;
  teamId?: string | null;
  createdAt: number;
}

// ───────────────────────── Dates & heures ─────────────────────────

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function minutesToHHmm(m: number): string {
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return toDateKey(dt);
}

/** Timestamp local (ms) d'une date + heure. */
export function dateTimeToMs(dateKey: string, hhmm: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const mins = hhmmToMinutes(hhmm);
  return new Date(y, m - 1, d, 0, mins).getTime();
}

// ───────────────────────── Réservation ─────────────────────────

export function slotId(pitchId: string, date: string, start: string): string {
  return `${pitchId}_${date}_${start.replace(':', '')}`;
}

/** Statut réel d'un document de créneau : une demande expirée libère le créneau. */
export function effectiveSlotStatus(doc: SlotDoc | undefined | null, now: number): SlotStatus {
  if (!doc) return 'free';
  if (doc.status === 'pending' && doc.expiresAt != null && doc.expiresAt <= now) return 'free';
  return doc.status;
}

/** Génère la grille d'une journée pour un terrain, fusionnée avec les documents existants. */
/** Heures de début générées entre l'ouverture et la fermeture, pour une durée donnée. */
export function generateStartTimes(openMinutes: number, closeMinutes: number, slotMinutes: number): string[] {
  const out: string[] = [];
  if (slotMinutes <= 0) return out;
  for (let t = openMinutes; t + slotMinutes <= closeMinutes; t += slotMinutes) out.push(minutesToHHmm(t));
  return out;
}

const sortTimes = (l: string[]) => [...new Set(l)].sort((a, b) => hhmmToMinutes(a) - hhmmToMinutes(b));

/**
 * Créneaux d'un terrain pour une date : créneaux de cette date s'ils sont définis,
 * sinon créneaux personnalisés du terrain, sinon horaires généraux.
 */
export function pitchSchedule(
  config: AppConfig,
  pitch?: Pick<Pitch, 'slotStarts' | 'slotMinutes' | 'dateSlots'> | null,
  date?: string,
) {
  const minutes = pitch?.slotMinutes || config.slotMinutes;
  const forDate = date ? pitch?.dateSlots?.[date] : undefined;
  if (forDate) return { minutes, starts: sortTimes(forDate), custom: 'date' as const };
  const starts =
    pitch?.slotStarts && pitch.slotStarts.length
      ? [...pitch.slotStarts].sort((a, b) => hhmmToMinutes(a) - hhmmToMinutes(b))
      : generateStartTimes(config.openMinutes, config.closeMinutes, minutes);
  return { minutes, starts, custom: pitch?.slotStarts?.length ? ('pitch' as const) : null };
}

/** Retire les dates passées des créneaux par date (garde le document léger). */
export function pruneDateSlots(dateSlots: Record<string, string[]> | null | undefined, today: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [d, l] of Object.entries(dateSlots ?? {})) if (d >= today) out[d] = l;
  return out;
}

/** Génère la grille d'une journée pour un terrain, fusionnée avec les documents existants. */
export function buildDaySlots(
  config: AppConfig,
  pitchId: string,
  date: string,
  docs: SlotDoc[],
  now: number,
  pitch?: Pick<Pitch, 'slotStarts' | 'slotMinutes' | 'dateSlots' | 'disabledStarts'> | null,
): Slot[] {
  const { minutes, starts } = pitchSchedule(config, pitch, date);
  const off = new Set(pitch?.disabledStarts ?? []);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const out: Slot[] = [];
  const seen = new Set<string>();
  for (const start of starts) {
    const id = slotId(pitchId, date, start);
    seen.add(id);
    let doc = byId.get(id);
    let status = effectiveSlotStatus(doc, now);
    // Créneau désactivé par l'administrateur (s'il n'est pas déjà pris)
    if (status === 'free' && off.has(start)) {
      status = 'blocked';
      doc = { id, pitchId, date, start, end: minutesToHHmm(hhmmToMinutes(start) + minutes), status: 'blocked', reason: 'disabled' };
    }
    out.push({
      id,
      pitchId,
      date,
      start,
      end: minutesToHHmm(hhmmToMinutes(start) + minutes),
      status,
      past: dateTimeToMs(date, start) <= now,
      doc,
    });
  }
  // Réservations / blocages existants hors de la grille actuelle (ancienne configuration) : toujours affichés
  for (const doc of docs) {
    if (seen.has(doc.id) || doc.pitchId !== pitchId || doc.date !== date) continue;
    const status = effectiveSlotStatus(doc, now);
    if (status === 'free') continue;
    out.push({ id: doc.id, pitchId, date, start: doc.start, end: doc.end, status, past: dateTimeToMs(date, doc.start) <= now, doc });
  }
  return out.sort((a, b) => hhmmToMinutes(a.start) - hhmmToMinutes(b.start));
}

/** Fenêtre de réservation glissante : aujourd'hui + (days - 1) jours. */
export function bookingWindow(now: number, days: number): string[] {
  const today = toDateKey(new Date(now));
  return Array.from({ length: Math.max(1, days) }, (_, i) => addDays(today, i));
}

export function isWithinBookingWindow(date: string, now: number, days: number): boolean {
  const w = bookingWindow(now, days);
  return date >= w[0] && date <= w[w.length - 1];
}

export function isBookingActivePending(b: Booking, now: number): boolean {
  return b.status === 'pending' && b.expiresAt > now;
}

/** Statut affiché d'une réservation (une demande dépassée apparaît expirée). */
export function displayBookingStatus(b: Booking, now: number): BookingStatus {
  if (b.status === 'pending' && b.expiresAt <= now) return 'expired';
  return b.status;
}

/** File d'attente FIFO : demandes en attente non expirées, la plus ancienne d'abord. */
export function fifoQueue(bookings: Booking[], now: number): Booking[] {
  return bookings
    .filter((b) => isBookingActivePending(b, now))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/** Date limite d'une demande : délai d'expiration, sans dépasser 1 h avant le créneau. */
export function computeExpiresAt(config: AppConfig, date: string, start: string, now: number): number {
  const byDelay = now + config.expiryMinutes * 60_000;
  const beforeSlot = dateTimeToMs(date, start) - 60 * 60_000;
  return Math.max(now + 5 * 60_000, Math.min(byDelay, beforeSlot));
}

/** Un verrou agent est valable 2 minutes. */
export const LOCK_MS = 2 * 60_000;

export function isLockedByOther(b: Booking, agentId: string, now: number): boolean {
  return !!b.lockedBy && b.lockedBy !== agentId && !!b.lockedAt && now - b.lockedAt < LOCK_MS;
}

// ───────────────────────── Championnat : score ─────────────────────────

export function isLive(m: Match): boolean {
  return LIVE_STATUSES.includes(m.status);
}

export function isGoal(e: MatchEvent): boolean {
  return e.type === 'goal' || e.type === 'penalty_goal' || e.type === 'own_goal';
}

/** Équipe qui bénéficie du but. */
export function scoringTeamId(e: MatchEvent, m: Pick<Match, 'homeTeamId' | 'awayTeamId'>): string {
  if (e.type === 'own_goal') return e.teamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId;
  return e.teamId;
}

export function scoreFromEvents(
  m: Pick<Match, 'id' | 'homeTeamId' | 'awayTeamId'>,
  events: MatchEvent[],
): { homeScore: number; awayScore: number } {
  let homeScore = 0;
  let awayScore = 0;
  for (const e of events) {
    if (e.matchId !== m.id || !isGoal(e)) continue;
    if (scoringTeamId(e, m) === m.homeTeamId) homeScore++;
    else awayScore++;
  }
  return { homeScore, awayScore };
}

export function sortEvents(events: MatchEvent[]): MatchEvent[] {
  return [...events].sort((a, b) => a.half - b.half || a.minute - b.minute || a.createdAt - b.createdAt);
}

/** Minute de jeu courante d'un match en direct (texte type "34'" ou "25+2'"). */
export function liveMinuteLabel(m: Match, halfMinutes: number, now: number): string {
  if (m.status === 'half_time') return 'MT';
  if (m.status === 'first_half' && m.kickoffAt != null) {
    const min = Math.floor((now - m.kickoffAt) / 60_000) + 1;
    return min > halfMinutes ? `${halfMinutes}+${min - halfMinutes}'` : `${Math.max(1, min)}'`;
  }
  if (m.status === 'second_half' && m.secondHalfAt != null) {
    const min = halfMinutes + Math.floor((now - m.secondHalfAt) / 60_000) + 1;
    const full = halfMinutes * 2;
    return min > full ? `${full}+${min - full}'` : `${min}'`;
  }
  return '';
}

/** Minute numérique à proposer par défaut à l'admin pour un nouvel événement. */
export function currentMinute(m: Match, halfMinutes: number, now: number): { minute: number; half: 1 | 2 } {
  if (m.status === 'second_half' && m.secondHalfAt != null) {
    return { minute: halfMinutes + Math.floor((now - m.secondHalfAt) / 60_000) + 1, half: 2 };
  }
  if (m.status === 'half_time') return { minute: halfMinutes, half: 1 };
  if (m.kickoffAt != null) return { minute: Math.max(1, Math.floor((now - m.kickoffAt) / 60_000) + 1), half: 1 };
  return { minute: 1, half: 1 };
}

// ───────────────────────── Classement ─────────────────────────

export type FormResult = 'W' | 'D' | 'L';

export interface StandingRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  /** 5 derniers résultats, le plus récent en premier. */
  form: FormResult[];
  live: boolean;
  position: number;
  /** Variation de place due aux matchs en cours (+ = monte). */
  liveMove: number;
  /** Égalité parfaite (même après confrontations directes et fair-play) : tirage au sort à faire. */
  tieLot?: boolean;
}

function matchTime(m: Match): number {
  return m.kickoffAt ?? dateTimeToMs(m.date, m.start);
}

function rawStandings(
  season: Pick<Season, 'pointsWin' | 'pointsDraw' | 'pointsLoss' | 'lotOrder'>,
  teams: Team[],
  matches: Match[],
  includeLive: boolean,
  events?: MatchEvent[],
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const t of teams) {
    rows.set(t.id, {
      teamId: t.id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
      form: [],
      live: false,
      position: 0,
      liveMove: 0,
    });
  }
  const counted = matches
    .filter((m) => countsForTable(m) && (m.status === 'finished' || (includeLive && isLive(m))))
    .sort((a, b) => matchTime(a) - matchTime(b));

  for (const m of counted) {
    const h = rows.get(m.homeTeamId);
    const a = rows.get(m.awayTeamId);
    if (!h || !a) continue;
    const live = isLive(m);
    h.played++;
    a.played++;
    h.goalsFor += m.homeScore;
    h.goalsAgainst += m.awayScore;
    a.goalsFor += m.awayScore;
    a.goalsAgainst += m.homeScore;
    let hr: FormResult;
    let ar: FormResult;
    if (m.homeScore > m.awayScore) {
      h.won++;
      a.lost++;
      h.points += season.pointsWin;
      a.points += season.pointsLoss;
      hr = 'W';
      ar = 'L';
    } else if (m.homeScore < m.awayScore) {
      a.won++;
      h.lost++;
      a.points += season.pointsWin;
      h.points += season.pointsLoss;
      hr = 'L';
      ar = 'W';
    } else {
      h.drawn++;
      a.drawn++;
      h.points += season.pointsDraw;
      a.points += season.pointsDraw;
      hr = 'D';
      ar = 'D';
    }
    if (live) {
      h.live = true;
      a.live = true;
    } else {
      h.form.unshift(hr);
      a.form.unshift(ar);
    }
  }
  const list = [...rows.values()];
  for (const r of list) {
    r.goalDiff = r.goalsFor - r.goalsAgainst;
    r.form = r.form.slice(0, 5);
  }
  return sortStandings(list, counted, season, events);
}

/**
 * Tri du classement : points, différence de buts, buts marqués, confrontations directes
 * (mini-classement entre les équipes à égalité, quel que soit leur nombre), fair-play, tirage au sort.
 */
function sortStandings(
  rows: StandingRow[],
  matches: Match[],
  season: Pick<Season, 'pointsWin' | 'pointsDraw' | 'pointsLoss' | 'lotOrder'>,
  events?: MatchEvent[],
): StandingRow[] {
  // Fair-play (0 au départ, jaune −2, rouge −5) : plus proche de 0 = mieux
  const fair = new Map<string, number>();
  for (const e of events ?? []) if (e.type === 'yellow' || e.type === 'red') fair.set(e.teamId, (fair.get(e.teamId) ?? 0) + FAIRPLAY_POINTS[e.type]);
  const lot = new Map((season.lotOrder ?? []).map((id, i) => [id, i]));
  const key = (r: StandingRow) => `${r.points}|${r.goalDiff}|${r.goalsFor}`;

  /** Mini-classement des confrontations directes entre les équipes du groupe. */
  const mini = (ids: string[]) => {
    const set = new Set(ids);
    const t = new Map(ids.map((id) => [id, { pts: 0, gd: 0, gf: 0 }]));
    for (const m of matches) {
      if (!set.has(m.homeTeamId) || !set.has(m.awayTeamId)) continue;
      const h = t.get(m.homeTeamId)!;
      const a = t.get(m.awayTeamId)!;
      h.gf += m.homeScore;
      a.gf += m.awayScore;
      h.gd += m.homeScore - m.awayScore;
      a.gd += m.awayScore - m.homeScore;
      if (m.homeScore > m.awayScore) {
        h.pts += season.pointsWin;
        a.pts += season.pointsLoss;
      } else if (m.homeScore < m.awayScore) {
        a.pts += season.pointsWin;
        h.pts += season.pointsLoss;
      } else {
        h.pts += season.pointsDraw;
        a.pts += season.pointsDraw;
      }
    }
    return t;
  };

  /** Départage un groupe d'équipes à égalité (points, différence et buts marqués identiques). */
  const resolve = (group: StandingRow[]): StandingRow[] => {
    if (group.length < 2) return group;
    const t = mini(group.map((r) => r.teamId));
    const mk = (r: StandingRow) => {
      const x = t.get(r.teamId)!;
      return `${x.pts}|${x.gd}|${x.gf}`;
    };
    const sorted = [...group].sort((a, b) => {
      const x = t.get(a.teamId)!;
      const y = t.get(b.teamId)!;
      return y.pts - x.pts || y.gd - x.gd || y.gf - x.gf;
    });
    const out: StandingRow[] = [];
    for (let i = 0; i < sorted.length; ) {
      let j = i + 1;
      while (j < sorted.length && mk(sorted[j]) === mk(sorted[i])) j++;
      const sub = sorted.slice(i, j);
      if (sub.length === group.length) {
        // Confrontations directes sans effet : fair-play, puis tirage au sort
        const fp = [...sub].sort((a, b) => (fair.get(b.teamId) ?? 0) - (fair.get(a.teamId) ?? 0));
        for (let k = 0; k < fp.length; ) {
          let l = k + 1;
          while (l < fp.length && (fair.get(fp[l].teamId) ?? 0) === (fair.get(fp[k].teamId) ?? 0)) l++;
          const tied = fp.slice(k, l);
          if (tied.length > 1) {
            tied.sort((a, b) => (lot.get(a.teamId) ?? 999) - (lot.get(b.teamId) ?? 999) || a.teamId.localeCompare(b.teamId));
            const drawn = tied.every((r) => lot.has(r.teamId));
            for (const r of tied) r.tieLot = !drawn;
          }
          out.push(...tied);
          k = l;
        }
      } else out.push(...resolve(sub));
      i = j;
    }
    return out;
  };

  const base = [...rows].sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor);
  const sorted: StandingRow[] = [];
  for (let i = 0; i < base.length; ) {
    let j = i + 1;
    while (j < base.length && key(base[j]) === key(base[i])) j++;
    sorted.push(...resolve(base.slice(i, j)));
    i = j;
  }
  sorted.forEach((r, i) => (r.position = i + 1));
  return sorted;
}

/**
 * Classement. Avec includeLive, les matchs en cours comptent comme si le score actuel était final
 * et `liveMove` indique la variation de place par rapport au classement officiel.
 */
export function computeStandings(
  season: Pick<Season, 'pointsWin' | 'pointsDraw' | 'pointsLoss' | 'lotOrder'>,
  teams: Team[],
  matches: Match[],
  includeLive = true,
  /** Événements (cartons) pour le départage au fair-play. */
  events?: MatchEvent[],
): StandingRow[] {
  const official = rawStandings(season, teams, matches, false, events);
  if (!includeLive || !matches.some(isLive)) return official;
  const live = rawStandings(season, teams, matches, true, events);
  const officialPos = new Map(official.map((r) => [r.teamId, r.position]));
  for (const r of live) r.liveMove = (officialPos.get(r.teamId) ?? r.position) - r.position;
  return live;
}

/** Tournoi à poules : un classement par poule (équipes et matchs de la poule). */
export function groupStandings(
  season: Pick<Season, 'pointsWin' | 'pointsDraw' | 'pointsLoss' | 'groupCount' | 'lotOrder'>,
  teams: Team[],
  matches: Match[],
  events?: MatchEvent[],
): { group: string; rows: StandingRow[] }[] {
  return groupLetters(season.groupCount).map((g) => ({
    group: g,
    rows: computeStandings(
      season,
      teams.filter((x) => x.group === g),
      matches.filter((m) => m.stage === 'group' && m.group === g),
      true,
      events,
    ),
  }));
}

/** Tableau à élimination : matchs regroupés par tour, du premier tour à la finale (3e place en dernier). */
export function bracketRounds(matches: Match[]): { round: KoRound; matches: Match[] }[] {
  const ko = matches.filter((m) => m.stage === 'ko' && m.koRound != null);
  return KO_ROUNDS.map((r) => ({ round: r, matches: ko.filter((m) => m.koRound === r).sort((a, b) => matchTime(a) - matchTime(b)) })).filter((x) => x.matches.length);
}

// ───────────────────────── Statistiques joueurs ─────────────────────────

export interface PlayerStat {
  playerId: string;
  teamId: string;
  goals: number;
  assists: number;
  yellows: number;
  reds: number;
  played: number;
  /** Matchs de suspension restant à purger. */
  suspendedMatches: number;
  /** Jaunes accumulés depuis la dernière suspension pour cumul. */
  yellowAccum: number;
  live: boolean;
}

/** Statistiques par joueur, calculées à partir des événements et des feuilles de match. */
export function computePlayerStats(
  season: Pick<Season, 'yellowLimit' | 'redBanMatches'>,
  players: Player[],
  matches: Match[],
  events: MatchEvent[],
): Map<string, PlayerStat> {
  const stats = new Map<string, PlayerStat>();
  for (const p of players) {
    stats.set(p.id, {
      playerId: p.id,
      teamId: p.teamId,
      goals: 0,
      assists: 0,
      yellows: 0,
      reds: 0,
      played: 0,
      suspendedMatches: 0,
      yellowAccum: 0,
      live: false,
    });
  }
  const byMatch = new Map<string, MatchEvent[]>();
  for (const e of events) {
    const arr = byMatch.get(e.matchId) ?? [];
    arr.push(e);
    byMatch.set(e.matchId, arr);
  }
  const started = matches
    .filter((m) => m.status === 'finished' || isLive(m))
    .sort((a, b) => matchTime(a) - matchTime(b));

  for (const m of started) {
    const evs = byMatch.get(m.id) ?? [];
    const live = isLive(m);
    const finished = m.status === 'finished';

    // 1) Purge des suspensions : un joueur suspendu purge un match quand son équipe joue un match terminé.
    if (finished) {
      for (const s of stats.values()) {
        if ((s.teamId === m.homeTeamId || s.teamId === m.awayTeamId) && s.suspendedMatches > 0) {
          s.suspendedMatches--;
        }
      }
    }

    // 2) Présence sur la feuille de match
    for (const pid of [...(m.homeLineup ?? []), ...(m.awayLineup ?? [])]) {
      const s = stats.get(pid);
      if (s) s.played++;
    }

    // 3) Événements
    const yellowsThisMatch = new Map<string, number>();
    const redThisMatch = new Set<string>();
    for (const e of evs) {
      const s = stats.get(e.playerId);
      if (live) {
        if (s) s.live = true;
      }
      if (e.type === 'goal' || e.type === 'penalty_goal') {
        if (s) s.goals++;
        if (e.assistId) {
          const a = stats.get(e.assistId);
          if (a) a.assists++;
        }
      } else if (e.type === 'yellow') {
        if (s) s.yellows++;
        yellowsThisMatch.set(e.playerId, (yellowsThisMatch.get(e.playerId) ?? 0) + 1);
      } else if (e.type === 'red') {
        if (s) s.reds++;
        redThisMatch.add(e.playerId);
      }
    }

    // 4) Nouvelles suspensions (appliquées une fois le match terminé)
    if (finished) {
      for (const pid of redThisMatch) {
        const s = stats.get(pid);
        if (s) s.suspendedMatches += season.redBanMatches;
      }
      for (const [pid, n] of yellowsThisMatch) {
        if (redThisMatch.has(pid)) continue; // expulsé : les jaunes du match ne comptent pas au cumul
        const s = stats.get(pid);
        if (!s) continue;
        s.yellowAccum += n;
        if (season.yellowLimit > 0 && s.yellowAccum >= season.yellowLimit) {
          s.suspendedMatches += 1;
          s.yellowAccum -= season.yellowLimit;
        }
      }
    }
  }
  return stats;
}

export function topScorers(stats: Map<string, PlayerStat>): PlayerStat[] {
  return [...stats.values()]
    .filter((s) => s.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.playerId.localeCompare(b.playerId));
}

export function topAssists(stats: Map<string, PlayerStat>): PlayerStat[] {
  return [...stats.values()]
    .filter((s) => s.assists > 0)
    .sort((a, b) => b.assists - a.assists || b.goals - a.goals || a.playerId.localeCompare(b.playerId));
}

export function disciplineTable(stats: Map<string, PlayerStat>): PlayerStat[] {
  return [...stats.values()]
    .filter((s) => s.yellows > 0 || s.reds > 0 || s.suspendedMatches > 0)
    .sort(
      (a, b) =>
        b.suspendedMatches - a.suspendedMatches ||
        b.reds - a.reds ||
        b.yellows - a.yellows ||
        a.playerId.localeCompare(b.playerId),
    );
}

/** Rang avec ex-aequo (1, 2, 2, 4…) selon une valeur. */
export function ranks<T>(list: T[], value: (x: T) => number): number[] {
  const out: number[] = [];
  list.forEach((x, i) => {
    if (i > 0 && value(list[i - 1]) === value(x)) out.push(out[i - 1]);
    else out.push(i + 1);
  });
  return out;
}

// ───────────────────────── Calendrier ─────────────────────────

/**
 * Round-robin (méthode du cercle). Renvoie les journées sous forme de paires [domicile, extérieur].
 * Avec doubleRound, la phase retour inverse domicile/extérieur.
 */
export function roundRobin(teamIds: string[], doubleRound: boolean): [string, string][][] {
  const ids = [...teamIds];
  if (ids.length < 2) return [];
  const BYE = '__bye__';
  if (ids.length % 2 === 1) ids.push(BYE);
  const n = ids.length;
  const rounds: [string, string][][] = [];
  let rot = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const circle = [ids[0], ...rot];
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = circle[i];
      const b = circle[n - 1 - i];
      if (a === BYE || b === BYE) continue;
      // alterne domicile/extérieur pour équilibrer
      pairs.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)];
  }
  if (doubleRound) {
    const back = rounds.map((pairs) => pairs.map(([a, b]) => [b, a] as [string, string]));
    return [...rounds, ...back];
  }
  return rounds;
}

// ───────────────────────── Générateur automatique du calendrier ─────────────────────────

/** Le générateur automatique est proposé pour ce championnat ? (pour l'instant : championnat +35, sur le site) */
export const autoCalendarAvailable = (s: Pick<Season, 'kind' | 'category'> | null | undefined) => !!s && !isCup(s) && s.category === 'over35';

export interface PlannedMatch {
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  date: string;
  start: string;
  pitchId: string;
}

export interface CalendarPlanInput {
  teamIds: string[];
  doubleRound: boolean;
  /** Matchs conservés (joués ou en cours) : leurs rencontres ne sont pas reprogrammées. */
  keep: Pick<Match, 'homeTeamId' | 'awayTeamId'>[];
  startDate: string;
  /** Jours de la semaine autorisés (0 = dimanche … 6 = samedi). */
  weekdays: number[];
  /** Heures de coup d'envoi possibles, dans l'ordre de préférence. */
  times: string[];
  pitchIds: string[];
  /** Le créneau est-il libre (horaires du terrain, réservations, blocages) ? */
  free: (pitchId: string, date: string, start: string) => boolean;
  /** Fenêtre de recherche en jours (défaut 365). */
  maxDays?: number;
  /** Ordre des équipes (mélange) : graine du tirage. */
  seed?: number;
}

/** Jour de la semaine d'une date AAAA-MM-JJ (0 = dimanche). */
export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Propose un calendrier : rencontres aller (et retour), journée par journée, sur les jours, heures et terrains choisis.
 * Chaque journée commence un nouveau jour de match ; une équipe joue au plus une fois par jour ;
 * les créneaux déjà pris (réservations, blocages, autres matchs) sont évités.
 */
export function planCalendar(input: CalendarPlanInput): { matches: PlannedMatch[]; unplaced: [string, string][] } {
  // Tirage : ordre des équipes mélangé selon la graine (même graine = même calendrier)
  let seed = (input.seed ?? 1) >>> 0;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ids = [...input.teamIds];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const rounds = roundRobin(ids, input.doubleRound);
  // Rencontres déjà jouées : retirées (sens exact en aller-retour, l'un ou l'autre sinon)
  const kept = input.keep.map((m) => [m.homeTeamId, m.awayTeamId]);
  const takeKept = (a: string, b: string) => {
    const i = kept.findIndex(([h, w]) => (h === a && w === b) || (!input.doubleRound && h === b && w === a));
    if (i < 0) return false;
    kept.splice(i, 1);
    return true;
  };
  const dates: string[] = [];
  const days = input.maxDays ?? 365;
  for (let i = 0; i < days; i++) {
    const d = addDays(input.startDate, i);
    if (input.weekdays.includes(weekdayOf(d))) dates.push(d);
  }
  const times = [...input.times].sort((a, b) => hhmmToMinutes(a) - hhmmToMinutes(b));
  const used = new Set<string>();
  const matches: PlannedMatch[] = [];
  const unplaced: [string, string][] = [];
  let cursor = 0;
  rounds.forEach((pairs, r) => {
    const pending = pairs.filter(([a, b]) => !takeKept(a, b));
    if (!pending.length) return;
    let d = cursor;
    let last = -1;
    while (pending.length && d < dates.length) {
      const date = dates[d];
      const busy = new Set<string>();
      for (const start of times) {
        for (const pitchId of input.pitchIds) {
          const key = `${pitchId}|${date}|${start}`;
          if (used.has(key) || !input.free(pitchId, date, start)) continue;
          const k = pending.findIndex(([a, b]) => !busy.has(a) && !busy.has(b));
          if (k < 0) break;
          const [home, away] = pending.splice(k, 1)[0];
          busy.add(home);
          busy.add(away);
          used.add(key);
          matches.push({ round: r + 1, homeTeamId: home, awayTeamId: away, date, start, pitchId });
          last = d;
        }
      }
      d++;
    }
    unplaced.push(...pending);
    cursor = last >= 0 ? last + 1 : d;
  });
  return { matches, unplaced };
}

// ───────────────────────── Live stream ─────────────────────────

/** URL du lecteur intégré Facebook pour une vidéo (live ou replay) publique d'une Page. */
export function facebookEmbedUrl(videoUrl: string): string {
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(
    videoUrl.trim(),
  )}&show_text=false&autoplay=true&mute=0&width=560`;
}

export function isFacebookUrl(url: string): boolean {
  return /^https?:\/\/(www\.|m\.|web\.)?(facebook\.com|fb\.watch)\//i.test(url.trim());
}

// ───────────────────────── Vitrine : carrousel et vidéos ─────────────────────────

export interface ShowcaseItem {
  id: string;
  kind: 'slide' | 'video';
  title: string;
  subtitle?: string | null;
  /** Image : data URI (photo du téléphone) ou URL. */
  image?: string | null;
  /** Vidéo : lien YouTube, Facebook ou fichier .mp4. */
  videoUrl?: string | null;
  order: number;
  active: boolean;
  createdAt: number;
}

export function youtubeId(url: string): string | null {
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url.trim());
  return m ? m[1] : null;
}

export type VideoSource = { type: 'youtube'; id: string } | { type: 'facebook'; url: string } | { type: 'file'; url: string } | null;

export function videoSource(url?: string | null): VideoSource {
  if (!url) return null;
  const yt = youtubeId(url);
  if (yt) return { type: 'youtube', id: yt };
  if (isFacebookUrl(url)) return { type: 'facebook', url: url.trim() };
  if (/^https?:\/\/\S+\.(mp4|m4v|mov|webm)(\?.*)?$/i.test(url.trim())) return { type: 'file', url: url.trim() };
  return null;
}

/** Miniature d'une vidéo (YouTube seulement ; sinon l'image fournie). */
export function videoThumbnail(item: Pick<ShowcaseItem, 'image' | 'videoUrl'>): string | null {
  if (item.image) return item.image;
  const src = videoSource(item.videoUrl);
  return src?.type === 'youtube' ? `https://img.youtube.com/vi/${src.id}/hqdefault.jpg` : null;
}

// ───────────────────────── Boîte de notifications (in-app) ─────────────────────────

export interface InboxItem {
  id: string;
  /** Destinataire précis… */
  userId?: string | null;
  /** …ou tout le personnel ("staff" = agents + admins). */
  audience?: 'staff' | null;
  fr: { title: string; body: string };
  en: { title: string; body: string };
  url?: string | null;
  createdAt: number;
}

// ───────────────────────── Tâches à faire ─────────────────────────

export interface TodoItem {
  id: string;
  kind: string;
  /** Plus petit = plus urgent. */
  priority: number;
  count?: number;
  /** Paramètres libres pour le texte (nom d'équipe, date…). */
  params?: Record<string, string | number>;
  url: string;
  dueAt?: number;
}

/** Tâches en attente pour une entreprise. */
export function companyTodos(input: {
  team: Team | null;
  seasonOpen: boolean;
  players: Player[];
  matches: Match[];
  now: number;
}): TodoItem[] {
  const { team, players, matches, now } = input;
  const out: TodoItem[] = [];
  if (!team) {
    if (input.seasonOpen) out.push({ id: 'register', kind: 'registerTeam', priority: 0, url: '/company' });
    return out;
  }
  const status = teamRequestStatus(team);
  if (status === 'draft') out.push({ id: 'complete', kind: 'completeRegistration', priority: 0, url: '/company' });
  if (status === 'submitted') out.push({ id: 'teamPending', kind: 'teamPending', priority: 5, url: '/company' });
  if (status === 'rejected') out.push({ id: 'teamRejected', kind: 'teamRejected', priority: 0, url: '/company' });
  if ((team.collectiveAttestationPromised && !team.collectiveAttestationId) || (team.collectiveCertificatePromised && !team.collectiveCertificateId))
    out.push({ id: 'collective', kind: 'sendCollective', priority: 1, url: '/entreprise/joueurs' });
  const mine = players.filter((p) => p.teamId === team.id);
  const drafts = mine.filter((p) => p.status === 'draft');
  const rejected = mine.filter((p) => p.status === 'rejected');
  const pending = mine.filter((p) => p.status === 'pending');
  const approved = mine.filter(isPlayerApproved);
  if (!mine.length && status !== 'draft') out.push({ id: 'addPlayers', kind: 'addPlayers', priority: 1, url: '/entreprise/joueurs' });
  // Brouillons à soumettre : seulement une fois l'équipe inscrite (sinon ils partent avec la demande)
  if (drafts.length && status !== 'draft') out.push({ id: 'submit', kind: 'submitPlayers', priority: 1, count: drafts.length, url: '/entreprise/joueurs' });
  if (rejected.length) out.push({ id: 'rejected', kind: 'fixRejected', priority: 2, count: rejected.length, url: '/entreprise/joueurs' });
  if (pending.length && status !== 'submitted') out.push({ id: 'pending', kind: 'waitingValidation', priority: 6, count: pending.length, url: '/entreprise/joueurs' });
  const noNumber = approved.filter((p) => !p.number);
  if (status === 'approved' && noNumber.length) out.push({ id: 'numbers', kind: 'setNumbers', priority: 2, count: noNumber.length, url: '/company' });
  for (const m of matches) {
    if (m.homeTeamId !== team.id && m.awayTeamId !== team.id) continue;
    if (!canCompanyEditLineup(m, now)) continue;
    const deadline = lineupDeadline(m);
    if (deadline - now > 7 * 86400_000) continue; // seulement les 7 prochains jours
    const lineup = m.homeTeamId === team.id ? m.homeLineup : m.awayLineup;
    if (!lineup?.length) {
      out.push({ id: `sel-${m.id}`, kind: 'selectLineup', priority: deadline - now < 24 * 3600_000 ? 0 : 3, url: `/entreprise/selection/${m.id}`, dueAt: deadline, params: { matchId: m.id } });
    }
  }
  return out.sort((a, b) => a.priority - b.priority || (a.dueAt ?? 0) - (b.dueAt ?? 0));
}

/** Tâches en attente pour l'administrateur. */
export function adminTodos(input: {
  pendingBookings: number;
  teams: Team[];
  players: Player[];
  matches: Match[];
  now: number;
  whatsappConfigured: boolean;
}): TodoItem[] {
  const { now } = input;
  const out: TodoItem[] = [];
  if (input.pendingBookings) out.push({ id: 'bookings', kind: 'pendingBookings', priority: 0, count: input.pendingBookings, url: '/admin/queue' });
  const pendingTeams = input.teams.filter((t) => teamRequestStatus(t) === 'submitted');
  if (pendingTeams.length) out.push({ id: 'teams', kind: 'pendingTeams', priority: 1, count: pendingTeams.length, url: '/admin/championships' });
  const pendingPlayers = input.players.filter((p) => p.status === 'pending');
  if (pendingPlayers.length) out.push({ id: 'players', kind: 'pendingPlayers', priority: 1, count: pendingPlayers.length, url: '/admin/championships' });
  const unfinished = input.matches.filter(
    (m) => (m.status === 'first_half' || m.status === 'second_half' || m.status === 'half_time') && now - matchPlannedAt(m) > 3 * 3600_000,
  );
  if (unfinished.length) out.push({ id: 'unfinished', kind: 'unfinishedMatches', priority: 2, count: unfinished.length, url: unfinished.length === 1 ? `/admin/live/${unfinished[0].id}` : '/admin/championships' });
  const notPlayed = input.matches.filter((m) => m.status === 'scheduled' && now - matchPlannedAt(m) > 3 * 3600_000);
  if (notPlayed.length) out.push({ id: 'notPlayed', kind: 'matchesWithoutResult', priority: 2, count: notPlayed.length, url: notPlayed.length === 1 ? `/admin/live/${notPlayed[0].id}` : '/admin/championships' });
  // Feuille de match à remplir (match dans les 36 h)
  const due = input.matches.filter((m) => sheetDue(m, now));
  if (due.length) out.push({ id: 'sheets', kind: 'sheetDue', priority: 1, count: due.length, url: due.length === 1 ? `/admin/live/${due[0].id}` : '/admin/championships' });
  if (!input.whatsappConfigured) out.push({ id: 'whatsapp', kind: 'configureWhatsapp', priority: 9, url: '/admin/settings' });
  return out.sort((a, b) => a.priority - b.priority);
}


// ───────────────────────── Inscription : pièces et licences ─────────────────────────

export type FileKind = 'cin' | 'photo' | 'attestation' | 'certificate' | 'logo' | 'collectiveAttestation' | 'collectiveCertificate';

/** Pièce jointe stockée dans la base (image compressée ou PDF en data URI). */
export interface StoredFile {
  id: string;
  teamId: string;
  ownerId: string;
  kind: FileKind;
  mime: string;
  name: string;
  size: number;
  data: string;
  createdAt: number;
}

/** Nombre minimum de joueurs pour envoyer une demande d'inscription. */
export const MIN_SQUAD = 6;
/** Effectif maximum d'une équipe : 18 places ; un joueur validé puis retiré garde sa place (perdue). */
export const SQUAD_MAX = 18;

/** Places occupées : joueurs en brouillon, en attente, validés ou retirés après validation (les refusés ne comptent pas). */
export function squadPlacesUsed(players: Pick<Player, 'status'>[]): number {
  return players.filter((p) => (p.status ?? 'approved') !== 'rejected').length;
}
export const isRemoved = (p: Pick<Player, 'status'>) => p.status === 'removed';

export interface SquadCheck {
  /** Joueurs sans pièce d'identité ou sans photo (bloquant). */
  missingRequired: { playerId: string; missing: ('cin' | 'photo' | 'birthDate')[] }[];
  /** Joueurs sans attestation de travail, non couverts par une attestation collective. */
  missingAttestation: string[];
  /** Joueurs sans certificat d'aptitude, non couverts par un certificat collectif. */
  missingCertificate: string[];
  tooFew: boolean;
}

/** Vérifie l'effectif avant l'envoi de la demande (BF « inscription entreprise »). */
export function checkSquad(
  team: Pick<Team, 'collectiveAttestationId' | 'collectiveCertificateId'>,
  players: Pick<Player, 'id' | 'birthDate'>[],
  infos: Map<string, Pick<PlayerInfo, 'cinFileId' | 'photoFileId' | 'attestationFileId' | 'certificateFileId'>>,
): SquadCheck {
  const out: SquadCheck = { missingRequired: [], missingAttestation: [], missingCertificate: [], tooFew: players.length < MIN_SQUAD };
  for (const p of players) {
    const i = infos.get(p.id);
    const missing: ('cin' | 'photo' | 'birthDate')[] = [];
    if (!i?.cinFileId) missing.push('cin');
    if (!i?.photoFileId) missing.push('photo');
    if (!p.birthDate) missing.push('birthDate');
    if (missing.length) out.missingRequired.push({ playerId: p.id, missing });
    if (!i?.attestationFileId && !team.collectiveAttestationId) out.missingAttestation.push(p.id);
    if (!i?.certificateFileId && !team.collectiveCertificateId) out.missingCertificate.push(p.id);
  }
  return out;
}

/** Numéro de licence : TGL-AA-ABR-NNN (année de saison, abréviation de l'équipe, rang). */
export function licenseNumber(seasonYear: number, shortName: string, index: number, prefix = 'TGL'): string {
  const abr = (shortName || 'TGL').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3).padEnd(3, 'X');
  return `${prefix}-${String(seasonYear).slice(-2)}-${abr}-${String(index).padStart(3, '0')}`;
}

/** Nom de la ligue imprimé sur les cartes et feuilles : Tunisia Golden League ou Tunisia Silver League (+35). */
export function leagueTitle(season: Pick<Season, 'category'> | null | undefined): string {
  return season?.category === 'over35' ? 'Tunisia Silver League' : 'Tunisia Golden League';
}

/** Préfixe des licences : TGL (Tunisia Golden League), TSL (Tunisia Silver League, +35) — pas de doublon entre championnats. */
export function licensePrefix(season: Pick<Season, 'category'> | null | undefined): string {
  return season?.category === 'over35' ? 'TSL' : 'TGL';
}

/** Nom affiché d'un joueur à partir du prénom et du nom. */
export function fullName(first?: string | null, last?: string | null): string {
  return [first?.trim(), last?.trim()].filter(Boolean).join(' ');
}

// ───────────────────────── Recettes des terrains ─────────────────────────

export type RevenueSource = 'app' | 'phone' | 'private';

/** Montant d'une réservation : montant saisi, sinon tarif du type de terrain. */
export function bookingAmount(b: Pick<Booking, 'amount'>, pitch: Pick<Pitch, 'type'> | undefined, config: Pick<AppConfig, 'price6v6' | 'price7v7'>): number {
  if (typeof b.amount === 'number' && b.amount >= 0) return b.amount;
  return pitch?.type === '7v7' ? config.price7v7 : config.price6v6;
}

export function bookingSource(b: Pick<Booking, 'private' | 'manual'>): RevenueSource {
  return b.private ? 'private' : b.manual ? 'phone' : 'app';
}

export interface RevenueSummary {
  total: number;
  /** Créneaux déjà joués (encaissés). */
  realized: number;
  /** Créneaux à venir sur la période. */
  upcoming: number;
  count: number;
  average: number;
  /** Taux d'occupation (créneaux réservés / créneaux ouverts) en %. */
  occupancy: number;
  byDay: { date: string; amount: number; count: number }[];
  byPitch: { pitchId: string; name: string; type: PitchType; amount: number; count: number }[];
  bySource: Record<RevenueSource, { amount: number; count: number }>;
  byHour: { start: string; count: number }[];
}

/** Tableau de bord des recettes sur une période [from, to] (dates incluses). */
export function revenueSummary(
  bookings: Booking[],
  pitches: Pitch[],
  config: AppConfig,
  from: string,
  to: string,
  now: number,
  /** Créneaux bloqués pour le championnat (non réservables) à retirer du calcul d'occupation. */
  championshipSlots = 0,
): RevenueSummary {
  const pitchById = new Map(pitches.map((p) => [p.id, p]));
  const inRange = bookings.filter((b) => b.status === 'confirmed' && b.date >= from && b.date <= to);
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 400; d = addDays(d, 1)) days.push(d);
  const byDay = new Map(days.map((d) => [d, { date: d, amount: 0, count: 0 }]));
  const byPitch = new Map(
    pitches.map((p) => [p.id, { pitchId: p.id, name: p.name, type: p.type, amount: 0, count: 0 }]),
  );
  const bySource: RevenueSummary['bySource'] = { app: { amount: 0, count: 0 }, phone: { amount: 0, count: 0 }, private: { amount: 0, count: 0 } };
  const byHour = new Map<string, number>();
  let total = 0;
  let realized = 0;
  for (const b of inRange) {
    const pitch = pitchById.get(b.pitchId);
    const amount = bookingAmount(b, pitch, config);
    total += amount;
    if (dateTimeToMs(b.date, b.start) <= now) realized += amount;
    const d = byDay.get(b.date);
    if (d) {
      d.amount += amount;
      d.count++;
    }
    const pp = byPitch.get(b.pitchId) ?? { pitchId: b.pitchId, name: b.pitchName, type: pitch?.type ?? '6v6', amount: 0, count: 0 };
    pp.amount += amount;
    pp.count++;
    byPitch.set(b.pitchId, pp);
    const src = bySource[bookingSource(b)];
    src.amount += amount;
    src.count++;
    byHour.set(b.start, (byHour.get(b.start) ?? 0) + 1);
  }
  let open = 0;
  for (const p of pitches.filter((x) => x.active)) for (const d of days) open += pitchSchedule(config, p, d).starts.length;
  open = Math.max(0, open - championshipSlots);
  return {
    total,
    realized,
    upcoming: total - realized,
    count: inRange.length,
    average: inRange.length ? Math.round(total / inRange.length) : 0,
    occupancy: open ? Math.min(100, Math.round((inRange.length / open) * 100)) : 0,
    byDay: [...byDay.values()],
    byPitch: [...byPitch.values()].sort((a, b) => b.amount - a.amount),
    bySource,
    byHour: [...byHour.entries()].map(([start, count]) => ({ start, count })).sort((a, b) => hhmmToMinutes(a.start) - hhmmToMinutes(b.start)),
  };
}

/** Dates d'une série hebdomadaire (créneau fixe) : même jour, n semaines. */
export function weeklyDates(date: string, weeks: number): string[] {
  return Array.from({ length: Math.max(1, Math.min(52, weeks)) }, (_, i) => addDays(date, i * 7));
}

// ───────────────────────── Fair-play ─────────────────────────

export const FAIRPLAY_POINTS = { yellow: -2, red: -5 } as const;

export interface FairPlayRow {
  teamId: string;
  points: number;
  yellows: number;
  reds: number;
  /** Dont cartons de l'entraîneur. */
  coachCards: number;
}

/** Classement du fair-play : chaque équipe part de 0 ; jaune −2, rouge −5 (joueurs et entraîneur). */
export function fairPlayTable(teams: Pick<Team, 'id' | 'name'>[], events: MatchEvent[]): FairPlayRow[] {
  const rows = new Map<string, FairPlayRow>(teams.map((t) => [t.id, { teamId: t.id, points: 0, yellows: 0, reds: 0, coachCards: 0 }]));
  for (const e of events) {
    if (e.type !== 'yellow' && e.type !== 'red') continue;
    const r = rows.get(e.teamId);
    if (!r) continue;
    if (e.type === 'yellow') r.yellows++;
    else r.reds++;
    if (e.coach) r.coachCards++;
    r.points += FAIRPLAY_POINTS[e.type];
  }
  const name = new Map(teams.map((t) => [t.id, t.name]));
  return [...rows.values()].sort((a, b) => b.points - a.points || a.reds - b.reds || a.yellows - b.yellows || (name.get(a.teamId) ?? '').localeCompare(name.get(b.teamId) ?? ''));
}

// ───────────────────────── Permissions du personnel ─────────────────────────

export const PERMS = [
  'pitches.manage',
  'slots.config',
  'planning',
  'queue',
  'private',
  'champ.create',
  'champ.edit',
  'champ.delete',
  'teams.validate',
  'licences',
  'matches.calendar',
  'matches.sheet',
  'matches.live',
  'staff',
  'showcase',
  'news',
  'settings',
] as const;
export type Perm = (typeof PERMS)[number];

/** Groupes affichés dans la gestion du personnel. */
export const PERM_GROUPS: { key: 'pitches' | 'champ' | 'content' | 'admin'; perms: Perm[] }[] = [
  { key: 'pitches', perms: ['pitches.manage', 'slots.config', 'planning', 'queue', 'private'] },
  { key: 'champ', perms: ['champ.create', 'champ.edit', 'champ.delete', 'teams.validate', 'licences', 'matches.calendar', 'matches.sheet', 'matches.live'] },
  { key: 'content', perms: ['showcase', 'news'] },
  { key: 'admin', perms: ['staff', 'settings'] },
];

const ROLE_DEFAULT_PERMS: Partial<Record<Role, Perm[]>> = {
  admin: [...PERMS],
  agent: ['planning', 'queue'],
  operator: ['matches.live', 'matches.sheet'],
};

/** Valeur par défaut d'une permission pour un rôle (identique aux règles Firestore). */
export function roleDefaultPerm(role: Role | null | undefined, p: Perm): boolean {
  return !!role && !!ROLE_DEFAULT_PERMS[role]?.includes(p);
}

/** Permission effective : réglage de l'administrateur, sinon valeur par défaut du rôle. */
export function hasPerm(u: Pick<UserProfile, 'role' | 'perms'> | null | undefined, p: Perm): boolean {
  if (!u || !isStaffRole(u.role)) return false;
  const v = u.perms?.[p];
  return typeof v === 'boolean' ? v : roleDefaultPerm(u.role, p);
}

export const PITCH_PERMS: Perm[] = ['pitches.manage', 'slots.config', 'planning', 'queue', 'private'];
export const CHAMP_PERMS: Perm[] = ['champ.create', 'champ.edit', 'champ.delete', 'teams.validate', 'licences', 'matches.calendar', 'matches.sheet', 'matches.live'];
export const anyPerm = (u: Pick<UserProfile, 'role' | 'perms'> | null | undefined, list: Perm[]) => list.some((p) => hasPerm(u, p));
