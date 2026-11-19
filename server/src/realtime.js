/**
 * Temps réel par WebSocket (remplace les écouteurs onSnapshot de Firestore).
 *
 * Client → serveur :
 *   { t: 'auth', token }                       connexion / déconnexion (token null)
 *   { t: 'sub', sid, col, where }              suivre une requête
 *   { t: 'subDoc', sid, col, id }              suivre un document
 *   { t: 'unsub', sid }
 * Serveur → client :
 *   { t: 'rows', sid, rows }   { t: 'doc', sid, doc }   { t: 'ready' }   { t: 'err', sid, code }
 *
 * Après chaque écriture, les requêtes concernées sont relancées une seule fois
 * (mises en commun entre les connexions), puis filtrées selon les droits de chacun.
 */
import { WebSocketServer } from 'ws';
import { getDoc, pool, queryDocs } from './db.js';
import { loadIdentity, verifyToken } from './context.js';
import { canRead, redact } from './rules.js';

const clients = new Set();

/** Connexions temps réel ouvertes par adresse IP (un téléphone en ouvre une ; marge pour un réseau partagé). */
const MAX_PER_IP = Number(process.env.WS_MAX_PER_IP ?? 40);
/** Messages par connexion sur 10 s (l'app en envoie quelques dizaines à l'ouverture d'un écran). */
const MAX_MSG_PER_10S = 300;
const perIp = new Map();
/** Adresse du client : dernière adresse ajoutée par Caddy (la seule fiable), sinon la connexion directe. */
const ipOf = (req) => {
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return fwd.length ? fwd[fwd.length - 1] : req.socket.remoteAddress ?? '?';
};
let pending = new Set(); // clés « col/id » modifiées
let timer = null;

const ctxOf = (identity) => ({
  uid: identity.uid,
  emailVerified: identity.emailVerified,
  me: identity.me,
  now: Date.now(),
  get: (col, id) => (id ? getDoc(pool, col, String(id)) : null),
  getAfter: (col, id) => (id ? getDoc(pool, col, String(id)) : null),
});

const send = (ws, msg) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
};

/** Relance une liste d'abonnements (requêtes identiques exécutées une seule fois). */
async function refresh(list) {
  const cache = new Map();
  const run = (col, where) => {
    const k = `${col}|${JSON.stringify(where)}`;
    if (!cache.has(k)) cache.set(k, queryDocs(pool, col, where));
    return cache.get(k);
  };
  const docCache = new Map();
  const runDoc = (col, id) => {
    const k = `${col}/${id}`;
    if (!docCache.has(k)) docCache.set(k, getDoc(pool, col, id));
    return docCache.get(k);
  };
  await Promise.all(
    list.map(async ({ client, sub }) => {
      try {
        const ctx = ctxOf(client.identity);
        if (sub.kind === 'query') {
          const rows = await Promise.all((await run(sub.col, sub.where)).filter((d) => canRead(ctx, sub.col, d)).map((d) => redact(ctx, sub.col, d)));
          const json = JSON.stringify(rows);
          if (json === sub.last) return;
          sub.last = json;
          send(client.ws, { t: 'rows', sid: sub.sid, rows });
        } else {
          const raw = await runDoc(sub.col, sub.id);
          const doc = raw && canRead(ctx, sub.col, raw) ? { ...(await redact(ctx, sub.col, raw)), __v: undefined } : null;
          const json = JSON.stringify(doc);
          if (json === sub.last) return;
          sub.last = json;
          send(client.ws, { t: 'doc', sid: sub.sid, doc });
        }
      } catch (e) {
        console.error('[ws] actualisation impossible', e);
        send(client.ws, { t: 'err', sid: sub.sid, code: 'internal' });
      }
    }),
  );
}

async function flush() {
  timer = null;
  const keys = pending;
  pending = new Set();
  const cols = new Set([...keys].map((k) => k.split('/')[0]));
  const list = [];
  for (const client of clients) {
    // Mon profil a changé (rôle, permissions) : droits recalculés, tout est relancé
    if (client.identity.uid && keys.has(`users/${client.identity.uid}`)) {
      client.identity = await loadIdentity(client.tok ?? client.identity.uid);
      for (const sub of client.subs.values()) list.push({ client, sub });
      continue;
    }
    for (const sub of client.subs.values()) {
      if (sub.kind === 'query' ? cols.has(sub.col) : keys.has(`${sub.col}/${sub.id}`) || keys.has(`${sub.col}/*`)) list.push({ client, sub });
    }
  }
  if (list.length) await refresh(list);
}

/** Appelé après chaque écriture validée. */
export function notifyChange(keys) {
  for (const k of keys) pending.add(k);
  if (!timer) timer = setTimeout(() => flush().catch((e) => console.error('[ws]', e)), 30);
}

export function attachRealtime(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1 << 20 });
  wss.on('connection', (ws, req) => {
    // Limites anti-surcharge : connexions par adresse IP, messages par connexion
    const ip = ipOf(req);
    const open = perIp.get(ip) ?? 0;
    if (open >= MAX_PER_IP) {
      ws.close(1013, 'too-many-connections');
      return;
    }
    perIp.set(ip, open + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const n = (perIp.get(ip) ?? 1) - 1;
      if (n > 0) perIp.set(ip, n);
      else perIp.delete(ip);
    };
    let msgCount = 0;
    let msgWindow = Date.now();
    const client = { ws, identity: { uid: null, emailVerified: false, me: null }, subs: new Map(), alive: true };
    clients.add(client);
    // Les messages sont traités dans l'ordre (l'authentification passe avant les abonnements)
    let chain = Promise.resolve();
    ws.on('pong', () => (client.alive = true));
    ws.on('message', (buf) => {
      const now = Date.now();
      if (now - msgWindow > 10_000) {
        msgWindow = now;
        msgCount = 0;
      }
      if (++msgCount > MAX_MSG_PER_10S) {
        ws.close(1008, 'rate-limit');
        return;
      }
      chain = chain.then(async () => {
        let msg;
        try {
          msg = JSON.parse(String(buf));
        } catch {
          return;
        }
        if (msg.t === 'auth') {
          const tok = msg.token ? verifyToken(msg.token) : null;
          client.tok = tok;
          client.identity = await loadIdentity(tok);
          for (const s of client.subs.values()) s.last = undefined;
          if (client.subs.size) await refresh([...client.subs.values()].map((sub) => ({ client, sub })));
          send(ws, { t: 'ready', uid: client.identity.uid });
        } else if (msg.t === 'sub' || msg.t === 'subDoc') {
          if (typeof msg.sid !== 'string' || typeof msg.col !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(msg.col) || client.subs.size > 500) return;
          const sub =
            msg.t === 'sub'
              ? { sid: msg.sid, kind: 'query', col: msg.col, where: Array.isArray(msg.where) ? msg.where : [] }
              : { sid: msg.sid, kind: 'doc', col: msg.col, id: String(msg.id ?? '') };
          client.subs.set(msg.sid, sub);
          await refresh([{ client, sub }]);
        } else if (msg.t === 'unsub') {
          client.subs.delete(msg.sid);
        }
      });
    });
    ws.on('close', () => {
      clients.delete(client);
      release();
    });
    ws.on('error', () => {
      clients.delete(client);
      release();
    });
  });
  // Connexions mortes (téléphone en veille, réseau coupé)
  const ping = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        c.ws.terminate();
        clients.delete(c);
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, 30_000);
  // Compte désactivé, supprimé ou mot de passe changé : la connexion temps réel perd ses droits
  // (sinon elle continuerait à recevoir les données jusqu'à la fermeture de l'app)
  const recheck = setInterval(async () => {
    for (const c of clients) {
      if (!c.identity.uid || !c.tok) continue;
      try {
        const next = await loadIdentity(c.tok);
        if (next.uid) continue;
        c.identity = next;
        c.tok = null;
        for (const s of c.subs.values()) s.last = undefined;
        if (c.subs.size) await refresh([...c.subs.values()].map((sub) => ({ client: c, sub })));
        send(c.ws, { t: 'ready', uid: null });
      } catch (e) {
        console.error('[ws] vérification du compte impossible', e);
      }
    }
  }, 60_000);
  wss.on('close', () => {
    clearInterval(ping);
    clearInterval(recheck);
  });
  return wss;
}
