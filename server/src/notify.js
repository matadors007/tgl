/**
 * Notifications envoyées PAR LE SERVEUR (plus par les téléphones) :
 *  - les jetons push ne sont plus lisibles par l'application → personne ne peut les récupérer ;
 *  - la clé WhatsApp (CallMeBot) reste sur le serveur ;
 *  - chaque envoi est contrôlé (qui peut prévenir qui) et limité en nombre.
 *
 * POST /api/notify/push      { target: 'staff' | 'users' | 'match', userIds?, match?, pref?, texts: { fr, en }, url }
 * POST /api/notify/whatsapp  { bookingId } | { test: true, phone? }
 */
import express from 'express';
import { getDoc, pool, queryDocs } from './db.js';
import { identify } from './context.js';
import { ApiError } from './auth.js';
import { STAFF_ROLES, permOf } from './rules.js';

const SITE_URL = (process.env.SITE_URL ?? '').replace(/\/$/, '');
const EXPO_TOKEN = process.env.EXPO_ACCESS_TOKEN ?? '';

/** Limite d'envois par compte (fenêtre glissante). */
const hits = new Map();
function limit(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new ApiError(429, 'resource-exhausted');
  list.push(now);
  hits.set(key, list);
}

const clip = (s, n) => String(s ?? '').slice(0, n);
function cleanTexts(texts) {
  const one = (t) => ({ title: clip(t?.title, 120), body: clip(t?.body, 400) });
  if (!texts?.fr?.title) throw new ApiError(400, 'invalid-argument');
  return { fr: one(texts.fr), en: one(texts.en ?? texts.fr) };
}

export async function sendExpo(messages) {
  if (!messages.length) return;
  const logo = SITE_URL ? { richContent: { image: `${SITE_URL}/notification-logo.png` } } : {};
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100).map((m) => ({ ...m, ...logo, sound: 'default', channelId: 'default', priority: 'high' }));
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(EXPO_TOKEN ? { Authorization: `Bearer ${EXPO_TOKEN}` } : {}) },
        body: JSON.stringify(chunk),
      });
      // Téléphone désinstallé : jeton supprimé
      const json = await res.json().catch(() => null);
      const data = Array.isArray(json?.data) ? json.data : [];
      for (let k = 0; k < data.length; k++) {
        if (data[k]?.details?.error === 'DeviceNotRegistered') await pool.query('DELETE FROM push_tokens WHERE token = $1', [chunk[k].to]);
      }
    } catch (e) {
      console.warn('[push] envoi impossible', e.message);
    }
  }
}

const isStaff = (me) => !!me && STAFF_ROLES.includes(me.role);

const RECENT_MS = 15 * 60_000;
const ddmm = (date) => {
  const [, mo, d] = String(date ?? '').split('-');
  return d && mo ? `${d}/${mo}` : String(date ?? '');
};
const ownsTeamDoc = (id, team) => !!team && (team.ownerId === id.uid || (id.me?.role === 'company' && id.me?.teamId === team.id));

/**
 * Notification au personnel envoyée par un client ou une entreprise : texte écrit par le serveur,
 * seulement pour un événement réel et récent qui concerne ce compte.
 * event : { kind: 'booking', id } | { kind: 'team', id } | { kind: 'players', id } | { kind: 'deletion' }
 */
async function staffEventTexts(id, event) {
  const kind = event?.kind;
  if (kind === 'booking') {
    const b = await getDoc(pool, 'bookings', String(event.id ?? ''));
    if (!b || b.userId !== id.uid || b.status !== 'pending' || Date.now() - (b.createdAt ?? 0) > RECENT_MS) return null;
    const when = `${clip(b.pitchName, 60)} · ${ddmm(b.date)}`;
    return {
      url: '/admin/queue',
      texts: {
        fr: { title: '🆕 Nouvelle demande de réservation', body: clip(`${b.userName ?? ''} · ${when} à ${b.start ?? ''}`, 400) },
        en: { title: '🆕 New booking request', body: clip(`${b.userName ?? ''} · ${when} at ${b.start ?? ''}`, 400) },
      },
    };
  }
  if (kind === 'team') {
    const team = await getDoc(pool, 'teams', String(event.id ?? ''));
    if (!ownsTeamDoc(id, team) || team.requestStatus !== 'submitted') return null;
    const name = clip(team.name, 60);
    const company = clip(team.company ?? id.me?.companyName ?? '', 60);
    return {
      url: '/admin/championships',
      texts: {
        fr: { title: '🏢 Nouvelle demande d’inscription', body: `${company} inscrit l’équipe « ${name} » — pièces à vérifier` },
        en: { title: '🏢 New registration request', body: `${company} registered "${name}" — documents to check` },
      },
    };
  }
  if (kind === 'players') {
    const team = await getDoc(pool, 'teams', String(event.id ?? ''));
    if (!ownsTeamDoc(id, team)) return null;
    const n = (await queryDocs(pool, 'players', [['teamId', team.id], ['status', 'pending']])).length;
    if (!n) return null;
    const name = clip(team.name, 60);
    return {
      url: '/admin/championships',
      texts: {
        fr: { title: '🧾 Joueurs à vérifier', body: `${name} soumet ${n} joueur(s)` },
        en: { title: '🧾 Players to review', body: `${name} submitted ${n} player(s)` },
      },
    };
  }
  if (kind === 'deletion') {
    if (!id.me?.deletionRequestedAt) return null;
    const who = clip(`${id.me.name ?? ''}${id.email ? ` (${id.email})` : ''}`, 160);
    return {
      url: '/admin/staff',
      texts: {
        fr: { title: '🗑 Demande de suppression de compte', body: `${who} demande la suppression de son compte.` },
        en: { title: '🗑 Account deletion request', body: `${who} asks for the account to be deleted.` },
      },
    };
  }
  return null;
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

export function notifyRouter() {
  const r = express.Router();
  r.use(identify);

  r.post('/push', wrap(async (req, res) => {
    const id = req.identity;
    if (!id.uid) throw new ApiError(401, 'auth/unauthenticated');
    const { target, pref = 'bookings' } = req.body;
    const staffSender = isStaff(id.me);
    // Texte libre : personnel seulement (les autres comptes envoient un événement, le texte est écrit ici)
    const texts = target === 'staff' && !staffSender ? { fr: { title: '', body: '' }, en: { title: '', body: '' } } : cleanTexts(req.body.texts);
    let url = typeof req.body.url === 'string' && req.body.url.startsWith('/') ? clip(req.body.url, 200) : '/';
    const msg = (t) => ({ to: t.token, ...texts[t.lang === 'en' ? 'en' : 'fr'], data: { url } });
    let list = [];

    if (target === 'staff') {
      // Un compte qui n'est pas du personnel ne choisit pas le texte : le serveur l'écrit d'après la base
      // (pas de faux message « urgent » envoyé à tout le personnel)
      if (!isStaff(id.me)) {
        limit(`staff:${id.uid}`, 20, 3600_000);
        const built = await staffEventTexts(id, req.body.event);
        if (!built) throw new ApiError(403, 'permission-denied');
        Object.assign(texts, built.texts);
        url = built.url;
      }
      list = (await queryDocs(pool, 'pushTokens', [['staff', true]])).filter((t) => t.prefs?.bookings !== false);
    } else if (target === 'users') {
      const ids = [...new Set((Array.isArray(req.body.userIds) ? req.body.userIds : []).map(String))].slice(0, 200);
      // Le personnel prévient les comptes concernés ; un compte ne peut prévenir que lui-même
      if (!isStaff(id.me) && ids.some((u) => u !== id.uid)) throw new ApiError(403, 'permission-denied');
      limit(`users:${id.uid}`, 300, 3600_000);
      for (const u of ids) list.push(...(await queryDocs(pool, 'pushTokens', [['userId', u]])).filter((t) => t.prefs?.[pref] !== false));
    } else if (target === 'match') {
      if (!permOf(id.me, 'matches.live') && !permOf(id.me, 'matches.sheet')) throw new ApiError(403, 'permission-denied');
      const m = await getDoc(pool, 'matches', String(req.body.match?.id ?? ''));
      if (!m) throw new ApiError(404, 'not-found');
      const teamIds = [m.homeTeamId, m.awayTeamId];
      list = (await queryDocs(pool, 'pushTokens', []))
        .filter((d) => (d.prefs?.matches || (d.followedMatchIds ?? []).includes(m.id)) && d.prefs?.[pref] !== false)
        .filter(
          (d) =>
            (d.followedMatchIds ?? []).includes(m.id) ||
            d.prefs?.allTeams ||
            (d.teamId != null && teamIds.includes(d.teamId)) ||
            (d.followedTeamIds ?? []).some((x) => teamIds.includes(x)),
        );
    } else throw new ApiError(400, 'invalid-argument');

    await sendExpo(list.map(msg));
    res.json({ sent: list.length });
  }));

  r.post('/whatsapp', wrap(async (req, res) => {
    const id = req.identity;
    if (!id.uid) throw new ApiError(401, 'auth/unauthenticated');
    const key = (await getDoc(pool, 'config', 'whatsapp'))?.apiKey;
    const cfg = (await getDoc(pool, 'config', 'app')) ?? {};
    let phone = cfg.whatsappNumber ?? '';
    let text;
    if (req.body.test) {
      if (!permOf(id.me, 'settings')) throw new ApiError(403, 'permission-denied');
      if (req.body.phone) phone = String(req.body.phone);
      text = '✅ Tunisia Golden League : test des notifications WhatsApp.';
    } else {
      const b = await getDoc(pool, 'bookings', String(req.body.bookingId ?? ''));
      // Seulement pour une réservation récente du compte (ou du personnel)
      if (!b || (b.userId !== id.uid && !isStaff(id.me)) || Date.now() - (b.createdAt ?? 0) > 10 * 60_000) throw new ApiError(403, 'permission-denied');
      limit(`wa:${id.uid}`, 10, 3600_000);
      const [y, mo, d] = String(b.date).split('-');
      text =
        `🆕 Nouvelle réservation Tunisia Golden League\n• ${b.pitchName}\n• ${d}/${mo}/${y} à ${b.start}${b.end ? `–${b.end}` : ''}\n` +
        `• ${b.userName} (${b.userPhone ?? ''})\nÀ confirmer dans l'app : Administration → File d'attente.`;
    }
    const digits = String(phone).replace(/[^\d]/g, '');
    if (!digits || !key) return res.json({ sent: false });
    try {
      const url = `https://api.callmebot.com/whatsapp.php?phone=%2B${digits}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(key)}`;
      const r2 = await fetch(url);
      res.json({ sent: r2.ok });
    } catch {
      res.json({ sent: false });
    }
  }));

  return r;
}
