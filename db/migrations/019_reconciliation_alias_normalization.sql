BEGIN;
CREATE OR REPLACE FUNCTION merge_reconciled_program(source_id uuid,target_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE s opportunities; t opportunities;
BEGIN
 PERFORM pg_advisory_xact_lock(7823091);
 SELECT * INTO s FROM opportunities WHERE id=source_id FOR UPDATE;
 SELECT * INTO t FROM opportunities WHERE id=target_id FOR UPDATE;
 IF s.id IS NULL OR t.id IS NULL OR s.id=t.id OR t.publication_state<>'published' OR t.merged_into IS NOT NULL THEN RAISE EXCEPTION 'Invalid catalog merge'; END IF;
 IF NOT EXISTS(SELECT 1 FROM program_evidence_pages p WHERE p.opportunity_id=t.id AND rtrim(p.url,'/')=rtrim(s.source_url,'/') AND p.association IN ('explicit-program-identifier','official-program-subpage','official-program-link')) THEN RAISE EXCEPTION 'Confirmed program association required'; END IF;
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
COMMIT;
