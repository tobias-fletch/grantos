BEGIN;
ALTER TABLE search_discovery_jobs ADD COLUMN last_served_at timestamptz,
 ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE search_discovery_visits ADD COLUMN evidence_url text;
-- Existing checkpointed jobs have already had a turn; untouched searches go first.
UPDATE search_discovery_jobs SET last_served_at=created_at WHERE pages>0;
CREATE INDEX search_discovery_due_turn ON search_discovery_jobs(next_attempt_at,last_served_at)
 WHERE status IN ('queued','running');
COMMIT;
