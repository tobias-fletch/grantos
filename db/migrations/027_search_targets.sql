BEGIN;
ALTER TABLE search_discovery_jobs
 ADD COLUMN target_count integer NOT NULL DEFAULT 10,
 ADD COLUMN matched_count integer NOT NULL DEFAULT 0,
 ADD COLUMN watchlist_count integer NOT NULL DEFAULT 0,
 ADD COLUMN match_checked_at timestamptz,
 ADD COLUMN research_wave integer NOT NULL DEFAULT 1,
 ADD COLUMN page_budget integer NOT NULL DEFAULT 24;
ALTER TABLE catalog_enrichment_jobs ADD COLUMN search_priority_until timestamptz;
COMMIT;
