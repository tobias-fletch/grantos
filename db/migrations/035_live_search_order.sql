BEGIN;
ALTER TABLE grant_search_progress ADD COLUMN phase integer NOT NULL DEFAULT 0 CHECK(phase BETWEEN 0 AND 2);
ALTER TABLE grant_search_progress ADD COLUMN phase_total integer;
COMMIT;
