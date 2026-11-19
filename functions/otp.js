/**
 * Logique pure des codes OTP (sans Firebase) : testable avec `node --test`.
 * - code à 6 chiffres, valable 30 minutes
 * - stocké uniquement sous forme d'empreinte (SHA-256), jamais en clair
 * - 5 essais maximum par code, 60 s minimum entre deux envois, 6 envois par heure
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_TTL_MS = 30 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_MS = 60_000;
export const OTP_MAX_PER_HOUR = 6;

export const generateCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export const hashCode = (uid, code) => createHash('sha256').update(`${uid}:${String(code).trim()}`).digest('hex');

/** Peut-on envoyer un nouveau code ? (anti-abus) */
export function canSend(doc, now) {
  if (!doc) return { ok: true };
  if (doc.sentAt && now - doc.sentAt < OTP_RESEND_MS) return { ok: false, reason: 'too-soon', waitMs: OTP_RESEND_MS - (now - doc.sentAt) };
  const recent = (doc.history ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= OTP_MAX_PER_HOUR) return { ok: false, reason: 'too-many' };
  return { ok: true };
}

/** Vérifie un code saisi. Renvoie le résultat et le nouveau nombre d'essais. */
export function checkCode(doc, uid, code, now) {
  if (!doc) return { ok: false, reason: 'no-code' };
  if (now > doc.expiresAt) return { ok: false, reason: 'expired' };
  if ((doc.attempts ?? 0) >= OTP_MAX_ATTEMPTS) return { ok: false, reason: 'locked' };
  if (!/^\d{6}$/.test(String(code).trim())) return { ok: false, reason: 'wrong', attempts: (doc.attempts ?? 0) + 1 };
  const a = Buffer.from(hashCode(uid, code), 'hex');
  const b = Buffer.from(doc.hash, 'hex');
  const good = a.length === b.length && timingSafeEqual(a, b);
  return good ? { ok: true } : { ok: false, reason: 'wrong', attempts: (doc.attempts ?? 0) + 1 };
}

/** E-mail HTML (charte noir & or). */
export function otpEmailHtml(code, name) {
  const digits = code.split('').map((d) => `<span style="display:inline-block;width:42px;height:54px;line-height:54px;margin:0 3px;border-radius:8px;background:#1b1b1b;border:1px solid #D7AB3E;color:#F6F1E3;font-size:28px;font-weight:bold">${d}</span>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#0B0B0B;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0B0B;padding:24px 0"><tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#141414;border:1px solid #D7AB3E;border-radius:14px">
<tr><td style="padding:22px;text-align:center;border-bottom:1px solid #2D2A22"><div style="color:#D7AB3E;font-size:20px;font-weight:900;letter-spacing:2px">TUNISIA GOLDEN LEAGUE</div></td></tr>
<tr><td style="padding:26px 24px;color:#F6F1E3;text-align:center">
<p style="margin:0 0 6px;font-size:16px">Bonjour ${String(name ?? '').replace(/[<>&"]/g, '')},</p>
<p style="margin:0 0 20px;color:#A69F8C;font-size:14px">Voici ton code pour activer ton compte :</p>
<div style="margin:0 0 20px">${digits}</div>
<p style="margin:0;color:#A69F8C;font-size:13px">Ce code est valable <b style="color:#D7AB3E">30 minutes</b>. Ne le partage avec personne.</p>
<p style="margin:14px 0 0;color:#6B6555;font-size:12px">Si tu n'as pas créé de compte, ignore cet e-mail.</p>
</td></tr></table></td></tr></table></body></html>`;
}
