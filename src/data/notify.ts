/**
 * Notifications métier : choisit les destinataires et rédige les messages (FR / EN selon l'appareil).
 */
import type { Booking, InboxItem, Lang, Match, Player, Team, UserProfile } from '../domain/model';
import { Platform } from 'react-native';
import { PUSH_COL, sendPush, type PushMessage, type PushPrefs, type PushTokenDoc } from './push';
import { COL, type Store, type Where } from './store';
import type { RemoteNotifier, StaffEvent } from './api';

type Texts = (lang: Lang) => { title: string; body: string };

export type MatchNotifKind =
  | 'kickoff'
  | 'halftime'
  | 'second_half'
  | 'fulltime'
  | 'goal'
  | 'yellow'
  | 'red'
  | 'postponed'
  | 'rescheduled';

export interface MatchNotifCtx {
  match: Match;
  home?: Team;
  away?: Team;
  homeScore?: number;
  awayScore?: number;
  playerName?: string;
  teamName?: string;
  assistName?: string;
  minute?: number;
}

const PREF_OF: Record<MatchNotifKind, keyof PushPrefs> = {
  kickoff: 'status',
  halftime: 'status',
  second_half: 'status',
  fulltime: 'status',
  postponed: 'status',
  rescheduled: 'status',
  goal: 'goals',
  yellow: 'cards',
  red: 'cards',
};

function shortDate(k: string) {
  const [, m, d] = k.split('-');
  return `${d}/${m}`;
}

function matchText(kind: MatchNotifKind, c: MatchNotifCtx, lang: Lang): { title: string; body: string } {
  const h = c.home?.name ?? '?';
  const a = c.away?.name ?? '?';
  const hs = c.homeScore ?? c.match.homeScore;
  const as = c.awayScore ?? c.match.awayScore;
  const score = `${h} ${hs}-${as} ${a}`;
  const vs = `${h} – ${a}`;
  const fr = lang === 'fr';
  switch (kind) {
    case 'kickoff':
      return { title: fr ? '▶️ Coup d’envoi' : '▶️ Kick-off', body: vs };
    case 'halftime':
      return { title: fr ? '⏸ Mi-temps' : '⏸ Half-time', body: score };
    case 'second_half':
      return { title: fr ? '▶️ Reprise, 2e mi-temps' : '▶️ Second half under way', body: score };
    case 'fulltime':
      return { title: fr ? '🏁 Fin du match' : '🏁 Full time', body: score };
    case 'postponed':
      return { title: fr ? '📅 Match reporté' : '📅 Match postponed', body: vs };
    case 'rescheduled':
      return {
        title: fr ? '📅 Match reprogrammé' : '📅 Match rescheduled',
        body: `${vs} · ${shortDate(c.match.date)} ${c.match.start}`,
      };
    case 'goal':
      return {
        title: `⚽ ${fr ? 'But !' : 'Goal!'} ${score}`,
        body: `${c.playerName ?? ''}${c.minute ? ` (${c.minute}')` : ''}${
          c.assistName ? ` · ${fr ? 'passe' : 'assist'} : ${c.assistName}` : ''
        }`,
      };
    case 'yellow':
    case 'red':
      return {
        title: kind === 'yellow' ? (fr ? '🟨 Carton jaune' : '🟨 Yellow card') : fr ? '🟥 Carton rouge' : '🟥 Red card',
        body: `${c.playerName ?? ''}${c.teamName ? ` (${c.teamName})` : ''}${c.minute ? ` · ${c.minute}'` : ''} · ${score}`,
      };
  }
}

function bookingText(
  kind: 'requested' | 'confirmed' | 'refused' | 'cancelled',
  b: Booking,
  lang: Lang,
  reason?: string,
): { title: string; body: string } {
  const fr = lang === 'fr';
  const when = `${b.pitchName} · ${shortDate(b.date)} ${fr ? 'à' : 'at'} ${b.start}`;
  switch (kind) {
    case 'requested':
      return { title: fr ? '🆕 Nouvelle demande de réservation' : '🆕 New booking request', body: `${b.userName} · ${when}` };
    case 'confirmed':
      return { title: fr ? '✅ Réservation confirmée' : '✅ Booking confirmed', body: `${when}. ${fr ? 'À bientôt !' : 'See you soon!'}` };
    case 'refused':
      return { title: fr ? '❌ Réservation refusée' : '❌ Booking refused', body: `${when}${reason ? ` — ${reason}` : ''}` };
    case 'cancelled':
      return { title: fr ? '⚠️ Réservation annulée' : '⚠️ Booking cancelled', body: `${when}${reason ? ` — ${reason}` : ''}` };
  }
}

export type Notifier = ReturnType<typeof createNotifier>;

/**
 * @param pushEnabled false en mode démo (pas de vrais jetons) — la boîte de notifications in-app fonctionne toujours.
 */
/**
 * @param remote serveur de l'académie : les notifications push et WhatsApp partent du serveur
 *               (les jetons et la clé WhatsApp ne sont jamais envoyés aux téléphones).
 */
export function createNotifier(store: Store, pushEnabled: boolean, remote?: RemoteNotifier) {
  const both = (texts: Texts) => ({ fr: texts('fr'), en: texts('en') });
  async function tokens(where: Where[]): Promise<PushTokenDoc[]> {
    if (!pushEnabled) return [];
    try {
      return await store.query<PushTokenDoc>(PUSH_COL, where);
    } catch (e) {
      console.warn('[push] lecture des jetons impossible', e);
      return [];
    }
  }

  /** Ajoute un message dans la boîte de notifications de l'app. */
  async function inbox(target: { userId?: string | null; audience?: 'staff' }, texts: Texts, url?: string) {
    try {
      const id = store.newId(COL.inbox);
      const item: InboxItem = {
        id,
        userId: target.userId ?? null,
        audience: target.audience ?? null,
        fr: texts('fr'),
        en: texts('en'),
        url: url ?? null,
        createdAt: Date.now(),
      };
      await store.set(COL.inbox, id, item);
    } catch (e) {
      console.warn('[inbox] écriture impossible', e);
    }
  }

  /** `event` : le serveur réécrit le texte d'après la base quand l'expéditeur n'est pas du personnel. */
  async function toStaff(texts: Texts, url: string, event: StaffEvent) {
    await inbox({ audience: 'staff' }, texts, url);
    if (remote) return remote.push({ target: 'staff', texts: both(texts), url, event });
    const list = await tokens([['staff', true]]);
    await sendPush(list.filter((d) => d.prefs?.bookings !== false).map((d) => ({ to: d.token, ...texts(d.lang ?? 'fr'), data: { url } })));
  }

  async function toUsers(userIds: string[], texts: Texts, url: string, pref: keyof PushPrefs = 'bookings') {
    if (remote) {
      for (const userId of new Set(userIds)) await inbox({ userId }, texts, url);
      return remote.push({ target: 'users', userIds: [...new Set(userIds)], pref, texts: both(texts), url });
    }
    for (const userId of new Set(userIds)) {
      await inbox({ userId }, texts, url);
      const list = await tokens([['userId', userId]]);
      await sendPush(list.filter((d) => d.prefs?.[pref] !== false).map((d) => ({ to: d.token, ...texts(d.lang ?? 'fr'), data: { url } })));
    }
  }

  /** Comptes liés à une équipe (propriétaire + comptes entreprise rattachés). */
  async function companyUserIds(team: Team): Promise<string[]> {
    const ids: string[] = team.ownerId ? [team.ownerId] : [];
    try {
      const users = await store.query<UserProfile>(COL.users, [['teamId', team.id]]);
      ids.push(...users.map((u) => u.id));
    } catch {
      /* lecture des comptes réservée à l'admin */
    }
    return ids;
  }

  async function matchEvent(kind: MatchNotifKind, ctx: MatchNotifCtx) {
    if (remote) return remote.push({ target: 'match', match: { id: ctx.match.id }, pref: PREF_OF[kind], texts: both((l) => matchText(kind, ctx, l)), url: `/match/${ctx.match.id}` });
    const list = await tokens([]);
    const teamIds = [ctx.match.homeTeamId, ctx.match.awayTeamId];
    const pref = PREF_OF[kind];
    const msgs: PushMessage[] = list
      .filter((d) => (d.prefs?.matches || (d.followedMatchIds ?? []).includes(ctx.match.id)) && d.prefs?.[pref] !== false)
      .filter(
        (d) =>
          (d.followedMatchIds ?? []).includes(ctx.match.id) ||
          d.prefs.allTeams ||
          (d.teamId != null && teamIds.includes(d.teamId)) ||
          (d.followedTeamIds ?? []).some((x) => teamIds.includes(x)),
      )
      .map((d) => ({ to: d.token, ...matchText(kind, ctx, d.lang ?? 'fr'), data: { url: `/match/${ctx.match.id}` } }));
    await sendPush(msgs);
  }

  /**
   * Message WhatsApp automatique à l'administrateur (service gratuit CallMeBot).
   * Le numéro et la clé sont réglés dans Administration → Paramètres.
   * @returns true si le message a été envoyé.
   */
  async function whatsappToAdmin(phone: string, text: string): Promise<boolean> {
    if (remote) return remote.whatsapp({ test: true, phone });
    const digits = phone.replace(/[^\d]/g, '');
    if (!digits) return false;
    try {
      const cfg = await store.get<{ apiKey?: string }>(COL.config, 'whatsapp');
      if (!cfg?.apiKey) return false;
      const url = `https://api.callmebot.com/whatsapp.php?phone=%2B${digits}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(cfg.apiKey)}`;
      // no-cors : sur le web la réponse est opaque, l'envoi a lieu quand même
      await fetch(url, Platform.OS === 'web' ? { mode: 'no-cors' } : undefined);
      return true;
    } catch (e) {
      console.warn('[whatsapp] envoi impossible', e);
      return false;
    }
  }

  /** Nouvelle demande : prévient le personnel (agents, admins) + WhatsApp automatique à l'administrateur. */
  async function bookingRequested(b: Booking, whatsappNumber?: string): Promise<boolean> {
    await toStaff((l) => bookingText('requested', b, l), '/admin/queue', { kind: 'booking', id: b.id });
    if (remote) return remote.whatsapp({ bookingId: b.id });
    if (!whatsappNumber) return false;
    const text =
      `🆕 Nouvelle réservation Tunisia Golden League\n` +
      `• ${b.pitchName}\n• ${shortDate(b.date)} à ${b.start}${b.end ? `–${b.end}` : ''}\n` +
      `• ${b.userName} (${b.userPhone ?? ''})\n` +
      `À confirmer dans l'app : Administration → File d'attente.`;
    return whatsappToAdmin(whatsappNumber, text);
  }

  /** Réponse / annulation : prévient le client. */
  async function bookingHandled(b: Booking, kind: 'confirmed' | 'refused' | 'cancelled', reason?: string) {
    if (b.manual) return;
    await toUsers([b.userId], (l) => bookingText(kind, b, l, reason), '/bookings');
  }

  async function teamRegistered(team: Team) {
    await toStaff(
      (l) =>
        l === 'fr'
          ? { title: '🏢 Nouvelle demande d’inscription', body: `${team.company} inscrit l’équipe « ${team.name} » — pièces à vérifier` }
          : { title: '🏢 New registration request', body: `${team.company} registered "${team.name}" — documents to check` },
      '/admin/championships',
      { kind: 'team', id: team.id },
    );
  }

  async function playersSubmitted(team: Team, count: number) {
    await toStaff(
      (l) =>
        l === 'fr'
          ? { title: '🧾 Joueurs à vérifier', body: `${team.name} soumet ${count} joueur(s)` }
          : { title: '🧾 Players to review', body: `${team.name} submitted ${count} player(s)` },
      '/admin/championships',
      { kind: 'players', id: team.id },
    );
  }

  async function playerReviewed(player: Player, team: Team, approved: boolean, reason?: string) {
    await toUsers(
      await companyUserIds(team),
      (l) =>
        approved
          ? l === 'fr'
            ? { title: '✅ Joueur validé', body: `${player.name} est confirmé pour ${team.name}` }
            : { title: '✅ Player approved', body: `${player.name} is confirmed for ${team.name}` }
          : l === 'fr'
            ? { title: '❌ Joueur refusé', body: `${player.name}${reason ? ` — ${reason}` : ''}` }
            : { title: '❌ Player refused', body: `${player.name}${reason ? ` — ${reason}` : ''}` },
      '/entreprise/joueurs',
    );
  }

  async function teamReviewed(team: Team, approved: boolean, reason?: string) {
    await toUsers(
      await companyUserIds(team),
      (l) =>
        approved
          ? l === 'fr'
            ? { title: '✅ Équipe validée', body: `${team.name} participe au championnat` }
            : { title: '✅ Team approved', body: `${team.name} is in the league` }
          : l === 'fr'
            ? { title: '❌ Demande à corriger', body: `L’inscription de ${team.name} a été refusée${reason ? ` — ${reason}` : ''}. Corrige et renvoie la demande.` }
            : { title: '❌ Request to fix', body: `${team.name}'s registration was refused${reason ? ` — ${reason}` : ''}. Fix it and send it again.` },
      '/company',
    );
  }

  /** Feuille de match remplie (avant le match) ou complétée (après) : les entreprises des deux équipes sont prévenues. */
  async function sheetNotice(kind: 'ready' | 'final', match: Match, home?: Team, away?: Team) {
    const ids = [...(home ? await companyUserIds(home) : []), ...(away ? await companyUserIds(away) : [])];
    const h = home?.name ?? '?';
    const a = away?.name ?? '?';
    await toUsers(
      ids,
      (l) =>
        kind === 'ready'
          ? l === 'fr'
            ? { title: '📝 Feuille de match prête', body: `${h} – ${a} : la composition des équipes est enregistrée.` }
            : { title: '📝 Match sheet ready', body: `${h} – ${a}: the line-ups are recorded.` }
          : l === 'fr'
            ? { title: '✅ Feuille de match finale', body: `${h} ${match.homeScore} – ${match.awayScore} ${a} : la feuille de match est disponible.` }
            : { title: '✅ Final match sheet', body: `${h} ${match.homeScore} – ${match.awayScore} ${a}: the match sheet is available.` },
      `/match/${match.id}`,
      'matches',
    );
  }

  /** Demande de suppression de compte : l'administration est prévenue. */
  async function deletionRequested(u: { name: string; email?: string | null; role: string }) {
    await toStaff(
      (l) =>
        l === 'fr'
          ? { title: '🗑 Demande de suppression de compte', body: `${u.name}${u.email ? ` (${u.email})` : ''} demande la suppression de son compte.` }
          : { title: '🗑 Account deletion request', body: `${u.name}${u.email ? ` (${u.email})` : ''} asks for the account to be deleted.` },
      '/admin/staff',
      { kind: 'deletion' },
    );
  }

  return { deletionRequested, matchEvent, sheetNotice, whatsappToAdmin, bookingRequested, bookingHandled, teamRegistered, playersSubmitted, playerReviewed, teamReviewed };
}
