BEGIN;
-- Source fetch time and database recording time are distinct. Excerpt revisions
-- can preserve the same honest fetch timestamp, so UUID order is not chronology.
ALTER TABLE crawl_snapshots ADD COLUMN recorded_at timestamptz;
-- Legacy recording time is unavailable; retain fetch time as an explicit fallback.
UPDATE crawl_snapshots SET recorded_at=fetched_at;
ALTER TABLE crawl_snapshots ALTER COLUMN recorded_at SET DEFAULT clock_timestamp();
ALTER TABLE crawl_snapshots ALTER COLUMN recorded_at SET NOT NULL;
CREATE INDEX crawl_snapshot_latest_recording ON crawl_snapshots(url,fetched_at DESC,recorded_at DESC,id DESC);
COMMIT;
