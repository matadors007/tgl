/**
 * Redirections automatiques selon la connexion et le rôle :
 *  - déconnexion (bouton, session expirée, compte supprimé) → accueil, pile d'écrans vidée ;
 *  - page réservée aux comptes connectés ouverte sans connexion → connexion ;
 *  - déjà connecté sur la page de connexion / d'inscription → accueil ;
 *  - onglet d'un autre rôle (Mon équipe, Administration) → accueil.
 */
import { router, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useApp } from '@/data/AppProvider';

/** Pages qui n'ont de sens que connecté (premier segment de l'adresse). */
const NEEDS_ACCOUNT = new Set(['account', 'bookings', 'notifications', 'entreprise', 'verify-email', 'admin']);

function goHome() {
  try {
    if (router.canDismiss()) router.dismissAll();
  } catch {
    /* rien à fermer */
  }
  router.replace('/');
}

export function AuthRedirects() {
  const { uid, user, isCompany, isStaff, isOperator } = useApp();
  const segments = useSegments() as string[];
  const prevUid = useRef(uid);
  const first = segments[0] ?? '';
  const tab = first === '(tabs)' ? segments[1] ?? 'index' : null;

  // Déconnexion : retour à l'accueil, quel que soit l'écran affiché
  useEffect(() => {
    const was = prevUid.current;
    prevUid.current = uid;
    if (was && !uid) goHome();
  }, [uid]);

  // Compte au moment où l'on arrive sur une page (distingue « déjà connecté » de « vient de se connecter »)
  const arrival = useRef<{ page: string; uid: string | null }>({ page: '', uid: null });
  if (arrival.current.page !== segments.join('/')) arrival.current = { page: segments.join('/'), uid };

  useEffect(() => {
    if (!uid) {
      if (NEEDS_ACCOUNT.has(first) || tab === 'company' || tab === 'gestion') router.replace('/login');
      return;
    }
    if (first === 'login' || first === 'signup') {
      // Ouverte alors qu'on était déjà connecté (après une connexion réussie, la page se ferme d'elle-même)
      if (arrival.current.uid) goHome();
      return;
    }
    if (!user) return; // profil en cours de chargement
    if ((tab === 'company' && !isCompany) || (tab === 'gestion' && (!isStaff || isOperator)) || (first === 'entreprise' && !isCompany)) goHome();
  }, [uid, user, first, tab, isCompany, isStaff, isOperator]);

  return null;
}
