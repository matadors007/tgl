/** Contexte de sécurité d'un compte : identité, e-mail confirmé, profil (rôle, permissions). */
import jwt from 'jsonwebtoken';
import { getDoc, pool } from './db.js';

const SECRET = process.env.JWT_SECRET ?? '';
// Pas de clé de secours : avec une clé connue, n'importe qui pourrait fabriquer un jeton d'administrateur
if (SECRET.length < 32) {
  throw new Error('JWT_SECRET manquant ou trop court (32 caractères minimum) : réglez-le dans .env (openssl rand -hex 32). Démarrage annulé.');
}

export function signToken(uid, tv = 0) {
  return jwt.sign({ uid, tv }, SECRET, { expiresIn: '30d', algorithm: 'HS256' });
}

export function verifyToken(token) {
  try {
    const p = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
    return typeof p === 'object' && p.uid ? { uid: String(p.uid), tv: Number(p.tv ?? 0) } : null;
  } catch {
    return null;
  }
}

/** Contexte de base (sans accès aux documents) : complété par data.js pour les règles. */
/** @param tok résultat de verifyToken ({ uid, tv }) ou uid (déjà vérifié). */
export async function loadIdentity(tok) {
  const uid = typeof tok === 'string' ? tok : tok?.uid;
  if (!uid) return { uid: null, emailVerified: false, me: null };
  const a = await pool.query('SELECT email, email_verified, disabled, token_version FROM accounts WHERE uid = $1', [uid]);
  // Compte supprimé, désactivé, ou jeton antérieur au dernier changement de mot de passe
  if (!a.rows.length || a.rows[0].disabled) return { uid: null, emailVerified: false, me: null };
  if (typeof tok === 'object' && tok.tv !== a.rows[0].token_version) return { uid: null, emailVerified: false, me: null };
  const me = await getDoc(pool, 'users', uid);
  return { uid, email: a.rows[0].email, emailVerified: a.rows[0].email_verified, tokenVersion: a.rows[0].token_version, me };
}

/** Middleware Express : req.identity (compte connecté ou visiteur). */
export async function identify(req, _res, next) {
  try {
    const h = req.headers.authorization ?? '';
    const tok = h.startsWith('Bearer ') ? verifyToken(h.slice(7)) : null;
    req.identity = await loadIdentity(tok);
    next();
  } catch (e) {
    next(e);
  }
}
