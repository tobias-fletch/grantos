BEGIN;
ALTER TABLE program_evidence_pages ADD COLUMN examples jsonb NOT NULL DEFAULT '[]';
COMMIT;
