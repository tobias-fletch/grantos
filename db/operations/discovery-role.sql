-- Run once as database owner after migrations. Create the LOGIN separately with a
-- random password kept outside Git; never reuse the web or migration credential.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='grantos_discovery') THEN CREATE ROLE grantos_discovery NOLOGIN; END IF; END $$;
GRANT USAGE ON SCHEMA public TO grantos_discovery;
GRANT SELECT ON opportunities,funders,opportunity_categories,opportunity_source_urls TO grantos_discovery;
GRANT INSERT ON opportunities,opportunity_categories,opportunity_source_urls TO grantos_discovery;
GRANT UPDATE(funder_id,name,application_status,source_fetched_at,publication_provenance,source_url,official_url,updated_at,catalog_updated_at,summary,eligibility_notes,maximum_award,deadline_at,deadline_notes,auto_verified_at,verification_status,last_verified_at,last_checked_at) ON opportunities TO grantos_discovery;
GRANT SELECT,INSERT,UPDATE,DELETE ON crawl_sources,crawl_runs,crawl_frontier,crawl_visits,crawl_snapshots,crawl_candidates,crawl_publication_results TO grantos_discovery;
GRANT SELECT,INSERT,UPDATE ON catalog_monitoring,catalog_monitor_events TO grantos_discovery;
-- Publication may link private tracking records, without allowing the crawler to
-- query those records or account credentials. Functions are trigger-only.
ALTER FUNCTION link_source_application() SECURITY DEFINER;
ALTER FUNCTION link_source_application() SET search_path=public,pg_temp;
ALTER FUNCTION link_catalog_application() SECURITY DEFINER;
ALTER FUNCTION link_catalog_application() SET search_path=public,pg_temp;
REVOKE ALL ON FUNCTION link_source_application(),link_catalog_application() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_source_application(),link_catalog_application() TO grantos_discovery;

GRANT SELECT,INSERT,UPDATE,DELETE ON search_discovery_jobs,search_discovery_visits TO grantos_discovery;

GRANT SELECT,UPDATE ON crawl_worker_lease TO grantos_discovery;

GRANT SELECT,UPDATE ON catalog_automation TO grantos_discovery;

GRANT SELECT,INSERT,UPDATE ON catalog_reconciliation_runs,catalog_reconciliation_items,catalog_reconciliation_pages,program_evidence_pages,catalog_reconciliation_events TO grantos_discovery;
GRANT UPDATE(publication_state) ON opportunities TO grantos_discovery;
ALTER FUNCTION merge_reconciled_program(uuid,uuid) SET search_path=public,pg_temp;
GRANT EXECUTE ON FUNCTION merge_reconciled_program(uuid,uuid) TO grantos_discovery;
GRANT SELECT,INSERT,UPDATE ON catalog_field_state,catalog_field_history,catalog_enrichment_jobs,catalog_enrichment_pages TO grantos_discovery;
GRANT SELECT,INSERT,DELETE ON opportunity_applicant_types,opportunity_geographies TO grantos_discovery;
GRANT UPDATE(minimum_award,rolling) ON opportunities TO grantos_discovery;
