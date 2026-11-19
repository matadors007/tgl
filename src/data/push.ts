/**
 * Notifications push (Expo Push Service — gratuit, sans serveur).
 *
 * - Chaque appareil enregistre son jeton dans la collection `pushTokens` (document = jeton).
 * - L'envoi part directement de l'appareil qui fait l'action (opérateur, agent, client)
 *   vers https://exp.host/--/api/v2/push/send.
 * - Ne fonctionne pas dans Expo Go ni sur le web : il faut l'app installée (APK / TestFlight).
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Lang, Role } from '../domain/model';
import { SITE_URL } from './firebase';
import { COL, type Store } from './store';

export interface PushPrefs {
  /** Notifications des matchs du championnat. */
  matches: boolean;
  /** Tous les matchs (sinon : seulement les équipes suivies / son équipe). */
  allTeams: boolean;
  goals: boolean;
  cards: boolean;
  /** Coup d'envoi, mi-temps, fin, report. */
  status: boolean;
  /** Réservations (confirmation / refus ; nouvelles demandes pour le personnel). */
  bookings: boolean;
}

export const DEFAULT_PREFS: PushPrefs = {
  matches: true,
  allTeams: true,
  goals: true,
  cards: true,
  status: true,
  bookings: true,
};

export interface PushTokenDoc {
  id: string;
  token: string;
  userId: string | null;
  role: Role | null;
  /** Personnel qui traite les réservations (agent / admin). */
  staff: boolean;
  teamId: string | null;
  followedTeamIds: string[];
  followedMatchIds?: string[];
  lang: Lang;
  prefs: PushPrefs;
  platform: string;
  updatedAt: number;
}

export const PUSH_COL = 'pushTokens';

// Affiche les notifications même quand l'app est ouverte
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Demande l'autorisation et renvoie le jeton Expo de l'appareil (null si indisponible). */
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  // Expo Go ne gère pas les notifications distantes
  if (Constants.executionEnvironment === 'storeClient') return null;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Tunisia Golden League',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 120, 200],
        lightColor: '#D7AB3E',
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('[push] projectId EAS manquant : lance activer-notifications.bat');
      return null;
    }
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (e) {
    console.warn('[push] enregistrement impossible', e);
    return null;
  }
}

export async function savePushToken(store: Store, doc: Omit<PushTokenDoc, 'id' | 'updatedAt'>) {
  await store.set(PUSH_COL, tokenId(doc.token), { ...doc, updatedAt: Date.now() });
}

/** Identifiant de document sûr pour Firestore à partir du jeton. */
export function tokenId(token: string) {
  return token.replace(/[^A-Za-z0-9_-]/g, '_');
}

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Envoie des notifications via Expo (par paquets de 100). Les erreurs sont ignorées. */
export async function sendPush(messages: PushMessage[]) {
  if (!messages.length) return;
  for (let i = 0; i < messages.length; i += 100) {
    // Logo couleur de l'application dans la notification (vignette, grande image quand on la déroule)
    const logo = SITE_URL ? { richContent: { image: `${SITE_URL}/notification-logo.png` } } : {};
    const chunk = messages.slice(i, i + 100).map((m) => ({ ...m, ...logo, sound: 'default', channelId: 'default', priority: 'high' }));
    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      });
    } catch (e) {
      console.warn('[push] envoi impossible', e);
    }
  }
}

/** Ouvre l'écran lié quand l'utilisateur touche une notification. */
export function listenNotificationTaps(open: (url: string) => void): () => void {
  if (Platform.OS === 'web') return () => {};
  const handle = (r: Notifications.NotificationResponse | null) => {
    const url = r?.notification.request.content.data?.url;
    if (typeof url === 'string') open(url);
  };
  handle(Notifications.getLastNotificationResponse());
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
