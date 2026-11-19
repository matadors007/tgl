/**
 * Règles de sécurité : reprise fidèle de firestore.rules, exécutée par le serveur.
 *  - canRead(ctx, col, doc)                  : un document peut-il être lu par ce compte ?
 *  - canWrite(ctx, { kind, col, id, before, after }) : création / modification / suppression autorisée ?
 * ctx : { uid, emailVerified, me (profil users/uid ou null), now, get(col, id), getAfter(col, id) }
 */

export const STAFF_ROLES = ['agent', 'operator', 'admin'];

/** Identique à roleDefaultPerm() de src/domain/model.ts */
function roleDefault(role, p) {
  return role === 'admin' || (role === 'agent' && ['planning', 'queue'].includes(p)) || (role === 'operator' && ['matches.live', 'matches.sheet'].includes(p));
}
export function permOf(u, p) {
  if (!u || !STAFF_ROLES.includes(u.role)) return false;
  if (u.perms && typeof u.perms === 'object' && p in u.perms) return u.perms[p] === true;
  return roleDefault(u.role, p);
}

/** Clés modifiées entre deux versions d'un document. */
export function affectedKeys(before, after) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  keys.delete('id');
  keys.delete('__v');
  return [...keys].filter((k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null) || (k in (before ?? {})) !== (k in (after ?? {})));
}
const onlyKeys = (before, after, keys) => affectedKeys(before, after).every((k) => keys.includes(k));
const g = (doc, k, d) => (doc && k in doc && doc[k] !== undefined ? doc[k] : d);

function helpers(ctx) {
  const signedIn = !!ctx.uid;
  const me = ctx.me;
  const perm = (p) => signedIn && permOf(me, p);
  const staffRole = signedIn && !!me && STAFF_ROLES.includes(me.role);
  const isAdmin = signedIn && me?.role === 'admin';
  const isCompany = signedIn && me?.role === 'company';
  return {
    signedIn,
    me,
    perm,
    staffRole,
    isAdmin,
    isCompany,
    pitchStaff: () => perm('queue') || perm('planning') || perm('private') || perm('pitches.manage') || perm('slots.config'),
    isStaff: () => perm('queue') || perm('planning'),
    champStaff: () => perm('champ.edit') || perm('champ.delete') || perm('teams.validate') || perm('matches.calendar'),
    async ownsTeam(teamId) {
      if (!isCompany || !teamId) return false;
      const team = await ctx.get('teams', teamId);
      return g(team, 'ownerId', '') === ctx.uid || g(me, 'teamId', '') === teamId;
    },
    async rosterOpen(seasonId) {
      const s = await ctx.get('seasons', seasonId);
      const d = g(s, 'rosterDeadlineAt', null);
      return d == null || ctx.now <= d;
    },
  };
}

export function canRead(ctx, col, doc) {
  const h = helpers(ctx);
  switch (col) {
    case 'config':
      // Clé WhatsApp : administration seulement (les messages partent du serveur)
      return doc.id !== 'whatsapp' || h.perm('settings');
    case 'showcase':
    case 'pitches':
    case 'slots':
    case 'seasons':
    case 'teams':
    case 'players':
    case 'matches':
    case 'events':
    case 'news':
      return true;
    case 'users':
      // Son propre profil ; tous les comptes : gestion du personnel ou paramètres (recherche d'un client) ;
      // les autres membres du personnel ne voient que les comptes entreprise (championnat, feuilles de match)
      return h.signedIn && (ctx.uid === doc.id || h.perm('staff') || h.perm('settings') || (h.staffRole && doc.role === 'company'));
    case 'bookings':
      return h.signedIn && (doc.userId === ctx.uid || h.isStaff());
    case 'privateBookings':
      return h.perm('private');
    case 'pushTokens':
      // Les notifications partent du serveur : chacun ne voit que ses propres téléphones
      return h.signedIn && doc.userId === ctx.uid;
    case 'playerInfo':
    case 'files':
      return h.perm('teams.validate') || h.perm('licences') || h.perm('champ.edit') || (h.signedIn && doc.ownerId === ctx.uid);
    case 'inbox':
      return h.signedIn && (doc.userId === ctx.uid || (doc.audience === 'staff' && h.staffRole));
    default:
      return false;
  }
}

/** Contact d'équipe sans coordonnées (le nom reste visible). */
const hideContact = (c) => {
  if (!c || typeof c !== 'object') return c;
  const { email: _e, ...rest } = c;
  return { ...rest, phone: '' };
};

/**
 * Données personnelles masquées à la lecture (visiteurs, autres entreprises) :
 *  - équipes : téléphone et e-mail des responsables et de l'entraîneur ;
 *  - joueurs : date de naissance.
 * Le personnel et l'entreprise propriétaire de l'équipe voient tout.
 * À appeler après canRead, sur chaque document renvoyé (get, query, temps réel).
 */
export async function redact(ctx, col, doc) {
  if (!doc || (col !== 'teams' && col !== 'players')) return doc;
  const h = helpers(ctx);
  if (h.staffRole) return doc;
  if (col === 'teams') {
    if (h.isCompany && (g(doc, 'ownerId', '') === ctx.uid || g(h.me, 'teamId', '') === doc.id)) return doc;
    return {
      ...doc,
      ...(Array.isArray(doc.managers) ? { managers: doc.managers.map(hideContact) } : {}),
      ...(doc.coach ? { coach: hideContact(doc.coach) } : {}),
    };
  }
  // Joueurs : propriétaire de l'équipe (résultat mémorisé par équipe pour les listes)
  if (h.isCompany && doc.teamId) {
    ctx.ownedTeams ??= new Map();
    if (!ctx.ownedTeams.has(doc.teamId)) ctx.ownedTeams.set(doc.teamId, h.ownsTeam(doc.teamId));
    if (await ctx.ownedTeams.get(doc.teamId)) return doc;
  }
  if (!('birthDate' in doc)) return doc;
  const { birthDate: _b, ...rest } = doc;
  return rest;
}

/** kind : 'create' | 'update' | 'delete' */
export async function canWrite(ctx, { kind, col, id, before, after }) {
  const h = helpers(ctx);
  const { perm } = h;
  switch (col) {
    case 'config':
      return perm('settings');
    case 'showcase':
      return perm('showcase');
    case 'pitches':
      return perm('pitches.manage') || perm('slots.config') || perm('showcase');
    case 'news':
      return perm('news');
    case 'events':
      return perm('matches.live') || perm('champ.edit') || perm('champ.delete');
    case 'privateBookings':
      return perm('private');

    case 'users':
      if (kind === 'create')
        return perm('staff') || (h.signedIn && ctx.uid === id && (after.role === 'user' || (after.role === 'company' && g(after, 'teamId', null) == null)));
      if (kind === 'update')
        return (
          perm('staff') ||
          // Gestion du championnat : rattacher un compte entreprise à son équipe, rien d'autre
          (h.champStaff() && onlyKeys(before, after, ['teamId', 'companyName'])) ||
          (h.signedIn && ctx.uid === id && !affectedKeys(before, after).some((k) => ['role', 'teamId', 'companyName', 'perms'].includes(k)))
        );
      return perm('staff');

    case 'slots': {
      if (h.pitchStaff() || perm('matches.calendar') || perm('champ.edit') || perm('champ.delete')) return true;
      if (kind === 'delete') {
        if (!h.signedIn || before.status !== 'pending') return false;
        const b = await ctx.get('bookings', before.bookingId);
        return g(b, 'userId', null) === ctx.uid;
      }
      if (!h.signedIn || after.status !== 'pending') return false;
      const b = await ctx.getAfter('bookings', after.bookingId);
      if (g(b, 'userId', null) !== ctx.uid) return false;
      return before == null || before.status === 'free' || (before.status === 'pending' && before.expiresAt < ctx.now);
    }

    case 'bookings':
      if (kind === 'create')
        return (
          h.isStaff() ||
          (h.signedIn && h.me?.role === 'user' && ctx.emailVerified === true && after.userId === ctx.uid && after.status === 'pending')
        );
      if (kind === 'update')
        return h.isStaff() || (h.signedIn && before.userId === ctx.uid && before.status === 'pending' && after.status === 'cancelled');
      return h.isAdmin;

    case 'pushTokens':
      if (kind === 'delete') return h.isAdmin;
      return ((!h.signedIn && after.userId == null) || (h.signedIn && after.userId === ctx.uid)) && (after.staff === false || h.staffRole);

    case 'seasons':
      if (kind === 'create') return perm('champ.create');
      if (kind === 'delete') return perm('champ.delete');
      return perm('champ.edit') || (perm('matches.live') && onlyKeys(before, after, ['status']));

    case 'teams': {
      if (perm('champ.edit') || perm('champ.delete') || perm('teams.validate')) return true;
      if (kind === 'create') {
        if (!(h.isCompany && after.ownerId === ctx.uid && after.approved === false && g(after, 'requestStatus', 'draft') === 'draft')) return false;
        const s = await ctx.get('seasons', after.seasonId);
        return g(s, 'status', null) === 'registration';
      }
      if (kind === 'update')
        return (
          h.signedIn &&
          g(before, 'ownerId', '') === ctx.uid &&
          onlyKeys(before, after, [
            'name', 'shortName', 'color', 'logoUrl', 'managers', 'coach',
            'collectiveAttestationId', 'collectiveCertificateId',
            'collectiveAttestationPromised', 'collectiveCertificatePromised',
            'requestStatus', 'submittedAt', 'rejectReason', 'approved',
          ]) &&
          g(after, 'approved', false) === g(before, 'approved', false) &&
          ['draft', 'submitted', g(before, 'requestStatus', 'approved')].includes(g(after, 'requestStatus', 'draft'))
        );
      return false;
    }

    case 'players': {
      if (perm('champ.edit') || perm('champ.delete') || perm('teams.validate')) return true;
      if (kind === 'create') return (await h.ownsTeam(after.teamId)) && ['draft', 'pending'].includes(after.status) && (await h.rosterOpen(after.seasonId));
      if (kind === 'update')
        return (
          (await h.ownsTeam(before.teamId)) &&
          after.teamId === before.teamId &&
          g(after, 'licenseNo', null) === g(before, 'licenseNo', null) &&
          (['draft', 'pending'].includes(after.status) ||
            onlyKeys(before, after, ['number', 'position']) ||
            (g(before, 'status', 'approved') === 'approved' && after.status === 'removed' && onlyKeys(before, after, ['status', 'removedAt'])))
        );
      return (await h.ownsTeam(before.teamId)) && g(before, 'status', 'approved') !== 'approved';
    }

    case 'playerInfo':
      if (kind === 'delete') return perm('champ.edit') || perm('champ.delete') || (h.signedIn && before.ownerId === ctx.uid);
      return perm('teams.validate') || perm('champ.edit') || (after.ownerId === ctx.uid && (await h.ownsTeam(after.teamId)));

    case 'files':
      if (kind === 'delete') return perm('champ.edit') || perm('champ.delete') || (h.signedIn && before.ownerId === ctx.uid);
      if (kind === 'create')
        return perm('teams.validate') || perm('champ.edit') || (h.signedIn && after.ownerId === ctx.uid && (await h.ownsTeam(after.teamId)));
      return false;

    case 'matches':
      if (kind === 'create' || kind === 'delete') return perm('matches.calendar') || perm('champ.edit') || perm('champ.delete');
      if (perm('matches.live') || perm('matches.sheet') || perm('matches.calendar')) return true;
      // L'entreprise choisit ses joueurs jusqu'à 12 h avant le coup d'envoi
      if (!['scheduled', 'postponed'].includes(before.status) || !(ctx.now < before.plannedAt - 43_200_000)) return false;
      return (
        ((await h.ownsTeam(before.homeTeamId)) && onlyKeys(before, after, ['homeLineup'])) ||
        ((await h.ownsTeam(before.awayTeamId)) && onlyKeys(before, after, ['awayLineup']))
      );

    case 'inbox':
      if (kind === 'create') return h.signedIn && (after.audience === 'staff' || h.staffRole);
      if (kind === 'delete') return perm('staff');
      return false;

    default:
      return false;
  }
}
