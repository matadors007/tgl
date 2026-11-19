/**
 * Connexion au serveur de l'académie (VPS : API Node + PostgreSQL), à la place de Firebase.
 *  - createApiStore() : même interface Store que Firestore (lectures, écritures, temps réel par WebSocket)
 *  - createApiAuth()  : comptes (connexion, inscription, code OTP, mot de passe oublié)
 * Activé quand EXPO_PUBLIC_API_URL est renseigné (ex. https://tunisiagoldenleague.tn).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthService } from './auth';
import { clean, type Store, type Tx, type Unsub, type Where } from './store';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
export const isApiConfigured = !!API_URL;

const SESSION_KEY = 'tgl.session';
type Session = { token: string; uid: string; email: string; emailVerified: boolean };

// ───────────── Session (jeton de connexion) ─────────────

let session: Session | null = null;
let sessionLoaded: Promise<void> | null = null;
const sessionSubs = new Set<(uid: string | null) => void>();

function loadSession() {
  if (!sessionLoaded)
    sessionLoaded = AsyncStorage.getItem(SESSION_KEY)
      .then((raw) => {
        session = raw ? (JSON.parse(raw) as Session) : null;
      })
      .catch(() => {
        session = null;
      });
  return sessionLoaded;
}

async function setSession(s: Session | null) {
  const changedUser = (s?.uid ?? null) !== (session?.uid ?? null);
  session = s;
  try {
    if (s) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    /* stockage indisponible : session gardée en mémoire */
  }
  socket.auth();
  if (changedUser) sessionSubs.forEach((cb) => cb(s?.uid ?? null));
}

// ───────────── HTTP ─────────────

export class ApiError extends Error {
  code: string;
  details: unknown;
  status: number;
  constructor(status: number, code: string, details?: unknown) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details ?? null;
  }
}

async function call<T>(path: string, body?: object): Promise<T> {
  await loadSession();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'auth/network-request-failed');
  }
  const json = (await res.json().catch(() => ({}))) as { code?: string; details?: unknown };
  if (!res.ok) throw new ApiError(res.status, json.code ?? 'internal', json.details);
  return json as T;
}

// ───────────── Vidéos importées depuis l'ordinateur ─────────────

/** Taille maximale d'une vidéo importée (doit correspondre à VIDEO_MAX_MB du serveur). */
export const VIDEO_MAX_MB = 500;
export const VIDEO_TYPES = ['video/mp4', 'video/x-m4v', 'video/quicktime', 'video/webm'];
/** Lien d'une vidéo hébergée par le serveur (et donc à supprimer quand elle est remplacée ou retirée). */
export const isUploadedVideo = (url?: string | null) => !!url && /\/uploads\/videos\/[A-Za-z0-9_-]+\.(mp4|mov|webm)$/.test(url);

/**
 * Envoie une vidéo au serveur (corps brut, en flux) avec la progression (0 → 1).
 * `file` : le fichier choisi (Blob / File sur le site ; sur téléphone, lu depuis son adresse locale).
 * Renvoie le lien public de la vidéo. `abort` (optionnel) permet d'annuler l'envoi.
 */
export async function uploadVideo(
  file: Blob,
  type: string,
  onProgress: (p: number) => void,
  abort?: { cancel?: () => void },
): Promise<string> {
  await loadSession();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/upload/video`);
    xhr.setRequestHeader('Content-Type', type);
    if (session) xhr.setRequestHeader('Authorization', `Bearer ${session.token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let json: { url?: string; code?: string; details?: unknown } = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* réponse vide */
      }
      if (xhr.status >= 200 && xhr.status < 300 && json.url) resolve(json.url);
      else reject(new ApiError(xhr.status, json.code ?? (xhr.status === 413 ? 'too-large' : 'internal'), json.details));
    };
    xhr.onerror = () => reject(new ApiError(0, 'auth/network-request-failed'));
    xhr.onabort = () => reject(new ApiError(0, 'aborted'));
    if (abort) abort.cancel = () => xhr.abort();
    xhr.send(file);
  });
}

/** Supprime une vidéo hébergée par le serveur (sans effet pour un lien YouTube / Facebook). */
export async function deleteUploadedVideo(url?: string | null): Promise<void> {
  if (!isApiConfigured || !isUploadedVideo(url)) return;
  try {
    await call('/upload/video/delete', { url });
  } catch (e) {
    console.warn('[vidéo] suppression impossible', e);
  }
}

// ───────────── Temps réel (WebSocket) ─────────────

type Sub = { msg: object; cb: (m: { t: string; rows?: unknown[]; doc?: unknown }) => void };

const socket = (() => {
  let ws: WebSocket | null = null;
  let open = false;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;
  const subs = new Map<string, Sub>();

  const wsUrl = () => `${API_URL.replace(/^http/, 'ws')}/ws`;
  const sendRaw = (m: object) => {
    if (ws && open) ws.send(JSON.stringify(m));
  };

  function connect() {
    if (ws || !subs.size) return;
    const w = new WebSocket(wsUrl());
    ws = w;
    w.onopen = async () => {
      open = true;
      retry = 0;
      await loadSession();
      sendRaw({ t: 'auth', token: session?.token ?? null });
      for (const [sid, s] of subs) sendRaw({ ...s.msg, sid });
    };
    w.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data)) as { t: string; sid?: string };
        if (m.sid) subs.get(m.sid)?.cb(m);
      } catch {
        /* message illisible */
      }
    };
    w.onclose = () => {
      ws = null;
      open = false;
      if (!subs.size) return;
      // Reconnexion progressive : 1 s, 2 s, 4 s… jusqu'à 30 s
      const delay = Math.min(30_000, 1000 * 2 ** retry++);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        connect();
      }, delay);
    };
    w.onerror = () => w.close();
  }

  return {
    subscribe(msg: object, cb: Sub['cb']): Unsub {
      const sid = `s${++seq}`;
      subs.set(sid, { msg, cb });
      if (ws && open) sendRaw({ ...msg, sid });
      else connect();
      return () => {
        subs.delete(sid);
        sendRaw({ t: 'unsub', sid });
      };
    },
    /** Après connexion / déconnexion : le serveur recalcule les droits de tous les abonnements. */
    auth() {
      sendRaw({ t: 'auth', token: session?.token ?? null });
    },
    /** Retour au premier plan : reconnexion immédiate si la connexion était tombée. */
    wake() {
      if (!ws && subs.size) {
        if (timer) clearTimeout(timer);
        timer = null;
        retry = 0;
        connect();
      }
    },
  };
})();

export const wakeRealtime = () => socket.wake();

// ───────────── Store ─────────────

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function randomId() {
  let s = '';
  for (let i = 0; i < 20; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return s;
}

type Op = { type: 'set' | 'update' | 'remove'; col: string; id: string; data?: object };
const normOp = (op: Op): Op =>
  op.type === 'set' ? { ...op, data: clean({ ...(op.data ?? {}), id: op.id }) } : op.type === 'update' ? { ...op, data: clean(op.data ?? {}) } : { type: 'remove', col: op.col, id: op.id };

function stripVersion<T>(d: (T & { __v?: number }) | null): T | null {
  if (!d) return null;
  const { __v, ...rest } = d;
  void __v;
  return rest as T;
}

export function createApiStore(): Store {
  const commit = (ops: Op[], reads: { col: string; id: string; v: number }[] = []) => call<{ ok: true }>('/db/commit', { ops: ops.map(normOp), reads });
  return {
    newId: () => randomId(),
    watch<T>(col: string, where: Where[], cb: (rows: T[]) => void) {
      return socket.subscribe({ t: 'sub', col, where }, (m) => {
        if (m.t === 'rows') cb((m.rows ?? []) as T[]);
        else if (m.t === 'err') console.warn(`[api] ${col}`, m);
      });
    },
    watchDoc<T>(col: string, id: string, cb: (row: T | null) => void) {
      return socket.subscribe({ t: 'subDoc', col, id }, (m) => {
        if (m.t === 'doc') cb((m.doc ?? null) as T | null);
      });
    },
    async get<T>(col: string, id: string) {
      const r = await call<{ doc: (T & { __v?: number }) | null }>('/db/get', { col, id });
      return stripVersion<T>(r.doc);
    },
    async query<T>(col: string, where: Where[]) {
      return (await call<{ rows: T[] }>('/db/query', { col, where })).rows;
    },
    async set(col, id, data) {
      await commit([{ type: 'set', col, id, data }]);
    },
    async update(col, id, data) {
      await commit([{ type: 'update', col, id, data }]);
    },
    async remove(col, id) {
      await commit([{ type: 'remove', col, id }]);
    },
    async batch(ops) {
      for (let i = 0; i < ops.length; i += 500) await commit(ops.slice(i, i + 500));
    },
    async runTransaction<R>(fn: (tx: Tx) => Promise<R>) {
      // Transaction optimiste : si un document lu a changé entre-temps, le serveur répond 409 et on recommence
      for (let attempt = 0; ; attempt++) {
        const reads = new Map<string, { col: string; id: string; v: number }>();
        const ops: Op[] = [];
        const tx: Tx = {
          get: async <T,>(col: string, id: string) => {
            const r = await call<{ doc: (T & { __v?: number }) | null }>('/db/get', { col, id });
            reads.set(`${col}/${id}`, { col, id, v: r.doc?.__v ?? 0 });
            return stripVersion<T>(r.doc);
          },
          set: (col, id, data) => void ops.push({ type: 'set', col, id, data }),
          update: (col, id, data) => void ops.push({ type: 'update', col, id, data }),
          remove: (col, id) => void ops.push({ type: 'remove', col, id }),
        };
        const result = await fn(tx);
        try {
          if (ops.length) await commit(ops, [...reads.values()]);
          return result;
        } catch (e) {
          if (e instanceof ApiError && e.code === 'aborted' && attempt < 5) {
            await new Promise((r) => setTimeout(r, 50 + Math.random() * 150 * (attempt + 1)));
            continue;
          }
          throw e;
        }
      }
    },
  };
}

// ───────────── Comptes ─────────────

type AuthRes = { uid: string; token: string; email: string; emailVerified: boolean };

export function createApiAuth(): AuthService {
  // Au démarrage : session enregistrée vérifiée auprès du serveur (compte supprimé, désactivé…)
  const ready = loadSession().then(async () => {
    if (!session) return;
    try {
      const me = await call<{ uid: string; email: string; emailVerified: boolean; token?: string }>('/auth/me');
      session = { token: me.token ?? session.token, uid: me.uid, email: me.email, emailVerified: me.emailVerified };
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session)).catch(() => {});
    } catch (e) {
      // Hors connexion : on garde la session ; jeton refusé : déconnexion
      if (e instanceof ApiError && e.status === 401) {
        session = null;
        await AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
      }
    }
  });
  const login = async (r: AuthRes) => {
    await setSession({ token: r.token, uid: r.uid, email: r.email, emailVerified: r.emailVerified });
    return r.uid;
  };
  return {
    onChange(cb) {
      let active = true;
      ready.then(() => {
        if (!active) return;
        socket.auth();
        cb(session?.uid ?? null);
        sessionSubs.add(cb);
      });
      return () => {
        active = false;
        sessionSubs.delete(cb);
      };
    },
    signIn: async (email, password) => login(await call<AuthRes>('/auth/login', { email: email.trim(), password })),
    signUp: async (email, password) => login(await call<AuthRes>('/auth/signup', { email: email.trim(), password })),
    signOut: () => setSession(null),
    async resetPassword(email) {
      await call('/auth/reset/request', { email: email.trim() });
    },
    isEmailVerified: () => !!session?.emailVerified,
    currentEmail: () => session?.email ?? null,
    async sendVerification() {
      const r = await call<{ expiresAt?: number; alreadyVerified?: boolean }>('/auth/otp/request', {});
      if (r.alreadyVerified && session) await setSession({ ...session, emailVerified: true });
      return { expiresAt: r.expiresAt ?? null, alreadyVerified: r.alreadyVerified };
    },
    async verifyCode(code) {
      await call('/auth/otp/verify', { code: code.trim() });
      if (session) await setSession({ ...session, emailVerified: true });
    },
    async refreshVerified() {
      if (!session) return false;
      const me = await call<{ emailVerified: boolean }>('/auth/me');
      if (me.emailVerified !== session.emailVerified) await setSession({ ...session, emailVerified: me.emailVerified });
      return me.emailVerified;
    },
    async changePassword(current, next) {
      // Les autres appareils sont déconnectés ; celui-ci garde sa session avec un nouveau jeton
      const r = await call<{ token?: string }>('/auth/password', { current, next });
      if (r.token && session) await setSession({ ...session, token: r.token });
    },
    verifyResetCode: async (code) => (await call<{ email: string }>('/auth/reset/verify', { code })).email,
    async confirmReset(code, password) {
      await call('/auth/reset/confirm', { code, password });
    },
    async applyCode() {
      // Pas de lien de confirmation avec ce serveur : l'adresse est confirmée par le code OTP
      throw new ApiError(400, 'auth/invalid-action-code');
    },
    createAccountFor: async (email, password) => (await call<{ uid: string }>('/auth/admin/create', { email: email.trim(), password })).uid,
  };
}

// ───────────── Notifications (envoyées par le serveur) ─────────────

export type RemoteTexts = { fr: { title: string; body: string }; en: { title: string; body: string } };
/** Événement prévenant le personnel : pour un compte qui n'est pas du personnel, le serveur écrit le texte lui-même. */
export type StaffEvent = { kind: 'booking'; id: string } | { kind: 'team'; id: string } | { kind: 'players'; id: string } | { kind: 'deletion' };
export interface RemoteNotifier {
  push(body: { target: 'staff' | 'users' | 'match'; userIds?: string[]; match?: { id: string }; pref?: string; texts: RemoteTexts; url: string; event?: StaffEvent }): Promise<void>;
  whatsapp(body: { bookingId?: string; test?: boolean; phone?: string }): Promise<boolean>;
}

export const apiNotifier: RemoteNotifier = {
  async push(body) {
    try {
      await call('/notify/push', body);
    } catch (e) {
      console.warn('[push] envoi impossible', e);
    }
  },
  async whatsapp(body) {
    try {
      return (await call<{ sent: boolean }>('/notify/whatsapp', body)).sent;
    } catch {
      return false;
    }
  },
};
