/**
 * Comptes : inscription, connexion, code d'activation par e-mail, mot de passe oublié,
 * changement de mot de passe, création de comptes par l'administration.
 * Les erreurs reprennent les codes de Firebase (auth/…, functions/…) déjà traduits par l'application.
 */
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
import { pool } from './db.js';
import { identify, signToken } from './context.js';
import { resetEmailHtml, sendMail } from './mail.js';
import { OTP_TTL_MS, canSend, checkCode, generateCode, hashCode, otpEmailHtml } from './otp.js';
import { permOf } from './rules.js';

export class ApiError extends Error {
  constructor(status, code, details) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITE_URL = (process.env.SITE_URL ?? '').replace(/\/$/, '');

/** Identifiant de compte (28 caractères, comme Firebase). */
export const newUid = () => randomBytes(21).toString('base64url').slice(0, 28);

/** Mot de passe : 8 caractères minimum, avec au moins une lettre et un chiffre (comme l'app). */
export function passwordOk(p) {
  return typeof p === 'string' && p.length >= 8 && p.length <= 200 && /[A-Za-z]/.test(p) && /\d/.test(p);
}
function checkPassword(p) {
  if (!passwordOk(p)) throw new ApiError(400, 'auth/weak-password');
}

/** Les liens « mot de passe oublié » ne sont gardés en base que sous forme d'empreinte (une copie de la base ne suffit pas). */
const resetHash = (code) => createHash('sha256').update(`reset:${String(code ?? '')}`).digest('hex');
function normEmail(e) {
  const email = String(e ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new ApiError(400, 'auth/invalid-email');
  return email;
}

/** Limite simple des tentatives de connexion (par adresse IP + e-mail). */
const attempts = new Map();
const DUMMY_HASH = bcrypt.hashSync('compte-inexistant', 10);
function throttle(key, count = true) {
  const now = Date.now();
  const list = (attempts.get(key) ?? []).filter((t) => now - t < 15 * 60_000);
  if (list.length >= 10) throw new ApiError(429, 'auth/too-many-requests');
  if (count) list.push(now);
  attempts.set(key, list);
}
/** Échec de connexion : compte dans la limite (les connexions réussies ne comptent pas). */
function failed(key) {
  const list = attempts.get(key) ?? [];
  list.push(Date.now());
  attempts.set(key, list);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, l] of attempts) if (!l.some((t) => now - t < 15 * 60_000)) attempts.delete(k);
}, 600_000).unref();

export async function createAccount(email, password, { verified = false } = {}) {
  email = normEmail(email);
  checkPassword(password);
  const exists = await pool.query('SELECT 1 FROM accounts WHERE email = $1', [email]);
  if (exists.rows.length) throw new ApiError(409, 'auth/email-already-in-use');
  const uid = newUid();
  await pool.query('INSERT INTO accounts (uid, email, password_hash, email_verified) VALUES ($1, $2, $3, $4)', [uid, email, await bcrypt.hash(password, 10), verified]);
  return uid;
}

/** E-mail « choisir un nouveau mot de passe » (lien vers /auth-action, comme Firebase). */
export async function sendResetLink(uid, email) {
  // Un seul e-mail par minute et par compte (évite d'inonder une boîte de réception)
  const recent = await pool.query('SELECT 1 FROM reset_codes WHERE uid = $1 AND expires_at > $2', [uid, Date.now() + 3600_000 - 60_000]);
  if (recent.rows.length) return;
  const code = randomBytes(24).toString('base64url');
  await pool.query('DELETE FROM reset_codes WHERE uid = $1 OR expires_at < $2', [uid, Date.now()]);
  await pool.query('INSERT INTO reset_codes (code, uid, expires_at) VALUES ($1, $2, $3)', [resetHash(code), uid, Date.now() + 3600_000]);
  const link = `${SITE_URL}/auth-action?mode=resetPassword&oobCode=${code}`;
  await sendMail({
    to: email,
    subject: 'Tunisia Golden League : nouveau mot de passe',
    text: `Pour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${link}`,
    html: resetEmailHtml(link),
  });
}

async function resetCodeUid(code) {
  const r = await pool.query('SELECT uid, expires_at FROM reset_codes WHERE code = $1', [resetHash(code)]);
  if (!r.rows.length) throw new ApiError(400, 'auth/invalid-action-code');
  if (Number(r.rows[0].expires_at) < Date.now()) throw new ApiError(400, 'auth/expired-action-code');
  return r.rows[0].uid;
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const requireUser = (req) => {
  if (!req.identity?.uid) throw new ApiError(401, 'auth/unauthenticated');
  return req.identity;
};

export function authRouter() {
  const r = express.Router();
  r.use(identify);

  r.post('/signup', wrap(async (req, res) => {
    throttle(`signup:${req.ip}`);
    const uid = await createAccount(req.body.email, req.body.password);
    res.json({ uid, token: signToken(uid), email: normEmail(req.body.email), emailVerified: false });
  }));

  r.post('/login', wrap(async (req, res) => {
    const email = normEmail(req.body.email);
    const tkey = `login:${req.ip}:${email}`;
    throttle(tkey, false);
    const a = await pool.query('SELECT * FROM accounts WHERE email = $1', [email]);
    const acc = a.rows[0];
    if (!acc || acc.disabled) {
      failed(tkey);
      // Même durée de calcul qu'avec un vrai compte (on ne devine pas quels e-mails existent)
      await bcrypt.compare(String(req.body.password ?? ''), DUMMY_HASH);
      throw new ApiError(401, 'auth/invalid-credential');
    }
    // Compte repris de Firebase : le mot de passe n'a pas pu être migré → lien de nouveau mot de passe
    if (acc.must_reset || !acc.password_hash) {
      failed(tkey);
      await sendResetLink(acc.uid, acc.email);
      throw new ApiError(403, 'auth/password-reset-required');
    }
    if (!(await bcrypt.compare(String(req.body.password ?? ''), acc.password_hash))) {
      failed(tkey);
      throw new ApiError(401, 'auth/invalid-credential');
    }
    await pool.query('UPDATE accounts SET last_login = now() WHERE uid = $1', [acc.uid]);
    res.json({ uid: acc.uid, token: signToken(acc.uid, acc.token_version), email: acc.email, emailVerified: acc.email_verified });
  }));

  r.get('/me', wrap(async (req, res) => {
    const id = requireUser(req);
    // Jeton renouvelé à chaque ouverture de l'app : on reste connecté tant qu'on l'utilise
    res.json({ uid: id.uid, email: id.email, emailVerified: id.emailVerified, token: signToken(id.uid, id.tokenVersion) });
  }));

  r.post('/password', wrap(async (req, res) => {
    const id = requireUser(req);
    checkPassword(req.body.next);
    const a = await pool.query('SELECT password_hash FROM accounts WHERE uid = $1', [id.uid]);
    if (!a.rows[0]?.password_hash || !(await bcrypt.compare(String(req.body.current ?? ''), a.rows[0].password_hash)))
      throw new ApiError(401, 'auth/invalid-credential');
    // Les autres appareils connectés sont déconnectés ; celui-ci reçoit un nouveau jeton
    const r2 = await pool.query('UPDATE accounts SET password_hash = $2, must_reset = false, token_version = token_version + 1 WHERE uid = $1 RETURNING token_version', [
      id.uid,
      await bcrypt.hash(req.body.next, 10),
    ]);
    res.json({ ok: true, token: signToken(id.uid, r2.rows[0].token_version) });
  }));

  // ── Mot de passe oublié ──
  r.post('/reset/request', wrap(async (req, res) => {
    const email = normEmail(req.body.email);
    throttle(`reset:${req.ip}:${email}`);
    const a = await pool.query('SELECT uid, email FROM accounts WHERE email = $1 AND NOT disabled', [email]);
    if (a.rows.length) await sendResetLink(a.rows[0].uid, a.rows[0].email);
    res.json({ ok: true }); // même réponse si le compte n'existe pas
  }));
  r.post('/reset/verify', wrap(async (req, res) => {
    const uid = await resetCodeUid(req.body.code);
    const a = await pool.query('SELECT email FROM accounts WHERE uid = $1', [uid]);
    res.json({ email: a.rows[0]?.email ?? '' });
  }));
  r.post('/reset/confirm', wrap(async (req, res) => {
    const uid = await resetCodeUid(req.body.code);
    checkPassword(req.body.password);
    // Le lien reçu par e-mail prouve aussi que l'adresse appartient bien à la personne
    await pool.query('UPDATE accounts SET password_hash = $2, must_reset = false, email_verified = true, token_version = token_version + 1 WHERE uid = $1', [uid, await bcrypt.hash(req.body.password, 10)]);
    await pool.query('DELETE FROM reset_codes WHERE uid = $1', [uid]);
    res.json({ ok: true });
  }));

  // ── Code d'activation (OTP) ──
  r.post('/otp/request', wrap(async (req, res) => {
    const id = requireUser(req);
    if (id.emailVerified) return res.json({ alreadyVerified: true });
    const now = Date.now();
    const prev = (await pool.query('SELECT * FROM otp_codes WHERE uid = $1', [id.uid])).rows[0];
    const allowed = canSend(prev ? { sentAt: Number(prev.sent_at), history: prev.history } : null, now);
    if (!allowed.ok) throw new ApiError(429, 'functions/resource-exhausted', { waitMs: allowed.waitMs ?? null });
    const code = generateCode();
    const expiresAt = now + OTP_TTL_MS;
    const history = [...((prev?.history ?? []).filter((t) => now - t < 3600_000)), now];
    await pool.query(
      `INSERT INTO otp_codes (uid, hash, expires_at, attempts, sent_at, history) VALUES ($1, $2, $3, 0, $4, $5::jsonb)
       ON CONFLICT (uid) DO UPDATE SET hash = EXCLUDED.hash, expires_at = EXCLUDED.expires_at, attempts = 0, sent_at = EXCLUDED.sent_at, history = EXCLUDED.history`,
      [id.uid, hashCode(id.uid, code), expiresAt, now, JSON.stringify(history)],
    );
    try {
      await sendMail({
        to: id.email,
        subject: `${code} est ton code Tunisia Golden League`,
        text: `Ton code d'activation : ${code}\nIl est valable 30 minutes. Ne le partage avec personne.`,
        html: otpEmailHtml(code, id.me?.name ?? ''),
      });
    } catch (e) {
      console.error('Envoi e-mail impossible', e);
      await pool.query('DELETE FROM otp_codes WHERE uid = $1', [id.uid]);
      throw new ApiError(500, 'functions/internal');
    }
    res.json({ expiresAt, email: id.email });
  }));

  r.post('/otp/verify', wrap(async (req, res) => {
    const id = requireUser(req);
    const row = (await pool.query('SELECT * FROM otp_codes WHERE uid = $1', [id.uid])).rows[0];
    const doc = row ? { hash: row.hash, expiresAt: Number(row.expires_at), attempts: row.attempts } : null;
    const r2 = checkCode(doc, id.uid, req.body.code ?? '', Date.now());
    if (!r2.ok) {
      if (r2.reason === 'wrong') await pool.query('UPDATE otp_codes SET attempts = $2 WHERE uid = $1', [id.uid, r2.attempts]);
      if (r2.reason === 'expired') await pool.query('DELETE FROM otp_codes WHERE uid = $1', [id.uid]);
      const left = r2.reason === 'wrong' ? Math.max(0, 5 - r2.attempts) : 0;
      const code =
        r2.reason === 'expired' ? 'functions/deadline-exceeded' : r2.reason === 'locked' ? 'functions/resource-exhausted' : r2.reason === 'no-code' ? 'functions/not-found' : 'functions/invalid-argument';
      throw new ApiError(400, code, { left });
    }
    await pool.query('UPDATE accounts SET email_verified = true WHERE uid = $1', [id.uid]);
    await pool.query('DELETE FROM otp_codes WHERE uid = $1', [id.uid]);
    res.json({ ok: true });
  }));

  // ── Création d'un compte par l'administration (personnel, entreprises) ──
  r.post('/admin/create', wrap(async (req, res) => {
    const id = requireUser(req);
    if (!permOf(id.me, 'staff')) throw new ApiError(403, 'auth/forbidden');
    const uid = await createAccount(req.body.email, req.body.password, { verified: true });
    res.json({ uid });
  }));

  return r;
}
