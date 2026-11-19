/**
 * Interface de stockage bas niveau, implémentée par :
 *  - memoryStore (mode démo, données en mémoire)
 *  - firebaseStore (Cloud Firestore, temps réel)
 * Toute la logique métier (services.ts) est écrite une seule fois au-dessus de cette interface.
 */

export type Unsub = () => void;

/** Filtres d'égalité uniquement (pas d'index composite nécessaire dans Firestore). */
export type Where = [field: string, value: string | number | boolean];

export interface Tx {
  get<T>(col: string, id: string): Promise<T | null>;
  set(col: string, id: string, data: object): void;
  update(col: string, id: string, data: object): void;
  remove(col: string, id: string): void;
}

export interface Store {
  newId(col: string): string;
  watch<T>(col: string, where: Where[], cb: (rows: T[]) => void): Unsub;
  watchDoc<T>(col: string, id: string, cb: (row: T | null) => void): Unsub;
  get<T>(col: string, id: string): Promise<T | null>;
  query<T>(col: string, where: Where[]): Promise<T[]>;
  set(col: string, id: string, data: object): Promise<void>;
  update(col: string, id: string, data: object): Promise<void>;
  remove(col: string, id: string): Promise<void>;
  /** Écritures groupées atomiques. */
  batch(ops: { type: 'set' | 'update' | 'remove'; col: string; id: string; data?: object }[]): Promise<void>;
  runTransaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
}

export const COL = {
  config: 'config',
  users: 'users',
  pitches: 'pitches',
  slots: 'slots',
  bookings: 'bookings',
  seasons: 'seasons',
  teams: 'teams',
  players: 'players',
  matches: 'matches',
  events: 'events',
  news: 'news',
  playerInfo: 'playerInfo',
  inbox: 'inbox',
  showcase: 'showcase',
  files: 'files',
  privateBookings: 'privateBookings',
} as const;

/** Supprime les champs undefined (Firestore les refuse). */
export function clean<T extends object>(data: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined) out[k] = v;
  return out as T;
}
