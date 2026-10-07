CREATE TABLE catalog_monitoring (
 opportunity_id uuid PRIMARY KEY REFERENCES opportunities(id),
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','discontinued')),
 last_attempt_at timestamptz, last_success_at timestamptz,
 consecutive_failures integer NOT NULL DEFAULT 0,
 last_error text NOT NULL DEFAULT '', evidence text NOT NULL DEFAULT '',
 source_url text NOT NULL DEFAULT '', changed_at timestamptz
);
CREATE TABLE catalog_monitor_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 opportunity_id uuid NOT NULL REFERENCES opportunities(id),
 run_id uuid NOT NULL REFERENCES crawl_runs(id),
 outcome text NOT NULL CHECK(outcome IN ('checked','failed','archived','restored')),
 evidence text NOT NULL DEFAULT '', source_url text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(opportunity_id,run_id)
);
CREATE INDEX catalog_monitor_history ON catalog_monitor_events(created_at DESC);
