/**
 * Fonctions serveur Tunisia Golden League.
 *  - requestEmailOtp : génère un code à 6 chiffres et l'envoie par e-mail (adresse d'envoi configurée en secret)
 *  - verifyEmailOtp  : vérifie le code ; s'il est bon, le compte est activé (e-mail confirmé)
 * Le code n'est jamais visible par l'application : il est créé, stocké (empreinte) et vérifié ici.
 *
 * Secrets à définir une fois (activer-otp.bat le fait) :
 *   SMTP_USER = adresse e-mail d'envoi   SMTP_PASS = mot de passe d'application
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import nodemailer from 'nodemailer';
import { OTP_TTL_MS, canSend, checkCode, generateCode, hashCode, otpEmailHtml } from './otp.js';

initializeApp();
const db = getFirestore();

const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');
// Serveur d'envoi (Gmail par défaut). Pour Outlook : smtp.office365.com / 587
const SMTP_HOST = defineString('SMTP_HOST', { default: 'smtp.gmail.com' });
const SMTP_PORT = defineString('SMTP_PORT', { default: '465' });

const opts = { region: 'europe-west1', secrets: [SMTP_USER, SMTP_PASS], maxInstances: 5 };

export const requestEmailOtp = onCall(opts, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const user = await getAuth().getUser(uid);
  if (!user.email) throw new HttpsError('failed-precondition', 'Aucune adresse e-mail.');
  if (user.emailVerified) return { alreadyVerified: true };

  const ref = db.doc(`otpCodes/${uid}`);
  const now = Date.now();
  const prev = (await ref.get()).data();
  const allowed = canSend(prev, now);
  if (!allowed.ok) throw new HttpsError('resource-exhausted', allowed.reason, { waitMs: allowed.waitMs ?? null });

  const code = generateCode();
  const expiresAt = now + OTP_TTL_MS;
  await ref.set({
    hash: hashCode(uid, code),
    expiresAt,
    attempts: 0,
    sentAt: now,
    email: user.email,
    history: [...(prev?.history ?? []).filter((t) => now - t < 3600_000), now],
  });

  const profile = (await db.doc(`users/${uid}`).get()).data();
  const port = Number(SMTP_PORT.value());
  const transport = nodemailer.createTransport({
    host: SMTP_HOST.value(),
    port,
    secure: port === 465,
    auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
  });
  try {
    await transport.sendMail({
      from: `"Tunisia Golden League" <${SMTP_USER.value()}>`,
      to: user.email,
      subject: `${code} est ton code Tunisia Golden League`,
      text: `Ton code d'activation : ${code}\nIl est valable 30 minutes. Ne le partage avec personne.`,
      html: otpEmailHtml(code, profile?.name ?? ''),
    });
  } catch (e) {
    console.error('Envoi e-mail impossible', e);
    await ref.delete();
    throw new HttpsError('internal', 'mail-failed');
  }
  return { expiresAt, email: user.email };
});

export const verifyEmailOtp = onCall({ region: 'europe-west1', maxInstances: 5 }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const ref = db.doc(`otpCodes/${uid}`);
  const doc = (await ref.get()).data();
  const res = checkCode(doc, uid, req.data?.code ?? '', Date.now());
  if (!res.ok) {
    if (res.reason === 'wrong') await ref.update({ attempts: res.attempts });
    if (res.reason === 'expired') await ref.delete();
    const left = res.reason === 'wrong' ? Math.max(0, 5 - res.attempts) : 0;
    throw new HttpsError(res.reason === 'expired' ? 'deadline-exceeded' : res.reason === 'locked' ? 'resource-exhausted' : res.reason === 'no-code' ? 'not-found' : 'invalid-argument', res.reason, { left });
  }
  // Compte activé : e-mail confirmé (lu par les règles de sécurité) + trace dans le profil
  await getAuth().updateUser(uid, { emailVerified: true });
  await db.doc(`users/${uid}`).set({ active: true, emailVerifiedAt: Date.now() }, { merge: true });
  await ref.delete();
  return { ok: true };
});
