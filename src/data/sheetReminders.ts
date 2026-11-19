/**
 * Rappel « feuille de match » la veille du match, sans serveur ni forfait Blaze.
 *
 * Chaque téléphone du personnel ayant la permission « Feuille de match » programme lui-même
 * des notifications locales (expo-notifications) :
 * - la veille du match à 10:00 ;
 * - si l'app est ouverte après 10:00 la veille et que la feuille manque encore : rappel immédiat (une seule fois).
 * Les rappels sont recalculés à chaque changement des matchs (match déplacé, feuille remplie, report…).
 * Sur le web : pas de notification, la tâche « feuille de match à remplir » s'affiche dans l'Administration.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { dateTimeToMs, matchPlannedAt, sheetReady, toDateKey, type Lang, type Match, type Team } from '../domain/model';

const PREFIX = 'sheet-';
const SHOWN_KEY = 'tgl.sheetReminders.shown';
export const REMINDER_HOUR = '10:00';

/** Heure du rappel : la veille du match à 10:00 (heure du téléphone). */
export function reminderAt(m: Pick<Match, 'date'>): number {
  return dateTimeToMs(m.date, REMINDER_HOUR) - 86_400_000;
}

/** Matchs qui ont besoin d'un rappel (programmés, à venir, feuille non remplie). */
export function matchesToRemind(matches: Match[], now: number): Match[] {
  return matches.filter((m) => m.status === 'scheduled' && !sheetReady(m) && matchPlannedAt(m) > now);
}

function texts(m: Match, home: string, away: string, lang: Lang, today: boolean) {
  return lang === 'fr'
    ? { title: '📝 Feuille de match à remplir', body: `${home} – ${away} · ${today ? 'aujourd’hui' : 'demain'} à ${m.start}. Saisissez les joueurs avant le coup d’envoi.` }
    : { title: '📝 Match sheet to fill in', body: `${home} – ${away} · ${today ? 'today' : 'tomorrow'} at ${m.start}. Enter the players before kick-off.` };
}

let running: Promise<void> | null = null;

/** Synchronise les rappels de l'appareil. `enabled` = le compte a la permission « Feuille de match ». */
export function syncSheetReminders(enabled: boolean, matches: Match[], teamById: (id: string) => Team | undefined, lang: Lang) {
  if (Platform.OS === 'web') return;
  // Expo Go ne gère pas toutes les notifications : on ne fait rien
  if (Constants.executionEnvironment === 'storeClient') return;
  const job = async () => {
    try {
      const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => n.identifier.startsWith(PREFIX));
      const now = Date.now();
      const wanted = enabled ? matchesToRemind(matches, now) : [];
      if (wanted.length && (await Notifications.getPermissionsAsync()).status !== 'granted') return;

      const shown: Record<string, number> = JSON.parse((await AsyncStorage.getItem(SHOWN_KEY)) ?? '{}');
      const keep = new Set<string>();
      for (const m of wanted) {
        const at = reminderAt(m);
        const id = `${PREFIX}${m.id}-${m.date}-${m.start}`;
        const msg = texts(m, teamById(m.homeTeamId)?.name ?? '?', teamById(m.awayTeamId)?.name ?? '?', lang, at <= now && m.date === toDateKey(new Date(now)));
        const content = { ...msg, sound: 'default', data: { url: `/admin/live/${m.id}` } };
        if (at > now) {
          keep.add(id);
          if (!scheduled.some((n) => n.identifier === id)) {
            await Notifications.scheduleNotificationAsync({
              identifier: id,
              content,
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'default' },
            });
          }
        } else if (!shown[id]) {
          // Déjà la veille après 10:00 (ou le jour même) et toujours pas de feuille : rappel tout de suite
          await Notifications.scheduleNotificationAsync({ identifier: id, content, trigger: null });
          shown[id] = now;
        }
      }
      // Rappels devenus inutiles (feuille remplie, match déplacé, reporté, supprimé, permission retirée)
      for (const n of scheduled) if (!keep.has(n.identifier)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
      // Nettoyage de l'historique (> 7 jours)
      for (const [k, v] of Object.entries(shown)) if (now - v > 7 * 86_400_000) delete shown[k];
      await AsyncStorage.setItem(SHOWN_KEY, JSON.stringify(shown));
    } catch (e) {
      console.warn('[sheet] rappels impossibles', e);
    }
  };
  running = (running ?? Promise.resolve()).then(job);
}

// ───────────── Opérateur : « matchs d'aujourd'hui » ─────────────

const TODAY_PREFIX = 'today-';
const TODAY_SHOWN_KEY = 'tgl.todayReminders.shown';
export const TODAY_HOUR = '09:00';

let runningToday: Promise<void> | null = null;

/**
 * Opérateur de match : une notification locale le jour du match à 9:00 (« match aujourd'hui à 19:30 »).
 * Si l'application est ouverte plus tard ce jour-là, avant le coup d'envoi, le rappel s'affiche une fois.
 */
export function syncTodayReminders(enabled: boolean, matches: Match[], teamById: (id: string) => Team | undefined, lang: Lang) {
  if (Platform.OS === 'web') return;
  if (Constants.executionEnvironment === 'storeClient') return;
  const job = async () => {
    try {
      const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => n.identifier.startsWith(TODAY_PREFIX));
      const now = Date.now();
      const wanted = enabled ? matches.filter((m) => m.status === 'scheduled' && matchPlannedAt(m) > now) : [];
      if (wanted.length && (await Notifications.getPermissionsAsync()).status !== 'granted') return;
      const shown: Record<string, number> = JSON.parse((await AsyncStorage.getItem(TODAY_SHOWN_KEY)) ?? '{}');
      const keep = new Set<string>();
      for (const m of wanted) {
        const at = dateTimeToMs(m.date, TODAY_HOUR);
        const id = `${TODAY_PREFIX}${m.id}-${m.date}-${m.start}`;
        const h = teamById(m.homeTeamId)?.name ?? '?';
        const a = teamById(m.awayTeamId)?.name ?? '?';
        const content = {
          title: lang === 'fr' ? '⚽ Match aujourd’hui' : '⚽ Match today',
          body: lang === 'fr' ? `${h} – ${a} à ${m.start}. Console live disponible 5 min avant.` : `${h} – ${a} at ${m.start}. Live console available 5 min before.`,
          sound: 'default',
          data: { url: '/matches' },
        };
        if (at > now) {
          keep.add(id);
          if (!scheduled.some((n) => n.identifier === id))
            await Notifications.scheduleNotificationAsync({ identifier: id, content, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'default' } });
        } else if (m.date === toDateKey(new Date(now)) && !shown[id]) {
          await Notifications.scheduleNotificationAsync({ identifier: id, content, trigger: null });
          shown[id] = now;
        }
      }
      for (const n of scheduled) if (!keep.has(n.identifier)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
      for (const [k, v] of Object.entries(shown)) if (now - v > 7 * 86_400_000) delete shown[k];
      await AsyncStorage.setItem(TODAY_SHOWN_KEY, JSON.stringify(shown));
    } catch (e) {
      console.warn('[today] rappels impossibles', e);
    }
  };
  runningToday = (runningToday ?? Promise.resolve()).then(job);
}
