BEGIN;
CREATE TABLE discovery_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 requested_by uuid NOT NULL REFERENCES users(id),
 query text NOT NULL,
 status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','complete','partial','failed')),
 report jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz
);
CREATE INDEX discovery_runs_workspace ON discovery_runs(workspace_id,created_at DESC);
CREATE TABLE discovery_limits (
 workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
 day date NOT NULL,
 used integer NOT NULL,
 next_allowed timestamptz NOT NULL
);
CREATE TABLE discovery_leads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 url text NOT NULL,
 title text NOT NULL,
 snippet text NOT NULL DEFAULT '',
 sources jsonb NOT NULL DEFAULT '[]',
 warnings jsonb NOT NULL DEFAULT '[]',
 checked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,url)
);
CREATE TABLE opportunity_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 opportunity_id uuid REFERENCES opportunities(id),
 reviewed_by uuid NOT NULL REFERENCES users(id),
 source_url text NOT NULL,
 evidence text NOT NULL,
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 details jsonb NOT NULL
);
COMMIT;
