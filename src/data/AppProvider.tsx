import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyTheme, THEME_KEY, themeMode, type ThemeMode } from '../ui/theme';
import { AppState as RNAppState, Platform } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_CONFIG,
  anyPerm,
  CHAMP_PERMS,
  hasPerm,
  PITCH_PERMS,
  type Perm,
  canRequestBooking,
  canSeeLeague,
  isStaffRole,
  type ShowcaseItem,
  isPlayerApproved,
  isTeamApproved,
  type InboxItem,
  computePlayerStats,
  computeStandings,
  type AppConfig,
  type Lang,
  type Match,
  type MatchEvent,
  type Pitch,
  type Player,
  type PlayerStat,
  type Season,
  type StandingRow,
  type Team,
  type UserProfile,
} from '../domain/model';
import { STRINGS, type StringKey } from '../i18n/strings';
import { createDemoAuth, createFirebaseAuth, type AuthService } from './auth';
import { buildDemoSeed } from './demoSeed';
import { apiNotifier, createApiAuth, createApiStore, isApiConfigured, wakeRealtime } from './api';
import { createFirebaseStore, isFirebaseConfigured } from './firebase';
import { createMemoryStore } from './memoryStore';
import { createNotifier, type Notifier } from './notify';
import { syncSheetReminders, syncTodayReminders } from './sheetReminders';
import { DEFAULT_PREFS, registerForPush, savePushToken, type PushPrefs } from './push';
import { createServices, type Services } from './services';
import { COL, type Store } from './store';

export type TFn = (key: StringKey, vars?: Record<string, string | number>) => string;

interface Backend {
  /** api : serveur de l'académie (VPS) · firebase : ancien hébergement · demo : données d'exemple */
  mode: 'demo' | 'firebase' | 'api';
  store: Store;
  auth: AuthService;
  services: Services;
  notifier: Notifier;
}

let backendSingleton: Backend | null = null;
function getBackend(): Backend {
  if (!backendSingleton) {
    const mode = isApiConfigured ? 'api' : isFirebaseConfigured ? 'firebase' : 'demo';
    const store = mode === 'api' ? createApiStore() : mode === 'firebase' ? createFirebaseStore() : createMemoryStore(buildDemoSeed());
    const auth = mode === 'api' ? createApiAuth() : mode === 'firebase' ? createFirebaseAuth() : createDemoAuth();
    backendSingleton = { mode, store, auth, services: createServices(store), notifier: createNotifier(store, mode !== 'demo', mode === 'api' ? apiNotifier : undefined) };
  }
  return backendSingleton;
}

interface AppState extends Backend {
  authReady: boolean;
  uid: string | null;
  user: UserProfile | null;
  /** Accès à l'espace administration (agent, opérateur ou admin). */
  isStaff: boolean;
  isAdmin: boolean;
  /** Opérateur de match (console live). */
  isOperator: boolean;
  /** Peut traiter les réservations (agent, admin). */
  canBook: boolean;
  /** Peut gérer les matchs en direct : score, buteurs, cartons (opérateur, admin). */
  canOperate: boolean;
  isCompany: boolean;
  /** Peut demander une réservation de terrain (clients et visiteurs uniquement). */
  canBookPitch: boolean;
  /** Voit le championnat : matchs, calendrier, classements (entreprises et personnel). */
  seesLeague: boolean;
  /** Vitrine : photos du carrousel et vidéos publicitaires (triées). */
  showcase: ShowcaseItem[];
  /** Équipe de l'entreprise connectée (saison active). */
  myTeam: Team | null;
  /** Entreprise : toutes ses équipes (une par championnat). */
  myTeams: Team[];
  /** Permission du compte connecté (réglée par l'administrateur, sinon valeur du rôle). */
  can: (p: Perm) => boolean;
  /** Voit la rubrique Championnats (au moins une permission du championnat). */
  canChamp: boolean;
  /** Toutes les équipes / tous les joueurs, y compris non validés (admin, entreprise). */
  allTeams: Team[];
  allPlayers: Player[];
  inbox: InboxItem[];
  inboxUnread: number;
  inboxSeenAt: number;
  markInboxSeen: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Thème d'affichage (sombre / clair), mémorisé sur l'appareil. */
  theme: ThemeMode;
  toggleTheme: () => void;
  t: TFn;
  config: AppConfig;
  pitches: Pitch[];
  seasons: Season[];
  /** Championnat affiché (choisi par l'utilisateur parmi les championnats actifs). */
  season: Season | null;
  championships: Season[];
  setChampionship: (id: string) => void;
  /** Équipes et matchs de tous les championnats actifs. */
  teamsAll: Team[];
  playersAll: Player[];
  matchesAll: Match[];
  /** Événements (buts, cartons…) de tous les championnats. */
  eventsAll: MatchEvent[];
  teams: Team[];
  players: Player[];
  matches: Match[];
  events: MatchEvent[];
  teamById: Map<string, Team>;
  playerById: Map<string, Player>;
  playerStats: Map<string, PlayerStat>;
  standings: StandingRow[];
  officialStandings: StandingRow[];
  /** Notifications push : jeton de l'appareil (null = indisponible : web, Expo Go, refus). */
  pushToken: string | null;
  pushPrefs: PushPrefs;
  setPushPrefs: (p: PushPrefs) => void;
  followedTeamIds: string[];
  toggleFollow: (teamId: string) => void;
  /** Matchs suivis (notifications de ce match, comme sur Flashscore). */
  followedMatchIds: string[];
  toggleFollowMatch: (matchId: string) => void;
  /** E-mail confirmé (comptes particuliers : obligatoire pour réserver). */
  emailVerified: boolean;
  needsVerification: boolean;
  refreshEmailVerified: () => Promise<boolean>;
}

const Ctx = createContext<AppState | null>(null);

const LANG_KEY = 'gfl.lang';
const PREFS_KEY = 'tga.pushPrefs';
const INBOX_KEY = 'tga.inboxSeenAt';
const FOLLOW_KEY = 'tga.follow';
const FOLLOW_MATCH_KEY = 'tgl.followMatches';
const CHAMP_KEY = 'tgl.championship';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const backend = getBackend();
  const { store, auth } = backend;

  const [lang, setLangState] = useState<Lang>('fr');
  const [theme, setThemeState] = useState<ThemeMode>(themeMode());
  const [authReady, setAuthReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [allTeams, setTeams] = useState<Team[]>([]);
  const [allPlayers, setPlayers] = useState<Player[]>([]);
  // Seules les équipes et joueurs validés sont publics
  const teams = useMemo(() => allTeams.filter(isTeamApproved), [allTeams]);
  const players = useMemo(() => allPlayers.filter(isPlayerApproved), [allPlayers]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [showcase, setShowcase] = useState<ShowcaseItem[]>([]);

  // Notifications push
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pushPrefs, setPushPrefsState] = useState<PushPrefs>(DEFAULT_PREFS);
  const [followedTeamIds, setFollowed] = useState<string[]>([]);
  const [followedMatchIds, setFollowedMatches] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(FOLLOW_MATCH_KEY)
      .then((v) => v && setFollowedMatches(JSON.parse(v)))
      .catch(() => {});
  }, []);
  const toggleFollowMatch = useCallback((matchId: string) => {
    setFollowedMatches((cur) => {
      const next = cur.includes(matchId) ? cur.filter((x) => x !== matchId) : [...cur, matchId].slice(-50);
      AsyncStorage.setItem(FOLLOW_MATCH_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  useEffect(() => {
    AsyncStorage.multiGet([PREFS_KEY, FOLLOW_KEY])
      .then(([[, p], [, f]]) => {
        if (p) setPushPrefsState({ ...DEFAULT_PREFS, ...JSON.parse(p) });
        if (f) setFollowed(JSON.parse(f));
      })
      .catch(() => {});
    if (backend.mode !== 'demo') registerForPush().then(setPushToken);
  }, [backend.mode]);
  // Serveur de l'académie : reconnexion du temps réel dès que l'app revient au premier plan
  useEffect(() => {
    if (backend.mode !== 'api') return;
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active') wakeRealtime();
    });
    return () => sub.remove();
  }, [backend.mode]);
  const setPushPrefs = useCallback((p: PushPrefs) => {
    setPushPrefsState(p);
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p)).catch(() => {});
  }, []);
  const toggleFollow = useCallback((teamId: string) => {
    setFollowed((cur) => {
      const next = cur.includes(teamId) ? cur.filter((x) => x !== teamId) : [...cur, teamId];
      AsyncStorage.setItem(FOLLOW_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // Thème mémorisé (le site le lit déjà au chargement)
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark') {
          applyTheme(v);
          setThemeState(v);
        }
      })
      .catch(() => {});
  }, []);
  const toggleTheme = useCallback(() => {
    const next: ThemeMode = themeMode() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setThemeState(next);
    AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
  }, []);

  // Langue mémorisée
  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY)
      .then((v) => {
        if (v === 'fr' || v === 'en') setLangState(v);
      })
      .catch(() => {});
  }, []);
  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      AsyncStorage.setItem(LANG_KEY, l).catch(() => {});
      if (user) backend.services.updateProfile(user.id, { lang: l }).catch(() => {});
    },
    [user, backend.services],
  );

  // Authentification + profil
  const [emailVerified, setEmailVerified] = useState(true);
  const refreshEmailVerified = useCallback(async () => {
    const v = await auth.refreshVerified().catch(() => auth.isEmailVerified());
    setEmailVerified(v);
    return v;
  }, [auth]);
  useEffect(
    () =>
      auth.onChange((u) => {
        setEmailVerified(auth.isEmailVerified());
        setUid(u);
        if (!u) setUser(null);
        setAuthReady(true);
      }),
    [auth],
  );
  useEffect(() => {
    if (!uid) return;
    return store.watchDoc<UserProfile>(COL.users, uid, (p) => setUser(p));
  }, [uid, store]);

  // Données globales
  useEffect(() => store.watchDoc<AppConfig>(COL.config, 'app', (c) => setConfig({ ...DEFAULT_CONFIG, ...(c ?? {}) })), [store]);
  useEffect(
    () => store.watch<Pitch>(COL.pitches, [], (rows) => setPitches(rows.sort((a, b) => a.order - b.order))),
    [store],
  );
  useEffect(
    () => store.watch<Season>(COL.seasons, [], (rows) => setSeasons(rows.sort((a, b) => b.createdAt - a.createdAt))),
    [store],
  );
  useEffect(
    () => store.watch<ShowcaseItem>(COL.showcase, [], (rows) => setShowcase(rows.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt))),
    [store],
  );
  // Plusieurs championnats en même temps (ex. « Tunisia Golden League » et « Tunisia Silver League ») :
  // tous les championnats actifs sont chargés ; l'écran affiche le championnat choisi.
  const championships = useMemo(() => seasons.filter((x) => x.active).sort((a, b) => a.createdAt - b.createdAt), [seasons]);
  const [champId, setChampId] = useState<string | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(CHAMP_KEY)
      .then((v) => v && setChampId(v))
      .catch(() => {});
  }, []);
  const setChampionship = useCallback((id: string) => {
    setChampId(id);
    AsyncStorage.setItem(CHAMP_KEY, id).catch(() => {});
  }, []);
  const season = useMemo(() => championships.find((x) => x.id === champId) ?? championships[0] ?? null, [championships, champId]);
  const seasonId = season?.id;
  const champKey = championships.map((x) => x.id).join('|');

  const [teamsAll, setTeamsAll] = useState<Team[]>([]);
  const [playersAll, setPlayersAll] = useState<Player[]>([]);
  const [matchesAll, setMatchesAll] = useState<Match[]>([]);
  const [eventsAll, setEventsAll] = useState<MatchEvent[]>([]);
  useEffect(() => {
    const ids = champKey ? champKey.split('|') : [];
    if (!ids.length) {
      setTeamsAll([]);
      setPlayersAll([]);
      setMatchesAll([]);
      setEventsAll([]);
      return;
    }
    // Un écouteur par championnat et par collection, fusionnés
    const parts = { t: new Map<string, Team[]>(), p: new Map<string, Player[]>(), m: new Map<string, Match[]>(), e: new Map<string, MatchEvent[]>() };
    const flat = <T,>(m: Map<string, T[]>) => [...m.values()].flat();
    const unsubs: (() => void)[] = [];
    for (const id of ids) {
      const w: [string, string][] = [['seasonId', id]];
      unsubs.push(
        store.watch<Team>(COL.teams, w, (r) => {
          parts.t.set(id, r);
          setTeamsAll(flat(parts.t).sort((a, b) => a.name.localeCompare(b.name)));
        }),
        store.watch<Player>(COL.players, w, (r) => {
          parts.p.set(id, r);
          setPlayersAll(flat(parts.p).sort((a, b) => a.number - b.number));
        }),
        store.watch<Match>(COL.matches, w, (r) => {
          parts.m.set(id, r);
          setMatchesAll(flat(parts.m).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.round - b.round));
        }),
        store.watch<MatchEvent>(COL.events, w, (r) => {
          parts.e.set(id, r);
          setEventsAll(flat(parts.e));
        }),
      );
    }
    return () => unsubs.forEach((u) => u());
  }, [champKey, store]);
  // Championnat choisi
  useEffect(() => {
    setTeams(teamsAll.filter((x) => x.seasonId === seasonId));
    setPlayers(playersAll.filter((x) => x.seasonId === seasonId));
    setMatches(matchesAll.filter((x) => x.seasonId === seasonId));
    setEvents(eventsAll.filter((x) => x.seasonId === seasonId));
  }, [teamsAll, playersAll, matchesAll, eventsAll, seasonId]);

  useEffect(() => {
    if (!pushToken) return;
    savePushToken(store, {
      token: pushToken,
      userId: user?.id ?? null,
      role: user?.role ?? null,
      staff: anyPerm(user, ['queue', 'planning', 'matches.sheet', 'matches.live']),
      teamId: user?.role === 'company' ? user.teamId ?? null : null,
      // Entreprise : ses équipes (tous championnats) comptent comme équipes suivies
      followedTeamIds:
        user?.role === 'company'
          ? [...new Set([...followedTeamIds, ...teamsAll.filter((x) => x.ownerId === user.id || x.id === user.teamId).map((x) => x.id)])]
          : followedTeamIds,
      followedMatchIds,
      lang,
      // Administrateur : notifications de réservation toujours actives.
      // Entreprise : matchs de son équipe et des équipes / matchs favoris seulement, pas de réservations.
      prefs:
        user?.role === 'admin'
          ? { ...pushPrefs, bookings: true }
          : user?.role === 'agent'
            ? // Agent : uniquement les réservations (toujours actives, réglage masqué)
              { ...pushPrefs, matches: false, allTeams: false, goals: false, cards: false, status: false, bookings: true }
          : user?.role === 'operator'
            ? // Opérateur : notifications désactivées (sauf le rappel local des matchs du jour)
              { ...pushPrefs, matches: false, allTeams: false, bookings: false }
          : user?.role === 'company'
            ? { ...pushPrefs, matches: true, allTeams: false, goals: true, cards: true, status: true, bookings: false }
            : pushPrefs,
      platform: Platform.OS,
    }).catch((e) => console.warn('[push] sauvegarde du jeton impossible', e));
  }, [pushToken, user, followedTeamIds, followedMatchIds, lang, pushPrefs, store, teamsAll]);

  const t = useCallback<TFn>(
    (key, vars) => {
      let s: string = STRINGS[lang][key] ?? STRINGS.fr[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
    [lang],
  );

  // Noms et logos des équipes de tous les championnats (accueil, matchs du jour)
  const teamById = useMemo(() => new Map(teamsAll.filter(isTeamApproved).map((x) => [x.id, x])), [teamsAll]);
  const playerById = useMemo(() => new Map(playersAll.map((x) => [x.id, x])), [playersAll]);
  const playerStats = useMemo(
    () => (season ? computePlayerStats(season, allPlayers.filter((p) => isPlayerApproved(p) || p.status === 'removed'), matches, events) : new Map<string, PlayerStat>()),
    [season, allPlayers, matches, events],
  );
  const standings = useMemo(() => (season ? computeStandings(season, teams, matches, true, events) : []), [season, teams, matches, events]);
  const officialStandings = useMemo(
    () => (season ? computeStandings(season, teams, matches, false, events) : []),
    [season, teams, matches, events],
  );

  // Entreprise : ses équipes (une par championnat au plus) et celle du championnat choisi
  const myTeams = useMemo(() => {
    if (user?.role !== 'company') return [];
    const company = user.companyName?.toLowerCase();
    return teamsAll.filter((x) => x.ownerId === user.id || x.id === user.teamId || (!x.ownerId && !!company && x.company.toLowerCase() === company));
  }, [user, teamsAll]);
  const myTeam = useMemo(() => myTeams.find((x) => x.seasonId === seasonId) ?? null, [myTeams, seasonId]);
  // Une entreprise inscrite dans un seul championnat le voit d'office
  useEffect(() => {
    if (!myTeams.length || myTeams.some((x) => x.seasonId === seasonId)) return;
    if (!champId) setChampId(myTeams[0].seasonId);
  }, [myTeams, seasonId, champId]);

  // Boîte de notifications in-app : messages personnels + messages du personnel (agents/admins)
  const [inboxMine, setInboxMine] = useState<InboxItem[]>([]);
  const [inboxStaff, setInboxStaff] = useState<InboxItem[]>([]);
  const [inboxSeenAt, setInboxSeenAt] = useState(0);
  const can = useCallback((p: Perm) => hasPerm(user, p), [user]);
  const staffInbox = anyPerm(user, ['queue', 'planning', 'matches.sheet', 'teams.validate']);
  // Rappel « feuille de match » la veille : notifications locales programmées sur le téléphone (sans serveur)
  // Opérateur : pas de rappel « feuille de match », seulement « matchs d'aujourd'hui »
  const isOperatorRole = user?.role === 'operator';
  const sheetStaff = can('matches.sheet') && !isOperatorRole;
  useEffect(() => {
    if (backend.mode === 'demo') return;
    const h = setTimeout(() => syncTodayReminders(isOperatorRole, matchesAll, (id) => teamById.get(id), lang), 1500);
    return () => clearTimeout(h);
  }, [backend.mode, isOperatorRole, matchesAll, teamById, lang, pushToken]);
  useEffect(() => {
    if (backend.mode === 'demo') return;
    const h = setTimeout(() => syncSheetReminders(sheetStaff, matchesAll, (id) => teamById.get(id), lang), 1500);
    return () => clearTimeout(h);
  }, [backend.mode, sheetStaff, matchesAll, teamById, lang, pushToken]);
  useEffect(() => {
    if (!user) return setInboxMine([]);
    return store.watch<InboxItem>(COL.inbox, [['userId', user.id]], setInboxMine);
  }, [store, user?.id]);
  useEffect(() => {
    if (!staffInbox) return setInboxStaff([]);
    return store.watch<InboxItem>(COL.inbox, [['audience', 'staff']], setInboxStaff);
  }, [store, staffInbox]);
  useEffect(() => {
    AsyncStorage.getItem(INBOX_KEY)
      .then((v) => v && setInboxSeenAt(Number(v) || 0))
      .catch(() => {});
  }, []);
  const inbox = useMemo(
    () => [...inboxMine, ...inboxStaff].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100),
    [inboxMine, inboxStaff],
  );
  const inboxUnread = inbox.filter((i) => i.createdAt > inboxSeenAt).length;
  const markInboxSeen = useCallback(() => {
    const now = Date.now();
    setInboxSeenAt(now);
    AsyncStorage.setItem(INBOX_KEY, String(now)).catch(() => {});
  }, []);

  const value: AppState = {
    ...backend,
    authReady,
    uid,
    user,
    isStaff: isStaffRole(user?.role),
    isAdmin: user?.role === 'admin',
    isOperator: user?.role === 'operator',
    can,
    canBook: anyPerm(user, PITCH_PERMS),
    canOperate: anyPerm(user, ['matches.live', 'matches.sheet']),
    canChamp: anyPerm(user, CHAMP_PERMS),
    isCompany: user?.role === 'company',
    canBookPitch: canRequestBooking(user?.role),
    seesLeague: canSeeLeague(user?.role),
    showcase,
    myTeam,
    lang,
    setLang,
    theme,
    toggleTheme,
    t,
    config,
    pitches,
    seasons,
    season,
    championships,
    setChampionship,
    teamsAll,
    playersAll,
    matchesAll,
    eventsAll,
    myTeams,
    teams,
    players,
    allTeams,
    allPlayers,
    inbox,
    inboxUnread,
    inboxSeenAt,
    markInboxSeen,
    matches,
    events,
    teamById,
    playerById,
    playerStats,
    standings,
    officialStandings,
    pushToken,
    pushPrefs,
    setPushPrefs,
    followedTeamIds,
    toggleFollow,
    followedMatchIds,
    toggleFollowMatch,
    emailVerified,
    needsVerification: user?.role === 'user' && !emailVerified,
    refreshEmailVerified,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp doit être utilisé dans <AppProvider>');
  return v;
}

/** Horloge qui se met à jour toutes les `ms` millisecondes (minute live, expirations…). */
export function useNow(ms = 15_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
