-- ════════════════════════════════════════════════════════════════════════════
--  Tunisia Golden League — schéma relationnel (PostgreSQL 16)
--
--  Conventions
--   • Tables au pluriel, colonnes en snake_case, identifiants texte (compatibles avec l'application).
--   • Dates : date (AAAA-MM-JJ) · horaires : text 'HH:MM' · instants : timestamptz.
--   • Valeurs imbriquées (feuille de match, contacts, préférences…) : jsonb.
--   • extra jsonb : champs ajoutés par une version plus récente de l'application, pas encore
--     promus en colonnes (évolutivité : aucune donnée perdue, migration possible plus tard).
--   • row_version / row_created_at / row_updated_at : métadonnées techniques
--     (row_version sert aux transactions optimistes).
--   • Clés étrangères DEFERRABLE INITIALLY DEFERRED : vérifiées à la fin de chaque transaction,
--     ce qui permet d'écrire plusieurs documents liés dans n'importe quel ordre.
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────── Comptes de connexion ─────────────
CREATE TABLE IF NOT EXISTS accounts (
  uid            text PRIMARY KEY,
  email          text        NOT NULL UNIQUE,
  password_hash  text,
  email_verified boolean     NOT NULL DEFAULT false,
  disabled       boolean     NOT NULL DEFAULT false,
  must_reset     boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login     timestamptz
);
COMMENT ON TABLE accounts IS 'Comptes de connexion (e-mail + mot de passe chiffré bcrypt). Le profil est dans users.';
COMMENT ON COLUMN accounts.must_reset IS 'Compte repris de Firebase : un nouveau mot de passe doit être choisi.';

CREATE TABLE IF NOT EXISTS otp_codes (
  uid        text PRIMARY KEY REFERENCES accounts(uid) ON DELETE CASCADE,
  hash       text   NOT NULL,
  expires_at bigint NOT NULL,
  attempts   int    NOT NULL DEFAULT 0,
  sent_at    bigint NOT NULL,
  history    jsonb  NOT NULL DEFAULT '[]'
);
COMMENT ON TABLE otp_codes IS 'Codes d''activation à 6 chiffres en cours (empreinte seulement, jamais le code).';

CREATE TABLE IF NOT EXISTS reset_codes (
  code       text PRIMARY KEY,
  uid        text   NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  expires_at bigint NOT NULL
);
COMMENT ON TABLE reset_codes IS 'Liens « mot de passe oublié » en cours (valables 1 heure).';

-- ───────────── Réglages ─────────────
CREATE TABLE settings (
  id             text PRIMARY KEY,
  value          jsonb       NOT NULL DEFAULT '{}',
  row_version    bigint      NOT NULL DEFAULT 1,
  row_created_at timestamptz NOT NULL DEFAULT now(),
  row_updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE settings IS 'Réglages clé → valeur : « app » (horaires, tarifs, contact…), « whatsapp » (clé API, admin seulement).';

-- ───────────── Utilisateurs ─────────────
CREATE TABLE users (
  id                    text PRIMARY KEY REFERENCES accounts(uid) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  name                  text NOT NULL,
  phone                 text,
  email                 text,
  role                  text NOT NULL CHECK (role IN ('user', 'company', 'operator', 'agent', 'admin')),
  lang                  text CHECK (lang IN ('fr', 'en')),
  team_id               text,
  company_name          text,
  photo                 text,
  perms                 jsonb,
  followed_team_ids     jsonb,
  deletion_requested_at timestamptz,
  extra                 jsonb       NOT NULL DEFAULT '{}',
  row_version           bigint      NOT NULL DEFAULT 1,
  row_created_at        timestamptz NOT NULL DEFAULT now(),
  row_updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE users IS 'Profils : particuliers, entreprises, personnel (agent, opérateur, administrateur).';
COMMENT ON COLUMN users.perms IS 'Permissions personnalisées {permission: true|false} ; vide = valeurs par défaut du rôle.';

-- ───────────── Terrains et créneaux ─────────────
CREATE TABLE pitches (
  id              text PRIMARY KEY,
  name            text    NOT NULL,
  type            text    NOT NULL CHECK (type IN ('6v6', '7v7')),
  active          boolean NOT NULL DEFAULT true,
  sort_order      int     NOT NULL DEFAULT 0,
  slot_starts     jsonb,
  slot_minutes    int,
  date_slots      jsonb,
  disabled_starts jsonb,
  description     text,
  surface         text,
  dimensions      text,
  features        jsonb,
  photo           text,
  extra           jsonb       NOT NULL DEFAULT '{}',
  row_version     bigint      NOT NULL DEFAULT 1,
  row_created_at  timestamptz NOT NULL DEFAULT now(),
  row_updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE pitches IS 'Terrains (foot à 6 / à 7), horaires personnalisés et présentation.';

CREATE TABLE slots (
  id             text PRIMARY KEY,
  pitch_id       text NOT NULL REFERENCES pitches(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  date           date NOT NULL,
  start_time     text NOT NULL CHECK (start_time ~ '^\d{2}:\d{2}$'),
  end_time       text NOT NULL CHECK (end_time ~ '^\d{2}:\d{2}$'),
  status         text NOT NULL CHECK (status IN ('free', 'pending', 'booked', 'blocked')),
  booking_id     text,
  match_id       text,
  expires_at     timestamptz,
  reason         text,
  private        boolean,
  extra          jsonb       NOT NULL DEFAULT '{}',
  row_version    bigint      NOT NULL DEFAULT 1,
  row_created_at timestamptz NOT NULL DEFAULT now(),
  row_updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE slots IS 'Créneaux occupés (demande en attente, réservé, bloqué par un match). Un créneau libre n''a pas de ligne.';
COMMENT ON COLUMN slots.id IS 'terrain_AAAA-MM-JJ_HHMM : un seul enregistrement possible par créneau.';

-- ───────────── Réservations ─────────────
CREATE TABLE bookings (
  id             text PRIMARY KEY,
  slot_id        text NOT NULL,
  pitch_id       text NOT NULL,
  pitch_name     text,
  date           date NOT NULL,
  start_time     text NOT NULL CHECK (start_time ~ '^\d{2}:\d{2}$'),
  end_time       text NOT NULL CHECK (end_time ~ '^\d{2}:\d{2}$'),
  user_id        text REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  user_name      text,
  user_phone     text,
  status         text NOT NULL CHECK (status IN ('pending', 'confirmed', 'refused', 'expired', 'cancelled')),
  created_at     timestamptz NOT NULL,
  expires_at     timestamptz,
  handled_by     text,
  handled_by_name text,
  handled_at     timestamptz,
  reason         text,
  locked_by      text,
  locked_by_name text,
  locked_at      timestamptz,
  manual         boolean,
  private        boolean,
  amount         numeric(10, 3),
  note           text,
  series_id      text,
  extra          jsonb       NOT NULL DEFAULT '{}',
  row_version    bigint      NOT NULL DEFAULT 1,
  row_created_at timestamptz NOT NULL DEFAULT now(),
  row_updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE bookings IS 'Réservations des clients (application ou téléphone). Nom du terrain et du client copiés : l''historique reste lisible.';

CREATE TABLE private_bookings (LIKE bookings INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING COMMENTS);
ALTER TABLE private_bookings ADD PRIMARY KEY (id);
ALTER TABLE private_bookings ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
COMMENT ON TABLE private_bookings IS 'Réservations privées saisies par l''administrateur (visibles par lui seul), séries hebdomadaires comprises.';

-- ───────────── Compétitions ─────────────
CREATE TABLE seasons (
  id                 text PRIMARY KEY,
  name               text    NOT NULL,
  status             text    NOT NULL CHECK (status IN ('registration', 'running', 'finished')),
  kind               text    CHECK (kind IN ('league', 'cup')),
  category           text    CHECK (category IN ('mixed', 'over35')),
  cup_format         text    CHECK (cup_format IN ('groups', 'knockout')),
  max_teams          int,
  group_count        int,
  points_win         int     NOT NULL DEFAULT 3,
  points_draw        int     NOT NULL DEFAULT 1,
  points_loss        int     NOT NULL DEFAULT 0,
  yellow_limit       int,
  red_ban_matches    int,
  half_minutes       int,
  double_round       boolean,
  active             boolean,
  start_date         date,
  roster_deadline    date,
  roster_deadline_at timestamptz,
  lot_order          jsonb,
  created_at         timestamptz,
  extra              jsonb       NOT NULL DEFAULT '{}',
  row_version        bigint      NOT NULL DEFAULT 1,
  row_created_at     timestamptz NOT NULL DEFAULT now(),
  row_updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE seasons IS 'Compétitions : championnats (Golden League mixte, Silver League +35) et tournois.';

CREATE TABLE teams (
  id                              text PRIMARY KEY,
  season_id                       text NOT NULL REFERENCES seasons(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  name                            text NOT NULL,
  company                         text,
  short_name                      text,
  color                           text,
  logo_url                        text,
  captain_id                      text,
  owner_id                        text REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  approved                        boolean,
  request_status                  text CHECK (request_status IN ('draft', 'submitted', 'approved', 'rejected')),
  reject_reason                   text,
  submitted_at                    timestamptz,
  managers                        jsonb,
  coach                           jsonb,
  collective_attestation_id       text,
  collective_certificate_id       text,
  collective_attestation_promised boolean,
  collective_certificate_promised boolean,
  group_name                      text,
  extra                           jsonb       NOT NULL DEFAULT '{}',
  row_version                     bigint      NOT NULL DEFAULT 1,
  row_created_at                  timestamptz NOT NULL DEFAULT now(),
  row_updated_at                  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE teams IS 'Équipes d''entreprise inscrites à une compétition.';
COMMENT ON COLUMN teams.owner_id IS 'Compte entreprise qui gère l''équipe.';

ALTER TABLE users ADD FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE players (
  id             text PRIMARY KEY,
  season_id      text NOT NULL REFERENCES seasons(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  team_id        text NOT NULL REFERENCES teams(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  name           text NOT NULL,
  number         int,
  position       text CHECK (position IN ('GK', 'DEF', 'MID', 'FWD')),
  photo_url      text,
  status         text CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'removed')),
  reject_reason  text,
  submitted_at   timestamptz,
  license_no     text,
  birth_date     date,
  removed_at     timestamptz,
  extra          jsonb       NOT NULL DEFAULT '{}',
  row_version    bigint      NOT NULL DEFAULT 1,
  row_created_at timestamptz NOT NULL DEFAULT now(),
  row_updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE players IS 'Joueurs (données publiques). Statut vide = validé.';

CREATE TABLE player_infos (
  id                  text PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  team_id             text NOT NULL REFERENCES teams(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  owner_id            text,
  first_name          text,
  last_name           text,
  birth_date          date,
  phone               text,
  cin                 text,
  job_title           text,
  employee_id         text,
  cin_file_id         text,
  photo_file_id       text,
  attestation_file_id text,
  certificate_file_id text,
  extra               jsonb       NOT NULL DEFAULT '{}',
  row_version         bigint      NOT NULL DEFAULT 1,
  row_created_at      timestamptz NOT NULL DEFAULT now(),
  row_updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE player_infos IS 'Données personnelles d''un joueur (privées : entreprise propriétaire + administration). Même id que players.';

CREATE TABLE stored_files (
  id             text PRIMARY KEY,
  team_id        text REFERENCES teams(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  owner_id       text,
  kind           text NOT NULL CHECK (kind IN ('cin', 'photo', 'attestation', 'certificate', 'logo', 'collectiveAttestation', 'collectiveCertificate')),
  mime           text,
  name           text,
  size           int,
  data           text NOT NULL,
  created_at     timestamptz,
  extra          jsonb       NOT NULL DEFAULT '{}',
  row_version    bigint      NOT NULL DEFAULT 1,
  row_created_at timestamptz NOT NULL DEFAULT now(),
  row_updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE stored_files IS 'Pièces jointes (CIN, photos, attestations, certificats) en data URI compressée.';

CREATE TABLE matches (
  id             text PRIMARY KEY,
  season_id      text NOT NULL REFERENCES seasons(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  round          int  NOT NULL,
  home_team_id   text NOT NULL REFERENCES teams(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  away_team_id   text NOT NULL REFERENCES teams(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  date           date NOT NULL,
  start_time     text NOT NULL CHECK (start_time ~ '^\d{2}:\d{2}$'),
  pitch_id       text REFERENCES pitches(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  status         text NOT NULL CHECK (status IN ('scheduled', 'first_half', 'half_time', 'second_half', 'finished', 'postponed')),
  home_score     int  NOT NULL DEFAULT 0,
  away_score     int  NOT NULL DEFAULT 0,
  home_pens      int,
  away_pens      int,
  forfeit        text CHECK (forfeit IN ('home', 'away')),
  stage          text CHECK (stage IN ('group', 'ko')),
  group_name     text,
  ko_round       int,
  planned_at     timestamptz,
  kickoff_at     timestamptz,
  second_half_at timestamptz,
  finished_at    timestamptz,
  home_lineup    jsonb,
  away_lineup    jsonb,
  sheet          jsonb,
  referee        text,
  notes          text,
  fb_live_url    text,
  extra          jsonb       NOT NULL DEFAULT '{}',
  row_version    bigint      NOT NULL DEFAULT 1,
  row_created_at timestamptz NOT NULL DEFAULT now(),
  row_updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (home_team_id <> away_team_id)
);
COMMENT ON TABLE matches IS 'Matchs (championnat, poules, élimination directe), score et feuille de match.';
COMMENT ON COLUMN matches.sheet IS 'Feuille de match : joueurs, titulaires, capitaine, entraîneur, délégué, arbitre.';
COMMENT ON COLUMN matches.ko_round IS 'Élimination : 8 = quarts, 4 = demies, 2 = finale, 1 = 3e place…';

CREATE TABLE match_events (
  id             text PRIMARY KEY,
  match_id       text NOT NULL REFERENCES matches(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  season_id      text NOT NULL REFERENCES seasons(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  team_id        text NOT NULL REFERENCES teams(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  type           text NOT NULL CHECK (type IN ('goal', 'penalty_goal', 'own_goal', 'yellow', 'red', 'sub')),
  minute         int  NOT NULL,
  half           int  CHECK (half IN (1, 2)),
  player_id      text NOT NULL,
  assist_id      text,
  player_in_id   text,
  second_yellow  boolean,
  coach          boolean,
  person_name    text,
  created_at     timestamptz,
  extra          jsonb       NOT NULL DEFAULT '{}',
  row_version    bigint      NOT NULL DEFAULT 1,
  row_created_at timestamptz NOT NULL DEFAULT now(),
  row_updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE match_events IS 'Faits de match : buts, cartons, remplacements.';
COMMENT ON COLUMN match_events.player_id IS 'Joueur concerné, ou « coach:<équipe> » pour un carton à l''entraîneur.';

-- ───────────── Contenus et notifications ─────────────
CREATE TABLE news (
  id             text PRIMARY KEY,
  type           text NOT NULL CHECK (type IN ('article', 'video', 'gallery', 'award')),
  title          text NOT NULL,
  body           text,
  image_url      text,
  video_url      text,
  match_id       text REFERENCES matches(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  team_id        text REFERENCES teams(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  created_at     timestamptz,
  extra          jsonb       NOT NULL DEFAULT '{}',
  row_version    bigint      NOT NULL DEFAULT 1,
  row_created_at timestamptz NOT NULL DEFAULT now(),
  row_updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE news IS 'Actualités : articles, vidéos, galeries, récompenses.';

CREATE TABLE showcase_items (
  id             text PRIMARY KEY,
  kind           text NOT NULL CHECK (kind IN ('slide', 'video')),
  title          text,
  subtitle       text,
  image          text,
  video_url      text,
  sort_order     int     NOT NULL DEFAULT 0,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz,
  extra          jsonb       NOT NULL DEFAULT '{}',
  row_version    bigint      NOT NULL DEFAULT 1,
  row_created_at timestamptz NOT NULL DEFAULT now(),
  row_updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE showcase_items IS 'Carrousel et vidéos de la page d''accueil.';

CREATE TABLE inbox_items (
  id             text PRIMARY KEY,
  user_id        text REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  audience       text CHECK (audience IN ('staff')),
  fr             jsonb NOT NULL,
  en             jsonb,
  url            text,
  created_at     timestamptz,
  extra          jsonb       NOT NULL DEFAULT '{}',
  row_version    bigint      NOT NULL DEFAULT 1,
  row_created_at timestamptz NOT NULL DEFAULT now(),
  row_updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR audience IS NOT NULL)
);
COMMENT ON TABLE inbox_items IS 'Notifications dans l''application : pour un compte précis ou pour tout le personnel. fr / en = {title, body}.';

CREATE TABLE push_tokens (
  id                 text PRIMARY KEY,
  token              text NOT NULL,
  user_id            text,
  role               text,
  staff              boolean NOT NULL DEFAULT false,
  team_id            text,
  followed_team_ids  jsonb,
  followed_match_ids jsonb,
  lang               text,
  prefs              jsonb,
  platform           text,
  updated_at         timestamptz,
  extra              jsonb       NOT NULL DEFAULT '{}',
  row_version        bigint      NOT NULL DEFAULT 1,
  row_created_at     timestamptz NOT NULL DEFAULT now(),
  row_updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE push_tokens IS 'Téléphones inscrits aux notifications push (Expo), avec les équipes et matchs suivis.';

-- Collections futures sans table dédiée (filet de sécurité, aucune donnée refusée)
CREATE TABLE documents (
  col            text NOT NULL,
  id             text NOT NULL,
  data           jsonb       NOT NULL,
  row_version    bigint      NOT NULL DEFAULT 1,
  row_created_at timestamptz NOT NULL DEFAULT now(),
  row_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (col, id)
);
COMMENT ON TABLE documents IS 'Données d''une collection qui n''a pas encore de table dédiée (version plus récente de l''application).';

-- ───────────── Index (recherches fréquentes de l'application) ─────────────
CREATE INDEX ON users (role);
CREATE INDEX ON users (team_id);
CREATE INDEX ON users (email);
CREATE INDEX ON users (phone);
CREATE INDEX ON slots (date);
CREATE INDEX ON slots (pitch_id, date);
CREATE INDEX ON slots (match_id);
CREATE INDEX ON bookings (user_id);
CREATE INDEX ON bookings (status);
CREATE INDEX ON bookings (date);
CREATE INDEX ON private_bookings (date);
CREATE INDEX ON private_bookings (series_id);
CREATE INDEX ON teams (season_id);
CREATE INDEX ON teams (owner_id);
CREATE INDEX ON players (team_id);
CREATE INDEX ON players (season_id);
CREATE INDEX ON players (license_no);
CREATE INDEX ON player_infos (team_id);
CREATE INDEX ON player_infos (owner_id);
CREATE INDEX ON stored_files (team_id);
CREATE INDEX ON stored_files (owner_id);
CREATE INDEX ON matches (season_id);
CREATE INDEX ON matches (date);
CREATE INDEX ON matches (pitch_id);
CREATE INDEX ON matches (status);
CREATE INDEX ON matches (home_team_id);
CREATE INDEX ON matches (away_team_id);
CREATE INDEX ON match_events (match_id);
CREATE INDEX ON match_events (season_id);
CREATE INDEX ON inbox_items (user_id);
CREATE INDEX ON inbox_items (audience);
CREATE INDEX ON push_tokens (user_id);
CREATE INDEX ON push_tokens (staff);
