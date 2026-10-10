BEGIN;
-- Submission receipts prevent reloads/back navigation from restarting finished work.
CREATE TABLE search_discovery_submissions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES search_discovery_jobs(id) ON DELETE CASCADE,
  search_key text NOT NULL,
  started_job boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX search_discovery_submissions_created ON search_discovery_submissions(created_at);
COMMIT;
