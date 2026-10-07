BEGIN;
ALTER TABLE crawl_snapshots ADD COLUMN links jsonb NOT NULL DEFAULT '[]';
CREATE TABLE catalog_reconciliation_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','partial','complete')),
 finished_at timestamptz, heartbeat_at timestamptz, note text NOT NULL DEFAULT '', crawl_run_id uuid REFERENCES crawl_runs(id)
);
CREATE UNIQUE INDEX one_reconciliation ON catalog_reconciliation_runs((true)) WHERE status<>'complete';
CREATE TABLE catalog_reconciliation_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES catalog_reconciliation_runs(id),
 opportunity_id uuid REFERENCES opportunities(id), candidate_id uuid REFERENCES crawl_candidates(id),
 source_id uuid REFERENCES crawl_sources(id), url text NOT NULL, title text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','complete','blocked','ambiguous')),
 next_attempt_at timestamptz NOT NULL DEFAULT now(), checked_at timestamptz,
 reason text NOT NULL DEFAULT '', unresolved jsonb NOT NULL DEFAULT '{}',
 UNIQUE(run_id,url), CHECK(opportunity_id IS NOT NULL OR candidate_id IS NOT NULL)
);
CREATE INDEX reconciliation_due ON catalog_reconciliation_items(status,next_attempt_at);
CREATE TABLE catalog_reconciliation_pages (
 item_id uuid NOT NULL REFERENCES catalog_reconciliation_items(id), url text NOT NULL,
 depth integer NOT NULL DEFAULT 0 CHECK(depth BETWEEN 0 AND 3),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','read','failed','excluded')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 snapshot_id uuid REFERENCES crawl_snapshots(id), reason text NOT NULL DEFAULT '',
 PRIMARY KEY(item_id,url)
);
CREATE TABLE program_evidence_pages (
 opportunity_id uuid NOT NULL REFERENCES opportunities(id), url text NOT NULL,
 role text NOT NULL, association text NOT NULL, snapshot_id uuid REFERENCES crawl_snapshots(id),
 fetched_at timestamptz NOT NULL, facts jsonb NOT NULL DEFAULT '[]',
 PRIMARY KEY(opportunity_id,url)
);
CREATE TABLE catalog_reconciliation_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid REFERENCES catalog_reconciliation_runs(id),
 item_id uuid REFERENCES catalog_reconciliation_items(id), opportunity_id uuid REFERENCES opportunities(id),
 action text NOT NULL, detail text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
-- A narrow catalog-only operation: worker cannot inspect accounts, notes, or histories.
-- Both private application records survive; only their public grant foreign key changes.
CREATE FUNCTION merge_reconciled_program(source_id uuid,target_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE s opportunities; t opportunities;
BEGIN
 PERFORM pg_advisory_xact_lock(7823091);
 SELECT * INTO s FROM opportunities WHERE id=source_id FOR UPDATE;
 SELECT * INTO t FROM opportunities WHERE id=target_id FOR UPDATE;
 IF s.id IS NULL OR t.id IS NULL OR s.id=t.id OR t.publication_state<>'published' OR t.merged_into IS NOT NULL THEN RAISE EXCEPTION 'Invalid catalog merge'; END IF;
 IF NOT EXISTS(SELECT 1 FROM program_evidence_pages p WHERE p.opportunity_id=t.id AND p.url=s.source_url AND p.association IN ('explicit-program-identifier','official-program-subpage','official-program-link')) THEN RAISE EXCEPTION 'Confirmed program association required'; END IF;
 IF EXISTS(SELECT 1 FROM checklist_jobs WHERE opportunity_id IN (s.id,t.id) AND status IN ('queued','running')) THEN RAISE EXCEPTION 'Active checklist work'; END IF;
 UPDATE applications SET opportunity_id=t.id,updated_at=now() WHERE opportunity_id=s.id;
 INSERT INTO saved_opportunities(workspace_id,opportunity_id,saved_by,saved_at) SELECT workspace_id,t.id,saved_by,saved_at FROM saved_opportunities WHERE opportunity_id=s.id ON CONFLICT DO NOTHING;
 DELETE FROM saved_opportunities WHERE opportunity_id=s.id;
 UPDATE grant_tasks SET opportunity_id=t.id WHERE opportunity_id=s.id;
 UPDATE checklist_jobs SET opportunity_id=t.id WHERE opportunity_id=s.id;
 UPDATE opportunity_source_urls SET opportunity_id=t.id WHERE opportunity_id=s.id;
 INSERT INTO opportunity_source_urls(url,opportunity_id) VALUES(s.source_url,t.id) ON CONFLICT(url) DO UPDATE SET opportunity_id=excluded.opportunity_id;
 UPDATE crawl_candidates SET opportunity_id=t.id WHERE opportunity_id=s.id;
 INSERT INTO program_evidence_pages SELECT t.id,url,role,association,snapshot_id,fetched_at,facts FROM program_evidence_pages WHERE opportunity_id=s.id ON CONFLICT DO NOTHING;
 UPDATE opportunities SET merged_into=t.id,publication_state='hidden',updated_at=now() WHERE id=s.id;
END $$;
REVOKE ALL ON FUNCTION merge_reconciled_program(uuid,uuid) FROM PUBLIC;
COMMIT;
