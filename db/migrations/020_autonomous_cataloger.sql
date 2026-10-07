BEGIN;
ALTER TABLE crawl_publication_results ADD COLUMN parser_version text NOT NULL DEFAULT '';
CREATE TABLE catalog_field_state (
 opportunity_id uuid NOT NULL REFERENCES opportunities(id), field text NOT NULL,
 locked boolean NOT NULL DEFAULT false, locked_by uuid REFERENCES users(id),
 state text NOT NULL DEFAULT 'not_checked' CHECK(state IN ('found','not_checked','not_published','conflicting','inaccessible','locked_conflict')),
 evidence jsonb NOT NULL DEFAULT '[]', reason text NOT NULL DEFAULT '', parser_version text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(opportunity_id,field)
);
CREATE TABLE catalog_field_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES opportunities(id),
 field text NOT NULL, old_value jsonb, new_value jsonb, evidence jsonb NOT NULL DEFAULT '[]',
 parser_version text NOT NULL, action text NOT NULL DEFAULT 'automatic', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_field_history_grant ON catalog_field_history(opportunity_id,created_at DESC);
CREATE TABLE catalog_enrichment_jobs (
 opportunity_id uuid PRIMARY KEY REFERENCES opportunities(id), source_id uuid REFERENCES crawl_sources(id),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','retry','waiting','complete')),
 next_attempt_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0,
 parser_version text NOT NULL DEFAULT '', evidence_fingerprint text NOT NULL DEFAULT '',
 checked_at timestamptz, reason text NOT NULL DEFAULT '', missing_fields text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE catalog_enrichment_pages (
 opportunity_id uuid NOT NULL REFERENCES opportunities(id), url text NOT NULL, depth integer NOT NULL CHECK(depth BETWEEN 0 AND 3),
 state text NOT NULL DEFAULT 'queued', priority integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0,
 snapshot_id uuid REFERENCES crawl_snapshots(id), reason text NOT NULL DEFAULT '', PRIMARY KEY(opportunity_id,url)
);
CREATE INDEX catalog_enrichment_due ON catalog_enrichment_jobs(next_attempt_at);
COMMIT;
