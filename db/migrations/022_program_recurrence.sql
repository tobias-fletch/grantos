BEGIN;
ALTER TABLE opportunities ADD COLUMN recurrence text CHECK (recurrence IN ('annual','recurring','one_time'));
-- Recurrence starts unknown; no dates or annual schedules are guessed during migration.
CREATE TABLE program_round_evidence (
 opportunity_id uuid NOT NULL REFERENCES opportunities(id),
 snapshot_id uuid NOT NULL REFERENCES crawl_snapshots(id),
 source_url text NOT NULL, fetched_at timestamptz NOT NULL,
 facts jsonb NOT NULL, PRIMARY KEY(opportunity_id,snapshot_id)
);
-- Preserve previously attached dates before a future crawl replaces the current page.
INSERT INTO program_round_evidence(opportunity_id,snapshot_id,source_url,fetched_at,facts)
 SELECT opportunity_id,snapshot_id,url,fetched_at,facts FROM program_evidence_pages
 WHERE snapshot_id IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(facts) f WHERE f->>'field' IN ('deadline','opens','status','rolling'))
 ON CONFLICT DO NOTHING;
COMMIT;
