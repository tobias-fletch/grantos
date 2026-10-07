BEGIN;
ALTER TABLE opportunities ADD COLUMN publication_state text NOT NULL DEFAULT 'published' CHECK(publication_state IN ('published','hidden'));
ALTER TABLE opportunities ADD COLUMN publication_origin text NOT NULL DEFAULT 'editorial' CHECK(publication_origin IN ('editorial','crawler'));
ALTER TABLE opportunities ADD COLUMN source_fetched_at timestamptz;
ALTER TABLE opportunities ADD COLUMN publication_provenance jsonb NOT NULL DEFAULT '{}';
ALTER TABLE opportunities ADD COLUMN merged_into uuid REFERENCES opportunities(id);
UPDATE opportunities SET publication_state='hidden' WHERE verification_status='archived';
ALTER TABLE opportunities DROP CONSTRAINT opportunities_application_status_check;
ALTER TABLE opportunities ADD CONSTRAINT opportunities_application_status_check CHECK(application_status IN ('open','upcoming','closed','unannounced','unknown'));
ALTER TABLE crawl_candidates DROP CONSTRAINT crawl_candidates_status_check;
ALTER TABLE crawl_candidates ADD CONSTRAINT crawl_candidates_status_check CHECK(status IN ('pending','approved','dismissed','superseded','published'));
CREATE TABLE opportunity_source_urls (
 url text PRIMARY KEY, opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE
);
CREATE TABLE crawl_publication_results (
 candidate_id uuid PRIMARY KEY REFERENCES crawl_candidates(id) ON DELETE CASCADE,
 run_id uuid REFERENCES crawl_runs(id), opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
 outcome text NOT NULL CHECK(outcome IN ('published','updated','skipped','failed')),
 reason text NOT NULL DEFAULT '', attempts integer NOT NULL DEFAULT 1,
 processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE catalog_moderation_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES opportunities(id),
 actor_id uuid NOT NULL REFERENCES users(id), action text NOT NULL, details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crawl_snapshot_url ON crawl_snapshots(url,fetched_at DESC);
COMMIT;
