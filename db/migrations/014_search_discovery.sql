BEGIN;
CREATE TABLE search_discovery_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), search_key text NOT NULL UNIQUE,
 terms text[] NOT NULL DEFAULT '{}', categories text[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','complete','partial','failed')),
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 pages integer NOT NULL DEFAULT 0, failures integer NOT NULL DEFAULT 0,
 published integer NOT NULL DEFAULT 0, updated integer NOT NULL DEFAULT 0,
 note text NOT NULL DEFAULT '', source_ids uuid[] NOT NULL DEFAULT '{}'
);
CREATE TABLE search_discovery_visits (
 job_id uuid REFERENCES search_discovery_jobs(id) ON DELETE CASCADE,
 source_id uuid REFERENCES crawl_sources(id), url text NOT NULL,
 PRIMARY KEY(job_id,source_id,url)
);
ALTER TABLE opportunities ADD COLUMN auto_verified_at timestamptz;
COMMIT;
