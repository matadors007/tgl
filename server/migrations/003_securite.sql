-- Sécurité des connexions : changer de mot de passe déconnecte les autres appareils
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS token_version int NOT NULL DEFAULT 0;
COMMENT ON COLUMN accounts.token_version IS 'Augmente à chaque changement de mot de passe : les anciens jetons de connexion ne sont plus acceptés.';
