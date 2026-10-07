BEGIN;
ALTER TABLE users ADD COLUMN beta_active boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN beta_owner boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN catalog_editor boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN disabled_at timestamptz;
ALTER TABLE users ADD COLUMN session_version integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX users_email_normalized ON users(lower(email));
CREATE TABLE beta_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text NOT NULL UNIQUE,
 email text NOT NULL, purpose text NOT NULL CHECK(purpose IN ('invite','verify','reset')),
 created_by uuid REFERENCES users(id), expires_at timestamptz NOT NULL,
 used_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX beta_tokens_email ON beta_tokens(email,purpose);
CREATE TABLE auth_rate_limits(bucket text PRIMARY KEY,window_start timestamptz NOT NULL,count integer NOT NULL);
CREATE TABLE beta_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid REFERENCES users(id),subject_id uuid REFERENCES users(id),event text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE email_budget(day date PRIMARY KEY,count integer NOT NULL DEFAULT 0);
COMMIT;
