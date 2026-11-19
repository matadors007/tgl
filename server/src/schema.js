/**
 * Correspondance entre les « collections » de l'application (documents JSON) et les tables PostgreSQL.
 *
 * L'application lit et écrit des documents ({ id, champ: valeur… }) ; le serveur les range dans des
 * tables typées (voir migrations/001_schema.sql) :
 *   - chaque champ connu → sa colonne (type converti : instants en timestamptz, dates en date…) ;
 *   - un champ inconnu (nouvelle version de l'application) → colonne extra (jsonb), rien n'est perdu ;
 *   - une collection inconnue → table documents.
 *
 * Types : text · int · num · bool · date (AAAA-MM-JJ) · ts (millisecondes ↔ timestamptz) · json
 */

const F = (spec) =>
  Object.fromEntries(
    spec
      .trim()
      .split(/\s+/)
      .map((s) => {
        const [field, column, type] = s.split(':');
        return [field, { column, type }];
      }),
  );

const BOOKING = F(`
  slotId:slot_id:text pitchId:pitch_id:text pitchName:pitch_name:text date:date:date start:start_time:text end:end_time:text
  userId:user_id:text userName:user_name:text userPhone:user_phone:text status:status:text createdAt:created_at:ts
  expiresAt:expires_at:ts handledBy:handled_by:text handledByName:handled_by_name:text handledAt:handled_at:ts
  reason:reason:text lockedBy:locked_by:text lockedByName:locked_by_name:text lockedAt:locked_at:ts manual:manual:bool
  private:private:bool amount:amount:num note:note:text seriesId:series_id:text
`);

/** collection → { table, fields } ; kv = table clé → valeur (settings) */
export const COLLECTIONS = {
  config: { table: 'settings', kv: true },
  users: {
    table: 'users',
    fields: F(`
      name:name:text phone:phone:text email:email:text role:role:text lang:lang:text teamId:team_id:text
      companyName:company_name:text photo:photo:text perms:perms:json followedTeamIds:followed_team_ids:json
      deletionRequestedAt:deletion_requested_at:ts
    `),
  },
  pitches: {
    table: 'pitches',
    fields: F(`
      name:name:text type:type:text active:active:bool order:sort_order:int slotStarts:slot_starts:json
      slotMinutes:slot_minutes:int dateSlots:date_slots:json disabledStarts:disabled_starts:json description:description:text
      surface:surface:text dimensions:dimensions:text features:features:json photo:photo:text
    `),
  },
  slots: {
    table: 'slots',
    fields: F(`
      pitchId:pitch_id:text date:date:date start:start_time:text end:end_time:text status:status:text
      bookingId:booking_id:text matchId:match_id:text expiresAt:expires_at:ts reason:reason:text private:private:bool
    `),
  },
  bookings: { table: 'bookings', fields: BOOKING },
  privateBookings: { table: 'private_bookings', fields: BOOKING },
  seasons: {
    table: 'seasons',
    fields: F(`
      name:name:text status:status:text kind:kind:text category:category:text cupFormat:cup_format:text
      maxTeams:max_teams:int groupCount:group_count:int pointsWin:points_win:int pointsDraw:points_draw:int
      pointsLoss:points_loss:int yellowLimit:yellow_limit:int redBanMatches:red_ban_matches:int halfMinutes:half_minutes:int
      doubleRound:double_round:bool active:active:bool startDate:start_date:date rosterDeadline:roster_deadline:date
      rosterDeadlineAt:roster_deadline_at:ts lotOrder:lot_order:json createdAt:created_at:ts
    `),
  },
  teams: {
    table: 'teams',
    fields: F(`
      seasonId:season_id:text name:name:text company:company:text shortName:short_name:text color:color:text
      logoUrl:logo_url:text captainId:captain_id:text ownerId:owner_id:text approved:approved:bool
      requestStatus:request_status:text rejectReason:reject_reason:text submittedAt:submitted_at:ts managers:managers:json
      coach:coach:json collectiveAttestationId:collective_attestation_id:text collectiveCertificateId:collective_certificate_id:text
      collectiveAttestationPromised:collective_attestation_promised:bool collectiveCertificatePromised:collective_certificate_promised:bool
      group:group_name:text
    `),
  },
  players: {
    table: 'players',
    fields: F(`
      seasonId:season_id:text teamId:team_id:text name:name:text number:number:int position:position:text
      photoUrl:photo_url:text status:status:text rejectReason:reject_reason:text submittedAt:submitted_at:ts
      licenseNo:license_no:text birthDate:birth_date:date removedAt:removed_at:ts
    `),
  },
  playerInfo: {
    table: 'player_infos',
    fields: F(`
      teamId:team_id:text ownerId:owner_id:text firstName:first_name:text lastName:last_name:text birthDate:birth_date:date
      phone:phone:text cin:cin:text jobTitle:job_title:text employeeId:employee_id:text cinFileId:cin_file_id:text
      photoFileId:photo_file_id:text attestationFileId:attestation_file_id:text certificateFileId:certificate_file_id:text
    `),
  },
  files: {
    table: 'stored_files',
    fields: F(`
      teamId:team_id:text ownerId:owner_id:text kind:kind:text mime:mime:text name:name:text size:size:int
      data:data:text createdAt:created_at:ts
    `),
  },
  matches: {
    table: 'matches',
    fields: F(`
      seasonId:season_id:text round:round:int homeTeamId:home_team_id:text awayTeamId:away_team_id:text date:date:date
      start:start_time:text pitchId:pitch_id:text status:status:text homeScore:home_score:int awayScore:away_score:int
      homePens:home_pens:int awayPens:away_pens:int forfeit:forfeit:text stage:stage:text group:group_name:text
      koRound:ko_round:int plannedAt:planned_at:ts kickoffAt:kickoff_at:ts secondHalfAt:second_half_at:ts
      finishedAt:finished_at:ts homeLineup:home_lineup:json awayLineup:away_lineup:json sheet:sheet:json
      referee:referee:text notes:notes:text fbLiveUrl:fb_live_url:text
    `),
  },
  events: {
    table: 'match_events',
    fields: F(`
      matchId:match_id:text seasonId:season_id:text teamId:team_id:text type:type:text minute:minute:int half:half:int
      playerId:player_id:text assistId:assist_id:text playerInId:player_in_id:text secondYellow:second_yellow:bool
      coach:coach:bool personName:person_name:text createdAt:created_at:ts
    `),
  },
  news: {
    table: 'news',
    fields: F(`
      type:type:text title:title:text body:body:text imageUrl:image_url:text videoUrl:video_url:text
      matchId:match_id:text teamId:team_id:text createdAt:created_at:ts
    `),
  },
  showcase: {
    table: 'showcase_items',
    fields: F(`
      kind:kind:text title:title:text subtitle:subtitle:text image:image:text videoUrl:video_url:text
      order:sort_order:int active:active:bool createdAt:created_at:ts
    `),
  },
  inbox: {
    table: 'inbox_items',
    fields: F(`
      userId:user_id:text audience:audience:text fr:fr:json en:en:json url:url:text createdAt:created_at:ts
    `),
  },
  pushTokens: {
    table: 'push_tokens',
    fields: F(`
      token:token:text userId:user_id:text role:role:text staff:staff:bool teamId:team_id:text
      followedTeamIds:followed_team_ids:json followedMatchIds:followed_match_ids:json lang:lang:text
      prefs:prefs:json platform:platform:text updatedAt:updated_at:ts
    `),
  },
};

export const TABLE_TO_COLLECTION = Object.fromEntries(Object.entries(COLLECTIONS).map(([c, d]) => [d.table, c]));

/** Valeur JS → paramètre SQL pour une colonne du type donné. */
function toSql(type, v) {
  if (v === undefined || v === null) return null;
  switch (type) {
    case 'json':
      return JSON.stringify(v);
    case 'ts': {
      const ms = typeof v === 'number' ? v : Date.parse(String(v));
      return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
    }
    case 'date':
      return v === '' ? null : String(v);
    case 'int':
    case 'num':
      return v === '' ? null : v;
    default:
      return v;
  }
}

/** Valeur SQL → valeur JS (forme attendue par l'application). */
function fromSql(type, v) {
  if (v === null || v === undefined) return undefined;
  if (type === 'ts') return v instanceof Date ? v.getTime() : Date.parse(v);
  if (type === 'num') return Number(v);
  return v;
}

/** Document → { columns: [...], values: [...] } (avec extra pour les champs inconnus). */
export function toRow(def, doc) {
  if (def.kv) {
    const { id: _id, __v: _v, ...value } = doc;
    return { columns: ['value'], values: [JSON.stringify(value)], casts: ['jsonb'] };
  }
  const columns = [];
  const values = [];
  const casts = [];
  const extra = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === 'id' || k === '__v' || v === undefined) continue;
    if (!(k in def.fields)) extra[k] = v;
  }
  for (const [field, { column, type }] of Object.entries(def.fields)) {
    columns.push(column);
    values.push(toSql(type, doc[field]));
    casts.push(type === 'json' ? 'jsonb' : null);
  }
  columns.push('extra');
  values.push(JSON.stringify(extra));
  casts.push('jsonb');
  return { columns, values, casts };
}

/** Ligne SQL → document de l'application (champs vides omis, comme dans Firestore). */
export function fromRow(def, row) {
  if (def.kv) return { ...(row.value ?? {}), id: row.id, __v: Number(row.row_version) };
  const doc = { ...(row.extra ?? {}) };
  for (const [field, { column, type }] of Object.entries(def.fields)) {
    const v = fromSql(type, row[column]);
    if (v !== undefined) doc[field] = v;
  }
  doc.id = row.id;
  doc.__v = Number(row.row_version);
  return doc;
}

/** Filtre d'égalité [champ, valeur] → morceau de WHERE. */
export function whereSql(def, where, params) {
  const parts = [];
  for (const [field, value] of where) {
    if (field === 'id') {
      params.push(String(value));
      parts.push(`id = $${params.length}`);
    } else if (def.kv) {
      params.push(JSON.stringify({ [field]: value }));
      parts.push(`value @> $${params.length}::jsonb`);
    } else if (field in def.fields) {
      const { column, type } = def.fields[field];
      if (value === null) parts.push(`${column} IS NULL`);
      else {
        params.push(type === 'json' ? JSON.stringify(value) : toSql(type, value));
        parts.push(`${column} = $${params.length}${type === 'json' ? '::jsonb' : ''}`);
      }
    } else {
      params.push(JSON.stringify({ [field]: value }));
      parts.push(`extra @> $${params.length}::jsonb`);
    }
  }
  return parts.length ? parts.join(' AND ') : 'true';
}
