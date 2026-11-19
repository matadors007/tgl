-- ════════════════════════════════════════════════════════════════════════════
--  Vues de consultation (lecture seule), en français, pour Adminer / pgAdmin / DBeaver
-- ════════════════════════════════════════════════════════════════════════════

CREATE VIEW v_utilisateurs AS
SELECT a.email, u.name AS nom, u.role, u.phone AS telephone, u.company_name AS entreprise,
       t.name AS equipe, a.email_verified AS email_confirme, a.must_reset AS nouveau_mdp_a_choisir,
       u.deletion_requested_at AS suppression_demandee_le, a.created_at AS cree_le, a.last_login AS derniere_connexion, a.uid
FROM accounts a
LEFT JOIN users u ON u.id = a.uid
LEFT JOIN teams t ON t.id = u.team_id;

CREATE VIEW v_championnats AS
SELECT s.id, s.name AS nom, coalesce(s.kind, 'league') AS type, s.category AS categorie, s.status AS statut,
       s.start_date AS debut, s.roster_deadline AS fin_inscriptions_joueurs,
       (SELECT count(*) FROM teams t WHERE t.season_id = s.id AND t.approved IS DISTINCT FROM false) AS equipes,
       (SELECT count(*) FROM matches m WHERE m.season_id = s.id) AS matchs,
       (SELECT count(*) FROM matches m WHERE m.season_id = s.id AND m.status = 'finished') AS matchs_joues
FROM seasons s;

CREATE VIEW v_equipes AS
SELECT t.id, s.name AS championnat, t.name AS equipe, t.company AS entreprise, t.short_name AS abreviation,
       coalesce(t.request_status, CASE WHEN t.approved = false THEN 'submitted' ELSE 'approved' END) AS demande,
       t.group_name AS poule, u.name AS compte_entreprise,
       (SELECT count(*) FROM players p WHERE p.team_id = t.id AND coalesce(p.status, 'approved') = 'approved') AS joueurs_valides,
       (SELECT count(*) FROM players p WHERE p.team_id = t.id AND coalesce(p.status, 'approved') <> 'rejected') AS places_utilisees
FROM teams t
JOIN seasons s ON s.id = t.season_id
LEFT JOIN users u ON u.id = t.owner_id;

CREATE VIEW v_joueurs AS
SELECT p.id, s.name AS championnat, t.name AS equipe, p.number AS numero, p.name AS joueur, p.position AS poste,
       coalesce(p.status, 'approved') AS statut, p.license_no AS licence, p.birth_date AS naissance,
       i.phone AS telephone, i.job_title AS fonction
FROM players p
JOIN teams t ON t.id = p.team_id
JOIN seasons s ON s.id = p.season_id
LEFT JOIN player_infos i ON i.id = p.id;

CREATE VIEW v_matchs AS
SELECT m.id, s.name AS championnat, m.round AS journee, m.stage AS phase, m.group_name AS poule,
       m.date, m.start_time AS heure, pi.name AS terrain,
       h.name AS domicile, m.home_score AS buts_dom, m.away_score AS buts_ext, a.name AS exterieur,
       m.home_pens AS tab_dom, m.away_pens AS tab_ext, m.forfeit AS forfait, m.status AS statut,
       m.sheet ->> 'status' AS feuille
FROM matches m
JOIN seasons s ON s.id = m.season_id
JOIN teams h ON h.id = m.home_team_id
JOIN teams a ON a.id = m.away_team_id
LEFT JOIN pitches pi ON pi.id = m.pitch_id;

CREATE VIEW v_evenements AS
SELECT e.id, m.date, h.name || ' – ' || a.name AS match, e.half AS mi_temps, e.minute, e.type,
       t.name AS equipe, coalesce(p.name, e.person_name, e.player_id) AS joueur, pa.name AS passeur
FROM match_events e
JOIN matches m ON m.id = e.match_id
JOIN teams h ON h.id = m.home_team_id
JOIN teams a ON a.id = m.away_team_id
JOIN teams t ON t.id = e.team_id
LEFT JOIN players p ON p.id = e.player_id
LEFT JOIN players pa ON pa.id = e.assist_id;

CREATE VIEW v_buteurs AS
SELECT s.name AS championnat, p.name AS joueur, t.name AS equipe, count(*) AS buts
FROM match_events e
JOIN players p ON p.id = e.player_id
JOIN teams t ON t.id = e.team_id
JOIN seasons s ON s.id = e.season_id
WHERE e.type IN ('goal', 'penalty_goal')
GROUP BY s.name, p.name, t.name;

CREATE VIEW v_reservations AS
SELECT b.id, b.date, b.start_time AS debut, b.end_time AS fin, b.pitch_name AS terrain,
       b.user_name AS client, b.user_phone AS telephone, b.status AS statut,
       CASE WHEN b.manual THEN 'téléphone' ELSE 'application' END AS origine,
       b.amount AS montant, b.handled_by_name AS traite_par, b.created_at AS demandee_le
FROM bookings b
UNION ALL
SELECT b.id, b.date, b.start_time, b.end_time, b.pitch_name, b.user_name, b.user_phone, b.status,
       'privée', b.amount, b.handled_by_name, b.created_at
FROM private_bookings b;
