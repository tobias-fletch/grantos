// Explicit release contract: regression test requires every shipped migration here.
export const REQUIRED_MIGRATIONS = [
  "001_foundation.sql",
  "002_opportunity_core.sql",
  "003_discovery_and_saves.sql",
  "004_verified_starter_catalog.sql",
  "005_grant_checklists.sql",
  "006_expanded_discovery_catalog.sql",
  "007_discovery_research.sql",
  "008_daily_discovery.sql",
  "009_catalog_publication.sql",
  "010_applications.sql",
  "011_beta_access.sql",
  "012_catalog_monitoring.sql",
  "013_email_delivery.sql",
  "014_search_discovery.sql",
  "015_crawl_worker_lease.sql",
  "016_catalog_maintenance.sql",
  "017_official_source_expansion.sql",
  "018_program_reconciliation.sql",
  "019_reconciliation_alias_normalization.sql",
  "020_autonomous_cataloger.sql",
  "021_catalog_contributions.sql",
  "022_program_recurrence.sql",
  "023_program_cleanup_version.sql",
  "024_search_geography.sql",
  "025_search_submissions.sql",
  "026_search_turns.sql",
  "027_search_targets.sql",
  "028_ai_catalog_research.sql",
  "029_program_examples.sql",
  "030_funding_projects.sql",
  "031_application_preparation.sql",
  "032_structured_catalog.sql",
  "033_regional_sources.sql",
  "034_live_search.sql",
  "035_live_search_order.sql",
  "036_ny_la_official_sources.sql",
  "037_project_context.sql",
  "038_quick_setup.sql",
  "039_application_guidance.sql"
] as const;

export async function databaseReady(db: { query: (sql: string, values: unknown[]) => Promise<{ rows: { total: number }[] }> }): Promise<boolean> {
  const result = await db.query('SELECT count(*)::int AS total FROM schema_migrations WHERE filename = ANY($1::text[])', [[...REQUIRED_MIGRATIONS]]);
  return result.rows[0]?.total === REQUIRED_MIGRATIONS.length;
}
