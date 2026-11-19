import * as FirebaseAuth from 'firebase/auth';
import type { Role } from '../domain/model';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { createAccountAsAdmin, getFirebase, SITE_URL } from './firebase';

/** Fonctions serveur (région Europe, au plus près de la Tunisie). */
const getFunctionsClient = () => getFunctions(getFirebase().app, 'europe-west1');
import type { Unsub } from './store';

export interface AuthService {
  onChange(cb: (uid: string | null) => void): Unsub;
  signIn(email: string, password: string): Promise<string>;
  signUp(email: string, password: string): Promise<string>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  /** Adresse e-mail confirmée ? (lien de confirmation cliqué) */
  isEmailVerified(): boolean;
  currentEmail(): string | null;
  /** Envoie (ou renvoie) un code OTP à 6 chiffres par e-mail (valable 30 min). Renvoie l'heure d'expiration. */
  sendVerification(): Promise<{ expiresAt: number | null; alreadyVerified?: boolean }>;
  /** Vérifie le code OTP saisi : le compte devient actif. */
  verifyCode(code: string): Promise<void>;
  /** Relit l'état de confirmation auprès du serveur (après clic sur le lien). */
  refreshVerified(): Promise<boolean>;
  /** Change le mot de passe (demande l'ancien pour des raisons de sécurité). */
  changePassword(current: string, next: string): Promise<void>;
  /** Lien « mot de passe oublié » : vérifie le code puis enregistre le nouveau mot de passe. */
  verifyResetCode(code: string): Promise<string>;
  confirmReset(code: string, password: string): Promise<void>;
  /** Lien de confirmation d'e-mail ouvert dans l'app / le site. */
  applyCode(code: string): Promise<void>;
  /** Crée le compte d'un membre du personnel ou d'une entreprise sans déconnecter l'admin. */
  createAccountFor(email: string, password: string): Promise<string>;
  /** Mode démo uniquement : connexion instantanée avec un rôle. */
  demoSignIn?(role: Role, uid?: string): Promise<string>;
}

export const DEMO_UIDS: Record<Role, string> = {
  user: 'demo-user',
  company: 'demo-company',
  operator: 'demo-operator',
  agent: 'demo-agent',
  admin: 'demo-admin',
};

export function createDemoAuth(): AuthService {
  let uid: string | null = null;
  const demoVerified = new Set<string>();
  const subs = new Set<(u: string | null) => void>();
  const emit = () => subs.forEach((s) => s(uid));
  return {
    onChange(cb) {
      subs.add(cb);
      cb(uid);
      return () => subs.delete(cb);
    },
    async signIn() {
      uid = DEMO_UIDS.user;
      emit();
      return uid;
    },
    async signUp() {
      uid = `demo-new-${Date.now()}`;
      emit();
      return uid;
    },
    async signOut() {
      uid = null;
      emit();
    },
    async resetPassword() {},
    // Démo : les comptes créés pendant la session passent par le code OTP (123456)
    isEmailVerified: () => !(uid ?? '').startsWith('demo-new-') || demoVerified.has(uid ?? ''),
    currentEmail: () => null,
    async sendVerification() {
      return { expiresAt: Date.now() + 30 * 60_000 };
    },
    async verifyCode(code) {
      // Mode démo : le code est toujours 123456
      if (code.trim() !== '123456') throw Object.assign(new Error('wrong'), { code: 'functions/invalid-argument', details: { left: 4 } });
      if (uid) demoVerified.add(uid);
    },
    async refreshVerified() {
      return !(uid ?? '').startsWith('demo-new-') || demoVerified.has(uid ?? '');
    },
    async changePassword() {},
    async verifyResetCode() {
      return 'demo@tgl.tn';
    },
    async confirmReset() {},
    async applyCode() {},
    async createAccountFor() {
      return `demo-staff-${Date.now()}`;
    },
    async demoSignIn(role, asUid) {
      uid = asUid ?? DEMO_UIDS[role];
      emit();
      return uid;
    },
  };
}

export function createFirebaseAuth(): AuthService {
  const { auth } = getFirebase();
  return {
    onChange(cb) {
      return FirebaseAuth.onAuthStateChanged(auth, (u) => cb(u?.uid ?? null));
    },
    async signIn(email, password) {
      const c = await FirebaseAuth.signInWithEmailAndPassword(auth, email.trim(), password);
      return c.user.uid;
    },
    async signUp(email, password) {
      const c = await FirebaseAuth.createUserWithEmailAndPassword(auth, email.trim(), password);
      return c.user.uid;
    },
    async signOut() {
      await FirebaseAuth.signOut(auth);
    },
    async resetPassword(email) {
      auth.languageCode = 'fr';
      await FirebaseAuth.sendPasswordResetEmail(auth, email.trim(), SITE_URL ? { url: `${SITE_URL}/login` } : undefined);
    },
    isEmailVerified: () => !!auth.currentUser?.emailVerified,
    currentEmail: () => auth.currentUser?.email ?? null,
    async sendVerification() {
      if (!auth.currentUser) return { expiresAt: null };
      // Code OTP généré et envoyé par la fonction serveur (adresse d'envoi de l'académie)
      const res = await httpsCallable<unknown, { expiresAt?: number; alreadyVerified?: boolean }>(getFunctionsClient(), 'requestEmailOtp')({});
      return { expiresAt: res.data.expiresAt ?? null, alreadyVerified: res.data.alreadyVerified };
    },
    async verifyCode(code) {
      await httpsCallable(getFunctionsClient(), 'verifyEmailOtp')({ code: code.trim() });
      const u = auth.currentUser;
      if (u) {
        await FirebaseAuth.reload(u);
        await u.getIdToken(true); // jeton à jour : email_verified = true pour les règles de sécurité
      }
    },
    async refreshVerified() {
      const u = auth.currentUser;
      if (!u) return false;
      await FirebaseAuth.reload(u);
      // Rafraîchit le jeton pour que les règles de sécurité voient email_verified = true
      if (u.emailVerified) await u.getIdToken(true);
      return u.emailVerified;
    },
    async changePassword(current, next) {
      const u = auth.currentUser;
      if (!u?.email) throw new Error('no-user');
      await FirebaseAuth.reauthenticateWithCredential(u, FirebaseAuth.EmailAuthProvider.credential(u.email, current));
      await FirebaseAuth.updatePassword(u, next);
    },
    verifyResetCode: (code) => FirebaseAuth.verifyPasswordResetCode(auth, code),
    confirmReset: (code, password) => FirebaseAuth.confirmPasswordReset(auth, code, password),
    async applyCode(code) {
      await FirebaseAuth.applyActionCode(auth, code);
      if (auth.currentUser) await FirebaseAuth.reload(auth.currentUser);
    },
    createAccountFor: (email, password) => createAccountAsAdmin(email, password),
  };
}

/** Message d'erreur lisible (clé i18n) à partir d'une erreur Firebase. */
export function authErrorKey(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'auth.errWrong';
  if (code.includes('password-reset-required')) return 'auth.errMigrated';
  if (code.includes('email-already-in-use')) return 'auth.errExists';
  if (code.includes('weak-password')) return 'auth.errWeak';
  if (code.includes('invalid-email')) return 'auth.errEmail';
  if (code.includes('network')) return 'auth.errNetwork';
  if (code.includes('expired-action-code') || code.includes('invalid-action-code')) return 'auth.errLink';
  if (code.includes('too-many-requests')) return 'auth.errTooMany';
  if (code.includes('requires-recent-login')) return 'auth.errWrong';
  // Codes OTP (fonctions serveur)
  if (code === 'functions/deadline-exceeded') return 'otp.expired';
  if (code === 'functions/invalid-argument') return 'otp.wrong';
  if (code === 'functions/not-found') return 'otp.none';
  if (code === 'functions/resource-exhausted') return 'otp.tooMany';
  if (code === 'functions/internal') return 'otp.mailFailed';
  if (code === 'functions/unavailable' || code.startsWith('functions/')) return 'otp.serverDown';
  return 'common.error';
}
