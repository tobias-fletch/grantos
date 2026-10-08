BEGIN;
CREATE TABLE catalog_contributions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_url text NOT NULL,
 opportunity_id uuid REFERENCES opportunities(id),
 field text NOT NULL DEFAULT 'program',
 state text NOT NULL DEFAULT 'checking' CHECK(state IN ('checking','applied','unconfirmed','decision')),
 outcome text NOT NULL DEFAULT 'Waiting for official evidence checks.',
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 checked_at timestamptz,
 UNIQUE NULLS NOT DISTINCT(source_url,opportunity_id,field)
);
CREATE TABLE catalog_contribution_submissions (
 contribution_id uuid NOT NULL REFERENCES catalog_contributions(id),
 user_id uuid NOT NULL REFERENCES users(id),
 proposed_value text NOT NULL DEFAULT '',
 note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(contribution_id,user_id)
);
CREATE TABLE catalog_worker_samples (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 due_before integer NOT NULL, due_after integer,
 pages integer NOT NULL DEFAULT 0, successful_checks integer NOT NULL DEFAULT 0,
 outcome text NOT NULL DEFAULT 'running'
);
CREATE INDEX catalog_contributions_due ON catalog_contributions(next_attempt_at) WHERE state IN ('checking','decision');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='grantos_discovery') THEN
  GRANT SELECT,UPDATE ON catalog_contributions TO grantos_discovery;
  GRANT SELECT,INSERT,UPDATE,DELETE ON catalog_worker_samples TO grantos_discovery;
 END IF;
END $$;
COMMIT;
