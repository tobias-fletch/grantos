BEGIN;
CREATE TABLE catalog_automation (
 id integer PRIMARY KEY CHECK(id=1), paused boolean NOT NULL DEFAULT false,
 hourly_enabled boolean NOT NULL DEFAULT false, heartbeat_at timestamptz,
 last_success_at timestamptz, last_error text NOT NULL DEFAULT ''
);
INSERT INTO catalog_automation(id) VALUES(1);
ALTER TABLE crawl_sources ADD COLUMN funding_focus text[] NOT NULL DEFAULT '{}',
 ADD COLUMN interval_hours integer NOT NULL DEFAULT 24 CHECK(interval_hours BETWEEN 6 AND 168);
ALTER TABLE crawl_frontier ADD COLUMN next_check_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN last_success_at timestamptz, ADD COLUMN failures integer NOT NULL DEFAULT 0,
 ADD COLUMN etag text, ADD COLUMN last_modified text, ADD COLUMN snapshot_id uuid REFERENCES crawl_snapshots(id);
CREATE INDEX crawl_due ON crawl_frontier(next_check_at,source_id);
ALTER TABLE catalog_monitoring ADD COLUMN next_check_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE crawl_runs DROP CONSTRAINT crawl_runs_trigger_check;
ALTER TABLE crawl_runs ADD CONSTRAINT crawl_runs_trigger_check CHECK(trigger IN ('scheduled','manual','acceptance','hourly','targeted'));
ALTER TABLE crawl_runs ADD COLUMN schedule_hour timestamptz UNIQUE;
CREATE TABLE catalog_admin_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id),
 action text NOT NULL, subject text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
